import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/src/app.js';
import { database } from '../apps/api/src/db.js';
import { shiftDay } from '../apps/api/src/domain.js';
import { nutritionTarget } from '../apps/api/src/nutrition/domain.js';

const day='2026-10-21';
const profile={age:28,height_cm:170,weight_kg:65,sex:'male' as const,goal:'maintain' as const,activity_level:'sedentary' as const,allergies:'',preferences:'',has_conditions:false};
const foods=[{name:'Rice, chicken and vegetables',grams:500,carbs_g:85,protein_g:35,fat_g:20}];
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6f8AAAAASUVORK5CYII=';
const apps:any[]=[];
after(async()=>{for(const app of apps)await app.close();});
function fixture(mode='normal'):typeof fetch{return (async(_url:any,init:any)=>{
  if(mode==='network')throw new Error('private-key-do-not-leak');
  if(mode==='balance')return new Response('private-provider-body',{status:402});
  if(mode==='rate')return new Response('private-provider-body',{status:429});
  const body=JSON.parse(init.body);
  let value:any;
  if(Array.isArray(body.messages[1].content))value={foods:mode==='empty'?[]:foods,summary:'Review the estimated portions.',warnings:['Cooking oil and portion weights are estimates.']};
  else {
    const input=JSON.parse(body.messages[1].content);
    value={title:'Seven days of balanced meals',style:input.style,summary:'Practical meals with measured portions.',target_kcal:nutritionTarget(input.profile),days:Array.from({length:7},(_,i)=>({date:shiftDay(input.start_date,i),meals:['breakfast','lunch','dinner'].map(meal_type=>({meal_type,title:'Rice and chicken',foods,instructions:'Cook thoroughly and portion according to the listed weights.'}))}))};
    if(mode==='invalid-plan')value.days[0].meals[0].foods=[{...foods[0],fat_g:499}];
  }
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}]}),{headers:{'Content-Type':'application/json'}});
}) as typeof fetch;}
async function setup(mode='normal',configured=true,transport=fixture(mode)){
  const db=await database({url:process.env.TEST_DATABASE_URL});
  const app=await buildApp({db,secret:'nutrition-test-secret-more-than-thirty-two-characters',demo:true,requestLimit:1000,now:()=>new Date(day+'T04:00:00Z'),nutrition:{apiKey:configured?'fixture-nutrition-key':undefined,transport}});apps.push(app);
  const token=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{}})).json().data.token;
  const req=(method:any,url:string,payload?:any,auth=token)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+auth}});
  return {db,app,req,token};
}
const upload=()=>({image_data:png,description:'Lunch',locale:'en',consent:true,request_key:randomUUID()});
const planInput=()=>({style:'easy',start_date:day,locale:'en',consent:true,request_key:randomUUID()});
const mealInput=()=>({date:day,meal_type:'lunch',foods,note:'Estimated portions confirmed',request_key:randomUUID()});
async function wait(req:any,id:string,kind='analyses'){
  for(let n=0;n<100;n++){
    const response=await req('GET',`/api/nutrition/${kind}/${id}`);assert.equal(response.statusCode,200,response.body);
    const run=response.json().data;if(!['queued','running'].includes(run.status))return run;
    await new Promise(resolve=>setTimeout(resolve,10));
  }throw new Error('Nutrition job did not finish');
}
test('Photo analysis is asynchronous, private, owned and idempotent, and never creates a meal automatically',async()=>{
  const {req,app}=await setup();
  const payload=upload();
  const first=await req('POST','/api/nutrition/analyses',payload);assert.equal(first.statusCode,202,first.body);
  const run=await wait(req,first.json().data.id);assert.equal(run.status,'ready');assert.deepEqual(run.foods,foods);assert.equal(run.totals.kcal,660);assert.equal(run.photo_available,true);
  assert.ok(!JSON.stringify(run).includes('image_data'));assert.ok(!JSON.stringify(run).includes(png));
  assert.equal((await req('POST','/api/nutrition/analyses',payload)).json().data.id,run.id);
  assert.equal((await req('GET','/api/nutrition/status')).json().data.quota.used,1);
  assert.equal((await req('GET','/api/nutrition/meals?date='+day)).json().data.meals.length,0);
  const photo=await req('GET','/api/nutrition/photos/'+run.id);assert.equal(photo.json().data.image_data,png);assert.match(photo.headers['cache-control'] as string,/no-store/);
  const other=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{}})).json().data.token;
  assert.equal((await req('GET','/api/nutrition/analyses/'+run.id,undefined,other)).statusCode,404);
  assert.equal((await req('GET','/api/nutrition/photos/'+run.id,undefined,other)).statusCode,404);
  assert.equal((await req('GET','/api/nutrition/status',undefined,other)).json().data.quota.remaining,12);
  assert.equal((await req('DELETE','/api/nutrition/analyses/'+run.id,undefined,other)).statusCode,404);
  assert.equal((await req('DELETE','/api/nutrition/analyses/'+run.id)).statusCode,200);
  assert.equal((await req('GET','/api/nutrition/photos/'+run.id)).statusCode,404);
  assert.equal((await req('GET','/api/nutrition/status')).json().data.quota.used,1,'Erasing a photo must not reset allowance');
});
test('Consent, real image signature, size and configuration are checked before creating paid jobs',async()=>{
  const {req}=await setup();
  assert.equal((await req('POST','/api/nutrition/analyses',{...upload(),consent:false})).json().error.code,'AI_CONSENT_REQUIRED');
  assert.equal((await req('POST','/api/nutrition/analyses',{...upload(),image_data:'https://attacker.example/food.png'})).json().error.code,'NUTRITION_INVALID_IMAGE');
  assert.equal((await req('POST','/api/nutrition/analyses',{...upload(),image_data:'data:image/png;base64,'+Buffer.from('not a real image').toString('base64')})).json().error.code,'NUTRITION_INVALID_IMAGE');
  assert.equal((await req('POST','/api/nutrition/analyses',{...upload(),image_data:'data:image/jpeg;base64,'+Buffer.alloc(4*1024*1024+1).toString('base64')})).json().error.code,'NUTRITION_IMAGE_TOO_LARGE');
  assert.equal((await req('GET','/api/nutrition/status')).json().data.quota.used,0);
  const unconfigured=await setup('normal',false);assert.equal((await unconfigured.req('POST','/api/nutrition/analyses',upload())).json().error.code,'AI_NOT_CONFIGURED');
  assert.equal((await unconfigured.req('GET','/api/nutrition/status')).json().data.quota.used,0);
});
test('Meal CRUD recomputes calories, enforces ownership and dates, and links only ready owned photos',async()=>{
  const {req,app,db}=await setup();
  const analysed=await req('POST','/api/nutrition/analyses',upload());const run=await wait(req,analysed.json().data.id);
  const payload={...mealInput(),analysis_id:run.id};
  const first=await req('POST','/api/nutrition/meals',payload);assert.equal(first.statusCode,201,first.body);
  const record=first.json().data;assert.equal(record.totals.kcal,660);assert.equal(record.photo_available,true);
  assert.equal((await req('POST','/api/nutrition/meals',payload)).json().data.id,record.id);
  assert.equal((await req('DELETE','/api/nutrition/analyses/'+run.id)).json().error.code,'NUTRITION_ANALYSIS_IN_USE');
  const other=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{}})).json().data.token;
  assert.equal((await req('PATCH','/api/nutrition/meals/'+record.id,{note:'Steal'},other)).statusCode,404);
  assert.equal((await req('DELETE','/api/nutrition/meals/'+record.id,undefined,other)).statusCode,404);
  assert.equal((await req('POST','/api/nutrition/meals',{...mealInput(),analysis_id:run.id},other)).statusCode,404);
  assert.equal((await req('POST','/api/nutrition/meals',{...mealInput(),date:shiftDay(day,1)})).json().error.code,'NUTRITION_INVALID_DATE');
  assert.equal((await req('POST','/api/nutrition/meals',{...mealInput(),date:shiftDay(day,-367)})).json().error.code,'NUTRITION_INVALID_DATE');
  assert.equal((await req('POST','/api/nutrition/meals',{...mealInput(),foods:[{...foods[0],kcal:1}]})).statusCode,400);
  const patched=await req('PATCH','/api/nutrition/meals/'+record.id,{meal_type:'snack',foods:[{...foods[0],carbs_g:75}]});assert.equal(patched.statusCode,200,patched.body);assert.equal(patched.json().data.totals.kcal,620);
  assert.equal((await req('GET','/api/nutrition/stats?period=day&date='+day)).json().data.series.find((s:any)=>s.label==='snack').intake_kcal,620);
  const shared=await req('POST','/api/nutrition/meals',{...mealInput(),analysis_id:run.id});assert.equal(shared.statusCode,201,shared.body);
  assert.equal((await req('DELETE','/api/nutrition/meals/'+record.id)).statusCode,200);
  assert.equal((await req('GET','/api/nutrition/photos/'+run.id)).statusCode,200,'A second meal still owns this photo');
  assert.equal((await req('GET','/api/nutrition/analyses/'+run.id)).json().data.status,'ready');
  assert.equal((await req('DELETE','/api/nutrition/meals/'+shared.json().data.id)).statusCode,200);
  assert.equal((await req('GET','/api/nutrition/meals?date='+day)).json().data.totals.kcal,0);
  assert.equal((await req('GET','/api/nutrition/photos/'+run.id)).statusCode,404,'Deleting the final meal must erase its photo');
  const deleted=(await req('GET','/api/nutrition/analyses/'+run.id)).json().data;assert.equal(deleted.error_code,'NUTRITION_ANALYSIS_DELETED');assert.equal(deleted.photo_available,false);
  const shell=(await db.query('SELECT image_data,foods,summary,warnings,input FROM nutrition_job WHERE id=$1',[run.id])).rows[0];
  assert.deepEqual(shell,{image_data:null,foods:null,summary:'',warnings:[],input:{}});
  assert.equal((await req('GET','/api/nutrition/status')).json().data.quota.used,1,'Deleting a saved photo must not reset allowance');
  assert.equal((await req('DELETE','/api/nutrition/analyses/'+run.id)).statusCode,200);
});
test('Daily deficit uses a stable historical BMR/weight snapshot and net recorded exercise; no meals means unknown deficit',async()=>{
  const {req}=await setup();
  const missing=(await req('GET','/api/nutrition/summary?date='+day)).json().data;assert.equal(missing.balance_kcal,null);assert.equal(missing.basis,'missing');
  const saved=await req('PUT','/api/nutrition/profile',profile);assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().data.bmr_kcal,1578);
  assert.equal((await req('GET','/api/nutrition/summary?date='+day)).json().data.balance_kcal,null);
  await req('POST','/api/nutrition/meals',mealInput());
  const training=await req('POST','/api/plans',{title:'Walk',activity:'walk',target_minutes:20,weekdays:[1,2,3,4,5,6,7],start_date:day,end_date:null});
  const checked=await req('POST','/api/checkins',{plan_id:training.json().data.id,duration_minutes:20});assert.equal(checked.statusCode,201,checked.body);
  const before=(await req('GET','/api/nutrition/summary?date='+day)).json().data;assert.equal(before.basis,'snapshot');assert.equal(before.exercise_kcal,57);assert.equal(before.balance_kcal,975);
  await req('PUT','/api/nutrition/profile',{...profile,weight_kg:80});
  const after=(await req('GET','/api/nutrition/summary?date='+day)).json().data;assert.equal(after.bmr_kcal,1578);assert.equal(after.exercise_kcal,57);assert.equal(after.balance_kcal,before.balance_kcal);
  const week=(await req('GET','/api/nutrition/stats?period=week&date='+day)).json().data;assert.equal(week.from,'2026-10-19');assert.equal(week.series.length,7);assert.equal(week.series.filter((s:any)=>s.has_records).length,1);assert.equal(week.total_intake_kcal,660);
  const month=(await req('GET','/api/nutrition/stats?period=month&date='+day)).json().data;assert.equal(month.series.length,31);assert.equal(month.series.at(-1).has_records,false);
});
test('Plans require a profile, eligibility, a preview and explicit activation; meal check-in is owned and idempotent',async()=>{
  const {req,app}=await setup();
  assert.equal((await req('POST','/api/nutrition/plans/generate',planInput())).json().error.code,'NUTRITION_PROFILE_REQUIRED');
  await req('PUT','/api/nutrition/profile',{...profile,has_conditions:true});
  assert.equal((await req('POST','/api/nutrition/plans/generate',planInput())).json().error.code,'NUTRITION_HEALTH_REVIEW_REQUIRED');
  await req('PUT','/api/nutrition/profile',profile);
  const created=await req('POST','/api/nutrition/plans/generate',planInput());assert.equal(created.statusCode,202,created.body);
  const draft=await wait(req,created.json().data.id,'plans');assert.equal(draft.status,'draft');assert.equal(draft.proposal.days.length,7);
  const input={date:day,meal_type:'breakfast',request_key:randomUUID()};
  assert.equal((await req('POST',`/api/nutrition/plans/${draft.id}/checkins`,input)).json().error.code,'NUTRITION_PLAN_NOT_ACTIVE');
  assert.equal((await req('POST',`/api/nutrition/plans/${draft.id}/activate`,{confirm:false})).statusCode,400);
  const other=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{}})).json().data.token;
  assert.equal((await req('POST',`/api/nutrition/plans/${draft.id}/activate`,{confirm:true},other)).statusCode,404);
  assert.equal((await req('POST',`/api/nutrition/plans/${draft.id}/activate`,{confirm:true})).json().data.status,'active');
  assert.equal((await req('GET','/api/nutrition/meals?date='+day)).json().data.meals.length,0,'Activation must not fabricate consumed meals');
  const attempts=await Promise.all([req('POST',`/api/nutrition/plans/${draft.id}/checkins`,input),req('POST',`/api/nutrition/plans/${draft.id}/checkins`,{...input,request_key:randomUUID()})]);
  assert.ok(attempts.every(r=>r.statusCode===201),attempts.map(r=>r.body).join('\n'));assert.equal(attempts[0].json().data.id,attempts[1].json().data.id);
  assert.equal((await req('GET','/api/nutrition/meals?date='+day)).json().data.meals.length,1);
  assert.deepEqual((await req('GET',`/api/nutrition/plans/${draft.id}`)).json().data.checkins,[{date:day,meal_type:'breakfast'}]);
  assert.equal((await req('POST',`/api/nutrition/plans/${draft.id}/checkins`,{...input,date:shiftDay(day,1)})).json().error.code,'NUTRITION_INVALID_DATE');
  await req('PUT','/api/nutrition/profile',{...profile,weight_kg:66});
  assert.equal((await req('POST',`/api/nutrition/plans/${draft.id}/activate`,{confirm:true})).json().error.code,'NUTRITION_PROFILE_CHANGED');
  assert.equal((await req('POST',`/api/nutrition/plans/${draft.id}/checkins`,{...input,meal_type:'lunch'})).json().error.code,'NUTRITION_PLAN_NOT_ACTIVE');
});
test('Failed accepted jobs consume allowance, provider causes stay distinct and the rolling window restores capacity',async()=>{
  const {req,db}=await setup('balance');
  let oldest='';
  for(let n=0;n<12;n++){
    const started=await req('POST','/api/nutrition/analyses',upload());assert.equal(started.statusCode,202,started.body);
    if(!oldest)oldest=started.json().data.id;
    const run=await wait(req,started.json().data.id);assert.equal(run.error_code,'AI_PROVIDER_BALANCE_LOW');assert.ok(!JSON.stringify(run).includes('private-provider-body'));
  }
  const full=(await req('GET','/api/nutrition/status')).json().data.quota;assert.equal(full.remaining,0);assert.ok(full.next_restore_at);
  assert.equal((await req('POST','/api/nutrition/analyses',upload())).json().error.code,'NUTRITION_USER_RATE_LIMITED');
  await db.query("UPDATE nutrition_job SET created_at=CURRENT_TIMESTAMP-INTERVAL '61 minutes' WHERE id=$1",[oldest]);
  assert.equal((await req('GET','/api/nutrition/status')).json().data.quota.remaining,1);
  const rate=await setup('rate');const r=await rate.req('POST','/api/nutrition/analyses',upload());assert.equal((await wait(rate.req,r.json().data.id)).error_code,'AI_PROVIDER_RATE_LIMITED');
  const network=await setup('network');const net=await network.req('POST','/api/nutrition/analyses',upload());const failure=await wait(network.req,net.json().data.id);assert.equal(failure.status,'failed');assert.ok(!JSON.stringify(failure).includes('private-key'));
});
test('Invalid plan output and unrecognizable food never become usable plans or fabricated records',async()=>{
  const {req}=await setup('invalid-plan');await req('PUT','/api/nutrition/profile',profile);
  const started=await req('POST','/api/nutrition/plans/generate',planInput());const run=await wait(req,started.json().data.id,'plans');assert.equal(run.status,'failed');assert.equal(run.error_code,'NUTRITION_INVALID_PLAN');assert.equal(run.proposal,null);
  assert.equal((await req('POST',`/api/nutrition/plans/${run.id}/activate`,{confirm:true})).json().error.code,'NUTRITION_PLAN_NOT_READY');
  const empty=await setup('empty');const a=await empty.req('POST','/api/nutrition/analyses',upload());assert.equal((await wait(empty.req,a.json().data.id)).error_code,'NUTRITION_NO_FOOD');
});
test('A user has one in-flight job, duplicate requests reuse it, and shutdown aborts before closing the database',async()=>{
  let entered!:()=>void,aborted=false;
  const called=new Promise<void>(resolve=>entered=resolve);
  const transport=(async(_url:any,init:any)=>{entered();return new Promise<Response>((_resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('abort'));},{once:true}));}) as typeof fetch;
  const {req,app,db}=await setup('normal',true,transport);
  const payload=upload();const started=await req('POST','/api/nutrition/analyses',payload);assert.equal(started.statusCode,202,started.body);await called;
  const duplicate=await req('POST','/api/nutrition/analyses',payload);assert.equal(duplicate.json().data.id,started.json().data.id);
  assert.equal((await req('POST','/api/nutrition/analyses',upload())).json().error.code,'NUTRITION_ALREADY_RUNNING');
  assert.equal((await req('GET','/api/nutrition/status')).json().data.quota.used,1);
  const original=db.close.bind(db);db.close=async()=>{assert.equal(aborted,true,'Job must be aborted before its database is closed');await original();};
  await app.close();assert.equal(aborted,true);
});
