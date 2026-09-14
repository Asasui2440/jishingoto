/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/social-share.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod.exports);
const { quizShareText, APP_SHARE_URL, socialTextUrl } = mod.exports;

test('画像の有無によらずクイズの点数と公開アプリURLを共有する', () => {
  const scores = { initial: 3, judgement: 5, room: 2, evacuation: 4 };
  for (const mock of [false, true]) {
    const text = quizShareText(scores, mock);
    assert(text.startsWith("「ジシンゴト」 で部屋の安全をチェックしました！\n【行動クイズの結果】\n"));
    for (const value of ['初動対応：3/5点', '判断力：5/5点', '避難時の安全性：4/5点']) assert(text.includes(value));
    assert(!text.includes('2/5点'));
    assert.equal(text.includes('サンプル'), mock);
    for (const platform of ['X', 'LINE']) {
      const url = new URL(socialTextUrl(platform, text, APP_SHARE_URL));
      assert.equal(url.searchParams.get('text'), `${text}\n${APP_SHARE_URL}`);
      assert(!url.href.includes('localhost'));
    }
  }
});

test('未出題の軸に点数を捏造しない', () => {
  const text = quizShareText({ initial: 5, judgement: null, room: null, evacuation: null });
  assert(text.includes('初動対応：5/5点'));
  assert(!text.includes('判断力：'));
  assert(quizShareText({ initial: null, judgement: null, room: null, evacuation: null }).includes('未回答'));
});
