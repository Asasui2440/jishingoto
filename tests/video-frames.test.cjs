/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(p => p.startsWith('@/') ? load(path.resolve('src', p.slice(2) + '.ts')) : p.startsWith('.') ? load(path.resolve(path.dirname(file), p + '.ts')) : require(p), mod, mod.exports);
  return mod.exports;
}
const { frameTimes, frameWindows, frameSharpness, selectedFrameIndices, composeRoomViews } = load('src/lib/video-frames.ts');
test('候補は動画全体から最大8枚、端の空フレームを避ける', () => {
  for (const duration of [1, 2, 10, 15, 30, 60]) {
    const times = frameTimes(duration);
    assert.ok(times.length >= 2 && times.length <= 8);
    assert.ok(times.every((t, i) => t > 0 && t < duration && (!i || times[i - 1] < t)));
    assert.equal(times[0] + times.at(-1), duration);
  }
  for (const duration of [0, 0.5, 60.01, 61, Infinity, NaN]) assert.throws(() => frameTimes(duration));
});
test('AIの範囲外・重複・空の選択を拒否し、1〜3枚だけ受け付ける', async () => {
  assert.deepEqual(selectedFrameIndices([2, 0, 7], 8), [2, 0, 7]);
  for (const result of [[], [0,0], [8], [-1], [1.5], ['1'], [0,1,2,3], null]) assert.throws(() => selectedFrameIndices(result, 8));
  await assert.rejects(composeRoomViews([]));
  assert.equal(await composeRoomViews(['masked-photo']), 'masked-photo');
});
test('選択APIは受け取った候補だけを転送し、失敗を成功扱いしない', async () => {
  const { POST } = load('src/app/api/room/select-frames/route.ts');
  const original = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  const frames = ['data:image/jpeg;base64,YQ==', 'data:image/jpeg;base64,Yg==', 'data:image/jpeg;base64,Yw=='];
  const request = body => new Request('http://localhost/api/room/select-frames', { method: 'POST', body: JSON.stringify(body) });
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    let calls = 0;
    global.fetch = async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.deepEqual(body.input[0].content.filter(c => c.type === 'input_image').map(c => c.image_url), frames);
      return Response.json({ output: [{ content: [{ type: 'output_text', text: '{"indices":[2,0]}' }] }] });
    };
    assert.deepEqual(await (await POST(request({ frames }))).json(), { indices: [2,0], source: 'ai' });
    assert.equal(calls, 1);
    for (const bad of [[], [frames[0]], Array(9).fill(frames[0]), ['https://example.com/x',frames[0]], [null,frames[0]]]) {
      assert.equal((await POST(request({frames:bad}))).status,400);
    }
    assert.equal(calls,1);
    assert.equal((await POST(new Request('http://localhost', {method:'POST',body:'bad'}))).status,400);
    assert.equal((await POST(request({ frames: ['x'.repeat(4_000_001)] }))).status,413);
    global.fetch = async () => Response.json({ output_text: '{"indices":[9]}' });
    assert.equal((await POST(request({frames}))).status,502);
    global.fetch = async () => new Response('',{status:401});
    let result = await POST(request({frames}));
    assert.equal(result.status,502); assert.equal((await result.json()).code,'openai-auth');
    for (const [status,code] of [[403,'openai-permission'],[429,'openai-rate-limit'],[400,'openai-request'],[500,'openai-upstream']]) {
      global.fetch=async()=>new Response('',{status});
      result=await POST(request({frames})); assert.equal((await result.json()).code,code);
    }
    global.fetch=async()=>{throw new DOMException('timeout','TimeoutError')};
    assert.equal((await (await POST(request({frames}))).json()).code,'openai-timeout');
    global.fetch=async()=>{throw new TypeError('fetch failed')};
    assert.equal((await (await POST(request({frames}))).json()).code,'openai-connection');
    global.fetch=async()=>Response.json({output_text:'{"indices":[99]}'});
    assert.equal((await (await POST(request({frames}))).json()).code,'invalid-selection');
    delete process.env.OPENAI_API_KEY;
    assert.equal((await POST(request({frames}))).status,503);
  } finally { global.fetch = original; if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test('各時間帯で5枚比較し、鮮明な輪郭をぼけた画像より優先する', () => {
  const windows = frameWindows(15);
  assert.equal(windows.length, 8);
  assert.ok(windows.every(w => w.length === 5));
  const times = windows.flat();
  assert.ok(times.every((t, i) => t > 0 && t < 15 && (!i || times[i - 1] < t)));
  const w = 32, h = 32;
  const sharp = new Uint8ClampedArray(w * h * 4);
  const soft = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const hard = x < 16 ? 40 : 210;
    const blurred = Math.max(40, Math.min(210, 40 + (x - 8) * 170 / 16));
    sharp.set([hard, hard, hard, 255], i);
    soft.set([blurred, blurred, blurred, 255], i);
  }
  assert.ok(frameSharpness(sharp, w, h) > frameSharpness(soft, w, h) * 10);
  assert.equal(frameSharpness(new Uint8ClampedArray(w * h * 4), w, h), 0);
});

test('一覧の枠を対応する1枚の写真へ変換し、番号は維持する', () => {
  const { roomViewBounds, viewForRisk, riskOnView } = load('src/lib/room-views.ts');
  const views = [[640,480], [480,640], [1280,720]].map(([w,h],i)=>({url:`masked-${i}`,bounds:roomViewBounds(w,h,i,3)}));
  views.forEach((view,i)=>{
    const b=view.bounds;
    const risk={id:`risk-${i}`,name:'棚',kind:'fall',x:b.x+b.w*0.5,y:b.y+b.h*0.5,bounds:{x:b.x+b.w*0.2,y:b.y+b.h*0.3,w:b.w*0.4,h:b.h*0.5}};
    assert.equal(viewForRisk(risk,views),i);
    const projected=riskOnView(risk,view);
    assert.equal(projected.id,risk.id);
    for(const [key,value] of Object.entries({x:20,y:30,w:40,h:50}))assert.ok(Math.abs(projected.bounds[key]-value)<0.0001);
    assert.ok(Math.abs(projected.x-50)<0.0001);
  });
  assert.deepEqual(roomViewBounds(500,800,0,1),{x:0,y:0,w:100,h:100});
  assert.equal(viewForRisk(undefined,views),0);
});

test('同じ写真の1番と8番が隣り合い、写真ごとに連続した番号になる', () => {
  const { roomViewBounds, groupRisksByView, viewForRisk } = load('src/lib/room-views.ts');
  const views = [0,1,2].map(i => ({url:`photo-${i}`,bounds:roomViewBounds(640,480,i,3)}));
  const make = (id, view) => { const b=views[view].bounds; return {id,name:id,kind:'fall',x:b.x+b.w/2,y:b.y+b.h/2}; };
  const risks=[make('1',0),make('2',1),make('3',2),make('4',1),make('5',2),make('6',1),make('7',2),make('8',0)];
  const grouped=groupRisksByView(risks,views);
  assert.deepEqual(grouped.map(r=>r.id),['1','8','2','4','6','3','5','7']);
  assert.deepEqual(grouped.map(r=>viewForRisk(r,views)),[0,0,1,1,1,2,2,2]);
  assert.deepEqual(risks.map(r=>r.id),['1','2','3','4','5','6','7','8']);
  assert.deepEqual(groupRisksByView(grouped,views),grouped);
  assert.equal(groupRisksByView(risks,[]),risks);
  assert.equal(groupRisksByView(risks,[views[0]]),risks);
});
