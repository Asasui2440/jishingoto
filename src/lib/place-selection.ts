import type { LatLng } from './evac-content';

export const PLACES_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
export type HomeOrigin =
  | { kind: 'places-ui-kit'; placeId: string; acquiredAt: number; expiresAt: number }
  | { kind: 'device' | 'sample' | 'google-map' };
export type PlaceSelection = { position: LatLng; label: string; origin: HomeOrigin };

/** Use only the location supplied by UI Kit; never fetch ordinary Places fields. */
export function selectUIPlace(place: { id: string; location?: { lat(): number; lng(): number } | null }, query: string, acquiredAt: number): PlaceSelection {
  const lat = place.location?.lat(), lng = place.location?.lng();
  if (!place.id || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 20 || lat > 46 || lng < 122 || lng > 154) throw new Error('日本国内の建物・駅・住所を選んでください。');
  if (!Number.isFinite(acquiredAt) || acquiredAt > Date.now() || acquiredAt + PLACES_CACHE_MS <= Date.now()) throw new Error('検索結果の期限が切れました。もう一度検索してください。');
  // Keep the user's input as their label, not Google's returned name/address.
  return { position: { lat, lng }, label: query.trim().slice(0, 200), origin: { kind: 'places-ui-kit', placeId: place.id, acquiredAt, expiresAt: acquiredAt + PLACES_CACHE_MS } };
}

export function validUIOrigin(origin: HomeOrigin | null | undefined, now = Date.now()) {
  return origin?.kind === 'places-ui-kit' && typeof origin.placeId === 'string' && !!origin.placeId && Number.isFinite(origin.acquiredAt) && origin.acquiredAt <= now && origin.expiresAt === origin.acquiredAt + PLACES_CACHE_MS && origin.expiresAt > now;
}
export function canSaveHome(origin: HomeOrigin | null | undefined, demo = false, now = Date.now()) {
  return demo || origin?.kind === 'device' || origin?.kind === 'sample' || validUIOrigin(origin, now);
}
