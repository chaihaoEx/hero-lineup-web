import { shouldUseMobileInterface } from "../src/platform/device";

test("selects the phone UI for explicit mobile browser signals", () => {
  expect(shouldUseMobileInterface({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1",
    maxTouchPoints: 5,
    coarsePointer: true,
    viewportWidth: 390,
  })).toBe(true);

  expect(shouldUseMobileInterface({
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
    maxTouchPoints: 5,
    coarsePointer: true,
    viewportWidth: 412,
  })).toBe(true);

  expect(shouldUseMobileInterface({
    userAgent: "Custom embedded browser",
    userAgentDataMobile: true,
    maxTouchPoints: 0,
    coarsePointer: false,
    viewportWidth: 1024,
  })).toBe(true);
});

test("keeps the desktop UI for desktop and tablet-class signals", () => {
  expect(shouldUseMobileInterface({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130 Safari/537.36",
    maxTouchPoints: 0,
    coarsePointer: false,
    viewportWidth: 390,
  })).toBe(false);

  expect(shouldUseMobileInterface({
    userAgent: "Mozilla/5.0 (Linux; Android 15; Tablet) AppleWebKit/537.36 Chrome/130 Safari/537.36",
    maxTouchPoints: 10,
    coarsePointer: true,
    viewportWidth: 1024,
  })).toBe(false);
});

test("uses touch and handset width as a fallback for custom mobile browsers", () => {
  expect(shouldUseMobileInterface({
    userAgent: "ShopShell/3.0",
    maxTouchPoints: 5,
    coarsePointer: true,
    viewportWidth: 720,
  })).toBe(true);

  expect(shouldUseMobileInterface({
    userAgent: "ShopShell/3.0",
    maxTouchPoints: 5,
    coarsePointer: true,
    viewportWidth: 900,
  })).toBe(false);
});
