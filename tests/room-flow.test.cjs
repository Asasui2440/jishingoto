/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Exercise the pure TypeScript modules without introducing a test runtime dependency.
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (p) => load(path.resolve(path.dirname(file), `${p}.ts`)), mod, mod.exports,
  );
  return mod.exports;
}
const { fetchQuestions } = load("src/lib/api.ts");
const { safetyProductsFor } = load("src/lib/recommendations.ts");
const risk = (objectType, kind = "fall", confirmed = true) => ({ id: objectType, name: "対象", adultName: "対象物", objectType, kind, confirmed, x: 50, y: 50 });

test("every current room quiz has a matching safe-action review illustration", async () => {
  const { reviewIllustration } = load("src/lib/review-illustrations.ts");
  for (const fixtures of [[], [risk("bookshelf")], [risk("window", "break")], [risk("desk")], [risk("elevated_objects")], [risk("doorway", "block")]]) {
    const qs = await fetchQuestions(fixtures);
    for (const q of qs) {
      const scene = reviewIllustration(q);
      assert(scene, `missing illustration for ${q.id}`);
      assert(["shelter", "protect-head", "safe-exit", "check-information"].includes(scene.image));
      if (q.id === "q2") assert.match(scene.headline, /火/);
      if (q.phase === "after") assert.match(scene.timing, /収ま/);
    }
  }
  assert.equal(reviewIllustration({ choices: [] }), null);
  assert.equal(reviewIllustration({ choices: [{ id: "unknown-future-choice", safety: 1 }] }), null);
});

test("fixture mode performs no API calls, measures simulated delays, and resets to live", async () => {
  const { setRoomTestOptions, roomTimings } = load("src/lib/room-test.ts");
  const { prepareRoom, prepareAftermath, clearRoomPreparation } = load("src/lib/room-preparation.ts");
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("fixture must not fetch"); };
  setRoomTestOptions({ mode: "fixture", analysisMs: 10, imageMs: 30 });
  clearRoomPreparation();
  try {
    const photo = "/figma/img/room-risk.jpg";
    const analysis = await prepareRoom(photo);
    const image = await prepareAftermath(photo, analysis.risks);
    assert.equal(calls, 0);
    assert.equal(analysis.source, "demo");
    assert.equal(image.source, "test");
    assert.equal(image.imageUrl, photo);
    const t = roomTimings();
    assert.equal(t.mode, "fixture");
    assert(t.analysis.end - t.analysis.start >= 5);
    assert(t.image.end - t.image.start >= 20);
    assert(t.analysis.ok && t.image.ok);
  } finally {
    setRoomTestOptions({ mode: "live", analysisMs: 0, imageMs: 0 });
    clearRoomPreparation();
    global.fetch = originalFetch;
  }
});

test("elevated objects never get a floor-scatter question; furniture advice is specific", async () => {
  const { roomAdvice, EXIT_EXPLANATION } = load("src/lib/room-guidance.ts");
  const { aftermathEvents } = load("src/lib/api.ts");
  for (const item of [risk("elevated_objects", "block"), { ...risk("loose_objects", "block"), name: "棚の上のもの" }]) {
    const qs = await fetchQuestions([item]);
    const q = qs.find((q) => q.sourceRiskId === item.id);
    assert.equal(q.phase, "during");
    assert.match(q.adultSituation, /棚から落ち/);
    assert.doesNotMatch(q.adultSituation, /散乱/);
    assert.match(aftermathEvents([item])[0].adultText, /床/);
  }
  assert.match(roomAdvice(risk("cupboard")).detail, /閉めるだけでは/);
  assert.match(roomAdvice(risk("tv")).detail, /滑り止め/);
  assert.match(roomAdvice(risk("bookshelf")).headline, /本/);
  assert.match(roomAdvice(risk("bed")).detail, /非常用の靴/);
  assert.match(EXIT_EXPLANATION.join(""), /靴下だけでは/);
  assert.match(EXIT_EXPLANATION.join(""), /安全に近づけるなら扉/);
});

test("masked photo starts image generation before analysis resolves; edits reuse the image", async () => {
  const { prepareRoom, prepareAftermath, preparedAftermath, clearRoomPreparation } = load("src/lib/room-preparation.ts");
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = (url, init) => new Promise((resolve) => requests.push({ url, body: JSON.parse(init.body), resolve }));
  clearRoomPreparation();
  try {
    const photo = "data:image/jpeg;base64,bWFza2Vk";
    const analysis = prepareRoom(photo);
    assert.equal(prepareRoom(photo), analysis);
    assert.deepEqual(requests.map((r) => r.url), ["/api/room/aftermath", "/api/room/analyze"]);
    assert.deepEqual(requests[0].body, { image: photo });
    requests[1].resolve(Response.json({ risks: [risk("bookshelf")] }));
    await analysis;
    const edited = [{ ...risk("window", "break"), name: "修正した窓" }];
    const result = prepareAftermath(photo, edited);
    assert.equal(requests.length, 2);
    requests[0].resolve(Response.json({ imageUrl: "data:image/png;base64,aW1hZ2U=" }));
    assert.equal((await result).events[0].riskId, "window");
    assert.equal(preparedAftermath(photo, edited).events[0].riskId, "window");
    assert.equal((await prepareAftermath(photo, [])).events.length, 0);
    assert.equal(requests.length, 2);
    clearRoomPreparation();
    assert.equal(preparedAftermath(photo, edited), null);
    const next = prepareRoom(photo);
    assert.equal(requests.length, 4);
    requests[2].resolve(Response.json({ error: "failed" }, { status: 502 }));
    requests[3].resolve(Response.json({ risks: [] }));
    await next;
    assert.equal((await prepareAftermath(photo, [])).source, "preview");
  } finally {
    clearRoomPreparation();
    global.fetch = originalFetch;
  }
});

test("old image completion cannot replace a new photo's cached result", async () => {
  const { prepareAftermath, preparedAftermath, clearRoomPreparation } = load("src/lib/room-preparation.ts");
  const originalFetch = global.fetch;
  const pending = [];
  global.fetch = () => new Promise((resolve) => pending.push(resolve));
  clearRoomPreparation();
  try {
    const old = prepareAftermath("data:image/png;base64,b2xk", []);
    const current = prepareAftermath("data:image/png;base64,bmV3", []);
    pending[1](Response.json({ imageUrl: "new" }));
    await current;
    pending[0](Response.json({ imageUrl: "old" }));
    await old;
    assert.equal(preparedAftermath("data:image/png;base64,bmV3", []).imageUrl, "new");
    assert.equal(preparedAftermath("data:image/png;base64,b2xk", []), null);
  } finally {
    clearRoomPreparation();
    global.fetch = originalFetch;
  }
});

test("number navigation focuses the description and scrolls without animation", () => {
  const { focusDescription } = load("src/lib/focus-description.ts");
  const originalDocument = global.document;
  const calls = [];
  global.document = { getElementById: (id) => id === "description" ? {
    focus: (options) => calls.push(["focus", options]),
    scrollIntoView: (options) => calls.push(["scroll", options]),
  } : null };
  try {
    focusDescription("missing");
    focusDescription("description");
    assert.deepEqual(calls, [["focus", { preventScroll: true }], ["scroll", { block: "start", behavior: "instant" }]]);
  } finally {
    global.document = originalDocument;
  }
});

test("all room combinations follow during → after, including zero confirmed risks", async () => {
  const fixtures = [[], [risk("doorway", "block")], [risk("bookshelf", "fall", false)]];
  for (const type of ["bookshelf", "tall_furniture", "tv", "window", "doorway", "hanging_object", "desk", "bed", "loose_objects", "other"]) {
    fixtures.push([risk(type, type === "window" ? "break" : type === "doorway" ? "block" : "fall")]);
  }
  fixtures.push([risk("doorway", "block"), risk("window", "break"), risk("bookshelf"), risk("bed")]);
  for (const risks of fixtures) {
    const qs = await fetchQuestions(risks);
    assert(qs.length >= 4 && qs.length <= 5);
    assert.equal(qs[0].phase, "during");
    assert.equal(qs.at(-1).phase, "after");
    let after = false;
    for (const q of qs) {
      if (q.phase === "after") after = true;
      if (after) assert.equal(q.phase, "after");
      assert.notEqual(q.axis, "room");
      if (q.sourceRiskId && q.phase === "after") assert.match(q.adultSituation, /^揺れが収まりました/);
    }
    assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
  }
});

test("purchase candidates require confirmed, identifiable, matching objects", () => {
  assert.deepEqual(safetyProductsFor([risk("bookshelf", "fall", false)]), []);
  for (const r of [risk("doorway", "block"), risk("other"), risk("bed"), risk("loose_objects"), risk("window", "fall")]) assert.deepEqual(safetyProductsFor([r]), []);
  assert.equal(safetyProductsFor([risk("bookshelf")])[0].id, "furniture-anchor");
  assert.equal(safetyProductsFor([risk("window", "break")])[0].id, "safety-film");
  assert.equal(safetyProductsFor([risk("tv")])[0].id, "tv-belt");
});
