import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {randomUUID} from 'node:crypto';
import {database, type Database} from './db.js';
import {localDate, shiftDay, streak, isScheduled} from './domain.js';
import {responseFor} from './contracts.js';

declare module '@fastify/jwt' { interface FastifyJWT {payload:{sub:string}; user:{sub:string};} }
export type AppOptions = {db?:Database; secret:string; demo?:boolean; now?:()=>Date; corsOrigin?:string; wechat?:{appid:string;secret:string}; logger?:boolean};
const uuid={type:'string',format:'uuid'};
const date={type:'string',format:'date'};
const object=(properties:Record<string,any>, required:string[]=[])=>({type:'object',additionalProperties:false,properties,required});
const planFields={title:{type:'string',minLength:1,maxLength:80,pattern:'\\S'},activity:{type:'string',enum:['run','strength','yoga','walk','cycle']},target_minutes:{type:'integer',minimum:1,maximum:600},weekdays:{type:'array',items:{type:'integer',minimum:1,maximum:7},minItems:1,maxItems:7,uniqueItems:true},start_date:date,end_date:{anyOf:[date,{type:'null'}]}};
const result=(data:any)=>({data});
function fail(code:string,statusCode=400):never { throw Object.assign(new Error(code),{code,statusCode}); }

export async function buildApp(o:AppOptions) {
 if(o.secret.length<32) throw new Error('JWT_SECRET must contain at least 32 characters');
 const db=o.db??await database({url:process.env.DATABASE_URL,path:process.env.PGLITE_PATH??'../../.data/fitstreak'});
 const app=Fastify({logger:o.logger??false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
 await app.register(cors,{origin:o.corsOrigin??'http://127.0.0.1:5173',methods:['GET','HEAD','POST','PATCH','DELETE','OPTIONS']});
 await app.register(jwt,{secret:o.secret,sign:{expiresIn:'7d'}});
 await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
 await app.register(swagger,{openapi:{info:{title:'FitStreak API',version:'1.0.0',description:'All business dates use Asia/Shanghai. Demo login is disabled in production.'},components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}}}}});
 await app.register(swaggerUi,{routePrefix:'/docs'});
 app.addHook('onRoute',route=>{const response=responseFor(route.url,String(route.method));if(response)route.schema={...route.schema,response};});
 const now=()=>o.now?.()??new Date();
 const today=()=>localDate(now());
 app.setErrorHandler((e,req,reply)=>{
   const err=e as any;
   let status=err.statusCode??500, code=err.code??'INTERNAL_ERROR';
   if(err.validation) {status=400;code='VALIDATION_ERROR';}
   if(status===401) code='UNAUTHORIZED';
   if(code==='23505') {status=409;code='ALREADY_CHECKED_IN';}
   if(status>=500) {req.log.error(err);code='INTERNAL_ERROR';}
   reply.code(status).send({error:{code,requestId:req.id}});
 });
 const secure={security:[{bearerAuth:[]}]};
 const auth=async(req:any)=>{ await req.jwtVerify(); const u=await db.query('SELECT id FROM app_user WHERE id=$1',[req.user.sub]); if(!u.rows.length) fail('UNAUTHORIZED',401); };
 const user=async(id:string)=>(await db.query('SELECT id,nickname,locale,timezone,weekly_goal FROM app_user WHERE id=$1',[id])).rows[0];
 const ownedPlan=async(id:string,owner:string)=>{
   const row=(await db.query('SELECT *,start_date::text,end_date::text FROM fitness_plan WHERE id=$1 AND user_id=$2',[id,owner])).rows[0];
   if(!row) fail('NOT_FOUND',404); return row;
 };
 app.get('/health',{schema:{tags:['System']}},async()=>result({status:'ok'}));
 app.post('/api/auth/demo',{schema:{tags:['Auth'],body:object({})},config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
   if(!o.demo) fail('NOT_FOUND',404);
   const id=randomUUID();
   await db.query('INSERT INTO app_user(id,open_id,nickname) VALUES($1,$2,$3)',[id,`demo:${id}`,'Alex']);
   const pid=randomUUID();
   await db.query('INSERT INTO fitness_plan(id,user_id,title,activity,target_minutes,weekdays,start_date) VALUES($1,$2,$3,$4,$5,$6,$7)',[pid,id,'Morning flow','yoga',20,[1,2,3,4,5,6,7],today()]);
   reply.code(201);return result({token:app.jwt.sign({sub:id}),user:await user(id),demo:true});
 });
 app.post('/api/auth/wechat',{schema:{tags:['Auth'],body:object({code:{type:'string',minLength:1,maxLength:256}},['code'])}},async(req)=>{
   if(!o.wechat?.appid||!o.wechat?.secret) fail('WECHAT_NOT_CONFIGURED',503);
   const q=new URLSearchParams({appid:o.wechat.appid,secret:o.wechat.secret,js_code:(req.body as any).code,grant_type:'authorization_code'});
   let response;
   try {response=await fetch(`https://api.weixin.qq.com/sns/jscode2session?${q}`,{signal:AbortSignal.timeout(8000)});} catch { fail('WECHAT_UNAVAILABLE',502); }
   if(!response.ok) fail('WECHAT_UNAVAILABLE',502);
   const identity=await response.json() as any;
   if(identity.errcode || !identity.openid) fail('WECHAT_LOGIN_FAILED',401);
   const created=await db.query('INSERT INTO app_user(id,open_id) VALUES($1,$2) ON CONFLICT(open_id) DO UPDATE SET open_id=EXCLUDED.open_id RETURNING id',[randomUUID(),identity.openid]);
   const id=created.rows[0].id; return result({token:app.jwt.sign({sub:id}),user:await user(id),demo:false});
 });
 app.get('/api/me',{preHandler:auth,schema:{...secure,tags:['Profile']}},async req=>result(await user(req.user.sub)));
 app.patch('/api/me',{preHandler:auth,schema:{...secure,tags:['Profile'],body:{...object({nickname:{type:'string',minLength:1,maxLength:40,pattern:'\\S'},locale:{type:'string',enum:['zh-CN','en']},weekly_goal:{type:'integer',minimum:1,maximum:7}}),minProperties:1}}},async req=>{
   const b=req.body as any, fields=Object.keys(b);const params=fields.map(k=>b[k]);params.push(req.user.sub);
   await db.query(`UPDATE app_user SET ${fields.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${params.length}`,params);
   return result(await user(req.user.sub));
 });
 app.get('/api/plans',{preHandler:auth,schema:{...secure,tags:['Plans']}},async req=>result((await db.query('SELECT *,start_date::text,end_date::text FROM fitness_plan WHERE user_id=$1 AND archived_at IS NULL ORDER BY created_at DESC',[req.user.sub])).rows));
 app.post('/api/plans',{preHandler:auth,schema:{...secure,tags:['Plans'],body:object(planFields,['title','activity','target_minutes','weekdays','start_date'])}},async(req,reply)=>{
   const b=req.body as any;if(b.end_date && b.end_date<b.start_date) fail('INVALID_DATE_RANGE');
   const id=randomUUID();await db.query('INSERT INTO fitness_plan(id,user_id,title,activity,target_minutes,weekdays,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,req.user.sub,b.title.trim(),b.activity,b.target_minutes,b.weekdays,b.start_date,b.end_date??null]);
   reply.code(201);return result(await ownedPlan(id,req.user.sub));
 });
 app.patch('/api/plans/:id',{preHandler:auth,schema:{...secure,tags:['Plans'],params:object({id:uuid},['id']),body:{...object(planFields),minProperties:1}}},async req=>{
   const id=(req.params as any).id, prev=await ownedPlan(id,req.user.sub);if(prev.archived_at) fail('PLAN_ARCHIVED',409);
   const b=req.body as any, next={...prev,...b};if(next.end_date && next.end_date<next.start_date) fail('INVALID_DATE_RANGE');
   const fields=Object.keys(b), params=fields.map(k=>k==='title'?b[k].trim():b[k]);params.push(id,req.user.sub);
   await db.query(`UPDATE fitness_plan SET ${fields.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${params.length-1} AND user_id=$${params.length}`,params);
   return result(await ownedPlan(id,req.user.sub));
 });
 app.delete('/api/plans/:id',{preHandler:auth,schema:{...secure,tags:['Plans'],params:object({id:uuid},['id'])}},async req=>{
   const id=(req.params as any).id;await ownedPlan(id,req.user.sub);
   await db.query('UPDATE fitness_plan SET archived_at=$1 WHERE id=$2 AND user_id=$3',[now().toISOString(),id,req.user.sub]);return result({archived:true});
 });
 app.post('/api/checkins',{preHandler:auth,schema:{...secure,tags:['Checkins'],body:object({plan_id:uuid,duration_minutes:{type:'integer',minimum:1,maximum:600},note:{type:'string',maxLength:500}},['plan_id','duration_minutes'])}},async(req,reply)=>{
   const b=req.body as any, p=await ownedPlan(b.plan_id,req.user.sub), day=today();
   if(!isScheduled(p,day)) fail('PLAN_NOT_SCHEDULED',409);
   const id=randomUUID();
   await db.query('INSERT INTO checkin(id,user_id,plan_id,local_date,duration_minutes,note,plan_title,activity) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,req.user.sub,p.id,day,b.duration_minutes,b.note??'',p.title,p.activity]);
   reply.code(201);return result((await db.query('SELECT *,local_date::text FROM checkin WHERE id=$1',[id])).rows[0]);
 });
 app.get('/api/checkins',{preHandler:auth,schema:{...secure,tags:['Checkins'],querystring:object({from:date,to:date})}},async req=>{
   const q=req.query as any, from=q.from??shiftDay(today(),-29), to=q.to??today();if(from>to) fail('INVALID_DATE_RANGE');
   if(new Date(to).getTime()-new Date(from).getTime()>366*86400000) fail('RANGE_TOO_LARGE');
   return result((await db.query('SELECT *,local_date::text FROM checkin WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date ORDER BY checkin.local_date DESC,created_at DESC',[req.user.sub,from,to])).rows);
 });
 app.get('/api/stats',{preHandler:auth,schema:{...secure,tags:['Statistics'],querystring:object({days:{type:'string',enum:['7','30']}})}},async req=>{
   const days=Number((req.query as any).days??7), day=today(), start=shiftDay(day,1-days);
   const rows=(await db.query('SELECT local_date::text,COUNT(*)::int AS checkins,SUM(duration_minutes)::int AS minutes FROM checkin WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date GROUP BY local_date ORDER BY local_date',[req.user.sub,start,day])).rows;
   const all=(await db.query('SELECT DISTINCT local_date::text FROM checkin WHERE user_id=$1 AND local_date<=$2::date ORDER BY local_date DESC',[req.user.sub,day])).rows;
   const series=Array.from({length:days},(_,i)=>{const d=shiftDay(start,i);const r=rows.find(x=>x.local_date===d);return {date:d,minutes:r?.minutes??0,checkins:r?.checkins??0};});
   return result({today:day,from:start,to:day,timezone:'Asia/Shanghai',checkins:series.reduce((a,x)=>a+x.checkins,0),minutes:series.reduce((a,x)=>a+x.minutes,0),active_days:rows.length,streak:streak(all.map(x=>x.local_date),day),series});
 });
 app.get('/api/articles',{schema:{tags:['Knowledge'],querystring:object({locale:{type:'string',enum:['zh-CN','en']},category:{type:'string',enum:['training','recovery','habits']}})}},async req=>{
   const q=req.query as any;return result((await db.query('SELECT a.id,a.category,a.reading_minutes,t.title,t.summary FROM article a JOIN article_translation t ON t.article_id=a.id WHERE t.locale=$1 AND ($2::text IS NULL OR a.category=$2) ORDER BY a.id',[q.locale??'zh-CN',q.category??null])).rows);
 });
 app.get('/api/articles/:id',{schema:{tags:['Knowledge'],params:object({id:uuid},['id']),querystring:object({locale:{type:'string',enum:['zh-CN','en']}})}},async req=>{
   const row=(await db.query('SELECT a.id,a.category,a.reading_minutes,t.title,t.summary,t.body FROM article a JOIN article_translation t ON t.article_id=a.id WHERE a.id=$1 AND t.locale=$2',[(req.params as any).id,(req.query as any).locale??'zh-CN'])).rows[0];if(!row) fail('NOT_FOUND',404);return result(row);
 });
 app.addHook('onClose',async()=>{await db.close();});
 await app.ready();return app;
}
