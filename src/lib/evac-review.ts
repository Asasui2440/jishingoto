import { findEvent } from "./evac-content";
import { WALK_SCENARIOS } from "./walk-scenarios";
import type { EvacSession } from "./evac";

export function reviewDecisions(session: Pick<EvacSession,"decisions" | "walk">) {
  return session.decisions.flatMap(d => {
    const event = session.walk?.steps.find(step => step.pointId === d.pointId)?.event
      ?? WALK_SCENARIOS.find(c => c.event.id === d.eventId)?.event ?? findEvent(d.eventId);
    const choice = event?.choices.find(c => c.id === d.choiceId);
    if (!event || !choice) return [];
    return [{d,event,choice}];
  });
}

/** Training rubric only. Elapsed time, route length and real-world safety are not scored. */
export function scoreDecisions(session: Pick<EvacSession,"decisions" | "walk">) {
  const rows = reviewDecisions(session);
  const scored = rows.flatMap(row => {
    const priorities = row.event.choices.map(c => c.priority);
    if (!priorities.length || !priorities.every(p => Number.isInteger(p) && p >= 1 && p <= 3)) return [];
    const best = Math.max(...priorities);
    const recommended = row.event.choices.find(c => c.priority === best)!;
    const value = best > 1 ? (row.choice.priority - 1) / (best - 1) : 1;
    return [{...row,recommended,value}];
  });
  return {
    score:scored.length ? Math.round(100 * scored.reduce((sum,row) => sum + row.value,0) / scored.length) : null,
    count:scored.length,total:session.decisions.length,
    good:scored.filter(row => row.value === 1),
    improvements:scored.filter(row => row.value < 1),
    followUps:[...new Set(rows.map(row => row.event.followUp).filter(Boolean))],
  };
}
