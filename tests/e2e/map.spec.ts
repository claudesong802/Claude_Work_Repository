import { expect, test } from "@playwright/test";

// 진짜 지도(WebGL 타일)를 덮개 밑에 띄워 끝까지 — 콘솔 오류 0 · 지도 idle 로 걷힘
test("진짜 지도: idle 에 걷히고 콘솔 오류가 없다", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?fresh=1&debug=1");
  await expect(page.locator(".cloudcover")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeAttached({ timeout: 20_000 });
  await expect(page.locator(".cloudcover")).toHaveCount(0, { timeout: 40_000 });
  const marks = await page.evaluate(() => window.__coverMarks);
  expect(marks?.idleAt).not.toBeNull();
  expect(marks?.readyAt).not.toBeNull();
  expect(marks!.readyAt!).toBeGreaterThanOrEqual(marks!.idleAt!);
  expect(marks?.partFrames).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
