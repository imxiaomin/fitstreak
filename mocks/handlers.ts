import {http,HttpResponse,delay} from 'msw';
import {randomUUID} from 'node:crypto';
import {localDate,shiftDay,streak,isScheduled} from '../apps/api/src/domain.js';
const root='http://mock.fitstreak.test';
let plans:any[]=[], records:any[]=[], scenario='normal';
let profile:any;
const day=()=>localDate();
export function resetMock(mode='normal'){
 scenario=mode;profile={id:'20000000-0000-4000-8000-000000000001',nickname:'Alex',locale:'zh-CN',timezone:'Asia/Shanghai',weekly_goal:4};
 plans=mode==='empty'?[]:[{id:'30000000-0000-4000-8000-000000000001',title:'晨间舒展 · Morning flow',activity:'yoga',target_minutes:20,weekdays:[1,2,3,4,5,6,7],start_date:shiftDay(day(),-30),end_date:null},{id:'30000000-0000-4000-8000-000000000002',title:'轻松慢跑 · Easy run',activity:'run',target_minutes:30,weekdays:[1,2,3,4,5,6,7],start_date:shiftDay(day(),-30),end_date:null}];
 records=mode==='empty'?[]:[1,2,3,5,6].map((n,i)=>({id:randomUUID(),plan_id:plans[i%2].id,plan_title:plans[i%2].title,activity:plans[i%2].activity,local_date:shiftDay(day(),-n),duration_minutes:[25,35,20,40,30][i],note:''}));
}
resetMock();
const ok=(data:any,status=200)=>HttpResponse.json({data},{status});
const bad=(code:string,status:number)=>HttpResponse.json({error:{code,requestId:'mock'}},{status});
const texts={
 'zh-CN':[{title:'让运动成为日常的一部分',summary:'从一个小目标开始，找到适合自己的节奏。',body:'把运动安排在容易记住的时间。\n\n选择可执行的小目标，记录实际时长。\n\n偶尔中断时，从下一次计划继续。'},{title:'给每次训练一个清晰目标',summary:'运动项目、时长和日期，让计划更容易落实。',body:'给任务起一个具体名字，选择适合自己的时长。\n\n完成后记录实际结果，再调整下一次计划。'},{title:'为休息留出位置',summary:'回顾训练感受，合理安排下一次运动。',body:'在备注中写下训练后的感受。\n\n根据自己的状态和日程，为休息留出空间。'}],
 en:[{title:'Make movement part of your day',summary:'Start small and find your own rhythm.',body:'Choose a familiar moment in your day.\n\nSet an achievable goal and record your actual time.\n\nIf you miss a day, continue with the next session.'},{title:'Give each session a clear goal',summary:'An activity, a duration and a date help you begin.',body:'Name your task and choose an achievable duration.\n\nRecord the result and adapt your next plan.'},{title:'Leave room for rest',summary:'Reflect on your sessions when planning what comes next.',body:'Write a short note about how your session felt.\n\nLeave space in your schedule for rest.'}]
};
export const handlers=[http.all(root+'/api/*',async({request})=>{
 const url=new URL(request.url), path=url.pathname, method=request.method;
 if(scenario==='slow')await delay(600);
 if(scenario==='error')return bad('INTERNAL_ERROR',500);
 if(scenario==='unauthorized' && !path.startsWith('/api/auth'))return bad('UNAUTHORIZED',401);
 if(path==='/api/auth/demo' && method==='POST')return ok({token:'mock-session',user:profile,demo:true},201);
 if(!path.startsWith('/api/articles')&&request.headers.get('authorization')!=='Bearer mock-session')return bad('UNAUTHORIZED',401);
 const b=['POST','PATCH'].includes(method)?await request.json() as any:{};
 if(path==='/api/me'){if(method==='PATCH')profile={...profile,...b};return ok(profile);}
 if(path==='/api/plans' && method==='GET')return ok(plans);
 if(path==='/api/plans' && method==='POST'){if(!b.title?.trim()||!Number.isInteger(b.target_minutes)||b.target_minutes<1||b.target_minutes>600)return bad('VALIDATION_ERROR',400);if(b.end_date && b.end_date<b.start_date)return bad('INVALID_DATE_RANGE',400);const p={...b,id:randomUUID()};plans.unshift(p);return ok(p,201);}
 if(path.startsWith('/api/plans/')){const id=path.split('/').pop(),p=plans.find(x=>x.id===id);if(!p)return bad('NOT_FOUND',404);if(method==='DELETE'){plans=plans.filter(x=>x.id!==id);return ok({archived:true});}if(method==='PATCH'){Object.assign(p,b);return ok(p);}}
 if(path==='/api/checkins'&&method==='GET')return ok(records.filter(r=>r.local_date>=(url.searchParams.get('from')??shiftDay(day(),-29))&&r.local_date<=(url.searchParams.get('to')??day())));
 if(path==='/api/checkins'&&method==='POST'){
  const p=plans.find(p=>p.id===b.plan_id);if(!p)return bad('NOT_FOUND',404);if(!isScheduled(p,day()))return bad('PLAN_NOT_SCHEDULED',409);
  if(records.some(r=>r.plan_id===p.id&&r.local_date===day()))return bad('ALREADY_CHECKED_IN',409);
  if(!Number.isInteger(b.duration_minutes)||b.duration_minutes<1||b.duration_minutes>600)return bad('VALIDATION_ERROR',400);
  const row={id:randomUUID(),...b,local_date:day(),plan_title:p.title,activity:p.activity};records.unshift(row);return ok(row,201);
 }
 if(path==='/api/stats'){
  const n=url.searchParams.get('days')==='30'?30:7,from=shiftDay(day(),1-n);const series=Array.from({length:n},(_,i)=>{const d=shiftDay(from,i),r=records.filter(x=>x.local_date===d);return {date:d,minutes:r.reduce((s,x)=>s+x.duration_minutes,0),checkins:r.length};});
  return ok({today:day(),from,to:day(),timezone:'Asia/Shanghai',minutes:series.reduce((s,x)=>s+x.minutes,0),checkins:series.reduce((s,x)=>s+x.checkins,0),active_days:series.filter(x=>x.checkins).length,streak:streak(records.map(x=>x.local_date),day()),series});
 }
 if(path.startsWith('/api/articles')){const language=url.searchParams.get('locale')==='en'?'en':'zh-CN';const data=texts[language].map((a,i)=>({...a,id:`10000000-0000-4000-8000-00000000000${i+1}`,category:['habits','training','recovery'][i],reading_minutes:3}));if(path==='/api/articles')return ok(data.filter(a=>!url.searchParams.get('category')||a.category===url.searchParams.get('category')));const a=data.find(a=>a.id===path.split('/').pop());return a?ok(a):bad('NOT_FOUND',404);}
 return bad('NOT_FOUND',404);
})];
