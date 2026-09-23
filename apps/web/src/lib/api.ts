export const base=import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000';
export const demoMode=import.meta.env.VITE_AUTH_MODE!=='live';
export const session={get token():string{return uni.getStorageSync('fitstreak-token')||'';},set token(v:string){uni.setStorageSync('fitstreak-token',v);}};
export function request<T=any>(path:string,method:'GET'|'POST'|'PATCH'|'DELETE'|'PUT'='GET',data?:unknown):Promise<T>{
 return new Promise((resolve,reject)=>uni.request({url:base+path,method,data:method==='DELETE'&&data===undefined?{}:data,timeout:12000,header:{'Content-Type':'application/json',...(session.token?{Authorization:`Bearer ${session.token}`}:{})},success:r=>{const body=r.data as any;if(r.statusCode>=200&&r.statusCode<300)resolve(body.data);else{if(r.statusCode===401)session.token='';reject(new Error(body?.error?.code??'INTERNAL_ERROR'));}},fail:()=>reject(new Error('error'))}));
}
export async function signIn(){
 let data:any;
 if(demoMode) data=await request('/api/auth/demo','POST',{});
 else {
   // #ifdef MP-WEIXIN
   const res=await uni.login({provider:'weixin'});data=await request('/api/auth/wechat','POST',{code:res.code});
   // #endif
   // #ifdef H5
   throw new Error('webLoginHint');
   // #endif
 }
 session.token=data.token;return data.user;
}
