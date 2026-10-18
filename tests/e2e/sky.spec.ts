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
/** 흐린 미리보기 빈틈 문턱 — 가장자리가 흐려 반투명 화소가 더 있다(잰 값으로 정함 · docs/DESIGN.md) */
const BLUR_GAP_LIMIT = 0.003; // 잰 최대 0.111 %(dense · iPad 가로 · 10-19) 의 약 3 배 — 기다리는 동안엔 흰 바탕이 뒤에 있어 실제로 지도가 비치지는 않는다

/** 흰 바탕을 숨기고 밑을 자홍색으로 칠한 뒤 찍어, 구름 사이로 밑이 보이는 화소의 비율을 잰다(페이지 안 canvas 로 해독) */
async function gapRatio(page: Page): Promise<number> {
  await page.addStyleTag({
    content:
      ".cloudcover-sheet{opacity:0!important}.demo-map,.demo-stage,body{background:#ff00ff!important}" +
      ".cloudcover *{animation-play-state:paused!important}.cloudcover-sky{animation:none!important}",
  });
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
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
    for (let i = 0; i < d.length; i += 4)
      if (d[i] > 150 && d[i + 1] < 120 && d[i + 2] > 150) gap++;
    return gap / (d.length / 4);
  }, png.toString("base64"));
}

async function openSky(page: Page, sky: string) {
  await page.goto(`/?nomap=1&hang=1&fresh=1&sky=${sky}`);
  await expect(page.locator(".cloudcover")).toHaveAttribute("data-shown", "1");
  await page.waitForFunction(() =>
    [...document.images].every((i) => i.complete && i.naturalWidth > 0),
  );
  // 다 그려진 모습(선명한 그림)으로 잰다 — 흐린 미리보기 동안의 덮기는 「흐린 미리보기만으로도 빈틈 없이」 시험이 따로 잰다
  await expect(page.locator(".cloudcover")).toHaveAttribute("data-sharp", "1");
  await expect
    .poll(() =>
      page
        .locator(".cloudcover-sharp")
        .first()
        .evaluate((e) => getComputedStyle(e).opacity),
    )
    .toBe("1");
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

test("흐린 미리보기만으로도 빈틈 없이 덮는다(선명한 그림을 붙잡아 둔 채)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route("**/*.webp", () => undefined); // 끝내 안 줌 — 흐린 미리보기만 남는다
  const gaps: string[] = [];
  const seen: string[] = [];
  for (const sky of SKIES) {
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(`/?nomap=1&hang=1&fresh=1&sky=${sky}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator(".cloudcover")).toHaveAttribute(
        "data-shown",
        "1",
      );
      await expect(page.locator(".cloudcover")).not.toHaveAttribute(
        "data-sharp",
        "1",
      );
      await page.waitForTimeout(300); // 덮개가 뜨는 짧은 투명도(0.22 초)가 끝나게
      const g = await gapRatio(page);
      seen.push(`${sky} ${size.name} ${(g * 100).toFixed(3)}%`);
      if (g > BLUR_GAP_LIMIT)
        gaps.push(`${sky} ${size.name} ${(g * 100).toFixed(3)}%`);
    }
  }
  console.log("흐린 미리보기 빈틈:", seen.join(" · "));
  expect(gaps).toEqual([]);
});

// 흐린 미리보기 먼저(사용자 10-19 「없앰 방식으로」) — 코드 안에 든 작은 흐린 그림(data URL)으로 첫 화면부터 구름이 보이고,
// 선명한 그림(WebP)이 다 풀리면 그 위에 겹쳐 나타난다. 전엔 선명한 그림 6장 해독(약 0.3 초) 동안 흰 바탕만 보였다.
test("선명한 그림을 붙잡아 둬도 흐린 구름이 곧바로 보이고 · 선명한 그림이 풀리면 겹쳐 나타난다", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/*.webp", async (route) => {
    await held;
    await route.continue();
  });
  // 붙잡아 둔 그림이 load 이벤트를 막으므로(chromium) DOM 이 서면 바로 본다
  await page.goto("/?nomap=1&hang=1&fresh=1", {
    waitUntil: "domcontentloaded",
  });
  const cover = page.locator(".cloudcover");
  await expect(cover).toHaveAttribute("data-shown", "1");
  // 흐린 미리보기가 실제로 풀려 그려졌는가(칸 크기만 보면 그림이 없어도 「보임」 이다)
  await expect
    .poll(
      () =>
        page
          .locator(".cloudcover-blur")
          .first()
          .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
      { timeout: 1000 },
    )
    .toBe(true);
  await page.waitForTimeout(700);
  await expect(cover).not.toHaveAttribute("data-sharp", "1");
  expect(
    await page
      .locator(".cloudcover-sharp")
      .first()
      .evaluate((e) => getComputedStyle(e).opacity),
  ).toBe("0");
  release();
  await expect(cover).toHaveAttribute("data-sharp", "1");
  await expect
    .poll(() =>
      page
        .locator(".cloudcover-sharp")
        .first()
        .evaluate((e) => getComputedStyle(e).opacity),
    )
    .toBe("1");
});

test("동작 줄이기도 첫 화면부터 구름 — 덮개가 뜬 뒤 0.15 초 안에 구름 그림이 풀려 보인다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shownAfter: number | null };
    w.__shownAfter = null;
    let coverAt: number | null = null;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(".cloudcover");
      if (el && coverAt === null) coverAt = performance.now();
      const img = document.querySelector<HTMLImageElement>(".cloudcover-blur");
      if (coverAt !== null && img && img.complete && img.naturalWidth > 0) {
        w.__shownAfter = performance.now() - coverAt;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto("/?nomap=1&reduced=1&fresh=1&hang=1");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __shownAfter: number | null }).__shownAfter,
      ),
    )
    .not.toBeNull();
  const after = await page.evaluate(
    () => (window as unknown as { __shownAfter: number | null }).__shownAfter,
  );
  expect(after!).toBeLessThan(150);
});

for (const design of ["a", "b"]) {
  test(`시안 ${design}: 펴지기는 가운데 구름부터(가운데에서 멀수록 늦게 출발)`, async ({
    page,
  }) => {
    await page.goto(`/?nomap=1&delay=800&fresh=1&design=${design}`);
    await expect(page.locator(".cloudcover")).toHaveAttribute(
      "data-phase",
      "part",
      { timeout: 4000 },
    );
    const rows = await page.locator(".cloudcover-piece").evaluateAll((els) =>
      els.map((e) => {
        const st = (e as HTMLElement).style;
        const x = parseFloat(st.getPropertyValue("--x"));
        const y = parseFloat(st.getPropertyValue("--y"));
        return {
          d: Math.hypot(x - 50, y - 50),
          delay: parseFloat(getComputedStyle(e).animationDelay),
        };
      }),
    );
    expect(rows.length).toBeGreaterThan(5);
    rows.sort((p, q) => p.d - q.d);
    for (let i = 1; i < rows.length; i++)
      expect(rows[i].delay).toBeGreaterThanOrEqual(rows[i - 1].delay);
    // 가운데 구름은 거의 곧바로 · 모서리 구름은 눈에 띄게 늦게
    expect(rows[0].delay).toBeLessThan(0.05);
    expect(rows[rows.length - 1].delay).toBeGreaterThan(rows[0].delay + 0.05);
  });
}
