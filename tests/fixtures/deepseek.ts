// Explicit test-only provider. Never imported by production entry points.
import type {ModelMessage} from '../../apps/api/src/agent/provider.js';
export function toolResponse(name:string,args:any,id='tool-1'){
 return new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,reasoning_content:'test-only-private-reasoning',tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}],usage:{total_tokens:120}}),{headers:{'Content-Type':'application/json'}});
}
export function draft(start:string){return {summary:'循序开始：本周安排轻松步行，预留准备、放松和休息时间。',sessions:[{title:'AI 轻松步行',date:start,activity:'walk',target_minutes:10,exercises:[{slug:'walking',sets:1,reps:null,duration_seconds:480,rest_seconds:0}]}]};}
export function testTransport(mode='normal'):typeof fetch{return (async(_url:any,init:any)=>{
 const body=JSON.parse(init.body),messages=body.messages as ModelMessage[];
 const start=messages[0].content!.match(/Start date (\d{4}-\d{2}-\d{2})/)![1];
 const toolMessages=messages.filter(m=>m.role==='tool');
 if(mode==='network')throw new TypeError('Do not expose this private provider error');
 if(mode==='unauthorized')return new Response('private-provider-body',{status:401});
 if(mode==='unknown')return toolResponse('execute_sql',{sql:'DROP TABLE app_user'});
 if((mode==='question'||messages.some(m=>m.role==='user'&&m.content?.includes('请先询问我的偏好')))&&messages.filter(m=>m.role==='user').length===1)return toolResponse('ask_followup',{question:'你希望以步行还是力量训练为主？'});
 if(toolMessages.length<3)return toolResponse(['get_health_profile','get_training_history','search_exercises'][toolMessages.length],{},'read-'+toolMessages.length);
 const plan=draft(start);
 if(mode==='bad-plan')plan.sessions[0].exercises[0].slug='unknown-exercise';
 return toolResponse('propose_training_plan',plan,'propose');
 }) as typeof fetch;}
