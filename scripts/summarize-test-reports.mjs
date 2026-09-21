// Keep useful test evidence without machine-specific paths or command arguments.
import {readFile,writeFile} from 'node:fs/promises';
for(const kind of ['e2e','live']){
 const path=`docs/test-results-${kind}.json`;
 const report=JSON.parse(await readFile(path,'utf8'));
 if(!report.suites)continue;
 const tests=[];
 function visit(suites){for(const s of suites){for(const spec of s.specs??[])for(const t of spec.tests??[])tests.push({title:spec.title,file:spec.file,status:t.status,results:t.results.map(r=>({status:r.status,durationMs:r.duration,errors:r.errors.map(e=>e.message)}))});visit(s.suites??[]);}}
 visit(report.suites);
 await writeFile(path,JSON.stringify({generatedAt:new Date().toISOString(),environment:{platform:process.platform,node:process.version},stats:report.stats,tests},null,2)+'\n');
}
