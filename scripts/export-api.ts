import {buildApp} from '../apps/api/src/app.js';
import {database} from '../apps/api/src/db.js';
import {writeFile,mkdir} from 'node:fs/promises';
async function main(){
 const app=await buildApp({db:await database(),secret:'contract-export-only-not-a-runtime-secret',demo:false});
 await mkdir('docs/api',{recursive:true});
 await writeFile('docs/api/openapi.json',JSON.stringify(app.swagger(),null,2)+'\n');
 await app.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
