"use client";

import { adultText, plain } from "./adult-copy";
import type { Audience } from "./settings";
import { AXIS_LABEL, safetyBand, type Axis } from "./content";

export type ShareRow = { label: string; score: number };

const W = 1080;
const H = 1350;

// globals.css の @theme と同じ値。Canvas は CSS 変数を読めないので写している。
const COLORS = {
  bg: "#ffffff",
  canvas: "#f4f6f9",
  ink: "#1a202c",
  inkMuted: "#4a5568",
  inkSoft: "#718096",
  primary: "#ffcc00",
  primaryMid: "#b87d00",
  primaryInk: "#8a5a00",
  primarySoft: "#fff6d6",
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * シェア用のカード画像を Canvas で作る。
 *
 * 部屋の写真は載せない。載せるのは軸ごとの評価だけなので、
 * 個人が特定できる情報はこの画像に一切入らない。
 */
export function drawShareCard(
  canvas: HTMLCanvasElement,
  { rows, date, audience = "child" }: { rows: ShareRow[]; date: Date; audience?: Audience },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const copy = audience === "adult" ? adultText : plain;

  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = COLORS.canvas;
  ctx.fillRect(0, 0, W, H);

  // 白いカード＋青いふち
  ctx.fillStyle = COLORS.bg;
  roundRect(ctx, 48, 48, W - 96, H - 96, 64);
  ctx.fill();
  ctx.strokeStyle = COLORS.primaryMid;
  ctx.lineWidth = 8;
  ctx.stroke();

  const font = (size: number, weight = "700") =>
    `${weight} ${size}px "Gabarito", "Noto Sans JP", system-ui, sans-serif`;

  // ヘッダー
  ctx.fillStyle = COLORS.primarySoft;
  roundRect(ctx, 104, 128, 250, 68, 24);
  ctx.fill();
  ctx.fillStyle = COLORS.primaryInk;
  ctx.font = font(40, "900");
  ctx.textBaseline = "middle";
  ctx.fillText("ジシンゴト", 128, 163);

  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = font(30, "400");
  ctx.textAlign = "right";
  ctx.fillText(
    `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${copy("挑戦！")}`,
    W - 104,
    163,
  );

  // 見出し
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.primaryInk;
  ctx.font = font(60, "900");
  ctx.fillText(copy("じぶんの部屋の安全チェック、"), W / 2, 300);
  ctx.fillText(copy("したよ！"), W / 2, 380);

  ctx.fillStyle = COLORS.inkMuted;
  ctx.font = font(32, "400");
  ctx.fillText("シミュレーション結果サマリー", W / 2, 450);

  // 軸ごとの評価
  const boxTop = 520;
  const rowH = 108;
  ctx.fillStyle = COLORS.canvas;
  roundRect(ctx, 104, boxTop, W - 208, rows.length * rowH + 48, 40);
  ctx.fill();

  rows.forEach((row, i) => {
    const y = boxTop + 48 + i * rowH + 30;
    const band = safetyBand(row.score / 5);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.inkMuted;
    ctx.font = font(38, "700");
    ctx.fillText(copy(row.label), 152, y);

    // 評価バッジ
    const label = copy(band.label);
    ctx.font = font(30, "700");
    const badgeW = ctx.measureText(label).width + 56;
    // safetyBand は CSS 変数を返すので、描画用に実際の色へ置き換える
    const fill =
      row.score / 5 >= 0.6 ? "#2ec4b6" : row.score / 5 >= 0.4 ? "#ff9f1c" : "#e53e3e";
    ctx.fillStyle = fill;
    roundRect(ctx, W - 152 - badgeW, y - 28, badgeW, 56, 18);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(label, W - 152 - badgeW / 2, y + 2);
  });

  // フッター
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.primaryInk;
  ctx.font = font(34, "700");
  ctx.fillText(copy("みんなもスマホで「ジシンゴト」を"), W / 2, H - 230);
  ctx.fillText(copy("検索してみてね！"), W / 2, H - 180);

  ctx.fillStyle = COLORS.primary;
  roundRect(ctx, W / 2 - 120, H - 140, 240, 12, 6);
  ctx.fill();

  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = font(24, "400");
  ctx.fillText("学習用シミュレーションの結果です", W / 2, H - 96);
}

/** 出題されなかった軸（null）はシェアカードに載せない */
export function axisRows(scores: Record<Axis, number | null>): ShareRow[] {
  return (["initial", "judgement", "room", "evacuation"] as Axis[]).flatMap((a) => {
    const score = scores[a];
    return score === null ? [] : [{ label: AXIS_LABEL[a], score }];
  });
}
