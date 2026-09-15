import { expect, test } from "@playwright/test";
import { QUESTIONS } from "../src/lib/content";

for (const sample of [
  { choiceId: "verify", timedOut: false, voice: "VOICE-002-radio", specific: true },
  { choiceId: "share", timedOut: false, voice: "VOICE-003-information", specific: true },
  { choiceId: "verify", timedOut: true, voice: "VOICE-003-information", specific: false },
]) {
  test(`被災者の声：${sample.choiceId}・時間切れ${sample.timedOut}を追加質問なしで振り返る`, async ({ page }, testInfo) => {
    const questions = [QUESTIONS.find(q => q.id === "q5")!, QUESTIONS.find(q => q.id === "q2")!];
    await page.addInitScript(({ questions, sample }) => {
      localStorage.setItem("jishingoto.settings.v1", JSON.stringify({ audience: "adult", uiScale: "large", furigana: false, sound: false, haptics: false }));
      if (!sessionStorage.getItem("jishingoto.session.v1")) sessionStorage.setItem("jishingoto.session.v1", JSON.stringify({
        questions, answers: questions.map((q, index) => {
          const c = q.choices.find(c => c.id === (index ? "wait" : sample.choiceId))!;
          return { questionId: q.id, choiceId: c.id, safety: c.safety, axis: q.axis, timedOut: !index && sample.timedOut };
        }), risks: [], finishedAt: Date.now(), startedAt: Date.now(), resultIntroPending: false, resultStep: 0,
      }));
    }, { questions, sample });
    const apiRequests: string[] = [];
    page.on("request", request => { if (request.url().includes("/api/")) apiRequests.push(request.url()); });
    await page.goto("/result");
    const voice = page.getByRole("region", { name: "被災者の声", exact: true });
    await expect(voice).toHaveAttribute("data-voice-id", sample.voice);
    await expect(voice.getByText(sample.specific ? "今回選んだ行動とのつながり" : "このテーマとのつながり")).toBeVisible();
    await expect(voice.getByRole("link", { name: /出典：内閣府/ })).toHaveAttribute("href", /https:\/\/www.bousai.go.jp\/kyoiku\/keigen\/ichinitimae\//);
    await voice.getByText("経験の背景・出典を読む", { exact: true }).click();
    await expect(voice.locator("details")).toHaveAttribute("open", "");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await voice.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("survivor-voice.png"), fullPage: true });
    if (sample.voice === "VOICE-002-radio") {
      await voice.getByRole("button", { name: "別の経験を読む" }).click();
      await expect(voice).toHaveAttribute("data-voice-id", "VOICE-003-information");
      await expect(voice.locator("details")).not.toHaveAttribute("open", "");
      await expect(voice.getByText("このテーマとのつながり")).toBeVisible();
    }
    const recorded = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!).answers);
    await page.reload();
    await expect(voice).toHaveAttribute("data-voice-id", sample.voice);
    await page.getByRole("button", { name: "次へ", exact: true }).click();
    await expect(voice).toHaveCount(0);
    await expect(page.locator("article")).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!).answers)).toEqual(recorded);
    expect(apiRequests).toEqual([]);
  });
}

test("被災者の声：回答を変えると選び直し、文字拡大・ふりがなでも詳細を操作できる", async ({ page }) => {
  const question = QUESTIONS.find(q => q.id === "q5")!;
  await page.addInitScript(question => {
    localStorage.setItem("jishingoto.settings.v1", JSON.stringify({ audience: "child", uiScale: "xlarge", furigana: true, sound: false }));
    if (!sessionStorage.getItem("jishingoto.session.v1")) sessionStorage.setItem("jishingoto.session.v1", JSON.stringify({
      questions: [question], answers: [{ questionId: question.id, choiceId: "share", safety: 0.15, axis: question.axis, timedOut: false }], risks: [], finishedAt: Date.now(), resultStep: 0,
    }));
  }, question);
  await page.goto("/result");
  const voice = page.getByRole("region", { name: "被災者の声", exact: true });
  await expect(voice).toHaveAttribute("data-voice-id", "VOICE-003-information");
  await expect(voice.locator("ruby").first()).toBeVisible();
  const detail = voice.locator("summary");
  await detail.focus();
  await page.keyboard.press("Enter");
  await expect(voice.locator("details")).toHaveAttribute("open", "");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!);
    saved.answers[0].choiceId = "verify";
    saved.answers[0].safety = 0.95;
    sessionStorage.setItem("jishingoto.session.v1", JSON.stringify(saved));
  });
  await page.reload();
  await expect(voice).toHaveAttribute("data-voice-id", "VOICE-002-radio");
  await expect(voice.locator("details")).not.toHaveAttribute("open", "");
});

test("被災者の声：初回Tipsは回答を使わず、次のTipsへ進める", async ({ page }) => {
  await page.goto("/test-room");
  await page.getByLabel("解析の模擬待ち時間（秒）").fill("120");
  await page.getByRole("button", { name: "APIなしでテスト開始", exact: true }).click();
  await expect(page).toHaveURL(/\/analyzing$/);
  for (let i = 0; i < 14; i++) {
    if (await page.locator('[data-voice-id="VOICE-001-books"]').count()) break;
    await page.getByRole("button", { name: "次の豆知識" }).click();
  }
  const voice = page.getByRole("region", { name: "被災者の声", exact: true });
  await expect(voice).toHaveAttribute("data-voice-id", "VOICE-001-books");
  await expect(voice.getByText("このテーマとのつながり")).toBeVisible();
  const answers = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!).answers);
  expect(answers).toEqual([]);
  await page.getByRole("button", { name: "次の豆知識" }).click();
  await expect(voice).toHaveAttribute("data-voice-id", "VOICE-004-contact");
});

test("被災者の声：洪水の振り返りで車の経験との条件差と出典を読める", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("jishingoto.evac.v2", JSON.stringify({ scenario: "flood", finishedAt: Date.now(), decisions: [{ pointId: "voice-flood-test", eventId: "walk-case-8", choiceId: "go", timedOut: false, rerouted: false, extraSeconds: 0 }] }));
  });
  await page.goto("/evac/summary");
  await page.getByRole("button", { name: /判断1：.*を見返す/ }).click();
  const voice = page.getByRole("region", { name: "被災者の声", exact: true });
  await expect(voice).toHaveAttribute("data-voice-id", "VOICE-011-underpass");
  await voice.getByText("経験の背景・出典を読む", { exact: true }).click();
  await expect(voice.getByText(/これは車の経験です/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "判断を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "振り返りを終わる", exact: true }).click();
  await expect(page.getByRole("heading", { name: "次の備えをひとつ選ぼう" })).toBeVisible();
});
