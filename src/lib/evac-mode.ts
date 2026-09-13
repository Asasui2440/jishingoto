/** フェーズ1の fixture / live と同じく、体験開始時にデータ取得先を固定する。 */
export type EvacMode = "mock" | "api";
export const EVAC_MODE_LABEL: Record<EvacMode, string> = { mock: "モック版", api: "API版" };
export function parseEvacMode(value: string | null): EvacMode | null {
  return value === "mock" || value === "api" ? value : null;
}
