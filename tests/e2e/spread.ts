// e2e 공통 도우미(시험 파일이 아님 — 시험 파일끼리 서로 import 하면 시험이 두 번 등록된다)
import type { Page } from "@playwright/test";

/**
 * 펴지기가 시작될 때의 구름 조각 위치 · 크기를 기준으로, 펴지는 동안 매 프레임(그리고 16 ms 마다) 다시 재서 가장 큰 값을 돌려준다 —
 * shift = 가장 많이 움직인 조각의 중심 이동 / 화면 긴 변 · grow = 가장 많이 커진 조각의 너비 배율.
 * 한 시점만 재면 느린 CI WebKit 에서 애니메이션 시작이 늦어 0 이 나온 적이 있다(10-19) — 펴지기 끝(덮개가 빠짐)까지 재고, partMs × 3 에서 끊는다.
 */
export function measureSpread(page: Page, partMs: number) {
  return page.evaluate(
    (partMs) =>
      new Promise<{ shift: number; grow: number; pieces: number }>(
        (resolve) => {
          const rects = () =>
            [
              ...document.querySelectorAll<HTMLElement>(".cloudcover-piece"),
            ].map((el) => el.getBoundingClientRect());
          let base: DOMRect[] | null = null;
          let shift = 0;
          let grow = 1;
          let ended = false;
          const sample = () => {
            const el = document.querySelector<HTMLElement>(".cloudcover");
            if (!base) {
              if (el && el.dataset.phase === "part") base = rects();
              return;
            }
            if (!el) return finish();
            const now = rects();
            const side = Math.max(window.innerWidth, window.innerHeight);
            base.forEach((r, i) => {
              const q = now[i];
              if (!q) return;
              shift = Math.max(
                shift,
                Math.hypot(
                  q.x + q.width / 2 - (r.x + r.width / 2),
                  q.y + q.height / 2 - (r.y + r.height / 2),
                ) / side,
              );
              grow = Math.max(grow, q.width / r.width);
            });
          };
          const finish = () => {
            if (ended) return;
            ended = true;
            clearInterval(iv);
            resolve({ shift, grow, pieces: base?.length ?? 0 });
          };
          const iv = setInterval(sample, 16);
          const raf = () => {
            if (ended) return;
            sample();
            requestAnimationFrame(raf);
          };
          requestAnimationFrame(raf);
          // 기준을 잡은 뒤 partMs × 3 이면 끊는다(덮개가 안 빠져도)
          const stopper = setInterval(() => {
            if (base) {
              clearInterval(stopper);
              setTimeout(finish, partMs * 3);
            }
          }, 16);
        },
      ),
    partMs,
  );
}
