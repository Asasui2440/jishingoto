import type { Risk, RoomObjectType } from "./content";
import { isWallMountedTv, roomObjectType } from "./room-guidance";
import { riskOnView, viewForRisk, type RoomView, type ViewBounds } from "./room-views";

export type AftermathObject = { name: string; type: RoomObjectType; bounds: ViewBounds | null; mounted: boolean };

/** 確認済みの対象だけを送る。チェックリストの達成状況は画像の条件にしない。 */
export function aftermathObjects(risks: Risk[]): AftermathObject[] {
  return risks.filter(risk => risk.confirmed).map(risk => ({
    name: (risk.adultName || risk.name).replace(/\[[^\]]*\]/g, "").slice(0, 80),
    type: roomObjectType(risk),
    bounds: risk.bounds ? { ...risk.bounds } : null,
    mounted: isWallMountedTv(risk),
  }));
}

export function aftermathKey(risks: Risk[]): string {
  return JSON.stringify(aftermathObjects(risks));
}

/** 代表写真に写る確認済み対象だけを、その写真の座標に直して生成する。 */
export function aftermathInput({ photoUrl, aftermathPhotoUrl, roomViews = [], risks }: {
  photoUrl: string | null; aftermathPhotoUrl?: string | null; roomViews?: RoomView[]; risks: Risk[];
}): { photo: string | null; risks: Risk[] } {
  const photo = aftermathPhotoUrl ?? photoUrl;
  const confirmed = risks.filter(risk => risk.confirmed);
  const viewIndex = roomViews.findIndex(view => view.url === photo);
  if (viewIndex < 0) return { photo, risks: confirmed };
  return { photo, risks: confirmed.filter(risk => viewForRisk(risk, roomViews) === viewIndex)
    .map(risk => riskOnView(risk, roomViews[viewIndex])) };
}
