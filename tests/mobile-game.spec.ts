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
