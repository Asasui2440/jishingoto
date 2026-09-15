/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let audience = 'child';
let savedStep = 0;
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)((p) => {
    if (/\.(jpg|png|webp)$/.test(p)) return { default: { src: p, width: 1536, height: 1024 } };
    if (p.endsWith('.module.css')) return { default: {} };
    if (p === 'next/navigation') return { useRouter: () => ({ push() {}, replace() {} }) };
    if (p === '@/lib/session') return { useSession: () => ({ answers: [], risks: [], questions: [], photoUrl: null, checked: [], resultStep: savedStep }), getSession: () => ({ finishedAt: 1 }), strengths: () => [], scoreByAxis: () => ({ initial: null, judgement: null, room: null, evacuation: null }) };
    if (p === '@/components/ui/Button') return { Button: ({ children, disabled }) => React.createElement('button', { disabled }, children) };
    if (p === '@/components/ui/Screen') return { StatusBar: () => null, DisclaimerFooter: () => null };
    if (p === '@/lib/settings') return { useSettings: () => ({ audience }) };
    if (p === 'next/image') return { default: (props) => React.createElement('img', props) };
    if (p === '@/components/ui/Card') return { Card: ({ children }) => React.createElement('section', null, children) };
    if (p === '@/components/ui/Furigana') return { Furigana: ({ text }) => React.createElement('span', null, text) };
    if (!p.startsWith('.') && !p.startsWith('@/')) return require(p);
    const base = p.startsWith('@/') ? path.resolve('src', p.slice(2)) : path.resolve(path.dirname(file), p);
    if (p.endsWith('.json')) return { default: JSON.parse(fs.readFileSync(base, 'utf8')) };
    return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
  }, mod, mod.exports);
  return mod.exports;
}
const { SafetyProducts } = load('src/components/SafetyProducts.tsx');
const risks = ['bookshelf', 'tv', 'window', 'cupboard', 'hanging_object'].map((objectType) => ({ id: objectType, name: objectType, objectType, kind: objectType === 'window' ? 'break' : 'fall', confirmed: true, x: 50, y: 50 }));
test('children see product illustrations and advice without any outbound product links', () => {
  audience = 'child';
  const html = renderToStaticMarkup(React.createElement(SafetyProducts, { risks }));
  assert.doesNotMatch(html, /<a\b|amazon\.co\.jp|メーカーのサイトへ/);
  assert.match(html, /お家/);
  for (const image of ['furniture-anchor', 'tv-belt', 'safety-film', 'cupboard-film', 'hanging-wire']) {
    assert(html.includes(`/illustrations/textbook/products/${image}-v1.webp`));
    assert(fs.existsSync(`public/illustrations/textbook/products/${image}-v1.webp`));
  }
});
test('adults retain manufacturer and shopping links next to illustrated advice', () => {
  audience = 'adult';
  const html = renderToStaticMarkup(React.createElement(SafetyProducts, { risks }));
  assert.match(html, /<a\b/);
  assert.match(html, /amazon\.co\.jp/);
  assert.match(html, /メーカーサイト/);
});

const { ActionReview } = load('src/components/ActionReview.tsx');
const { QUESTIONS } = load('src/lib/content.ts');
test('action review distinguishes safe, risky and timed-out answers without right/wrong labels', () => {
  const question = QUESTIONS[0];
  const safe = question.choices.find(c => c.safety >= 0.7);
  const risky = question.choices.find(c => c.safety < 0.4);
  const render = (choice, timedOut = false) => renderToStaticMarkup(React.createElement(ActionReview, { question, choice, timedOut, number: 1 }));
  assert.match(render(safe), /安全につながる行動を選べました/);
  assert.match(render(safe), /text-green-700/);
  assert.match(render(risky), /けがにつながるおそれがある行動/);
  assert.match(render(risky), /text-amber-900/);
  for (const choice of [safe, risky]) {
    const html = render(choice);
    const recall = html.slice(html.indexOf('aria-label="質問とあなたの回答"'), html.indexOf('</dl>'));
    assert(recall.includes(question.situation));
    assert(recall.includes(choice.label));
    if (choice.detail) assert(recall.includes(choice.detail));
    assert(recall.indexOf(question.situation) < recall.indexOf(choice.label));
    assert(html.indexOf('</dl>') < html.indexOf('<img'));
  }
  const timed = render(safe, true);
  assert.match(timed, /時間内に選べませんでした/);
  assert.match(timed, /時間切.*未回答/);
  const unanswered = timed.slice(timed.indexOf('aria-label="質問とあなたの回答"'), timed.indexOf('</dl>'));
  assert(!unanswered.includes(safe.label));
  assert.doesNotMatch(timed, /安全につながる行動を選べました|あなたが選んだ行動/);
  for (const html of [render(safe), render(risky), timed]) {
    assert.doesNotMatch(html, /正解|不正解|AI生成の説明用イラスト/);
    assert(html.includes(question.situation));
    assert(html.indexOf(question.situation) < html.indexOf("理由・注意点を読む"));
  }
});


const { default: SharePage } = load('src/app/share/page.tsx');
test('共有ページはLINEと成人用Xを表示し、保存用プレビューとボタンは出さない', () => {
  audience = 'child';
  const child = renderToStaticMarkup(React.createElement(SharePage));
  assert.doesNotMatch(child, /Xで共有|X・LINE|予想図を共有|SNS/);
  assert.match(child, /LINEで共有/);
  assert.doesNotMatch(child, /結果と予想図を1枚で保存|保存する画像|<img/);
  assert.match(child, /予想図も共有する/);
  assert.match(child, /jishingoto.vercel.app/);
  assert.doesNotMatch(child, /type="checkbox"[^>]*checked/);
  assert.match(child, /<button>.*?LINEで共有/);
  audience = 'adult';
  const adult = renderToStaticMarkup(React.createElement(SharePage));
  assert.match(adult, /Xで共有/);
  assert.match(adult, /LINEで共有/);
  assert.match(adult, /SNSでの共有/);
  assert.doesNotMatch(adult, /結果と予想図を1枚で保存|保存する画像|<img/);
  assert.match(adult, /共有する内容/);
  assert.doesNotMatch(adult, /画像2枚を共有する|が見つからない場合|共有先でLINEを選んで/);
});

const { default: ResultPage } = load('src/app/result/page.tsx');
test('result remount restores the saved final step after visiting share', () => {
  savedStep = 1;
  const html = renderToStaticMarkup(React.createElement(ResultPage));
  assert.match(html, /今日からできること/);
  assert.doesNotMatch(html, /行動の振り返り 1/);
  savedStep = 0;
});


test('情報の問題は拡散・確認・飛び出しに応じて振り返り、けがの共通文を使わない', () => {
  const question = QUESTIONS.find(q => q.id === 'q5');
  const expected = { share: '不安や混乱を広げるおそれ', verify: '情報の発信元を確かめる行動を選べました', panic: '投稿だけで判断せず' };
  for (const mode of ['child', 'adult']) {
    audience = mode;
    for (const choice of question.choices) {
      const html = renderToStaticMarkup(React.createElement(ActionReview, { question, choice, timedOut: false, number: 4 }));
      assert.ok(html.includes(expected[choice.id]));
      assert.doesNotMatch(html, /けがにつながるおそれがある行動|正解|不正解/);
      const timeout = renderToStaticMarkup(React.createElement(ActionReview, { question, choice, timedOut: true, number: 4 }));
      assert.match(timeout, /時間内に選べませんでした。情報の確かめ方を確認しましょう/);
      assert.doesNotMatch(timeout, /情報の発信元を確かめる行動を選べました|あなたが選んだ行動/);
    }
  }
});
