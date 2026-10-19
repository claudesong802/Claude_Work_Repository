// e2e 공통 도우미(시험 파일이 아님 — 시험 파일끼리 서로 import 하면 시험이 두 번 등록된다)
import { expect, type Page } from "@playwright/test";

/**
 * 펴지기가 시작되면 구름 조각의 애니메이션을 멈추고(pause) 시점을 0 과 partMs × 0.85 로 옮겨 위치 · 크기를 견준다 —
 * shift = 가장 많이 움직인 조각의 중심 이동 / 화면 긴 변 · grow = 가장 많이 커진 조각의 너비 배율.
 * 벽시계로 두 번 재면 WebKit 은 펴지는 동안 타이머 · rAF 가 밀려 두 번째 잼이 덮개가 빠진 뒤에 돌았다(0 · 10-19 클라우드 세션 진단) —
 * 시점을 옮겨 재면 시간과 상관없다. 재고 나면 다시 튼다.
 */
export function measureSpread(page: Page, partMs: number) {
  return page.evaluate(
    (partMs) =>
      new Promise<{ shift: number; grow: number; pieces: number }>(
        (resolve) => {
          const wait = () => {
            const el = document.querySelector<HTMLElement>(".cloudcover");
            if (!el) return resolve({ shift: 0, grow: 1, pieces: 0 });
            const pieces = [
              ...el.querySelectorAll<HTMLElement>(".cloudcover-piece"),
            ];
            const anims = pieces.flatMap((p) => p.getAnimations());
            if (el.dataset.phase !== "part" || anims.length === 0)
              return void setTimeout(wait, 5);
            anims.forEach((a) => a.pause());
            const at = (ms: number) => {
              anims.forEach((a) => (a.currentTime = ms));
              return pieces.map((p) => p.getBoundingClientRect());
            };
            const a0 = at(0);
            const a1 = at(partMs * 0.85);
            const side = Math.max(window.innerWidth, window.innerHeight);
            let shift = 0;
            let grow = 1;
            a0.forEach((r, i) => {
              const q = a1[i];
              shift = Math.max(
                shift,
                Math.hypot(
                  q.x + q.width / 2 - (r.x + r.width / 2),
                  q.y + q.height / 2 - (r.y + r.height / 2),
                ) / side,
              );
              grow = Math.max(grow, q.width / r.width);
            });
            anims.forEach((a) => a.play());
            resolve({ shift, grow, pieces: pieces.length });
          };
          wait();
        },
      ),
    partMs,
  );
}

/**
 * 덮개가 뜬 때부터 흐린 미리보기 구름 그림이 풀린 때까지(ms)를 남긴다 — page.goto 앞에 부른다.
 * 화면 갱신(rAF)으로 재면 WebKit 은 부하가 걸리면 첫 rAF 자체가 0.33 ~ 0.56 초 늦게 돌아(그림은 이미 풀려 있어도) 문턱을 넘었다
 * (10-19 클라우드 세션 잼 · 같은 때 DOM 변화 · load 기준은 0.09 초 안) — DOM 변화(MutationObserver)와 load 이벤트로 잰다.
 * 흐린 미리보기가 없거나 덮개가 늦게 뜨면(바탕만 있는 덮개가 먼저 섬) 그 차이가 그대로 잡힌다.
 */
export async function watchBlurShown(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shownAfter: number | null };
    w.__shownAfter = null;
    let coverAt: number | null = null;
    const check = () => {
      if (w.__shownAfter !== null) return;
      if (coverAt === null && document.querySelector(".cloudcover"))
        coverAt = performance.now();
      const img = document.querySelector<HTMLImageElement>(".cloudcover-blur");
      if (coverAt !== null && img && img.complete && img.naturalWidth > 0)
        w.__shownAfter = performance.now() - coverAt;
    };
    new MutationObserver(check).observe(document, {
      subtree: true,
      childList: true,
    });
    document.addEventListener("load", check, true);
  });
}

/** watchBlurShown 이 잰 값 — 나올 때까지 기다린다 */
export async function blurShownAfter(page: Page): Promise<number> {
  const read = () =>
    page.evaluate(
      () => (window as unknown as { __shownAfter: number | null }).__shownAfter,
    );
  await expect.poll(read).not.toBeNull();
  return (await read())!;
}
