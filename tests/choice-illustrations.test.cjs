/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  new Function("require", "module", "exports", ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText)(p => load(path.resolve(path.dirname(file), `${p}.ts`)), mod, mod.exports);
  return mod.exports;
}
const { fetchQuestions } = load("src/lib/api.ts");
const { choiceIllustration, choiceIllustrationPath } = load("src/lib/choice-illustrations.ts");

test("every playable phase-one choice has an existing illustration, stable after shuffling", async () => {
  const kinds = ["desk", "window", "bookshelf", "cupboard", "doorway", "loose_objects", "tv", "bed", "hanging_object", "elevated_objects", "other"];
  const risks = kinds.map(objectType => ({ id: objectType, name: objectType === "other" ? "コンロ" : objectType, objectType,
    kind: objectType === "window" ? "break" : objectType === "doorway" ? "block" : "fall", confirmed: true, x: 50, y: 50 }));
  const fixtures = [[], risks, ...risks.map(r => [r])];
  const seen = { child: new Set(), adult: new Set() };
  const checkedFiles = new Set();
  for (const audience of ["child", "adult"]) for (const fixture of fixtures) for (let seed = 1; seed <= 30; seed++) {
    let n = Math.imul(seed, 2654435761) >>> 0;
    const random = () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const q of await fetchQuestions(fixture, "home", random, audience)) {
      const pictures = new Set();
      for (const c of q.choices) {
        const art = choiceIllustration(q, c);
        assert(art, `${audience}: ${q.id} / ${c.id}`);
        assert.deepEqual(choiceIllustration({ ...q, choices: [...q.choices].reverse() }, c), art);
        const key = `${art.sheet}:${art.slot}`;
        pictures.add(key);
        seen[audience].add(audience === "adult" ? key : c.id);
        const file = `public${choiceIllustrationPath(art)}`;
        if (!checkedFiles.has(file)) {
          assert(fs.statSync(file).size > 100, file);
          checkedFiles.add(file);
        }
      }
      assert.equal(pictures.size, q.choices.length, `different actions must not share one picture: ${q.id}`);
    }
  }
  assert.equal(seen.adult.size, 40);
  assert.equal(seen.child.size, 33);
  assert.equal(checkedFiles.size, 12);
});

test("unknown future choices do not silently receive a misleading illustration", () => {
  const c = { id: "future-action", safety: 1 };
  assert.equal(choiceIllustration({ choices: [c] }, c), undefined);
  assert.equal(choiceIllustration({ challenge: {}, choices: [c] }, c), undefined);
});
