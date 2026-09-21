import {test} from 'node:test';
import assert from 'node:assert/strict';
test('FR-12 Chinese and English dictionaries contain the same nonempty keys',async()=>{
 (globalThis as any).uni={getStorageSync:()=>'',setStorageSync:()=>{}};
 const {dictionaries}=await import('../apps/web/src/lib/i18n.js');
 assert.deepEqual(Object.keys(dictionaries.zh).sort(),Object.keys(dictionaries.en).sort());
 for(const language of Object.values(dictionaries))for(const value of Object.values(language))assert.ok(typeof value==='string'&&value.trim());
});
