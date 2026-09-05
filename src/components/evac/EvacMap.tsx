"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng, RouteOption, Shelter } from "@/lib/evac-content";
import { hasMapsKey, loadMaps } from "@/lib/gmaps";

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
  onPickHome?: (p: LatLng) => void;
  onSelectShelter?: (id: string) => void;
  height?: number;
  className?: string;
};

const ROUTE_COLORS: Record<RouteOption["kind"], string> = {
  short: "#b87d00",
  safe: "#2ec4b6",
};

/**
 * 地図。
 *
 * Maps JS が使えるときは本物の地図を出し、
 * 使えないときは同じ情報を持つ簡易マップ（デモ表示）に落ちる。
 * どちらでも props と操作は同じ。
 */
export function EvacMap(props: Props) {
  const [ready, setReady] = useState<"loading" | "maps" | "demo">(
    hasMapsKey() ? "loading" : "demo",
  );

  useEffect(() => {
    if (!hasMapsKey()) return;
    let alive = true;
    loadMaps()
      .then(() => alive && setReady("maps"))
      .catch(() => alive && setReady("demo"));
    return () => {
      alive = false;
    };
  }, []);

  if (ready === "maps") return <GoogleMapView {...props} />;
  return <DemoMapView {...props} loading={ready === "loading"} />;
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
  onPickHome,
  onSelectShelter,
  height = 240,
  className = "",
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  // 描き直すたびに消す一時オブジェクト
  const overlays = useRef<(google.maps.Polyline | google.maps.Marker)[]>([]);
  // クリックのハンドラは ref 経由で渡す（地図は作り直さない）
  const clickRef = useRef(onPickHome);
  useEffect(() => {
    clickRef.current = onPickHome;
  }, [onPickHome]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
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
      });
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng && clickRef.current) {
          clickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      });
      mapRef.current = map;
      // 生成できたら、下の effect が中身を描きにくる
      setMapReady(true);
    });
    return () => {
      alive = false;
    };
    // 地図の生成は1回だけ。中身の同期は下の effect が受け持つ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // マーカー・経路の同期
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!map || !maps) return;

    for (const o of overlays.current) o.setMap(null);
    overlays.current = [];

    const pin = (
      position: LatLng,
      color: string,
      label: string,
      title?: string,
      onClick?: () => void,
    ) => {
      const marker = new maps.Marker({
        position,
        map,
        title,
        label: { text: label, color: "#1a202c", fontSize: "11px", fontWeight: "700" },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      if (onClick) marker.addListener("click", onClick);
      overlays.current.push(marker);
    };

    for (const route of routes) {
      const active = route.id === activeRouteId;
      const line = new maps.Polyline({
        map,
        path: route.path,
        strokeColor: ROUTE_COLORS[route.kind],
        strokeOpacity: active ? 1 : 0.45,
        strokeWeight: active ? 6 : 4,
        zIndex: active ? 2 : 1,
      });
      overlays.current.push(line);
    }

    if (home) pin(home, "#ffcc00", "家", "指定した地点");
    for (const s of shelters) {
      pin(
        s.position,
        s.id === selectedShelterId ? "#2ec4b6" : "#cbd5e0",
        "避",
        s.name.replace(/\[[^\]]*\]/g, ""),
        onSelectShelter ? () => onSelectShelter(s.id) : undefined,
      );
    }
    for (const m of markers) pin(m.position, m.color, m.label, m.title, m.onClick);
    if (walker) pin(walker, "#e53e3e", "現", "いまいる場所");

    // 全体が入るように寄せる
    const pts = [
      ...(home ? [home] : []),
      ...shelters.map((s) => s.position),
      ...routes.flatMap((r) => r.path),
      ...(walker ? [walker] : []),
    ];
    if (pts.length > 1) {
      const bounds = new maps.LatLngBounds();
      for (const p of pts) bounds.extend(p);
      map.fitBounds(bounds, 40);
    } else if (pts.length === 1) {
      map.setCenter(pts[0]);
    }
  }, [
    mapReady,
    home,
    shelters,
    selectedShelterId,
    routes,
    activeRouteId,
    markers,
    walker,
    onSelectShelter,
  ]);

  return (
    <div className={["relative overflow-hidden rounded-panel", className].join(" ")}>
      <div ref={boxRef} style={{ height }} className="w-full" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* デモ表示（Maps を読み込めないとき）                                     */
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
  onPickHome,
  onSelectShelter,
  height = 240,
  className = "",
  loading = false,
}: Props & { loading?: boolean }) {
  const pts: LatLng[] = [
    center,
    ...(home ? [home] : []),
    ...shelters.map((s) => s.position),
    ...routes.flatMap((r) => r.path),
    ...(walker ? [walker] : []),
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
      x: ((p.lng - minLng) / (maxLng - minLng)) * W,
      y: (1 - (p.lat - minLat) / (maxLat - minLat)) * height,
    }),
    [minLng, maxLng, minLat, maxLat, height],
  );

  const unproject = (x: number, y: number): LatLng => ({
    lng: minLng + (x / W) * (maxLng - minLng),
    lat: minLat + (1 - y / height) * (maxLat - minLat),
  });

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPickHome) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
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
    <div className={["relative overflow-hidden rounded-panel bg-canvas", className].join(" ")}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        style={{ height }}
        className={["w-full", onPickHome ? "cursor-crosshair" : ""].join(" ")}
        onClick={handleClick}
        role={onPickHome ? "button" : "img"}
        aria-label="簡易地図（デモ表示）"
      >
        <rect width={W} height={height} fill="#eef2f7" />
        {/* 街区っぽい格子。地図の代わりの飾りで、実際の道路ではない。 */}
        {Array.from({ length: 7 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={(W / 7) * i + 20}
            y1={0}
            x2={(W / 7) * i + 20}
            y2={height}
            stroke="#dde5ee"
            strokeWidth="10"
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={(height / 5) * i + 16}
            x2={W}
            y2={(height / 5) * i + 16}
            stroke="#dde5ee"
            strokeWidth="10"
          />
        ))}

        {routes.map((r) => (
          <path
            key={r.id}
            d={toPath(r.path)}
            fill="none"
            stroke={ROUTE_COLORS[r.kind]}
            strokeWidth={r.id === activeRouteId ? 6 : 4}
            strokeOpacity={r.id === activeRouteId ? 1 : 0.45}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

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
            <g key={m.id}>
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
              return <circle cx={x} cy={y} r="8" fill="#e53e3e" stroke="#fff" strokeWidth="2" />;
            })()
          : null}
      </svg>

      <span className="absolute top-2 left-2 rounded-chip bg-surface/90 px-2 py-1 text-11 font-bold text-ink-muted">
        {loading ? "地図を読み込み中..." : "デモ表示（地図APIなし）"}
      </span>
    </div>
  );
}
