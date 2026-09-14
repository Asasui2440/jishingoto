import { Map as LibreMap, Marker, addProtocol } from './vendor/maplibre-gl.mjs';
const packs=new Map();let sequence=0;
addProtocol('evacmap',async params=>{
  const url=new URL(params.url),pack=packs.get(url.hostname),tile=pack?.get(url.pathname.slice(1));
  return {data:tile?await tile.arrayBuffer():new ArrayBuffer(0)};
});
const collection=features=>({type:'FeatureCollection',features});
const feature=(type,coordinates,properties={})=>({type:'Feature',geometry:{type,coordinates},properties});
const point=p=>[p.lng,p.lat];
const label=['coalesce',['get','name:ja'],['get','name'],['get','name:latin'],''];
function streetStyle(pack,id) {
  const source={type:'vector',tiles:[`evacmap://${id}/{z}/{x}/{y}`],minzoom:12,maxzoom:14,bounds:pack?[pack.bbox.west,pack.bbox.south,pack.bbox.east,pack.bbox.north]:[122,20,154,46]};
  const area=pack?feature('Polygon',[[[pack.bbox.west,pack.bbox.south],[pack.bbox.east,pack.bbox.south],[pack.bbox.east,pack.bbox.north],[pack.bbox.west,pack.bbox.north],[pack.bbox.west,pack.bbox.south]]]):null;
  const base=(id,type,layer,paint,extra={})=>({id,type,source:'streets','source-layer':layer,paint,...extra});
  return {version:8,sources:{streets:source,coverage:{type:'geojson',data:collection(area?[area]:[])},route:{type:'geojson',data:collection([])}},layers:[
    {id:'outside',type:'background',paint:{'background-color':'#dfe5e8'}},
    {id:'coverage',type:'fill',source:'coverage',paint:{'fill-color':'#f6f5f1'}},
    base('land','fill','landcover',{'fill-color':'#e4efdf'}),
    base('park','fill','landuse',{'fill-color':['match',['get','class'],['park','grass','recreation_ground','cemetery'],'#d6e9cc','residential','#f1efea','#ecebe4']}),
    base('water','fill','water',{'fill-color':'#a8d8ee'}),
    base('waterway','line','waterway',{'line-color':'#a8d8ee','line-width':3}),
    base('buildings','fill','building',{'fill-color':'#e1ddd7','fill-outline-color':'#d3cfc8'},{minzoom:15}),
    base('roads-casing','line','transportation',{'line-color':'#d3d0c8','line-width':['interpolate',['linear'],['zoom'],13,2,16,10,19,30]},{filter:['!=',['get','class'],'rail'],layout:{'line-cap':'round','line-join':'round'}}),
    base('roads','line','transportation',{'line-color':['match',['get','class'],['motorway','trunk'],'#f6dba0',['primary','secondary'],'#ffe9b8','#ffffff'],'line-width':['interpolate',['linear'],['zoom'],13,1,16,7,19,25]},{filter:['!=',['get','class'],'rail'],layout:{'line-cap':'round','line-join':'round'}}),
    base('rail','line','transportation',{'line-color':'#969b9e','line-width':2,'line-dasharray':[3,3]},{filter:['==',['get','class'],'rail']}),
    base('road-names','symbol','transportation_name',{'text-color':'#687177','text-halo-color':'#fff','text-halo-width':2},{minzoom:14,layout:{'symbol-placement':'line','text-field':label,'text-font':['sans-serif'],'text-size':12,'symbol-spacing':200}}),
    base('place-names','symbol','place',{'text-color':'#526269','text-halo-color':'#fff','text-halo-width':2},{layout:{'text-field':label,'text-font':['sans-serif'],'text-size':['interpolate',['linear'],['zoom'],13,12,17,16]}}),
    base('poi-names','symbol','poi',{'text-color':'#527262','text-halo-color':'#fff','text-halo-width':1.5},{minzoom:15,layout:{'text-field':label,'text-font':['sans-serif'],'text-size':11,'text-max-width':8}}),
    {id:'route-halo',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':10}},
    {id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#277ce5','line-width':6}},
  ]};
}
export class RouteMap {
  constructor(el,onPick) {
    this.el=el;this.onPick=onPick;this.path=[];this.start=null;this.shelter=null;this.location=null;this.home=null;this.destinationLabel='避難先';this.mode='pan';this.pack=null;this.id=`map${++sequence}`;this.markers={};
    this.map=new LibreMap({container:el,style:streetStyle(null,this.id),center:[139.731,35.718],zoom:15,minZoom:12,maxZoom:19,attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false,renderWorldCopies:false,localIdeographFontFamily:'sans-serif',locale:{'Map.Title':'保存した道路地図'}});
    this.map.touchZoomRotate.disableRotation();
    this.map.on('load',()=>this.render());
    this.map.on('style.load',()=>this.render());
    this.map.on('idle',()=>{el.dataset.mapReady='true';if(this.pack)el.dispatchEvent(new Event('mapready'));});
    this.map.on('error',event=>{el.dataset.mapError=event.error?.message??'地図を表示できません';});
    this.map.on('click',event=>{if(this.mode==='recalc')onPick({lat:event.lngLat.lat,lng:event.lngLat.lng});});
    el.addEventListener('keydown',event=>{if(event.key==='Enter'&&this.mode==='recalc'){event.preventDefault();const p=this.map.getCenter();onPick({lat:p.lat,lng:p.lng});}});
    this.observer=new ResizeObserver(()=>this.map.resize());this.observer.observe(el);
  }
  move(p){this.map.jumpTo({center:point(p)});this.render();}
  zoom(delta){this.map.zoomTo(this.map.getZoom()+Math.log2(delta),{duration:150});}
  fit(path){if(!path.length)return;const points=[...path,this.start,this.shelter].filter(Boolean);this.map.resize();this.map.fitBounds([[Math.min(...points.map(p=>p.lng)),Math.min(...points.map(p=>p.lat))],[Math.max(...points.map(p=>p.lng)),Math.max(...points.map(p=>p.lat))]],{padding:{top:55,bottom:55,left:35,right:90},maxZoom:17,duration:0});this.render();}
  setPack(pack){
    this.pack=pack;packs.set(this.id,new globalThis.Map((pack?.tiles??[]).map(t=>[t.key,t.blob])));
    this.el.dataset.mapReady='false';delete this.el.dataset.mapError;
    this.map.setStyle(streetStyle(pack,this.id),{diff:false});
  }
  render(){
    const source=this.map.getSource('route');
    if(source){source.setData(collection(this.path.length>1?[feature('LineString',this.path.map(point))]:[]));}
    this.el.dataset.routePoints=String(this.path.length);
    for(const [key,p,title] of [['start',this.start,'出発地点'],['shelter',this.shelter,this.destinationLabel],['home',this.home&&!(this.home.lat===this.shelter?.lat&&this.home.lng===this.shelter?.lng)?this.home:null,'自宅'],['location',this.location,'現在地']]){
      if(!p){this.markers[key]?.remove();delete this.markers[key];continue;}
      if(!this.markers[key]){const element=document.createElement('div');element.className=`map-pin ${key}`;element.setAttribute('aria-label',title);element.setAttribute('role','img');
        if(key==='shelter'||key==='home')element.textContent=title;
        this.markers[key]=new Marker({element,anchor:'center'}).setLngLat(point(p)).addTo(this.map);
      }else this.markers[key].setLngLat(point(p));
      const el=this.markers[key].getElement();el.setAttribute('aria-label',title);if(key==='shelter'||key==='home')el.textContent=title;el.dataset.lat=String(p.lat);el.dataset.lng=String(p.lng);
    }
  }
}
