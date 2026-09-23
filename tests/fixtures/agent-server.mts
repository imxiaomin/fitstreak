import {buildApp} from '../../apps/api/src/app.js';
import {testTransport} from './deepseek.js';
import {database} from '../../apps/api/src/db.js';
// Isolated in-memory database and explicit mocked provider; no local .env is loaded.
const app=await buildApp({db:await database(),demo:true,requestLimit:1000,secret:'isolated-browser-agent-test-secret-32-characters',corsOrigin:'http://127.0.0.1:5175',agent:{apiKey:'test-only-key',transport:testTransport()}});
await app.listen({host:'127.0.0.1',port:3012});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
