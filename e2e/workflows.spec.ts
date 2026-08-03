import { expect, test } from "@playwright/test";
import { assertOffline, openPreview } from "./helpers";

test.describe("浏览器预览中的主要离线工作流", () => {
  test("职业选择使用线上同款职业图标与独立元素徽章", async ({ page }) => {
    const remoteRequests = await openPreview(page);

    await page.getByRole("button", { name: "添加英雄" }).click();
    const dialog = page.getByRole("dialog", { name: "选择英雄职业" });
    await expect(dialog).toBeVisible();
    const cards = dialog.locator(".class-picker-grid button");
    await expect(cards).toHaveCount(42);
    await expect(cards.first().locator("strong")).toHaveText("士兵");
    await expect(cards.first().locator(".class-picker-art > *")).toHaveCount(2);
    await expect(cards.first().locator(".class-picker-element-badge")).toHaveAttribute("alt", "earth");
    await expect(cards.first().locator("small")).toHaveCount(0);
    await expect(cards.first().locator(".class-picker-element-badge")).toHaveJSProperty("complete", true);
    await assertOffline(remoteRequests);
  });

  test("体系新建、保存、重载、复制与删除", async ({ page }) => {
    const remoteRequests = await openPreview(page);

    await page.getByRole("button", { name: "新增体系" }).click();
    await expect(page.getByRole("dialog", { name: "新增体系" })).toBeVisible();
    await page.getByLabel("新体系名称").fill("E2E 离线体系");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page.locator(".online-system-card.active > strong")).toHaveText("E2E 离线体系");
    await page.getByRole("button", { name: /保存当前体系/ }).click();
    await expect(page.getByRole("button", { name: "保存当前体系" })).not.toHaveAttribute("data-dirty");

    await page.reload();
    await expect(page.locator(".online-system-card.active > strong")).toHaveText("E2E 离线体系");
    await page.locator(".local-maintenance").evaluate((element: HTMLDetailsElement) => { element.open = true; });
    await page.getByRole("button", { name: "复制当前" }).click();
    await expect(page.locator(".online-system-card.active > strong")).toHaveText("E2E 离线体系（副本）");
    await page.locator(".local-maintenance").evaluate((element: HTMLDetailsElement) => { element.open = false; });
    await page.getByRole("button", { name: /保存当前体系/ }).click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除体系 E2E 离线体系（副本）" }).click();
    await expect(page.locator(".online-system-card.active > strong")).toHaveText("E2E 离线体系");
    await assertOffline(remoteRequests);
  });

  test("英雄与勇士配装可以编辑并随当前体系保留", async ({ page }) => {
    const remoteRequests = await openPreview(page);

    await page.getByRole("button", { name: "添加英雄" }).click();
    await page.locator(".class-picker-grid button").first().click();
    await page.getByRole("button", { name: /空白模板/ }).click();
    await expect(page.locator(".unit-card")).toHaveCount(1);
    await expect(page.locator(".hero-icon-card .roster-element-badge")).toHaveAttribute("alt", "earth");
    await expect(page.locator(".champion-icon-card .roster-element-badge").first()).toHaveAttribute("alt", "light");
    const saveButton = page.getByRole("button", { name: /保存当前体系/ });
    await saveButton.click();
    await expect(saveButton).not.toHaveAttribute("data-dirty");

    await page.locator(".unit-card").first().getByRole("button", { name: "配装" }).click();
    await page.getByTitle("点击改名").click();
    await page.getByLabel("英雄名称").fill("E2E 骑士");
    await page.getByLabel("英雄名称").press("Enter");
    await page.getByRole("button", { name: "武器装备槽" }).click();
    await page.getByRole("button", { name: "传奇", exact: true }).click();
    await page.getByRole("button", { name: "武器超越" }).click();
    await page.getByRole("button", { name: /T1 学徒短剑/ }).click();
    await page.getByRole("button", { name: /T4 .*余烬元素/ }).click();
    await page.getByRole("button", { name: /T14 比蒙精魂/ }).click();
    await page.getByRole("dialog", { name: "装备选择 - 1" }).getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.locator(".hero-skill-card.innate-card")).toBeVisible();
    await page.getByRole("button", { name: "技能 未选择" }).first().click();
    await page.getByRole("button", { name: "选择技能 裂痕" }).click();
    await expect(page.getByRole("button", { name: "技能 裂痕" })).toBeVisible();
    await expect(saveButton).toHaveAttribute("data-dirty", "true");
    await page.getByRole("button", { name: "导出图片" }).click();
    const heroImagePreview = page.getByRole("dialog", { name: "英雄配装图片预览" });
    await expect(heroImagePreview).toBeVisible();
    await expect(heroImagePreview.locator("img")).toHaveAttribute("src", /^data:image\/png/);
    await page.screenshot({ path: "../../reference/screenshots/local-hero-image-preview-1440x900.png", fullPage: false });
    await heroImagePreview.getByRole("button", { name: "关闭" }).click();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.locator(".unit-card").filter({ hasText: "E2E 骑士" })).toContainText("E2E 骑士");
    await expect(page.getByTitle("学徒短剑")).toBeVisible();
    await saveButton.click();
    await expect(saveButton).not.toHaveAttribute("data-dirty");

    const champion = page.locator(".champion-card").first();
    await champion.scrollIntoViewIfNeeded();
    await champion.getByRole("button", { name: /勇士配装/ }).click();
    await page.getByRole("button", { name: "勇士等级" }).click();
    await page.getByRole("option", { name: "45" }).click();
    await page.getByRole("button", { name: "勇士阶数" }).click();
    await page.getByRole("option", { name: "11+1", exact: true }).click();
    await expect(page.getByRole("button", { name: "使魔装备槽" })).toBeVisible();
    await expect(page.getByRole("button", { name: "光环装备槽" })).toBeVisible();
    await expect(saveButton).toHaveAttribute("data-dirty", "true");
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(champion.locator(".unit-icon-open")).toHaveAttribute("title", /Lv\.45 · Rank \d+/);
    await assertOffline(remoteRequests);
  });

  test("英雄拖放载荷可以加入任务，固定 10000 次模拟展示进度和线上同款结果", async ({ page }) => {
    const remoteRequests = await openPreview(page);

    await page.getByRole("button", { name: "添加英雄" }).click();
    await page.locator(".class-picker-grid button").first().click();
    await page.getByRole("button", { name: /空白模板/ }).click();
    await page.getByRole("button", { name: /保存当前体系/ }).click();
    const heroName = await page.locator(".hero-icon-card strong").first().textContent();
    expect(heroName).toBeTruthy();
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await page.locator(".hero-icon-card").first().dispatchEvent("dragstart", { dataTransfer: transfer });
    await page.getByRole("button", { name: "添加分组" }).click();
    const task = page.locator(".task-card").first();
    await task.dispatchEvent("drop", { dataTransfer: transfer });
    await expect(task.getByText(heroName!, { exact: true })).toBeVisible();
    await expect(task.getByTitle(`移除 ${heroName}`)).toBeVisible();
    await expect(task.locator(".task-member-element-badge").first()).toHaveAttribute("alt", "earth");
    await task.getByRole("button", { name: "添加成员" }).click();
    const memberPicker = page.getByRole("dialog", { name: "选择成员添加到任务" });
    await expect(memberPicker.locator(".picker-member-element-badge").first()).toHaveAttribute("alt", "light");
    await memberPicker.getByRole("button", { name: /阿尔贡/ }).click();
    await expect(task.getByText("阿尔贡", { exact: true })).toBeVisible();
    await expect(task.locator(".task-member-element-badge")).toHaveCount(2);

    await task.getByRole("button", { name: "测试冒险" }).click();
    const firstProgress = task.getByText(/模拟中 \d+%/);
    await expect(firstProgress).toBeVisible();
    await expect(firstProgress).toBeHidden({ timeout: 20_000 });
    await expect(task.getByText(/成功率: \d+\.\d{3}%/)).toBeVisible();

    await task.getByRole("button", { name: "测试冒险" }).click();
    const secondProgress = task.getByText(/模拟中 \d+%/);
    await expect(secondProgress).toBeVisible();
    await expect(secondProgress).toBeHidden({ timeout: 20_000 });
    await expect(task.getByText(/成功率: \d+\.\d{3}%/)).toBeVisible();
    await task.getByRole("button", { name: "查看详情" }).click();
    await expect(task.getByText("hero-simulator-ts-1.0.0")).toBeVisible();
    await expect(page.locator(".simulation-member-summary article")).toHaveCount(2);
    await expect(page.locator(".simulation-config-card")).toHaveCount(2);
    await expect(page.locator(".simulation-members")).toHaveCSS("grid-template-columns", /.+ .+/);
    await expect(page.getByRole("button", { name: "复制图片" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "下载图片" })).toBeEnabled();
    await page.screenshot({ path: "../../reference/screenshots/local-simulation-detail-1440x900.png", fullPage: false });
    await assertOffline(remoteRequests);
  });

  test("泰坦塔先选楼层再选六种难度并显示分层图标", async ({ page }) => {
    const remoteRequests = await openPreview(page);
    await page.getByRole("button", { name: "添加分组" }).click();
    const task = page.locator(".task-card").first();
    await task.getByRole("button", { name: /切换地图/ }).click();
    const picker = page.getByRole("dialog", { name: "选择冒险任务" });
    await expect(picker.getByRole("heading", { name: "选择冒险任务" })).toHaveCSS("font-size", "20px");
    await expect(picker.getByRole("button", { name: "关闭", exact: true })).toHaveCSS("font-size", "16px");
    await expect.poll(() => picker.locator(".quest-map-grid").evaluate((grid) =>
      getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    )).toBe(10);
    await expect.poll(() => picker.locator(".quest-map-grid img").first().evaluate((image) =>
      Math.round(image.getBoundingClientRect().width),
    )).toBe(64);
    await page.getByRole("button", { name: "泰坦塔" }).click();
    await page.getByRole("button", { name: "第1层" }).click();
    await expect.poll(() => picker.locator(".quest-difficulty-grid").evaluate((grid) =>
      getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    )).toBe(12);
    for (const variant of ["阿尔法", "贝塔", "伽马", "德尔塔", "艾普斯龙", "奇异"]) {
      await expect(picker.getByRole("button", { name: new RegExp(variant) })).toBeVisible();
    }
    await expect(picker.locator(".quest-difficulty-art.titan img")).toHaveCount(12);
    await expect.poll(() => picker.locator(".quest-difficulty-art.titan img").evaluateAll((images) =>
      images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
    )).toBe(true);
    await expect.poll(() => picker.locator(".quest-difficulty-art.titan").first().evaluate((art) =>
      Math.round(art.getBoundingClientRect().width),
    )).toBe(48);
    await page.screenshot({ path: "../../reference/screenshots/local-titan-tower-variants-1440x900.png", fullPage: false });
    await picker.getByRole("button", { name: /奇异/ }).click();
    await expect(task).toContainText("泰坦之塔1层");
    await expect(task.getByLabel("奇异", { exact: true })).toBeVisible();
    await expect(task.getByText("精英怪")).toHaveCount(0);
    await expect(task.getByText("元素屏障")).toHaveCount(0);
    await expect(task.locator("label", { hasText: "泰坦塔" })).toHaveCount(0);
    await assertOffline(remoteRequests);
  });

  test("浏览器可下载并重新导入带 checksum 的体系文件", async ({ page }) => {
    const remoteRequests = await openPreview(page);
    await page.locator(".local-maintenance").evaluate((element: HTMLDetailsElement) => { element.open = true; });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出文件" }).click();
    const download = await downloadPromise;
    const exported = await download.path();
    expect(exported).toBeTruthy();
    await page.locator('input[type="file"]').setInputFiles(exported);
    await expect(page.getByText(/已导入并保存 1 个体系/)).toBeVisible();
    await assertOffline(remoteRequests);
  });
});
