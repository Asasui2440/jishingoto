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
const { automaticStreetLink } = load("src/lib/street-navigation.ts");

test("automaticStreetLink follows the selected route when multiple branches are present", () => {
  const state = {
    pano: "b",
    position: null,
    heading: 0,
    links: [
      { pano: "forward-a", heading: 20 },
      { pano: "side-b", heading: 100 },
      { pano: "back-c", heading: 200 },
    ],
    previousPano: "a",
    travelHeading: 0,
    busy: false,
    ready: true,
    error: null,
  };

  assert.equal(automaticStreetLink(state, 0)?.pano, "forward-a");
});

test("automaticStreetLink does not stop at the first node when the road ahead is slightly ambiguous", () => {
  const state = {
    pano: "start",
    position: null,
    heading: 0,
    links: [
      { pano: "forward-left", heading: 15 },
      { pano: "forward-right", heading: 35 },
      { pano: "side-road", heading: 120 },
    ],
    previousPano: null,
    travelHeading: null,
    busy: false,
    ready: true,
    error: null,
  };

  assert.equal(automaticStreetLink(state, 0)?.pano, "forward-left");
});
