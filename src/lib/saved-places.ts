import type { LatLng, Shelter } from './evac-content';
export const PLACES_KEY='jishingoto.saved-places.v1';
export const PLACE_LABELS={home:'自宅',work:'会社',school:'学校'} as const;
export type PlaceKind=keyof typeof PLACE_LABELS;
export type SavedPlace={position:LatLng;label:string;savedAt:number};
export type SavedPlaces=Partial<Record<PlaceKind,SavedPlace>>;
function valid(p:SavedPlace){return p&&typeof p.label==='string'&&p.label.length<=200&&Number.isFinite(p.savedAt)&&p.position&&Number.isFinite(p.position.lat)&&Number.isFinite(p.position.lng)&&p.position.lat>=20&&p.position.lat<=46&&p.position.lng>=122&&p.position.lng<=154;}
export function readPlaces():SavedPlaces{
  const parsed=JSON.parse(localStorage.getItem(PLACES_KEY)??'{}'),result:SavedPlaces={};
  for(const key of Object.keys(PLACE_LABELS) as PlaceKind[])if(valid(parsed?.[key]))result[key]=parsed[key];
  return result;
}
export function savePlace(kind:PlaceKind,place:SavedPlace):SavedPlaces{
  if(!valid(place))throw new Error('国内の場所を指定してください。');
  const next={...readPlaces(),[kind]:place};localStorage.setItem(PLACES_KEY,JSON.stringify(next));return next;
}

export function homeCourse(from:'work'|'school',places:SavedPlaces=readPlaces()):{start:LatLng;shelter:Shelter}{
  const home=places.home,start=places[from];
  if(!home||!start)throw new Error(`先に${PLACE_LABELS[from]}と自宅を登録してください。`);
  return {start:start.position,shelter:{id:`registered-home-${from}`,name:'自宅',kind:'登録した自宅',address:home.label,position:home.position,source:'本人が登録した場所',purpose:'home',commuteFrom:from,note:'公的な避難所ではなく、登録した自宅への徒歩コースです。'}};
}
export function resolveHomeCourse(shelter:Shelter,start:LatLng,places:SavedPlaces=readPlaces()):Shelter{
  const from=shelter.commuteFrom;
  if(shelter.purpose!=='home'||(from!=='work'&&from!=='school'))throw new Error('帰宅コースを選び直してください。');
  const current=homeCourse(from,places),same=(a:LatLng,b:LatLng)=>a.lat===b.lat&&a.lng===b.lng;
  if(shelter.id!==current.shelter.id||!same(start,current.start)||!same(shelter.position,current.shelter.position))throw new Error('登録した場所が変わっています。帰宅コースを選び直してください。');
  return current.shelter;
}
