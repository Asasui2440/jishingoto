"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EvacMap } from "@/components/evac/EvacMap";
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
  const router = useRouter();
  const { home, homeLabel, shelter, update, reset } = useEvac();

  /** 取得できた一覧と、それがどの地点のものか。 */
  const [found, setFound] = useState<{ key: string; list: Shelter[] } | null>(null);
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
      update({ home: DEMO_HOME, homeLabel: DEMO_AREA_LABEL, startedAt: Date.now() });
    }
  }, [update]);

  const spot = home ?? DEMO_HOME;
  const spotKey = `${spot.lat},${spot.lng}`;

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
    void fetchShelters(spot).then((list) => {
      if (alive) setFound({ key: spotKey, list });
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
        setGeoState("idle");
        pickHome({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "いまいる場所");
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const searchAddress = async () => {
    const q = address.trim();
    if (!q) return;
    setAddressState("loading");
    try {
      const hit = await geocodeAddress(q);
      if (hit.ok) {
        pickHome(hit.position, hit.label);
        setAddressState("idle");
      } else {
        setAddressState(hit.reason);
      }
    } catch {
      setAddressState("notfound");
    }
  };

  return (
    <Screen>
      <main className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
        <header>
          <div className="flex items-center gap-2">
            <span className="rounded-field bg-primary-soft px-2 py-0.5 font-display text-11 font-black text-primary-ink">
              フェーズ2
            </span>
            <h1 className="font-display text-xl font-bold text-ink">
              <Furigana text="ひなん経路[けいろ]シミュレーション" />
            </h1>
          </div>
          <p className="mt-1 text-13 text-ink-muted">
            <Furigana text="家[いえ]の近[ちか]くから避難場所[ひなんばしょ]まで、歩[ある]いて向[む]かう想定[そうてい]でためします。" />
          </p>
        </header>

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

          <div className="flex gap-2">
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
          </div>
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

          <div className="flex gap-2">
            <Button size="md" variant="outline" onClick={useMyLocation}>
              {geoState === "loading" ? (
                "現在地をさがしています..."
              ) : (
                <Furigana text="いまいる場所[ばしょ]を使[つか]う" />
              )}
            </Button>
            <Button
              size="md"
              variant="quiet"
              onClick={() => pickHome(DEMO_HOME, DEMO_AREA_LABEL)}
            >
              <Furigana text="デモ地点[ちてん]" />
            </Button>
          </div>
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
            <Furigana text={SHELTER_CAUTION} />
          </p>
          {shelters === null ? (
            <p className="text-13 text-ink-muted"><Furigana text="近くの避難場所をさがしています..." /></p>
          ) : shelters.length === 0 ? (
            <Card className="bg-canvas p-[18px] shadow-none">
              <p className="text-13 leading-[1.6] text-ink-muted">
                <Furigana text="この地点[ちてん]の近[ちか]くでは、公的[こうてき]データから避難場所[ひなんばしょ]を見[み]つけられませんでした。住[す]んでいる自治体[じちたい]の一覧[いちらん]でも確[たし]かめてください。" />
              </p>
              <div className="mt-3">
                <Button
                  size="md"
                  variant="outline"
                  onClick={() => pickHome(DEMO_HOME, DEMO_AREA_LABEL)}
                >
                  <Furigana text="デモ地点[ちてん]でためす" />
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
          disabled={!shelter}
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
      </main>
    </Screen>
  );
}
