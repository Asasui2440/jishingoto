import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const roadElements:unknown[]=[];
for(let y=0;y<=40;y++)for(let x=0;x<=40;x++)roadElements.push({type:'node',id:1+y*41+x,lat:35.708+y*.0005,lon:139.721+x*.0005});
for(let i=0;i<=40;i++){
  roadElements.push({type:'way',id:10000+i,nodes:Array.from({length:41},(_,x)=>1+i*41+x),tags:{highway:'residential',name:'テスト東西通り'}});
  roadElements.push({type:'way',id:20000+i,nodes:Array.from({length:41},(_,y)=>1+y*41+i),tags:{highway:'residential',name:'テスト南北通り'}});
}

const tile=readFileSync('tests/fixtures/bunkyo-map.pbf');
const meta={tiles:['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf']};
const shelters={features:[{type:'Feature',geometry:{type:'Point',coordinates:[139.733,35.722]},properties:{name:'周辺の避難公園',disaster4:'1',disaster1:'0',address:'テスト住所'}},{type:'Feature',geometry:{type:'Point',coordinates:[139.734,35.723]},properties:{name:'洪水専用の避難先',disaster4:'0',disaster1:'1'}}]};
test.beforeEach(async({context})=>{
  await context.route('https://maps.gsi.go.jp/xyz/**',r=>r.fulfill({json:shelters}));
  await context.route('https://overpass-api.de/api/interpreter',r=>r.fulfill({json:{elements:roadElements}}));
  await context.route('https://tiles.openfreemap.org/**',r=>r.request().url().endsWith('/latest')?r.fulfill({json:meta}):r.fulfill({contentType:'application/x-protobuf',body:tile}));
});
async function resultPage(page: import('@playwright/test').Page){
  await page.addInitScript(()=>sessionStorage.setItem('jishingoto.evac.v2',JSON.stringify({
    mode:'mock',home:{lat:35.718,lng:139.731},shelter:{id:'result-school',name:'リザルト小学校',kind:'指定緊急避難場所',position:{lat:35.721,lng:139.732},source:'テストの公的データ',address:''},
    routes:[{id:'demo-short',demo:true,kind:'short',label:'テスト経路',path:[{lat:35.718,lng:139.731},{lat:35.721,lng:139.732}],distanceM:400,durationS:360,eventCount:0,notes:[]}],
    startRouteId:'demo-short',takenRouteIds:['demo-short'],decisions:[],walk:null,finishedAt:123456789,followUp:'正門で家族と集合',
  })));
  await page.goto('/evac/report');
  await page.getByRole('button',{name:'このマップと避難所を保存する',exact:true}).click();
  const frame=page.frameLocator('iframe[title="保存するオフライン地図と避難所"]');

  return frame;
}


test('リザルトで道路地図を保存し、圏外で地名・現在地・経路を同時表示する',async({page,context})=>{
  const frame=await resultPage(page);
  await expect(frame.locator('#report-download')).toBeEnabled({timeout:30000});
  await expect(frame.locator('#map')).toHaveAttribute('data-map-ready','true');
  await expect(frame.locator('#map')).not.toHaveAttribute('data-map-error',/.+/);
  await expect(frame.locator('#map canvas')).toBeVisible();
  await expect(frame.getByRole('heading',{name:'使う前に'})).toHaveCount(0);
  await frame.getByRole('button',{name:'このマップと避難所を保存する',exact:true}).click();
  const link=page.getByRole('link',{name:'保存したマップを開く'});await expect(link).toBeVisible();
  const url=await link.getAttribute('href');expect(url).toBe('/offline-evac/index.html?route=report-123456789');
  await page.screenshot({path:'test-results/offline-result-saved.png',fullPage:true});
  await context.setOffline(true);
  const requests:string[]=[];context.on('request',r=>{if(r.url().startsWith('https://'))requests.push(r.url());});
  const offline=await context.newPage();await offline.goto(url!);
  await expect(offline.locator('#connection')).toHaveText('オフライン');
  await expect(offline.locator('#workspace-title')).toHaveText('リザルト小学校');
  await expect(offline.locator('#map')).toHaveAttribute('data-map-ready','true');
  await expect(offline.locator('#map')).not.toHaveAttribute('data-map-error',/.+/);
  expect(Number(await offline.locator('#map').getAttribute('data-route-points'))).toBeGreaterThan(2);
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:35.718,longitude:139.731,accuracy:20});
  await offline.getByRole('button',{name:'◎ 現在地を表示'}).click();await expect(offline.getByRole('img',{name:'現在地',exact:true})).toBeVisible();
  await context.setGeolocation({latitude:35.719,longitude:139.731,accuracy:12});
  await expect(offline.getByRole('img',{name:'現在地',exact:true})).toHaveAttribute('data-lat','35.719');
  await offline.getByRole('button',{name:'全体',exact:true}).click();
  await offline.screenshot({path:'test-results/offline-road-map.png',fullPage:true});
  await offline.getByRole('button',{name:'地図を拡大',exact:true}).click();
  await offline.getByRole('button',{name:'現在地から徒歩経路',exact:true}).click();await expect(offline.locator('#message')).toContainText('再検索');
  await offline.getByRole('button',{name:'近くの避難所を探す',exact:true}).click();
  await expect(offline.locator('#nearby-list')).toContainText('周辺の避難公園');
  await expect(offline.locator('#nearby-list')).not.toContainText('洪水専用');
  await offline.getByRole('button',{name:/周辺の避難公園/}).click();
  await expect(offline.locator('#workspace-title')).toHaveText('周辺の避難公園');
  await expect(offline.getByRole('img',{name:'避難先',exact:true})).toHaveAttribute('data-lat','35.722');
  expect(Number(await offline.locator('#map').getAttribute('data-route-points'))).toBeGreaterThan(2);
  await offline.getByRole('button',{name:'位置の更新を止める'}).click();await expect(offline.locator('#location-status')).toContainText('停止');
  await offline.reload();await expect(offline.locator('#map')).toHaveAttribute('data-map-ready','true');
  expect(requests).toEqual([]);
  await offline.getByRole('button',{name:'閉じる',exact:true}).click();
  offline.once('dialog',d=>d.accept());await offline.getByRole('button',{name:'リザルト小学校を削除'}).click();await expect(offline.locator('#saved-list')).toContainText('まだ保存');
  await offline.reload();await expect(offline.locator('#saved-list')).toContainText('まだ保存');
});
test('道路地図の取得に失敗したら保存できず、再取得してから保存する',async({page,context})=>{
  let fail=true;
  await context.route('https://tiles.openfreemap.org/**',r=>r.request().url().endsWith('/latest')?r.fulfill({json:meta}):fail?r.fulfill({status:503}):r.fulfill({body:tile}));
  const frame=await resultPage(page);await expect(frame.locator('#report-status')).toContainText('取得できません');await expect(frame.locator('#report-download')).toBeDisabled();
  await expect(page.getByRole('link',{name:'保存したマップを開く'})).toHaveCount(0);
  fail=false;await frame.getByRole('button',{name:'もう一度読み込む'}).click();await expect(frame.locator('#report-download')).toBeEnabled();
  await frame.locator('#report-download').click();await expect(page.getByRole('link',{name:'保存したマップを開く'})).toBeVisible();
});
test('保存領域の不足を成功扱いにせず、再試行できる',async({page})=>{
  const frame=await resultPage(page);await expect(frame.locator('#report-download')).toBeEnabled();
  const child=page.frames().find(f=>f.url().includes('from=report'))!;
  await child.evaluate(()=>{const original=IDBObjectStore.prototype.put;let once=true;IDBObjectStore.prototype.put=function(...args){if(once){once=false;throw new DOMException('Full','QuotaExceededError');}return original.apply(this,args);};});
  await frame.locator('#report-download').click();await expect(frame.locator('#report-status')).toContainText('保存できません');
  await expect(page.getByRole('link',{name:'保存したマップを開く'})).toHaveCount(0);
  await frame.getByRole('button',{name:'もう一度保存する'}).click();await expect(page.getByRole('link',{name:'保存したマップを開く'})).toBeVisible();
});
test('新しい避難先の登録はGoogleマップの候補選択へ進み、地図への手動登録を出さない',async({page})=>{
  await page.goto('/offline-evac/index.html');await expect(page.locator('#shell-status')).toContainText('準備ができています');
  await expect(page.locator('#editor')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'避難先を選ぶ'})).toHaveAttribute('href','/evac?mode=api&from=offline');
  await page.setViewportSize({width:320,height:700});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('道路取得を待つ間も保存プレビューの地図を表示し、保存済みなら再ダウンロードしない',async({page,context})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await context.route('https://overpass-api.de/api/interpreter',async r=>{await gate;await r.fulfill({json:{elements:roadElements}});});
  const frame=await resultPage(page);
  await expect(frame.locator('#map-loading')).toBeHidden();
  await expect(frame.locator('#map')).toHaveAttribute('data-map-ready','true');
  await expect(frame.locator('#map')).not.toHaveAttribute('data-map-error',/.+/);
  await expect(frame.locator('#report-download')).toBeDisabled();
  const mapBox=await frame.locator('#map').boundingBox();expect(mapBox!.height).toBeGreaterThan(380);
  release();await expect(frame.locator('#report-download')).toBeEnabled();
  await frame.locator('#report-download').click();await expect(page.getByRole('link',{name:'保存したマップを開く'})).toBeVisible();
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  const requests:string[]=[];context.on('request',r=>{if(/overpass|openfreemap|maps.gsi/.test(r.url()))requests.push(r.url());});
  await page.getByRole('button',{name:'このマップと避難所を保存する',exact:true}).click();
  await expect(frame.locator('#report-download')).toBeEnabled();expect(requests).toEqual([]);
});
test('周辺の避難先を取得できない間は保存を完了せず、再試行できる',async({page,context})=>{
  let fail=true;await context.route('https://maps.gsi.go.jp/xyz/**',r=>fail?r.fulfill({status:503}):r.fulfill({json:shelters}));
  const frame=await resultPage(page);await expect(frame.locator('#report-status')).toContainText('避難先を取得できません');await expect(frame.locator('#report-download')).toBeDisabled();
  fail=false;await frame.locator('#report-retry').click();await expect(frame.locator('#report-download')).toBeEnabled();
});
test('現在地が保存範囲外なら近くの候補を案内しない',async({page,context})=>{
  const frame=await resultPage(page);await expect(frame.locator('#report-download')).toBeEnabled();await frame.locator('#report-download').click();
  const link=page.getByRole('link',{name:'保存したマップを開く'});await expect(link).toBeVisible();const url=(await link.getAttribute('href'))!;
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:35.68,longitude:139.76});await context.setOffline(true);
  const offline=await context.newPage();await offline.goto(url);await offline.locator('#nearby-search').click();
  await expect(offline.locator('#nearby-status')).toContainText('範囲外');await expect(offline.locator('#nearby-list button:enabled')).toHaveCount(0);
});
test('以前の保存へ周辺の避難先を追加でき、測位拒否でも元の記録を失わない',async({page,context})=>{
  const frame=await resultPage(page);await expect(frame.locator('#report-download')).toBeEnabled();await frame.locator('#report-download').click();
  const link=page.getByRole('link',{name:'保存したマップを開く'});await expect(link).toBeVisible();const url=(await link.getAttribute('href'))!;
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const req=indexedDB.open('jishingoto-offline-evac-v1',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('routes','readwrite'),store=tx.objectStore('routes'),get=store.get('report-123456789');get.onsuccess=()=>{const r=get.result;delete r.shelters;delete r.sheltersSavedAt;delete r.scenario;r.version=3;store.put(r);};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}));
  const offline=await context.newPage();await offline.goto(url);
  await offline.evaluate(()=>{navigator.geolocation.watchPosition=(_success,error)=>{queueMicrotask(()=>error?.({code:1,message:'denied'} as GeolocationPositionError));return 1;};});
  await offline.locator('#nearby-search').click();await expect(offline.locator('#nearby-status')).toContainText('取得できません');
  await expect(offline.locator('#save-nearby')).toBeVisible();await offline.locator('#save-nearby').click();await expect(offline.locator('#message')).toContainText('周辺の避難先も保存しました');
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:35.718,longitude:139.731});await context.setOffline(true);await offline.reload();
  await offline.locator('#nearby-search').click();await expect(offline.locator('#nearby-list')).toContainText('周辺の避難公園');await expect(offline.locator('#workspace-title')).toHaveText('リザルト小学校');
});
test('いつもの入口を圏外で開くと保存地図へ移り、復帰後は通常の画面を開く',async({page,context})=>{
  const frame=await resultPage(page);await expect(frame.locator('#report-download')).toBeEnabled();await frame.locator('#report-download').click();await expect(page.getByRole('link',{name:'保存したマップを開く'})).toBeVisible();
  await context.setOffline(true);
  const requests:string[]=[];context.on('request',r=>{if(r.url().startsWith('https://'))requests.push(r.url());});
  for(const entry of ['/','/home','/home/','/evac/report']){
    const offline=await context.newPage();await offline.goto(entry);
    await expect(offline).toHaveURL(/\/offline-evac\/index.html\?entry=offline$/);
    await expect(offline.locator('#workspace-title')).toHaveText('リザルト小学校');
    await expect(offline.locator('#map')).toHaveAttribute('data-map-ready','true');
    await expect(offline.locator('#connection')).toHaveText('オフライン');
    await expect(offline.locator('#shell-status')).toContainText('準備ができています');
    await offline.close();
  }
  expect(requests).toEqual([]);
  await context.setOffline(false);await page.goto('/home');await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('link',{name:'保存したマップを見る'})).toBeVisible();
  await page.goto('/');await expect(page.getByRole('heading',{name:'どちらではじめる？'})).toBeVisible();
});
test('ホームだけ訪問した端末も圏外時は空の保存画面を開き、通信断時のホームからも切り替わる',async({page,context})=>{
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-offline-entry-ready','true');
  await context.setOffline(true);
  await expect(page).toHaveURL(/entry=offline$/);await expect(page.locator('#saved-list')).toContainText('まだ保存したマップはありません');
  const cold=await context.newPage();await cold.goto('/home');await expect(cold.locator('#saved-list')).toContainText('まだ保存したマップはありません');
});

test('複数の保存から20件以上をまとめ、別マップの道路で候補への経路を表示する',async({page,context})=>{
  const frame=await resultPage(page);await expect(frame.locator('#report-download')).toBeEnabled();await frame.locator('#report-download').click();
  const link=page.getByRole('link',{name:'保存したマップを開く'});await expect(link).toBeVisible();const url=(await link.getAttribute('href'))!;
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const req=indexedDB.open('jishingoto-offline-evac-v1',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('routes','readwrite'),store=tx.objectStore('routes'),get=store.get('report-123456789');get.onsuccess=()=>{
    const a=get.result,b={...a,id:'other-map',name:'別マップの避難先',shelter:{lat:35.722,lng:139.733},shelters:Array.from({length:25},(_,i)=>({name:`保存済み公園${i+1}`,kind:'指定緊急避難場所',position:{lat:35.718+i*.0001,lng:139.733}}))};
    a.graph={...a.graph,bbox:{...a.graph.bbox,east:139.732}};a.shelters=[];store.put(a);store.put(b);
  };tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}));
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:35.718,longitude:139.731});await context.setOffline(true);
  const offline=await context.newPage();await offline.goto(url);await offline.locator('#nearby-search').click();
  await expect(offline.locator('#nearby-list button')).toHaveCount(5);
  await offline.getByRole('button',{name:'ほかの避難先も見る'}).click();
  await expect(offline.locator('#nearby-list button')).toHaveCount(27);
  await offline.getByRole('button',{name:/保存済み公園25 /}).click();
  await expect(offline.locator('#workspace-title')).toHaveText('保存済み公園25');
  await expect(offline.locator('#message')).toContainText('再検索');
  await expect(offline.getByRole('img',{name:'避難先',exact:true})).toHaveAttribute('data-lng','139.733');
  await expect(offline.locator('#map')).toHaveAttribute('data-map-ready','true');
});

test('場所登録は表示せず、選択した避難所のマップを一覧から開ける',async({page})=>{
  await page.goto('/evac?mode=mock');
  await expect(page.getByRole('heading',{name:'避難先を選ぼう'})).toBeVisible();
  await expect(page.getByRole('button',{name:/会社 → 自宅|学校 → 自宅/})).toHaveCount(0);
  await expect(page.locator('a[href="/places"]')).toHaveCount(0);
  const frame=await resultPage(page);
  await expect(frame.locator('#report-download')).toBeEnabled();await frame.locator('#report-download').click();
  await expect(page.getByRole('link',{name:'保存したマップを開く'})).toBeVisible();
  await page.goto('/places');await expect(page).toHaveURL(/offline-evac\/index.html$/);
  await expect(page.locator('a[href="/places"]')).toHaveCount(0);
  await expect(page.locator('#saved-list')).toContainText('リザルト小学校');
  await page.getByRole('button',{name:'地図を見る',exact:true}).click();
  await expect(page.locator('#map')).toHaveAttribute('data-map-ready','true');
  await expect(page.locator('#workspace-title')).toHaveText('リザルト小学校');
});

test('ホームから保存一覧を選び、戻るボタンで直前の画面へ戻れる',async({page})=>{
  const frame=await resultPage(page);await expect(frame.locator('#report-download')).toBeEnabled();await frame.locator('#report-download').click();
  await page.getByRole('link',{name:'保存したマップを開く'}).click();
  await page.getByRole('button',{name:'戻る',exact:true}).click();await expect(page).toHaveURL(/evac\/report$/);
  await expect(page.getByRole('heading',{name:'ふりかえり',exact:true})).toBeVisible();
  await page.goto('/home');await page.getByRole('link',{name:'保存したマップを見る'}).click();await expect(page.locator('#saved-list')).toContainText('リザルト小学校');
  await page.getByRole('link',{name:'避難先を選ぶ',exact:true}).click();await page.getByRole('button',{name:'戻る',exact:true}).click();await expect(page).toHaveURL(/offline-evac\/index.html$/);
  await page.getByRole('button',{name:'戻る',exact:true}).click();await expect(page).toHaveURL(/home$/);
});
