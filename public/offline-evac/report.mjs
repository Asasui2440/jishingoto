import { downloadVector } from './vector.mjs';
import { validPoint, MAX_ROUTES, tilePlan } from './core.mjs';
import { fetchGraph, findRoute, downloadBounds } from './routing.mjs';
import { allRoutes, putRoute } from './storage.mjs';
import { fetchShelters } from './shelters.mjs';

// Same-origin, parent-frame handoff. Route geometry from Google is never received.
export function initReport(map, shellPreparation) {
  const $=id=>document.getElementById(id);
  document.body.classList.add('report-embedded');$('report-save').hidden=false;
  let input=null,record=null,busy=false;
  map.el.addEventListener('mapready',()=>{$('map-loading').hidden=true;});
  function validate(value) {
    if(!value || !(value.purpose==='home'?/^commute-(work|school)$/:/^report-\d{1,16}$/).test(value.id) || !validPoint(value.start) || !validPoint(value.shelter) || typeof value.name!=='string' || !value.name.trim() || value.name.length>80)throw new Error('リザルトの避難先を読み取れませんでした。元の画面から開き直してください。');
    const point=p=>({lat:p.lat,lng:p.lng});
    return {purpose:value.purpose==='home'?'home':'evacuation',routeLabel:value.purpose==='home'?(value.id==='commute-work'?'会社 → 自宅':'学校 → 自宅'):null,scenario:value.scenario==='flood'?'flood':'earthquake',id:value.id,start:point(value.start),shelter:point(value.shelter),name:value.name.trim(),kind:String(value.kind??'避難先').slice(0,80),notes:String(value.notes??'').slice(0,600),source:String(value.source??'リザルトの避難先').slice(0,300),demo:value.demo===true};
  }
  async function prepare() {
    if(busy||!input)return;
    busy=true;record=null;$('report-retry').hidden=true;$('report-download').disabled=true;
    $('report-status').textContent='保存用の地図と徒歩経路を準備しています…';
    map.path=[];map.start=input.start;map.shelter=input.shelter;map.mode='pan';map.setPack(null);map.fit([input.start,input.shelter]);
    $('workspace').hidden=false;$('route-details').hidden=true;$('report-actions').hidden=false;
    $('workspace-title').textContent=input.routeLabel||input.name;map.destinationLabel=input.purpose==='home'?'自宅':'避難先';
    $('report-download').textContent=input.purpose==='home'?'このマップと徒歩経路を保存する':'このマップと避難所を保存する';
    document.querySelector('.preview-caption').textContent=input.purpose==='home'?'保存した道路で、現在地から自宅への経路も確認できます。':'保存用の道路地図では、体験時と道順が異なる場合があります。';
    $('map-loading').hidden=false;
    try {
      const existing=await allRoutes();
      if(existing.length>=MAX_ROUTES&&!existing.some(r=>r.id===input.id))throw new Error('保存は5件までです。保存したマップから不要なものを削除してください。');
      const samePoint=(a,b)=>a?.lat===b.lat&&a?.lng===b.lng;
      const cached=existing.find(r=>r.id===input.id&&r.mapPack&&r.graph&&samePoint(r.start,input.start)&&samePoint(r.shelter,input.shelter));
      const plan=tilePlan([input.start,input.shelter]),bbox=cached?.graph.bbox??downloadBounds(plan);
      const mapTask=(cached?Promise.resolve(cached.mapPack):downloadVector(bbox,(done,total)=>{$('map-loading').textContent=`地図を読み込み中 ${done} / ${total}`;})).then(pack=>{
        map.setPack(pack);map.fit(map.path.length?map.path:[input.start,input.shelter]);$('map-loading').textContent='地図を表示しています…';return pack;
      });
      const graphTask=(cached?Promise.resolve(cached.graph):fetchGraph(plan)).then(graph=>{
        const result=findRoute(graph,input.start,input.shelter);map.path=result.path;map.fit(result.path);
        $('report-distance').textContent=`徒歩 約${Math.ceil(result.meters/70)}分 / 約${Math.round(result.meters)}m`;
        return {graph,result};
      });
      const sheltersTask=cached?.sheltersSavedAt&&cached.scenario===input.scenario?Promise.resolve({shelters:cached.shelters,sheltersSavedAt:cached.sheltersSavedAt}):fetchShelters(bbox,input.scenario);
      const results=await Promise.allSettled([mapTask,graphTask,sheltersTask,shellPreparation]);
      const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
      const [mapPack,{graph,result},nearby,shellReady]=results.map(r=>r.value);
      if(!shellReady)throw new Error('オフライン画面を準備できませんでした。通信を確認して開き直してください。');
      record={...input,...nearby,version:4,mapPack,tiles:mapPack.tiles,origin:input.purpose==='home'?'home':'report',graph,result,path:result.path,sourceCheckedAt:null};
      $('report-status').textContent=`${input.demo?'練習データ · ':''}周辺の避難先 ${nearby.shelters.length}件も一緒に保存します。`;
      $('report-download').disabled=false;
    }catch(e){$('report-status').textContent=e.message;$('report-retry').hidden=false;if(!map.pack)$('map-loading').textContent='地図を読み込めませんでした';}
    finally{busy=false;}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='OFFLINE_REPORT_LOAD'||input)return;
    try{input=validate(event.data.payload);void prepare();}
    catch(e){$('report-status').textContent=e.message;}
  });
  $('report-retry').onclick=()=>void prepare();
  $('report-download').onclick=async()=>{
    if(busy||!record)return;
    busy=true;$('report-download').disabled=true;$('report-progress').hidden=false;
    try{
      $('report-status').textContent='地図と避難所をこの端末に保存しています…';
      const saved={...record,savedAt:Date.now()};
      await putRoute(saved);
      $('report-status').textContent='✓ オフラインで見られるようになりました';$('report-download').textContent='保存済み';
      parent.postMessage({type:'OFFLINE_REPORT_SAVED',id:saved.id},location.origin);
      if(navigator.storage?.persist)void navigator.storage.persist().catch(()=>{});
    }catch(e){$('report-status').textContent=e.message;$('report-download').disabled=false;$('report-download').textContent='もう一度保存する';}
    finally{busy=false;$('report-progress').hidden=true;}
  };
  parent.postMessage({type:'OFFLINE_REPORT_READY'},location.origin);
}
