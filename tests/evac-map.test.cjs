/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function modules(mapsEnabled = false, computeRoutes = async () => { throw new Error("API not configured in test"); }) {
  const cache = new Map();
  const load = (file) => {
    file = path.resolve(file);
    if (file.endsWith("/gmaps.ts")) return {
      hasMapsKey: () => mapsEnabled,
      loadMaps: async () => ({ importLibrary: async (name) => { assert.equal(name, "routes"); return { Route: { computeRoutes } }; } }),
    };
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    new Function("require", "module", "exports", code)((p) => p.startsWith(".") ? load(path.resolve(path.dirname(file), `${p}.ts`)) : require(p), mod, mod.exports);
    return mod.exports;
  };
  return { googleRoutes: load("src/lib/google-routes.ts"), api: load("src/lib/evac-api.ts"), walk: load("src/lib/evac-walk.ts"), content: load("src/lib/evac-content.ts"), state: load("src/lib/evac.ts") };
}

const { api, walk, content, state } = modules();
const nearly = (a, b, tolerance = 0.01) => assert(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const samePosition = (a, b) => nearly(api.distanceM(a, b), 0);

async function fixture() {
  const route = (await api.fetchRoutes(content.DEMO_HOME, content.DEMO_SHELTERS[0], "mock"))[0];
  return { route, progress: { routeId: route.id, steps: api.buildWalkSteps(route, await api.fetchDecisionPoints(route)), index: 0 } };
}

test("map trail visits every route corner and event without cutting across blocks", async () => {
  const { route, progress } = await fixture();
  for (const corner of route.path) assert(progress.steps.some((s) => api.distanceM(s.position, corner) < 0.01));
  assert.deepEqual(progress.steps.filter((s) => s.event).map((s) => s.event.id), ["wall", "fall", "closed"]);
  nearly(api.pathLengthM(progress.steps.map((s) => s.position)), api.pathLengthM(route.path));
  nearly(progress.steps.reduce((sum, s) => sum + s.travelSeconds, 0), route.durationS);
  samePosition(progress.steps.at(-1).position, route.path.at(-1));
});

test("fast forward cannot skip an unanswered decision and stops at arrival", async () => {
  const { progress } = await fixture();
  const first = walk.nextWalkIndex(progress, [], true);
  assert.equal(progress.steps[first].event.id, "wall");
  const paused = { ...progress, index: first };
  assert.equal(walk.nextWalkIndex(paused, [], true), first);
  assert.equal(walk.nextWalkIndex(paused, [], false), first);
  const answered = [progress.steps[first].pointId];
  const second = walk.nextWalkIndex(paused, answered, true);
  assert.equal(progress.steps[second].event.id, "fall");
  const all = progress.steps.flatMap((s) => s.pointId ? [s.pointId] : []);
  assert.equal(walk.nextWalkIndex(paused, all, true), progress.steps.length - 1);
  assert.equal(walk.nextWalkIndex({ ...progress, index: progress.steps.length - 1 }, all), progress.steps.length - 1);
});

test("successive demo detours join the current position, keep the traveled path, and terminate", async () => {
  let { progress } = await fixture();
  const seen = [], answered = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    progress.index = walk.nextWalkIndex(progress, answered, true);
    const current = progress.steps[progress.index];
    if (!current.event) break;
    assert(!seen.includes(current.event.id), "scenario repeated after reroute");
    seen.push(current.event.id);
    answered.push(current.pointId);
    const history = walk.walkedPath(progress);
    const detour = await api.fetchDetourFrom(current.position, content.DEMO_SHELTERS[0], "mock");
    assert(detour.demo);
    samePosition(detour.path[0], current.position);
    progress = walk.rerouteWalk(progress, detour, await api.fetchDecisionPoints(detour), seen);
    assert.deepEqual(walk.walkedPath(progress), history);
    assert.equal(progress.steps[progress.index].remainingM, Math.round(api.pathLengthM(detour.path)));
    assert(progress.steps.slice(progress.index + 1).every((s) => !s.event || !seen.includes(s.event.id)));
  }
  assert.deepEqual(seen, ["wall", "fall", "closed"]);
  assert.equal(progress.index, progress.steps.length - 1);
  samePosition(progress.steps.at(-1).position, content.DEMO_SHELTERS[0].position);
});

test("detour summary counts only the traversed original segment and the new route", async () => {
  const { route, progress } = await fixture();
  progress.index = walk.nextWalkIndex(progress, [], true);
  const at = progress.steps[progress.index];
  const elapsed = progress.steps.slice(0, progress.index + 1).reduce((s, p) => s + p.travelSeconds, 0);
  const traveledM = walk.walkDistance(progress);
  const detour = await api.fetchDetourFrom(at.position, content.DEMO_SHELTERS[0], "mock");
  const changed = walk.rerouteWalk(progress, detour, [], [at.event.id]);
  changed.index = changed.steps.length - 1;
  nearly(walk.walkDistance(changed), traveledM + api.pathLengthM(detour.path));
  const session = { routes: [route, detour], startRouteId: route.id, walk: changed, decisions: [{ extraSeconds: 0 }, { extraSeconds: 30 }] };
  nearly(state.totalSeconds(session), elapsed + detour.durationS + 30);
});


test("duplicate vertices and zero-length routes produce finite map steps", () => {
  const origin = content.DEMO_HOME;
  const steps = api.buildWalkSteps({ id: "zero", kind: "short", path: [origin, origin], durationS: 0, distanceM: 0 }, []);
  for (const step of steps) {
    assert(Number.isFinite(step.position.lat) && Number.isFinite(step.position.lng));
    assert(Number.isFinite(step.travelSeconds));
  }
});

const sdkRoute = (path = [content.DEMO_HOME, content.DEMO_SHELTERS[0].position], meters = 900, milliseconds = 750000) => ({
  path, distanceMeters: meters, durationMillis: milliseconds, legs: [{ steps: [{}, {}] }],
});

test("one browser key handles normal and via routes through the SDK, converting milliseconds to seconds", async () => {
  const calls = [], data = sdkRoute();
  const client = modules(true, async (request) => { calls.push(request); return { routes: [data] }; }).googleRoutes;
  const original = global.fetch;
  global.fetch = async () => { throw new Error("must not use a REST proxy"); };
  try {
    const from = content.DEMO_HOME, to = content.DEMO_SHELTERS[0].position;
    const result = await client.requestWalkingRoutes(from, to);
    assert.equal(result[0].durationS, 750);
    assert.equal(result[0].distanceM, 900);
    assert.equal(result[0].segments, 2);
    assert.deepEqual(result[0].path, data.path);
    assert.notEqual(result[0].path, data.path, "clone SDK data before storing it");
    const req = calls[0];
    assert.deepEqual(req.origin, from); assert.deepEqual(req.destination, to);
    assert.equal(req.travelMode, "WALKING");
    assert.equal(req.computeAlternativeRoutes, true);
    assert.equal(req.intermediates, undefined);
    assert.deepEqual(req.fields, ["path", "distanceMeters", "durationMillis", "legs"]);
    assert.equal(req.polylineQuality, "HIGH_QUALITY");
    assert.equal(req.language, "ja"); assert.equal(req.region, "jp");
    const via = { lat: from.lat + 0.001, lng: from.lng };
    await client.requestWalkingRoutes(from, to, via);
    assert.deepEqual(calls[1].intermediates, [{ location: via }]);
    assert.equal(calls[1].computeAlternativeRoutes, false);
  } finally { global.fetch = original; }
});

test("mock mode performs no SDK or network requests even when a browser key exists", async () => {
  let calls = 0;
  const keyed = modules(true, async () => { calls++; throw new Error("must not use SDK"); }).api;
  const original = global.fetch;
  global.fetch = async () => { calls++; throw new Error("must not fetch"); };
  try {
    const from = content.DEMO_HOME, shelter = content.DEMO_SHELTERS[0];
    assert((await keyed.fetchShelters(from, "mock")).every(s => s.source.includes("サンプル")));
    assert((await keyed.fetchRoutes(from, shelter, "mock")).every(r => r.demo));
    assert((await keyed.fetchDetourFrom(from, shelter, "mock")).demo);
    assert.equal(calls, 0);
  } finally { global.fetch = original; }
});

test("missing browser key and SDK failures cannot become mock routes", async () => {
  await assert.rejects(api.fetchShelters(content.DEMO_HOME, "api"), /未設定/);
  await assert.rejects(api.fetchRoutes(content.DEMO_HOME, content.DEMO_SHELTERS[0], "api"), /未設定/);
  assert.equal(await api.fetchDetourFrom(content.DEMO_HOME, content.DEMO_SHELTERS[0], "api"), null);
  const failing = modules(true).api;
  await assert.rejects(failing.fetchRoutes(content.DEMO_HOME, content.DEMO_SHELTERS[0], "api"), /Routes API/);
  assert.equal(await failing.fetchDetourFrom(content.DEMO_HOME, content.DEMO_SHELTERS[0], "api"), null);
});

test("keep the one real route if finding an alternative fails", async () => {
  let calls = 0;
  const live = modules(true, async () => { if (++calls > 1) throw new Error("no alternative"); return { routes: [sdkRoute()] }; }).api;
  const routes = await live.fetchRoutes(content.DEMO_HOME, content.DEMO_SHELTERS[0], "api");
  assert.equal(routes.length, 1); assert.equal(routes[0].demo, undefined);
  assert.equal(routes[0].durationS, 750); assert.equal(calls, 2);
});

test("deduplicate SDK paths and label the shortest candidate after via lookup", async () => {
  const path = [content.DEMO_HOME, { lat: 35.72, lng: 139.73 }, content.DEMO_SHELTERS[0].position];
  const live = modules(true, async request => ({ routes: request.intermediates ? [sdkRoute(path, 800, 700000)] : [sdkRoute(), sdkRoute()] })).api;
  const routes = await live.fetchRoutes(content.DEMO_HOME, content.DEMO_SHELTERS[0], "api");
  assert.equal(routes.length, 2);
  assert.equal(routes[0].distanceM, 800); assert.equal(routes[0].kind, "short");
  assert.equal(routes[1].distanceM, 900); assert.equal(routes[1].kind, "safe");
});

test("invalid SDK data never becomes an invented straight route", async () => {
  const invalid = [sdkRoute([]), sdkRoute([content.DEMO_HOME]), sdkRoute([{ lat: NaN, lng: 139 }, content.DEMO_HOME]), sdkRoute(undefined, Infinity), sdkRoute(undefined, 0), sdkRoute(undefined, 900, null)];
  const live = modules(true, async () => ({ routes: invalid })).api;
  await assert.rejects(live.fetchRoutes(content.DEMO_HOME, content.DEMO_SHELTERS[0], "api"), /見つかりません/);
});

test("live detours keep the current stop connected and reject a distant snapped road", async () => {
  const from = content.DEMO_HOME, shelter = content.DEMO_SHELTERS[0];
  const path = [{ lat: from.lat + 0.00004, lng: from.lng }, shelter.position];
  const live = modules(true, async request => {
    assert.deepEqual(request.origin, from);
    assert(request.intermediates); assert.equal(request.computeAlternativeRoutes, false);
    return { routes: [sdkRoute(path, 1000, 800000)] };
  }).api;
  const route = await live.fetchDetourFrom(from, shelter, "api");
  assert(route && !route.demo);
  samePosition(route.path[0], from); samePosition(route.path[1], path[0]);
  assert(route.durationS > 800 && route.durationS < 810);
  path[0] = { lat: from.lat + 0.002, lng: from.lng };
  assert.equal(await live.fetchDetourFrom(from, shelter, "api"), null);
});

test("a stalled SDK call times out without applying late data", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let complete;
  const sdk = modules(true, () => new Promise(resolve => { complete = resolve; })).googleRoutes;
  const promise = sdk.requestWalkingRoutes(content.DEMO_HOME, content.DEMO_SHELTERS[0].position);
  const checked = assert.rejects(promise, /時間がかかっています/);
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(20000);
  await checked;
  complete({ routes: [sdkRoute()] });
});
