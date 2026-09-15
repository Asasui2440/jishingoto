import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Service Worker responses bypass Playwright's request mocks.
test.use({ serviceWorkers: 'block' });

const sdk = readFileSync('tests/fixtures/street-sdk.js', 'utf8');
const kit = `(() => {
 const prior=google.maps.importLibrary;
 class Request extends HTMLElement {constructor(options){super();Object.assign(this,options);}}
 class Search extends HTMLElement {
  constructor(options){super();Object.assign(this,options);this.places=[];}
  connectedCallback(){setTimeout(()=>{
   if(!this.isConnected)return;
   if(new URLSearchParams(location.search).has('kitError')){this.dispatchEvent(new Event('gmp-error'));return;}
   const root=this.attachShadow({mode:'open'});
   const credit=document.createElement('p');credit.textContent='Google Maps';root.append(credit);
   this.places=[{id:'fixture-other',location:{lat:()=>35.66,lng:()=>139.74}},{id:'fixture-south-tower',location:{lat:()=>35.6655628,lng:()=>139.7394682}}];
   this.places.forEach((place,i)=>{const b=document.createElement('button');b.textContent=i?'アークヒルズサウスタワー 東京都港区六本木':'別の建物';b.onclick=()=>{const e=new Event('gmp-select');e.place=place;this.dispatchEvent(e);};root.append(b);});
   this.dispatchEvent(new Event('gmp-load'));
  },10);}
 }
 customElements.define('gmp-place-text-search-request',Request);
 customElements.define('gmp-place-search',Search);
 google.maps.importLibrary=async(name)=>name==='places'?{PlaceSearchElement:Search,PlaceTextSearchRequestElement:Request}:prior(name);
})();`;

async function setup(page: import('@playwright/test').Page) {
  await page.addInitScript({ content: sdk + '\n' + kit });
  await page.route('https://maps.gsi.go.jp/**', route => route.fulfill({ json: { features: [] } }));
  await page.route('https://maps.googleapis.com/**', route => { throw new Error(`Unexpected Google fallback: ${new URL(route.request().url()).pathname}`); });
}

test('候補を選んで初めて出発地点が変わり、UI Kit座標の期限を保持する', async ({ page }) => {
  await setup(page);
  await page.goto('/evac?mode=api', { waitUntil: 'domcontentloaded' });
  const initial = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jishingoto.evac.v2')!).home);
  await page.getByRole('textbox', { name: '建物名・駅名・住所で出発地点を検索' }).fill('アークヒルズサウスタワー');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('button', { name: '別の建物', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jishingoto.evac.v2')!).home)).toEqual(initial);
  await expect(page.locator('gmp-place-search').getByText('Google Maps', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'アークヒルズサウスタワー 東京都港区六本木', exact: true }).click();
  const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jishingoto.evac.v2')!));
  expect(state.home).toEqual({ lat: 35.6655628, lng: 139.7394682 });
  expect(state.homeOrigin.kind).toBe('places-ui-kit');
  expect(state.homeOrigin.expiresAt - state.homeOrigin.acquiredAt).toBe(30 * 86400000);
  expect(state.homeLabel).toBe('アークヒルズサウスタワー');
  await expect(page.getByRole('heading', { name: '出発地点を選ぶ' })).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('APIエラーを表示して再試行でき、別APIや先頭候補へ自動的に切り替えない', async ({ page }) => {
  await setup(page);
  await page.goto('/evac?mode=api&kitError=1', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: '建物名・駅名・住所で出発地点を検索' }).fill('アークヒルズサウスタワー');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Places UI Kit API' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'もう一度検索する' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jishingoto.evac.v2')!).homeOrigin)).toBeFalsy();
});

test('IndexedDBから期限切れのマップを削除し、再保存で期限を延ばさない', async ({ page }) => {
  await page.goto('/evac?mode=mock', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    // @ts-expect-error Runtime static module served by the app.
    const storage = await import('/offline-evac/storage.mjs');
    const now=Date.now(), days=30*86400000;
    const origin={kind:'places-ui-kit',placeId:'fixture',acquiredAt:now-10000,expiresAt:now-10000+days};
    const route={id:'report-123',start:{lat:35.665,lng:139.739},shelter:{lat:35.668,lng:139.739},savedAt:now,homeOrigin:origin};
    await storage.putRoute(route);await storage.putRoute({...route,savedAt:now+1000});
    const kept=(await storage.allRoutes())[0];
    const db=await storage.openDB();
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('routes','readwrite');tx.objectStore('routes').put({...route,id:'report-expired',start:{lat:35.666,lng:139.739},homeOrigin:{...origin,acquiredAt:now-days-1,expiresAt:now-1}});tx.oncomplete=()=>resolve();tx.onerror=()=>reject();});
    const records=await storage.allRoutes();
    const count=await new Promise<number>((resolve,reject)=>{const req=db.transaction('routes').objectStore('routes').count();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject();});db.close();
    return {kept:kept.homeOrigin,origin,count,ids:records.map((r:{id:string})=>r.id)};
  });
  expect(result.kept).toEqual(result.origin);expect(result.ids).toEqual(['report-123']);expect(result.count).toBe(1);
});

test('地図のないリザルトから独立ページへ移り、期限だけを保ってGoogle経路を渡さない', async ({ page }) => {
  await setup(page);
  await page.goto('/evac?mode=api', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: '建物名・駅名・住所で出発地点を検索' }).fill('アークヒルズサウスタワー');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await page.getByRole('button', { name: 'アークヒルズサウスタワー 東京都港区六本木', exact: true }).click();
  const origin = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jishingoto.evac.v2')!).homeOrigin);
  // Test the result-page handoff separately from the walking simulation.
  await page.addInitScript(({ origin }) => {
    const state = JSON.parse(sessionStorage.getItem('jishingoto.evac.v2')!);
    state.home = { lat: 35.6655628, lng: 139.7394682 };
    state.homeOrigin = origin;
    state.shelter = { id: 'test-public', name: 'テスト用の公的避難場所', kind: '指定緊急避難場所', source: '公的データのテスト', position: { lat: 35.67, lng: 139.74 } };
    state.finishedAt = Date.now();
    sessionStorage.setItem('jishingoto.evac.v2', JSON.stringify(state));
  }, { origin });
  await page.route('**/offline-evac/index.html?from=report', route => route.fulfill({ contentType: 'text/html', body: `<script>addEventListener('message',e=>{if(e.data?.type==='OFFLINE_REPORT_LOAD')document.body.textContent=JSON.stringify(e.data.payload)});parent.postMessage({type:'OFFLINE_REPORT_READY'},location.origin)</script><body></body>` }));
  await page.goto('/evac/report', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('iframe, .gm-style')).toHaveCount(0);
  await page.evaluate(() => { (window as Window & { reportDocument?: boolean }).reportDocument = true; });
  const googleRequests: string[] = [];
  page.on('request', request => { if (/maps\.googleapis|maps\.gstatic|streetviewpixels/.test(request.url())) googleRequests.push(request.url()); });
  await page.getByRole('link', { name: 'オフライン用の避難地図を作成' }).click();
  await expect(page).toHaveURL(/\/evac\/save$/);
  expect(await page.evaluate(() => (window as Window & { reportDocument?: boolean }).reportDocument)).toBeUndefined();
  await expect(page.getByText('体験時と道順が異なる場合があります。', { exact: false })).toBeVisible();
  const frame = page.frameLocator('iframe[title="保存するオフライン地図と避難所"]');
  await expect(frame.locator('body')).toContainText('places-ui-kit');
  const payload = JSON.parse(await frame.locator('body').innerText());
  expect(payload.homeOrigin).toEqual(origin);
  expect(payload.start).toEqual({ lat: 35.6655628, lng: 139.7394682 });
  expect(payload).not.toHaveProperty('path');expect(payload).not.toHaveProperty('routes');expect(payload).not.toHaveProperty('walk');
  expect(payload).not.toHaveProperty('traveledPath');expect(payload).not.toHaveProperty('decisions');
  expect(googleRequests).toEqual([]);
  await page.reload();
  await expect(frame.locator('body')).toContainText('places-ui-kit');
  expect(JSON.parse(await frame.locator('body').innerText()).homeOrigin).toEqual(origin);
  await page.getByRole('link', { name: 'ふりかえりに戻る', exact: true }).click();
  await expect(page).toHaveURL(/\/evac\/report$/);
  await expect(page.locator('iframe, .gm-style')).toHaveCount(0);
});


test('保存ページを記録なしで直接開くと準備画面へ戻り、地図を取得しない', async ({ page }) => {
  await page.goto('/evac/save');
  await expect(page).toHaveURL(/\/evac$/);
  await expect(page.locator('iframe[title="保存するオフライン地図と避難所"]')).toHaveCount(0);
});

test('旧Google地図由来の出発地点では保存ページから再選択を案内する', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('jishingoto.evac.v2', JSON.stringify({
    mode: 'api', home: { lat: 35.665, lng: 139.739 }, homeOrigin: { kind: 'google-map' },
    shelter: { id: 'test-public', name: '公的避難場所', position: { lat: 35.67, lng: 139.74 } },
    finishedAt: 12345,
  })));
  await page.goto('/evac/save');
  await expect(page.getByRole('link', { name: '出発地点を選び直す' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});
