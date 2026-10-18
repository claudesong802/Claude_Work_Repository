// e2e 공통 도우미(시험 파일이 아님 — 시험 파일끼리 서로 import 하면 시험이 두 번 등록된다)
import type { Page } from "@playwright/test";

/**
 * 펴지기 시작 때와 펴지기 85 % 시점의 구름 조각 위치 · 크기를 견준다 —
 * shift = 가장 많이 움직인 조각의 중심 이동 / 화면 긴 변 · grow = 가장 많이 커진 조각의 너비 배율
 */
export function measureSpread(page: Page, partMs: number) {
  return page.evaluate(
    (partMs) =>
      new Promise<{ shift: number; grow: number; pieces: number }>((resolve) => {
        const rects = () =>
          [...document.querySelectorAll<HTMLElement>(".cloudcover-piece")].map((el) => el.getBoundingClientRect());
        const wait = () => {
          const el = document.querySelector<HTMLElement>(".cloudcover");
          if (!el || el.dataset.phase !== "part") return requestAnimationFrame(wait);
          const a = rects();
          setTimeout(() => {
            const b = rects();
            const side = Math.max(window.innerWidth, window.innerHeight);
            let shift = 0;
            let grow = 1;
            a.forEach((r, i) => {
              const q = b[i];
              if (!q) return;
              shift = Math.max(shift, Math.hypot(q.x + q.width / 2 - (r.x + r.width / 2), q.y + q.height / 2 - (r.y + r.height / 2)) / side);
              grow = Math.max(grow, q.width / r.width);
            });
            resolve({ shift, grow, pieces: a.length });
          }, partMs * 0.85);
        };
        wait();
      }),
    partMs,
  );
}

