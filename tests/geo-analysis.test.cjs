/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
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
const geo = load("src/lib/server/geo-analysis.ts");
const endpoint = load("src/app/api/evac/analyze/route.ts");
const dataset = load("src/data/evac-geo/regions.json");
const request = geo.parseGeoRequest({
  route: {
    id: "test-route",
    durationS: 480,
    path: [
      { lat: 35.7186, lng: 139.7237 },
      { lat: 35.711, lng: 139.7237 },
    ],
  },
});
const region = geo.routeRegion(request.route.path);
const matches = geo.matchFeatures(region, request.route.path, []);
const candidate = (hit = matches[0]) => ({
  featureId: hit.feature.id,
  category: hit.feature.categories[0],
  reason: "収録された地形分類の一般的傾向を確認するため。",
  uncertainties: ["現地の被害は確認していない。"],
});
const withKey = async (fn) => {
  const before = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "unit-test-only";
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = before;
  }
};
const response = (raw) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(raw) }],
      },
    ],
  });

test("real GSI dataset has bounded regions, traceable versions, closed polygons and actual nearby matches", () => {
  assert.equal(dataset.regions.length, 2);
  assert.equal(
    dataset.regions.reduce((n, r) => n + r.features.length, 0),
    353,
  );
  for (const r of dataset.regions) {
    assert.equal(r.featureCount, r.features.length);
    assert(r.version);
    assert(Number.isFinite(Date.parse(r.downloadedAt)));
    assert.equal(r.tiles.length, 4);
    for (const f of r.features) {
      assert(f.id.startsWith("gsi-"));
      assert(f.classification);
      assert(f.risk);
      assert.equal(f.bbox.length, 4);
      const polygons =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates;
      for (const poly of polygons)
        for (const ring of poly) {
          assert(ring.length >= 4);
          assert.deepEqual(ring[0], ring.at(-1));
        }
    }
    assert.equal(geo.routeRegion([r.center, r.center]).id, r.id);
  }
  assert(matches.length > 0 && matches.length <= 32);
  assert(
    matches.every((m) => m.distanceM <= 50 && m.sample.t > 0 && m.sample.t < 1),
  );
});

test("coverage rejects routes crossing outside the ingested region and parser rejects invalid or unbounded requests", () => {
  assert.throws(
    () =>
      geo.routeRegion([
        { lat: 35, lng: 135 },
        { lat: 35.001, lng: 135 },
      ]),
    (e) => e.code === "outside_coverage",
  );
  assert.throws(
    () => geo.routeRegion([...request.route.path, { lat: 36, lng: 140 }]),
    (e) => e.code === "outside_coverage",
  );
  for (const bad of [
    null,
    {},
    { route: { ...request.route, path: [] } },
    {
      route: {
        ...request.route,
        path: [{ lat: Infinity, lng: 139 }, request.route.path[1]],
      },
    },
    { route: { ...request.route, durationS: 0 } },
    {
      route: {
        ...request.route,
        path: [
          { lat: 35, lng: 139 },
          { lat: 36, lng: 139 },
        ],
      },
    },
    { ...request, excludedEventIds: Array(31).fill("x") },
  ])
    assert.throws(() => geo.parseGeoRequest(bad));
  const clean = geo.parseGeoRequest({
    ...request,
    photo: "not-to-ai",
    prompt: "not-to-ai",
    route: { ...request.route, googleDescription: "not-to-ai" },
  });
  assert.deepEqual(Object.keys(clean.route), ["id", "path", "durationS"]);
});

test("polygon distance handles holes, edges, outside points and multipolygons", () => {
  const outer = [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0.01],
      [0, 0],
    ],
    hole = [
      [0.004, 0.004],
      [0.006, 0.004],
      [0.006, 0.006],
      [0.004, 0.006],
      [0.004, 0.004],
    ];
  const geometry = { type: "Polygon", coordinates: [outer, hole] };
  assert.equal(geo.geometryDistance({ lat: 0.002, lng: 0.002 }, geometry), 0);
  assert(geo.geometryDistance({ lat: 0.005, lng: 0.005 }, geometry) > 100);
  assert.equal(geo.geometryDistance({ lat: 0, lng: 0.002 }, geometry), 0);
  assert(geo.geometryDistance({ lat: 0.02, lng: 0.02 }, geometry) > 1000);
  assert.equal(
    geo.geometryDistance(
      { lat: 0.002, lng: 0.002 },
      { type: "MultiPolygon", coordinates: [[outer, hole]] },
    ),
    0,
  );
});

test("AI receives only independently sourced landform attributes; validated points follow the route and its duration", async () =>
  withKey(async () => {
    let calls = 0;
    const result = await geo.analyzeGeoRoute(
      request,
      undefined,
      async (url, options) => {
        calls++;
        assert.equal(url, "https://api.openai.com/v1/responses");
        const body = JSON.parse(options.body);
        assert.equal(body.store, false);
        assert.equal(body.text.format.strict, true);
        const input = JSON.parse(body.input[0].content);
        assert.deepEqual(Object.keys(input), [
          "disaster",
          "source",
          "features",
        ]);
        for (const f of input.features)
          assert.deepEqual(Object.keys(f), [
            "featureId",
            "code",
            "classification",
            "formation",
            "sourceRiskDescription",
            "availableCategories",
            "geographicBounds",
          ]);
        assert(!body.input[0].content.includes("test-route"));
        assert(!body.input[0].content.includes("unit-test-only"));
        return response({ candidates: [candidate()] });
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.source, "geo-ai");
    assert.equal(result.points.length, 1);
    const p = result.points[0];
    assert.deepEqual(p.position, matches[0].sample.position);
    assert.equal(p.remainingS, Math.round(480 * (1 - p.t)));
    assert.equal(p.event.evidence.datasetVersion, region.version);
    assert.equal(p.event.reference.url, dataset.source.url);
    assert.equal(p.event.kind, "terrain");
  }));

test("nonexistent features, invalid categories, duplicate candidates and excessive model output are rejected", () => {
  for (const candidates of [
    [{ ...candidate(), featureId: "invented" }],
    [{ ...candidate(), category: "invented" }],
    [candidate(), candidate()],
    Array(4).fill(candidate()),
    [{ ...candidate(), reason: "x".repeat(601) }],
    [{ ...candidate(), uncertainties: [123] }],
  ])
    assert.throws(() =>
      geo.candidatesToPoints({ candidates }, request, region, matches),
    );
  assert.deepEqual(
    geo.candidatesToPoints({ candidates: [] }, request, region, matches),
    [],
  );
});

test("reroute excludes previously experienced terrain features across categories; nearby duplicate stops are removed", () => {
  const id = `geo:${matches[0].feature.id}:${matches[0].feature.categories[0]}`;
  assert(
    !geo
      .matchFeatures(region, request.route.path, [id])
      .some((m) => m.feature.id === matches[0].feature.id),
  );
  const second = {
    ...matches[0],
    feature: { ...matches[0].feature, id: "test-second" },
  };
  const points = geo.candidatesToPoints(
    { candidates: [candidate(), candidate(second)] },
    request,
    region,
    [matches[0], second],
  );
  assert.equal(points.length, 1);
});

test("missing key fails explicitly, absent terrain makes no provider request and empty AI selection adds no fake problems", async () => {
  const before = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal(geo.geoConfig().aiConfigured, false);
    assert(!("features" in geo.geoConfig().regions[0]));
    await assert.rejects(
      geo.analyzeGeoRoute(request),
      (e) => e.code === "ai_not_configured" && e.status === 503,
    );
  } finally {
    if (before !== undefined) process.env.OPENAI_API_KEY = before;
  }
  await withKey(async () => {
    const excluded = region.features.flatMap((f) =>
      f.categories.map((c) => `geo:${f.id}:${c}`),
    );
    const empty = await geo.analyzeGeoRoute(
      { ...request, excludedEventIds: excluded },
      undefined,
      async () => {
        throw Error("must not request");
      },
    );
    assert.equal(empty.points.length, 0);
    const selected = await geo.analyzeGeoRoute(request, undefined, async () =>
      response({ candidates: [] }),
    );
    assert.equal(selected.points.length, 0);
    assert.match(selected.note, /安全を確認した意味ではありません/);
  });
});

test("upstream failures, refusals and truncated responses never become sample questions", async () =>
  withKey(async () => {
    for (const reply of [
      new Response("secret-provider-detail", { status: 401 }),
      Response.json({ status: "incomplete", output: [] }),
      Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "refusal", refusal: "no" }] },
        ],
      }),
      Response.json({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "not-json" }],
          },
        ],
      }),
    ])
      await assert.rejects(
        geo.analyzeGeoRoute(request, undefined, async () => reply),
        (e) =>
          e.status === 502 && !e.message.includes("secret-provider-detail"),
      );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      geo.analyzeGeoRoute(request, controller.signal, async (_url, init) => {
        init.signal.throwIfAborted();
      }),
      (e) => e.code === "cancelled",
    );
  }));

test("HTTP endpoint rejects cross-origin, malformed, oversized and out-of-coverage input", async () => {
  const make = (body, origin = "http://localhost") =>
    new Request("http://localhost/api/evac/analyze", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body,
    });
  assert.equal(
    (
      await endpoint.POST(
        make(JSON.stringify(request), "https://elsewhere.example"),
      )
    ).status,
    403,
  );
  assert.equal((await endpoint.POST(make("{"))).status, 400);
  assert.equal((await endpoint.POST(make("x".repeat(160001)))).status, 413);
  const outside = {
    route: {
      id: "outside",
      durationS: 300,
      path: [
        { lat: 35, lng: 135 },
        { lat: 35.001, lng: 135 },
      ],
    },
  };
  const rejected = await endpoint.POST(make(JSON.stringify(outside)));
  assert.equal(rejected.status, 422);
  assert.equal((await rejected.json()).code, "outside_coverage");
});

test("HTTP origin check accepts the actual Host behind a normalized Next.js URL", async () => {
  const req = new Request("http://localhost:3100/api/evac/analyze", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      route: {
        id: "outside",
        durationS: 300,
        path: [
          { lat: 35, lng: 135 },
          { lat: 35.001, lng: 135 },
        ],
      },
    }),
  });
  assert.equal((await endpoint.POST(req)).status, 422);
});
