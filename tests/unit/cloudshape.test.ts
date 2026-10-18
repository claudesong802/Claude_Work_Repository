import { describe, expect, it } from "vitest";
import { buildClouds, FIRST_LINE_MS } from "../../src/cover/cloudshape";
import { MIN_SHOW_MS } from "../../src/cover/coverclock";

const firstLines = (design: "a" | "b" | "c") =>
  buildClouds(design).map((c) => c.strokes.find((s) => s.kind === "line")!);

describe("첫 장면", () => {
  for (const design of ["a", "b", "c"] as const) {
    it(`시안 ${design}: 구름 서너 장의 첫 윤곽이 0.6 초 안에 다 그려진다`, () => {
      const lines = firstLines(design);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.length).toBeLessThanOrEqual(4);
      for (const s of lines) expect(s.delayMs + s.durMs).toBeLessThanOrEqual(MIN_SHOW_MS);
    });

    it(`시안 ${design}: 첫 윤곽은 시차를 두되 동시에 그려진다(하나씩 차례로가 아님)`, () => {
      const lines = firstLines(design);
      const starts = lines.map((s) => s.delayMs);
      expect(new Set(starts).size).toBe(lines.length);
      // 마지막 것이 시작할 때 첫 것이 아직 그리는 중
      expect(Math.max(...starts)).toBeLessThan(Math.min(...lines.map((s) => s.delayMs + s.durMs)));
    });

    it(`시안 ${design}: 흰 채움은 제 윤곽이 거의 다 그려진 뒤, 0.6 초 안에 나타난다`, () => {
      for (const c of buildClouds(design)) {
        const line = c.strokes.find((s) => s.kind === "line")!;
        expect(c.fillAtMs).toBeGreaterThan(line.delayMs);
        expect(c.fillAtMs).toBeLessThan(MIN_SHOW_MS);
      }
    });
  }

  it("로딩이 길면 구름을 늘리지 않고 같은 구름에 덧선 · 빗금을 더한다", () => {
    for (const c of buildClouds("a")) {
      const later = c.strokes.filter((s) => s.delayMs >= MIN_SHOW_MS);
      expect(later.some((s) => s.kind === "again")).toBe(true);
      expect(later.some((s) => s.kind === "hatch")).toBe(true);
    }
    expect(buildClouds("a").length).toBe(buildClouds("c").length);
  });

  it("같은 씨앗이면 같은 선(시안이 달라도 모양은 같고 펴지는 꼴만 다르다)", () => {
    const a = buildClouds("a");
    const b = buildClouds("b");
    expect(a.map((c) => c.fill)).toEqual(b.map((c) => c.fill));
    expect(a.map((c) => c.part)).not.toEqual(b.map((c) => c.part));
    expect(FIRST_LINE_MS).toBeLessThan(MIN_SHOW_MS);
  });
});
