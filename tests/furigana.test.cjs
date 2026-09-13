/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const mod = { exports: {} }; modules.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(p => p.startsWith('@/') ? load(path.resolve('src', p.slice(2) + '.ts')) : p.startsWith('.') ? load(path.resolve(path.dirname(file), p + '.ts')) : require(p), mod, mod.exports);
  return mod.exports;
}
test('学年に関係なく未注釈の漢字にも読みを付け、原文と指定読みを保持する', async () => {
  const { japaneseReadings } = load('src/lib/japanese-readings.ts');
  const text = '家族の安全を確認。 食器棚の上の重い箱を低い場所へ。地震[じしん]の後[あと]、机の下で脚を持つ。';
  const tokens = await japaneseReadings(text);
  assert.equal(tokens.map(t => t.text).join(''), text.replace(/\[[^\]]*\]/g, ''));
  assert.deepEqual(tokens.filter(t => /\p{Script=Han}/u.test(t.text) && !t.reading), []);
  for (const [word, reading] of [['家族','かぞく'], ['安全','あんぜん'], ['食器棚','しょっきだな'], ['後','あと']]) {
    assert.equal(tokens.find(t => t.text === word)?.reading, reading);
  }
});
test('ふりがなAPIは不正・過大な入力を拒否し、外部AIを呼ばず読みを返す', async () => {
  const { POST } = load('src/app/api/readings/route.ts');
  const request = body => new Request('http://localhost/api/readings', { method:'POST', body: JSON.stringify(body) });
  const original = global.fetch;
  global.fetch = () => { throw Error('外部APIへの送信は禁止'); };
  try {
    assert.equal((await POST(request({ texts:[null] }))).status, 400);
    assert.equal((await POST(request({ texts:['字'.repeat(3001)] }))).status, 400);
    assert.equal((await POST(request({ texts:Array(81).fill('字') }))).status, 400);
    assert.equal((await POST(request({ texts:['字'.repeat(40001)] }))).status, 413);
    const response = await POST(request({ texts:['部屋', '自分事'] }));
    assert.equal(response.status, 200);
    const { readings } = await response.json();
    assert.equal(readings[0][0].reading, 'へや');
    assert.equal(readings[1][0].reading, 'じぶんごと');
  } finally { global.fetch = original; }
});
