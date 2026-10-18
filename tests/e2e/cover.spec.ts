import { expect, test, type Page } from "@playwright/test";
import { measureSpread } from "./spread";

// 덮개 갈래 시험 — nomap=1 이면 지도 없이 시계로만 준비 신호를 낸다(망 · WebGL 에 기대지 않게).
// 시연 덮개는 영상 덮개(VideoCloudCover · 사용자 10-19 영상 방식 선택) 하나 — 첫 접속 · 두 번째는 영상, 동작 줄이기만 구름 조각(CloudCover).
const cover = (page: Page) => page.locator(".cloudcover");
/** 동작 줄이기 펴지기 길이(coverclock.REDUCED_PART_MS 와 같은 값) */
const REDUCED_PART = 600;
const phase = (page: Page) => cover(page).getAttribute("data-phase");
/** 영상 덮개 첫 접속은 준비 뒤 기다림 영상 한 바퀴 끝(최대 2.4 초 + 여유 0.3 초)에서 걷힘(0.8 초)으로 잇는다 — 그만큼 넉넉히 */
const LOOP_SLACK = 3000;

/** 펴지기 동안 매 프레임 document.getAnimations() 의 키프레임 속성을 모은다 */
function partAnimationProps(page: Page) {
  // 화면 갱신(rAF)에만 기대면 WebKit 은 펴지는 동안 rAF 를 한 번도 안 돌려 잴 기회가 0 이었다(10-19 CI) —
  // data-phase 가 바뀌는 순간(MutationObserver)에도 잰다. getAnimations() 가 스타일을 갱신하므로 그 자리에서 새 애니메이션이 보인다.
  return page.evaluate(
    () =>
      new Promise<{ props: string[]; samples: number }>((resolve) => {
        const props = new Set<string>();
        const meta = new Set([
          "offset",
          "easing",
          "composite",
          "computedOffset",
        ]);
        let samples = 0;
        let done = false;
        const sample = () => {
          if (done) return;
          const el = document.querySelector<HTMLElement>(".cloudcover");
          if (!el) {
            done = true;
            mo.disconnect();
            return resolve({ props: [...props], samples });
          }
          if (el.dataset.phase === "part") {
            samples++;
            for (const a of document.getAnimations()) {
              const effect = a.effect as KeyframeEffect | null;
              for (const k of effect?.getKeyframes() ?? [])
                for (const p of Object.keys(k)) if (!meta.has(p)) props.add(p);
            }
          }
        };
        const mo = new MutationObserver(sample);
        mo.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-phase"],
        });
        const tick = () => {
          sample();
          if (!done) requestAnimationFrame(tick);
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

test("준비 뒤 펴지기가 시작되고 다 펴지면 DOM 에서 빠진다", async ({
  page,
}) => {
  await page.goto("/?nomap=1&delay=1500&fresh=1");
  await page.waitForTimeout(900);
  expect(await phase(page)).toBe("draw");
  await expect(cover(page)).toHaveAttribute("data-phase", "part", {
    timeout: 3000 + LOOP_SLACK,
  });
  await expect(cover(page)).toHaveAttribute("data-reason", "ready");
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
  // 지도 자리를 누르면 덮개가 아니라 지도가 받는다
  const top = await page.evaluate(() =>
    document
      .elementFromPoint(innerWidth / 2, innerHeight / 2)
      ?.closest(".cloudcover"),
  );
  expect(top).toBeNull();
});

test("서버 준비 중 note 가 보이고, 끝나야 펴진다", async ({ page }) => {
  await page.goto("/?nomap=1&warm=1500&fresh=1");
  await expect(page.getByText("서버 준비 중")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await phase(page)).toBe("draw");
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 + LOOP_SLACK });
});

test("상한이 지나면 준비 신호 없이도 펴진다", async ({ page }) => {
  await page.goto("/?nomap=1&hang=1&cap=1500&fresh=1");
  await page.waitForTimeout(1000);
  expect(await phase(page)).toBe("draw");
  await expect(cover(page)).toHaveAttribute("data-reason", "cap", {
    timeout: 3000,
  });
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 + LOOP_SLACK });
});

test("같은 창 두 번째(새로고침)는 펴지기만 짧게", async ({ page }) => {
  await page.goto("/?nomap=1&fresh=1");
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 + LOOP_SLACK });
  // 덮개가 선 때 → 펴지기 시작을 DOM 변화로 잰다 — 벽시계로 끝까지 재면 걷힘 영상 받기(0.2 ~ 0.7 초)와
  // WebKit 이 걷힘 영상 ended 를 빠뜨릴 때의 안전 시간(1.8 초)까지 섞였다(10-19 클라우드 세션 잼)
  await page.addInitScript(() => {
    const w = window as unknown as { __at: Record<string, number> };
    w.__at = {};
    new MutationObserver(() => {
      const p = document.querySelector<HTMLElement>(".cloudcover")?.dataset
        .phase;
      if (p && !(p in w.__at)) w.__at[p] = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await page.goto("/?nomap=1");
  await expect(cover(page)).toHaveAttribute("data-mode", "short");
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
  const at = await page.evaluate(
    () => (window as unknown as { __at: Record<string, number> }).__at,
  );
  // 첫 접속의 최소 보임(0.6 초) · 바퀴 끝 기다림이 없다 — 곧바로 펴진다
  expect(at.part - at.draw).toBeLessThan(400);
});

// 동작 줄이기(B+ · 사용자 10-19 「권장하는 방향대로」): 구름은 보이되 흐름 없이, 준비되면 가운데부터 조금만 벌어지며 옅어진다 —
// 큰 확대 · 날아가는 움직임은 없다(그 설정이 막으려는 것). 첫 접속이 영상이 되어 「크게」 대조는 없다 —
// 재기가 가르는지는 뮤테이션(줄인 펴짐을 크게 · 옅어지기만)으로 보였다(PR 보고 표)
test("동작 줄이기(주소 칸)면 구름은 보이고, 펴질 때 조금만 벌어지며 옅어진다(transform · opacity 뿐)", async ({
  page,
}) => {
  // 준비 신호는 구름 그림이 다 뜬 뒤에(느린 CI WebKit 은 해독이 1.2 초를 넘겨 구름 없이 펴지기가 시작된 적이 있다 — 그러면 잴 조각이 없다)
  await page.goto("/?nomap=1&reduced=1&fresh=1&delay=2500");
  await expect(cover(page)).toHaveAttribute("data-mode", "reduced");
  await expect(cover(page)).toHaveAttribute("data-shown", "1", {
    timeout: 5000,
  });
  await expect(page.locator(".cloudcover-piece").first()).toBeVisible();
  const [{ props, samples }, spread] = await Promise.all([
    partAnimationProps(page),
    measureSpread(page, REDUCED_PART),
  ]);
  expect(samples).toBeGreaterThan(0);
  for (const p of props) expect(["transform", "opacity"]).toContain(p);
  expect(spread.pieces).toBeGreaterThan(0);
  expect(spread.shift).toBeGreaterThan(0.005); // 벌어지기는 한다(옅어지기만이 아님)
  expect(spread.shift).toBeLessThan(0.1); // 화면 긴 변의 10 % 안쪽
  expect(spread.grow).toBeLessThan(1.1); // 크게 확대하지 않는다
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
});

test("동작 줄이기(prefers-reduced-motion)도 같은 갈래 · 기다리는 동안 구름이 흐르지 않는다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?nomap=1&fresh=1&hang=1");
  await expect(cover(page)).toHaveAttribute("data-mode", "reduced");
  await expect(page.locator(".cloudcover-piece").first()).toBeVisible();
  // 「흐르지 않는다」 = 위치 · 크기를 바꾸는 애니메이션이 없다(선명한 그림이 겹쳐 나타나는 투명도 전환은 움직임이 아니다)
  const moving = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => {
        const e = a.effect as KeyframeEffect | null;
        if (
          !(e?.target instanceof Element) ||
          !e.target.closest(".cloudcover-piece")
        )
          return false;
        return e
          .getKeyframes()
          .some((k) => "transform" in k || "translate" in k || "scale" in k);
      }).length,
  );
  expect(moving).toBe(0);
});

test("기기가 동작 줄이기여도 motion=full 이면 첫 접속 모습(시연 확인용)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?nomap=1&fresh=1&delay=800&motion=full");
  await expect(cover(page)).toHaveAttribute("data-mode", "full");
  await expect(
    page.locator('.cloudcover video[data-role="wait"]'),
  ).toHaveCount(1);
  await expect(page.locator(".cloudcover-piece")).toHaveCount(0);
});
