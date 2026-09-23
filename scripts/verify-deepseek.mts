// Explicit paid integration check: synthetic data in an isolated, in-memory database.
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {buildApp} from '../apps/api/src/app.js';
import {database} from '../apps/api/src/db.js';
import {localDate} from '../apps/api/src/domain.js';
process.loadEnvFile('apps/api/.env');
const mixed=process.argv.includes('--mixed');
if(!process.env.DEEPSEEK_API_KEY)throw new Error('Configure DEEPSEEK_API_KEY locally first.');
const app=await buildApp({db:await database(),secret:'isolated-synthetic-live-check-secret-32-characters',demo:true,agent:{apiKey:process.env.DEEPSEEK_API_KEY,baseUrl:process.env.DEEPSEEK_BASE_URL,model:process.env.DEEPSEEK_MODEL,thinking:process.env.DEEPSEEK_THINKING==='true'}});
try{
 const token=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{}})).json().data.token;
 const req=(method:any,url:string,payload?:any)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+token}});
 for(const p of (await req('GET','/api/plans')).json().data)await req('DELETE','/api/plans/'+p.id);
 await req('PUT','/api/health-profile',{age:28,height_cm:170,weight_kg:65,goal:'fitness',experience:'beginner',weekly_days:mixed?5:3,session_minutes:mixed?30:20,equipment:mixed?['treadmill','bike']:[],has_limitations:false,limitations:'',ai_consent:true});
 const started=await req('POST','/api/agent/runs',{message:mixed?'请帮我安排未来一周5天训练，每日30分钟，需要有力量训练和有氧训练，以减脂塑形为目标。我没有需要注意的情况，前5天训练。':'我是没有运动限制的成年人，请安排未来七天三次轻松步行训练，每次20分钟，不需要器械，使用动作库已有动作。',start_date:localDate(new Date()),locale:'zh-CN',request_key:randomUUID(),consent:true});
 if(started.statusCode!==202)throw new Error('Start failed: '+started.json().error?.code);
 let run=started.json().data;
 for(let n=0;n<55&&['queued','running'].includes(run.status);n++){await new Promise(resolve=>setTimeout(resolve,2000));run=(await req('GET','/api/agent/runs/'+run.id)).json().data;}
 let confirmed=false;
 if(run.status==='draft'){const result=await req('POST','/api/agent/runs/'+run.id+'/confirm',{confirm:true});confirmed=result.statusCode===200&&result.json().data.created_plan_ids.length===run.proposal.sessions.length;}
 const report={checkedAt:new Date().toISOString(),provider:'DeepSeek',model:run.model,syntheticData:true,storage:'isolated in-memory PGlite',status:run.status,error:run.error_code??null,tools:run.tool_log,totalTokens:run.total_tokens,sessions:run.proposal?.sessions.length??0,candidateRetained:Boolean(run.candidate_text),validationIssues:run.validation_issues,confirmed};
 await writeFile(mixed?'docs/deepseek-mixed-verification.json':'docs/deepseek-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 if(!confirmed)process.exitCode=1;
}finally{await app.close();}
