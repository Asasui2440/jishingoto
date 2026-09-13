"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng, RouteOption, Shelter } from "@/lib/evac-content";
import type { EvacMode } from "@/lib/evac-mode";
import { hasMapsKey, loadMaps, onMapsAuthError } from "@/lib/gmaps";

export type MapMarker = {
  id: string;
  position: LatLng;
  /** 丸の中に出す短いラベル（数字や記号） */
  label: string;
  color: string;
  title?: string;
  onClick?: () => void;
};

type Props = {
  mode: EvacMode;
  center: LatLng;
  /** 自宅として指定した地点 */
  home?: LatLng | null;
  shelters?: Shelter[];
  selectedShelterId?: string | null;
  routes?: RouteOption[];
  activeRouteId?: string | null;
  /** 判断地点など、経路上に置くマーカー */
  markers?: MapMarker[];
  /** 現在地（歩いている途中の位置） */
  walker?: LatLng | null;
  walkerHeading?: number;
  /** 計画の線に重ねる、体験中に通った道。 */
  traveledPath?: LatLng[];
  onPickHome?: (p: LatLng) => void;
  onSelectShelter?: (id: string) => void;
  onSelectRoute?: (id: string) => void;
  height?: number;
  className?: string;
};

const ROUTE_COLORS: Record<RouteOption["kind"], string> = {
  short: "#b87d00",
  safe: "#2ec4b6",
};

/** モックと実地図を明確に分け、API障害時は模式図へ切り替えない。 */
export function EvacMap(props: Props) {
  return props.mode === "mock" ? <DemoMapView {...props} /> : <GoogleMapLoader {...props} />;
}

function GoogleMapLoader(props: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(hasMapsKey() ? "loading" : "error");
  useEffect(() => {
    if (!hasMapsKey()) return;
    let alive = true;
    const unsubscribe = onMapsAuthError(() => { if (alive) setStatus("error"); });
    void loadMaps().then(() => { if (alive) setStatus("ready"); }).catch(() => { if (alive) setStatus("error"); });
    return () => { alive = false; unsubscribe(); };
  }, []);
  if (status === "ready") return <GoogleMapView {...props} />;
  return <div role={status === "error" ? "alert" : "status"} style={{ minHeight: props.height ?? 240 }} className={`flex flex-col items-center justify-center gap-3 rounded-panel border border-border bg-canvas p-5 text-center ${props.className ?? ""}`}>
    <p className="text-13 text-ink-muted">{status === "loading" ? "Googleマップを読み込んでいます…" : hasMapsKey() ? "Googleマップを読み込めませんでした。通信またはキーの設定を確認してください。" : "Googleマップのキーが未設定です。入口で設定を確認してください。"}</p>
    {status === "error" ? <button type="button" onClick={() => window.location.reload()} className="min-h-11 text-13 font-bold text-primary-ink underline">ページを読み直す</button> : null}
  </div>;
}

/* ------------------------------------------------------------------ */
/* Google Maps 版                                                       */
/* ------------------------------------------------------------------ */

function GoogleMapView({
  center,
  home,
  shelters = [],
  selectedShelterId,
  routes = [],
  activeRouteId,
  markers = [],
  walker,
  walkerHeading = 0,
  traveledPath,
  onPickHome,
  onSelectShelter,
  onSelectRoute,
  height = 240,
  className = "",
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const viewportRef = useRef("");
  // IDごとに表示オブジェクトを保持し、歩くたびに消して作り直さない。
  const pins = useRef(new Map<string, { marker: google.maps.Marker; signature: string; onClick?: () => void }>());
  const lines = useRef(new Map<string, { line: google.maps.Polyline; signature: string }>());
  const walkerRef = useRef<{ marker: google.maps.Marker; position: LatLng; heading: number } | null>(null);
  const trailRef = useRef<{ line: google.maps.Polyline; signature: string } | null>(null);
  const hasTrail = traveledPath !== undefined;
  // クリックのハンドラは ref 経由で渡す（地図は作り直さない）
  const clickRef = useRef(onPickHome);
  useEffect(() => {
    clickRef.current = onPickHome;
  }, [onPickHome]);
  // 経路のクリックも同様。呼び出し側が毎回新しい関数を渡してきても、
  // 経路や避難場所を描き直さずに済むようにする。
  const routeClickRef = useRef(onSelectRoute);
  useEffect(() => {
    routeClickRef.current = onSelectRoute;
  }, [onSelectRoute]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const mapPins = pins.current;
    const mapLines = lines.current;
    let alive = true;
    void loadMaps().then((maps) => {
      if (!alive || !boxRef.current || mapRef.current) return;
      const map = new maps.Map(boxRef.current, {
        center,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        mapTypeId: "roadmap",
        streetViewControl: false,
        mapTypeControl: false,
        tilt: 0,
      });
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng && clickRef.current) {
          clickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      });
      mapRef.current = map;
      viewportRef.current = "";
      // 生成できたら、下の effect が中身を描きにくる
      setMapReady(true);
    });
    return () => {
      alive = false;
      const event = window.google?.maps?.event;
      for (const { marker } of mapPins.values()) { marker.setMap(null); event?.clearInstanceListeners(marker); }
      for (const { line } of mapLines.values()) { line.setMap(null); event?.clearInstanceListeners(line); }
      mapPins.clear();
      mapLines.clear();
      if (walkerRef.current) { walkerRef.current.marker.setMap(null); event?.clearInstanceListeners(walkerRef.current.marker); }
      if (trailRef.current) { trailRef.current.line.setMap(null); event?.clearInstanceListeners(trailRef.current.line); }
      walkerRef.current = null;
      trailRef.current = null;
      if (mapRef.current) event?.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
    };
    // 地図の生成は1回だけ。中身の同期は下の effect が受け持つ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 固定のピンと予定経路。親が毎回配列を作っても、内容が同じならSDKを更新しない。
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!map || !maps) return;
    const livePins = new Set<string>();
    const liveLines = new Set<string>();
    const pin = (id: string, position: LatLng, color: string, label: string, title?: string, onClick?: () => void) => {
      livePins.add(id);
      const options: google.maps.MarkerOptions = {
        position, title, clickable: !!onClick,
        label: { text: label, color: "#1a202c", fontSize: "11px", fontWeight: "700" },
        icon: { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
      };
      const signature = JSON.stringify(options);
      const existing = pins.current.get(id);
      if (existing) {
        existing.onClick = onClick;
        if (existing.signature !== signature) { existing.marker.setOptions(options); existing.signature = signature; }
      } else {
        const layer = { marker: new maps.Marker({ ...options, map }), signature, onClick };
        layer.marker.addListener("click", () => layer.onClick?.());
        pins.current.set(id, layer);
      }
    };

    for (const route of routes) {
      liveLines.add(route.id);
      const active = route.id === activeRouteId;
      const options: google.maps.PolylineOptions = {
        path: route.path, strokeColor: hasTrail ? "#b87d00" : ROUTE_COLORS[route.kind],
        strokeOpacity: hasTrail ? 0 : active ? 1 : 0.45,
        icons: hasTrail ? [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.65, strokeWeight: 3, scale: 2 }, offset: "0", repeat: "12px" }] : [],
        strokeWeight: active ? 8 : 5, zIndex: active ? 2 : 1, clickable: !!onSelectRoute,
      };
      const signature = JSON.stringify(options);
      const existing = lines.current.get(route.id);
      if (existing) {
        if (existing.signature !== signature) { existing.line.setOptions(options); existing.signature = signature; }
      } else {
        const line = new maps.Polyline({ ...options, map });
        line.addListener("click", () => routeClickRef.current?.(route.id));
        lines.current.set(route.id, { line, signature });
      }
    }

    if (home) pin("home", home, "#ffcc00", "家", "指定した地点");
    for (const shelter of shelters) {
      pin(`shelter:${shelter.id}`, shelter.position, shelter.id === selectedShelterId ? "#2ec4b6" : "#cbd5e0", "避", shelter.name.replace(/\[[^\]]*\]/g, ""), onSelectShelter ? () => onSelectShelter(shelter.id) : undefined);
    }
    for (const marker of markers) pin(`event:${marker.id}`, marker.position, marker.color, marker.label, marker.title, marker.onClick);

    // 迂回などでなくなったものだけ取り外す。
    for (const [id, layer] of pins.current) if (!livePins.has(id)) {
      layer.marker.setMap(null); maps.event.clearInstanceListeners(layer.marker); pins.current.delete(id);
    }
    for (const [id, layer] of lines.current) if (!liveLines.has(id)) {
      layer.line.setMap(null); maps.event.clearInstanceListeners(layer.line); lines.current.delete(id);
    }
  }, [mapReady, home, shelters, selectedShelterId, routes, activeRouteId, markers, hasTrail, onSelectShelter, onSelectRoute]);

  // コマは同じインスタンスの座標だけを更新する。向きが変わったときだけアイコンを更新。
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!map || !maps) return;
    if (!walker) {
      if (walkerRef.current) { walkerRef.current.marker.setMap(null); maps.event.clearInstanceListeners(walkerRef.current.marker); walkerRef.current = null; }
      return;
    }
    const icon: google.maps.Symbol = { path: maps.SymbolPath.FORWARD_CLOSED_ARROW, rotation: walkerHeading, scale: 6, fillColor: "#ffcc00", fillOpacity: 1, strokeColor: "#5b420b", strokeWeight: 2 };
    const current = walkerRef.current;
    if (!current) {
      walkerRef.current = { marker: new maps.Marker({ map, position: walker, icon, title: "体験中の現在地（GPS追跡ではありません）", zIndex: 10, clickable: false }), position: walker, heading: walkerHeading };
    } else {
      if (current.position.lat !== walker.lat || current.position.lng !== walker.lng) { current.marker.setPosition(walker); current.position = walker; }
      if (current.heading !== walkerHeading) { current.marker.setIcon(icon); current.heading = walkerHeading; }
    }
  }, [mapReady, walker, walkerHeading]);

  // 通った道も作り直さず、同じ線の座標列を伸ばす。
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!map || !maps) return;
    const path = traveledPath ?? [];
    const signature = JSON.stringify(path);
    const current = trailRef.current;
    if (current) {
      if (current.signature !== signature) {
        current.line.setPath(path); current.line.setVisible(path.length > 1); current.signature = signature;
      }
    } else if (path.length > 1) {
      trailRef.current = { line: new maps.Polyline({ map, path, strokeColor: "#8a5a00", strokeWeight: 5, zIndex: 3, clickable: false }), signature };
    }
  }, [mapReady, traveledPath]);

  // 画角は場所か経路が変わったときだけ合わせる。コマの進行やズーム操作には追従しない。
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!map || !maps) return;
    const viewportKey = JSON.stringify([home, shelters.map((s) => s.position), routes.map((r) => r.path)]);
    if (viewportRef.current === viewportKey) return;
    viewportRef.current = viewportKey;
    const pts = [...(home ? [home] : []), ...shelters.map((s) => s.position), ...routes.flatMap((r) => r.path), ...(traveledPath ?? [])];
    if (pts.length > 1) {
      const bounds = new maps.LatLngBounds();
      for (const point of pts) bounds.extend(point);
      map.fitBounds(bounds, 40);
    } else if (pts.length === 1) {
      map.setCenter(pts[0]); map.setZoom(16);
    }
  }, [mapReady, home, shelters, routes, traveledPath]);

  return (
    <div className={["relative overflow-hidden rounded-panel", className].join(" ")}>
      <div ref={boxRef} style={{ height }} className="w-full" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* モック版（外部の地図は読み込まない）                                     */
/* ------------------------------------------------------------------ */

const W = 354;

function DemoMapView({
  center,
  home,
  shelters = [],
  selectedShelterId,
  routes = [],
  activeRouteId,
  markers = [],
  walker,
  walkerHeading = 0,
  traveledPath,
  onPickHome,
  onSelectShelter,
  onSelectRoute,
  height = 240,
  className = "",
  loading = false,
}: Props & { loading?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapWidth, setMapWidth] = useState(W);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setMapWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const pts: LatLng[] = [
    center,
    ...(home ? [home] : []),
    ...shelters.map((s) => s.position),
    ...routes.flatMap((r) => r.path),
    ...(walker ? [walker] : []),
    ...(traveledPath ?? []),
  ];

  // 表示範囲。すべての点が入るように少し余白をとる。
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.25, 0.0016);
  const padLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.25, 0.002);
  const minLat = Math.min(...lats) - padLat;
  const maxLat = Math.max(...lats) + padLat;
  const minLng = Math.min(...lngs) - padLng;
  const maxLng = Math.max(...lngs) + padLng;

  const project = useCallback(
    (p: LatLng) => ({
      x: ((p.lng - minLng) / (maxLng - minLng)) * mapWidth,
      y: (1 - (p.lat - minLat) / (maxLat - minLat)) * height,
    }),
    [minLng, maxLng, minLat, maxLat, height, mapWidth],
  );

  const unproject = (x: number, y: number): LatLng => ({
    lng: minLng + (x / mapWidth) * (maxLng - minLng),
    lat: minLat + (1 - y / height) * (maxLat - minLat),
  });

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPickHome) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * mapWidth;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    onPickHome(unproject(x, y));
  };

  const toPath = (path: LatLng[]) =>
    path
      .map((p, i) => {
        const { x, y } = project(p);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div ref={containerRef} className={["relative overflow-hidden rounded-panel bg-canvas", className].join(" ")}>
      <svg
        viewBox={`0 0 ${mapWidth} ${height}`}
        style={{ height }}
        className={["w-full", onPickHome ? "cursor-crosshair" : ""].join(" ")}
        onClick={handleClick}
        role={onPickHome ? "button" : "img"}
        aria-label="練習用の2D模式図。番号は判断ポイント、矢印は体験中の現在地"
      >
        <rect width={mapWidth} height={height} fill="#f4f1e7" />
        {/* 街区っぽい格子。地図の代わりの飾りで、実際の道路ではない。 */}
        {Array.from({ length: 7 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={(mapWidth / 7) * i + 20}
            y1={0}
            x2={(mapWidth / 7) * i + 20}
            y2={height}
            stroke="#fffdfa"
            strokeWidth="10"
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={(height / 5) * i + 16}
            x2={mapWidth}
            y2={(height / 5) * i + 16}
            stroke="#fffdfa"
            strokeWidth="10"
          />
        ))}

        {routes.map((r) => (
          <g
            key={r.id}
            onClick={onSelectRoute ? (e) => { e.stopPropagation(); onSelectRoute(r.id); } : undefined}
            className={onSelectRoute ? "cursor-pointer" : ""}
          >
            {/* タップしやすい透明な太線 */}
            {onSelectRoute ? (
              <path
                d={toPath(r.path)}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                strokeLinecap="round"
              />
            ) : null}
            <path
              d={toPath(r.path)}
              fill="none"
              stroke={traveledPath ? "#b87d00" : ROUTE_COLORS[r.kind]}
              strokeDasharray={traveledPath ? "5 8" : undefined}
              strokeWidth={traveledPath ? 3 : r.id === activeRouteId ? 7 : 5}
              strokeOpacity={r.id === activeRouteId ? 1 : 0.45}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ))}

        {traveledPath && traveledPath.length > 1 ? <path d={toPath(traveledPath)} fill="none" stroke="#8a5a00" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : null}

        {shelters.map((s) => {
          const { x, y } = project(s.position);
          return (
            <g
              key={s.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectShelter?.(s.id);
              }}
              className={onSelectShelter ? "cursor-pointer" : ""}
            >
              <circle
                cx={x}
                cy={y}
                r="13"
                fill={s.id === selectedShelterId ? "#2ec4b6" : "#cbd5e0"}
                stroke="#fff"
                strokeWidth="2"
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#1a202c"
              >
                避
              </text>
            </g>
          );
        })}

        {markers.map((m) => {
          const { x, y } = project(m.position);
          return (
            <g key={m.id} role={m.onClick ? "button" : undefined} tabIndex={m.onClick ? 0 : undefined} aria-label={m.title} onClick={m.onClick ? (e) => { e.stopPropagation(); m.onClick?.(); } : undefined} onKeyDown={m.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); m.onClick?.(); } } : undefined} className={m.onClick ? "cursor-pointer" : ""}>
              <title>{m.title}</title>
              <circle cx={x} cy={y} r="12" fill={m.color} stroke="#fff" strokeWidth="2" />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#1a202c"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {home
          ? (() => {
              const { x, y } = project(home);
              return (
                <g>
                  <circle cx={x} cy={y} r="13" fill="#ffcc00" stroke="#fff" strokeWidth="2" />
                  <text
                    x={x}
                    y={y + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#1a202c"
                  >
                    家
                  </text>
                </g>
              );
            })()
          : null}

        {walker
          ? (() => {
              const { x, y } = project(walker);
              return <g transform={`translate(${x} ${y})`} aria-label="体験中の現在地">
                <circle r="19" fill="#ffcc00" fillOpacity="0.23" />
                <circle r="13" fill="#ffcc00" stroke="#fff" strokeWidth="3" />
                <path d="M0 -8 L5 5 L0 2 L-5 5 Z" transform={`rotate(${walkerHeading})`} fill="#5b420b" />
              </g>;
            })()
          : null}
      </svg>

      <span className="absolute top-2 left-2 rounded-chip bg-surface/90 px-2 py-1 text-11 font-bold text-ink-muted">
        {loading ? "地図を読み込み中…" : "模式図 · 練習用"}
      </span>
      <span aria-hidden="true" className="absolute top-3 right-3 flex flex-col items-center text-11 font-bold text-ink-soft">N<span className="text-base">↑</span></span>
      <p className="bg-canvas px-3 py-1.5 text-[10px] text-ink-muted">模式図の街区・道路は実際の地図とは異なります。</p>
    </div>
  );
}
