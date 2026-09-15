import { DETECTED_RISKS, QUESTIONS } from "../src/lib/content";
import { readFile } from "node:fs/promises";
import { WALK_SCENARIOS } from "../src/lib/walk-scenarios";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

async function openIllustratedQuestion(page: Page, number = 28, seconds = 3) {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  await page.addInitScript(({event,seconds}) => {
    const saved = JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!);
    saved.timerSeconds = seconds;
    saved.walk.steps[1].event = event;
    saved.walk.steps[1].pointId = "illustrated-question";
    sessionStorage.setItem("jishingoto.evac.v2", JSON.stringify(saved));
  }, {event:WALK_SCENARIOS.find(c=>c.number===number)!.event,seconds});
  await page.goto("/evac/walk?decision=1", {waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"自動で歩く",exact:true}).click();
  await expect(page.getByRole("region",{name:/判断ポイント/}).locator("li button").first()).toBeEnabled();
}

for (const number of [9, 18, 28, 38]) {
test(`問題${number}に対応するV2画像４枚を表示する`, async ({page}, testInfo) => {
  await openIllustratedQuestion(page, number);
  const images = page.getByRole("region",{name:/判断ポイント/}).locator("img");
  await expect(images).toHaveCount(4);
  for (const img of await images.all()) {
    await expect(img).toHaveAttribute("src", new RegExp(`walk-case-${number}/.*-v2\\.webp$`));
    await expect.poll(()=>img.evaluate((el: HTMLImageElement)=>el.naturalWidth)).toBe(960);
  }
  for (const choice of await page.getByRole("region",{name:/判断ポイント/}).locator("li button").all()) {
    await expect(choice).toBeInViewport({ratio: 0.95});
  }
  const event = WALK_SCENARIOS.find(c=>c.number===number)!.event;
  for (const choice of event.choices) {
    await expect(page.getByRole("img",{name:`行動のイラスト：${choice.label}`,exact:true}))
      .toHaveAttribute("src", `/illustrations/evac/${event.id}/${choice.id}-v2.webp`);
  }
  await page.screenshot({path:testInfo.outputPath(`v2-${number}.png`)});
});
}

test("問題はすぐ回答でき、Street View確認中は時計と地点を保持する", async ({page},testInfo) => {
  await openIllustratedQuestion(page);
  const card = page.getByRole("region",{name:/判断ポイント/});
  const timer = card.getByTestId("decision-timer");
  await expect(page.getByRole("button",{name:"判断を始める",exact:true})).toHaveCount(0);
  await expect(card.locator("li button").first()).toBeEnabled();
  await expect(timer).toHaveText("2秒");
  const scene = page.getByRole("region",{name:"Street Viewで進む体験"});
  const pano = await scene.getAttribute("data-pano-id");
  await scene.evaluate(el=>el.setAttribute("data-preserved-scene","yes"));
  await card.getByRole("button",{name:"Street Viewで周りを見る"}).click();
  await expect(card).not.toBeVisible();
  const frozen = await page.getByTestId("decision-timer").textContent();
  await page.waitForTimeout(2100);
  expect(await page.getByTestId("decision-timer").textContent()).toBe(frozen);
  await expect(scene).toHaveAttribute("data-pano-id",pano!);
  await expect(scene).toHaveAttribute("data-preserved-scene","yes");
  await page.screenshot({path:testInfo.outputPath("quiz-street-view.png")});
  await page.getByRole("button",{name:"クイズに戻る",exact:true}).click();
  await expect(card.locator("li button").first()).toBeEnabled();
  for(const choice of await card.locator("li button").all()) {
    await expect(choice).toBeInViewport({ratio:0.95});
  }
  await page.screenshot({path:testInfo.outputPath("quiz-number-tabs.png")});
  await card.locator("li button").first().click();
  await expect(card).toHaveCount(0);
});

test("画像の読み込み中も問題文と回答操作を表示する", async ({page}) => {
  let release!: () => void;
  const held = new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/illustrations/evac/**/*.webp", async route => {
    await held;
    await route.continue();
  });
  try {
    await openIllustratedQuestion(page,38);
    const card = page.getByRole("region",{name:/判断ポイント/});
    await expect(card).toContainText("この条件なら、まずどうする？");
    await expect(card.locator("li button").first()).toBeEnabled();
    expect(await card.locator("img").first().evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(0);
    release();
    await expect.poll(()=>card.locator("img").first().evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(960);
    await card.locator("li button").first().click();
    await expect(card).toHaveCount(0);
  } finally { release(); }
});

test("イラスト確認後に時間切れになっても自分で回答できる", async ({page}) => {
  await openIllustratedQuestion(page);
  const card = page.getByRole("region",{name:/判断ポイント/});
  await expect(card.getByTestId("decision-timer")).toHaveText("0秒");
  for (const choice of await card.locator("li button").all()) await expect(choice).toBeInViewport({ratio: 0.95});
  await card.locator("li button").last().click();
  await expect(card).toHaveCount(0);
  const saved = await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(saved.decisions[0].timedOut).toBe(true);
});

async function capture(page: Page, testInfo: TestInfo, name: string) {
  if (testInfo.project.name !== "mobile-390") return;
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
}

async function noPageOverflow(page: Page, action: Locator) {
  await expect(action).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    vertical: document.documentElement.scrollHeight > window.innerHeight + 1,
  }))).toEqual({ horizontal: false, vertical: false });
}

async function openMockRoute(page: Page, testInfo?: TestInfo) {
  await page.goto("/evac?mode=mock&from=standalone");
  await expect(page.getByRole("heading", { name: "ひなんルート" })).toBeVisible();

  const shelters = page.getByRole("region", { name: "避難先を選ぶ" });
  await shelters.getByRole("button", { name: /教育.*森公園/ }).click();
  const compare = page.getByRole("button", { name: "ルートを比べる" });
  await noPageOverflow(page, compare);
  if (testInfo) await capture(page, testInfo, "route-setup");
  await compare.click();

  await expect(page).toHaveURL(/\/evac\/routes/);
  await expect(page.getByRole("heading", { name: "どの道で行こう？" })).toBeVisible();
  const routeA = page.getByRole("button", { name: /ルート A/ });
  const routeB = page.getByRole("button", { name: /ルート B/ });
  await expect(routeA).toHaveAttribute("aria-pressed", "true");
  await routeB.click();
  await routeA.click();
  const start = page.getByRole("button", { name: "この道でスタート" });
  await noPageOverflow(page, start);
  if (testInfo) await capture(page, testInfo, "route-comparison");
  await start.click();
}

async function jumpToNextDecision(page: Page, expectAttention = true, testInfo?: TestInfo) {
  const originalScene = await page.getByRole("region", { name: "Street Viewで進む体験" }).boundingBox();
  await page.getByRole("button", { name: "遊び方・設定" }).click();
  const help = page.getByRole("dialog", { name: "歩き方・設定" });
  if (!expectAttention) {
    await help.getByRole("button", { name: "次の判断ポイントへ進む" }).click();
    return;
  }
  const toast = page.getByTestId("attention-toast");
  // 1秒だけの通知なので、クリック前から表示待ちを始めて取り逃がさない。
  await Promise.all([
    toast.waitFor({ state: "visible", timeout: 2_000 }),
    help.getByRole("button", { name: "次の判断ポイントへ進む" }).click(),
  ]);
  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  await expect(toast).toContainText("注意ポイント");
  const center = await toast.boundingBox();
  const main = await page.getByRole("main",{name:"避難ルートの体験"}).boundingBox();
  expect(Math.abs(center!.y+center!.height/2-(main!.y+main!.height/2))).toBeLessThan(2);
  await expect(scene.locator(".animate-zone-flash")).toHaveCount(0);
  const heightDuringNotice = await scene.evaluate((element) => element.getBoundingClientRect().height);
  if (testInfo) await capture(page, testInfo, "attention-notice");
  await expect(toast).not.toBeVisible({ timeout: 2_000 });
  const heightAfterNotice = await scene.evaluate((element) => element.getBoundingClientRect().height);
  expect(Math.abs(heightAfterNotice - heightDuringNotice)).toBeLessThan(1);
  expect(Math.abs(heightAfterNotice - originalScene!.height)).toBeLessThan(1);
}

test("MainのStreet View体験をコンパクトな画面で最後まで進める", async ({ page }, testInfo) => {
  await openMockRoute(page, testInfo);
  await expect(page).toHaveURL(/\/evac\/walk$/);

  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute("data-scene-state", "sketch");
  await expect.poll(() => scene.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(110);

  const forward = page.getByRole("region", { name: "歩行の操作" }).getByRole("button", { name: "進む" });
  await noPageOverflow(page, forward);
  await capture(page, testInfo, "street-view-walk");
  await forward.click();

  await page.getByRole("button", { name: "地図" }).click();
  const map = page.getByRole("dialog", { name: "いまいる場所と通った道" });
  await expect(map).toBeVisible();
  const stateBeforeWait = await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"));
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"))).toEqual(stateBeforeWait);
  await map.getByRole("button", { name: "Street Viewに戻る" }).click();

  for (const number of [1, 2, 3]) {
    await jumpToNextDecision(page, true, number === 1 ? testInfo : undefined);
    const decision = page.getByRole("region", { name: new RegExp(`^判断ポイント ${number} /`) });
    await expect(decision).toBeVisible();
    const choices = decision.getByRole("list").getByRole("button");
    await expect(choices).toHaveCount(3);
    await choices.last().scrollIntoViewIfNeeded();
    await noPageOverflow(page, choices.last());
    if (number === 1) await capture(page, testInfo, "street-view-decision");
    await choices.first().click();
    await expect(decision).not.toBeVisible();
  }

  await jumpToNextDecision(page, false);
  const reflect = scene.getByRole("button", { name: "ふりかえる" });
  await noPageOverflow(page, reflect);
  await expect(scene.getByTestId("arrival-overlay")).toBeVisible();
  await expect(scene.getByTestId("arrival-overlay")).toHaveCSS("background-color", /(?:, |\/ )0\.9\)$/);
  await page.screenshot({path:testInfo.outputPath("arrival-white.png")});
  await reflect.click();
  await expect(page).toHaveURL(/\/evac\/report$/);
  await expect(page.getByRole("heading", { name: "ふりかえり" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^判断\d+：/ })).toHaveCount(3);
  await capture(page, testInfo, "route-report");
  await expect(page.getByRole("heading",{name:"次に確かめること",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"判断のスコアを見る"}).click();
  await expect(page).toHaveURL(/\/evac\/summary$/);
  await expect(page.getByRole("region",{name:"判断スコア"})).toContainText("/ 100");
  await expect(page.getByRole("heading",{name:"判断の振り返り"})).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await capture(page,testInfo,"judgment-score");
  const finish = page.getByRole("button",{name:"振り返りを終わる"});
  await noPageOverflow(page, finish);
  await finish.click();
  const followDialog = page.getByRole("dialog",{name:"次に確かめること"});
  const follow = followDialog.locator("button[aria-pressed]").first();
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed","true");
  const selected = await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).followUp);
  expect(selected).toBeTruthy();
  await capture(page,testInfo,"judgment-summary");
  await page.reload();
  await page.getByRole("button",{name:"振り返りを終わる"}).click();
  await expect(followDialog.getByRole("button",{pressed:true})).toHaveCount(1);
  await noPageOverflow(page, followDialog.getByRole("button",{name:"次へ",exact:true}));
  await followDialog.getByRole("button",{name:"次へ",exact:true}).click();
  await expect(page).toHaveURL(/\/evac\/complete$/);
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button",{name:"ルートをこの端末に保存",exact:true}).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toMatch(/\.geojson$/);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.type).toBe("FeatureCollection");
  expect(exported.features[0].geometry.type).toBe("LineString");
  expect(exported.features[0].geometry.coordinates.length).toBeGreaterThan(1);
  expect(exported.features[0].properties.followUp).toBe(selected);
  await expect(page.getByRole("status")).toContainText("ダウンロードしました");
  await noPageOverflow(page, page.getByRole("link",{name:"トップページへ戻る",exact:true}));
  await noPageOverflow(page, page.getByRole("button",{name:"別のルートで試す",exact:true}));
  await page.screenshot({path:testInfo.outputPath("complete-options.png")});
  await page.getByRole("link",{name:"トップページへ戻る",exact:true}).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/evac/complete");
  await page.getByRole("button",{name:"別のルートで試す",exact:true}).click();
  await expect(page).toHaveURL(/\/evac\/routes$/);
  const restarted = await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(restarted.finishedAt).toBeNull();
  expect(restarted.decisions).toHaveLength(0);
  expect(restarted.shelter).toBeTruthy();
});

test("一歩進んだ位置を再読込後も保持する", async ({ page }) => {
  await openMockRoute(page);
  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  await expect(scene).toHaveAttribute("data-scene-state", "sketch");
  await jumpToNextDecision(page);
  const point = page.getByRole("region", { name: /^判断ポイント 1 / });
  await point.getByRole("list").getByRole("button").first().click();
  await expect(point).not.toBeVisible();
  const stored = await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"));
  await page.reload();
  await expect(scene).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"))).toEqual(stored);
});

// These tests run the API-mode UI against a small, branching panorama graph.
test("隣接地点だけを歩き、見回しと地図操作では移動しない", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk");
  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  await expect(scene).toHaveAttribute("data-pano-id", "A");
  await scene.getByRole("button", { name: "正面の道へ進む（1）" }).click();
  await expect(scene).toHaveAttribute("data-pano-id", "B");
  await expect(page.getByRole("button", { name: "自動で歩く" })).toBeEnabled();
  const before = await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"));
  await page.getByTestId("panorama-surface").dispatchEvent("pointerdown");
  await expect(scene).toHaveAttribute("data-pov-heading", "90");
  expect(await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"))).toEqual(before);
  await page.getByRole("button", { name: "地図", exact: true }).click();
  const map = page.getByRole("dialog", { name: "いまいる場所と通った道" });
  await expect(page.getByTestId("map-surface")).toBeVisible();
  const actual = await page.evaluate(() => {
    const fixture = (window as unknown as { streetTest: { walker: { position: { lat: number; lng: number }; icon: { rotation: number } }; map: { emit: (name: string, value: unknown) => void }; positionCommands: number; moves: string[] } }).streetTest;
    fixture.map.emit("click", { latLng: { lat: () => 36, lng: () => 140 } });
    return { position: fixture.walker.position, heading: fixture.walker.icon.rotation, coordinateMoves: fixture.positionCommands, moves: fixture.moves };
  });
  expect(actual).toEqual({ position: { lat: 35.0003, lng: 139 }, heading: 90, coordinateMoves: 0, moves: ["B"] });
  await map.getByRole("button", { name: "Street Viewに戻る" }).click();
  await expect(scene).toHaveAttribute("data-pov-heading", "90");
  expect(await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"))).toEqual(before);
  await scene.getByRole("button", { name: "正面の道へ進む（2）" }).click();
  await expect(scene).toHaveAttribute("data-pano-id", "C");
  await expect(page.getByRole("button", { name: "ふりかえる" })).toBeEnabled();
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk);
  expect(stored.street.path).toEqual([{ lat: 35, lng: 139 }, { lat: 35.0003, lng: 139 }, { lat: 35.0003, lng: 139.0006 }]);
});

test("Street Viewの移動失敗時は進行せず地図を開ける", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk");
  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  const move = scene.getByRole("button", { name: "正面の道へ進む（1）" });
  await expect(move).toBeEnabled();
  const before = await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"));
  await page.evaluate(() => { (window as unknown as { streetTest: { failNext: boolean } }).streetTest.failNext = true; });
  await move.click();
  await expect(scene).toHaveAttribute("data-scene-state", "error");
  await expect(page.getByRole("button", { name: "向いている道へ進む" })).toBeDisabled();
  expect(await page.evaluate(() => sessionStorage.getItem("jishingoto.evac.v2"))).toEqual(before);
  await page.getByRole("button", { name: "地図", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "いまいる場所と通った道" })).toBeVisible();
});


test("自動歩行は見回しに影響されず選択ルートで曲がり避難先付近で停止する", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?streetAuto=1");
  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  const auto = page.getByRole("button", { name: "自動で歩く" });
  await expect(auto).toBeEnabled();
  await auto.click();
  // The SDK publishes fresh links with every view update. Those notifications
  // must not keep postponing the next hop while someone looks around.
  await page.evaluate(() => {
    const fixture = (window as unknown as { streetTest: { pano: { pov: { heading: number; pitch: number }; emit: (name: string) => void } } }).streetTest;
    const timer = setInterval(() => {
      fixture.pano.pov = { heading: (fixture.pano.pov.heading + 15) % 360, pitch: 15 };
      fixture.pano.emit("pov_changed");
    }, 100);
    setTimeout(() => clearInterval(timer), 7000);
  });
  await expect(scene).toHaveAttribute("data-pano-id", "C", { timeout: 8500 });
  await expect(page.getByRole("button", { name: "ふりかえる" })).toBeEnabled();
  await page.waitForTimeout(1800);
  const moves = await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves);
  expect(moves).toEqual(["A2", "A3", "B", "C"]);
});


test("同じ分岐でも選択ルートで自動歩行の行き先が変わる", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  for (const choice of ["east", "north"]) {
    await page.goto(`/evac/walk?startAtB=1&routeChoice=${choice}&missedQuestion=1`);
    await page.getByRole("button", { name: "自動で歩く" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves[0])).toBe(choice === "east" ? "C" : "D");
    await expect(page.getByRole("button", { name: "ふりかえる" })).toBeEnabled();
    await page.waitForTimeout(1800);
    const state = await page.evaluate(() => ({
      moves: (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves,
      session: JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!),
    }));
    expect(state.moves).toEqual(choice === "east" ? ["C"] : ["D", "C"]);
    expect(state.session.walk.street.arrived).toBe(true);
    expect(state.session.decisions).toEqual([]);
  }
});

test("終点と一致しない撮影地点でも避難先付近で停止する", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?startAtB=1&nearEndpoint=1&missedQuestion=1");
  await page.getByRole("button", { name: "自動で歩く" }).click();
  await expect(page.getByRole("heading", { name: "避難先付近に到着" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ふりかえる" })).toBeEnabled();
  await page.waitForTimeout(1800);
  const result = await page.evaluate(() => ({
    moves: (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves,
    session: JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!),
  }));
  expect(result.moves).toEqual(["C"]);
  expect(result.session.walk.street.position.lng).toBeCloseTo(139.0004);
  expect(result.session.shelter.position.lng).toBeCloseTo(139.0006);
  expect(result.session.walk.street.arrived).toBe(true);
  expect(result.session.decisions).toEqual([]);
});

test("外れた道を青い選択肢で戻り、移動方向へ視点が向く", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?startAtB=1");
  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  await scene.getByRole("button", { name: "正面の道へ進む（3）" }).click();
  await expect(scene).toHaveAttribute("data-pano-id", "D");
  const back = scene.getByRole("button", { name: "ルートに戻る", exact: true });
  await expect(back).toHaveClass(/bg-blue-700/);
  await scene.getByRole("button", { name: "正面の道へ進む（2）" }).click();
  await expect(scene).toHaveAttribute("data-pano-id", "F");
  await back.click();
  await expect(scene).toHaveAttribute("data-pano-id", "D");
  await expect(scene).toHaveAttribute("data-pov-heading", "180");
  await page.getByTestId("panorama-surface").dispatchEvent("pointerdown");
  await expect(scene).toHaveAttribute("data-pov-heading", "90");
  await back.click();
  await expect(scene).toHaveAttribute("data-pano-id", "B");
  await expect(scene).toHaveAttribute("data-pov-heading", "180");
  await expect(back).toHaveCount(0);
  const moves = await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves);
  expect(moves).toEqual(["D", "F", "D", "B"]);
});

test("施設中心から30m以上離れた隣接撮影ノードでも到着する", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?startAtB=1&farCenter=1&missedQuestion=1");
  await page.getByRole("button", { name: "自動で歩く" }).click();
  await expect(page.getByRole("heading", { name: "避難先付近に到着" })).toBeVisible();
  await page.waitForTimeout(1800);
  const result = await page.evaluate(() => ({
    moves: (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves,
    session: JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!),
  }));
  expect(result.moves).toEqual(["C"]);
  expect(result.session.walk.street.position.lng - result.session.shelter.position.lng).toBeCloseTo(0.0005);
  expect(result.session.walk.street.arrived).toBe(true);
  expect(result.session.decisions).toEqual([]);
});

test("到着ノードを取得できない場合は自動歩行で進み続けない", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?startAtB=1&missingArrival=1");
  await expect(page.getByText("避難先に隣接するStreet Viewを確認できません。地図を確認してください。")).toBeVisible();
  await expect(page.getByRole("button", { name: "自動で歩く" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "ふりかえる" })).toHaveCount(0);
  await page.getByRole("button", { name: "地図", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "いまいる場所と通った道" })).toBeVisible();
});


test("判断中は自動歩行を保持し回答後に再開する", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?decision=1", {waitUntil:"domcontentloaded"});
  await page.getByRole("button", { name: "自動で歩く" }).click();
  const decision = page.getByRole("region", { name: "判断ポイント 1 / 1" });
  await expect(decision.getByRole("button", { name: /周囲を確認して進む/ })).toBeEnabled();
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual(["B"]);
  await decision.getByRole("button", { name: /周囲を確認して進む/ }).click();
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ふりかえる" })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual(["B", "C"]);
});

test("接続失敗は歩行ボタンを再試行に切り替え、Street View中央に表示する", async ({ page }, testInfo) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?slowPlan=1&disconnected=1");
  await expect(page.getByRole("progressbar", { name: "地点確認の進捗" })).toBeVisible();
  await expect(page.getByRole("button", { name: "向いている道へ進む" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "道を再確認する" })).toBeVisible();
  const actions = page.getByRole("region", { name: "歩行の操作" });
  await expect(actions.getByRole("button")).toHaveCount(2);
  await expect(actions.getByRole("button", { name: "向いている道へ進む" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "自動で歩く" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "ルートを選び直す" })).toBeEnabled();
  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  const alert = scene.getByRole("alert");
  await expect(alert).toContainText("接続を確認できませんでした");
  const sceneBox = (await scene.boundingBox())!;
  const alertBox = (await alert.boundingBox())!;
  const actionsBox = (await actions.boundingBox())!;
  expect(Math.abs(alertBox.y + alertBox.height / 2 - (sceneBox.y + sceneBox.height / 2))).toBeLessThan(2);
  expect(Math.abs(alertBox.x + alertBox.width / 2 - (sceneBox.x + sceneBox.width / 2))).toBeLessThan(2);
  expect(alertBox.y + alertBox.height).toBeLessThan(actionsBox.y);
  await noPageOverflow(page, actions.getByRole("button", { name: "道を再確認する" }));
  await page.screenshot({ path: testInfo.outputPath("route-recovery.png") });
  await actions.getByRole("button", { name: "道を再確認する" }).click();
  await expect(actions.getByRole("button", { name: "向いている道へ進む" })).toBeDisabled();
  await expect(actions.getByRole("button", { name: "道を再確認する" })).toBeEnabled();
  await expect(actions.getByRole("button")).toHaveCount(2);
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual([]);
  await actions.getByRole("button", { name: "ルートを選び直す" }).click();
  await expect(page).toHaveURL(/\/evac\/routes$/);
});

test("地図表示中も自動歩行を保持し閉じると再開する", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk");
  await page.getByRole("button", { name: "自動で歩く" }).click();
  await page.getByRole("button", { name: "地図", exact: true }).click();
  const map = page.getByRole("dialog", { name: "いまいる場所と通った道" });
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual([]);
  await map.getByRole("button", { name: "Street Viewに戻る" }).click();
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ふりかえる" })).toBeEnabled();
});


test("避難先の敷地内が別の接続でも道路側ノードで到着して停止する", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?courtyard=1");
  await page.getByRole("button", { name: "自動で歩く" }).click();
  await expect(page.getByRole("button", { name: "ふりかえる" })).toBeEnabled();
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual(["B", "C"]);
});

test("現在地で場所を選びルート比較でケースを切り替える", async ({ page }, testInfo) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (success: (value: unknown) => void) => success({coords:{latitude:35.001,longitude:139}}) } });
  });
  await page.route("https://maps.gsi.go.jp/xyz/skhb*/**", async route => {
    const flood = route.request().url().includes("skhb01");
    await route.fulfill({json:{features:[{geometry:{coordinates:[139,flood ? 35.003 : 35.002]},properties:{name:flood ? "洪水の避難先" : "地震の避難先",address:"テストの住所",[flood ? "disaster1" : "disaster4"]:1}}]}});
  });
  await page.goto("/evac?mode=api");
  await expect(page.getByRole("button", { name: "現在地から始める" })).toBeVisible();
  await expect(page.getByRole("button", { name: "固定の練習問題", exact:true })).toHaveCount(0);
  await expect(page.getByRole("combobox",{name:"災害ケース"})).toHaveCount(0);
  await page.getByRole("button",{name:"現在地から始める"}).click();
  await expect(page.getByText("現在地を設定しました",{exact:true})).toBeVisible();
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(session.scenario).toBe("earthquake");
  expect(session.analysisMode).toBe("geo-ai");
  expect(session.home).toEqual({lat:35.001,lng:139});
  expect(session.routes).toEqual([]);
  expect(session.shelter).toBeNull();
  await noPageOverflow(page,page.getByRole("button",{name:"現在地から始める"}));
  await page.route("**/api/evac/assess",route=>route.fulfill({status:503,json:{}}));
  await page.getByRole("region",{name:"避難先を選ぶ"}).getByRole("button",{name:/地震の避難先/}).click();
  await page.getByRole("button",{name:"ルートを比べる"}).click();
  await expect(page.getByRole("heading",{name:"どの道で行こう？"})).toBeVisible();
  await expect(page.getByRole("button",{name:"この道でスタート"})).toBeEnabled();
  await page.getByRole("combobox",{name:"災害ケース"}).selectOption("flood");
  await expect(page.getByText("洪水に対応する避難先を選んでください")).toBeVisible();
  await expect(page).toHaveURL(/\/evac\/routes/);
  await page.getByRole("region",{name:"ルートを比較する"}).getByRole("button",{name:/洪水の避難先/}).click();
  await expect(page.getByRole("button",{name:"この道でスタート"})).toBeEnabled();
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).scenario)).toBe("flood");
  await noPageOverflow(page,page.getByRole("button",{name:"この道でスタート"}));
  await expect(page.locator("summary",{hasText:"洪水浸水想定（想定最大規模）"})).toBeVisible();
  await expect(page.getByText("ハザード比較：未取得区間あり")).toBeVisible();
  await capture(page,testInfo,"scenario-routes");
  await page.getByRole("combobox",{name:"災害ケース"}).selectOption("earthquake");
  await expect(page.locator("summary",{hasText:"洪水浸水想定（想定最大規模）"})).toHaveCount(0);
});

test("現在地の許可がない場合も住所検索を案内する", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: unknown, failure: (error: unknown) => void) => failure({code:1}) } });
  });
  await page.route("https://maps.gsi.go.jp/xyz/skhb*/**",route=>route.fulfill({json:{features:[]}}));
  await page.goto("/evac?mode=api");
  await page.getByRole("button",{name:"現在地から始める"}).click();
  await expect(page.getByText(/位置情報の利用が許可されていません/)).toBeVisible();
  await expect(page.getByRole("textbox",{name:"住所・駅名で出発地点を検索"})).toBeEnabled();
});

test("解析失敗時だけ固定問題を案内し洪水ケースのまま続ける", async ({ page }) => {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  const requests: Record<string,unknown>[]=[];
  await page.route("**/api/evac/scenarios", async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({status:502,json:{message:"地形データを取得できませんでした。"}});
  });
  await page.goto("/evac/walk?analysisFailure=1");
  await expect(page.getByRole("alert").filter({hasText:"地形データを取得できませんでした。"})).toBeVisible();
  expect(requests[0].scenario).toBe("flood");
  await page.getByRole("button",{name:"固定の練習問題で始める"}).click();
  await expect(page.getByRole("button",{name:"自動で歩く"})).toBeEnabled();
  const session=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(session.scenario).toBe("flood");
  expect(session.walk.source).toBe("sample");
  expect(session.walk.steps.filter((step:{event?:{id:string}})=>step.event).map((step:{event:{id:string}})=>step.event.id)).toEqual(["practice-flood"]);
});

test("結果ページは元の振り返り・4つのチカラ・備えのチェックリストを表示する", async ({ page }, testInfo) => {
  let roomApiCalls = 0;
  page.on("request", request => { if (request.url().includes("/api/room/")) roomApiCalls++; });
  await page.goto("/test-room");
  await page.getByRole("button", { name: "結果ページを試す（APIなし）" }).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByRole("heading", { name: "防災シミュレーション結果" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("行動の振り返り 1 / 2");
  await expect(page.getByRole("button", { name: "戻る", exact: true })).toBeDisabled();
  await expect(page.locator("article")).toContainText("Q1");
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("行動の振り返り 2 / 2");
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("今回のまとめ");
  await expect(page.getByText("あなたの防災4つのチカラ")).toBeVisible();
  await expect(page.getByRole("img", { name: "サンプルの予想図。あなたの部屋を再現した画像ではありません" })).toBeVisible();
  await expect(page.getByRole("img", { name: "親子で部屋の見取り図を囲み、備えを相談するイラスト" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "結果の読み方" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("result-summary-restored.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("行動の振り返り 2 / 2");
  await page.getByRole("button", { name: /理由・注意点を読む/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "室内の備え" })).toBeVisible();
  await page.getByRole("button", { name: /備えのチェックリストを開く/ }).click();
  const checklist = page.getByRole("dialog");
  await checklist.getByRole("checkbox").first().check();
  await checklist.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /か所 対策済み/ })).toContainText("1 / 3");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /結果を共有/ }).click();
  await expect(page).toHaveURL(/\/share$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "室内の備え" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /か所 対策済み/ })).toContainText("1 / 3");
  expect(roomApiCalls).toBe(0);
});

test("結果ページは元の予想図表示で不一致の再試行と共有時の再利用に対応する", async ({ page }) => {
  const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  const questions = [QUESTIONS[0]];
  const q = questions[0], choice = q.choices[0];
  await page.addInitScript(data => sessionStorage.setItem("jishingoto.session.v1", JSON.stringify(data)), {
    photoUrl: photo, risks: DETECTED_RISKS.map(r => ({ ...r, confirmed: true })), questions,
    answers: [{ questionId: q.id, choiceId: choice.id, safety: choice.safety, axis: q.axis, timedOut: false }],
    finishedAt: 1, resultStep: questions.length, checked: [],
  });
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/room/aftermath", async route => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.image).toBe(photo);
    expect(body.objects.map((object: { type: string }) => object.type)).toEqual(["bookshelf", "window", "doorway"]);
    if (calls === 1) {
      await gate;
      await route.fulfill({ status: 502, json: { error: "room-image-mismatch" } });
    } else await route.fulfill({ json: { imageUrl: photo, verification: "unavailable" } });
  });
  await page.goto("/result");
  await expect(page.getByText("AIが予想図をつくっています...")).toBeVisible();
  release();
  await expect(page.getByText(/元の部屋と大きく異なる画像/)).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "予想図をもう一度生成" }).click();
  await expect(page.getByRole("img", { name: "撮影した部屋をもとにした地震後の予想図", exact: true })).toBeVisible();
  await expect(page.getByText(/元写真との自動比較は完了していません/)).toBeVisible();
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.getByRole("button", { name: /結果を共有/ }).click();
  await expect(page).toHaveURL(/\/share$/);
  await page.getByRole("checkbox", { name: "予想図も共有する" }).check();
  await expect(page.getByText(/元写真との自動比較は完了していません/)).toBeVisible();
  expect(calls).toBe(2);
});

test("家具の確認中は生成せず、修正した対象をクイズ開始時に渡す", async ({ page }) => {
  await page.addInitScript(risk => sessionStorage.setItem("jishingoto.session.v1", JSON.stringify({
    photoUrl: "data:image/png;base64,AA==", risks: [risk], analysisSource: "ai", questions: [], answers: [], checked: [], resultStep: 5,
  })), DETECTED_RISKS[0]);
  const objects: { name: string; type: string }[][] = [];
  await page.route("**/api/room/aftermath", async route => {
    objects.push(route.request().postDataJSON().objects);
    await route.fulfill({ json: { imageUrl: "/figma/img/room-risk.jpg", verification: "checked" } });
  });
  await page.goto("/risks");
  await page.getByRole("button", { name: /認識を修正する/ }).click();
  const dialog = page.getByRole("dialog", { name: "認識を修正する" });
  await dialog.getByLabel("名前", { exact: true }).fill("壁掛けテレビ");
  await dialog.locator("select").selectOption("tv");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  expect(objects).toHaveLength(0);
  await page.getByRole("button", { name: "確認を終える", exact: true }).click();
  expect(objects).toHaveLength(0);
  await page.getByRole("button", { name: "行動クイズへ", exact: true }).click();
  await expect(page).toHaveURL(/\/quiz$/);
  await expect.poll(() => objects.length).toBe(1);
  expect(objects[0][0]).toMatchObject({ name: "壁掛けテレビ", type: "tv", mounted: true, bounds: DETECTED_RISKS[0].bounds });
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!).resultStep)).toBe(0);
});

test("フェーズ2の準備・経路比較・歩行からホームへ戻れ、部屋の記録を保持する", async ({ page }) => {
  await page.goto("/test-room");
  await page.getByRole("button", { name: "結果ページを試す（APIなし）" }).click();
  const roomBefore = await page.evaluate(() => sessionStorage.getItem("jishingoto.session.v1"));
  const goHome = async () => {
    const link = page.getByRole("link", { name: "トップページへ戻る", exact: true });
    await expect(link).toBeInViewport({ ratio: 1 });
    await link.click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator(".home-wordmark")).toHaveText("ジシンゴト！");
    expect(await page.evaluate(() => sessionStorage.getItem("jishingoto.session.v1"))).toEqual(roomBefore);
  };
  await page.goto("/evac?mode=mock&from=standalone");
  await expect(page.getByRole("heading", { name: "ひなんルート" })).toBeVisible();
  await goHome();
  await openMockRoute(page);
  await expect(page.getByRole("region", { name: "Street Viewで進む体験" })).toBeVisible();
  await goHome();
  await page.goto("/evac/routes");
  await expect(page.getByRole("heading", { name: "どの道で行こう？" })).toBeVisible();
  await goHome();
});

test("共通問題をノードで出題し回答後は自動歩行を再開する", async ({page}, testInfo) => {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  await page.route("**/api/evac/scenarios", async route => {
    const body = route.request().postDataJSON();
    expect(body.scenario).toBe("flood");
    await route.fulfill({json:{source:"context",points:[{id:"fixture:common-28",t:.4,position:{lat:35.0003,lng:139.0001},heading:90,remainingM:40,remainingS:30,event:{...WALK_SCENARIOS.find(c=>c.number===28)!.event,title:"電池が減った想定"}}]}});
  });
  await page.goto("/evac/walk?analysisFailure=1&streetAuto=1&eightNodes=1&coordinateDrift=1");
  await expect(page.getByRole("button",{name:"自動で歩く"})).toBeEnabled();
  const scene = page.getByRole("region",{name:"Street Viewで進む体験"});
  const sceneBefore = await scene.boundingBox();
  await page.getByRole("button",{name:"自動で歩く"}).click();
  await expect(page.getByText("自動走行中",{exact:true})).toBeVisible();
  expect(Math.abs((await scene.boundingBox())!.height-sceneBefore!.height)).toBeLessThan(1);
  await expect(page.getByText(/選んだルートに沿って歩いています/)).toHaveCount(0);
  await expect(page.getByText("電池が減った想定")).toBeVisible({timeout:25000});
  const before = await page.evaluate(() => (window as unknown as {streetTest:{moves:string[]}}).streetTest.moves.length);
  expect(before).toBe(3);
  const buttons = page.getByRole("region",{name:/判断ポイント/}).locator("li button");
  for (const button of await buttons.all()) {
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  const situation = page.getByRole("region",{name:/判断ポイント/}).getByText(/スマートフォンの電池は残りわずか/);
  await situation.scrollIntoViewIfNeeded();
  await expect(situation).toBeVisible();
  const textBounds = await situation.boundingBox();
  const firstChoiceBounds = await buttons.first().boundingBox();
  expect(textBounds!.y + textBounds!.height).toBeLessThanOrEqual(firstChoiceBounds!.y);
  const order = await buttons.allTextContents();
  await page.getByRole("button",{name:"状況と行動の詳しい説明を見る"}).click();
  await page.getByRole("button",{name:"行動を選ぶ",exact:true}).click();
  expect(await buttons.allTextContents()).toEqual(order);
  await page.screenshot({path:`/private/tmp/jishingoto-three-choice-${testInfo.project.name}.png`});
  await expect(page.getByRole("region",{name:/判断ポイント/}).locator("li button")).toHaveCount(3);
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => (window as unknown as {streetTest:{moves:string[]}}).streetTest.moves.length)).toBe(before);
  expect(Math.abs((await scene.boundingBox())!.height-sceneBefore!.height)).toBeLessThan(1);
  await page.getByRole("button",{name:/現在地・避難先・分岐の目印を紙に控える/}).click();
  for (const index of [2,3]) {
    const card = page.getByRole("region",{name:new RegExp(`^判断ポイント ${index} /`)});
    const proceed = card.locator('li button').filter({has:page.locator('img[src$="/go-v2.webp"]')});
    await expect(proceed).toBeEnabled({timeout:25000});
    await proceed.click();
  }
  await expect(page.getByText("避難先付近に到着",{exact:true})).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(state.decisions).toHaveLength(3);
  expect(state.decisions[0].eventId).toBe("walk-case-28");
  expect(await page.evaluate(() => (window as unknown as {streetTest:{positionCommands:number}}).streetTest.positionCommands)).toBe(0);
});

test("洪水の迂回は現在のノードから再計算し残り問題を引き継ぐ", async ({page}) => {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  const requests: {maxPoints:number; excludedEventIds:string[];route:{path:{lat:number;lng:number}[]}}[]=[];
  await page.route("**/api/evac/assess",async route=>route.fulfill({status:503,json:{message:"test unavailable"}}));
  await page.route("**/api/evac/scenarios",async route=>{
    requests.push(route.request().postDataJSON());
    await route.fulfill({json:{source:"context",points:requests.length>1?[]:[{id:"fixture:case-10",t:.4,position:{lat:35.0003,lng:139},heading:90,remainingM:40,remainingS:30,event:WALK_SCENARIOS.find(c=>c.number===10)!.event}]}});
  });
  await page.goto("/evac/walk?analysisFailure=1&streetAuto=1&eightNodes=1&contextDetour=1");
  await page.getByRole("button",{name:"自動で歩く"}).click();
  await expect(page.getByRole("button",{name:/待機場所へ移り、案内員と移動継続・避難先を見直す/})).toBeVisible();
  const departure = await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk.street.position);
  await page.getByRole("button",{name:/待機場所へ移り、案内員と移動継続・避難先を見直す/}).click();
  for (const index of [2,3]) {
    const card = page.getByRole("region",{name:new RegExp(`^判断ポイント ${index} /`)});
    const proceed = card.locator('li button').filter({has:page.locator('img[src$="/go-v2.webp"]')});
    await expect(proceed).toBeEnabled({timeout:25000});
    await proceed.click();
  }
  await expect(page.getByText("避難先付近に到着",{exact:true})).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].maxPoints).toBeUndefined();
  expect(requests[1].excludedEventIds).toEqual(["walk-case-10"]);
  expect(requests[1].route.path[0]).toEqual(departure);
  const result=await page.evaluate(()=>({session:JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!),street:(window as unknown as {streetTest:{moves:string[];positionCommands:number}}).streetTest}));
  expect(result.session.decisions[0].rerouted).toBe(true);
  expect(result.street.moves).toContain("D");
  expect(result.street.positionCommands).toBe(0);
});

test("Street Viewの初期取得失敗を再試行して同じ体験を続ける", async ({page}) => {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  await page.goto("/evac/walk?initialLoadError=UNKNOWN_ERROR");
  const scene=page.getByRole("region",{name:"Street Viewで進む体験"});
  await expect(scene.getByRole("alert")).toContainText("この地点のStreet Viewを取得できませんでした");
  const before=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  await page.evaluate(()=>{(window as unknown as {streetTest:{initialLoadError:string|null}}).streetTest.initialLoadError=null;});
  await page.getByRole("button",{name:"同じ地点で再試行",exact:true}).click();
  await expect(scene).toHaveAttribute("data-scene-state","pano");
  await expect(page.getByRole("button",{name:"自動で歩く",exact:true})).toBeEnabled();
  const after=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(after.startRouteId).toBe(before.startRouteId);
  expect(after.decisions).toEqual(before.decisions);
});

test("Street Viewがない地点を通信エラーと区別して案内する", async ({page}) => {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  await page.goto("/evac/walk?initialLoadError=ZERO_RESULTS");
  await expect(page.getByRole("region",{name:"Street Viewで進む体験"}).getByRole("alert")).toContainText("屋外のStreet Viewが見つかりませんでした");
  await expect(page.getByRole("button",{name:"自動で歩く",exact:true})).toBeDisabled();
  await expect(page.getByRole("button",{name:"地図",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"出発地点を少しずらす",exact:true}).click();
  await expect(page).toHaveURL(/\/evac$/);
  await expect(page.getByRole("textbox",{name:"住所・駅名で出発地点を検索"})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).home)).toEqual({lat:35,lng:139});
});

for (const perfect of [true, false]) {
  test(`振り返りは${perfect ? "全問満点でも" : "改善点があっても"}全判断をイラストで表示する`, async ({page}, testInfo) => {
    await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
    await page.addInitScript(({events,perfect})=>{
      const saved = JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!);
      saved.mode = "mock";
      saved.finishedAt = 1000;
      saved.decisions = events.map((event,i)=>({
        pointId:`review-${i}`, eventId:event.id,
        choiceId: perfect || i===0 ? event.choices.reduce((a,b)=>a.priority>b.priority?a:b).id : "go",
        position:saved.home, extraSeconds:perfect ? 55 : 0, rerouted:false, timedOut:false,
      }));
      sessionStorage.setItem("jishingoto.evac.v2",JSON.stringify(saved));
    },{events:[WALK_SCENARIOS.find(s=>s.number===18)!.event,WALK_SCENARIOS.find(s=>s.number===38)!.event],perfect});
    await page.goto("/evac/report");
    const addedTime = page.getByLabel("選んだ行動による追加時間");
    await expect(addedTime).toContainText(perfect ? "＋1分50秒" : "追加なし");
    await expect(addedTime).not.toContainText("選んだ行動で");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    if (perfect) {
      await expect(addedTime.locator("..")).toContainText("約2分");
    }
    await page.screenshot({path:testInfo.outputPath(`choice-time-${perfect}.png`)});
    const info = page.getByRole("button", { name: "追加時間の説明" });
    await info.tap();
    await expect(page.getByRole("tooltip")).toContainText("選んだ行動によって追加された想定時間");
    await expect(page.getByRole("tooltip")).toContainText("合計に含まれています");
    await expect(page.getByRole("tooltip")).toBeInViewport({ ratio: 1 });
    await page.screenshot({path:testInfo.outputPath(`choice-time-info-${perfect}.png`)});
    await info.tap();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await info.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await info.tap();
    await page.getByRole("heading", { name: "ふりかえり", exact: true }).tap();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    const scoreButton = page.getByRole("button", { name: "判断のスコアを見る" });
    await scoreButton.scrollIntoViewIfNeeded();
    await expect(scoreButton).toBeInViewport({ ratio: 1 });
    await expect(page.getByText("番号のボタンを押すと、その場面と選んだ行動を見返せます。")).toBeVisible();
    const buttons = page.getByRole("button",{name:/^判断\d+：/});
    await expect(buttons).toHaveCount(2);
    await buttons.first().click();
    const dialog = page.getByRole("dialog",{name:"判断 1 / 2"});
    await expect(dialog.locator('img[src$="walk-case-18/situation-v2.webp"]')).toBeVisible();
    await dialog.getByRole("button",{name:"次の判断"}).click();
    await expect(page.getByRole("dialog").locator('img[src$="walk-case-38/situation-v2.webp"]')).toBeVisible();
    if (!perfect) await expect(page.getByRole("dialog").getByRole("figure",{name:"次に意識したい行動",exact:true}).locator('img[src$="distance-v2.webp"]')).toBeVisible();
    const closeReport = page.getByRole("dialog").getByRole("button",{name:"判断を閉じる"});
    await noPageOverflow(page, closeReport);
    await page.screenshot({path:testInfo.outputPath(`report-${perfect}.png`)});
    await closeReport.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(buttons.first()).toBeFocused();
    await page.goto("/evac/summary");
    await expect(page.getByRole("region",{name:"判断スコア"})).toContainText(perfect ? "100" : "50");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("dialog",{name:"次に確かめること"})).toHaveCount(0);
    await expect(page.getByTestId("score-ring")).toHaveAttribute("stroke-dasharray", perfect ? "100 100" : "50 100");
    await expect(page.getByRole("region",{name:"判断の振り返り"}).getByRole("img",{name:/状況のイラスト/})).toHaveCount(2);
    await page.screenshot({path:testInfo.outputPath(`score-overview-${perfect}.png`)});
    const trigger = page.getByRole("button",{name:/^判断1：/});
    await trigger.click();
    const review = page.getByRole("region",{name:"判断の詳細"});
    await expect(review.getByLabel("良い判断",{exact:true})).toContainText("○");
    await expect(review.getByRole("img",{name:/状況のイラスト/})).toHaveCount(1);
    const next = page.getByRole("button",{name:"次の判断",exact:true});
    await noPageOverflow(page, next);
    await next.click();
    await expect(page.getByRole("dialog",{name:"判断 2 / 2"})).toBeVisible();
    await expect(review.getByLabel(perfect ? "良い判断" : "見直したい判断",{exact:true})).toContainText(perfect ? "○" : "×");
    await expect(review.locator("img")).toHaveCount(perfect ? 2 : 3);
    if (!perfect) {
      await expect(review.locator('img[src$="walk-case-38/go-v2.webp"]')).toHaveCount(1);
      await expect(review.locator('img[src$="walk-case-38/distance-v2.webp"]')).toHaveCount(1);
    }
    await noPageOverflow(page, page.getByRole("button",{name:"判断を閉じる"}));
    const condition = review.getByRole("figure",{name:"問題の条件",exact:true});
    await expect(condition).toContainText(WALK_SCENARIOS.find(item=>item.number===38)!.event.situation.replace("【想定問題】", "").split("\n")[0]);
    if (!perfect) {
      const selectedCard = review.getByRole("figure",{name:"選んだ行動",exact:true});
      const recommendedCard = review.getByRole("figure",{name:"次に意識したい行動",exact:true});
      const left = await selectedCard.locator("img").boundingBox();
      const right = await recommendedCard.locator("img").boundingBox();
      expect(Math.abs(left!.y - right!.y)).toBeLessThan(1);
      expect(Math.abs(left!.height - right!.height)).toBeLessThan(1);
      await expect(recommendedCard.getByLabel("良い判断",{exact:true})).toBeVisible();
    }
    await page.screenshot({path:testInfo.outputPath(`summary-${perfect}.png`)});
    const tradeoffs = review.getByRole("region",{name:"この行動のポイント"});
    const initialTab = tradeoffs.getByRole("tab",{name:perfect ? "利点" : "気をつけたい点",exact:true});
    const nextTab = tradeoffs.getByRole("tab",{name:perfect ? "気をつけたい点" : "利点",exact:true});
    await expect(initialTab).toHaveAttribute("aria-selected","true");
    await expect(tradeoffs).toHaveCSS("padding-top","12px");
    await expect(tradeoffs.getByRole("heading",{name:perfect ? "この選択の利点" : "気をつけたい点"})).toBeVisible();
    await nextTab.click();
    await expect(nextTab).toHaveAttribute("aria-selected","true");
    await expect(tradeoffs).toHaveAttribute("data-transition","idle");
    await expect(tradeoffs.getByRole("heading",{name:perfect ? "気をつけたい点" : "この選択の利点"})).toBeVisible();
    await nextTab.press("ArrowLeft");
    await expect(initialTab).toHaveAttribute("aria-selected","true");
    await expect(tradeoffs).toHaveAttribute("data-transition","idle");
    await page.emulateMedia({reducedMotion:"reduce"});
    await nextTab.click();
    await expect(nextTab).toHaveAttribute("aria-selected","true");
    await expect(tradeoffs).toHaveAttribute("data-transition","idle");
    await expect(tradeoffs.getByRole("tabpanel")).toHaveCSS("animation-name","none");
    await page.screenshot({path:testInfo.outputPath(`tradeoff-${perfect}.png`)});
    await page.getByRole("button",{name:"判断を閉じる"}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.getByRole("button",{name:/^判断2：/}).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("残り5秒で強調し3秒で赤くなり、風景確認中は演出も止まる",async ({page},testInfo)=>{
  await openIllustratedQuestion(page,28,7);
  const timer=page.locator('button[aria-label="制限時間の設定"]');
  await expect(timer).toHaveAttribute("data-urgency","normal");
  await expect(page.getByTestId("decision-timer")).toHaveText("5秒");
  await expect(timer).toHaveAttribute("data-urgency","warning");
  await page.screenshot({path:testInfo.outputPath("timer-5.png")});
  await expect(page.getByTestId("decision-timer")).toHaveText("3秒");
  await expect(timer).toHaveAttribute("data-urgency","critical");
  await page.screenshot({path:testInfo.outputPath("timer-3.png")});
  await page.getByRole("button",{name:"Street Viewで周りを見る"}).click();
  await expect(timer).toHaveAttribute("data-urgency","normal");
  await expect(page.getByText("地点を確認しています…",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"クイズに戻る"}).click();
  await expect(timer).toHaveAttribute("data-urgency","critical");
});

 test("地点確認の進捗バーは処理段階と取得済み地点数を表示する", async ({page}, testInfo) => {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  await page.goto("/evac/walk?slowPlan=1&eightNodes=1", {waitUntil:"domcontentloaded"});
  const bar = page.getByRole("progressbar",{name:"地点確認の進捗"});
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("max","3");
  await expect(bar).toHaveAttribute("value","1");
  await expect(bar).toHaveAttribute("aria-valuetext", /道の接続を確認中、[1-9]\d*地点取得済み/);
  await page.screenshot({path:testInfo.outputPath("preparation-progress.png")});
  await expect(page.getByRole("button",{name:"自動で歩く",exact:true})).toBeEnabled();
  await expect(bar).toHaveCount(0);
});

test("mainの対象選択と避難体験のトップ導線を両立する", async ({page}) => {
  await page.goto("/");
  await expect(page.getByRole("navigation",{name:"共通ナビゲーション"})).toHaveCount(1);
  await page.getByRole("button",{name:/子供/}).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("navigation",{name:"共通ナビゲーション"})).toHaveCount(1);
  await page.goto("/evac?mode=mock&from=standalone");
  await expect(page.getByRole("navigation",{name:"共通ナビゲーション"})).toHaveCount(1);
  await page.getByRole("link",{name:"トップページへ戻る",exact:true}).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("統合後も避難クイズの15秒・25秒設定を保存して再開する", async ({ page }) => {
  await openIllustratedQuestion(page, 28, 15);
  const timer = page.getByTestId("decision-timer");
  for (const seconds of [25, 15]) {
    await page.getByRole("button", { name: "制限時間の設定", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "考える時間" });
    await expect(settings.getByRole("button", { name: "制限なしにする", exact: true })).toHaveCount(0);
    await settings.getByRole("button", { name: `${seconds}秒`, exact: true }).click();
    await expect(timer).toHaveText(`${seconds}秒`);
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).timerSeconds)).toBe(seconds);
  }
});

test("全画面のホームアイコンを右上に揃え、文字のトップボタンを出さない", async ({ page }, testInfo) => {
  await page.route("**/api/room/**", route => route.abort());
  for (const path of ["/", "/home", "/camera", "/camera/video", "/privacy", "/places", "/test-room", "/offline-evac/index.html"]) {
    await page.goto(path);
    const home = page.getByRole("link", { name: "トップページへ戻る", exact: true });
    await expect(home).toHaveCount(1);
    await expect(home).toBeInViewport({ ratio: 1 });
    await expect(home).toHaveText("");
    await expect(home).toHaveAttribute("href", "/home");
    const box = (await home.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThan(width / 2);
    expect(box.y).toBeLessThan(40);
    expect(box.width).toBeGreaterThanOrEqual(44);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (path === "/camera" || path === "/offline-evac/index.html") await page.screenshot({ path: testInfo.outputPath(`home-icon-${path.includes("offline") ? "offline" : "camera"}.png`) });
    await home.click();
    await expect(page).toHaveURL(/\/home$/);
  }
  await page.goto("/test-room");
  await page.getByRole("button", { name: "結果ページを試す（APIなし）", exact: true }).click();
  await page.getByRole("button", { name: /理由・注意点を読む/ }).click();
  const dialog = page.getByRole("dialog");
  const home = dialog.getByRole("link", { name: "トップページへ戻る", exact: true });
  const homeBox = (await home.boundingBox())!;
  const dialogBox = (await dialog.boundingBox())!;
  expect(homeBox.x).toBeGreaterThan(dialogBox.x + dialogBox.width / 2);
  await home.click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});
