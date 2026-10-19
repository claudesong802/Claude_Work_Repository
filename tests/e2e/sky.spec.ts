import { expect, test, type Page } from "@playwright/test";
import { blurShownAfter, watchBlurShown } from "./spread";

// 덮기 시험 — 구름이 어느 화면비에서도 빈틈없이 덮는가 · 흐린 미리보기 먼저 · 가운데부터 열리는가.
// 구름 조각(CloudCover)은 동작 줄이기에서만 나온다(첫 접속은 영상 · 사용자 10-19) — 주소에 reduced=1.
// 하늘 결 셋(dense · mid · sparse) 견줌은 10-19 정리하며 걷었다(남긴 것: mid 배치 하나).
const SKY = "/?nomap=1&hang=1&fresh=1&reduced=1";
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
const BLUR_GAP_LIMIT = 0.003; // 잰 최대 0.099 %(mid · iPad 가로 · 10-19) 의 약 3 배 — 기다리는 동안엔 흰 바탕이 뒤에 있어 실제로 지도가 비치지는 않는다

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

async function openSky(page: Page) {
  await page.goto(SKY);
  await expect(page.locator(".cloudcover")).toHaveAttribute("data-shown", "1");
  await page.waitForFunction(() =>
    [...document.images].every((i) => i.complete && i.naturalWidth > 0),
  );
  // 다 그려진 모습(선명한 그림)으로 잰다 — 흐린 미리보기 동안의 덮기는 「흐린 미리보기만으로도 빈틈 없이」 시험이 따로 잰다
  await expect(page.locator(".cloudcover")).toHaveAttribute("data-sharp", "1");
  // 겹쳐 나타나는 0.2 초 전환은 끝 모습으로 건너뛴다 — 부하 걸린 WebKit 은 전환이 중간(투명도 0.36 · 0.43)에서
  // 5 초 넘게 멈춘 적이 있다(10-19 클라우드 세션). 재는 것은 전환이 끝난 모습의 빈틈이다
  await page.addStyleTag({
    content: ".cloudcover-sharp{transition:none!important}",
  });
  await expect
    .poll(() =>
      page
        .locator(".cloudcover-sharp")
        .first()
        .evaluate((e) => getComputedStyle(e).opacity),
    )
    .toBe("1");
}

test("여러 화면비에서 빈틈 없이 덮는다", async ({ page }) => {
  test.setTimeout(90_000);
  const gaps: string[] = [];
  const seen: string[] = [];
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openSky(page);
    const g = await gapRatio(page);
    seen.push(`${size.name} ${(g * 100).toFixed(3)}%`);
    if (g > GAP_LIMIT) gaps.push(`${size.name} ${(g * 100).toFixed(3)}%`);
  }
  console.log("빈틈:", seen.join(" · "));
  expect(gaps).toEqual([]);
});

test("흐린 미리보기만으로도 빈틈 없이 덮는다(선명한 그림을 붙잡아 둔 채)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route("**/*.webp", () => undefined); // 끝내 안 줌 — 흐린 미리보기만 남는다
  const gaps: string[] = [];
  const seen: string[] = [];
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(SKY, { waitUntil: "domcontentloaded" });
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
    seen.push(`${size.name} ${(g * 100).toFixed(3)}%`);
    if (g > BLUR_GAP_LIMIT) gaps.push(`${size.name} ${(g * 100).toFixed(3)}%`);
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
  await page.goto(SKY, { waitUntil: "domcontentloaded" });
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

test("동작 줄이기도 첫 화면부터 구름 — 덮개가 뜬 뒤 곧바로(크롬 0.15 초 · WebKit 0.26 초 안) 구름 그림이 풀려 보인다", async ({
  page,
  browserName,
}) => {
  await watchBlurShown(page);
  await page.goto("/?nomap=1&reduced=1&fresh=1&hang=1");
  const after = await blurShownAfter(page);
  // 문턱(잰 값 · 10-19 · rAF 로 잴 때 정함): 크롬 33 ms → 150 · CI WebKit 183 ~ 190 ms → 260 · DOM 변화 · load 로 재면 둘 다 0.09 초 안 —
  // 가르려는 것은 예전의 0.3 초 넘는 흰 바탕(선명한 그림 해독 · Suspense 모음)이 없는가
  expect(after).toBeLessThan(browserName === "chromium" ? 150 : 260);
});

// 줄인 펴짐도 시안 a 의 차례(가운데에서 멀수록 늦게 · lag)를 쓴다 — animation-delay 차례로 잰다
test("펴지기는 가운데 구름부터(가운데에서 멀수록 늦게 출발)", async ({
  page,
}) => {
  await page.goto("/?nomap=1&delay=800&fresh=1&reduced=1");
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
