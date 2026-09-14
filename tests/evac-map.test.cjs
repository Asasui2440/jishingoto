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
    if (/[\\/]gmaps\.ts$/.test(file)) return {
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
  return { plan: load("src/lib/street-route-plan.ts"), navigation: load("src/lib/street-navigation.ts"), googleRoutes: load("src/lib/google-routes.ts"), api: load("src/lib/evac-api.ts"), walk: load("src/lib/evac-walk.ts"), content: load("src/lib/evac-content.ts"), state: load("src/lib/evac.ts") };
}

const { api, walk, content, state } = modules();
const nearly = (a, b, tolerance = 0.01) => assert(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const samePosition = (a, b) => nearly(api.distanceM(a, b), 0);

test("Street View strides stop at a right-angle corner before heading down the next road", () => {
  const positions = [{lat: 35, lng: 139}, {lat: 35.0002, lng: 139}, {lat: 35.0002, lng: 139.0005}];
  const progress = {index: 0, steps: positions.map(position => ({position}))};
  assert.equal(walk.nextStreetIndex(progress, []), 1);
  assert.equal(walk.nextStreetIndex({...progress, index: 1}, []), 2);
});

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

test("live Google routes are enriched by the same-origin deterministic assessment API", async () => {
  const live = modules(true, async () => ({ routes: [sdkRoute()] })).api;
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, "/api/evac/assess");
    const request = JSON.parse(options.body);
    assert.equal(request.routes.length, 1);
    const id = request.routes[0].id;
    return Response.json({
      version: "training-google-v1",
      assessments: {
        [id]: {
          version: "training-google-v1",
          coverage: "full",
          comparisonScore: 72,
          rank: 1,
          provisional: true,
          terrain: { anyAttentionM: 120, slopeM: 40, liquefactionM: 0, shakingM: 120 },
          notes: ["地形データで比較済み"],
          source: { name: "国土地理院", url: "https://example.test" },
        },
      },
    });
  };
  try {
    const routes = await live.fetchRoutes(content.DEMO_HOME, content.DEMO_SHELTERS[0], "api");
    assert.equal(routes[0].assessment.comparisonScore, 72);
    assert(routes[0].notes.includes("地形データで比較済み"));
  } finally {
    global.fetch = original;
  }
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


function fakePanorama() {
  const nodes = {
    A: { position: { lat: 35, lng: 139 }, links: [{ pano: "B", heading: 0 }] },
    B: { position: { lat: 35.0001, lng: 139 }, links: [{ pano: "A", heading: 180 }, { pano: "C", heading: 90 }, { pano: "D", heading: 0 }] },
    C: { position: { lat: 35.0001, lng: 139.0001 }, links: [{ pano: "B", heading: 270 }] },
  };
  const listeners = new Map();
  let id = "A", heading = 0;
  const calls = [];
  return {
    calls,
    getPano: () => id,
    getPosition: () => ({ lat: () => nodes[id].position.lat, lng: () => nodes[id].position.lng }),
    getPov: () => ({ heading, pitch: 0 }),
    getLinks: () => nodes[id].links,
    getStatus: () => "OK",
    addListener(name, listener) { const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set); return { remove: () => set.delete(listener) }; },
    emit(name) { listeners.get(name)?.forEach(listener => listener()); },
    setPano(next) { calls.push(next); },
    setPov(pov) { heading = pov.heading; this.emit("pov_changed"); },
    settle(next) { id = next; this.emit("position_changed"); this.emit("links_changed"); },
    look(next) { heading = next; this.emit("pov_changed"); },
  };
}

test("live movement accepts only a current adjacent ID, one hop at a time, with no position command", () => {
  const pano = fakePanorama();
  let state;
  const control = modules().navigation.streetController(pano, value => { state = value; });
  try {
    control.move("C"); control.move({ lat: 35, lng: 139 });
    assert.deepEqual(pano.calls, []);
    control.move("B"); control.move("B"); control.move("C");
    assert.deepEqual(pano.calls, ["B"]);
    assert.equal(state.ready, false);
    assert.deepEqual(state.position, { lat: 35, lng: 139 });
    pano.settle("B");
    assert.equal(state.ready, true);
    assert.equal(state.previousPano, "A");
    assert.deepEqual(state.position, { lat: 35.0001, lng: 139 });
    pano.look(270);
    assert.equal(state.heading, 270);
    assert.deepEqual(pano.calls, ["B"], "looking around cannot move the panorama");
    control.move("B"); // stale button
    assert.deepEqual(pano.calls, ["B"]);
    control.move("C"); pano.settle("C");
    assert.deepEqual(pano.calls, ["B", "C"]);
  } finally { control.dispose(); }
  control.move("B");
  assert.deepEqual(pano.calls, ["B", "C"], "unmounted controller cannot move");
});

test("timed out movement stops without accepting late completion or another move", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pano = fakePanorama();
  let state;
  const control = modules().navigation.streetController(pano, value => { state = value; });
  control.move("B");
  t.mock.timers.tick(10001);
  assert.equal(state.ready, false);
  assert(state.error);
  pano.settle("B");
  assert.equal(state.ready, false);
  control.move("C");
  assert.deepEqual(pano.calls, ["B"]);
  control.dispose();
});

test("selected route controls automatic turns regardless of viewing direction", () => {
  const { automaticStreetLink } = modules().navigation;
  const base = { ready: true, busy: false, error: null, previousPano: "A", travelHeading: 0, heading: 270 };
  const back = { pano: "A", heading: 180 }, straight = { pano: "D", heading: 0 }, right = { pano: "C", heading: 90 };
  const state = { ...base, links: [back, straight, right] };
  assert.equal(automaticStreetLink(state, 0), straight);
  assert.equal(automaticStreetLink(state, 90), right);
  assert.equal(automaticStreetLink({ ...state, arrivalNode: { pano: "C", position: { lat: 35, lng: 139 } } }, 0), straight, "do not shortcut the selected route merely because the goal is adjacent");
  assert.equal(automaticStreetLink({ ...state, arrivalNode: { pano: "C", position: { lat: 35, lng: 139 } } }, 0, true), right);
  assert.equal(automaticStreetLink({ ...state, heading: 90 }, 0), straight);
  assert.equal(automaticStreetLink(state), null, "no route means no automatic movement");
  assert.equal(automaticStreetLink(state, 45), null, "ambiguous links require a choice");
  assert.equal(automaticStreetLink({ ...state, links: [straight] }, 90), null, "do not continue straight when the route turns");
  assert.equal(automaticStreetLink({ ...state, busy: true }, 0), null);
  assert.equal(automaticStreetLink({ ...state, previousPano: null, travelHeading: null }, 0), straight);
});

test("route geometry supplies the turn at a junction, not the destination bearing", () => {
  const a = { lat: 35, lng: 139 }, b = { lat: 35.001, lng: 139 }, c = { lat: 35.001, lng: 139.001 };
  nearly(walk.streetRouteGuidance([a, b, c], a).heading, 0);
  nearly(walk.streetRouteGuidance([a, b, c], b).heading, 90);
  nearly(walk.streetRouteGuidance([a, b, { lat: 35.002, lng: 139 }, c], b).heading, 0);
  assert(walk.streetRouteGuidance([a, b, c], { lat: 35.0005, lng: 139.001 }).distanceFromRoute > 30);
});

test("confirmed node arrival is independent of missed questions and stale route progress", () => {
  const positions = Array.from({ length: 9 }, (_, i) => ({ lat: 35 + i * 0.0001, lng: 139 }));
  let progress = { routeId: "live", index: 0, steps: positions.map((position, i) => ({
    id: `live:${i}`, position, travelSeconds: 10, ...(i === 4 ? { pointId: "event", event: { id: "wall" } } : {}),
  })) };
  progress = walk.observeStreetPosition(progress, positions[0], 0, []);
  progress = walk.observeStreetPosition(progress, positions[1], 0, []);
  assert.deepEqual(walk.walkedPath(progress), positions.slice(0, 2));
  progress = walk.observeStreetPosition(progress, positions[4], 0, []);
  assert.equal(progress.index, 4, "a nearby unanswered event is still presented");
  progress.street.routeM = 0;
  progress = walk.observeStreetPosition(progress, positions[7], 0, []);
  assert.equal(progress.street.arrived, false, "proximity alone cannot complete the walk");
  progress = walk.observeStreetPosition(progress, positions[7], 0, [], true);
  assert.equal(progress.street.arrived, true);
  assert.equal(progress.index, 8);
  assert.equal(progress.street.remainingM, 0);
  const offRoad = walk.observeStreetPosition(progress, { lat: 35.1, lng: 139.1 }, 0, []);
  assert.equal(offRoad.street.arrived, false);
  const shelter = { lat: 35.1, lng: 139.1 };
  const nearShelter = walk.observeStreetPosition(progress, shelter, 0, [], true);
  assert.equal(nearShelter.street.arrived, true, "confirmed arrival can differ from the planned endpoint");
});

test("recovery follows the recorded adjacent path and view faces each selected hop", () => {
  const { streetController, returnStreetLink } = modules().navigation;
  const pano = fakePanorama();
  let snapshot;
  const controller = streetController(pano, state => { snapshot = state; });
  const onRoute = position => position.lat === 35;
  try {
    controller.move("B"); pano.settle("B");
    assert.equal(returnStreetLink(snapshot, onRoute)?.pano, "A");
    controller.move("C");
    assert.equal(pano.getPov().heading, 90);
    pano.settle("C");
    assert.equal(pano.getPov().heading, 90);
    assert.equal(returnStreetLink(snapshot, onRoute)?.pano, "B");
    pano.look(0);
    assert.equal(pano.getPov().heading, 0, "looking around remains free at rest");
    controller.move("B"); pano.settle("B");
    assert.equal(pano.getPov().heading, 270);
    assert.deepEqual(snapshot.trail.map(node => node.pano), ["A", "B"]);
    assert.equal(returnStreetLink(snapshot, onRoute)?.pano, "A", "continue returning, do not bounce to C");
    controller.move("A"); pano.settle("A");
    assert.equal(returnStreetLink(snapshot, onRoute), null);
    assert.equal(returnStreetLink({ ...snapshot, position: { lat: 36, lng: 139 }, trail: [] }, onRoute), null, "never invent an unobserved return link");
  } finally { controller.dispose(); }
});

test("arrival uses the resolved outdoor node, not distance to a facility center", async () => {
  const { findStreetArrivalNode, reachedStreetArrival } = modules().navigation;
  const endpoint = { lat: 35, lng: 139 };
  let request;
  const node = await findStreetArrivalNode({
    StreetViewPreference: { NEAREST: "nearest" }, StreetViewSource: { OUTDOOR: "outdoor", GOOGLE: "google" },
    StreetViewService: class { async getPanorama(value) { request = value; return { data: { links: [{pano:"road",heading:0}], location: {
      pano: "outside-gate", latLng: { lat: () => 35, lng: () => 139.0006 },
    } } }; } },
  }, endpoint);
  assert.deepEqual(request.location, endpoint);
  assert.equal(request.preference, "nearest");
  assert.deepEqual(request.sources, ["outdoor", "google"]);
  const state = { pano: "outside-gate", position: node.position, arrivalNode: node, ready: true, busy: false, error: null };
  assert(api.distanceM(endpoint, node.position) > 30);
  assert.equal(reachedStreetArrival(state), true);
  assert.equal(reachedStreetArrival({ ...state, pano: "different-node", position: endpoint }), false);
  assert.equal(reachedStreetArrival({ ...state, arrivalNode: null }), false);
  assert.equal(reachedStreetArrival({ ...state, busy: true }), false);
});


test("preflight builds a connected node chain along the selected route rather than shortcutting to the goal", async () => {
  const { prepareStreetRoute, plannedStreetLink } = modules().plan;
  const a = { lat: 35, lng: 139 }, b = { lat: 35.0003, lng: 139 }, d = { lat: 35.0006, lng: 139 }, c = { lat: 35.0003, lng: 139.0006 };
  const nodes = {
    A: { pano: "A", position: a, links: [{ pano: "B", heading: 0 }] },
    B: { pano: "B", position: b, links: [{ pano: "A", heading: 180 }, { pano: "C", heading: 90 }, { pano: "D", heading: 0 }] },
    C: { pano: "C", position: c, links: [] },
    D: { pano: "D", position: d, links: [{ pano: "B", heading: 180 }, { pano: "C", heading: 120 }] },
  };
  let calls = 0;
  const read = async id => { calls++; return nodes[id]; };
  const direct = await prepareStreetRoute([a, b, c], "A", "C", read);
  assert.deepEqual(direct.nodes.map(node => node.pano), ["A", "B", "C"]);
  assert(calls <= 4, "each panorama is fetched once per preparation");
  const detour = await prepareStreetRoute([a, b, d, c], "A", "C", read);
  assert.deepEqual(detour.nodes.map(node => node.pano), ["A", "B", "D", "C"]);
  for (let i = 0; i < detour.nodes.length - 1; i++) assert(detour.nodes[i].links.some(link => link.pano === detour.nodes[i + 1].pano));
  const state = { ...nodes.B, ready: true, busy: false, error: null, heading: 270 };
  assert.equal(plannedStreetLink(state, detour)?.pano, "D");
  assert.equal(plannedStreetLink({ ...state, links: [] }, detour), null, "changed live connections cannot be fabricated");
  nodes.B.links = [{ pano: "A", heading: 180 }];
  await assert.rejects(prepareStreetRoute([a, b, c], "A", "C", read), /接続/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(prepareStreetRoute([a, b, c], "A", "C", read, { signal: abort.signal }), /cancelled/);
});

test("preflight tolerates sidewalk projection reversals and roadway offsets without coordinate jumps", async () => {
  const { prepareStreetRoute } = modules().plan;
  const a = {lat:35,lng:139}, b = {lat:35,lng:139.0014}, corner = {lat:35.0001,lng:139.0014}, goal = {lat:35.0001,lng:139};
  const nodes = {
    A: {pano:"A",position:a,links:[{pano:"B",heading:90}]},
    B: {pano:"B",position:b,links:[{pano:"D",heading:270}]},
    D: {pano:"D",position:{lat:35.00004,lng:139.0004},links:[{pano:"G",heading:270}]},
    G: {pano:"G",position:goal,links:[]},
  };
  const plan = await prepareStreetRoute([a,b,corner,goal],"A","G",async id=>nodes[id]);
  assert.deepEqual(plan.nodes.map(n=>n.pano),["A","B","D","G"]);
  const road = {
    A:{pano:"A",position:a,links:[{pano:"B",heading:90}]},
    B:{pano:"B",position:{lat:35.00027,lng:139.0007},links:[{pano:"G",heading:90}]},
    G:{pano:"G",position:b,links:[]},
  };
  assert.equal((await prepareStreetRoute([a,b],"A","G",async id=>road[id])).nodes.length,3);
});

test("isolated arrival panoramas cannot become a walking goal", async () => {
  const {findStreetArrivalNode} = modules().navigation;
  await assert.rejects(findStreetArrivalNode({
    StreetViewPreference:{NEAREST:"nearest"},StreetViewSource:{OUTDOOR:"outdoor",GOOGLE:"google"},
    StreetViewService:class {async getPanorama(){return {data:{location:{pano:"isolated",latLng:{lat:()=>35,lng:()=>139}},links:[]}};}},
  },{lat:35,lng:139}), /no-arrival-node/);
});

test("preflight distinguishes unavailable data and exploration limits from disconnected roads", async () => {
  const {prepareStreetRoute} = modules().plan;
  const a={lat:35,lng:139},b={lat:35,lng:139.001};
  const read=async id=>{if(id!=="A")throw new Error("unavailable");return {pano:"A",position:a,links:[{pano:"B",heading:90}]};};
  await assert.rejects(prepareStreetRoute([a,b],"A","B",read),/取得できません/);
  await assert.rejects(prepareStreetRoute([a,b],"A","B",read,{maxNodes:1}),/地点数/);
});

test("a disconnected facility tour resolves to a proven road-side node and arrival remains ID-based", async () => {
  const {prepareStreetRoute} = modules().plan;
  const {reachedStreetArrival} = modules().navigation;
  const start={lat:35,lng:139}, road={lat:35.001,lng:139}, facility={lat:35.0012,lng:139};
  const nodes={A:{pano:"A",position:start,links:[{pano:"R",heading:0}]},R:{pano:"R",position:road,links:[{pano:"A",heading:180}]}};
  const plan=await prepareStreetRoute([start,road,facility],"A","courtyard",async id=>nodes[id],{goalPosition:facility});
  assert.equal(plan.arrivalAdjusted,true);
  assert.deepEqual(plan.nodes.map(n=>n.pano),["A","R"]);
  const snapshot={pano:"R",position:road,arrivalNode:plan.nodes.at(-1),ready:true,busy:false,error:null};
  assert.equal(reachedStreetArrival(snapshot),true);
  assert.equal(reachedStreetArrival({...snapshot,pano:"nearby"}),false);
  await assert.rejects(prepareStreetRoute([start,road,facility],"A","courtyard",async id=>nodes[id],{goalPosition:{lat:35.002,lng:139}}),/接続/);
});

test("shelter lookup uses the selected disaster layer and excludes incompatible facilities", async () => {
  const live = modules(true).api;
  const before = global.fetch;
  const urls = [];
  const feature = (name, flags) => ({geometry:{coordinates:[135.495,34.702]},properties:{name,address:"大阪",...flags}});
  global.fetch = async url => { urls.push(String(url)); return Response.json({features:[feature("洪水のみ",{disaster1:1}),feature("地震のみ",{disaster4:1}),feature("両方",{disaster1:"1",disaster4:1})]}); };
  try {
    const flood = await live.fetchShelters({lat:34.702,lng:135.495},"api","flood");
    assert.deepEqual(flood.map(s=>s.name),["洪水のみ"]); // duplicate location is shown once
    assert(flood.every(s=>s.kind.includes("洪水") && s.supportedDisasters.includes("洪水")));
    assert(urls.every(url=>url.includes("/skhb01/")));
    urls.length=0;
    const quake = await live.fetchShelters({lat:34.702,lng:135.495},"api","earthquake");
    assert.equal(quake[0].name,"地震のみ");
    assert(urls.every(url=>url.includes("/skhb04/")));
    global.fetch = async () => new Response(null,{status:503});
    await assert.rejects(live.fetchShelters({lat:34.702,lng:135.495},"api","flood"),/洪水/);
  } finally { global.fetch=before; }
});

test("flood fallback questions stay explicitly synthetic and cannot become earthquake questions", async () => {
  const route = (await api.fetchRoutes(content.DEMO_HOME,content.DEMO_SHELTERS[0],"mock"))[0];
  const points = await api.fetchDecisionPoints(route,{source:"sample",scenario:"flood"});
  assert.equal(points.length,1);
  assert.equal(points[0].event.id,"practice-flood");
  assert.equal(points[0].event.evidence,undefined);
  assert(points[0].event.situation.includes("固定の練習問題"));
  assert(points[0].event.situation.includes("浸水"));
});
