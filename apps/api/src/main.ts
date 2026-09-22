import {buildApp} from './app.js';
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
if(existsSync('.env')) process.loadEnvFile('.env');
const production=process.env.NODE_ENV==='production';
if(production && (!process.env.JWT_SECRET || !process.env.DATABASE_URL || process.env.DEMO_MODE==='true')) throw new Error('Production requires JWT_SECRET, DATABASE_URL and DEMO_MODE=false');
const app=await buildApp({secret:process.env.JWT_SECRET??randomBytes(48).toString('hex'),demo:!production && process.env.DEMO_MODE!=='false',logger:true,agent:{apiKey:process.env.DEEPSEEK_API_KEY,baseUrl:process.env.DEEPSEEK_BASE_URL,model:process.env.DEEPSEEK_MODEL,thinking:process.env.DEEPSEEK_THINKING==='true'},corsOrigin:process.env.CORS_ORIGIN,wechat:{appid:process.env.WECHAT_APP_ID??'',secret:process.env.WECHAT_APP_SECRET??''}});
await app.listen({port:Number(process.env.PORT??3000),host:process.env.HOST??'127.0.0.1'});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
