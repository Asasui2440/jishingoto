/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/share-images.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod.exports);
const files = [new File(['room'], 'room.png', { type: 'image/png' }), new File(['result'], 'result.png', { type: 'image/png' })];
test('shares both prepared images and text; unsupported and cancellation never claim success', async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let sent;
  const navigator = { canShare: ({ files: candidate }) => candidate.length === 2, share: async data => { sent = data; } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator });
  try {
    assert.equal(await mod.exports.shareImages(files, 'test'), 'shared');
    assert.deepEqual(sent, { files, text: 'test' });
    sent = null;
    assert.equal(await mod.exports.shareImages([files[0]], 'test'), 'unsupported');
    assert.equal(sent, null);
    navigator.canShare = () => false;
    assert.equal(await mod.exports.shareImages(files, 'test'), 'unsupported');
    assert.equal(sent, null);
    navigator.canShare = () => true;
    navigator.share = async () => { throw new DOMException('cancelled', 'AbortError'); };
    assert.equal(await mod.exports.shareImages(files, 'test'), 'cancelled');
    navigator.share = async () => { throw new DOMException('denied', 'NotAllowedError'); };
    await assert.rejects(mod.exports.shareImages(files, 'test'), { name: 'NotAllowedError' });
  } finally {
    if (old) Object.defineProperty(globalThis, 'navigator', old);
    else delete globalThis.navigator;
  }
});
