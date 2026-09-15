/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const mod = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(p => p.startsWith('@/') ? load(path.resolve('src',p.slice(2)+(p.endsWith('.json') ? '' : '.ts'))) : p.startsWith('.') ? load(path.resolve(path.dirname(file),p+'.ts')) : require(p),mod,mod.exports);
  return mod.exports;
}
const { POST } = load('src/app/api/room/analyze/route.ts');
const request = body => new Request('http://localhost/api/room/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('lightweight image settings reach the API and keep both references and verification', async () => {
  const { POST: aftermath } = load('src/app/api/room/aftermath/route.ts');
  const originalFetch = global.fetch;
  const keys = ['OPENAI_API_KEY', 'OPENAI_IMAGE_QUALITY', 'OPENAI_IMAGE_SIZE', 'OPENAI_MOCK_MODE'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    process.env.OPENAI_MOCK_MODE = 'false';
    for (const [quality, size, expectedQuality, expectedSize] of [
      ['low', '1152x768', 'low', '1152x768'], ['high', '1536x1024', 'high', '1536x1024'],
      ['invalid', '1x1', 'medium', '1536x1024'],
    ]) {
      process.env.OPENAI_IMAGE_QUALITY = quality;
      process.env.OPENAI_IMAGE_SIZE = size;
      let comparisons = 0;
      global.fetch = async (url, init) => {
        if (url.endsWith('/edits')) {
          assert.equal(init.body.get('quality'), expectedQuality);
          assert.equal(init.body.get('size'), expectedSize);
          assert.equal(init.body.getAll('image[]').length, 2);
          assert.equal(init.body.get('output_format'), 'jpeg');
          return Response.json({ data: [{ b64_json: 'AA==' }] });
        }
        comparisons++;
        return Response.json({ output_text: JSON.stringify({ comparable: true, structureChanged: true, inventedObjects: false, maskRevealed: false }) });
      };
      const response = await aftermath(request({ image: 'data:image/png;base64,AA==' }));
      assert.equal(comparisons, 1);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, 'room-image-mismatch');
    }
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
const detection = (overrides = {}) => ({
  viewIndex: 0, evidence: '横長の画面に枠とスタンドが見える',
  needsReview: true, reviewReason: 'スタンドで立つテレビの転倒への備えを確認する',
  name: 'テレビ受像機', adultName: 'テレビ受像機', kind: 'fall', objectType: 'tv',
  confidence: 0.9, bounds: { x: 20, y: 30, w: 40, h: 50 }, ...overrides,
});
test('photo analysis normalizes TV names and validates photo input', async () => {
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    global.fetch = async () => Response.json({output_text:JSON.stringify({risks:[detection()]})});
    const result = await POST(request({image:'data:image/jpeg;base64,AA=='}));
    assert.equal(result.status, 200);
    const { risks } = await result.json();
    assert.equal(risks[0].name, 'テレビ');
    assert.equal(risks[0].adultName, 'テレビ');
    assert.equal((await POST(request({image:'https://example.com/a.jpg'}))).status,400);
    delete process.env.OPENAI_API_KEY;
    assert.equal((await POST(request({image:'data:image/jpeg;base64,AA=='}))).status,503);
  } finally { global.fetch = originalFetch; if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test('明らかに実害の乏しい小物を返さず、割れ物や家具は保持する', async () => {
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    const excluded = [
      ['空の紙コップ', '机に小さな紙製の空容器がある', '少量の軽い紙製容器で、けがや閉塞につながる根拠がない'],
      ['ぬいぐるみ', '棚に小さな柔らかいぬいぐるみがある', '柔らかい小物が一つで通路をふさぐ配置ではない'],
    ].map(([name,evidence,reviewReason]) => detection({name,adultName:name,objectType:'elevated_objects',evidence,reviewReason,needsReview:false}));
    const kept = [detection(), ...[
      ['陶器のカップ', '机の端に陶器のカップがある', '落下して割れた破片への備えを確認する'],
      ['包丁', '刃が露出した包丁が台の端にある', '露出した刃の落下によるけがへの備えを確認する'],
      ['鉢植え', '背の高い棚の上に大きな鉢がある', '高い場所の鉢の落下への備えを確認する'],
    ].map(([name,evidence,reviewReason]) => detection({name,adultName:name,objectType:'elevated_objects',evidence,reviewReason}))];
    for (const rows of [[...excluded,...kept], excluded, []]) {
      global.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        const schema = body.text.format.schema.properties.risks.items;
        assert.ok(schema.required.includes('needsReview'));
        assert.ok(schema.required.includes('reviewReason'));
        return Response.json({output_text:JSON.stringify({risks:rows})});
      };
      const response = await POST(request({image:'data:image/jpeg;base64,AA=='}));
      assert.equal(response.status,200);
      const {risks,source} = await response.json();
      assert.equal(source,'ai');
      assert.deepEqual(risks.map(r=>r.name), rows.length > 2 ? ['テレビ','陶器のカップ','包丁','鉢植え'] : []);
      assert.ok(risks.every(r=>r.confirmed===false));
    }
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  }
});

test('masked full-size views reach the model separately and their local boxes round-trip to each photo', async () => {
  const { roomViewBounds, riskOnView, viewForRisk } = load('src/lib/room-views.ts');
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_VISION_MODEL;
  const views = [[960,540], [540,960], [960,720]].map(([w,h],i) => ({
    url: `data:image/jpeg;base64,${Buffer.from(`masked-frame-${i}`).toString('base64')}`,
    bounds: roomViewBounds(w,h,i,3),
  }));
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    process.env.OPENAI_VISION_MODEL = 'gpt-5.6-luna';
    let calls = 0;
    global.fetch = async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.equal(body.model, 'gpt-5.6-luna');
      const content = body.input.find(item => item.role === 'user').content;
      assert.deepEqual(content.filter(part => part.type === 'input_image').map(part => part.image_url), views.map(view => view.url));
      assert.ok(content.filter(part => part.type === 'input_image').every(part => part.detail === 'high'));
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.text.format.strict, true);
      assert.deepEqual(body.text.format.schema.properties.risks.items.properties.viewIndex.enum, [0,1,2]);
      return Response.json({ status: 'completed', output: [{type:'reasoning'}, {content:[{
        type: 'output_text', text: JSON.stringify({risks: views.map((_,viewIndex) => detection({viewIndex}))}),
      }]}] });
    };
    const response = await POST(request({views}));
    assert.equal(response.status, 200);
    const { risks, source } = await response.json();
    assert.equal(source, 'ai');
    assert.equal(calls, 1);
    assert.equal(risks.length, 3, 'same category does not collapse different furniture');
    risks.forEach((risk,i) => {
      assert.equal(viewForRisk(risk, views), i);
      const local = riskOnView(risk, views[i]);
      for (const [key,expected] of Object.entries(detection().bounds)) assert.ok(Math.abs(local.bounds[key] - expected) < 0.000001);
      assert.equal(risk.confirmed, false);
    });
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    if (model === undefined) delete process.env.OPENAI_VISION_MODEL; else process.env.OPENAI_VISION_MODEL = model;
  }
});

test('invalid views are rejected before provider calls', async () => {
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  const view = {url:'data:image/jpeg;base64,AA==',bounds:{x:0,y:0,w:100,h:100}};
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    global.fetch = async () => { throw new Error('must not call provider'); };
    for (const views of [null, [], Array(4).fill(view), [null], [{...view,url:'https://example.com/room.jpg'}],
      [{...view,bounds:{x:0,y:0,w:0,h:100}}], [{...view,bounds:{x:60,y:0,w:50,h:100}}],
      [{...view,bounds:{x:0,y:0,w:100,h:'100'}}], [{...view,url:`data:image/jpeg;base64,${'A'.repeat(8_000_000)}`}],
      [{...view,url:`data:image/jpeg;base64,${'A'.repeat(4_000_000)}`},{...view,url:`data:image/jpeg;base64,${'A'.repeat(4_000_000)}`}],
    ]) assert.equal((await POST(request({views}))).status, 400);
    for (const body of [null, [], {}, {image:'data:image/jpeg;base64,'}]) assert.equal((await POST(request(body))).status, 400);
    assert.equal((await POST(new Request('http://localhost', {method:'POST',body:'bad'}))).status,400);
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  }
});

test('unusable model output is not accepted as no objects or a made-up central marker', async () => {
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  const image = 'data:image/jpeg;base64,AA==';
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    const reply = risks => ({status:'completed',output_text:JSON.stringify({risks})});
    const badRows = [null, detection({viewIndex:1}), detection({viewIndex:0.5}), detection({viewIndex:undefined}),
      detection({bounds:undefined}), detection({bounds:{x:110,y:20,w:10,h:10}}), detection({bounds:{x:20,y:30,w:0,h:10}}),
      detection({name:' '}), detection({evidence:''}), detection({needsReview:undefined}),
      detection({needsReview:'false'}), detection({reviewReason:''}), detection({reviewReason:undefined}),
      detection({needsReview:false,bounds:{x:110,y:20,w:10,h:10}}), detection({confidence:null}), detection({confidence:1.1}),
      detection({objectType:'invented'}), detection({kind:'safe'})];
    for (const body of [null, {}, {output_text:'{}'}, {output_text:'null'},
      {...reply([]),status:'incomplete'}, {...reply([detection()]),status:'failed'},
      {output:[{content:[{type:'refusal',refusal:'no'}]}]}, reply(Array(9).fill(detection())),
      ...badRows.map(row => reply([row])),
    ]) {
      global.fetch = async () => Response.json(body);
      const response = await POST(request({image}));
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, 'invalid-openai-response');
    }
    global.fetch = async () => Response.json(reply([]));
    assert.deepEqual(await (await POST(request({image}))).json(), {risks:[],source:'ai'});
    global.fetch = async () => Response.json(reply([detection({confidence:0.2,bounds:{x:-5,y:90,w:20,h:30}})]));
    const {risks} = await (await POST(request({image}))).json();
    assert.deepEqual(risks[0].bounds,{x:0,y:90,w:15,h:10});
    assert.equal(risks[0].confidence,0.2, 'model confidence must not be inflated');
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  }
});

test('aftermath uses the submitted photo in an anime edit and handles generation failure', async () => {
  const { POST: aftermath } = load('src/app/api/room/aftermath/route.ts');
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    let sent;
    global.fetch = async (url, init) => {
      if (url.endsWith('/responses')) return Response.json({output_text:JSON.stringify({comparable:true,structureChanged:false,inventedObjects:false,maskRevealed:false})});
      assert.equal(url, 'https://api.openai.com/v1/images/edits');
      sent = init.body;
      return Response.json({ data: [{ b64_json: 'YW5pbWU=' }] });
    };
    const response = await aftermath(request({ image: 'data:image/png;base64,AA==' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).imageUrl, 'data:image/jpeg;base64,YW5pbWU=');
    const images = sent.getAll('image[]');
    assert.equal(images.length, 2);
    assert.equal(images[0].type, 'image/png');
    assert.deepEqual(Buffer.from(await images[0].arrayBuffer()), Buffer.from([0]));
    assert.equal(images[1].type, 'image/jpeg');
    assert.deepEqual(Buffer.from(await images[1].arrayBuffer()), fs.readFileSync('public/illustrations/room-style-reference.jpeg'));
    assert.match(sent.get('prompt'), /2枚目は画風だけ/);
    assert.match(sent.get('prompt'), /アニメ調を強く/);
    assert.match(sent.get('prompt'), /同じ視点/);
    assert.match(sent.get('prompt'), /推測・復元しない/);
    global.fetch = async () => new Response('', { status: 500 });
    assert.equal((await aftermath(request({ image: 'data:image/png;base64,AA==' }))).status, 502);
    assert.equal((await aftermath(request({ image: 'https://example.com/room.png' }))).status, 400);
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  }
});

test('aftermath targets confirmed objects and compares structure; mismatches are withheld without automatic regeneration', async () => {
  const {POST: aftermath} = load('src/app/api/room/aftermath/route.ts');
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  const quality = process.env.OPENAI_IMAGE_QUALITY;
  const image = 'data:image/png;base64,AA==';
  const objects = [{name:'壁掛けテレビ',type:'tv',mounted:true,bounds:{x:10,y:20,w:30,h:40}}];
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    delete process.env.OPENAI_IMAGE_QUALITY;
    for (const result of ['checked','mismatch','unavailable']) {
      const calls = [];
      global.fetch = async (url,init) => {
        calls.push(url);
        if (url.endsWith('/edits')) {
          assert.equal(init.body.get('quality'),'medium');
          assert.equal(init.body.has('input_fidelity'),false);
          assert.match(init.body.get('prompt'),/壁掛け・壁内のテレビは取り付け位置に維持/);
          assert.match(init.body.get('prompt'),/"x":10,"y":20,"w":30,"h":40/);
          return Response.json({data:[{b64_json:'AA=='}]});
        }
        const body = JSON.parse(init.body);
        assert.equal(body.store,false);
        assert.equal(body.text.format.strict,true);
        const images = body.input[1].content.filter(p=>p.type==='input_image');
        assert.deepEqual(images.map(p=>p.image_url),[image,'data:image/jpeg;base64,AA==']);
        if (result === 'unavailable') throw new Error('comparison offline');
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({comparable:true,structureChanged:result==='mismatch',inventedObjects:false,maskRevealed:false})}]}]});
      };
      const response = await aftermath(request({image,objects}));
      const body = await response.json();
      assert.equal(calls.length,2);
      assert.equal(response.headers.get('cache-control'),'no-store');
      if (result === 'mismatch') {
        assert.equal(response.status,502);
        assert.equal(body.error,'room-image-mismatch');
        assert.equal(body.imageUrl,undefined);
      } else {
        assert.equal(response.status,200);
        assert.equal(body.verification,result);
      }
    }
    global.fetch = async () => { throw new Error('bad input must not be sent'); };
    for (const input of [null, [], {image,objects:null}, {image,objects:Array(9).fill(objects[0])},
      {image,objects:[{...objects[0],type:'unknown'}]}, {image,objects:[{...objects[0],bounds:{x:90,y:0,w:20,h:20}}]}]) {
      assert.equal((await aftermath(request(input))).status,400);
    }
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    if (quality === undefined) delete process.env.OPENAI_IMAGE_QUALITY; else process.env.OPENAI_IMAGE_QUALITY = quality;
  }
});

test('unusable comparisons are never marked checked', async () => {
  const {checkAftermath} = load('src/lib/server/aftermath-image.ts');
  const originalFetch = global.fetch;
  try {
    for (const value of [{}, null, {output_text:'null'}, {output_text:'{}'},
      {status:'incomplete',output_text:JSON.stringify({comparable:true,structureChanged:false,inventedObjects:false,maskRevealed:false})},
      {output_text:JSON.stringify({comparable:false,structureChanged:false,inventedObjects:false,maskRevealed:false})}]) {
      global.fetch = async () => Response.json(value);
      assert.equal(await checkAftermath('original','generated',[],'test-only'),'unavailable');
    }
    global.fetch = async () => Response.json({output_text:JSON.stringify({comparable:true,structureChanged:false,inventedObjects:false,maskRevealed:true})});
    assert.equal(await checkAftermath('original','generated',[],'test-only'),'mismatch');
  } finally { global.fetch = originalFetch; }
});

test('temporary provider refusals recover once; quota, long Retry-After, timeout and malformed replies never trigger duplicate generation', async () => {
  const {POST: aftermath} = load('src/app/api/room/aftermath/route.ts');
  const originalFetch = global.fetch, originalTimeout = global.setTimeout;
  const key = process.env.OPENAI_API_KEY;
  const image = 'data:image/png;base64,AA==';
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    global.setTimeout = callback => { callback(); return 0; };
    for (const status of [429,503]) {
      let edits = 0;
      global.fetch = async (url, init) => {
        if (url.endsWith('/responses')) return Response.json({output_text:JSON.stringify({comparable:true,structureChanged:false,inventedObjects:false,maskRevealed:false})});
        edits++;
        assert.equal(init.body.get('output_format'),'jpeg');
        assert.equal(init.body.get('output_compression'),'85');
        if (edits === 1) return Response.json({error:{code:'rate_limit_exceeded'}},{status,headers:{'retry-after':'0'}});
        return Response.json({data:[{b64_json:'AA=='}]});
      };
      assert.equal((await aftermath(request({image}))).status,200);
      assert.equal(edits,2);
    }
    const failures = [
      [() => Response.json({error:{code:'insufficient_quota'}},{status:429}), 'openai-quota'],
      [() => Response.json({error:{type:'insufficient_quota'}},{status:429}), 'openai-quota'],
      [() => Response.json({error:{}},{status:429,headers:{'retry-after':'60'}}), 'openai-rate-limit'],
      [() => new Response('bad',{status:500}), 'openai-error'],
      [() => new Response('broken-json',{status:200}), 'invalid-openai-response'],
      [() => {throw new DOMException('timed out','TimeoutError');}, 'openai-timeout'],
      [() => {throw new TypeError('network error');}, 'openai-unreachable'],
    ];
    for (const [reply,error] of failures) {
      let calls = 0;
      global.fetch = async () => { calls++; return reply(); };
      const response = await aftermath(request({image}));
      assert.equal(response.status,502);
      assert.equal((await response.json()).error,error);
      assert.equal(calls,1,error);
    }
    let calls = 0;
    global.fetch = async () => { calls++; return Response.json({error:{}},{status:429,headers:{'retry-after':'0'}}); };
    assert.equal((await (await aftermath(request({image}))).json()).error,'openai-rate-limit');
    assert.equal(calls,2,'repeated refusal is bounded');
  } finally {
    global.fetch=originalFetch; global.setTimeout=originalTimeout;
    if(key===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=key;
  }
});

test('oversize payloads are rejected before provider work and unexpected large generated images before comparison', async () => {
  const {POST: aftermath} = load('src/app/api/room/aftermath/route.ts');
  const originalFetch=global.fetch, key=process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY='test-only';
    let calls=0;
    global.fetch=async()=>{calls++;return Response.json({data:[{b64_json:'A'.repeat(4_000_000)}]});};
    const oversized=await aftermath(request({image:'data:image/jpeg;base64,'+'A'.repeat(4_000_000)}));
    assert.equal(oversized.status,413);
    assert.equal(calls,0);
    const generated=await aftermath(request({image:'data:image/jpeg;base64,AA=='}));
    assert.equal((await generated.json()).error,'generated-image-too-large');
    assert.equal(calls,1);
  } finally {global.fetch=originalFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
