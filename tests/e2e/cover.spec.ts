import { expect, test, type Page } from "@playwright/test";
import { measureSpread } from "./spread";

// 덮개 갈래 시험 — nomap=1 이면 지도 없이 시계로만 준비 신호를 낸다(망 · WebGL 에 기대지 않게).
// 덮개는 구름 조각 덮개(CloudCover · B+) 하나 — 사용자 10-19 「모두 B+, 영상은 빼기」. 기기 「동작 줄이기」 는 갈래를 바꾸지 않는다.
const cover = (page: Page) => page.locator(".cloudcover");
/** 펴지기 길이(coverclock PART_MS · SHORT_PART_MS 와 같은 값) */
const PART = 600;
const SHORT_PART = 400;
const phase = (page: Page) => cover(page).getAttribute("data-phase");
const partMsOf = (page: Page) =>
  cover(page).evaluate((e) =>
    parseFloat(
      (e as HTMLElement).style.getPropertyValue("--cloudcover-part-ms"),
    ),
  );

/** 덮개 data-phase 가 처음 바뀐 시각(페이지 연 때부터 ms)을 남긴다 — page.goto 앞에 부른다 */
async function recordPhases(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __at: Record<string, number> };
    w.__at = {};
    new MutationObserver(() => {
      const p = document.querySelector<HTMLElement>(".cloudcover")?.dataset
        .phase;
      if (p && !(p in w.__at)) w.__at[p] = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}
const phaseTimes = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __at: Record<string, number> }).__at,
  );

/** 「조금만 벌어지며 옅어진다」 — 펴지기 동안 transform · opacity 뿐 · 중심 이동 0.5 % ~ 화면 긴 변 10 % · 크기 < 1.1 */
async function expectSoftPart(page: Page, partMs: number) {
  const [{ props, samples }, spread] = await Promise.all([
    partAnimationProps(page),
    measureSpread(page, partMs),
  ]);
  expect(samples).toBeGreaterThan(0);
  for (const p of props) expect(["transform", "opacity"]).toContain(p);
  expect(spread.pieces).toBeGreaterThan(0);
  expect(spread.shift).toBeGreaterThan(0.005); // 벌어지기는 한다(옅어지기만이 아님)
  expect(spread.shift).toBeLessThan(0.1); // 화면 긴 변의 10 % 안쪽
  expect(spread.grow).toBeLessThan(1.1); // 크게 확대하지 않는다
}

/** 기다리는 동안 위치 · 크기를 바꾸는 애니메이션 수(선명한 그림이 겹쳐 나타나는 투명도 전환은 움직임이 아니다) */
const movingAnimations = (page: Page) =>
  page.evaluate(
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
    timeout: 3000,
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
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 });
});

test("상한이 지나면 준비 신호 없이도 펴진다", async ({ page }) => {
  await page.goto("/?nomap=1&hang=1&cap=1500&fresh=1");
  await page.waitForTimeout(1000);
  expect(await phase(page)).toBe("draw");
  await expect(cover(page)).toHaveAttribute("data-reason", "cap", {
    timeout: 3000,
  });
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
});

// B+(사용자 10-19 「모두 B+」): 구름은 흐름 없이 보이고, 준비되면 가운데부터 조금만 벌어지며 옅어진다 — 큰 확대 · 날아가는 움직임은 없다.
// 「크게」 와 견주는 대조 갈래가 없으므로 재기가 가르는지는 뮤테이션(크게 벌어짐 · 옅어지기만)으로 보였다(PR 보고 표)
for (const media of ["no-preference", "reduce"] as const) {
  test(`첫 접속(기기 동작 줄이기 ${media === "reduce" ? "켬" : "끔"}): 같은 B+ 갈래 · 기다리는 동안 흐르지 않고, 펴질 때 조금만 벌어지며 옅어진다`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: media });
    await page.goto("/?nomap=1&fresh=1&delay=1500");
    await expect(cover(page)).toHaveAttribute("data-mode", "full");
    await expect(page.locator(".cloudcover-piece").first()).toBeVisible();
    expect(await movingAnimations(page)).toBe(0);
    expect(await partMsOf(page)).toBe(PART);
    await expectSoftPart(page, PART);
    await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
  });
}

test("같은 창 두 번째(새로고침)는 같은 꼴을 짧게 — 최소 보임 없이 곧바로 · 펴짐 0.4 초 · 조금만 벌어지며", async ({
  page,
}) => {
  await page.goto("/?nomap=1&fresh=1");
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 });
  await recordPhases(page);
  await page.goto("/?nomap=1&delay=300");
  await expect(cover(page)).toHaveAttribute("data-mode", "short");
  expect(await partMsOf(page)).toBe(SHORT_PART);
  await expectSoftPart(page, SHORT_PART);
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
  const at = await phaseTimes(page);
  // 준비 신호(0.3 초) 곧바로 — 첫 접속의 최소 보임(0.4 초)이 없다
  expect(at.part - at.draw).toBeLessThan(300 + 250);
});

test("영상은 받지 않는다 — 첫 접속 · 두 번째 모두 영상 요청 · video 요소 0", async ({
  page,
}) => {
  const media: string[] = [];
  page.on("request", (r) => {
    if (/\.(webm|mp4|mov)(\?|$)|\/poster[^/]*\.webp/.test(r.url()))
      media.push(r.url());
  });
  await page.goto("/?nomap=1&fresh=1&delay=300");
  await expect(cover(page)).toHaveCount(0, { timeout: 4000 });
  await page.goto("/?nomap=1&delay=300");
  await expect(cover(page)).toHaveAttribute("data-mode", "short");
  expect(await page.locator("video").count()).toBe(0);
  await expect(cover(page)).toHaveCount(0, { timeout: 3000 });
  expect(media).toEqual([]);
});
