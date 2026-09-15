import { DETECTED_RISKS, QUESTIONS } from "../src/lib/content";
import { readFile } from "node:fs/promises";
import { WALK_SCENARIOS } from "../src/lib/walk-scenarios";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

async function openIllustratedQuestion(page: Page, number = 28, seconds = 3, mode: "api" | "mock" = "api") {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  await page.addInitScript(({event,seconds,mode}) => {
    const saved = JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!);
    saved.timerSeconds = seconds;
    saved.mode = mode;
    saved.walk.steps[1].event = event;
    saved.walk.steps[1].pointId = "illustrated-question";
    sessionStorage.setItem("jishingoto.evac.v2", JSON.stringify(saved));
  }, {event:WALK_SCENARIOS.find(c=>c.number===number)!.event,seconds,mode});
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

for (const priority of [3, 2, 1]) {
  test(`回答直後に優先度${priority}の評価と推奨行動・解説を表示する`, async ({ page }, testInfo) => {
    await openIllustratedQuestion(page, 28, 0, "mock");
    const event = WALK_SCENARIOS.find(item => item.number === 28)!.event;
    const choice = event.choices.find(item => item.priority === priority)!;
    const best = event.choices.find(item => item.priority === 3)!;
    await page.getByRole("region", { name: /判断ポイント/ }).getByRole("button", { name: new RegExp(choice.label) }).click();
    const feedback = page.getByRole("dialog", { name: "回答と解説" });
    await expect(feedback).toBeVisible();
    const selected = feedback.getByRole("region", { name: "選んだ行動の評価" });
    await expect(selected).toContainText(choice.label);
    await expect(selected).toContainText(choice.feedback);
    const situationImage = selected.getByRole("figure", { name: "問題の条件", exact: true }).locator("img");
    await expect(situationImage).toHaveAttribute("src", `/illustrations/evac/${event.id}/situation-v2.webp`);
    const chosenImage = selected.getByRole("figure", { name: "選んだ行動", exact: true }).locator("img");
    await expect(chosenImage).toHaveAttribute("src", `/illustrations/evac/${event.id}/${choice.id}-v2.webp`);
    await expect.poll(() => chosenImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    const comparison = selected.getByRole("figure", { name: "次に意識したい行動", exact: true });
    if (priority < 3) {
      await expect(comparison.locator("img")).toHaveAttribute("src", `/illustrations/evac/${event.id}/${best.id}-v2.webp`);
    } else {
      await expect(comparison).toHaveCount(0);
    }
    await chosenImage.scrollIntoViewIfNeeded();
    await expect(chosenImage).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath(`answer-illustrations-${priority}.png`), animations: "disabled" });
    const points = feedback.getByRole("region", { name: "この行動のポイント" });
    await points.scrollIntoViewIfNeeded();
    await expect(points.getByRole("tab", { name: priority === 3 ? "利点" : "気をつけたい点", exact: true })).toHaveAttribute("aria-selected", "true");
    const otherTab = points.getByRole("tab", { name: priority === 3 ? "気をつけたい点" : "利点", exact: true });
    await otherTab.click();
    await expect(otherTab).toHaveAttribute("aria-selected", "true");
    await expect(selected.getByLabel(priority === 3 ? "良い判断" : priority === 2 ? "もう一工夫" : "見直したい判断", { exact: true })).toBeVisible();
    const recommended = feedback.getByRole("region", { name: "この場面の推奨行動" });
    await expect(recommended).toContainText(best.label);
    await expect(recommended).toContainText(event.hint);
    await noPageOverflow(page, feedback.getByRole("button", { name: "歩行を続ける" }));
    await page.screenshot({ path: testInfo.outputPath(`answer-priority-${priority}.png`), animations: "disabled" });
    await feedback.getByRole("button", { name: "歩行を続ける" }).click();
    await expect(feedback).not.toBeVisible();
    const decisions = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).decisions);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].choiceId).toBe(choice.id);
  });
}

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
    await page.getByRole("dialog", { name: "回答と解説" }).getByRole("button", { name: "歩行を続ける" }).click();
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
  await expect(page.getByRole("button",{name:"判断のスコアを見る"})).toHaveCount(0);
  await expect(page).toHaveURL(/\/evac\/report$/);
  await expect(page.getByRole("region",{name:"判断スコア"})).toContainText("/ 100");
  await expect(page.getByRole("heading",{name:"判断の記録"})).toBeVisible();
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
  await noPageOverflow(page, page.getByRole("button",{name:"トップに戻る",exact:true}));
  await noPageOverflow(page, page.getByRole("button",{name:"別のルートで試す",exact:true}));
  await page.screenshot({path:testInfo.outputPath("complete-options.png")});
  await page.getByRole("button",{name:"トップに戻る",exact:true}).click();
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


test("回答直後の解説で自動歩行を止め、確認後に再開する", async ({ page }, testInfo) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?decision=1", {waitUntil:"domcontentloaded"});
  await page.getByRole("button", { name: "自動で歩く" }).click();
  const decision = page.getByRole("region", { name: "判断ポイント 1 / 1" });
  await expect(decision.getByRole("button", { name: /周囲を確認して進む/ })).toBeEnabled();
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual(["B"]);
  await decision.getByRole("button", { name: /周囲を確認して進む/ }).click();
  const feedback = page.getByRole("dialog", { name: "回答と解説" });
  await expect(feedback).toBeVisible();
  await expect(feedback.getByRole("region", { name: "選んだ行動の評価" })).toContainText("周囲を確認して進む");
  await expect(feedback.getByRole("region", { name: "この場面の推奨行動" })).toBeVisible();
  await page.waitForTimeout(3200);
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual(["B"]);
  await expect(page.getByRole("button", { name: "ふりかえる" })).toHaveCount(0);
  await noPageOverflow(page, feedback.getByRole("button", { name: "歩行を続ける" }));
  await page.screenshot({ path: testInfo.outputPath("answer-feedback.png"), animations: "disabled" });
  await feedback.getByRole("button", { name: "歩行を続ける" }).click();
  await expect(feedback).not.toBeVisible();
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ふりかえる" })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual(["B", "C"]);
});

test("接続確認が終わるまで歩行を始めず接続のないルートは開始させない", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?slowPlan=1&disconnected=1");
  await expect(page.getByText(/道のつながりを確認しています/)).toBeVisible();
  await expect(page.getByRole("button", { name: "向いている道へ進む" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "道を再確認する" })).toBeVisible();
  await expect(page.getByRole("button", { name: "自動で歩く" })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { streetTest: { moves: string[] } }).streetTest.moves)).toEqual([]);
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

test("結果ページは振り返り・4つのチカラ・チェック不要の備えを表示する", async ({ page }, testInfo) => {
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
  await page.getByRole("button", { name: /物体ごとの備えを振り返る/ }).click();
  const preparations = page.getByRole("dialog");
  await expect(preparations.getByRole("listitem")).toHaveCount(3);
  await expect(preparations.getByRole("checkbox")).toHaveCount(0);
  await preparations.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByText(/対策済み|対策したらチェック/)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /結果を共有/ }).click();
  await expect(page).toHaveURL(/\/share$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "室内の備え" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
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
  await page.getByRole("dialog", { name: "すべての物体を確認しました" }).getByRole("button", { name: "説明に戻る" }).click();
  await page.getByRole("button", { name: /認識を修正する/ }).click();
  const dialog = page.getByRole("dialog", { name: "認識を修正する" });
  await dialog.getByLabel("名前", { exact: true }).fill("壁掛けテレビ");
  await dialog.locator("select").selectOption("tv");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  expect(objects).toHaveLength(0);
  expect(objects).toHaveLength(0);
  await page.getByRole("dialog", { name: "すべての物体を確認しました" }).getByRole("button", { name: "行動クイズへ", exact: true }).click();
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
  await page.getByRole("dialog", { name: "回答と解説" }).getByRole("button", { name: "歩行を続ける" }).click();
  for (const index of [2,3]) {
    const card = page.getByRole("region",{name:new RegExp(`^判断ポイント ${index} /`)});
    const proceed = card.locator('li button').filter({has:page.locator('img[src$="/go-v2.webp"]')});
    await expect(proceed).toBeEnabled({timeout:25000});
    await proceed.click();
    await page.getByRole("dialog", { name: "回答と解説" }).getByRole("button", { name: "歩行を続ける" }).click();
  }
  await expect(page.getByText("避難先付近に到着",{exact:true})).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(state.decisions).toHaveLength(3);
  expect(state.decisions[0].eventId).toBe("walk-case-28");
  expect(await page.evaluate(() => (window as unknown as {streetTest:{positionCommands:number}}).streetTest.positionCommands)).toBe(0);
});

test("洪水の迂回は現在のノードから再計算し残り問題を引き継ぐ", async ({page}) => {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  let releaseReroute!: () => void;
  const rerouteReady = new Promise<void>(resolve => { releaseReroute = resolve; });
  const requests: {maxPoints:number; excludedEventIds:string[];route:{path:{lat:number;lng:number}[]}}[]=[];
  await page.route("**/api/evac/assess",async route=>route.fulfill({status:503,json:{message:"test unavailable"}}));
  await page.route("**/api/evac/scenarios",async route=>{
    requests.push(route.request().postDataJSON());
    if (requests.length > 1) await rerouteReady;
    await route.fulfill({json:{source:"context",points:requests.length>1?[]:[{id:"fixture:case-10",t:.4,position:{lat:35.0003,lng:139},heading:90,remainingM:40,remainingS:30,event:WALK_SCENARIOS.find(c=>c.number===10)!.event}]}});
  });
  await page.goto("/evac/walk?analysisFailure=1&streetAuto=1&eightNodes=1&contextDetour=1");
  await page.getByRole("button",{name:"自動で歩く"}).click();
  await expect(page.getByRole("button",{name:/待機場所へ移り、案内員と移動継続・避難先を見直す/})).toBeVisible();
  const departure = await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk.street.position);
  await page.getByRole("button",{name:/待機場所へ移り、案内員と移動継続・避難先を見直す/}).click();
  const feedback = page.getByRole("dialog", { name: "回答と解説" });
  await expect(feedback).toBeVisible();
  await expect(feedback.getByRole("region", { name: "この場面の推奨行動" })).toContainText(WALK_SCENARIOS.find(c => c.number === 10)!.event.hint);
  await expect(feedback.getByRole("button", { name: "迂回路を確認中…" })).toBeDisabled();
  await feedback.press("Escape");
  await expect(feedback).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).decisions)).toHaveLength(0);
  releaseReroute();
  await feedback.getByRole("button", { name: "歩行を続ける" }).click();
  for (const index of [2,3]) {
    const card = page.getByRole("region",{name:new RegExp(`^判断ポイント ${index} /`)});
    const proceed = card.locator('li button').filter({has:page.locator('img[src$="/go-v2.webp"]')});
    await expect(proceed).toBeEnabled({timeout:25000});
    await proceed.click();
    await page.getByRole("dialog", { name: "回答と解説" }).getByRole("button", { name: "歩行を続ける" }).click();
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

test("迂回に失敗しても回答の解説を表示し、選び直して続けられる", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  let requests = 0;
  await page.route("**/api/evac/assess", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/evac/scenarios", async route => {
    requests++;
    if (requests > 1) {
      await route.fulfill({ status: 503, json: { message: "テスト：迂回後の問題を取得できません" } });
      return;
    }
    await route.fulfill({ json: { source: "context", points: [{ id: "fixture:case-10", t: .4, position: { lat: 35.0003, lng: 139 }, heading: 90, remainingM: 40, remainingS: 30, event: WALK_SCENARIOS.find(c => c.number === 10)!.event }] } });
  });
  await page.goto("/evac/walk?analysisFailure=1&streetAuto=1&eightNodes=1&contextDetour=1");
  await page.getByRole("button", { name: "自動で歩く" }).click();
  await page.getByRole("button", { name: /待機場所へ移り、案内員と移動継続・避難先を見直す/ }).click();
  const feedback = page.getByRole("dialog", { name: "回答と解説" });
  await expect(feedback.getByRole("alert")).toBeVisible();
  await expect(feedback.getByRole("region", { name: "この場面の推奨行動" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).decisions)).toHaveLength(0);
  await feedback.getByRole("button", { name: "回答を選び直す" }).click();
  await page.getByRole("region", { name: /判断ポイント/ }).getByRole("button", { name: /予定の避難先へ向かい、途中で情報を聞く/ }).click();
  await expect(feedback.getByRole("alert")).toHaveCount(0);
  await expect(feedback.getByRole("region", { name: "選んだ行動の評価" })).toContainText("予定の避難先へ向かい、途中で情報を聞く");
  await feedback.getByRole("button", { name: "歩行を続ける" }).click();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).decisions)).toHaveLength(1);
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
        position:saved.home, extraSeconds:0, rerouted:false, timedOut:false,
      }));
      sessionStorage.setItem("jishingoto.evac.v2",JSON.stringify(saved));
    },{events:[WALK_SCENARIOS.find(s=>s.number===18)!.event,WALK_SCENARIOS.find(s=>s.number===38)!.event],perfect});
    await page.goto("/evac/report");
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
    await expect(page).toHaveURL(/\/evac\/report$/);
    await expect(page.getByRole("region",{name:"判断スコア"})).toContainText(perfect ? "100" : "50");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("dialog",{name:"次に確かめること"})).toHaveCount(0);
    await expect(page.getByTestId("score-ring")).toHaveAttribute("stroke-dasharray", perfect ? "100 100" : "50 100");
    await expect(page.getByRole("region",{name:"それぞれの判断"}).getByRole("button",{name:/^判断\d+：/})).toHaveCount(2);
    await expect(page.getByRole("region",{name:"判断スコア"})).toBeInViewport({ratio:1});
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
    await page.getByRole("button",{name:"振り返りを終わる",exact:true}).click();
    const follow = page.getByRole("dialog",{name:"次に確かめること"});
    await follow.locator("button[aria-pressed]").first().click();
    await expect(follow.getByRole("button",{pressed:true})).toHaveCount(1);
    await follow.getByRole("button",{name:"次へ",exact:true}).click();
    await expect(page).toHaveURL(/\/evac\/complete$/);
    await page.getByRole("button",{name:"戻る",exact:true}).click();
    await expect(page).toHaveURL(/\/evac\/report$/);
    await page.getByRole("button",{name:"振り返りを終わる",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"次に確かめること"}).getByRole("button",{pressed:true})).toHaveCount(1);
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
  await expect(page.getByRole("navigation",{name:"共通ナビゲーション"})).toHaveCount(0);
  await page.getByRole("button",{name:/子供/}).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("navigation",{name:"共通ナビゲーション"})).toHaveCount(1);
  await page.goto("/evac?mode=mock&from=standalone");
  await expect(page.getByRole("navigation",{name:"共通ナビゲーション"})).toHaveCount(1);
  await page.getByRole("link",{name:"トップページへ戻る",exact:true}).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("画像のない区間をつなぐ：画像ゼロでも出発地点を変えずに終点まで進む", async ({ page }) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?initialLoadError=ZERO_RESULTS&missingArrival=1");
  await page.getByRole("button", { name: "画像のない区間もつないで歩く" }).click();
  const scene = page.getByRole("region", { name: "地図とStreet Viewで進む体験" });
  await expect(scene).toHaveAttribute("data-scene-state", "missing");
  const initial = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk.street.position);
  expect(initial).toEqual({ lat: 35, lng: 139 });
  for (let i = 0; i < 20 && !await page.getByRole("button", { name: "ふりかえる", exact: true }).isVisible(); i++) {
    await page.getByRole("button", { name: "進む", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "ふりかえる", exact: true })).toBeVisible();
  const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk);
  expect(result.navigationMode).toBe("hybrid");
  expect(result.street.position).toEqual({ lat: 35.0003, lng: 139.0006 });
  expect(result.street.path).toContainEqual({ lat: 35.0003, lng: 139 });
  expect(result.street.path.length).toBeGreaterThan(8);
});

test("画像のない区間をつなぐ：画像がない区間から地図表示を保って終点まで進む", async ({ page }, testInfo) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?hybridCoverage=1&hybridDelayed=1&disconnected=1&decision=1");
  await page.getByRole("button", { name: "画像のない区間もつないで歩く" }).click();
  const scene = page.getByRole("region", { name: "地図とStreet Viewで進む体験" });
  await expect(scene).toHaveAttribute("data-scene-state", "ready");
  await page.getByRole("button", { name: "進む", exact: true }).click();
  await expect(scene).toHaveAttribute("data-scene-state", "missing");
  const lookupCount = await page.evaluate(() => (window as unknown as {streetTest:{hybridLookups:number}}).streetTest.hybridLookups);
  const mapBounds = await page.getByTestId("map-surface").boundingBox();
  const sceneBounds = await scene.boundingBox();
  expect(mapBounds!.height).toBeGreaterThanOrEqual(sceneBounds!.height - 2);
  await page.screenshot({ path: testInfo.outputPath("hybrid-map-gap.png") });
  await page.getByRole("button", { name: "自動で歩く", exact: true }).click();
  await expect(page.getByRole("button", { name: "地図・風景を確認する", exact: true })).toBeVisible();
  const atQuestion = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk.index);
  await page.getByRole("button", { name: "地図・風景を確認する", exact: true }).click();
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk.index)).toBe(atQuestion);
  await page.getByRole("button", { name: "クイズに戻る", exact: true }).click();
  await page.getByRole("button", { name: /周囲を確認して進む/ }).click();
  await page.getByRole("dialog", { name: "回答と解説" }).getByRole("button", { name: "歩行を続ける" }).click();
  await expect(page.getByRole("button", { name: "ふりかえる", exact: true })).toBeVisible({ timeout: 25000 });
  await expect(scene).toHaveAttribute("data-scene-state", "missing");
  expect(await page.evaluate(() => (window as unknown as {streetTest:{hybridLookups:number}}).streetTest.hybridLookups)).toBe(lookupCount);
  const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(result.decisions).toHaveLength(1);
  expect(result.walk.street.position).toEqual({ lat: 35.0003, lng: 139.0006 });
});

test("画像のない区間をつなぐ：再読み込み後も地図の現在地から再開する", async ({ page }) => {
  const fixture = await readFile("tests/fixtures/street-sdk.js", "utf8");
  await page.addInitScript({ content: `${fixture}\nconst resumed = sessionStorage.getItem("hybrid-test-saved"); if (resumed) sessionStorage.setItem("jishingoto.evac.v2", resumed);` });
  await page.goto("/evac/walk?initialLoadError=ZERO_RESULTS", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "画像のない区間もつないで歩く" }).click();
  await page.getByRole("button", { name: "進む", exact: true }).click();
  await page.getByRole("button", { name: "進む", exact: true }).click();
  const saved = await page.evaluate(() => {
    const value = sessionStorage.getItem("jishingoto.evac.v2")!;
    sessionStorage.setItem("hybrid-test-saved", value);
    return JSON.parse(value).walk;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "地図とStreet Viewで進む体験" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk)).toEqual(saved);
  await page.getByRole("button", { name: "進む", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).walk.index)).toBe(saved.index + 1);
});


test("風景の再取得で地図を挟まず、画像欠落後は手動の再確認まで地図を維持する", async ({ page }, testInfo) => {
  await page.addInitScript({ path: "tests/fixtures/street-sdk.js" });
  await page.goto("/evac/walk?hybridContinuous=1&disconnected=1");
  await page.getByRole("button", { name: "画像のない区間もつないで歩く" }).click();
  const scene = page.getByRole("region", { name: "地図とStreet Viewで進む体験" });
  await expect(scene).toHaveAttribute("data-scene-state", "ready");
  const forward = page.getByRole("button", { name: "進む", exact: true });
  await scene.evaluate(element => {
    const states: string[] = [];
    (window as unknown as {hybridStates:string[]}).hybridStates = states;
    new MutationObserver(records => { if (records.some(record => record.attributeName === "data-scene-state")) states.push(element.getAttribute("data-scene-state")!); }).observe(element, { attributes: true });
  });
  for (let step = 0; step < 2; step++) {
    await forward.click();
    await expect(scene).toHaveAttribute("data-checking-imagery", "true");
    await expect(scene).toHaveAttribute("data-scene-state", "ready");
    await expect(scene).toHaveAttribute("data-checking-imagery", "false");
  }
  expect(await page.evaluate(() => (window as unknown as {hybridStates:string[]}).hybridStates)).not.toContain("loading");
  expect(await page.evaluate(() => (window as unknown as {streetTest:{hybridPanoramas:number}}).streetTest.hybridPanoramas)).toBe(1);
  await page.evaluate(() => { (window as unknown as {streetTest:{hybridMissing:boolean}}).streetTest.hybridMissing = true; });
  await forward.click();
  await expect(scene).toHaveAttribute("data-scene-state", "missing");
  const queries = await page.evaluate(() => (window as unknown as {streetTest:{hybridLookups:number}}).streetTest.hybridLookups);
  await page.evaluate(() => { (window as unknown as {streetTest:{hybridMissing:boolean}}).streetTest.hybridMissing = false; });
  await forward.click();
  await expect(scene).toHaveAttribute("data-scene-state", "missing");
  expect(await page.evaluate(() => (window as unknown as {streetTest:{hybridLookups:number}}).streetTest.hybridLookups)).toBe(queries);
  const retry = scene.getByRole("button", { name: "Street Viewを再確認", exact: true });
  await expect(retry).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("stable-map-fallback.png"), animations: "disabled" });
  await retry.click();
  await expect(scene).toHaveAttribute("data-scene-state", "missing");
  await expect(scene).toHaveAttribute("data-scene-state", "ready");
  expect(await page.evaluate(() => (window as unknown as {streetTest:{hybridPanoramas:number}}).streetTest.hybridPanoramas)).toBe(1);
});
