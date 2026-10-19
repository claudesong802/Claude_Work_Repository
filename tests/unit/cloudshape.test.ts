import { describe, expect, it } from "vitest";
import {
  ART,
  buildClouds,
  CENTER_FIRST_LAG,
  centerDistance,
} from "../../src/cover/cloudshape";

// 동작 줄이기(B+) 덮개의 구름 배치 · 줄인 펴짐 방향. 시안 a · b · c · 하늘 결 견줌은 10-19 영상 방식으로 정하며 걷었다(배치는 하늘 mid 하나).
const clouds = buildClouds();

describe("덮기 배치", () => {
  it("구름 14 ~ 17 장 · 여섯 그림을 모두 쓴다 · 그림 비율은 원본 그대로", () => {
    expect(clouds.length).toBeGreaterThanOrEqual(14);
    expect(clouds.length).toBeLessThanOrEqual(17);
    expect(new Set(clouds.map((c) => c.art)).size).toBe(
      Object.keys(ART).length,
    );
    for (const c of clouds)
      expect(c.ratio).toBeCloseTo(ART[c.art].h / ART[c.art].w, 6);
  });

  it("같은 그림이 나란히 반복돼 보이지 않게 — 같은 그림끼리는 멀리, 또는 뒤집기 · 돌리기가 다르게", () => {
    for (let i = 0; i < clouds.length; i++) {
      for (let j = i + 1; j < clouds.length; j++) {
        const a = clouds[i];
        const b = clouds[j];
        if (a.art !== b.art) continue;
        const far = Math.hypot(a.x - b.x, a.y - b.y) > 30;
        const varied = a.flip !== b.flip || a.rot !== b.rot;
        expect(far && varied, `${a.art} #${a.id} · #${b.id}`).toBe(true);
      }
    }
  });

  it("구름 가장자리가 화면 위 · 아래 · 왼쪽 · 오른쪽 끝을 넘는다(가로 화면 기준 — 세로 화면은 vmax 라 더 크다)", () => {
    expect(Math.min(...clouds.map((c) => c.x - c.w / 2))).toBeLessThan(0);
    expect(Math.max(...clouds.map((c) => c.x + c.w / 2))).toBeGreaterThan(100);
    expect(
      Math.min(...clouds.map((c) => c.y - (c.w * c.ratio) / 2)),
    ).toBeLessThan(0);
    expect(
      Math.max(...clouds.map((c) => c.y + (c.w * c.ratio) / 2)),
    ).toBeGreaterThan(100);
  });
});

describe("줄인 펴짐 방향", () => {
  it("가운데 구름부터 먼저(가운데에서 멀수록 늦게 출발) · 늦게 출발하는 몫은 CENTER_FIRST_LAG 안", () => {
    const byDist = [...clouds].sort(
      (p, q) => centerDistance(p.x, p.y) - centerDistance(q.x, q.y),
    );
    for (let i = 1; i < byDist.length; i++)
      expect(byDist[i].part.lag).toBeGreaterThanOrEqual(byDist[i - 1].part.lag);
    for (const c of clouds) {
      expect(c.part.lag).toBeGreaterThanOrEqual(0);
      expect(c.part.lag).toBeLessThanOrEqual(CENTER_FIRST_LAG);
    }
  });

  it("화면 중심에서 구름 자리 쪽으로 · 화면 가운데 구름 하나만 제자리", () => {
    let still = 0;
    for (const c of clouds) {
      const dx = parseFloat(c.part.dx);
      const dy = parseFloat(c.part.dy);
      if (dx === 0 && dy === 0) {
        still++;
        expect(centerDistance(c.x, c.y)).toBeLessThan(0.15);
        continue;
      }
      expect(dx * (c.x - 50) + dy * (c.y - 50)).toBeGreaterThan(0);
    }
    expect(still).toBe(1);
  });
});
