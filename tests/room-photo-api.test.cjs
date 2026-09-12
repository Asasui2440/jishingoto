/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const mod = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(p => p.startsWith('@/') ? load(path.resolve('src',p.slice(2)+'.ts')) : p.startsWith('.') ? load(path.resolve(path.dirname(file),p+'.ts')) : require(p),mod,mod.exports);
  return mod.exports;
}
const { POST } = load('src/app/api/room/analyze/route.ts');
const request = body => new Request('http://localhost/api/room/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('photo analysis normalizes TV names and validates photo input', async () => {
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    global.fetch = async () => Response.json({output_text:JSON.stringify({risks:[{name:'テレビ受像機',adultName:'テレビ受像機',kind:'fall',objectType:'tv'}]})});
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

test('aftermath uses the submitted photo in an anime edit and handles generation failure', async () => {
  const { POST: aftermath } = load('src/app/api/room/aftermath/route.ts');
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    let sent;
    global.fetch = async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/images/edits');
      sent = init.body;
      return Response.json({ data: [{ b64_json: 'YW5pbWU=' }] });
    };
    const response = await aftermath(request({ image: 'data:image/png;base64,AA==' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).imageUrl, 'data:image/png;base64,YW5pbWU=');
    assert.equal(sent.get('image').type, 'image/png');
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
