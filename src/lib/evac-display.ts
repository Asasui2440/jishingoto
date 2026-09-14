/** Saved sessions may still contain the old, repeated scenario suffix. */
export function eventTitle(title: string) {
  return title.replace(/（想定）|\(想定\)/g, "").replace(/(?:な)?想定(?:\[そうてい\])?$/, "").trim();
}
