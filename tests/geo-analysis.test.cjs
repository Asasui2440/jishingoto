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
const routeAssessment = load("src/lib/server/route-assessment.ts");
const assessmentEndpoint = load("src/app/api/evac/assess/route.ts");
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

test("Google route candidates receive deterministic terrain exposure and a provisional comparison rank", () => {
  const exposure = geo.terrainExposure(region, request.route.path);
  for (const value of Object.values(exposure)) assert(Number.isFinite(value) && value >= 0);
  assert(exposure.anyAttentionM <= geo.meters(request.route.path[0], request.route.path[1]) + 25);

  const parsed = routeAssessment.parseRouteAssessmentRequest({
    routes: [
      { id: "short", path: request.route.path, distanceM: 900, durationS: 480 },
      { id: "long", path: request.route.path, distanceM: 1200, durationS: 660 },
    ],
  });
  const result = routeAssessment.assessRouteCandidates(parsed);
  assert.equal(result.version, "training-google-v1");
  assert.equal(result.assessments.short.coverage, "full");
  assert.equal(result.assessments.short.rank, 1);
  assert.equal(result.assessments.long.rank, 2);
  assert(result.assessments.short.comparisonScore > result.assessments.long.comparisonScore);
  assert.equal(result.assessments.short.provisional, true);
  assert(result.assessments.short.notes.some((note) => note.includes("安全性")));
});

test("route comparison keeps Google distance and time available outside local data coverage", () => {
  const result = routeAssessment.assessRouteCandidates(
    routeAssessment.parseRouteAssessmentRequest({
      routes: [{
        id: "outside",
        path: [{ lat: 35, lng: 135 }, { lat: 35.001, lng: 135 }],
        distanceM: 120,
        durationS: 100,
      }],
    }),
  );
  const assessment = result.assessments.outside;
  assert.equal(assessment.coverage, "outside");
  assert.equal(assessment.comparisonScore, null);
  assert.equal(assessment.terrain, null);
  assert(assessment.notes.some((note) => note.includes("範囲外")));
});

test("route comparison endpoint validates origin, body size and returns no-store assessments", async () => {
  const body = JSON.stringify({
    routes: [{ id: "one", path: request.route.path, distanceM: 900, durationS: 480 }],
  });
  const make = (value, origin = "http://localhost") => new Request("http://localhost/api/evac/assess", {
    method: "POST",
    headers: { origin, host: "localhost", "Content-Type": "application/json" },
    body: value,
  });
  assert.equal((await assessmentEndpoint.POST(make(body, "https://elsewhere.example"))).status, 403);
  assert.equal((await assessmentEndpoint.POST(make("{"))).status, 400);
  assert.equal((await assessmentEndpoint.POST(make("x".repeat(320001)))).status, 413);
  const response = await assessmentEndpoint.POST(make(body));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).assessments.one.coverage, "full");
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
  const before = global.fetch;
  global.fetch = async () => new Response(null, { status: 404 });
  try {
    await withKey(async () => {
      const rejected = await endpoint.POST(make(JSON.stringify(outside)));
      assert.equal(rejected.status, 422);
      assert.equal((await rejected.json()).code, "outside_coverage");
    });
  } finally { global.fetch = before; }
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
  const previousFetch = global.fetch;
  global.fetch = async () => new Response(null, {status:404});
  try { await withKey(async () => { assert.equal((await endpoint.POST(req)).status, 422); }); }
  finally { global.fetch = previousFetch; }
});

test("OpenAI mock mode serves fixture data through existing endpoints without provider calls", async () => {
  const beforeMode = process.env.OPENAI_MOCK_MODE;
  const beforeKey = process.env.OPENAI_API_KEY;
  const beforeFetch = global.fetch;
  process.env.OPENAI_MOCK_MODE = "true";
  process.env.OPENAI_API_KEY = "invalid-for-mock-test";
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("mock must not call OpenAI"); };
  try {
    for (const [kind, fixture] of [["analyze", "room-analysis"], ["aftermath", "room-aftermath"]]) {
      const handler = load(`src/app/api/room/${kind}/route.ts`);
      const response = await handler.POST(new Request(`http://localhost/api/room/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: "data:image/jpeg;base64,c2FtcGxl" }),
      }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), load(`src/data/mock/${fixture}.json`));
      const invalid = await handler.POST(new Request(`http://localhost/api/room/${kind}`, { method: "POST", body: "{}" }));
      assert.equal(invalid.status, 400);
    }
    delete process.env.OPENAI_API_KEY;
    assert.equal(geo.geoConfig().aiConfigured, true);
    const result = await geo.analyzeGeoRoute(request, undefined, global.fetch);
    assert(result.points.length > 0);
    assert.match(result.note, /モックデータ/);
    assert(result.points.every((point) => matches.some((hit) => point.id.includes(hit.feature.id))));
    assert.equal(calls, 0);
    process.env.OPENAI_MOCK_MODE = "false";
    await assert.rejects(geo.analyzeGeoRoute(request), (error) => error.code === "ai_not_configured");
  } finally {
    if (beforeMode === undefined) delete process.env.OPENAI_MOCK_MODE; else process.env.OPENAI_MOCK_MODE = beforeMode;
    if (beforeKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = beforeKey;
    global.fetch = beforeFetch;
  }
});

const dynamicGeo = load("src/lib/server/route-geodata.ts");
const osakaPath = [{ lat: 34.702, lng: 135.495 }, { lat: 34.703, lng: 135.495 }];
const terrainTile = (code = "10701", east = 135.6) => ({
  type: "FeatureCollection", features: [{ type: "Feature", properties: { code }, geometry: {
    type: "Polygon", coordinates: [[[135.4,34.6],[east,34.6],[east,34.8],[135.4,34.8],[135.4,34.6]]],
  } }],
});

test("route tiles include intervening segments and both sides of tile boundaries", () => {
  const tiles = dynamicGeo.routeTiles([{ lat: 34.7, lng: 135.4 }, { lat: 34.7, lng: 135.5 }]);
  assert(tiles.length >= 5);
  const xs = [...new Set(tiles.map(t => t.x))].sort((a,b) => a-b);
  assert.equal(xs.at(-1) - xs[0] + 1, xs.length);
  const boundary = 14359 / 16384 * 360 - 180;
  const edge = dynamicGeo.routeTiles([{lat:34.7,lng:boundary},{lat:34.701,lng:boundary}]);
  assert(edge.some(t => t.x === 14358));
  assert(edge.some(t => t.x === 14359));
});

test("unlisted addresses load real-format tiles with traceable evidence and grounded AI candidates", async () => {
  const urls = [];
  const fetcher = async (url, options) => {
    urls.push(url);
    if (url.startsWith("https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification1/14/")) return Response.json(terrainTile());
    const input = JSON.parse(JSON.parse(options.body).input[0].content);
    return response({candidates:[{ featureId:input.features[0].featureId, category:"liquefaction", reason:"地形分類に基づく練習", uncertainties:["現地未確認"] }]});
  };
  const r = await dynamicGeo.loadRouteRegion(osakaPath, undefined, fetcher);
  assert(r.id.startsWith("gsi-route-"));
  assert(r.version.length === 16);
  assert(r.features.length > 0);
  await withKey(async () => {
    const result = await geo.analyzeGeoRoute({route:{id:"osaka",path:osakaPath,durationS:300},excludedEventIds:[]}, undefined, fetcher);
    assert.equal(result.points.length, 1);
    assert(result.regionIds[0].startsWith("gsi-route-"));
  });
  assert(urls.some(url => url.includes("cyberjapandata")));
});

test("dynamic comparison uses downloaded terrain outside preset areas", async () => {
  const result = await routeAssessment.assessDynamicRouteCandidates({routes:[{id:"osaka",path:osakaPath,distanceM:120,durationS:100}]}, undefined, async () => Response.json(terrainTile()));
  assert.equal(result.assessments.osaka.coverage, "full");
  assert(result.assessments.osaka.terrain.liquefactionM > 0);
});

test("missing, partially covered and unknown terrain cannot become a successful empty analysis", async () => {
  for (const fetcher of [
    async () => new Response(null,{status:404}),
    async () => Response.json(terrainTile("10701",135.494)),
    async () => Response.json(terrainTile("new-unknown-code")),
    async () => Response.json({type:"FeatureCollection",features:[]}),
  ]) await assert.rejects(dynamicGeo.loadRouteRegion(osakaPath,undefined,fetcher), e => e.code === "outside_coverage");
});

test("transport failures and invalid polygons are retryable errors, and cancellation propagates", async () => {
  const broken = terrainTile(); broken.features[0].geometry.coordinates[0].pop();
  for (const fetcher of [
    async () => new Response(null,{status:503}),
    async () => { throw new Error("offline"); },
    async () => new Response("not json"),
    async () => Response.json(broken),
  ]) await assert.rejects(dynamicGeo.loadRouteRegion(osakaPath,undefined,fetcher), e => e.code === "geodata_unavailable");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(dynamicGeo.loadRouteRegion(osakaPath,controller.signal,async () => { throw new Error("must not fetch"); }), e => e.code === "cancelled");
});

test("preset data stays available without a tile download and weak-risk classifications stay excluded", async () => {
  const existing = await dynamicGeo.loadRouteRegion(request.route.path,undefined,async () => { throw new Error("must not fetch"); });
  assert.equal(existing.id, region.id);
  const tile = dynamicGeo.parseTerrainTile(terrainTile("10305"),{x:1,y:2});
  assert.deepEqual(tile[0].categories, []);
});
