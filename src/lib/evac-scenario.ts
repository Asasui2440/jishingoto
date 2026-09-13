export type EvacScenario = "earthquake" | "flood";
export const EVAC_SCENARIOS = {
  earthquake: { label: "地震", layer: "skhb04", flag: "disaster4", description: "大きな地震のあと、避難先までの道を確かめる練習" },
  flood: { label: "洪水", layer: "skhb01", flag: "disaster1", description: "大雨に備え、浸水が始まる前の避難先と道を確かめる練習" },
} as const;
export function isEvacScenario(value: unknown): value is EvacScenario {
  return value === "earthquake" || value === "flood";
}
export const SHELTER_DISASTERS = ["洪水", "崖崩れ・土石流・地滑り", "高潮", "地震", "津波", "大規模な火事", "内水氾濫", "火山現象"];

// 地形分類の一般的な洪水・浸水傾向。浸水想定区域や深さを示すデータではない。
const floodLandforms = new Set(["氾濫平野・海岸平野", "後背低地･湿地", "旧河道", "落堀", "河川敷･浜", "凹地・浅い谷"]);
export function scenarioCategories(classification: string, earthquakeCategories: string[], scenario: EvacScenario): string[] {
  return scenario === "flood" ? floodLandforms.has(classification) ? ["flood"] : [] : earthquakeCategories;
}
