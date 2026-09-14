import { randomInt } from "node:crypto";
import { WALK_SCENARIOS } from "../walk-scenarios";
import type { DecisionPoint } from "../evac-api";
import type { LatLng } from "../evac-content";
import { meters, sampleRoute, type GeoRequest } from "./geo-analysis";
import { classifyLanduse, LANDUSE_SOURCE, type Area } from "./urban-landuse";
export function selectWalkScenarios(request: GeoRequest, contexts: {areas: Area[]; year?: string | null}[], maxPoints = WALK_SCENARIOS.length, random: () => number = () => randomInt(0x1000000)/0x1000000): DecisionPoint[] {
  const samples = sampleRoute(request.route.path);
  const total = request.route.path.slice(1).reduce((sum,p,i) => sum + meters(request.route.path[i],p),0);
  const budget = Math.max(0,Math.min(WALK_SCENARIOS.length,Math.floor(maxPoints)));
  const selected: DecisionPoint[] = [];
  const used = new Set(request.excludedEventIds);
  const shuffle = <T,>(values: T[]) => {
    const result = [...values];
    for (let i = result.length-1;i>0;i--) {const j = Math.floor(random()*(i+1)); [result[i],result[j]] = [result[j],result[i]];}
    return result;
  };
  const candidates = shuffle(WALK_SCENARIOS.filter(c => !used.has(c.event.id) && (!c.disaster || c.disaster === (request.scenario ?? "earthquake"))));
  // Contextual cases first; unknown/uncovered geography still receives common exercises.
  for (const common of [false,true]) for (const candidate of candidates) {
    if (selected.length >= budget) break;
    if ((candidate.area === "common") !== common) continue;
    const valid = samples.flatMap((s,i) => {
      if (s.t < .15 || s.t > .85 || s.t*total < 15 || (1-s.t)*total < 15) return [];
      if (selected.some(p => Math.abs(p.t-s.t)*total < 40)) return [];
      if (!common && candidate.area !== "flood" && !contexts[i]?.areas.includes(candidate.area as Area)) return [];
      return [i];
    });
    if (!valid.length) continue;
    const i = valid[Math.floor(random()*valid.length)], sample = samples[i];
    const context = candidate.area === "common" || candidate.area === "flood" ? "場所の被害を検出したものではない共通の想定です。" : candidate.area === "commercial" ? "近隣の商業施設の位置をもとに選んだ想定です。現在の混雑を確認したものではありません。" : `国土数値情報「都市地域土地利用細分メッシュ」${contexts[i]?.year ?? ""}年の周辺分類をもとに選んだ想定です。建物の用途や現在の被害を個別に確認したものではありません。`;
    selected.push({id:`${request.route.id}:${candidate.event.id}`, ...sample,event:{...candidate.event,situation:`${candidate.event.situation}\n${context}`, locationReference: candidate.area === "common" || candidate.area === "flood" || candidate.area === "commercial" ? undefined : {label:"出題場所の根拠：国土数値情報・都市地域土地利用細分メッシュ",url:LANDUSE_SOURCE}}, remainingM:Math.round(total*(1-sample.t)),remainingS:Math.round(request.route.durationS*(1-sample.t))});
  }
  return selected.sort((a,b) => a.t-b.t);
}
export async function prepareWalkScenarios(request: GeoRequest, commercial: LatLng[] = [], maxPoints = WALK_SCENARIOS.length) {
  const samples = sampleRoute(request.route.path);
  const contexts = await classifyLanduse(samples.map(s => s.position));
  for (let i = 0;i < samples.length;i++) if (commercial.some(p => meters(p,samples[i].position) <= 120)) contexts[i].areas.push("commercial");
  return {source:"context", points:selectWalkScenarios(request,contexts,maxPoints)};
}
