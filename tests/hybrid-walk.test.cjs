/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner. */
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
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (name.startsWith("@/") || name.startsWith(".")) {
        const target = name.startsWith("@/")
          ? path.resolve("src", name.slice(2))
          : path.resolve(path.dirname(file), name);
        return load(path.extname(target) ? target : `${target}.ts`);
      }
      return require(name);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const { prepareHybridWalk, advanceHybridWalk } = load("src/lib/hybrid-walk.ts");
const { buildWalkSteps, distanceM, pathLengthM } = load("src/lib/evac-api.ts");
const A = { lat: 35, lng: 139 }, B = { lat: 35.0003, lng: 139 }, C = { lat: 35.0003, lng: 139.0006 };
const route = { id: "route", path: [A, B, C], durationS: 90 };
const event = { id: "question", choices: [] };
const points = [B, C].map((position, i) => ({ id: `q${i}`, event, position, t: i ? 1 : distanceM(A, B) / pathLengthM(route.path), heading: 90 }));
const original = () => ({ routeId: route.id, index: 0, steps: buildWalkSteps(route, points) });

test("画像ゼロでも出発点から曲がり角と全問題を通って終点に着く", () => {
  let walk = prepareHybridWalk(original(), route, []);
  const answered = [];
  assert.deepEqual(walk.street.position, A);
  for (let i = 0; i < 100 && !walk.street.arrived; i++) {
    const step = walk.steps[walk.index];
    if (step.pointId) {
      assert.equal(advanceHybridWalk(walk, answered).index, walk.index, "未回答地点を越えない");
      if (step.pointId === "q1") assert.equal(walk.street.arrived, false, "終点の問題も回答前は到着扱いにしない");
      answered.push(step.pointId);
    }
    const before = walk.street.position;
    walk = advanceHybridWalk(walk, answered);
    assert.ok(distanceM(before, walk.street.position) <= 10.01);
  }
  assert.deepEqual(answered, ["q0", "q1"]);
  assert.equal(walk.street.arrived, true);
  assert.deepEqual(walk.street.position, C);
  assert.ok(walk.street.path.some(p => p.lat === B.lat && p.lng === B.lng));
  assert.ok(Math.abs(pathLengthM(walk.street.path) - pathLengthM(route.path)) < .01);
  assert.ok(Math.abs(walk.street.elapsedS - 90) < .01);
});

test("初期撮影地点へのずれを引き継がず選んだ出発地点から始める", () => {
  const shifted = { lat: A.lat + .0001, lng: A.lng };
  const walk = prepareHybridWalk({ ...original(), street: { position: shifted, path: [shifted], elapsedS: 0 } }, route, []);
  assert.deepEqual(walk.street.path, [A]);
});

test("途中の切替と再読み込みで通った道・時間・回答を保つ", () => {
  const saved = { ...original(), index: 3, street: { position: B, path: [A, B], elapsedS: 30 } };
  let walk = prepareHybridWalk(saved, route, ["q0"]);
  assert.deepEqual(walk.street.path, [A, B]);
  assert.equal(walk.street.elapsedS, 30);
  assert.ok(walk.steps.some(s => s.pointId === "q0"));
  assert.ok(!walk.steps.slice(walk.index).some(s => s.pointId === "q0"));
  walk = advanceHybridWalk(JSON.parse(JSON.stringify(walk)), ["q0"]);
  assert.ok(walk.street.position.lng > B.lng);
  assert.equal(walk.navigationMode, "hybrid");
});

test("ルート外から建物を横切る切替は行わない", () => {
  const outside = { lat: 35.005, lng: 139.005 };
  assert.throws(() => prepareHybridWalk({ ...original(), street: { position: outside, path: [A, outside] } }, route, []), /ルートに戻って/);
});

test("迂回後も履歴を残し新しい経路の曲がり角と問題を通る", () => {
  const { rerouteWalk } = load("src/lib/evac-walk.ts");
  let walk = prepareHybridWalk(original(), route, []);
  while (walk.steps[walk.index].pointId !== "q0") walk = advanceHybridWalk(walk, []);
  const elapsed = walk.street.elapsedS;
  const history = [...walk.street.path];
  const D = { lat: 35.0006, lng: 139 };
  const detour = { id: "detour", path: [B, D, C], durationS: 60 };
  const nextPoint = { id: "q2", event: { ...event, id: "detour-question" }, position: C, t: 1, heading: 90 };
  walk = prepareHybridWalk(rerouteWalk(walk, detour, [nextPoint], [event.id]), detour, ["q0"]);
  while (walk.steps[walk.index].pointId !== "q2") walk = advanceHybridWalk(walk, ["q0"]);
  assert.equal(walk.street.arrived, false);
  walk = advanceHybridWalk(walk, ["q0", "q2"]);
  assert.equal(walk.street.arrived, true);
  assert.deepEqual(walk.street.path.slice(0, history.length), history);
  assert.ok(walk.street.path.some(p => p.lat === D.lat && p.lng === D.lng));
  assert.ok(Math.abs(walk.street.elapsedS - elapsed - 60) < .01);
});
