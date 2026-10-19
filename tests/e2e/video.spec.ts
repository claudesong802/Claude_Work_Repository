import { expect, test, type Page } from "@playwright/test";
import { blurShownAfter, measureSpread, watchBlurShown } from "./spread";

// 영상 덮개 시험(시연 기본 덮개 · 사용자 10-19 영상 방식 선택) — nomap=1 이면 지도 없이 시계로만 준비 신호를 낸다.
// 형식은 엔진으로 고른다: 크롬 = WebM(VP9 알파) · WebKit(사파리 · iPad) = HEVC 알파.
// WebKit 이 HEVC 를 못 틀면(리눅스 CI 등) 첫 장면 그림이 커지며 사라지는 대체 길로 간다 — 그래도 덮개는 걷혀야 한다.
const cover = (page: Page) => page.locator(".cloudcover");

/** 덮개 data-* 가 바뀔 때마다 [시각, 장면] 을 남긴다(페이지 연 때부터 ms) */
async function recordPhases(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __phases: [number, string, string, string][];
    };
    w.__phases = [];
    new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(".cloudcover");
      const row: [number, string, string, string] = [
        performance.now(),
        el?.dataset.phase ?? "gone",
        el?.dataset.swapped ?? "",
        el?.dataset.fallback ?? "",
      ];
      const last = w.__phases.at(-1);
      if (
        !last ||
        last[1] !== row[1] ||
        last[2] !== row[2] ||
        last[3] !== row[3]
      )
        w.__phases.push(row);
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}
const phases = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __phases: [number, string, string, string][] })
        .__phases,
  );

test("영상 덮개: 엔진에 맞는 형식을 고르고, 기다림 → 걷힘 → DOM 에서 빠진다", async ({
  page,
  browserName,
}) => {
  await recordPhases(page);
  await page.goto("/?nomap=1&fresh=1&delay=800");
  await expect(cover(page)).toHaveClass(/cloudcover--video/);
  await expect(cover(page)).toHaveAttribute(
    "data-kind",
    browserName === "webkit" ? "hevc" : "webm",
  );
  await expect(cover(page)).toHaveCount(0, { timeout: 8000 });
  const log = await phases(page);
  const seq = log.map((r) => r[1]);
  expect(seq).toContain("draw");
  expect(seq).toContain("part");
  expect(seq.at(-1)).toBe("gone");
  // 걷힘 영상이 돌았거나(swapped) 못 틀어 그림으로 걷었거나(fallback) — 둘 중 하나는 꼭
  const swapped = log.some((r) => r[2] === "1");
  const fellBack = log.some((r) => r[3] === "1");
  expect(swapped || fellBack).toBe(true);
  // 크롬은 WebM 알파를 틀 수 있다 — 대체 길로 빠지면 틀림
  if (browserName === "chromium") expect(swapped).toBe(true);
});

test("영상 덮개 · 곧바로 잇기: 준비 신호 뒤 곧 걷히고, 바퀴 끝 잇기는 한 바퀴(2.4 초)를 채운다", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "영상 재생 시각은 영상을 확실히 트는 크롬에서만 잰다",
  );
  const partStart = async (q: string) => {
    await recordPhases(page);
    await page.goto(q);
    await expect(cover(page)).toHaveCount(0, { timeout: 8000 });
    const log = await phases(page);
    const drawAt = log.find((r) => r[1] === "draw")![0];
    return log.find((r) => r[1] === "part")![0] - drawAt;
  };
  const now = await partStart(
    "/?switch=now&nomap=1&fresh=1&delay=800",
  );
  const loop = await partStart(
    "/?switch=loop&nomap=1&fresh=1&delay=800",
  );
  expect(now).toBeLessThan(1800);
  expect(loop).toBeGreaterThan(2000);
});

test("영상 덮개 · 동작 줄이기(B+): 영상 대신 구름 조각 덮개로, 조금만 벌어지며 옅어진다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?nomap=1&fresh=1&delay=2500");
  await expect(cover(page)).toHaveAttribute("data-mode", "reduced");
  await expect(page.locator(".cloudcover video")).toHaveCount(0);
  await expect(cover(page)).toHaveAttribute("data-shown", "1", {
    timeout: 5000,
  });
  await expect(page.locator(".cloudcover-piece").first()).toBeVisible();
  const spread = await measureSpread(page, 600);
  expect(spread.pieces).toBeGreaterThan(0);
  expect(spread.shift).toBeGreaterThan(0.005);
  expect(spread.shift).toBeLessThan(0.1);
  expect(spread.grow).toBeLessThan(1.1);
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
});

test("영상 덮개 · 같은 창 두 번째는 짧은 판", async ({ page }) => {
  await page.goto("/?nomap=1&fresh=1&delay=100");
  await expect(cover(page)).toHaveCount(0, { timeout: 8000 });
  await page.goto("/?nomap=1&delay=100");
  await expect(cover(page)).toHaveAttribute("data-mode", "short");
  await expect(page.locator('.cloudcover video[data-role="wait"]')).toHaveCount(
    0,
  );
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
});

/** 두 번째 방문 걷힘 길이 — 0.8 초 걷힘 영상을 1.6 배로 튼 길이(cloudvideo REVEAL_MS / SHORT_RATE) */
const SHORT_REVEAL_MS = 500;

test("영상 덮개 · 두 번째 방문의 걷힘 길이는 실제로 트는 영상 길이(약 0.5 초)", async ({
  page,
}) => {
  // 전엔 timingFor("short") 의 0.3 초가 onPartStart · --cloudcover-part-ms · 안전 시간으로 갔다(10-19)
  await page.goto("/?nomap=1&fresh=1&delay=100");
  await expect(cover(page)).toHaveCount(0, { timeout: 8000 });
  await page.goto("/?nomap=1&hang=1");
  await expect(cover(page)).toHaveAttribute("data-mode", "short");
  const partMs = await cover(page).evaluate((e) =>
    parseFloat((e as HTMLElement).style.getPropertyValue("--cloudcover-part-ms")),
  );
  expect(Math.abs(partMs - SHORT_REVEAL_MS)).toBeLessThanOrEqual(50);
});

test("영상 덮개 · 두 번째 방문: 걷힘 영상의 ended 가 끝내 안 와도 걷힘 길이 + 1.5 초에 걷힌다", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "걷힘 영상을 확실히 트는 크롬에서만 — 못 트는 엔진은 대체 길(0.45 초)로 간다",
  );
  await page.goto("/?nomap=1&fresh=1&delay=100");
  await expect(cover(page)).toHaveCount(0, { timeout: 8000 });
  await page.addInitScript(() => {
    document.addEventListener("ended", (e) => e.stopImmediatePropagation(), true);
    const w = window as unknown as { __at: Record<string, number> };
    w.__at = {};
    new MutationObserver(() => {
      const p =
        document.querySelector<HTMLElement>(".cloudcover")?.dataset.phase ??
        ("part" in w.__at ? "gone" : null);
      if (p && !(p in w.__at)) w.__at[p] = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await page.goto("/?nomap=1&delay=100");
  await expect(cover(page)).toHaveAttribute("data-mode", "short");
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 });
  const at = await page.evaluate(
    () => (window as unknown as { __at: Record<string, number> }).__at,
  );
  // 안전 시간 = 걷힘 길이 0.5 초 + 1.5 초 — 전처럼 0.3 초를 쓰면 1.8 초에 걷혀 아래 문턱에 걸린다
  const waited = at.gone - at.part;
  expect(waited).toBeGreaterThan(SHORT_REVEAL_MS + 1500 - 100);
  expect(waited).toBeLessThan(SHORT_REVEAL_MS + 1500 + 800);
});

test("영상 덮개 · 바퀴 끝 잇기: 기다림 영상의 ended 가 끝내 안 와도 남은 바퀴 + 여유 뒤에 걷힌다", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "기다림 영상을 확실히 트는 크롬에서만 — 못 트는 엔진은 대체 길로 간다",
  );
  // ended 를 붙잡는 브라우저 · 기기 흉내(CI WebKit 에서 덮개가 8 초 넘게 남은 적이 있음 · 10-19)
  await page.addInitScript(() =>
    document.addEventListener(
      "ended",
      (e) => e.stopImmediatePropagation(),
      true,
    ),
  );
  await page.goto("/?switch=loop&nomap=1&fresh=1&delay=500");
  await expect(cover(page)).toHaveAttribute("data-phase", "draw");
  // 한 바퀴 2.4 초 + 여유 1.5 초 + 걷힘 0.8 초(+ 걷힘의 ended 도 막혀 안전 시간 1.5 초) 안쪽
  await expect(cover(page)).toHaveCount(0, { timeout: 9000 });
});

test("영상 덮개 · 동작 줄이기도 첫 화면부터 구름 — 덮개가 뜬 뒤 곧바로(크롬 0.15 초 · WebKit 0.26 초 안) 구름 그림이 풀려 보인다", async ({
  page,
  browserName,
}) => {
  // lazy(Suspense)로 PNG 덮개를 불러올 땐 React 가 약 0.3 초 모아 보여 줘 흰 바탕만 보였다(10-19 잼 310 ms)
  await page.emulateMedia({ reducedMotion: "reduce" });
  await watchBlurShown(page);
  await page.goto("/?nomap=1&fresh=1&hang=1");
  const after = await blurShownAfter(page);
  // 문턱(잰 값 · 10-19 · rAF 로 잴 때 정함): 크롬 33 ms → 150 · CI WebKit 183 ~ 190 ms → 260 · DOM 변화 · load 로 재면 둘 다 0.09 초 안 —
  // 가르려는 것은 예전의 0.3 초 넘는 흰 바탕(선명한 그림 해독 · Suspense 모음)이 없는가
  expect(after).toBeLessThan(browserName === "chromium" ? 150 : 260);
});

test("영상 덮개 · 보통 사용자는 PNG 구름 그림을 받지 않고, 동작 줄이기면 받는다", async ({
  page,
}) => {
  const pngArt: string[] = [];
  page.on("request", (r) => {
    if (
      /\/cloud-(original|wide|billowy|diagonal|wispy|curled)[^/]*\.webp/.test(
        r.url(),
      )
    )
      pngArt.push(r.url());
  });
  await page.goto("/?motion=full&nomap=1&fresh=1&delay=300");
  await expect(cover(page)).toHaveCount(0, { timeout: 8000 });
  expect(pngArt).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // 준비 신호 없이(hang) — delay 로 걷히게 두면 부하 걸린 CI 에서 선명한 그림이 풀리기 전에 덮개가 빠져 data-sharp 를 못 봤다(10-19 클라우드 세션)
  await page.goto("/?nomap=1&fresh=1&hang=1");
  await expect(cover(page)).toHaveAttribute("data-sharp", "1");
  expect(pngArt.length).toBeGreaterThan(0);
});
