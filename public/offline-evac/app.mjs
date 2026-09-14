import { prepareOfflineEntry } from './registration.mjs';
import { validPoint } from './core.mjs';
import { allRoutes, deleteRoute } from './storage.mjs';
import { RouteMap } from './map.mjs';
import { findRoute, inside } from './routing.mjs';
import { initReport } from './report.mjs';
const $=id=>document.getElementById(id);
let routes=[],selected=null,destination=null,networkAvailable=navigator.onLine;
let locationUpdatedAt=0,pendingLocationAction=null;
const map=new RouteMap($('map'),()=>{});
function message(text,error=false){$('message').hidden=false;$('message').textContent=text;$('message').classList.toggle('error',error);}
// Standalone offline HTML has no Next.js router.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
$('go-back').onclick=()=>{if(history.length>1)history.back();else location.href='/home';};
function connection(){ $('connection').textContent=networkAvailable?'オンライン':'オフライン';$('connection').classList.toggle('offline',!networkAvailable); }
async function checkConnection(){
  try{if(!navigator.onLine)throw new Error();const r=await fetch('./ping.txt',{cache:'no-store',signal:AbortSignal.timeout(3000)});networkAvailable=r.ok&&(await r.text()).trim()==='offline-evac-online';}catch{networkAvailable=false;}connection();
}
window.addEventListener('online',checkConnection);window.addEventListener('offline',()=>{networkAvailable=false;connection();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkConnection();});
connection();void checkConnection();
$('zoom-in').onclick=()=>map.zoom(1.6);$('zoom-out').onclick=()=>map.zoom(1/1.6);$('fit-route').onclick=()=>map.fit(map.path);
$('close-workspace').onclick=()=>{const url=new URL(location.href);url.searchParams.delete('route');url.searchParams.delete('entry');history.replaceState(null,'',url);document.body.classList.remove('route-open');$('workspace').hidden=true;stopLocation();map.setPack(null);selected=null;};
function describeRoute(result){return `徒歩 約${Math.ceil(result.meters/70)}分 / 約${Math.round(result.meters)}m`;}
function renderRouteSummary(result){$('route-summary').textContent=describeRoute(result);}
function recalculate(start,target=destination){
  if(!selected||!target)return;
  destination=target;map.destinationLabel=['自宅','保存時の自宅'].includes(target.name)?target.name:'避難先';map.shelter=target.position;map.start=start;$('workspace-title').textContent=target.name;
  try{const result=findRoute(selected.graph,start,target.position);map.path=result.path;map.fit(result.path);renderRouteSummary(result);message('現在地からのルートを、端末に保存した道路で再検索しました。');$('map').scrollIntoView({behavior:'smooth',block:'center'});}
  catch(e){map.path=[];map.render();$('route-summary').textContent='経路が見つかりません';message(e.message,true);}
}
function withLocation(action){
  if(map.location&&Date.now()-locationUpdatedAt<30000){action(map.location);return;}
  pendingLocationAction=action;
  if(watchId===null)startLocation();
  else $('location-status').textContent='現在地の更新を待っています…';
}
$('route-from-location').onclick=()=>withLocation(p=>recalculate(p));
let watchId=null;
function stopLocation() {
  if(watchId!==null)navigator.geolocation.clearWatch(watchId);
  watchId=null;pendingLocationAction=null;$('locate').disabled=false;$('locate').textContent='◎ 現在地を表示';
}
window.addEventListener('pagehide',stopLocation);
function startLocation(){
  if(!navigator.geolocation){pendingLocationAction=null;return message('このブラウザでは位置情報を使えません。',true);}
  $('locate').disabled=true;$('location-status').textContent='現在地を確認しています…';
  let first=true;
  watchId=navigator.geolocation.watchPosition(position=>{
    $('locate').disabled=false;$('locate').textContent='位置の更新を止める';
    const p={lat:position.coords.latitude,lng:position.coords.longitude};
    if(!validPoint(p)){stopLocation();return message('日本国内の位置情報を取得できませんでした。',true);}
    map.location=p;locationUpdatedAt=position.timestamp;
    if(first){map.move(p);first=false;}else map.render();
    const stamp=new Date(position.timestamp).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    $('location-status').textContent=`${stamp}に更新 / 精度 約${Math.round(position.coords.accuracy)}m`;
    const action=pendingLocationAction;pendingLocationAction=null;action?.(p);
    if(selected?.mapPack && !inside(p,selected.mapPack.bbox))message('現在地は保存した地図の範囲外です。「全体」で保存経路に戻れます。');
  },error=>{
    map.location=null;locationUpdatedAt=0;pendingLocationAction=null;map.render();
    $('locate').disabled=false;
    if(error.code===1){stopLocation();$('location-status').textContent='位置情報が許可されていません。端末の設定を確認してください。';}
    else{$('locate').textContent='位置の更新を止める';$('location-status').textContent='現在地を確認できません。位置情報の更新を待っています…';}
  },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
$('locate').onclick=()=>{if(watchId!==null){stopLocation();$('location-status').textContent+=' 更新を停止しました。';}else startLocation();};

function element(tag,text,className=''){const el=document.createElement(tag);el.textContent=text;el.className=className;return el;}
async function list(){
  routes=await allRoutes();$('saved-list').replaceChildren();
  if(!routes.length)$('saved-list').append(element('p','まだ保存したマップはありません。オンラインのときに、避難シミュレーションのリザルトから地図を保存してください。','empty'));
  for(const route of routes){const card=element('article','','saved-card'),body=element('div','');body.append(element('h3',route.routeLabel||route.name),element('p',`${route.demo?'練習データ · ':''}${new Date(route.savedAt).toLocaleString('ja-JP')} 保存`,'small'));
    const actions=element('div','','actions'),open=element('button','地図を見る'),remove=element('button','削除','danger');open.onclick=()=>show(route);remove.setAttribute('aria-label',`${route.name}を削除`);
    remove.onclick=async()=>{if(!confirm(`「${route.name}」の保存を削除しますか？`))return;try{await deleteRoute(route.id);if(selected?.id===route.id){document.body.classList.remove('route-open');$('workspace').hidden=true;map.setPack(null);selected=null;stopLocation();}await list();}catch(e){message(e.message,true);}};
    actions.append(open,remove);card.append(body,actions);$('saved-list').append(card);
  }
}
function show(route){
  if(!route.mapPack){message('以前の形式で保存したマップです。新しい道路地図を使うには、リザルトから保存し直してください。',true);return;}
  pendingLocationAction=null;selected=route;destination={name:route.purpose==='home'?'保存時の自宅':route.name,position:route.shelter};$('map-loading').hidden=true;document.body.classList.add('route-open');$('workspace').hidden=false;$('route-details').hidden=false;$('saved-info').hidden=false;$('report-actions').hidden=true;
  map.destinationLabel=route.purpose==='home'?'保存時の自宅':'避難先';
  $('workspace-title').textContent=route.routeLabel||route.name;
  $('saved-info').textContent=`${route.demo?'練習データ · ':''}${new Date(route.savedAt).toLocaleString('ja-JP')} 保存`;
  $('route-notes').textContent=route.notes||'';$('route-memo').hidden=!route.notes?.trim();renderRouteSummary(route.result);$('offline-navigation').hidden=!route.graph;
  map.start=route.start;map.shelter=route.shelter;map.path=route.path;map.mode='pan';map.setPack(route.mapPack);map.fit(route.path);
  $('workspace').scrollIntoView({behavior:'smooth',block:'start'});
}
async function prepareShell() {
  await prepareOfflineEntry();
  $('shell-status').textContent='✓ いつもの入口からもオフラインで開く準備ができています';connection();
}

const shellPreparation=prepareShell().then(()=>true).catch(e=>{$('shell-status').textContent=e.message;connection();return false;});
const params=new URLSearchParams(location.search);
if(params.get('from')==='report'&&parent!==window)initReport(map,shellPreparation);
else void list().then(()=>{const id=params.get('route');if(id){const route=routes.find(r=>r.id===id||r.aliases?.includes(id));if(route)show(route);else message('この端末には指定されたマップがありません。',true);}else if(params.get('entry')==='offline'&&routes.length===1)show(routes[0]);}).catch(e=>message(e.message,true));
