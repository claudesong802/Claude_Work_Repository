import { expect, test, type Page } from "@playwright/test";
import { measureSpread } from "./spread";

// 덮개 갈래 시험 — nomap=1 이면 지도 없이 시계로만 준비 신호를 낸다(망 · WebGL 에 기대지 않게).
const cover = (page: Page) => page.locator(".cloudcover");
/** 동작 줄이기 펴지기 길이(coverclock.REDUCED_PART_MS 와 같은 값) */
const REDUCED_PART = 600;
const phase = (page: Page) => cover(page).getAttribute("data-phase");

/** 펴지기 동안 매 프레임 document.getAnimations() 의 키프레임 속성을 모은다 */
function partAnimationProps(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ props: string[]; samples: number }>((resolve) => {
        const props = new Set<string>();
        const meta = new Set(["offset", "easing", "composite", "computedOffset"]);
        let samples = 0;
        const tick = () => {
          const el = document.querySelector<HTMLElement>(".cloudcover");
          if (!el) return resolve({ props: [...props], samples });
          if (el.dataset.phase === "part") {
            samples++;
            for (const a of document.getAnimations()) {
              const effect = a.effect as KeyframeEffect | null;
              for (const k of effect?.getKeyframes() ?? []) for (const p of Object.keys(k)) if (!meta.has(p)) props.add(p);
            }
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}


test("준비 전에는 덮개가 남는다", async ({ page }) => {
  await page.goto("/?nomap=1&hang=1&fresh=1");
  await expect(cover(page)).toBeVisible();
  await page.waitForTimeout(2500);
  expect(await phase(page)).toBe("draw");
  await expect(cover(page)).toHaveAttribute("data-mode", "full");
});

test("준비 뒤 펴지기가 시작되고 다 펴지면 DOM 에서 빠진다", async ({ page }) => {
  await page.goto("/?nomap=1&delay=1500&fresh=1");
  await page.waitForTimeout(900);
  expect(await phase(page)).toBe("draw");
  await expect(cover(page)).toHaveAttribute("data-phase", "part", { timeout: 3000 });
  await expect(cover(page)).toHaveAttribute("data-reason", "ready");
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
  // 지도 자리를 누르면 덮개가 아니라 지도가 받는다
  const top = await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(".cloudcover"));
  expect(top).toBeNull();
});

test("서버 준비 중 note 가 보이고, 끝나야 펴진다", async ({ page }) => {
  await page.goto("/?nomap=1&warm=1500&fresh=1");
  await expect(page.getByText("서버 준비 중")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await phase(page)).toBe("draw");
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 });
});

test("상한이 지나면 준비 신호 없이도 펴진다", async ({ page }) => {
  await page.goto("/?nomap=1&hang=1&cap=1500&fresh=1");
  await page.waitForTimeout(1000);
  expect(await phase(page)).toBe("draw");
  await expect(cover(page)).toHaveAttribute("data-reason", "cap", { timeout: 3000 });
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
});

test("같은 창 두 번째(새로고침)는 펴지기만 짧게", async ({ page }) => {
  await page.goto("/?nomap=1&fresh=1");
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 });
  await page.goto("/?nomap=1");
  await expect(cover(page)).toHaveAttribute("data-mode", "short");
  const t0 = Date.now();
  await expect(cover(page)).toHaveCount(0, { timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(1500);
});

// 동작 줄이기(B+ · 사용자 10-19 「권장하는 방향대로」): 구름은 보이되 흐름 없이, 준비되면 가운데부터 조금만 벌어지며 옅어진다 —
// 큰 확대 · 날아가는 움직임은 없다(그 설정이 막으려는 것). 양쪽을 잰다: 동작 줄이기는 작게 · 첫 접속은 크게
test("동작 줄이기(주소 칸)면 구름은 보이고, 펴질 때 조금만 벌어지며 옅어진다(transform · opacity 뿐)", async ({ page }) => {
  await page.goto("/?nomap=1&reduced=1&fresh=1&delay=800");
  await expect(cover(page)).toHaveAttribute("data-mode", "reduced");
  await expect(page.locator(".cloudcover-piece").first()).toBeVisible();
  const [{ props, samples }, spread] = await Promise.all([partAnimationProps(page), measureSpread(page, REDUCED_PART)]);
  expect(samples).toBeGreaterThan(0);
  for (const p of props) expect(["transform", "opacity"]).toContain(p);
  expect(spread.pieces).toBeGreaterThan(0);
  expect(spread.shift).toBeGreaterThan(0.005); // 벌어지기는 한다(옅어지기만이 아님)
  expect(spread.shift).toBeLessThan(0.1); // 화면 긴 변의 10 % 안쪽
  expect(spread.grow).toBeLessThan(1.1); // 크게 확대하지 않는다
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
});

test("첫 접속(견줌)은 크게 벌어진다 — 위 「작게」 가 재는 값이 실제로 가르는지", async ({ page }) => {
  await page.goto("/?nomap=1&fresh=1&delay=800&design=a&motion=full");
  await expect(cover(page)).toHaveAttribute("data-mode", "full");
  const spread = await measureSpread(page, 600);
  expect(Math.max(spread.shift, spread.grow - 1)).toBeGreaterThan(0.2);
});

test("동작 줄이기(prefers-reduced-motion)도 같은 갈래 · 기다리는 동안 구름이 흐르지 않는다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?nomap=1&fresh=1&hang=1");
  await expect(cover(page)).toHaveAttribute("data-mode", "reduced");
  await expect(page.locator(".cloudcover-piece").first()).toBeVisible();
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target instanceof Element && (a.effect as KeyframeEffect).target!.closest(".cloudcover-piece")).length,
  );
  expect(running).toBe(0);
});

test("기기가 동작 줄이기여도 motion=full 이면 첫 접속 모습(시연 확인용)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?nomap=1&fresh=1&delay=800&motion=full");
  await expect(cover(page)).toHaveAttribute("data-mode", "full");
  await expect(page.locator(".cloudcover-piece").first()).toBeVisible();
});

for (const design of ["a", "b", "c"]) {
  test(`시안 ${design}: 펴지기 동안 애니메이션은 transform · opacity 뿐`, async ({ page }) => {
    // 기다림 흐름이 도는 도중(1.2 초)에 펴지게 한다
    await page.goto(`/?nomap=1&delay=1200&fresh=1&design=${design}`);
    await expect(cover(page)).toHaveAttribute("data-design", design);
    const { props, samples } = await partAnimationProps(page);
    expect(samples).toBeGreaterThan(0);
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) expect(["transform", "opacity"]).toContain(p);
  });
}

test("두 번째 짧은 판도 펴지기 동안 transform · opacity 뿐", async ({ page }) => {
  await page.goto("/?nomap=1&fresh=1");
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 });
  await page.goto("/?nomap=1&delay=400");
  await expect(cover(page)).toHaveAttribute("data-mode", "short");
  const { props, samples } = await partAnimationProps(page);
  expect(samples).toBeGreaterThan(0);
  for (const p of props) expect(["transform", "opacity"]).toContain(p);
});
