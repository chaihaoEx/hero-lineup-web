import { expect, test } from "@playwright/test";

const requestedBase = process.env.VITE_BASE_PATH ?? "/";
const base = requestedBase === "/" ? "/" : `/${requestedBase.replace(/^\/+|\/+$/g, "")}/`;

test("首次缓存完成后可在完全断网状态重新启动", async ({ page, context }) => {
  await page.goto(base);
  await expect(page.locator(".online-system-card.active > strong")).toBeVisible();
  await page.evaluate(async (appBase) => {
    await navigator.serviceWorker.ready;
    const deadline = Date.now() + 30_000;
    const required = [
      `${appBase}index.html`,
      `${appBase}content/manifest.json`,
      `${appBase}content/TextAsset/items.json`,
      `${appBase}content/TextAsset/texts_zh.json`,
    ].map((path) => new URL(path, location.origin).pathname);
    while (Date.now() < deadline) {
      const cached = (await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys())))
        .flat().map((request) => new URL(request.url).pathname);
      if (required.every((path) => cached.includes(path))) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Service Worker 未在限时内完成核心离线内容缓存");
  }, base);

  // Reload once under Service Worker control so currently visible sprites are
  // populated through the runtime CacheFirst route instead of precaching all
  // 2,000+ images during the first visit.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".online-system-card.active > strong")).toBeVisible();
  await expect(page.locator(`img[src^='${base}content/']`).first()).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const spriteCache = (await caches.keys()).find((name) => name.includes("hero-lineup-sprites-v1"));
    return spriteCache ? (await caches.open(spriteCache)).keys().then((entries) => entries.length) : 0;
  })).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".online-system-card.active > strong")).toBeVisible();
  await expect(page.locator(`img[src^='${base}content/']`).first()).toBeVisible();
});
