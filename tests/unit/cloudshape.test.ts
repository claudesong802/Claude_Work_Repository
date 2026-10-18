import { describe, expect, it } from "vitest";
import { ART, buildClouds, CENTER_FIRST_LAG, centerDistance, type CoverDesign } from "../../src/cover/cloudshape";

const DESIGNS: CoverDesign[] = ["a", "b", "c"];

describe("덮기 배치", () => {
  const clouds = buildClouds("a");

  it("구름 10 ~ 15 번 · 여섯 그림을 모두 쓴다 · 그림 비율은 원본 그대로", () => {
    expect(clouds.length).toBeGreaterThanOrEqual(10);
    expect(clouds.length).toBeLessThanOrEqual(15);
    expect(new Set(clouds.map((c) => c.art)).size).toBe(Object.keys(ART).length);
    for (const c of clouds) expect(c.ratio).toBeCloseTo(ART[c.art].h / ART[c.art].w, 6);
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
    // 가로 화면에서 vmax = 가로 → 구름 너비(가로 %) = w · 높이(세로 %)는 w × 비율 × (가로/세로) ≥ w × 비율
    expect(Math.min(...clouds.map((c) => c.x - c.w / 2))).toBeLessThan(0);
    expect(Math.max(...clouds.map((c) => c.x + c.w / 2))).toBeGreaterThan(100);
    expect(Math.min(...clouds.map((c) => c.y - (c.w * c.ratio) / 2))).toBeLessThan(0);
    expect(Math.max(...clouds.map((c) => c.y + (c.w * c.ratio) / 2))).toBeGreaterThan(100);
  });

  it("기다림 흐름은 몇 px(1 vmax 안) — 크기 변화는 CSS 의 1.00 ~ 1.03", () => {
    for (const c of clouds) {
      expect(Math.abs(c.drift.dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(c.drift.dy)).toBeLessThanOrEqual(1);
      expect(c.drift.periodS).toBeGreaterThanOrEqual(5);
    }
  });

  it("시안이 달라도 배치 · 흐름은 같고 펴지는 꼴만 다르다", () => {
    const c = buildClouds("c");
    expect(c.map(({ part: _p, ...rest }) => rest)).toEqual(clouds.map(({ part: _p, ...rest }) => rest));
    expect(c.map((x) => x.part)).not.toEqual(clouds.map((x) => x.part));
  });
});

describe("펴지기", () => {
  for (const design of ["a", "b"] as const) {
    it(`시안 ${design}: 가운데 구름부터 먼저(가운데에서 멀수록 늦게 출발)`, () => {
      const clouds = buildClouds(design);
      const byDist = [...clouds].sort((p, q) => centerDistance(p.x, p.y) - centerDistance(q.x, q.y));
      for (let i = 1; i < byDist.length; i++) expect(byDist[i].part.lag).toBeGreaterThanOrEqual(byDist[i - 1].part.lag);
      expect(Math.max(...clouds.map((c) => c.part.lag))).toBeLessThanOrEqual(CENTER_FIRST_LAG);
    });

    it(`시안 ${design}: 구름이 약 2 배로 커지며 화면 중심에서 바깥으로 밀려난다 · 가운데 구름은 커지며 사라짐`, () => {
      for (const c of buildClouds(design)) {
        expect(c.part.scale).toBeGreaterThanOrEqual(2);
        if (c.part.opacity === 0) {
          expect(centerDistance(c.x, c.y)).toBeLessThan(0.12);
          continue;
        }
        const dx = parseFloat(c.part.dx);
        const dy = parseFloat(c.part.dy);
        // 옮겨 가는 방향이 가운데 → 구름 자리 방향과 같다
        expect(dx * (c.x - 50) + dy * (c.y - 50)).toBeGreaterThan(0);
      }
      expect(buildClouds(design).some((c) => c.part.opacity === 0)).toBe(true);
    });
  }

  it("시안 c: 가로 띠마다 좌우로 엇갈린다", () => {
    for (const c of buildClouds("c")) expect(c.part.dx.startsWith("-")).toBe(c.row % 2 === 0);
  });

  it("모든 시안: 늦게 출발하는 몫은 펴지기 길이 안", () => {
    for (const d of DESIGNS) for (const c of buildClouds(d)) {
      expect(c.part.lag).toBeGreaterThanOrEqual(0);
      expect(c.part.lag).toBeLessThan(0.5);
    }
  });
});
