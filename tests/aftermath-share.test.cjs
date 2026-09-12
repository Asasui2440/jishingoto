/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/aftermath-share.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports);
test('shared prediction preserves aspect ratio and embeds its AI label in the PNG', async () => {
  const originals = { Image: global.Image, document: global.document };
  const texts = [];
  let drawing;
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage(...args) { drawing = args; }, fillRect() {}, fillText(text) { texts.push(text); } }), toBlob(callback, mime) { assert.equal(mime, 'image/png'); callback(new Blob(['png'], { type: mime })); } };
  global.Image = class { naturalWidth = 3000; naturalHeight = 2000; async decode() {} };
  global.document = { createElement(tag) { assert.equal(tag, 'canvas'); return canvas; } };
  try {
    const file = await mod.exports.createAftermathShareFile('data:image/png;base64,test');
    assert.equal(file.name, 'jishingoto-ai-room.png');
    assert.equal(file.type, 'image/png');
    assert.equal(canvas.width, 1536);
    assert.equal(drawing[3] / drawing[4], 1.5);
    assert(canvas.height > drawing[4]);
    assert(texts.some(t => t.includes('AIによる予想図') && t.includes('実際の被害写真ではありません')));
  } finally { global.Image = originals.Image; global.document = originals.document; }
});
