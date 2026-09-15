import type { Risk, Question } from "./content";

export type ViewBounds = { x: number; y: number; w: number; h: number };
export type RoomView = { url: string; bounds: ViewBounds };

/** 表示・予想図用一覧の中に描かれた、余白を除く各写真の領域（百分率）。 */
export function roomViewBounds(width: number, height: number, index: number, count: number): ViewBounds {
  if (count === 1) return { x: 0, y: 0, w: 100, h: 100 };
  const canvasHeight = 504 * Math.ceil(count / 2);
  const scale = Math.min(624 / width, 464 / height);
  const w = width * scale, h = height * scale;
  return {
    x: ((index % 2) * 640 + (640 - w) / 2) / 1280 * 100,
    y: (Math.floor(index / 2) * 504 + 32 + (464 - h) / 2) / canvasHeight * 100,
    w: w / 1280 * 100, h: h / canvasHeight * 100,
  };
}

export function viewForRisk(risk: Risk | undefined, views: RoomView[]): number {
  if (!risk || views.length < 2) return 0;
  const x = risk.bounds ? risk.bounds.x + risk.bounds.w / 2 : risk.x;
  const y = risk.bounds ? risk.bounds.y + risk.bounds.h / 2 : risk.y;
  let best = 0, distance = Infinity;
  views.forEach(({ bounds: b }, index) => {
    const dx = Math.max(b.x - x, 0, x - b.x - b.w);
    const dy = Math.max(b.y - y, 0, y - b.y - b.h);
    const d = dx * dx + dy * dy;
    if (d < distance) { best = index; distance = d; }
  });
  return best;
}

export function riskOnView(risk: Risk, view: RoomView): Risk {
  const b = view.bounds;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const x = clamp((risk.x - b.x) / b.w * 100);
  const y = clamp((risk.y - b.y) / b.h * 100);
  let bounds: Risk["bounds"];
  if (risk.bounds) {
    const left = clamp((risk.bounds.x - b.x) / b.w * 100);
    const top = clamp((risk.bounds.y - b.y) / b.h * 100);
    const right = clamp((risk.bounds.x + risk.bounds.w - b.x) / b.w * 100);
    const bottom = clamp((risk.bounds.y + risk.bounds.h - b.y) / b.h * 100);
    if (right > left && bottom > top) bounds = { x: left, y: top, w: right - left, h: bottom - top };
  }
  return { ...risk, x, y, bounds };
}

/** 写真1→写真2→写真3の順。同じ写真の中ではAIの元の順序を保つ。 */
export function groupRisksByView(risks: Risk[], views: RoomView[]): Risk[] {
  if (views.length < 2) return risks;
  return risks.map((risk, order) => ({ risk, order, view: viewForRisk(risk, views) }))
    .sort((a, b) => a.view - b.view || a.order - b.order)
    .map(item => item.risk);
}

export function questionRoomView(question: Question, risks: Risk[], views: RoomView[], photo: string | null) {
  const risk = risks.find(item => item.id === question.sourceRiskId);
  const view = risk ? views[viewForRisk(risk, views)] : views[0];
  if (!view) return { question, photo };
  const projected = risk && riskOnView({ ...risk, bounds: question.highlight ?? risk.bounds }, view);
  return {
    photo: view.url,
    question: { ...question, highlight: projected?.bounds && question.highlight
      ? { ...question.highlight, ...projected.bounds } : undefined },
  };
}
