import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {setupServer} from 'msw/node';
import {http,HttpResponse} from 'msw';
import {buildApp} from '../apps/api/src/app.js';
import {database} from '../apps/api/src/db.js';
const upstream=setupServer();upstream.listen({onUnhandledRequest:'error'});after(()=>upstream.close());
test('WeChat code exchange is server-side and stable for returning users',async()=>{
 upstream.use(http.get('https://api.weixin.qq.com/sns/jscode2session',({request})=>{const u=new URL(request.url);assert.equal(u.searchParams.get('appid'),'test-app');assert.equal(u.searchParams.get('js_code'),'test-code');return HttpResponse.json({openid:'wx-test-identity',session_key:'never-expose-this'});}));
 const app=await buildApp({db:await database(),secret:'wechat-test-secret-at-least-thirty-two',wechat:{appid:'test-app',secret:'test-app-secret'}});
 try{const first=await app.inject({method:'POST',url:'/api/auth/wechat',payload:{code:'test-code'}});assert.equal(first.statusCode,200,first.body);assert.ok(!first.body.includes('never-expose'));assert.ok(!first.body.includes('wx-test-identity'));const second=await app.inject({method:'POST',url:'/api/auth/wechat',payload:{code:'test-code'}});assert.equal(first.json().data.user.id,second.json().data.user.id);assert.equal(second.json().data.demo,false);}finally{await app.close();}
});
test('WeChat invalid code does not create a session',async()=>{
 upstream.use(http.get('https://api.weixin.qq.com/sns/jscode2session',()=>HttpResponse.json({errcode:40029,errmsg:'invalid code'})));
 const app=await buildApp({db:await database(),secret:'wechat-test-secret-at-least-thirty-two',wechat:{appid:'test-app',secret:'test-app-secret'}});
 try{assert.equal((await app.inject({method:'POST',url:'/api/auth/wechat',payload:{code:'invalid'}})).statusCode,401);}finally{await app.close();}
});
