import { DETECTED_RISKS, QUESTIONS } from "../src/lib/content";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

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
    await noPageOverflow(page, choices.last());
    if (number === 1) await capture(page, testInfo, "street-view-decision");
    await choices.first().click();
    await expect(decision).not.toBeVisible();
  }

  await jumpToNextDecision(page, false);
  const reflect = page.getByRole("button", { name: "ふりかえる" });
  await noPageOverflow(page, reflect);
  await reflect.click();
  await expect(page).toHaveURL(/\/evac\/report$/);
  await expect(page.getByRole("heading", { name: "ふりかえり" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^判断\d+：/ })).toHaveCount(3);
  await capture(page, testInfo, "route-report");
  await page.getByRole("link", { name: "トップページへ戻る", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
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
  await capture(page,testInfo,"scenario-routes");
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
  await page.route("**/api/evac/analyze", async route => {
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
