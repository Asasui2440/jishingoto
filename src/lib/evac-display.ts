/** Saved sessions may still contain the old, repeated scenario suffix. */
export function eventTitle(title: string) {
  return title.replace(/（想定）|\(想定\)/g, "").replace(/(?:な)?想定(?:\[そうてい\])?$/, "").trim();
}

/** Keep only the scenario conditions, including for older saved question text. */
export function eventCondition(situation: string) {
  return situation.replace("【想定問題】", "").split(/この条件では[、,]?\s*まずどうしますか[？?]/)[0].trim();
}
