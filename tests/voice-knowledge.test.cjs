/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const { compileKnowledge, parsePublication, START, END } = require('../scripts/build-voice-knowledge.cjs');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
    const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
    const resolved = [base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    return load(resolved);
  }, mod, mod.exports);
  return mod.exports;
}
const { relatedVoices, roomVoiceRequest, walkVoiceRequest, triviaVoiceRequest } = load('src/lib/voice-knowledge.ts');
const { QUESTIONS } = load('src/lib/content.ts');
const { WALK_SCENARIOS } = load('src/lib/walk-scenarios.ts');
const information = QUESTIONS.find(q => q.id === 'q5');

test('同じ問題でも、情報確認と未確認の共有で優先する声が変わる', () => {
  const verifying = relatedVoices(roomVoiceRequest(information, 'verify', false));
  const sharing = relatedVoices(roomVoiceRequest(information, 'share', false));
  assert.equal(verifying[0].entry.noteId, 'VOICE-002');
  assert.equal(sharing[0].entry.noteId, 'VOICE-003');
  assert.equal(verifying[0].matchedChoice, true);
  assert.equal(sharing[0].matchedChoice, true);
  assert.equal(verifying[1].matchedChoice, false);
  assert.deepEqual(relatedVoices(roomVoiceRequest({ ...information, choices: [...information.choices].reverse() }, 'verify', false)), verifying);
});

test('時間切れと未知の選択は行動に一致させず、テーマの資料へ戻る', () => {
  for (const [choice, timedOut] of [['verify', true], ['not-an-answer', false]]) {
    const matches = relatedVoices(roomVoiceRequest(information, choice, timedOut));
    assert.equal(matches[0].entry.noteId, 'VOICE-003');
    assert.ok(matches.every(match => !match.matchedChoice));
  }
  assert.deepEqual(relatedVoices(roomVoiceRequest(QUESTIONS.find(q => q.id === 'q2'), 'wait', false)), []);
  assert.deepEqual(relatedVoices(null), []);
});

test('題材の災害・時点・画面が違えば、IDが同じでも資料を返さない', () => {
  const request = roomVoiceRequest(information, 'share', false);
  for (const patch of [{ hazard: 'flood' }, { phase: 'during' }, { surface: 'walk' }, { key: 'constructor' }]) {
    assert.deepEqual(relatedVoices({ ...request, ...patch }), []);
  }
  const flooded = WALK_SCENARIOS.find(s => s.number === 8).event;
  assert.equal(relatedVoices(walkVoiceRequest(flooded, 'flood', 'go', false))[0].entry.noteId, 'VOICE-011');
  assert.deepEqual(relatedVoices(walkVoiceRequest(flooded, 'earthquake', 'go', false)), []);
  assert.deepEqual(relatedVoices(triviaVoiceRequest('tip.food-stock')), []);
  assert.ok(relatedVoices(triviaVoiceRequest('tip.furniture-layout')).every(match => !match.matchedChoice));
});

test('動的な室内問題へ固定キーを付け、確認済みの選択肢と一致させる', async () => {
  const { fetchQuestions } = load('src/lib/api.ts');
  const risk = (id, objectType, kind) => ({ id, objectType, kind, name: id, x: 30, y: 40, confidence: 1, confirmed: true });
  const questions = await fetchQuestions([risk('desk-test', 'desk', 'fall'), risk('door-test', 'doorway', 'block')], 'home', () => 0);
  const desk = questions.find(q => q.knowledgeKey === 'room.desk.during');
  const floor = questions.find(q => q.knowledgeKey === 'room.floor.after');
  assert.ok(desk && floor);
  assert.equal(relatedVoices(roomVoiceRequest(desk, 'under-desk', false))[0].entry.id, 'VOICE-001-desk');
  assert.equal(relatedVoices(roomVoiceRequest(floor, 'clear-exit', false))[0].matchedChoice, true);
  const contexts = load('src/data/knowledge-contexts.json');
  for (const question of [...questions, ...QUESTIONS]) {
    const context = contexts[question.knowledgeKey ?? question.id];
    if (context) assert.deepEqual([...context.choices].sort(), question.choices.map(c => c.id).sort());
  }
  for (const item of WALK_SCENARIOS) {
    const context = contexts[item.event.id];
    if (context) assert.deepEqual([...context.choices].sort(), item.event.choices.map(c => c.id).sort());
  }
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jishingoto-voice-'));
  fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
  fs.cpSync('knowledge', path.join(root, 'knowledge'), { recursive: true });
  fs.copyFileSync('src/data/knowledge-contexts.json', path.join(root, 'src/data/knowledge-contexts.json'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const firstFile = 'knowledge/voices/voice-001-books-after-shaking.md';
function editPublication(root, update) {
  const file = path.join(root, firstFile);
  const raw = fs.readFileSync(file, 'utf8');
  const { publication } = parsePublication(raw);
  update(publication);
  fs.writeFileSync(file, raw.slice(0, raw.indexOf(START)) + START + '\n```json\n' + JSON.stringify(publication, null, 2) + '\n```\n' + END + raw.slice(raw.indexOf(END) + END.length));
}

test('MDから生成したデータが現行の配信用JSONと一致し、属性や非掲載本文を含まない', () => {
  const { data } = compileKnowledge(process.cwd());
  assert.deepEqual(data, load('src/data/generated/voice-knowledge.json'));
  assert.equal(new Set(data.entries.map(entry => entry.noteId)).size, 6);
  assert.equal(data.entries.length, 7);
  const serialized = JSON.stringify(data);
  for (const field of ['attributes', 'behavior_analysis', 'co_residents', 'gender_as_published']) assert.equal(serialized.includes(field), false);
});

test('本文・掲載文・関連先・出典の改訂は掲載確認を失効させる', t => {
  const root = fixture(t);
  const file = path.join(root, firstFile), original = fs.readFileSync(file, 'utf8');
  fs.appendFileSync(file, '\n原典再確認が必要な追記\n');
  assert.throws(() => compileKnowledge(root), /掲載確認後/);
  fs.writeFileSync(file, original);
  editPublication(root, pub => { pub.cards[0].summary.child = '確認していない新しい掲載文'; });
  assert.throws(() => compileKnowledge(root), /掲載確認後/);
  fs.writeFileSync(file, original);
  editPublication(root, pub => { pub.cards[0].bindings[0].relation.child = '確認していない関連理由'; });
  assert.throws(() => compileKnowledge(root), /掲載確認後/);
  fs.writeFileSync(file, original);
  const sources = path.join(root, 'knowledge/SOURCES.md');
  fs.writeFileSync(sources, fs.readFileSync(sources, 'utf8').replace('固定していた本棚から本飛び出し、山のよう', '原典の改訂された見出し'));
  assert.throws(() => compileKnowledge(root), /掲載確認後/);
});

test('下書きと取り下げを除外し、掲載確認済みの参照切れは公開を止める', t => {
  const root = fixture(t);
  const file = path.join(root, firstFile), original = fs.readFileSync(file, 'utf8');
  for (const status of ['draft', 'withdrawn']) {
    fs.writeFileSync(file, original.replace('publication_status: "approved"', `publication_status: "${status}"`));
    assert.ok(compileKnowledge(root).data.entries.every(entry => entry.noteId !== 'VOICE-001'));
    fs.appendFileSync(file, '\n<!-- BEGIN:APP_KNOWLEDGE -->\n編集中の未完了ブロック');
    assert.ok(compileKnowledge(root).data.entries.every(entry => entry.noteId !== 'VOICE-001'));
  }
  fs.writeFileSync(file, original);
  editPublication(root, pub => { pub.cards[0].factIds = ['fact-999']; });
  assert.throws(() => compileKnowledge(root), /事実IDの参照切れ/);
  fs.writeFileSync(file, original);
  editPublication(root, pub => { pub.cards[0].bindings[0].key = 'missing-key'; });
  assert.throws(() => compileKnowledge(root), /教材の参照切れ/);
  fs.writeFileSync(file, original);
  editPublication(root, pub => { pub.source.url = 'javascript:alert(1)'; });
  assert.throws(() => compileKnowledge(root), /出典リンク/);
});
