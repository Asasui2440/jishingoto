import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

async function captureStage(page: Page, testInfo: TestInfo, stage: string) {
  if (testInfo.project.name !== "mobile-390") return;
  await page.screenshot({ path: testInfo.outputPath(`${stage}.png`), animations: "disabled" });
}

/** Verify the actual screen and clipping, not a particular CSS implementation. */
async function fitsWithoutPageScroll(page: Page, primaryAction: Locator) {
  await expect(primaryAction).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => ({
    horizontal: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) > window.innerWidth + 1,
    vertical: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) > window.innerHeight + 1,
  }))).toEqual({ horizontal: false, vertical: false });
}

async function compareRoutes(page: Page, capture?: (stage: string) => Promise<void>) {
  await page.goto("/evac?mode=mock&from=standalone");
  await expect(page.getByRole("heading", { name: "ひなんルート", exact: true })).toBeVisible();
  const places = page.getByRole("region", { name: "避難先を選ぶ", exact: true });
  await places.getByRole("button", { name: /教育.*森公園/ }).click();
  const compare = page.getByRole("button", { name: "ルートを比べる", exact: true });
  await expect(compare).toBeEnabled();
  await fitsWithoutPageScroll(page, compare);
  await capture?.("setup");
  await compare.click();

  await expect(page.getByRole("heading", { name: "どの道で行こう？", exact: true })).toBeVisible();
  const routeA = page.getByRole("button", { name: /ルート A/ });
  const routeB = page.getByRole("button", { name: /ルート B/ });
  await expect(routeA).toHaveAttribute("aria-pressed", "true");
  await routeB.click();
  await expect(routeB).toHaveAttribute("aria-pressed", "true");
  await expect(routeA).toHaveAttribute("aria-pressed", "false");
  await routeA.click();
  await expect(page.getByText("道を見比べました。どちらで進む？", { exact: true })).toBeVisible();
  await fitsWithoutPageScroll(page, page.getByRole("button", { name: "この道でスタート", exact: true }));
  await capture?.("routes");
}

async function nextDecision(page: Page, number: number) {
  const advance = page.getByRole("button", { name: "次の判断ポイントへ進む", exact: true });
  await fitsWithoutPageScroll(page, advance);
  await advance.click();
  const point = page.getByRole("region", { name: new RegExp(`^判断ポイント ${number} /`) });
  await expect(point).toBeVisible();
  for (const choice of await point.getByRole("list").getByRole("button").all()) {
    await fitsWithoutPageScroll(page, choice);
  }
  return point;
}

test("routes, decisions, detour and reflection stay usable on a compact phone", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await compareRoutes(page, (stage) => captureStage(page, testInfo, stage));
  // Leave room to examine the first scenario before making a choice.
  await page.getByRole("button", { name: "20秒", exact: true }).click();
  await page.getByRole("button", { name: "この道でスタート", exact: true }).click();
  await expect(page).toHaveURL(/\/evac\/walk$/);
  const firstPoint = await nextDecision(page, 1);
  await captureStage(page, testInfo, "decision");

  const explain = page.getByRole("button", { name: "状況と行動の詳しい説明を見る", exact: true });
  await explain.click();
  const explanation = page.getByRole("dialog", { name: "この地点で起きたら？", exact: true });
  await expect(explanation).toBeVisible();
  // Inspect the displayed clock behind the native modal, without changing game state.
  const clock = page.getByRole("button", { name: "制限時間の設定", exact: true, includeHidden: true });
  const pausedTime = await clock.textContent();
  expect(Number(pausedTime?.match(/\d+/)?.[0])).toBeGreaterThan(0);
  await page.waitForTimeout(1_250); // Cross a real countdown tick while the explanation is open.
  await expect(clock).toHaveText(pausedTime ?? "");
  await explanation.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(explanation).not.toBeVisible();
  await expect(explain).toBeFocused();
  await firstPoint.getByRole("button", { name: /別.*ルート.*迂回/ }).click();
  await expect(firstPoint).not.toBeVisible();
  await expect(page.getByText("ここから先の経路を更新しました。", { exact: true })).toBeVisible();

  // A detour must retain the remaining learning moments, rather than finish early.
  for (const number of [2, 3]) {
    const point = await nextDecision(page, number);
    await point.getByRole("list").getByRole("button").first().click();
    await expect(point).not.toBeVisible();
  }
  await page.getByRole("button", { name: "次の判断ポイントへ進む", exact: true }).click();
  const reflect = page.getByRole("button", { name: "ふりかえる", exact: true });
  await fitsWithoutPageScroll(page, reflect);
  await reflect.click();
  await expect(page).toHaveURL(/\/evac\/report$/);
  await expect(page.getByRole("heading", { name: "ふりかえり", exact: true })).toBeVisible();
  const replay = page.getByRole("button", { name: /別.*ルートで.*試/ });
  await fitsWithoutPageScroll(page, replay);
  await expect(page.getByRole("button", { name: /^判断\d+：.*の記録を見る$/ })).toHaveCount(3);
  await captureStage(page, testInfo, "report");

  await page.getByRole("button", { name: "避難先と通った経路の詳細", exact: true }).click();
  const history = page.getByRole("dialog", { name: "通った道の記録", exact: true });
  await expect(history.getByText("途中で別の経路に変更しました。", { exact: true })).toBeVisible();
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await history.getByRole("button", { name: "閉じる", exact: true }).click();

  await page.getByRole("button", { name: /^判断1：/ }).click();
  const decision = page.getByRole("dialog", { name: "判断 1 / 3", exact: true });
  await expect(decision.getByRole("heading", { name: "この選択の利点", exact: true })).toBeVisible();
  await expect(decision.getByRole("heading", { name: "気をつけたい点", exact: true })).toBeVisible();
  await decision.getByRole("button", { name: "次の判断", exact: true }).click();
  const secondDecision = page.getByRole("dialog", { name: "判断 2 / 3", exact: true });
  await expect(secondDecision.getByRole("button", { name: "次の判断", exact: true })).toBeFocused();
  await secondDecision.getByRole("button", { name: "前の判断", exact: true }).click();
  await expect(decision).toBeVisible();
  await decision.getByText("場面・判断のヒント・出典", { exact: true }).click();
  await expect(decision.getByRole("link")).toHaveAttribute("href", /^https:\/\/(www\.)?(bousai\.go\.jp|jma\.go\.jp)\//);
  await decision.getByText("場面・判断のヒント・出典", { exact: true }).click();
  await decision.getByRole("button", { name: /これを次に確かめる/ }).click();
  await expect(decision).not.toBeVisible();
  await expect(page.getByText("次に確かめることを選びました", { exact: true })).toBeVisible();

  // Selection must remain available after reloading, with no additional page transition.
  await page.reload();
  const followUp = page.getByRole("button", { name: /^次に確かめること/ });
  await expect(followUp).toBeVisible();
  await followUp.click();
  const followUpSheet = page.getByRole("dialog", { name: "次に確かめること", exact: true });
  await expect(followUpSheet.getByRole("button", { pressed: true })).toHaveCount(1);
  await followUpSheet.getByRole("button", { name: "閉じる", exact: true }).click();
  await fitsWithoutPageScroll(page, replay);
  await replay.click();
  await expect(page.getByRole("heading", { name: "どの道で行こう？", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /ルート A/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "20秒", exact: true })).toHaveAttribute("aria-pressed", "true");
  await fitsWithoutPageScroll(page, page.getByRole("button", { name: "この道でスタート", exact: true }));
  expect(runtimeErrors).toEqual([]);
});

test("timer settings pause play and can remove the time limit without choosing for the player", async ({ page }) => {
  await compareRoutes(page);
  await page.getByRole("button", { name: "この道でスタート", exact: true }).click();
  const point = await nextDecision(page, 1);
  const timer = page.getByRole("button", { name: "制限時間の設定", exact: true });
  await timer.click();
  const settings = page.getByRole("dialog", { name: "考える時間", exact: true });
  const pausedTimer = page.getByRole("button", { name: "制限時間の設定", exact: true, includeHidden: true });
  const beforeExtension = Number((await pausedTimer.textContent())?.match(/\d+/)?.[0]);
  await settings.getByRole("button", { name: "10秒ふやす", exact: true }).click();
  await expect(settings).not.toBeVisible();
  await expect(timer).toBeFocused();
  await expect.poll(async () => Number((await timer.textContent())?.match(/\d+/)?.[0])).toBeGreaterThanOrEqual(beforeExtension + 9);
  expect(Number((await timer.textContent())?.match(/\d+/)?.[0])).toBeLessThanOrEqual(beforeExtension + 10);
  await timer.click();
  await settings.getByRole("button", { name: "制限なしにする", exact: true }).click();
  await expect(settings).not.toBeVisible();
  await expect(timer).toBeFocused();
  await expect(point).toBeVisible();
  await expect(page.getByRole("button", { name: "制限時間の設定", exact: true })).toHaveText("制限なし");
  await expect(point.getByRole("list").getByRole("button")).toHaveCount(3);
  await fitsWithoutPageScroll(page, point.getByRole("list").getByRole("button").last());
});

test("API failure controls stay accessible at 320px with extra-large text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "small-320", "The failure-layout boundary is covered at the smallest viewport.");
  let blockedGoogleRequests = 0;
  // Simulate an unavailable provider, never manufacture a Google response or API key.
  await page.route(/^https:\/\/(?:[^/]+\.)?(?:googleapis\.com|gstatic\.com|google\.com)\//, (route) => {
    blockedGoogleRequests += 1;
    return route.abort("blockedbyclient");
  });
  await page.goto("/evac?mode=mock&from=standalone");
  await page.getByRole("button", { name: "遊び方・設定", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "遊び方・設定", exact: true });
  await settings.getByRole("combobox", { name: "文字サイズ", exact: true }).selectOption({ label: "特大" });
  await settings.getByRole("button", { name: /API版.*Googleマップ/ }).click();
  await expect(settings).not.toBeVisible();
  // A fresh checkout may intentionally have no key; do not rewrite its environment.
  test.skip(await page.getByRole("heading", { name: "API版はキーの設定待ちです", exact: true }).isVisible(), "Requires an existing Google Maps key to mount the API interface.");

  const location = page.getByRole("button", { name: "現在地を使う", exact: true });
  const address = page.getByRole("textbox", { name: "住所・駅名で出発地点を検索", exact: true });
  const search = page.getByRole("button", { name: "検索", exact: true });
  const help = page.getByRole("button", { name: "遊び方・設定", exact: true });
  const compare = page.getByRole("button", { name: "ルートを比べる", exact: true });
  await expect(page.getByRole("alert").filter({ hasText: "Googleマップを読み込めませんでした" })).toBeVisible();
  expect(blockedGoogleRequests).toBeGreaterThan(0);
  for (const control of [location, address, search, help, compare]) await fitsWithoutPageScroll(page, control);

  await address.fill("文京区 大塚");
  await expect(search).toBeEnabled();
  await search.click();
  await expect(page.getByRole("alert").filter({ hasText: "検索できませんでした" })).toBeVisible();
  await expect(location).toBeEnabled();
  for (const control of [location, address, search, help, compare]) await fitsWithoutPageScroll(page, control);
  await help.click();
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "文字サイズ", exact: true })).toHaveValue("xlarge");
  await settings.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(help).toBeFocused();
  await fitsWithoutPageScroll(page, compare);
  await page.screenshot({ path: testInfo.outputPath("api-large-failure.png"), animations: "disabled" });
});
