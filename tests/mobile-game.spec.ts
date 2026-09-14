import { WALK_SCENARIOS } from "../src/lib/walk-scenarios";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

async function openIllustratedQuestion(page: Page, number = 28) {
  await page.addInitScript({path:"tests/fixtures/street-sdk.js"});
  await page.addInitScript((event) => {
    const saved = JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!);
    saved.timerSeconds = 3;
    saved.walk.steps[1].event = event;
    saved.walk.steps[1].pointId = "illustrated-question";
    sessionStorage.setItem("jishingoto.evac.v2", JSON.stringify(saved));
  }, WALK_SCENARIOS.find(c=>c.number===number)!.event);
  await page.goto("/evac/walk?decision=1");
  await page.getByRole("button",{name:"自動で歩く",exact:true}).click();
  await expect(page.getByRole("button",{name:"判断を始める",exact:true})).toBeEnabled();
}

test("電線の問題に太線のローカル画像４枚を表示する", async ({page}) => {
  await openIllustratedQuestion(page, 18);
  const images = page.getByRole("region",{name:/判断ポイント/}).locator("img");
  await expect(images).toHaveCount(4);
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute("src", /walk-case-18\/.*-v2\.webp$/);
    await expect.poll(()=>img.evaluate((el: HTMLImageElement)=>el.naturalWidth)).toBe(960);
  }
});

test("イラストを読む間は時計が止まり、開始と再確認を自分で選べる", async ({page},testInfo) => {
  await openIllustratedQuestion(page);
  const card = page.getByRole("region",{name:/判断ポイント/});
  await expect(card.getByRole("img",{name:/状況のイラスト/})).toHaveCount(1);
  await expect(card.getByRole("img",{name:/行動のイラスト/})).toHaveCount(3);
  const timer = card.getByTestId("decision-timer");
  await page.waitForTimeout(4100);
  await expect(timer).toHaveText("3秒");
  const choices = card.locator("li button");
  await expect(choices.first()).toBeDisabled();
  for(const choice of await choices.all()) {
    await choice.scrollIntoViewIfNeeded();
    await expect(choice).toBeInViewport({ratio:0.99});
  }
  await page.screenshot({path:`/private/tmp/walk-illustrated-review-${testInfo.project.name}.png`});
  await card.getByRole("button",{name:"判断を始める",exact:true}).click();
  await expect(timer).toHaveText("2秒");
  await card.getByRole("button",{name:"時計を止めて、もう一度確認する"}).click();
  const frozen = await timer.textContent();
  await page.waitForTimeout(3100);
  await expect(timer).toHaveText(frozen!);
  await card.getByRole("button",{name:"時間制限なしで選ぶ",exact:true}).click();
  await expect(timer).toHaveText("制限なし");
  await choices.first().click();
  await expect(card).toHaveCount(0);
  const saved = await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(saved.decisions).toHaveLength(1);
  expect(saved.decisions[0].timedOut).toBe(false);
});

test("イラスト確認後に時間切れになっても自分で回答できる", async ({page}) => {
  await openIllustratedQuestion(page);
  const card = page.getByRole("region",{name:/判断ポイント/});
  await card.getByRole("button",{name:"判断を始める",exact:true}).click();
  await expect(card.getByTestId("decision-timer")).toHaveText("0秒");
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
    await page.getByRole("button",{name:"判断を始める",exact:true}).click();
    await choices.last().scrollIntoViewIfNeeded();
    await noPageOverflow(page, choices.last());
    if (number === 1) await capture(page, testInfo, "street-view-decision");
    await choices.first().click();
    await expect(decision).not.toBeVisible();
  }

  await jumpToNextDecision(page, false);
  const reflect = scene.getByRole("button", { name: "ふりかえる" });
  await noPageOverflow(page, reflect);
  await reflect.click();
  await expect(page).toHaveURL(/\/evac\/report$/);
  await expect(page.getByRole("heading", { name: "ふりかえり" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^判断\d+：/ })).toHaveCount(3);
  await capture(page, testInfo, "route-report");
  await expect(page.getByRole("heading",{name:"次に確かめること",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"判断のスコアを見る"}).click();
  await expect(page).toHaveURL(/\/evac\/summary$/);
  await expect(page.getByRole("region",{name:"判断スコア"})).toContainText("/ 100");
  await expect(page.getByRole("heading",{name:"良かったところ"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"もっと改善できるところ"})).toBeAttached();
  await capture(page,testInfo,"judgment-score");
  const follow = page.getByRole("region",{name:"次に確かめること"}).getByRole("button").first();
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed","true");
  const selected = await page.evaluate(()=>JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!).followUp);
  expect(selected).toBeTruthy();
  await capture(page,testInfo,"judgment-summary");
  await page.reload();
  await expect(page.getByRole("region",{name:"次に確かめること"}).getByRole("button",{pressed:true})).toHaveCount(1);
});

test("一歩進んだ位置を再読込後も保持する", async ({ page }) => {
  await openMockRoute(page);
  const scene = page.getByRole("region", { name: "Street Viewで進む体験" });
  await expect(scene).toHaveAttribute("data-scene-state", "sketch");
  await jumpToNextDecision(page);
  const point = page.getByRole("region", { name: /^判断ポイント 1 / });
  await page.getByRole("button",{name:"判断を始める",exact:true}).click();
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
  await page.goto("/evac/walk?decision=1");
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
  expect(before).toBe(8);
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
  await expect(page.getByText("避難先付近に到着",{exact:true})).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.evac.v2")!));
  expect(state.decisions).toHaveLength(1);
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
