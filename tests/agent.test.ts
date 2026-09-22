import {test,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {buildApp} from '../apps/api/src/app.js';import {database} from '../apps/api/src/db.js';import {validateProposal,validateHealth} from '../apps/api/src/agent/schema.js';import {createProvider} from '../apps/api/src/agent/provider.js';
import {testTransport,draft} from './fixtures/deepseek.js';
const health={age:28,height_cm:170,weight_kg:65,goal:'fitness',experience:'beginner' as const,weekly_days:3,session_minutes:30,equipment:[],has_limitations:false,limitations:'',ai_consent:true};
const apps:any[]=[];after(async()=>{await Promise.all(apps.map(a=>a.close()));});
async function setup(mode='normal',configured=true,transport=testTransport(mode)){
 const db=await database({url:process.env.TEST_DATABASE_URL});
 const app=await buildApp({db,secret:'agent-test-secret-more-than-thirty-two-characters',demo:true,now:()=>new Date('2026-09-22T04:00:00Z'),agent:{apiKey:configured?'fixture-secret':undefined,transport}});apps.push(app);
 const token=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{}})).json().data.token;
 const req=(method:any,url:string,payload?:any,auth=token)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+auth}});
 await req('PUT','/api/health-profile',health);
 return {app,db,req,token};
}
function input(){return {message:'请制定一周入门计划',start_date:'2026-09-22',locale:'zh-CN',request_key:randomUUID(),consent:true};}
for(const action of ['cancel','revoke'])test(`In-flight ${action} stops generation and prevents any proposal or write`,async()=>{
 let entered!:()=>void;const called=new Promise<void>(r=>entered=r);let calls=0;
 const transport=(async(_url:any,init:any)=>{calls++;entered();return await new Promise<Response>((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});}) as typeof fetch;
 const {req}=await setup('normal',true,transport);const payload=input();
 const responses=await Promise.all([req('POST','/api/agent/runs',payload),req('POST','/api/agent/runs',payload)]);
 assert.ok(responses.every(r=>[200,202].includes(r.statusCode)),responses.map(r=>r.body).join('\n'));assert.equal(responses[0].json().data.id,responses[1].json().data.id);
 const id=responses[0].json().data.id;await called;
 if(action==='cancel')await req('POST',`/api/agent/runs/${id}/cancel`,{});else await req('PUT','/api/health-profile',{...health,ai_consent:false});
 const run=await wait(req,id);assert.equal(run.status,'cancelled');assert.equal(run.proposal,null);assert.equal(calls,1);assert.equal((await req('POST',`/api/agent/runs/${id}/confirm`,{confirm:true})).statusCode,409);
});
async function wait(req:any,id:string){for(let n=0;n<100;n++){const r=await req('GET','/api/agent/runs/'+id);assert.equal(r.statusCode,200,r.body);if(!['queued','running'].includes(r.json().data.status))return r.json().data;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Agent did not finish');}

test('AI plan requires confirmation; concurrent confirmations create exactly one persisted batch',async()=>{
 const {req}=await setup();const before=(await req('GET','/api/plans')).json().data.length;
 const payload=input();const r=await req('POST','/api/agent/runs',payload);assert.equal(r.statusCode,202,r.body);
 const run=await wait(req,r.json().data.id);assert.equal(run.status,'draft');assert.equal(run.tool_log.length,4);assert.equal((await req('GET','/api/plans')).json().data.length,before);
 assert.ok(!JSON.stringify(run).includes('test-only-private-reasoning'));assert.ok(!JSON.stringify(run).includes('fixture-secret'));
 assert.equal((await req('POST','/api/agent/runs',payload)).json().data.id,run.id);
 const results=await Promise.all([req('POST',`/api/agent/runs/${run.id}/confirm`,{confirm:true}),req('POST',`/api/agent/runs/${run.id}/confirm`,{confirm:true})]);
 for(const result of results)assert.equal(result.statusCode,200,result.body);
 assert.deepEqual(results[0].json().data.created_plan_ids,results[1].json().data.created_plan_ids);
 const plans=(await req('GET','/api/plans')).json().data;assert.equal(plans.length,before+1);const saved=plans.find((p:any)=>p.agent_run_id===run.id);assert.equal(saved.exercises[0].slug,'walking');assert.equal(saved.exercises[0].duration_seconds,480);
 assert.equal((await req('POST','/api/checkins',{plan_id:saved.id,duration_minutes:10})).statusCode,201);
});
test('Health data and Agent runs are scoped to the authenticated user',async()=>{
 const {app,req}=await setup();const id=(await req('POST','/api/agent/runs',input())).json().data.id;await wait(req,id);
 const other=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{}})).json().data.token;
 assert.equal((await req('GET','/api/health-profile',undefined,other)).json().data,null);
 assert.equal((await req('GET','/api/agent/runs/'+id,undefined,other)).statusCode,404);
 assert.equal((await req('POST',`/api/agent/runs/${id}/confirm`,{confirm:true},other)).statusCode,404);
 assert.equal((await req('POST',`/api/agent/runs/${id}/cancel`,{},other)).statusCode,404);
});
test('Consent and health eligibility are enforced before outbound calls',async()=>{
 const {req}=await setup();assert.equal((await req('POST','/api/agent/runs',{...input(),consent:false})).statusCode,400);
 await req('PUT','/api/health-profile',{...health,ai_consent:false});assert.equal((await req('POST','/api/agent/runs',input())).json().error.code,'AI_CONSENT_REQUIRED');
 await req('PUT','/api/health-profile',{...health,has_limitations:true});assert.equal((await req('POST','/api/agent/runs',input())).json().error.code,'HEALTH_REVIEW_REQUIRED');
 assert.equal((await req('PUT','/api/health-profile',{...health,age:12})).statusCode,400);
 assert.equal((await req('PUT','/api/health-profile',{...health,weekly_days:9})).statusCode,400);
});
test('Editing profile invalidates drafts; deletion removes health data and conversations',async()=>{
 const {req}=await setup();const id=(await req('POST','/api/agent/runs',input())).json().data.id;await wait(req,id);
 await req('PUT','/api/health-profile',{...health,weight_kg:66});assert.equal((await req('POST',`/api/agent/runs/${id}/confirm`,{confirm:true})).statusCode,409);
 assert.equal((await req('DELETE','/api/health-profile')).statusCode,200);assert.equal((await req('GET','/api/health-profile')).json().data,null);assert.equal((await req('GET','/api/agent/runs')).json().data.length,0);
});
test('Health deletion preserves confirmed plans, exercise details and check-ins',async()=>{
 const {req}=await setup();const id=(await req('POST','/api/agent/runs',input())).json().data.id;await wait(req,id);
 const confirmed=await req('POST',`/api/agent/runs/${id}/confirm`,{confirm:true});const pid=confirmed.json().data.created_plan_ids[0];await req('POST','/api/checkins',{plan_id:pid,duration_minutes:10});
 await req('DELETE','/api/health-profile');const p=(await req('GET','/api/plans')).json().data.find((p:any)=>p.id===pid);assert.equal(p.exercises.length,1);assert.equal(p.agent_run_id,null);assert.ok((await req('GET','/api/checkins')).json().data.some((c:any)=>c.plan_id===pid));
});
for(const mode of ['unknown','bad-plan','unauthorized','network'])test(`Provider ${mode} cannot create plans and errors do not leak secrets`,async()=>{
 const {req}=await setup(mode);const before=(await req('GET','/api/plans')).json().data.length;
 const id=(await req('POST','/api/agent/runs',input())).json().data.id;const result=await wait(req,id);assert.equal(result.status,'failed');assert.ok(!JSON.stringify(result).includes('private-provider'));assert.ok(!JSON.stringify(result).includes('fixture-secret'));assert.equal((await req('GET','/api/plans')).json().data.length,before);
});
test('Missing provider key is explicit and does not fabricate a model response',async()=>{
 const {req}=await setup('normal',false);assert.equal((await req('GET','/api/agent/status')).json().data.configured,false);const r=await req('POST','/api/agent/runs',input());assert.equal(r.statusCode,503);assert.equal(r.json().error.code,'AI_NOT_CONFIGURED');assert.equal((await req('GET','/api/agent/runs')).json().data.length,0);
});
test('Follow-up answers retain previous conversational context',async()=>{
 const {req}=await setup('question');const id=(await req('POST','/api/agent/runs',input())).json().data.id;assert.equal((await wait(req,id)).status,'needs_input');
 const response=await req('POST','/api/agent/runs',{...input(),parent_id:id,message:'步行为主'});assert.equal((await wait(req,response.json().data.id)).status,'draft');
});
test('Batch creation rolls back the whole batch if an exercise insert fails',async()=>{
 const {req,db}=await setup();const id=(await req('POST','/api/agent/runs',input())).json().data.id;await wait(req,id);
 const before=(await req('GET','/api/plans')).json().data.length;
 const transaction=db.transaction.bind(db);db.transaction=work=>transaction(tx=>work({query:async(sql,params)=>{if(sql.startsWith('INSERT INTO plan_exercise'))throw new Error('simulated storage failure');return tx.query(sql,params);}}));
 try{assert.equal((await req('POST',`/api/agent/runs/${id}/confirm`,{confirm:true})).statusCode,500);}finally{db.transaction=transaction;}
 assert.equal((await req('GET','/api/plans')).json().data.length,before);assert.equal((await req('GET','/api/agent/runs/'+id)).json().data.status,'draft');
});
test('A conflicting plan added after preview is detected at confirmation',async()=>{
 const {req}=await setup();const id=(await req('POST','/api/agent/runs',input())).json().data.id;await wait(req,id);
 await req('POST','/api/plans',{title:'Added later',activity:'walk',target_minutes:15,weekdays:[1,2,3,4,5,6,7],start_date:'2026-09-22',end_date:null});
 const result=await req('POST',`/api/agent/runs/${id}/confirm`,{confirm:true});assert.equal(result.statusCode,409);assert.equal(result.json().error.code,'AI_SCHEDULE_CONFLICT');
});
test('Runtime plan guards reject unknown movements, excess duration and unavailable equipment',()=>{
 const p=draft('2026-09-22');validateProposal(p,health,'2026-09-22','2026-09-22');
 const clone=()=>structuredClone(p);
 const dates=clone();dates.sessions[0].date='2026-02-30';assert.throws(()=>validateProposal(dates,health,'2026-09-22','2026-09-22'));
 const duration=clone();duration.sessions[0].target_minutes=60;assert.throws(()=>validateProposal(duration,health,'2026-09-22','2026-09-22'));
 const bike=clone();bike.sessions[0].activity='cycle';bike.sessions[0].exercises[0].slug='cycling';assert.throws(()=>validateProposal(bike,health,'2026-09-22','2026-09-22'));
 const both=clone();both.sessions[0].exercises[0].reps=10 as any;assert.throws(()=>validateProposal(both,health,'2026-09-22','2026-09-22'));
 assert.throws(()=>validateHealth({...health,age:0}));
});
test('DeepSeek adapter preserves tool reasoning privately and rejects arbitrary hosts',async()=>{
 assert.throws(()=>createProvider({apiKey:'x',baseUrl:'https://example.com'}));
 const provider=createProvider({apiKey:'key',transport:testTransport()});const answer=await provider.complete([{role:'system',content:'Start date 2026-09-22'}],[],new AbortController().signal);assert.equal(answer.message.reasoning_content,'test-only-private-reasoning');
});
