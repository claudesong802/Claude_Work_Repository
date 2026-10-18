import { expect, test, type Page } from "@playwright/test";

// 덮기 시험 — 구름이 어느 화면비에서도 빈틈없이 덮는가 · 그림이 풀리기 전에는 흰 바탕만 · 가운데부터 열리는가.
const SKIES = ["dense", "mid", "sparse"] as const;
const SIZES = [
  { name: "iPad 세로", width: 768, height: 1024 },
  { name: "iPad 가로", width: 1024, height: 768 },
  { name: "폰 세로", width: 390, height: 844 },
  { name: "폰 가로", width: 844, height: 390 },
  { name: "데스크톱", width: 1920, height: 1080 },
  { name: "넓은 데스크톱", width: 2560, height: 1080 },
];
/** 빈틈 문턱 — 구름 가장자리 반투명 화소 몇 개(잰 값: docs/DESIGN.md) */
const GAP_LIMIT = 0.001;

/** 흰 바탕을 숨기고 밑을 자홍색으로 칠한 뒤 찍어, 구름 사이로 밑이 보이는 화소의 비율을 잰다(페이지 안 canvas 로 해독) */
async function gapRatio(page: Page): Promise<number> {
  await page.addStyleTag({
    content:
      ".cloudcover-sheet{opacity:0!important}.demo-map,.demo-stage,body{background:#ff00ff!important}" +
      ".cloudcover *{animation-play-state:paused!important}.cloudcover-sky{animation:none!important}",
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const png = await page.screenshot({ scale: "css" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let gap = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 120 && d[i + 2] > 150) gap++;
    return gap / (d.length / 4);
  }, png.toString("base64"));
}

async function openSky(page: Page, sky: string) {
  await page.goto(`/?nomap=1&hang=1&fresh=1&sky=${sky}`);
  await expect(page.locator(".cloudcover")).toHaveAttribute("data-shown", "1");
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
}

for (const sky of SKIES) {
  test(`하늘 ${sky}: 여러 화면비에서 빈틈 없이 덮는다`, async ({ page }) => {
    test.setTimeout(90_000);
    const gaps: string[] = [];
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openSky(page, sky);
      const g = await gapRatio(page);
      if (g > GAP_LIMIT) gaps.push(`${size.name} ${(g * 100).toFixed(3)}%`);
    }
    expect(gaps).toEqual([]);
  });
}

test("그림이 다 풀리기 전에는 불투명한 흰 바탕만 · 다 풀리면 구름이 뜬다", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/*.webp", async (route) => {
    await held;
    await route.continue();
  });
  // 붙잡아 둔 그림이 load 이벤트를 막으므로(chromium) DOM 이 서면 바로 본다
  await page.goto("/?nomap=1&hang=1&fresh=1", { waitUntil: "domcontentloaded" });
  const cover = page.locator(".cloudcover");
  await expect(cover).toBeVisible();
  await page.waitForTimeout(700); // 그림 기다림 상한(1.2 초) 안
  await expect(cover).not.toHaveAttribute("data-shown", "1");
  await expect(page.locator(".cloudcover-piece")).toHaveCount(0);
  expect(await page.locator(".cloudcover-sheet").evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  release();
  await expect(cover).toHaveAttribute("data-shown", "1");
  await expect(page.locator(".cloudcover-piece").first()).toBeVisible();
});

for (const design of ["a", "b"]) {
  test(`시안 ${design}: 펴지기는 가운데 구름부터(가운데에서 멀수록 늦게 출발)`, async ({ page }) => {
    await page.goto(`/?nomap=1&delay=800&fresh=1&design=${design}`);
    await expect(page.locator(".cloudcover")).toHaveAttribute("data-phase", "part", { timeout: 4000 });
    const rows = await page.locator(".cloudcover-piece").evaluateAll((els) =>
      els.map((e) => {
        const st = (e as HTMLElement).style;
        const x = parseFloat(st.getPropertyValue("--x"));
        const y = parseFloat(st.getPropertyValue("--y"));
        return { d: Math.hypot(x - 50, y - 50), delay: parseFloat(getComputedStyle(e).animationDelay) };
      }),
    );
    expect(rows.length).toBeGreaterThan(5);
    rows.sort((p, q) => p.d - q.d);
    for (let i = 1; i < rows.length; i++) expect(rows[i].delay).toBeGreaterThanOrEqual(rows[i - 1].delay);
    // 가운데 구름은 거의 곧바로 · 모서리 구름은 눈에 띄게 늦게
    expect(rows[0].delay).toBeLessThan(0.05);
    expect(rows[rows.length - 1].delay).toBeGreaterThan(rows[0].delay + 0.05);
  });
}
