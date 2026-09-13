import type { LatLng } from "./evac-content";

export type StreetNode = { pano: string; position: LatLng };
export type StreetLink = { pano: string; heading: number };
export type StreetSnapshot = {
  arrivalNode?: StreetNode | null;
  arrivalError?: string | null;
  pano: string;
  position: LatLng | null;
  heading: number;
  links: StreetLink[];
  trail?: { pano: string; position: LatLng }[];
  previousPano: string | null;
  travelHeading: number | null;
  busy: boolean;
  ready: boolean;
  error: string | null;
};
export type StreetControls = { move: (pano: string) => void };
export const angleDifference = (a: number, b: number) => ((a - b + 540) % 360) - 180;
export function validStreetLinks(links: (google.maps.StreetViewLink | null)[] | null) {
  const unique = new Map<string, StreetLink>();
  for (const link of links ?? []) {
    if (link?.pano && typeof link.heading === "number" && Number.isFinite(link.heading)) {
      unique.set(link.pano, { pano: link.pano, heading: link.heading });
    }
  }
  return [...unique.values()];
}

/** Only an adjacent panorama ID can be submitted. Coordinates are observations, never commands. */
export function streetController(pano: google.maps.StreetViewPanorama, publish: (state: StreetSnapshot) => void) {
  let trail: { pano: string; position: LatLng }[] = [];
  let active = true;
  let ready = !!pano.getPosition() && pano.getLinks() !== null;
  let previousPano: string | null = null;
  let travelHeading: number | null = null;
  let pending: { from: string; link: StreetLink } | null = null;
  let error: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = () => {
    if (!active) return;
    const position = pano.getPosition();
    if (ready && position) {
      const id = pano.getPano();
      const index = trail.findIndex(node => node.pano === id);
      if (index < 0) trail = [...trail, { pano: id, position: { lat: position.lat(), lng: position.lng() } }];
      else if (index < trail.length - 1) trail = trail.slice(0, index + 1);
    }
    publish({ trail, pano: pano.getPano(), position: position ? { lat: position.lat(), lng: position.lng() } : null,
      heading: pano.getPov().heading, links: ready ? validStreetLinks(pano.getLinks()) : [],
      previousPano, travelHeading, busy: !!pending, ready, error });
  };
  const fail = () => {
    pending = null;
    ready = false;
    error = "Street Viewの移動を確認できませんでした。地図を確認するか、ページを読み直してください。";
    emit();
  };
  if (!ready) timer = setTimeout(fail, 15000);
  const listeners = [
    pano.addListener("links_changed", () => {
      if (!active || error || !pano.getPosition()) return;
      if (pending && pano.getPano() !== pending.link.pano) return;
      const completed = pending;
      if (completed) { previousPano = completed.from; travelHeading = completed.link.heading; }
      pending = null;
      if (completed) pano.setPov({ heading: completed.link.heading, pitch: 0 });
      ready = true;
      clearTimeout(timer);
      emit();
    }),
    pano.addListener("position_changed", emit),
    pano.addListener("pov_changed", emit),
    pano.addListener("status_changed", () => {
      if (pano.getStatus() !== "OK") { clearTimeout(timer); fail(); }
    }),
  ];
  emit();
  return {
    move(id: string) {
      if (!active || !ready || pending || error) return;
      // Re-read current links: an old button cannot move from a different node.
      const link = validStreetLinks(pano.getLinks()).find(link => link.pano === id);
      if (!link || id === pano.getPano()) return;
      pending = { from: pano.getPano(), link };
      ready = false;
      emit();
      timer = setTimeout(fail, 10000);
      try { pano.setPov({ heading: link.heading, pitch: 0 }); pano.setPano(link.pano); } catch { clearTimeout(timer); fail(); }
    },
    dispose() { active = false; clearTimeout(timer); listeners.forEach(listener => listener.remove()); },
  };
}


/** Auto-walk uses the selected route, never the camera direction. */
export function automaticStreetLink(state: StreetSnapshot | null, routeHeading?: number | null, nearRouteEnd = false): StreetLink | null {
  if (!state?.ready || state.busy || state.error) return null;
  const goalLink = state.links.find(link => link.pano === state.arrivalNode?.pano);
  if (nearRouteEnd && goalLink) return goalLink;
  if (routeHeading == null) return null;
  const ranked = state.links.filter(link => link.pano !== state.previousPano)
    .map(link => ({ link, delta: Math.abs(angleDifference(link.heading, routeHeading)) }))
    .sort((a, b) => a.delta - b.delta);
  if (!ranked[0] || ranked[0].delta > 45) return null;
  if (ranked[1] && ranked[1].delta - ranked[0].delta < 20) return null;
  return ranked[0].link;
}


/** Retrace observed nodes to the last point on the selected route, never across blocks. */
export function returnStreetLink(state: StreetSnapshot | null, onRoute: (position: LatLng) => boolean): StreetLink | null {
  if (!state?.ready || state.busy || state.error || !state.position || onRoute(state.position)) return null;
  const trail = state.trail ?? [];
  if (trail.length < 2 || trail[trail.length - 1].pano !== state.pano) return null;
  if (!trail.slice(0, -1).some(node => onRoute(node.position))) return null;
  return state.links.find(link => link.pano === trail[trail.length - 2].pano) ?? null;
}


/** Read the outdoor node near the route endpoint; never move the panorama here. */
export async function findStreetArrivalNode(maps: typeof google.maps, endpoint: LatLng): Promise<StreetNode> {
  const { data } = await new maps.StreetViewService().getPanorama({
    location: endpoint, radius: 150, preference: maps.StreetViewPreference.NEAREST,
    sources: [maps.StreetViewSource.OUTDOOR, maps.StreetViewSource.GOOGLE],
  });
  const location = data.location;
  if (!location?.pano || !location.latLng || !validStreetLinks(data.links ?? []).length) throw new Error("no-arrival-node");
  const position = { lat: location.latLng.lat(), lng: location.latLng.lng() };
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) throw new Error("invalid-arrival-node");
  return { pano: location.pano, position };
}

export function reachedStreetArrival(state: StreetSnapshot) {
  return !!state.arrivalNode && state.ready && !state.busy && !state.error && state.pano === state.arrivalNode.pano;
}
