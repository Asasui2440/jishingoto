/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function worker(fetcher){const handlers={};vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{self:{location:{origin:'https://example.test'},addEventListener:(type,handler)=>{handlers[type]=handler;}},URL,Response,AbortController,setTimeout,clearTimeout,fetch:fetcher});return handlers.fetch;}
function dispatch(handler,overrides={}){let result;handler({request:{url:'https://example.test/home',method:'GET',mode:'navigate',...overrides},respondWith:r=>{result=r;}});return result;}
test('入口はネットワーク優先で、通常応答・認証エラー・404を置き換えない',async()=>{
 for(const status of [200,401,403,404]){const response=new Response('page',{status});const result=await dispatch(worker(async()=>response));assert.equal(result,response);}
});
test('通信失敗とサーバー障害だけを保存マップへ転送する',async()=>{
 for(const fetcher of [async()=>{throw new TypeError('offline');},async()=>new Response('unavailable',{status:503})]){const result=await dispatch(worker(fetcher));assert.equal(result.status,302);assert.equal(result.headers.get('location'),'https://example.test/offline-evac/index.html?entry=offline');}
});
test('API・POST・RSC・外部リソース・保存マップは横取りしない',()=>{
 let requests=0;const handler=worker(async()=>{requests++;return new Response('unexpected');});
 for(const overrides of [{url:'https://example.test/api/evac/analyze'},{method:'POST'},{mode:'cors',url:'https://example.test/home?_rsc=abc'},{url:'https://other.test/'},{url:'https://example.test/offline-evac/index.html'}])assert.equal(dispatch(handler,overrides),undefined);
 assert.equal(requests,0);
});
