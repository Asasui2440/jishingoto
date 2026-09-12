"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EvacApiGate, EvacModeSelector } from "@/components/evac/EvacMode";
import { parseEvacMode, type EvacMode } from "@/lib/evac-mode";
import { EvacMap } from "@/components/evac/EvacMap";
import { RoomConnectionSummary } from "@/components/evac/RoomConnectionSummary";
import { getSession } from "@/lib/session";
import { GeoAnalysisSettings } from "@/components/evac/GeoAnalysisSettings";
import { Tag } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { Screen } from "@/components/ui/Screen";
import { distanceM, fetchShelters, geocodeAddress } from "@/lib/evac-api";
import {
  DEMO_AREA_LABEL,
  DEMO_HOME,
  SHELTER_CAUTION,
  LOCATION_NOTICE,
  SHELTER_SOURCE_LINK,
  SIM_CONDITIONS,
  type LatLng,
  type Shelter,
} from "@/lib/evac-content";
import { formatDistance, getEvac, useEvac } from "@/lib/evac";

/**
 * フェーズ2 ①：自宅付近の指定と、避難場所の確認。
 *
 * 「避難場所を一つ確認する」が最優先の行動目標（仕様 2）なので、
 * ここは地図と一覧の2通りで選べるようにしている。
 */
export default function EvacStartPage() {
  const { mode, setMode, linkRoom } = useEvac();
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = parseEvacMode(params.get("mode"));
    if (requested) setMode(requested);
    if (params.get("from") === "room") linkRoom(getSession().finishedAt);
    else if (params.get("from") === "standalone") linkRoom(null);
    // URLと保存済みモードの確定前は、外部通信を行う子画面をマウントしない。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true);
  }, [setMode, linkRoom]);
  const selectMode = (next: EvacMode) => {
    setMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    window.history.replaceState(null, "", url);
  };
  return <Screen><main className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
    <header>
      <p className="mb-2 text-11 font-bold text-primary-ink">フェーズ2</p>
      <h1 className="font-display text-xl font-bold text-ink"><Furigana text="ひなん経路[けいろ]シミュレーション" /></h1>
      <p className="mt-1 text-13 text-ink-muted"><Furigana text="地図[ちず]で道[みち]を選[えら]び、途中[とちゅう]の「もしも」を考[かんが]えよう。" /></p>
    </header>
    {initialized ? <>
      <RoomConnectionSummary />
      <EvacModeSelector mode={mode} onChange={selectMode} />
      <EvacApiGate key={mode} mode={mode}><EvacLocationForm key={mode} mode={mode} /></EvacApiGate>
    </> : <p role="status" className="text-13 text-ink-muted">体験を準備しています…</p>}
  </main></Screen>;
}

function EvacLocationForm({ mode }: { mode: EvacMode }) {
  const router = useRouter();
  const { home, homeLabel, shelter, update, reset } = useEvac();

  /** 取得できた一覧と、それがどの地点のものか。 */
  const [found, setFound] = useState<{ key: string; list: Shelter[]; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "denied">("idle");
  const [address, setAddress] = useState("");
  const [addressState, setAddressState] = useState<
    "idle" | "loading" | "notfound" | "too-coarse"
  >("idle");

  // 初回に体験を初期化する（フェーズ1の /camera と同じ考え方）。
  //
  // 判定は `getEvac()` でストアの「いまの値」を直接読む。
  // レンダー由来の `home` を見てはいけない: hydration の第1レンダーは
  // serverSnapshot（home: null）なので、この画面に戻ってくるたびに
  // 指定済みの現在地をデモ地点で上書きしてしまう。
  useEffect(() => {
    if (!getEvac().home) {
      update({ home: DEMO_HOME, homeLabel: mode === "mock" ? DEMO_AREA_LABEL : "文京区の周辺（開始地点）", startedAt: Date.now() });
    }
  }, [update, mode]);

  const spot = home ?? DEMO_HOME;
  const spotKey = `${mode}:${spot.lat},${spot.lng}:${attempt}`;

  /**
   * いま指定している地点の避難場所。まだ取れていなければ null（＝探している最中）。
   *
   * 一覧に「どの地点のものか」を持たせて突き合わせている。
   * こうしておくと、地点を変えた瞬間に前の場所の候補が消えるので、
   * 別の街の避難場所が「近く」として残って見えることがない。
   */
  const shelters = found?.key === spotKey ? found.list : null;

  // 指定した地点が変わるたびに、その地点の近くを探し直す。
  useEffect(() => {
    let alive = true;
    void fetchShelters(spot, mode).then((list) => {
      if (alive) setFound({ key: spotKey, list });
    }).catch((error: unknown) => {
      if (alive) setFound({ key: spotKey, list: [], error: error instanceof Error ? error.message : "避難場所を取得できませんでした。" });
    });
    return () => {
      alive = false;
    };
  }, [spotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 地点を変えたら、避難場所の選択はいったん外す（近くの候補が変わるため）
  const pickHome = useCallback(
    (p: LatLng, label: string) => update({ home: p, homeLabel: label, shelter: null }),
    [update],
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoState("denied");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive.current) return;
        setGeoState("idle");
        pickHome({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "いまいる場所");
      },
      () => { if (alive.current) setGeoState("denied"); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const searchAddress = async () => {
    const q = address.trim();
    if (!q) return;
    setAddressState("loading");
    try {
      const hit = await geocodeAddress(q);
      if (!alive.current) return;
      if (hit.ok) {
        pickHome(hit.position, hit.label);
        setAddressState("idle");
      } else {
        setAddressState(hit.reason);
      }
    } catch {
      if (!alive.current) return;
      setAddressState("notfound");
    }
  };

  return (
    <>
        {mode === "api" ? <GeoAnalysisSettings onPickRegion={(center, name) => pickHome(center, name)} /> : null}
        <div className="rounded-panel border border-primary/40 bg-primary-soft p-4">
          <p className="font-display text-15 font-bold text-ink"><Furigana text="道[みち]を選[えら]ぶ。その先[さき]を想像[そうぞう]する。" /></p>
          <ol className="mt-3 grid grid-cols-3 gap-2 text-center text-11 text-primary-ink">
            {["地図[ちず]を見[み]る", "途中[とちゅう]で判断[はんだん]", "経路[けいろ]をふりかえる"].map((text, i) => <li key={text}><span className="mx-auto mb-1 grid size-7 place-items-center rounded-full bg-primary font-display font-bold text-ink">{i + 1}</span><Furigana text={text} /></li>)}
          </ol>
          <p className="mt-3 text-11 text-ink-muted"><Furigana text="その場[ば]にいながら、地図[ちず]のコマを進[すす]める練習[れんしゅう]です。" /></p>
        </div>

        <Card className="p-[18px]">
          <p className="font-display text-sm font-bold text-ink">
            <Furigana text="今回[こんかい]の想定[そうてい]" />
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {SIM_CONDITIONS.map((c) => (
              <li key={c} className="text-13 text-ink-muted">
                ・<Furigana text={c} />
              </li>
            ))}
          </ul>
        </Card>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <p className="font-display text-15 font-bold text-ink">
              <Furigana text="1. 自分[じぶん]の家[いえ]の近[ちか]くを指定[してい]する" />
            </p>
            <span className="text-11 text-ink-soft">
              <Furigana text="地図[ちず]をタップでも可[か]" />
            </span>
          </div>

          {mode === "api" ? <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void searchAddress();
              }}
              placeholder="住所・駅名（例：文京区大塚2-1-1）"
              aria-label="住所を入力して家の近くを指定する"
              className="h-12 min-w-0 flex-1 rounded-field border border-border bg-surface px-3 text-15 text-ink placeholder:text-ink-faint"
            />
            <button
              type="button"
              onClick={() => void searchAddress()}
              className="h-12 shrink-0 rounded-field bg-primary px-4 font-display text-15 font-bold text-ink"
            >
              <Furigana text={addressState === "loading" ? "検索中" : "さがす"} />
            </button>
          </div> : <p className="text-11 text-ink-muted">モック版ではサンプル地点を使います。住所検索・現在地はAPI版で利用できます。</p>}
          {addressState === "notfound" ? (
            <p className="text-11 text-danger">
              <Furigana text="その住所[じゅうしょ]は見[み]つかりませんでした。地図[ちず]をタップしても指定[してい]できます。" />
            </p>
          ) : addressState === "too-coarse" ? (
            <p className="text-11 text-danger">
              <Furigana text="範囲[はんい]が広[ひろ]すぎます。町名[ちょうめい]や駅名[えきめい]など、もう少[すこ]しくわしく入[い]れてください。" />
            </p>
          ) : null}

          <EvacMap
            mode={mode}
            center={spot}
            home={home}
            shelters={shelters ?? []}
            selectedShelterId={shelter?.id ?? null}
            onPickHome={(p) => pickHome(p, "地図で指定した地点")}
            onSelectShelter={(id) =>
              update({ shelter: shelters?.find((s) => s.id === id) ?? null })
            }
            height={230}
          />

          {mode === "api" ? <div className="flex gap-2">
            <Button size="md" variant="outline" onClick={useMyLocation}>
              {geoState === "loading" ? (
                "現在地をさがしています..."
              ) : (
                <Furigana text="現在地[げんざいち]を使[つか]う" />
              )}
            </Button>
            <Button
              size="md"
              variant="quiet"
              onClick={() => pickHome(DEMO_HOME, "文京区の周辺（開始地点）")}
            >
              <Furigana text="開始地点[かいしちてん]" />
            </Button>
          </div> : null}
          {geoState === "denied" ? (
            <p className="text-11 text-ink-soft">
              <Furigana text="現在地[げんざいち]を取得[しゅとく]できませんでした。地図[ちず]をタップして指定[してい]してください。" />
            </p>
          ) : null}
          <p className="text-11 text-ink-soft">
            <Furigana text="いま指定[してい]しているのは：" />
            <span className="font-display font-bold text-ink-muted">
              <Furigana text={homeLabel ?? "—"} />
            </span>
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text="2. 近[ちか]くの避難場所[ひなんばしょ]をひとつ選[えら]ぶ" />
          </p>
          <p className="text-11 text-ink-soft">
            <Furigana text={mode === "mock" ? "サンプルの避難場所[ひなんばしょ]から選[えら]んでください。" : SHELTER_CAUTION} />
          </p>
          {shelters === null ? (
            <p className="text-13 text-ink-muted"><Furigana text="近くの避難場所をさがしています..." /></p>
          ) : found?.key === spotKey && found.error ? (
            <Card className="p-4"><p role="alert" className="text-13 text-ink-muted">{found.error}</p><button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 min-h-11 text-13 font-bold text-primary-ink underline">もう一度さがす</button></Card>
          ) : shelters.length === 0 ? (
            <Card className="bg-canvas p-[18px] shadow-none">
              <p className="text-13 leading-[1.6] text-ink-muted">
                <Furigana text={mode === "mock" ? "サンプル地点[ちてん]の近[ちか]くで試[ため]してください。" : "この地点[ちてん]の近[ちか]くでは避難場所[ひなんばしょ]の候補[こうほ]が見[み]つかりませんでした。別[べつ]の地点[ちてん]や自治体[じちたい]の一覧[いちらん]でも確認[かくにん]してください。"} />
              </p>
              <div className="mt-3">
                <Button
                  size="md"
                  variant="outline"
                  onClick={() => pickHome(DEMO_HOME, mode === "mock" ? DEMO_AREA_LABEL : "文京区の周辺（開始地点）")}
                >
                  <Furigana text="開始地点[かいしちてん]に戻[もど]る" />
                </Button>
              </div>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {shelters.map((s) => {
                const on = shelter?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => update({ shelter: s })}
                      aria-pressed={on}
                      className={[
                        "w-full rounded-tile border bg-surface p-3.5 text-left transition-colors",
                        on ? "border-primary-mid bg-primary-soft" : "border-border",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-2">
                        <Tag color="var(--color-safe)" soft="var(--color-safe-soft)">
                          {s.kind}
                        </Tag>
                        <span className="font-display text-15 font-bold text-ink">
                          <Furigana text={s.name} />
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-ink-muted">
                        {s.address}
                        <span className="ml-2 font-display font-bold text-primary-ink">
                          {formatDistance(distanceM(spot, s.position))}
                        </span>
                      </span>
                      {s.note ? (
                        <span className="mt-1 block text-11 text-ink-soft">
                          <Furigana text={s.note} />
                        </span>
                      ) : null}
                      <span className="mt-1 block text-11 text-ink-faint">出典：{s.source}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <a
            href={SHELTER_SOURCE_LINK.url}
            target="_blank"
            rel="noreferrer"
            className="text-11 text-primary-ink underline underline-offset-2"
          >
            {SHELTER_SOURCE_LINK.label}
          </a>
        </section>

        <Card className="bg-canvas p-[18px] shadow-none">
          <p className="font-display text-13 font-bold text-ink">
            <Furigana text="位置情報[いちじょうほう]の使[つか]いみち" />
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {LOCATION_NOTICE.map((t) => (
              <li key={t} className="text-11 leading-[1.5] text-ink-muted">
                ・<Furigana text={t} />
              </li>
            ))}
          </ul>
        </Card>

        <Button
          disabled={!shelter || !shelters?.some((s) => s.id === shelter.id)}
          onClick={() => {
            // 経路の選び直しに備えて、判断の記録だけ空にする
            const h = home ?? DEMO_HOME;
            const label = homeLabel;
            const s = shelter;
            reset();
            update({ home: h, homeLabel: label, shelter: s });
            router.push("/evac/routes");
          }}
        >
          <Furigana text="候補[こうほ]ルートを見[み]る" />
        </Button>
    </>
  );
}
