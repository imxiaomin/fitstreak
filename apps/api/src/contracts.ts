// Response contracts are used by Fastify serialization and generated OpenAPI.
import {healthSchema,proposalSchema,exerciseSchema} from './agent/schema.js';
const text={type:'string'},number={type:'integer'},id={type:'string',format:'uuid'},date={type:'string',format:'date'};
const entity=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const optional=(properties:Record<string,any>)=>({type:'object',properties,additionalProperties:false});
const list=(items:any)=>({type:'array',items});
const nullableDate={anyOf:[date,{type:'null'}]};
export const User=entity({id,nickname:text,locale:{type:'string',enum:['zh-CN','en']},timezone:text,weekly_goal:number});
export const Plan=optional({id,user_id:id,title:text,activity:text,target_minutes:number,weekdays:list(number),start_date:date,end_date:nullableDate,archived_at:{anyOf:[text,{type:'null'}]},created_at:text,agent_run_id:{anyOf:[id,{type:'null'}]},exercises:list(exerciseSchema)});
export const Checkin=optional({id,user_id:id,plan_id:id,local_date:date,duration_minutes:number,note:text,plan_title:text,activity:text,created_at:text});
export const Article=optional({id,category:text,reading_minutes:number,title:text,summary:text,body:text});
export const Stats=entity({today:date,from:date,to:date,timezone:text,checkins:number,minutes:number,active_days:number,streak:number,series:list(entity({date,minutes:number,checkins:number}))});
const ErrorResponse=entity({error:entity({code:text,requestId:text})});
const AgentRun=entity({id,status:text,message:text,locale:text,start_date:date,model:text,answer:text,candidate_text:text,validation_issues:list(entity({zh:text,en:text})),proposal:{anyOf:[proposalSchema,{type:'null'}]},error_code:{anyOf:[text,{type:'null'}]},tool_log:list(entity({tool:text,status:text})),total_tokens:number,created_plan_ids:list(id),created_at:text,updated_at:text});
const Health={...healthSchema,properties:{...healthSchema.properties,version:id,updated_at:text},required:[...healthSchema.required,'version','updated_at']};
export function responseFor(url:string,method:string){
 let data:any,status=200;
 if(url==='/health')data=entity({status:text});
 else if(url.startsWith('/api/auth/')){data=entity({token:text,user:User,demo:{type:'boolean'}});if(url.endsWith('/demo'))status=201;}
 else if(url==='/api/me')data=User;
 else if(url==='/api/plans'){data=method==='GET'?list(Plan):Plan;if(method==='POST')status=201;}
 else if(url==='/api/plans/:id')data=method==='DELETE'?entity({archived:{type:'boolean'}}):Plan;
 else if(url==='/api/checkins'){data=method==='GET'?list(Checkin):Checkin;if(method==='POST')status=201;}
 else if(url==='/api/stats')data=Stats;
 else if(url==='/api/articles')data=list(Article);
 else if(url==='/api/articles/:id')data=Article;
 else if(url==='/api/health-profile')data=method==='DELETE'?entity({deleted:{type:'boolean'}}):{anyOf:[Health,{type:'null'}]};
 else if(url==='/api/agent/status')data=entity({configured:{type:'boolean'},provider:text,model:text});
 else if(url==='/api/agent/runs'){data=method==='GET'?list(AgentRun):AgentRun;if(method==='POST')return {200:entity({data}),202:entity({data}),'4xx':ErrorResponse,'5xx':ErrorResponse};}
 else if(url.startsWith('/api/agent/runs/'))data=AgentRun;
 else return undefined;
 return {[status]:entity({data}),'4xx':ErrorResponse,'5xx':ErrorResponse};
}
