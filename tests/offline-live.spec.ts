import {test,expect} from '@playwright/test';
// Opt-in only: public locations, real map/road downloads, isolated browser storage.
test('実際の道路地図を保存して、通信断後に現在地と経路を描画する',async({page,context})=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>sessionStorage.setItem('jishingoto.evac.v2',JSON.stringify({mode:'mock',home:{lat:35.7186,lng:139.7237},shelter:{id:'gokokuji',name:'護国寺一帯',kind:'指定緊急避難場所',position:{lat:35.720812,lng:139.726671},source:'国土地理院 指定緊急避難場所データ',address:''},routes:[],startRouteId:null,takenRouteIds:[],decisions:[],walk:null,finishedAt:987654321,followUp:'正門の位置を家族と確認する'})));
  await page.goto('/evac/report');await page.getByRole('button',{name:'このマップと避難所を保存する',exact:true}).click();
  const frame=page.frameLocator('iframe[title="保存するオフライン地図と避難所"]');
  await expect(frame.locator('#report-download')).toBeEnabled({timeout:90000});
  await expect(frame.locator('#map')).toHaveAttribute('data-map-ready','true');
  await expect(frame.locator('#map')).not.toHaveAttribute('data-map-error',/.+/);
  await frame.locator('#report-download').click();
  const link=page.getByRole('link',{name:'保存したマップを開く'});await expect(link).toBeVisible();const url=(await link.getAttribute('href'))!;
  const position=await page.evaluate(()=>new Promise<{lat:number;lng:number}>((resolve,reject)=>{const r=indexedDB.open('jishingoto-offline-evac-v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('routes'),get=tx.objectStore('routes').get('report-987654321');get.onsuccess=()=>{const path=get.result.path;resolve(path[Math.floor(path.length/2)]);};tx.oncomplete=()=>db.close();};}));
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:position.lat,longitude:position.lng,accuracy:8});
  await context.setOffline(true);const requests:string[]=[];context.on('request',r=>{if(r.url().startsWith('https://'))requests.push(r.url());});
  const offline=await context.newPage();await offline.goto(url);await expect(offline.locator('#connection')).toHaveText('オフライン');
  await offline.getByRole('button',{name:'◎ 現在地を表示'}).click();await expect(offline.getByRole('img',{name:'現在地',exact:true})).toBeVisible();
  await offline.getByRole('button',{name:'全体',exact:true}).click();await expect(offline.locator('#map')).toHaveAttribute('data-map-ready','true');await expect(offline.locator('#map')).not.toHaveAttribute('data-map-error',/.+/);
  await offline.locator('#nearby-search').click();await expect(offline.locator('#nearby-list button').first()).toBeVisible();
  await offline.locator('#nearby-list button').first().click();await expect(offline.locator('#route-summary')).toContainText('徒歩');
  await offline.screenshot({path:'test-results/offline-live-road-map.png',fullPage:true});expect(requests).toEqual([]);
});
