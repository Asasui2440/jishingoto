import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Transpile the server module in memory; no network calls or real credentials.
const source = readFileSync(new URL('../src/lib/server/ai.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { parseRisks, readPhoto, analyzePhoto, createAftermath, withAi, errorResponse } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalEnabled = process.env.OPENAI_ENABLED;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnabled === undefined) delete process.env.OPENAI_ENABLED;
  else process.env.OPENAI_ENABLED = originalEnabled;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});
const risk = { id: 'r1', name: '本棚', kind: 'fall', x: 20, y: 30, confirmed: true };
const bytes = Buffer.from([255, 216, 255, 224]);
const photo = new File([bytes], 'room.jpg', { type: 'image/jpeg' });
function request(file = photo, origin = 'http://localhost:3000') {
  const body = new FormData(); body.set('photo', file);
  return new Request('http://localhost:3000/api/analyze', { method: 'POST', body, headers: { origin } });
}
test('accepts image multipart and rejects forged MIME', async () => {
  assert.equal((await readPhoto(request())).photo.type, 'image/jpeg');
  await assert.rejects(readPhoto(request(new File(['not an image'], 'a.jpg', { type: 'image/jpeg' }))), { status: 415 });
});
test('rejects cross-origin upload before AI', async () => {
  await assert.rejects(readPhoto(request(photo, 'https://another.example')), { status: 403 });
});
test('rejects oversized bodies even without content-length', async () => {
  const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
  await assert.rejects(readPhoto(request(big)), { status: 413 });
});
test('validates coordinates, duplicate IDs, kind and confirmation', () => {
  assert.deepEqual(parseRisks([risk]), [risk]);
  for (const invalid of [[{ ...risk, x: 101 }], [{ ...risk, y: NaN }], [risk, risk], [{ ...risk, kind: 'other' }], [{ ...risk, confirmed: 'yes' }], null]) {
    assert.throws(() => parseRisks(invalid), { status: 400 });
  }
});
test('missing API key fails without network', async () => {
  process.env.OPENAI_ENABLED = 'true';
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(withAi(() => { throw Error('must not run'); }), { status: 503 });
});
test('vision sends source image and never trusts AI confirmed or id', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.match(body.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
    return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ risks: [{ ...risk, id: 'untrusted', confidence: .9 }] }) }] }] });
  };
  const results = await analyzePhoto(photo, bytes);
  assert.equal(results[0].confirmed, false);
  assert.equal(results[0].id, 'risk-1');
});
test('refusal, incomplete and malformed model output are explicit errors', async () => {
  for (const result of [{ status: 'incomplete' }, { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }, { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{broken' }] }] }]) {
    globalThis.fetch = async () => Response.json(result);
    await assert.rejects(analyzePhoto(photo, bytes), { status: 502 });
  }
});
test('upstream error does not leak provider response or key', async () => {
  globalThis.fetch = async () => new Response('sensitive upstream body', { status: 401 });
  try { await analyzePhoto(photo, bytes); assert.fail('expected error'); }
  catch (error) {
    const response = errorResponse(error);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /sensitive/);
  }
});
test('aftermath edits the photo using only confirmed risks', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert.ok(init.body.get('image') instanceof File);
    assert.match(init.body.get('prompt'), /本棚/);
    assert.doesNotMatch(init.body.get('prompt'), /unconfirmed-object/);
    return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
  };
  const result = await createAftermath(photo, [risk, { ...risk, id: 'r2', name: 'unconfirmed-object', confirmed: false }]);
  assert.equal(result.imageUrl, 'data:image/jpeg;base64,aGVsbG8=');
  assert.deepEqual(result.events.map(e => e.riskId), ['r1']);
});
test('no confirmed risks avoids generation cost', async () => {
  globalThis.fetch = () => { throw Error('must not call'); };
  assert.deepEqual(await createAftermath(photo, []), { imageUrl: null, events: [] });
});
test('missing generated image is an error, not a silent success', async () => {
  globalThis.fetch = async () => Response.json({ data: [] });
  await assert.rejects(createAftermath(photo, [risk]), { status: 502 });
});
test('concurrency slots release after failures', async () => {
  process.env.OPENAI_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'test-only';
  let release;
  const blocker = new Promise(r => { release = r; });
  const a = withAi(() => blocker);
  const b = withAi(() => blocker);
  await assert.rejects(withAi(async () => null), { status: 429 });
  release(); await Promise.all([a, b]);
  await assert.rejects(withAi(async () => { throw new Error('failed'); }));
  assert.equal(await withAi(async () => 'ok'), 'ok');
});

test('paid AI disabled by default even with an API key', async () => {
  delete process.env.OPENAI_ENABLED;
  process.env.OPENAI_API_KEY = 'test-only';
  await assert.rejects(withAi(() => { throw Error('must not call'); }), { status: 503 });
});
