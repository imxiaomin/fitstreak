import {createServer} from 'node:http';
import {setupServer} from 'msw/node';
import {handlers,resetMock} from './handlers.js';
const interceptor=setupServer(...handlers);interceptor.listen({onUnhandledRequest:'error'});
const server=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const url=new URL(req.url??'/','http://127.0.0.1');
 if(url.pathname==='/__reset'){resetMock(url.searchParams.get('scenario')??'normal');res.end('ok');return;}
 if(url.pathname==='/health'){res.end('ok');return;}
 try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const r=await fetch('http://mock.fitstreak.test'+req.url,{method:req.method,headers:{'Content-Type':'application/json',Authorization:req.headers.authorization??''},...(['POST','PATCH'].includes(req.method??'')?{body:body.toString()||'{}'}:{})});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());}catch{res.writeHead(500);res.end(JSON.stringify({error:{code:'INTERNAL_ERROR'}}));}
});
const port=Number(process.env.PORT??3001);
server.listen(port,'127.0.0.1',()=>console.log('MSW mock API http://127.0.0.1:'+port));
process.on('SIGTERM',()=>server.close(()=>{interceptor.close();process.exit(0);}));
