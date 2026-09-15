import { expect, test } from "@playwright/test";

for (const viewport of [{width:320,height:720}, {width:600,height:900}, {width:768,height:1024}, {width:1024,height:768}, {width:1366,height:1024}]) {
  test(`device layout ${viewport.width}x${viewport.height}`, async ({page}, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let apiCalls = 0;
    await page.route("**/api/room/**", async route => {
      apiCalls++;
      await route.fulfill({status:500,json:{error:"unexpected-test-request"}});
    });
    await page.goto("/");
    await expect(page.getByRole("heading", {name:"どちらではじめる？"})).toBeVisible();
    await page.getByRole("button", {name:/こども 子供 はじめる/}).click();
    await expect(page).toHaveURL(/\/home$/);
    const width = await page.locator(".app-page").evaluate(el => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(viewport.width >= 1280 ? 800 : viewport.width * .88);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button",{name:/ふりがな・文字の大きさをかえる/}).click();
    const settings=page.getByRole("dialog");
    await expect(settings).toBeVisible();
    const settingsBox=await settings.boundingBox();
    expect(settingsBox!.width).toBeLessThanOrEqual(viewport.width);
    if(viewport.width>=768) expect(settingsBox!.width).toBeGreaterThan(600);
    await settings.getByRole("button",{name:"とじる",exact:true}).click();
    if(viewport.width>=768) await page.screenshot({path:testInfo.outputPath("home.jpg"),type:"jpeg",quality:75,fullPage:true});
    await page.goto("/test-room");
    await page.getByRole("button",{name:"結果ページを試す（APIなし）"}).click();
    await expect(page.locator("article")).toBeVisible();
    // 入場アニメーション中でも同一フレームの位置を比較する。
    const {review, figure, copy, recallBox, actions} = await page.evaluate(() => {
      const box = (selector: string) => {
        const {x, y, width, height} = document.querySelector(selector)!.getBoundingClientRect();
        return {x, y, width, height};
      };
      return {review:box("article"), figure:box("article > figure"),
        copy:box(".review-copy"), recallBox:box(".review-recall"),
        actions:box('nav[aria-label="結果のページ切り替え"]')};
    });
    const recall = page.getByRole("region", {name:"質問とあなたの回答"});
    expect(recallBox!.y + recallBox!.height).toBeLessThanOrEqual(figure!.y + 1);
    const recorded = await page.evaluate(() => {
      const session = JSON.parse(sessionStorage.getItem("jishingoto.session.v1")!);
      const answer = session.answers[0];
      return session.questions.find((q: {id: string}) => q.id === answer.questionId).choices
        .find((choice: {id: string}) => choice.id === answer.choiceId);
    });
    await expect(recall.locator(".review-answer")).toContainText(recorded.label.replace(/\[[^\]]*\]/g,""));
    expect(await recall.locator(".review-answer dd p").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    if(width>=640) expect(copy!.x).toBeGreaterThanOrEqual(figure!.x+figure!.width-1);
    else expect(copy!.y).toBeGreaterThanOrEqual(figure!.y+figure!.height-1);
    expect(review!.width).toBeLessThanOrEqual(width);
    expect(actions!.y).toBeGreaterThanOrEqual(review!.y + review!.height);
    await page.getByRole("button",{name:/理由・注意点を読む/}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button",{name:"閉じる",exact:true}).click();
    if(viewport.width>=768) await page.screenshot({path:testInfo.outputPath("review.jpg"),type:"jpeg",quality:75,fullPage:true});
    await page.getByRole("button",{name:"次へ",exact:true}).click();
    await page.getByRole("button",{name:"次へ",exact:true}).click();
    await expect(page.getByRole("img",{name:"サンプルの予想図。あなたの部屋を再現した画像ではありません"})).toBeVisible();
    const cells = await page.locator(".score-grid > div").evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height };
    }));
    expect(cells).toHaveLength(4);
    expect(cells[1].x).toBeGreaterThan(cells[0].x);
    expect(cells[1].y).toBe(cells[0].y);
    expect(cells[2].x).toBe(cells[0].x);
    expect(cells[2].y).toBeGreaterThanOrEqual(cells[0].y + cells[0].height);
    expect(cells[3].y).toBe(cells[2].y);
    const prediction = await page.getByRole("img",{name:"サンプルの予想図。あなたの部屋を再現した画像ではありません"}).boundingBox();
    expect(prediction!.y + prediction!.height).toBeLessThan(cells[0].y);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("summary-grid.jpg"),type:"jpeg",quality:80,fullPage:true});
    await page.getByRole("button",{name:"次へ",exact:true}).click();
    await page.getByRole("button",{name:/備えのチェックリストを開く/}).click();
    await page.getByRole("dialog").getByRole("checkbox").first().check();
    await page.getByRole("dialog").getByRole("button",{name:"閉じる",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:/か所 対策済み/})).toContainText("1 / 3");
    await page.goto("/quiz");
    await expect(page.locator(".quiz-room")).toBeVisible();
    await expect(page.locator(".quiz-question button").first()).toBeEnabled();
    const room=await page.locator(".quiz-room").boundingBox(), question=await page.locator(".quiz-question").boundingBox();
    if(width>=640) expect(question!.x).toBeGreaterThanOrEqual(room!.x+room!.width);
    else expect(question!.y).toBeGreaterThanOrEqual(room!.y+room!.height);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if(viewport.width>=768) await page.screenshot({path:testInfo.outputPath("quiz.jpg"),type:"jpeg",quality:75,fullPage:true});
    await page.locator(".quiz-question button").first().click();
    expect(apiCalls).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("統合した入口で対象を選び直せて、結果のPNG保存と任意の画像共有ができる", async ({page}, testInfo) => {
  let apiCalls = 0;
  await page.route("**/api/room/**", async route => {
    apiCalls++;
    await route.fulfill({status:500,json:{error:"unexpected-test-request"}});
  });
  await page.goto("/");
  await page.getByRole("button", {name:/おとな 大人 はじめる/}).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("大人向け", {exact:true})).toBeVisible();
  await page.getByRole("link", {name:"えらびなおす"}).click();
  await page.getByRole("button", {name:/こども 子供 はじめる/}).click();
  await expect(page.getByText("子供向け", {exact:true})).toBeVisible();
  await page.goto("/test-room");
  await page.getByRole("button",{name:"結果ページを試す（APIなし）"}).click();
  await page.getByRole("button",{name:"次へ",exact:true}).click();
  await page.getByRole("button",{name:"次へ",exact:true}).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button",{name:"結果と予想図を1枚で保存"}).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("jishingoto-result-sample.png");
  expect(await download.failure()).toBeNull();
  await download.saveAs(testInfo.outputPath("combined-result.png"));
  await page.getByRole("button",{name:"次へ",exact:true}).click();
  await page.getByRole("button",{name:/結果を共有/}).click();
  const include = page.getByRole("checkbox", {name:"予想図も共有する"});
  await expect(include).not.toBeChecked();
  await expect(page.getByRole("button",{name:"LINEで共有"})).toBeEnabled();
  await expect(page.getByRole("button",{name:"Xで共有",exact:true})).toHaveCount(0);
  await expect(page.getByRole("link",{name:"https://jishingoto.vercel.app"})).toBeVisible();
  await include.check();
  await expect(page.getByRole("img",{name:"共有するサンプルの予想図"})).toBeVisible();
  await expect(page.getByText(/サンプル/, {exact:false}).first()).toBeVisible();
  expect(apiCalls).toBe(0);
});
