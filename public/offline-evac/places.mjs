import { validPoint } from './core.mjs';
export function registeredPlaces(){
  try{
    const data=JSON.parse(localStorage.getItem('jishingoto.saved-places.v1')??'{}'),places={};
    for(const key of ['home','work','school'])if(validPoint(data?.[key]?.position)&&typeof data[key].label==='string'&&Number.isFinite(data[key].savedAt))places[key]=data[key];
    return places;
  }catch{return {};}
}
export function changedHome(route,home){return route.purpose==='home'&&home&&(route.shelter.lat!==home.position.lat||route.shelter.lng!==home.position.lng);}
