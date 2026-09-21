import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {setupServer} from 'msw/node';
import {handlers,resetMock} from '../mocks/handlers.js';
const server=setupServer(...handlers);server.listen({onUnhandledRequest:'error'});after(()=>server.close());
const get=(path:string)=>fetch('http://mock.fitstreak.test/api/'+path,{headers:{Authorization:'Bearer mock-session'}});
test('MSW normal contract has 7 zero-filled dates',async()=>{resetMock();const s=await(await get('stats?days=7')).json();assert.equal(s.data.series.length,7);assert.equal(s.data.minutes,150);});
test('MSW empty scenario returns no plans',async()=>{resetMock('empty');assert.deepEqual((await(await get('plans')).json()).data,[]);});
test('MSW error and unauthorized scenarios',async()=>{resetMock('error');assert.equal((await get('plans')).status,500);resetMock('unauthorized');assert.equal((await get('me')).status,401);});
