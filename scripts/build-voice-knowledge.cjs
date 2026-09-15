/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync, readdirSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { createHash } = require('node:crypto');

const START = '<!-- BEGIN:APP_KNOWLEDGE -->';
const END = '<!-- END:APP_KNOWLEDGE -->';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const text = (value, name, max = 700) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>]/.test(value)) fail(`不正な本文: ${name}`);
  return value;
};
const copy = (value, name) => ({ child: text(value?.child, `${name}.child`), adult: text(value?.adult, `${name}.adult`) });
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

// 使用する一行のメタデータのみ読む。本文のYAML/HTMLを実行・レンダリングしない。
function metadata(document, key) {
  const front = document.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  if (!front) fail('MDのメタデータがありません');
  const fields = front.split('\n').filter(line => line.startsWith(`${key}:`));
  if (fields.length !== 1) fail(`メタデータの欠落・重複: ${key}`);
  const value = fields[0].slice(key.length + 1).trim();
  try { return JSON.parse(value); } catch { return value; }
}

function parsePublication(document) {
  const starts = document.split(START).length - 1;
  const ends = document.split(END).length - 1;
  if (!starts && !ends) return null;
  if (starts !== 1 || ends !== 1) fail('掲載ブロックの重複・不正');
  const start = document.indexOf(START), end = document.indexOf(END);
  const block = document.slice(start + START.length, end).trim();
  const json = block.match(/^```json\n([\s\S]+)\n```$/)?.[1];
  if (!json || end < start) fail('掲載ブロックはJSON形式にしてください');
  return { publication: JSON.parse(json), sourceDocument: document.slice(0, start) + document.slice(end + END.length) };
}

function compileKnowledge(root, { fingerprints = false } = {}) {
  const contexts = JSON.parse(readFileSync(join(root, 'src/data/knowledge-contexts.json'), 'utf8'));
  const registry = readFileSync(join(root, 'knowledge/SOURCES.md'), 'utf8').replaceAll('\r\n', '\n');
  const rights = readFileSync(join(root, 'knowledge/voices/SOURCES.md'), 'utf8').replaceAll('\r\n', '\n');
  const sourceRows = new Map();
  for (const line of registry.split('\n')) {
    const id = line.match(/^\| (S-[A-Z0-9-]+) \|/)?.[1];
    if (id) { if (sourceRows.has(id)) fail(`出典IDの重複: ${id}`); sourceRows.set(id, line); }
  }
  const entries = [], ids = new Set(), noteIds = new Set(), episodeIds = new Set(), reviews = [];
  const directory = join(root, 'knowledge/voices');
  for (const file of readdirSync(directory).filter(file => /^voice-\d+-[a-z0-9-]+\.md$/.test(file)).sort()) {
    const document = readFileSync(join(directory, file), 'utf8').replaceAll('\r\n', '\n');
    const noteId = metadata(document, 'id');
    if (noteIds.has(noteId)) fail(`ノートIDの重複: ${noteId}`);
    noteIds.add(noteId);
    const status = metadata(document, 'publication_status');
    if (!['draft', 'approved', 'withdrawn'].includes(status)) fail(`${file}: 掲載状態が不正です`);
    if (status !== 'approved') continue;
    const parsed = parsePublication(document);
    if (!parsed) fail(`${file}: 掲載確認済みですが掲載ブロックがありません`);
    const { publication: pub, sourceDocument } = parsed;
    if (metadata(document, 'review_status') !== 'source_checked' || metadata(document, 'kind') !== 'testimony' || !date(metadata(document, 'checked_at'))) fail(`${file}: 原典が未確認です`);
    if (pub.schemaVersion !== 1 || pub.review?.status !== 'approved' || !date(pub.review?.reviewedAt) || !pub.review?.reviewedBy) fail(`${file}: 掲載文が未確認です`);
    if (!Array.isArray(pub.cards) || !pub.cards.length) fail(`${file}: カードがありません`);
    const sourceId = pub.source?.id;
    const sourceIds = metadata(document, 'source_ids');
    const sourceRow = sourceRows.get(sourceId);
    const url = new URL(pub.source?.url);
    if (url.protocol !== 'https:' || url.username || url.password || !Array.isArray(sourceIds) || !sourceIds.includes(sourceId) || !sourceRow?.includes(`](${url.href})`) || metadata(document, 'source_url') !== url.href) fail(`${file}: 出典リンクと台帳が一致しません`);
    const episode = metadata(document, 'source_episode_id');
    if (episodeIds.has(episode)) fail(`${file}: 同一エピソードの重複掲載`);
    episodeIds.add(episode);
    const noteHazards = metadata(document, 'hazards');
    const usedContexts = {};
    const cards = pub.cards.map(card => {
      if (!new RegExp(`^${noteId}-[a-z0-9-]+$`).test(card.id) || ids.has(card.id)) fail(`${file}: カードIDの不正・重複`);
      ids.add(card.id);
      if (!Array.isArray(card.factIds) || !card.factIds.length || card.factIds.some(id => !/^fact-\d+$/.test(id) || !new RegExp(`^### ${id}$`, 'm').test(sourceDocument))) fail(`${file}: 事実IDの参照切れ`);
      if (!Array.isArray(card.bindings) || !card.bindings.length) fail(`${file}: 関連先がありません`);
      const bindingIds = new Set();
      const bindings = card.bindings.map(binding => {
        const context = Object.hasOwn(contexts, binding.key) ? contexts[binding.key] : undefined;
        if (!context || !context.hazards.every(hazard => Array.isArray(noteHazards) && noteHazards.includes(hazard))) fail(`${file}: 教材の参照切れ・災害種別の不一致: ${binding.key}`);
        usedContexts[binding.key] = context;
        const choices = binding.choices ?? [];
        if (!Array.isArray(choices) || new Set(choices).size !== choices.length || choices.some(id => !context.choices.includes(id))) fail(`${file}: 選択肢の参照切れ`);
        const id = JSON.stringify([binding.key, [...choices].sort()]);
        if (bindingIds.has(id)) fail(`${file}: 関連付けの重複`);
        bindingIds.add(id);
        return { key: binding.key, choices, relation: copy(binding.relation, 'relation') };
      });
      return { id: card.id, noteId, episode, factIds: card.factIds, title: text(card.title, 'title', 100), summary: copy(card.summary, 'summary'), context: text(card.context, 'context'), limits: copy(card.limits, 'limits'), bindings,
        event: text(metadata(document, 'event_name'), 'event'), period: text(metadata(document, 'event_period'), 'period', 40), location: text(metadata(document, 'location'), 'location', 100),
        source: { id: sourceId, title: text(pub.source.title, 'source.title', 180), url: url.href, locator: text(card.locator, 'locator', 180) }, reviewedAt: pub.review.reviewedAt };
    });
    // 本文・出典台帳・利用条件・掲載文・関連する教材条件のどれを変更しても再確認する。
    const digest = hash(JSON.stringify([sourceDocument, pub.source, pub.cards, usedContexts, sourceRow, rights, pub.review.reviewedAt, pub.review.reviewedBy]));
    reviews.push({ file, digest });
    if (!fingerprints && pub.review.digest !== digest) fail(`${file}: 掲載確認後に内容が変わっています。原典・掲載文・対応先を再確認し、knowledge:fingerprints で確認値を更新してください`);
    entries.push(...cards);
  }
  return { data: { schemaVersion: 1, revision: hash(JSON.stringify([contexts, entries])).slice(0, 16), entries }, reviews };
}

if (require.main === module) {
  try {
    const root = process.cwd();
    const fingerprints = process.argv.includes('--fingerprints');
    const { data, reviews } = compileKnowledge(root, { fingerprints });
    if (fingerprints) { for (const review of reviews) process.stdout.write(`${review.file} ${review.digest}\n`); }
    else {
      const destination = join(root, 'src/data/generated/voice-knowledge.json');
      const output = JSON.stringify(data, null, 2) + '\n';
      if (process.argv.includes('--check')) {
        if (readFileSync(destination, 'utf8') !== output) fail('生成データが古くなっています。npm run knowledge:build を実行してください');
      } else { mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, output); }
      process.stdout.write(`被災者の声: ${data.entries.length}カードを検証（${data.revision}）\n`);
    }
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { compileKnowledge, parsePublication, START, END };
