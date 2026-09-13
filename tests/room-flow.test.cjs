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

test("short earthquake audio schedules volume changes within the sound duration", () => {
  const originalWindow = global.window;
  let times = [];
  const node = () => ({ connect(next) { return next; } });
  class FakeAudioContext {
    sampleRate = 100;
    currentTime = 0;
    destination = {};
    createBuffer(_channels, frames) { return { getChannelData: () => new Float32Array(frames) }; }
    createBufferSource() { return { ...node(), start() {}, stop() {} }; }
    createBiquadFilter() { return { ...node(), frequency: {} }; }
    createGain() { return { ...node(), gain: { setValueAtTime(_v, t) { times.push(t); }, linearRampToValueAtTime(_v, t) { times.push(t); } } }; }
  }
  global.window = { AudioContext: FakeAudioContext };
  try {
    const { playRumble } = load("src/lib/audio.ts");
    for (const duration of [0.35, 1, 6]) {
      times = [];
      playRumble(duration);
      assert(times.every((t, i) => Number.isFinite(t) && t >= 0 && t <= duration && (i === 0 || t >= times[i - 1])));
      assert.equal(times.at(-1), duration);
    }
  } finally { global.window = originalWindow; }
});

test("glass doors and dish cupboards keep object-specific advice and illustrations", () => {
  const { roomAdvice, roomAdviceImage } = load("src/lib/room-guidance.ts");
  for (const objectType of ["doorway", "window", "other"]) {
    const door = { ...risk(objectType, "block"), name: "ガラスの扉[とびら]" };
    assert.match(roomAdviceImage(door).src, /glass-film/);
    for (const audience of ["child", "adult"]) {
      assert.match(roomAdvice(door, audience).headline, /ガラス/);
      assert.doesNotMatch(roomAdvice(door, audience).steps.join(""), /おもちゃ/);
    }
  }
  const cupboard = { ...risk("other", "break"), name: "ガラス扉の食器棚" };
  assert.match(roomAdviceImage(cupboard).src, /cupboard-v13/);
  assert.match(roomAdvice(cupboard, "child").headline, /食器/);
  assert.match(roomAdviceImage(risk("bookshelf")).src, /anchor-shelf/);
  assert.match(roomAdviceImage({ ...risk("doorway", "block"), name: "木のドア" }).src, /clear-floor/);
});

test("every correct action uses its corresponding generated illustration", async () => {
  const { reviewIllustration, reviewImagePath } = load("src/lib/review-illustrations.ts");
  const { SCENARIOS } = load("src/lib/scenarios.ts");
  const questions = [...SCENARIOS];
  for (const fixtures of [[], [risk("bookshelf")], [risk("window", "break")], [risk("desk")], [risk("elevated_objects")], [risk("doorway", "block")]]) {
    questions.push(...await fetchQuestions(fixtures));
  }
  for (const q of questions) {
    const scene = reviewIllustration(q);
    if (q.id === "shelter-damaged") { assert.equal(scene, null); continue; }
    if (q.id === "home-kitchen-after") assert.equal(scene.image, "kitchen-question-v8");
    assert(scene, `missing illustration for ${q.id}`);
    assert(fs.existsSync(`public${reviewImagePath(scene.image)}`), scene.image);
    if (SCENARIOS.some((scenario) => scenario.id === q.id)) assert.equal(scene.image, `${q.id}-v4`);
    if (q.phase === "after") assert.match(scene.timing, /収ま/);
    assert.deepEqual(reviewIllustration({ ...q, choices: [...q.choices].reverse() }), scene);
  }
  assert.equal(reviewIllustration({ choices: [{ id: "wait", safety: 0.95 }] }).image, "desk-hold-v12");
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
  assert.match(EXIT_EXPLANATION.join(""), /靴下や薄いスリッパ/);
  assert.match(EXIT_EXPLANATION.join(""), /安全に近づけるなら扉/);
});

test("room analysis does not generate an unrelated image; an explicit preview can reuse its image", async () => {
  const { prepareRoom, prepareAftermath, preparedAftermath, clearRoomPreparation } = load("src/lib/room-preparation.ts");
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = (url, init) => new Promise((resolve) => requests.push({ url, body: JSON.parse(init.body), resolve }));
  clearRoomPreparation();
  try {
    const photo = "data:image/jpeg;base64,bWFza2Vk";
    const analysis = prepareRoom(photo);
    assert.equal(prepareRoom(photo), analysis);
    assert.deepEqual(requests.map((r) => r.url), ["/api/room/analyze"]);
    requests[0].resolve(Response.json({ risks: [risk("bookshelf")] }));
    await analysis;
    const edited = [{ ...risk("window", "break"), name: "修正した窓" }];
    const result = prepareAftermath(photo, edited);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].body, { image: photo });
    requests[1].resolve(Response.json({ imageUrl: "data:image/png;base64,aW1hZ2U=" }));
    assert.equal((await result).events[0].riskId, "window");
    assert.equal(preparedAftermath(photo, edited).events[0].riskId, "window");
    assert.equal((await prepareAftermath(photo, [])).events.length, 0);
    assert.equal(requests.length, 2);
    clearRoomPreparation();
    assert.equal(preparedAftermath(photo, edited), null);
    const next = prepareRoom(photo);
    assert.equal(requests.length, 3);
    requests[2].resolve(Response.json({ risks: [] }));
    await next;
    assert.equal(requests.length, 3);
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
    assert(qs.length >= 2 && qs.length <= 5);
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

test("photo questions exclude kitchen checks when no cooktop is visible", async () => {
  for (const setting of ["home", "classroom", "office"]) {
    for (let seed = 1; seed <= 30; seed++) {
      let state = seed;
      const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
      const qs = await fetchQuestions([risk("bookshelf"), risk("tv", "fall", false)], setting, random);
      assert(qs.length >= 2 && qs.length <= 5);
      assert.equal(qs[0].phase, "during");
      assert.equal(qs.at(-1).phase, "after");
      assert(qs.every((q) => !q.id.startsWith("shelter-") && !q.category.includes("別[べつ]の場面")));
      assert(qs.every((q) => q.sourceRiskId !== "tv"));
      const nonPhoto = qs.filter((q) => !q.sourceRiskId);
      assert.deepEqual(nonPhoto.map((q) => q.id), ["q5"]);
      for (const q of nonPhoto) assert.equal(q.phase, "after");
    }
  }
});

test("a detected desk always gets the first protection question", async () => {
  for (const random of [() => 0, () => 0.4, () => 0.999]) {
    const qs = await fetchQuestions([risk("bookshelf"), risk("window", "break"), risk("doorway", "block"), risk("desk")], "office", random);
    assert.equal(qs[0].sourceRiskId, "desk");
    assert.equal(qs[0].choices.find((c) => c.safety >= 0.9).id, "under-desk");
    assert.equal(qs.filter((q) => q.sourceRiskId).length, 3);
  }
});

test("exit choices start with checking the floor, not assuming shoes are available", async () => {
  const qs = await fetchQuestions([risk("doorway", "block")]);
  const choice = qs.find((q) => q.sourceRiskId === "doorway").choices.find((c) => c.safety >= 0.9);
  assert.match(choice.label, /まず足元/);
  assert.match(choice.explanation.join(""), /すぐ履けるとは限りません/);
  assert.match(choice.explanation.join(""), /切迫した危険/);
});

test("specific product examples include verification conditions and official sources", () => {
  for (const item of [risk("bookshelf"), risk("tv"), risk("window", "break"), risk("cupboard")]) {
    const products = safetyProductsFor([item]);
    assert(products.length);
    for (const product of products) {
      assert(product.examples.length);
      for (const example of product.examples) {
        assert(example.check.length > 15);
        assert(example.specification.length > 5);
        assert.match(example.url, /^https:\/\/(www\.)?(elecom\.co\.jp|irisohyama\.co\.jp|nitoms\.com)\//);
      }
    }
  }
});

test("every active question has one actionable recommended answer with conditions", async () => {
  const { SCENARIOS } = load("src/lib/scenarios.ts");
  const generated = await fetchQuestions([
    risk("desk"), risk("window", "break"), risk("doorway", "block"), risk("bookshelf"),
  ], "home", () => 0.4);
  for (const question of [...SCENARIOS, ...generated]) {
    const recommended = question.choices.filter((choice) => choice.safety >= 0.9);
    assert.equal(recommended.length, 1, `recommended answer count for ${question.id}`);
    assert(recommended[0].label.length >= 8, `answer is too vague for ${question.id}`);
    assert(recommended[0].explanation.join("").length >= 35, `reason is too vague for ${question.id}`);
  }
  const desk = (await fetchQuestions([risk("desk")], "home", () => 0.4)).find((question) => question.sourceRiskId === "desk");
  assert.match(desk.choices.find((choice) => choice.id === "under-desk").explanation.join(""), /ガラスの机.*無理/);
});

test("child preparation advice is specific and keeps adult help separate from earthquake actions", () => {
  const { roomAdvice, roomAdviceImage } = load("src/lib/room-guidance.ts");
  const plain = text => text.replace(/\[[^\]]*\]/g, "");
  const shelf = roomAdvice(risk("elevated_objects"), "child");
  assert.match(plain(shelf.headline), /低い所/);
  assert.match(plain(shelf.detail), /家族/);
  assert.doesNotMatch(plain(shelf.detail), /揺れている間/);
  for (const type of ["bookshelf", "cupboard", "tv", "elevated_objects", "doorway", "window", "bed"]) {
    assert(plain(roomAdvice(risk(type), "child").detail).length < 90);
    assert(fs.existsSync(`public${roomAdviceImage(risk(type)).src}`));
  }
});

test("short review notes retain nearby-desk protection and urgent-exit exceptions", async () => {
  const { reviewNotes } = load("src/lib/review-copy.ts");
  const plain = text => text.replace(/\[[^\]]*\]/g, "");
  const qs = await fetchQuestions([risk("desk"), risk("doorway", "block")]);
  const desk = qs.find(q => q.sourceRiskId === "desk");
  assert.match(plain(reviewNotes(desk).join("")), /机の下/);
  assert.match(plain(reviewNotes(desk).join("")), /ガラス/);
  const exit = qs.find(q => q.sourceRiskId === "doorway");
  assert.match(plain(reviewNotes(exit).join("")), /火や煙/);
  assert.equal(reviewNotes(desk).length, 2);
});

test("quiz highlights follow the selected object's bounds, including near image edges", async () => {
  for (const item of [
    { ...risk("tv"), name: "テレビ", adultName: "テレビ受像機", bounds: { x: 62, y: 24, w: 32, h: 27 } },
    { ...risk("bookshelf"), x: 99, y: 99 },
  ]) {
    const questions = await fetchQuestions([item], "home", () => 0);
    const question = questions.find(q => q.sourceRiskId === item.id);
    assert.equal(question.place, item.name);
    assert.equal(question.highlight.label, item.name);
    const { x, y, w, h } = question.highlight;
    assert(x >= 0 && y >= 0 && x + w <= 100 && y + h <= 100);
    if (item.bounds) assert.deepEqual({ x, y, w, h }, item.bounds);
    assert.doesNotMatch(question.adultSituation, /テレビ受像機/);
    const kitchen = questions.find(q => q.id === "home-kitchen-after");
    assert.equal(kitchen, undefined);
  }
});

test("upper elementary reading and adult guidance remain distinct", async () => {
  const { needsReading, upperElementaryText } = load("src/lib/reading-level.ts");
  const { reviewNotes } = load("src/lib/review-copy.ts");
  const { roomAdvice } = load("src/lib/room-guidance.ts");
  const { TRIVIA } = load("src/lib/trivia.ts");
  assert.equal(needsReading("家族"), false);
  assert.equal(needsReading("安全"), false);
  assert.equal(needsReading("地震"), true);
  assert.equal(upperElementaryText("まどガラス"), "窓[まど]ガラス");
  assert(TRIVIA.length >= 7);
  assert(TRIVIA.every(t => t.adultBody && typeof t.adultNote === "string" && t.source.url.startsWith("https://")));
  const questions = await fetchQuestions([risk("desk"), risk("doorway", "block")]);
  for (const question of questions) assert.doesNotMatch(reviewNotes(question, "adult").join(""), /おとな|だよ|してね|しよう|家族に知らせ/);
  for (const type of ["bookshelf", "tv", "elevated_objects", "doorway"]) {
    assert.doesNotMatch(JSON.stringify(roomAdvice(risk(type), "adult")), /大人と|大人が|おとな|だよ|してね/);
  }
});


test("new household objects have dedicated preparation and wall TVs do not get table belts", () => {
  const { roomAdvice, roomObjectType, roomAdviceImage } = load("src/lib/room-guidance.ts");
  for (const [name, type] of [["ピアノ", "instrument"], ["ハンガーラック", "clothes_rack"], ["ペットのケージ", "pet_cage"], ["ドラム式洗濯機", "washing_machine"]]) {
    const object = { ...risk("other"), name };
    assert.equal(roomObjectType(object), type);
    assert.notEqual(roomAdvice(object).headline, "落下・転倒する先を確かめる");
    assert.ok(roomAdvice(object, "child").steps.length >= 2);
  }
  const wall = { ...risk("tv"), name: "壁掛けテレビ" };
  assert.match(roomAdvice(wall).headline, /取付状態/);
  assert.equal(roomAdviceImage(wall), null);
  assert.equal(safetyProductsFor([wall]).some(p => p.id === "tv-belt"), false);
  assert.equal(safetyProductsFor([risk("tv")]).some(p => p.id === "tv-belt"), true);
});

test("missing hydration photo cannot evict an image job, and failed generation can be retried once", async () => {
  const { prepareAftermath, preparedAftermath, clearRoomPreparation } = load("src/lib/room-preparation.ts");
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = (_url, options) => new Promise(resolve => calls.push({ body: JSON.parse(options.body), resolve }));
  clearRoomPreparation();
  const photo = "data:image/png;base64,bWFza2Vk";
  try {
    const first = prepareAftermath(photo, []);
    await prepareAftermath(null, []);
    const duplicate = prepareAftermath(photo, []);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { image: photo });
    calls[0].resolve(Response.json({ error: "openai-timeout" }, { status: 502 }));
    assert.match((await first).error, /時間/);
    await duplicate;
    await prepareAftermath(photo, []);
    assert.equal(calls.length, 1);
    const retry = prepareAftermath(photo, [], true);
    const sameRetry = prepareAftermath(photo, [], true);
    assert.equal(calls.length, 2);
    calls[1].resolve(Response.json({ imageUrl: "data:image/png;base64,b2s=" }));
    await retry;
    await sameRetry;
    assert.equal(preparedAftermath(photo, []).source, "ai");
    await prepareAftermath(photo, [], true);
    assert.equal(calls.length, 2);
  } finally { global.fetch = originalFetch; clearRoomPreparation(); }
});


test("masked submission starts analysis and prediction together with identical image bytes", async () => {
  const { prepareMaskedRoom, prepareAftermath, clearRoomPreparation } = load("src/lib/room-preparation.ts");
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = (url, options) => new Promise(resolve => calls.push({ url, body: JSON.parse(options.body), resolve }));
  const masked = "data:image/png;base64,bWFza2VkLW9ubHk=";
  clearRoomPreparation();
  try {
    const analysis = prepareMaskedRoom(masked);
    assert.deepEqual(calls.map(c => c.url), ["/api/room/analyze", "/api/room/aftermath"]);
    assert.ok(calls.every(c => c.body.image === masked));
    calls[0].resolve(Response.json({ risks: [] }));
    calls[1].resolve(Response.json({ imageUrl: "generated" }));
    await analysis;
    assert.equal((await prepareAftermath(masked, [])).imageUrl, "generated");
    assert.equal(calls.length, 2);
  } finally { global.fetch = originalFetch; clearRoomPreparation(); }
});


test("tall shelves distinguish cabinet anchoring from falling contents and elevated objects", () => {
  const { roomAdvice, roomAdviceImage } = load("src/lib/room-guidance.ts");
  const shelf = { ...risk("tall_furniture"), name: "背の高い棚" };
  for (const mode of ["adult", "child"]) {
    const advice = roomAdvice(shelf, mode);
    assert.match(advice.steps.join(""), /固定/);
    assert.match(advice.steps.join(""), /バー|落下防止/);
  }
  assert.match(roomAdviceImage(shelf).src, /anchor-shelf/);
  assert.match(roomAdviceImage(risk("elevated_objects")).src, /lower-items/);
});

test("ordinary floor checks and rescue conditions are distinct", () => {
  const { reviewNotes } = load("src/lib/review-copy.ts");
  const { reviewIllustration } = load("src/lib/review-illustrations.ts");
  const question = { choices: [{ id: "shoes", safety: 1 }] };
  for (const mode of ["adult", "child"]) {
    const notes = reviewNotes(question, mode);
    assert.match(notes[0], /経路|道|出口/);
    assert.doesNotMatch(notes[0], /電話|119|届け/);
    assert.match(notes[1], /閉じ込め|移動すると危険|動くと危ない/);
    assert.match(notes[1], /119/);
  }
  assert.equal(reviewIllustration(question).image, "check-floor-v18");
});


test("only confirmed cooktops generate a photo-linked kitchen question", async () => {
  const stove = { ...risk("other"), id: "cooktop", name: "ガスコンロ", bounds: { x: 10, y: 20, w: 30, h: 25 } };
  const qs = await fetchQuestions([stove], "home", () => 0);
  const kitchen = qs.find(q => q.id === "home-kitchen-after");
  assert.equal(kitchen.sourceRiskId, stove.id);
  assert.equal(kitchen.seconds, 12);
  assert.deepEqual(kitchen.highlight, { ...stove.bounds, label: stove.name });
  for (const item of [{ ...stove, confirmed: false }, { ...stove, name: "食器棚", objectType: "cupboard" }]) {
    assert.equal((await fetchQuestions([item])).some(q => q.id === "home-kitchen-after"), false);
  }
});

test("cooktop preparation has fire precautions instead of furniture-moving advice", () => {
  const { roomAdvice, roomAdviceImage } = load("src/lib/room-guidance.ts");
  const stove = { ...risk("other"), name: "ガスコンロ" };
  for (const audience of ["child", "adult"]) {
    const advice = JSON.stringify(roomAdvice(stove, audience));
    assert.match(advice, /コンロ/);
    assert.match(advice, /ふきん/);
    assert.match(advice, /消火器/);
    assert.doesNotMatch(advice, /重.*低|寝る場所|転倒/);
  }
  assert.match(roomAdviceImage(stove).src, /kitchen/);
});

test("elevated object illustration selects exactly one of books or box", () => {
  const { roomAdviceImages } = load("src/lib/room-guidance.ts");
  const item = risk("elevated_objects");
  const books = roomAdviceImages(item, 0.2);
  const box = roomAdviceImages(item, 0.8);
  assert.equal(books.length, 1);
  assert.equal(box.length, 1);
  assert.match(books[0].src, /lower-items/);
  assert.match(box[0].src, /lower-box/);
  assert.deepEqual(roomAdviceImages(risk("tv"), 0.2), roomAdviceImages(risk("tv"), 0.8));
});
