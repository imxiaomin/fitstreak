import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildApp} from '../apps/api/src/app.js';
import {database,type Database} from '../apps/api/src/db.js';
import {localDate,streak,shiftDay} from '../apps/api/src/domain.js';
let app:Awaited<ReturnType<typeof buildApp>>,db:Database,token:string,other:string,uid:string,pid:string;
const payload={title:'Morning run',activity:'run',target_minutes:30,weekdays:[1,2,3,4,5,6,7],start_date:'2026-09-01',end_date:null};
const req=(method:any,url:string,payload?:any,auth=token)=>app.inject({method,url,payload,headers:auth?{authorization:`Bearer ${auth}`}:{}});
before(async()=>{db=await database({url:process.env.TEST_DATABASE_URL});app=await buildApp({db,secret:'test-only-secret-at-least-thirty-two-chars',demo:true,now:()=>new Date('2026-09-21T08:00:00Z')});const a=await req('POST','/api/auth/demo',{},'');token=a.json().data.token;uid=a.json().data.user.id;other=(await req('POST','/api/auth/demo',{},'')).json().data.token;});
after(async()=>{await app?.close();});
test('Browser CORS preflight permits profile edits, plan edits and archive',async()=>{
 for(const [method,url] of [['PUT','/api/health-profile'],['PATCH','/api/me'],['PATCH','/api/plans/'+randomUUID()],['DELETE','/api/plans/'+randomUUID()]]){
  const r=await app.inject({method:'OPTIONS',url,headers:{origin:'http://127.0.0.1:5173','access-control-request-method':method,'access-control-request-headers':'authorization,content-type'}});
  assert.equal(r.statusCode,204);
  assert.equal(r.headers['access-control-allow-origin'],'http://127.0.0.1:5173');
  assert.ok(String(r.headers['access-control-allow-methods']).split(/,\s*/).includes(method));
  assert.match(String(r.headers['access-control-allow-headers']),/authorization/);
 }
});
test('FR-01 unauthorized requests rejected',async()=>assert.equal((await req('GET','/api/me',undefined,'')).statusCode,401));
test('FR-02 create valid plan and persist',async()=>{const r=await req('POST','/api/plans',payload);assert.equal(r.statusCode,201,r.body);pid=r.json().data.id;assert.equal(r.json().data.title,payload.title);});
test('NFR-03 ownership cannot be injected',async()=>assert.equal((await req('POST','/api/plans',{...payload,user_id:randomUUID()})).statusCode,400));
test('FR-02 rejects zero duration, invalid dates and duplicate weekdays',async()=>{for(const b of [{...payload,target_minutes:0},{...payload,start_date:'2026-02-30'},{...payload,end_date:'2025-01-01'},{...payload,weekdays:[1,1]},{...payload,title:'  '}])assert.equal((await req('POST','/api/plans',b)).statusCode,400);});
test('NFR-03 cross-user modification and checkin hidden',async()=>{assert.equal((await req('PATCH','/api/plans/'+pid,{title:'stolen'},other)).statusCode,404);assert.equal((await req('POST','/api/checkins',{plan_id:pid,duration_minutes:30},other)).statusCode,404);assert.ok(!(await req('GET','/api/plans',undefined,other)).json().data.some((x:any)=>x.id===pid));});
test('FR-04 records current business day, rejects client date',async()=>{assert.equal((await req('POST','/api/checkins',{plan_id:pid,duration_minutes:30,local_date:'2026-09-20'})).statusCode,400);const r=await req('POST','/api/checkins',{plan_id:pid,duration_minutes:32,note:'Good'});assert.equal(r.statusCode,201,r.body);assert.equal(r.json().data.local_date,'2026-09-21');});
test('FR-05 concurrent duplicate checkins return conflict',async()=>{const results=await Promise.all([req('POST','/api/checkins',{plan_id:pid,duration_minutes:33}),req('POST','/api/checkins',{plan_id:pid,duration_minutes:34})]);assert.ok(results.every(r=>r.statusCode===409));});
test('FR-07 same-day different plans count one active day',async()=>{const p=(await req('POST','/api/plans',{...payload,title:'Walk'})).json().data;await req('POST','/api/checkins',{plan_id:p.id,duration_minutes:18});const s=(await req('GET','/api/stats?days=7')).json().data;assert.equal(s.minutes,50);assert.equal(s.checkins,2);assert.equal(s.active_days,1);assert.equal(s.series.length,7);assert.equal(s.series[0].minutes,0);});
test('FR-03 history snapshot survives rename and archive',async()=>{await req('PATCH','/api/plans/'+pid,{title:'Updated'});assert.equal((await req('DELETE','/api/plans/'+pid)).statusCode,200);const rows=(await req('GET','/api/checkins')).json().data;assert.equal(rows.find((x:any)=>x.plan_id===pid).plan_title,'Morning run');assert.ok(!(await req('GET','/api/plans')).json().data.some((x:any)=>x.id===pid));assert.equal((await req('GET','/api/stats')).json().data.minutes,50);});
test('FR-04 rejects unscheduled or archived plans',async()=>{assert.equal((await req('POST','/api/checkins',{plan_id:pid,duration_minutes:20})).statusCode,409);const p=(await req('POST','/api/plans',{...payload,weekdays:[2]})).json().data;assert.equal((await req('POST','/api/checkins',{plan_id:p.id,duration_minutes:20})).statusCode,409);});
test('FR-09 profile validation and persistence',async()=>{assert.equal((await req('PATCH','/api/me',{weekly_goal:8})).statusCode,400);assert.equal((await req('PATCH','/api/me',{nickname:'Lin',weekly_goal:5,locale:'en'})).statusCode,200);assert.equal((await req('GET','/api/me')).json().data.nickname,'Lin');});
test('FR-08 bilingual article categories, paragraph breaks and missing article',async()=>{const a=(await req('GET','/api/articles?locale=en&category=habits',undefined,'')).json().data;assert.equal(a.length,1);assert.match(a[0].title,/movement/);const body=(await req('GET','/api/articles/'+a[0].id+'?locale=en',undefined,'')).json().data.body;assert.ok(body.includes('\n\n'));assert.ok(!body.includes('\\n'));assert.equal((await req('GET','/api/articles/'+randomUUID(),undefined,'')).statusCode,404);});
test('FR-06 invalid and excessive history ranges rejected',async()=>{assert.equal((await req('GET','/api/checkins?from=2026-09-22&to=2026-09-21')).statusCode,400);assert.equal((await req('GET','/api/checkins?from=2020-01-01&to=2026-09-21')).statusCode,400);});
test('NFR-02 SQL rejects cross-owner foreign key and invalid duration',async()=>{await assert.rejects(db.query('INSERT INTO checkin(id,user_id,plan_id,local_date,duration_minutes,plan_title,activity) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),uid,pid,'2026-09-20',0,'test','run']));});
test('NFR-02 SQL prevents a checkin owner from differing from its plan owner',async()=>{const secondUser=(await req('GET','/api/me',undefined,other)).json().data.id;await assert.rejects(db.query('INSERT INTO checkin(id,user_id,plan_id,local_date,duration_minutes,plan_title,activity) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),secondUser,pid,'2026-09-20',20,'test','run']),{code:'23503'});});
test('BR-08 Shanghai midnight and leap day',()=>{assert.equal(localDate(new Date('2026-09-20T16:00:00Z')),'2026-09-21');assert.equal(localDate(new Date('2026-09-20T15:59:59Z')),'2026-09-20');assert.equal(shiftDay('2024-03-01',-1),'2024-02-29');});
test('BR-04 streak bridges today or yesterday and ignores duplicates',()=>{assert.equal(streak(['2026-09-21','2026-09-20','2026-09-20'],'2026-09-21'),2);assert.equal(streak(['2026-09-20','2026-09-19'],'2026-09-21'),2);assert.equal(streak(['2026-09-19'],'2026-09-21'),0);});
test('FR-01 demo login disabled in production configuration',async()=>{const secure=await buildApp({db:await database(),secret:'production-test-secret-at-least-32-chars',demo:false});assert.equal((await secure.inject({method:'POST',url:'/api/auth/demo',payload:{}})).statusCode,404);await secure.close();});
