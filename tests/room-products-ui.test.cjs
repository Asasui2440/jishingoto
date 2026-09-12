/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let audience = 'child';
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)((p) => {
    if (p === '@/lib/settings') return { useSettings: () => ({ audience }) };
    if (p === 'next/image') return { default: (props) => React.createElement('img', props) };
    if (p === '@/components/ui/Card') return { Card: ({ children }) => React.createElement('section', null, children) };
    if (p === '@/components/ui/Furigana') return { Furigana: ({ text }) => React.createElement('span', null, text) };
    if (!p.startsWith('.') && !p.startsWith('@/')) return require(p);
    const base = p.startsWith('@/') ? path.resolve('src', p.slice(2)) : path.resolve(path.dirname(file), p);
    return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
  }, mod, mod.exports);
  return mod.exports;
}
const { SafetyProducts } = load('src/components/SafetyProducts.tsx');
const risks = ['bookshelf', 'tv', 'window', 'cupboard', 'hanging_object'].map((objectType) => ({ id: objectType, name: objectType, objectType, kind: objectType === 'window' ? 'break' : 'fall', confirmed: true, x: 50, y: 50 }));
test('children see product illustrations and advice without any outbound product links', () => {
  audience = 'child';
  const html = renderToStaticMarkup(React.createElement(SafetyProducts, { risks }));
  assert.doesNotMatch(html, /<a\b|amazon\.co\.jp|メーカー仕様/);
  assert.match(html, /お家/);
  for (const image of ['furniture-anchor', 'tv-belt', 'safety-film', 'cupboard-film', 'hanging-wire']) {
    assert(html.includes(`/illustrations/products/${image}.png`));
    assert(fs.existsSync(`public/illustrations/products/${image}.png`));
  }
});
test('adults retain manufacturer and shopping links next to illustrated advice', () => {
  audience = 'adult';
  const html = renderToStaticMarkup(React.createElement(SafetyProducts, { risks }));
  assert.match(html, /<a\b/);
  assert.match(html, /amazon\.co\.jp/);
  assert.match(html, /メーカー仕様/);
});

const { ActionReview } = load('src/components/ActionReview.tsx');
const { QUESTIONS } = load('src/lib/content.ts');
test('action review distinguishes safe, risky and timed-out answers without right/wrong labels', () => {
  const question = QUESTIONS[0];
  const safe = question.choices.find(c => c.safety >= 0.7);
  const risky = question.choices.find(c => c.safety < 0.4);
  const render = (choice, timedOut = false) => renderToStaticMarkup(React.createElement(ActionReview, { question, choice, timedOut, number: 1 }));
  assert.match(render(safe), /安全につながる行動を選べました/);
  assert.match(render(risky), /けがにつながるおそれがある行動/);
  const timed = render(safe, true);
  assert.match(timed, /時間内に選べませんでした/);
  assert.doesNotMatch(timed, /安全につながる行動を選べました|あなたが選んだ行動/);
  for (const html of [render(safe), render(risky), timed]) {
    assert.doesNotMatch(html, /正解|不正解|AI生成の説明用イラスト/);
  }
});
