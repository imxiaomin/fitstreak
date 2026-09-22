import {AgentError} from './schema.js';
export type ModelMessage={role:'system'|'user'|'assistant'|'tool';content:string|null;tool_call_id?:string;tool_calls?:{id:string;type:string;function:{name:string;arguments:string}}[];reasoning_content?:string};
export type Completion={message:ModelMessage;tokens:number};
export type AgentConfig={apiKey?:string;baseUrl?:string;model?:string;thinking?:boolean;timeoutMs?:number;transport?:typeof fetch};
export function createProvider(config:AgentConfig){
 const base=(config.baseUrl??'https://api.deepseek.com').replace(/\/$/,'');
 const url=new URL(base);
 // Health data may only leave this service for the official configured provider.
 if(url.protocol!=='https:'||url.hostname!=='api.deepseek.com'||url.username||url.password||url.search||url.hash||!['','/','/v1'].includes(url.pathname))throw new Error('DEEPSEEK_BASE_URL must be the official HTTPS DeepSeek endpoint');
 const model=config.model||'deepseek-flash';
 if(!/^[\w.-]{1,100}$/.test(model))throw new Error('Invalid DEEPSEEK_MODEL');
 return {model,configured:Boolean(config.apiKey),async complete(messages:ModelMessage[],tools:any[],signal:AbortSignal):Promise<Completion>{
  if(!config.apiKey)throw new AgentError('AI_NOT_CONFIGURED',503);
  let response:Response;
  try{response=await (config.transport??fetch)(base+'/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(config.timeoutMs??45000)]),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages,tools,tool_choice:'auto',thinking:{type:config.thinking?'enabled':'disabled'},max_tokens:3000,stream:false})});}
  catch{throw new AgentError(signal.aborted?'AI_CANCELLED':'AI_TIMEOUT',503);}
  if(!response.ok){await response.body?.cancel();throw new AgentError(response.status===401||response.status===403?'AI_AUTH_FAILED':response.status===429?'AI_RATE_LIMITED':'AI_UPSTREAM_ERROR',503);}
  let payload:any;try{const raw=await response.text();if(raw.length>500000)throw new Error();payload=JSON.parse(raw);}catch{throw new AgentError('AI_INVALID_RESPONSE',502);}
  const choice=payload?.choices?.[0],m=choice?.message;
  if(choice?.finish_reason==='length'||!m||m.role!=='assistant'||(m.content!==null&&typeof m.content!=='string'))throw new AgentError('AI_INVALID_RESPONSE',502);
  if(m.tool_calls!==undefined&&(!Array.isArray(m.tool_calls)||m.tool_calls.length>4||m.tool_calls.some((c:any)=>typeof c.id!=='string'||c.id.length>100||c.type!=='function'||typeof c.function?.name!=='string'||typeof c.function?.arguments!=='string'||c.function.arguments.length>20000)))throw new AgentError('AI_INVALID_RESPONSE',502);
  // Reasoning is replayed only to DeepSeek during a tool round; never persisted or sent to the client.
  return {message:{role:'assistant',content:m.content, ...(m.tool_calls?{tool_calls:m.tool_calls}:{}),...(typeof m.reasoning_content==='string'?{reasoning_content:m.reasoning_content}:{})},tokens:Number.isFinite(payload?.usage?.total_tokens)?Math.max(0,payload.usage.total_tokens):0};
 }};
}
