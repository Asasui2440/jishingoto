import catalog from "@/data/generated/voice-knowledge.json";
import contexts from "@/data/knowledge-contexts.json";
import type { Question } from "./content";
import type { HazardEvent } from "./evac-content";
import type { EvacScenario } from "./evac-scenario";

export type VoiceRequest = {
  key: string;
  surface: "room" | "walk" | "tip";
  hazard: EvacScenario;
  phase: "before" | "during" | "after";
  choiceId?: string;
  timedOut?: boolean;
};
type Copy = { child: string; adult: string };
export type VoiceEntry = {
  id: string; noteId: string; episode: string; factIds: string[];
  title: string; summary: Copy; context: string; limits: Copy;
  event: string; period: string; location: string; reviewedAt: string;
  source: { id: string; title: string; url: string; locator: string };
  bindings: { key: string; choices: string[]; relation: Copy }[];
};
export type VoiceMatch = { entry: VoiceEntry; relation: Copy; matchedChoice: boolean };
const entries: VoiceEntry[] = catalog.entries;

/** 点数・写真・人物属性は参照しない。確認済みの教材と選択肢の組だけを照合する。 */
export function relatedVoices(request: VoiceRequest | null, candidates: readonly VoiceEntry[] = entries): VoiceMatch[] {
  if (!request || !Object.hasOwn(contexts, request.key)) return [];
  const context = contexts[request.key as keyof typeof contexts];
  if (context.surface !== request.surface || context.phase !== request.phase || !(context.hazards as string[]).includes(request.hazard)) return [];
  const choice = !request.timedOut && request.choiceId && (context.choices as string[]).includes(request.choiceId) ? request.choiceId : undefined;
  return candidates.flatMap(entry => {
    const relevant = entry.bindings.filter(binding => binding.key === request.key);
    const exact = choice ? relevant.find(binding => binding.choices.includes(choice)) : undefined;
    const binding = exact ?? relevant.find(binding => binding.choices.length === 0);
    return binding ? [{ entry, relation: binding.relation, matchedChoice: !!exact }] : [];
  }).sort((a, b) => Number(b.matchedChoice) - Number(a.matchedChoice) || a.entry.id.localeCompare(b.entry.id));
}

export function roomVoiceRequest(question: Question, choiceId: string, timedOut: boolean): VoiceRequest | null {
  const key = question.knowledgeKey ?? question.id;
  if (!Object.hasOwn(contexts, key)) return null;
  const context = contexts[key as keyof typeof contexts];
  if (context.surface !== "room") return null;
  // 既存の固定問題q3/q5はphaseなしでも、登録済みの固定キーから時点を解決できる。
  const phase = question.phase ?? context.phase;
  if (phase !== "during" && phase !== "after") return null;
  return { key, surface: "room", hazard: "earthquake", phase, choiceId: question.choices.some(choice => choice.id === choiceId) ? choiceId : undefined, timedOut };
}

export function walkVoiceRequest(event: HazardEvent, scenario: EvacScenario, choiceId: string, timedOut: boolean): VoiceRequest {
  return { key: event.id, surface: "walk", hazard: scenario, phase: scenario === "flood" ? "during" : "after", choiceId: event.choices.some(choice => choice.id === choiceId) ? choiceId : undefined, timedOut };
}

export function triviaVoiceRequest(id: string): VoiceRequest {
  return { key: id, surface: "tip", hazard: "earthquake", phase: "before" };
}
