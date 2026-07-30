import { expect, test } from "@playwright/test";

test("首次缓存完成后可在完全断网状态重新启动", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator(".online-system-card.active > strong")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const cached = (await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys())))
        .reduce((total, entries) => total + entries.length, 0);
      if (cached >= 2_000) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Service Worker 未在限时内完成完整静态内容缓存");
  });

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".online-system-card.active > strong")).toBeVisible();
  await expect(page.locator("img[src^='/content/']").first()).toBeVisible();
});
