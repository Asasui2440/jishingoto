// Deterministic SDK double: no real Google requests or image tiles.
(() => {
  const A = { lat: 35, lng: 139 }, B = { lat: 35.0003, lng: 139 }, C = { lat: 35.0003, lng: 139.0006 };
  const nodes = {
    A: { position: A, links: [{ pano: "B", heading: 0 }] },
    B: { position: B, links: [{ pano: "A", heading: 180 }, { pano: "C", heading: 90 }, { pano: "D", heading: 0 }] },
    C: { position: C, links: [{ pano: "B", heading: 270 }] },
    D: { position: { lat: 35.0006, lng: 139 }, links: [{ pano: "B", heading: 180 }] },
  };
  if (new URLSearchParams(location.search).has("streetAuto")) {
    nodes.A.links = [{ pano: "A2", heading: 0 }];
    nodes.A2 = { position: { lat: 35.0001, lng: 139 }, links: [{ pano: "A", heading: 180 }, { pano: "A3", heading: 0 }] };
    nodes.A3 = { position: { lat: 35.0002, lng: 139 }, links: [{ pano: "A2", heading: 180 }, { pano: "B", heading: 0 }] };
    nodes.B.links[0] = { pano: "A3", heading: 180 };
  }
  const params = new URLSearchParams(location.search);
  const path = params.get("routeChoice") === "north" ? [A, B, nodes.D.position, C] : [A, B, C];
  if (params.has("farCenter")) nodes.C.position = { lat: C.lat, lng: C.lng + 0.0005 };
  if (params.has("nearEndpoint")) nodes.C.position = { lat: C.lat, lng: C.lng - 0.0002 };
  nodes.D.links.push({ pano: "F", heading: 0 });
  nodes.F = { position: { lat: 35.0009, lng: 139 }, links: [{ pano: "D", heading: 180 }] };
  nodes.D.links.push({ pano: "C", heading: 120 });
  nodes.C.links.push({ pano: "E", heading: 90 });
  nodes.E = { position: { lat: C.lat, lng: C.lng + 0.001 }, links: [{ pano: "C", heading: 270 }] };
  if (params.has("disconnected")) nodes.B.links = [{ pano: "A", heading: 180 }];
  if (params.has("courtyard")) nodes.G = {position:{lat:C.lat + 0.0002,lng:C.lng},links:[{pano:"Z",heading:0}]};
  const decision = { id: "wall", kind: "wall", title: "壁の近くをどう進む？", situation: "訓練用の場面です。", choices: [{ id: "go", label: "周囲を確認して進む", detail: "確認して進みます。", extraSeconds: 0, reroute: false }] };
  const route = { id: "fixture", kind: "short", path, distanceM: 61, durationS: 60, notes: [], eventCount: 0 };
  sessionStorage.setItem("jishingoto.evac.v2", JSON.stringify({
    mode: "api", analysisMode: "sample", home: A, homeLabel: "出発地点", shelter: { id: "end", name: "避難先", position: C },
    routes: [route], startRouteId: route.id, takenRouteIds: [route.id], decisions: [], timerSeconds: 0,
    startedAt: 1, finishedAt: null, walk: { routeId: route.id, index: 0, steps: path.map((position, i) => ({
      id: `fixture:${i}`, position, t: i / 2, heading: i ? 90 : 0, remainingM: (2 - i) * 30,
      remainingS: (2 - i) * 30, travelSeconds: i ? 30 : 0,
      ...(params.has("decision") && i === 1 ? { pointId: "decision-b", event: decision } : {}),
      ...(params.has("missedQuestion") && i === 0 ? { pointId: "missed", event: { id: "wall" } } : {}),
    })) },
  }));
  class Events {
    listeners = {};
    addListener(name, fn) { (this.listeners[name] ??= new Set()).add(fn); return { remove: () => this.listeners[name].delete(fn) }; }
    emit(name, value) { this.listeners[name]?.forEach(fn => fn(value)); }
  }
  const test = window.streetTest = { moves: [], lookups: 0, positionCommands: 0, walker: null, pano: null, map: null, failNext: false };
  class Panorama extends Events {
    constructor(box, options) {
      super(); this.id = options.pano; this.pov = options.pov; test.options = options; test.pano = this;
      box.dataset.testid = "panorama-surface"; box.style.background = "#485d68"; box.tabIndex = 0;
      box.addEventListener("pointerdown", () => { this.pov = { heading: 90, pitch: 15 }; this.emit("pov_changed"); });
      setTimeout(() => this.emit("links_changed"), 0);
    }
    getPano() { return this.id; }
    getPosition() { return { lat: () => nodes[this.id].position.lat, lng: () => nodes[this.id].position.lng }; }
    getLinks() { return nodes[this.id].links; }
    getPov() { return this.pov; }
    setPov(pov) { this.pov = pov; this.emit("pov_changed"); }
    getStatus() { return this.status ?? "OK"; }
    setPano(id) {
      test.moves.push(id);
      if (test.failNext) { this.status = "ZERO_RESULTS"; this.emit("status_changed"); return; }
      if (!nodes[this.id].links.some(link => link.pano === id)) throw new Error("Nonadjacent move");
      setTimeout(() => { this.id = id; this.emit("position_changed"); this.emit("links_changed"); }, 30);
    }
    setPosition() { test.positionCommands++; throw new Error("Coordinate movement prohibited"); }
    setVisible() {}
  }
  class MapView extends Events {
    constructor(box) { super(); test.map = this; box.dataset.testid = "map-surface"; }
    fitBounds() {} setCenter() {} setZoom() {}
  }
  class Layer extends Events {
    constructor(options) { super(); this.setOptions(options); }
    setOptions(options) { this.options = options; if (options.title?.startsWith("体験中")) test.walker = options; }
    setPosition(position) { this.options.position = position; }
    setIcon(icon) { this.options.icon = icon; }
    setMap() {} setPath() {} setVisible() {}
  }
  window.google = { maps: {
    Map: MapView, StreetViewPanorama: Panorama,
    StreetViewService: class { async getPanorama(request) {
      test.lookups++;
      const isArrival = request.radius === 150;
      if (isArrival && params.has("missingArrival")) throw new Error("no outdoor node");
      if (request.pano && params.has("slowPlan")) await new Promise(resolve => setTimeout(resolve, 200));
      const id = request.pano ?? (isArrival ? params.has("courtyard") ? "G" : "C" : params.has("startAtB") ? "B" : "A");
      return { data: { links: nodes[id].links, location: { pano: id, latLng: { lat: () => nodes[id].position.lat, lng: () => nodes[id].position.lng } } } };
    } },
    StreetViewPreference: { NEAREST: "nearest" }, StreetViewSource: { OUTDOOR: "outdoor", GOOGLE: "google" },
    Marker: Layer, Polyline: Layer, SymbolPath: { CIRCLE: "circle", FORWARD_CLOSED_ARROW: "arrow" },
    LatLngBounds: class { extend() {} }, event: { trigger: (target, name) => target.emit(name), clearInstanceListeners() {} },
  } };
})();
