"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import {
  ArrowRightCircleIcon,
  CheckCircleWhite2Icon,
  HandGrabIcon,
  PlusCircleIcon,
  Trash2Icon,
} from "@/components/icons";
import { Meter, Tag } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { CONFIDENCE_LABEL, RISK_KINDS, type Risk, type RiskKind } from "@/lib/content";
import { useHaptics } from "@/lib/settings";
import { getSession, useSession } from "@/lib/session";

const KIND_ORDER: RiskKind[] = ["fall", "break", "block"];

function RiskRow({
  risk,
  onConfirm,
  onDelete,
}: {
  risk: Risk;
  onConfirm: () => void;
  onDelete: () => void;
}) {
  const kind = RISK_KINDS[risk.kind];
  return (
    <li className="flex items-center gap-2.5 rounded-tile bg-canvas p-3">
      <span
        aria-hidden
        className="h-11 w-2.5 shrink-0 rounded-[5px]"
        style={{ background: kind.accent }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-sm font-bold text-ink">
            <Furigana text={risk.name} />
          </p>
          <Tag color={kind.text} soft={kind.soft}>
            <Furigana text={kind.label} />
          </Tag>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {risk.confidence != null ? (
            <>
              <span className="text-11 text-ink-muted">AI自信度</span>
              <span className="w-[60px]">
                <Meter
                  value={risk.confidence}
                  color={kind.accent}
                  track="var(--color-border)"
                  height={6}
                />
              </span>
              <span className="text-11 text-ink-muted">
                {CONFIDENCE_LABEL(risk.confidence)}
              </span>
            </>
          ) : (
            <span className="text-11 text-ink-muted">じぶんで追加</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={onConfirm}
          aria-pressed={risk.confirmed}
          aria-label={`${risk.name}をあぶないと確認する`}
          className={[
            "grid size-8 place-items-center rounded-tile transition-colors",
            risk.confirmed
              ? "bg-safe shadow-[0_2px_3px_rgba(46,196,182,0.25)]"
              : "bg-ink-faint",
          ].join(" ")}
        >
          <CheckCircleWhite2Icon className="size-4 text-white" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${risk.name}をリストから消す`}
          className="grid size-8 place-items-center rounded-tile bg-danger-soft"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

export default function RiskConfirmationPage() {
  const router = useRouter();
  const { risks, update } = useSession();
  const vibrate = useHaptics();
  const [adding, setAdding] = useState(false);
  const confirmedCount = risks.filter((r) => r.confirmed).length;
  const [draft, setDraft] = useState({ name: "", kind: "fall" as RiskKind });

  // 解析を飛ばして直接この URL を開かれたときのために、空なら戻す
  useEffect(() => {
    if (getSession().risks.length === 0) router.replace("/analyzing");
  }, [router]);

  // update は「ひとつ前の値」から作る。
  // レンダー時の risks を使うと、続けて2回タップしたときに
  // 2回目が古い配列を上書きして、1回目の変更が消える。
  const confirm = (id: string) => {
    vibrate();
    update((prev) => ({
      ...prev,
      risks: prev.risks.map((r) => (r.id === id ? { ...r, confirmed: !r.confirmed } : r)),
    }));
  };

  const remove = (id: string) => {
    vibrate();
    update((prev) => ({ ...prev, risks: prev.risks.filter((r) => r.id !== id) }));
  };

  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    update((prev) => ({
      ...prev,
      risks: [
        ...prev.risks,
        {
          id: `u${Date.now()}`,
          name,
          kind: draft.kind,
          x: 20 + Math.random() * 55,
          y: 25 + Math.random() * 40,
          confirmed: true,
          custom: true,
        },
      ],
    }));
    setDraft({ name: "", kind: "fall" });
    setAdding(false);
  };

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <div className="flex items-center justify-between px-6 py-2">
          <p className="font-display text-sm font-bold text-primary-ink">
            <Furigana text="ジシンゴト判定[はんてい]" />
          </p>
          <p className="text-xs text-ink-muted">チェック 3/3</p>
        </div>
      </div>

      <div className="h-[260px] px-4">
        <div className="relative h-full w-full overflow-hidden rounded-panel bg-ink">
          <Image src={roomRisk} alt="解析した部屋の写真" fill sizes="370px" className="object-cover" priority />

          {risks.map((r) => {
            const kind = RISK_KINDS[r.kind];
            return (
              <span
                key={r.id}
                className="absolute flex -translate-x-1/2 flex-col items-center gap-1"
                style={{ left: `${r.x}%`, top: `${r.y}%` }}
              >
                <Tag color={kind.accent} className="rounded-chip whitespace-nowrap">
                  <Furigana text={kind.label} />
                </Tag>
                <span
                  className="animate-marker size-6 rounded-full border-2 border-white"
                  style={{ background: kind.accent }}
                />
              </span>
            );
          })}

          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-field bg-black/60 px-2.5 py-1.5">
            <HandGrabIcon className="size-3.5 text-white" />
            <span className="text-11 text-white">
              <Furigana text="タップでかくにん、ゴミ箱[ばこ]でけせるよ" />
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-t-pill bg-surface px-5 pt-4 pb-5 shadow-[0_-8px_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-15 font-bold whitespace-nowrap text-ink">
            <Furigana text="見[み]つかったあぶない場所[ばしょ]" />
          </h2>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="flex shrink-0 items-center gap-1 rounded-tile bg-primary-soft px-2.5 py-1.5 font-display text-11 font-bold whitespace-nowrap text-primary-ink"
          >
            <PlusCircleIcon className="size-3.5 text-primary-ink" />
            ここもあぶない？
          </button>
        </div>

        {adding ? (
          <form onSubmit={addCustom} className="mt-3 flex flex-col gap-2 rounded-tile bg-canvas p-3">
            <label className="text-11 font-bold text-ink-muted" htmlFor="risk-name">
              なにがあぶない？
            </label>
            <input
              id="risk-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="れい：テレビ、しょっき棚"
              autoFocus
              className="h-11 rounded-field border border-border bg-surface px-3 text-sm outline-none focus:border-primary-mid"
            />
            <div className="flex gap-2">
              {KIND_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                  aria-pressed={draft.kind === k}
                  className="flex-1 rounded-chip py-2 font-display text-11 font-bold transition-opacity"
                  style={{
                    background: RISK_KINDS[k].soft,
                    color: RISK_KINDS[k].text,
                    opacity: draft.kind === k ? 1 : 0.45,
                  }}
                >
                  <Furigana text={RISK_KINDS[k].label} />
                </button>
              ))}
            </div>
            <Button size="md" type="submit" disabled={!draft.name.trim()}>
              リストに追加する
            </Button>
          </form>
        ) : null}

        <ul className="mt-3 flex max-h-[240px] flex-col gap-2.5 overflow-y-auto">
          {risks.map((r) => (
            <RiskRow key={r.id} risk={r} onConfirm={() => confirm(r.id)} onDelete={() => remove(r.id)} />
          ))}
        </ul>

        {/* ここで選んだ場所が、そのまま次の問題になる */}
        <p className="mt-3 text-center text-11 text-ink-soft">
          {confirmedCount > 0 ? (
            <Furigana
              text={`チェックした${confirmedCount}つの場所[ばしょ]から問題[もんだい]が出[で]るよ`}
            />
          ) : (
            <Furigana text="あぶないと思[おも]う場所[ばしょ]を、チェックボタンで選[えら]んでね" />
          )}
        </p>
        <Button className="mt-2" onClick={() => router.push("/quiz")}>
          <ArrowRightCircleIcon className="size-5 text-ink" />
          {confirmedCount > 0 ? "この場所で体験する" : "このまますすむ"}
        </Button>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
