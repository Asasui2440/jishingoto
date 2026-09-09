export type RoomTestOptions = { mode: "live" | "fixture"; analysisMs: number; imageMs: number };
let options: RoomTestOptions = { mode: "live", analysisMs: 2000, imageMs: 20000 };
export const roomTestOptions = () => options;
export function setRoomTestOptions(next: RoomTestOptions) {
  const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(180000, n)) : 0;
  options = { mode: next.mode, analysisMs: clamp(next.analysisMs), imageMs: clamp(next.imageMs) };
}
type Timing = { start: number; end?: number; ok?: boolean };
let timings: { mode: RoomTestOptions["mode"]; analysis?: Timing; image?: Timing } = { mode: "live" };
export const roomTimings = () => timings;
export function resetRoomTimings() { timings = { mode: options.mode }; }
export function startRoomTiming(kind: "analysis" | "image") {
  const timing: Timing = { start: performance.now() };
  timings[kind] = timing;
  return (ok: boolean) => { timing.end = performance.now(); timing.ok = ok; };
}
