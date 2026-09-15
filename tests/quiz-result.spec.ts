import { expect, test } from "@playwright/test";
import { DETECTED_RISKS } from "../src/lib/content";

test("最後の回答を記録してから終了演出を出し、一度だけ振り返りへ進む", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let roomApiCalls = 0;
  await page.route("**/api/room/**", async route => {
    roomApiCalls++;
    await route.fulfill({ status: 500, json: { error: "unexpected-test-request" } });
  });
  await page.addInitScript(risks => {
    localStorage.setItem("jishingoto.settings.v1", JSON.stringify({ sound: false, haptics: false }));
    if (!sessionStorage.getItem("jishingoto.session.v1")) {
      sessionStorage.setItem("jishingoto.session.v1", JSON.stringify({
        photoUrl: "/figma/img/room-risk.jpg", risks, analysisSource: "demo",
        questions: [], answers: [], checked: [], resultStep: 0,
      }));
    }
  }, DETECTED_RISKS.map(risk => ({ ...risk, confirmed: true })));

  await page.goto("/quiz");
  for (let index = 0; index < 5; index++) {
    await expect(page.getByText(`Q${index + 1}`, { exact: true })).toBeVisible();
    const choice = page.locator(".quiz-question button").first();
    await expect(choice).toBeEnabled();
    await choice.click();
  }
  await expect(page).toHaveURL(/\/result$/);
  const scene = page.getByRole("dialog", { name: /あのとき、\s*どう動けた？/ });
  await expect(scene).toBeVisible();
  const recorded = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!));
  expect(recorded.answers).toHaveLength(5);
  expect(new Set(recorded.answers.map((answer: { questionId: string }) => answer.questionId)).size).toBe(5);
  expect(recorded.finishedAt).toBeGreaterThan(0);
  expect(recorded.resultIntroPending).toBe(true);
  await expect(scene.getByRole("button")).toHaveCount(0);
  await expect(scene.getByText("まもなく振り返りへ", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // CSSアニメーションは最後まで進めても、実際の自動遷移タイマーは残る。
  await page.screenshot({ path: testInfo.outputPath("quiz-outro.png"), animations: "disabled" });
  await expect(scene).not.toBeVisible({ timeout: 6_000 });
  await expect(page.locator("article")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "行動の振り返り" })).toContainText("1 / 5");
  const after = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!));
  expect(after.answers).toEqual(recorded.answers);
  expect(after.resultIntroPending).toBe(false);

  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "行動の振り返り" })).toContainText("2 / 5");
  await expect(scene).toHaveCount(0);
  expect(roomApiCalls).toBe(0);
  expect(errors).toEqual([]);
});

test("終了演出はEscapeでも閉じられ、タイマーが残って結果の位置を戻さない", async ({ page }) => {
  await page.goto("/test-room");
  await page.getByRole("button", { name: "クイズ終了の演出を試す（APIなし）" }).click();
  const scene = page.getByRole("dialog", { name: /あのとき、\s*どう動けた？/ });
  await expect(scene).toBeVisible();
  await expect(scene.getByRole("button")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(scene).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "防災シミュレーション結果" })).toBeFocused();
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.waitForTimeout(3_200);
  await expect(page.getByRole("status").filter({ hasText: "行動の振り返り" })).toContainText("2 / 2");
});

test("動きを減らす設定では演出を省略し、写真がなくても振り返りに進む", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/test-room");
  await page.getByRole("button", { name: "クイズ終了の演出を試す（APIなし）" }).click();
  await expect(page.locator("article")).toBeVisible();
  await expect(page.getByRole("dialog", { name: /あのとき、\s*どう動けた？/ })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!).resultIntroPending)).toBe(false);
  // 写真は永続化しない。リロード後も演出が再生されず、同じ結果を読める。
  await page.reload();
  await expect(page.locator("article")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
