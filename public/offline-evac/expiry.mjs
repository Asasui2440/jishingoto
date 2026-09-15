export const PLACES_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
export function validUIOrigin(origin, now = Date.now()) {
  return origin?.kind === 'places-ui-kit' && typeof origin.placeId === 'string' && !!origin.placeId && Number.isFinite(origin.acquiredAt) && origin.acquiredAt <= now && origin.expiresAt === origin.acquiredAt + PLACES_CACHE_MS && origin.expiresAt > now;
}
export function expiredRoute(route, now = Date.now()) {
  return route.homeOrigin?.kind === 'places-ui-kit' && !validUIOrigin(route.homeOrigin, now);
}
export function saveOrigin(origin, demo, now = Date.now()) {
  if (demo) return { kind: 'sample' };
  if (origin?.kind === 'device' || origin?.kind === 'sample') return { kind: origin.kind };
  if (validUIOrigin(origin, now)) return { kind: origin.kind, placeId: origin.placeId, acquiredAt: origin.acquiredAt, expiresAt: origin.expiresAt };
  throw new Error('出発地点をもう一度検索するか、現在地から選んでください。');
}
