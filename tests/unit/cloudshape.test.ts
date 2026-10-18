import { describe, expect, it } from "vitest";
import { BASE_Y, buildClouds, CLOUD_H, CLOUD_W, type CoverDesign } from "../../src/cover/cloudshape";
import { MIN_SHOW_MS } from "../../src/cover/coverclock";

const DESIGNS: CoverDesign[] = ["a", "b", "c", "d"];
const end = (s: { delayMs: number; durMs: number }) => s.delayMs + s.durMs;

/** path d 안의 점들(M · Q 의 끝점) */
function points(d: string): [number, number][] {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

describe("첫 장면(0.6 초)", () => {
  for (const design of DESIGNS) {
    it(`시안 ${design}: 구름 서너 장의 윤곽 · 안쪽 곡선이 0.6 초 안에 다 그려진다`, () => {
      const clouds = buildClouds(design);
      expect(clouds.length).toBeGreaterThanOrEqual(3);
      expect(clouds.length).toBeLessThanOrEqual(4);
      for (const c of clouds) {
        const first = c.strokes.filter((s) => s.kind !== "hatch");
        expect(first.some((s) => s.kind === "line")).toBe(true);
        expect(first.some((s) => s.kind === "inner")).toBe(true);
        for (const s of first) expect(end(s)).toBeLessThanOrEqual(MIN_SHOW_MS);
        expect(c.fillAtMs).toBeLessThan(MIN_SHOW_MS);
      }
    });

    it(`시안 ${design}: 윤곽은 시차를 두되 동시에 그려진다(하나씩 차례로가 아님)`, () => {
      const lines = buildClouds(design).map((c) => c.strokes.find((s) => s.kind === "line")!);
      const starts = lines.map((s) => s.delayMs);
      expect(new Set(starts).size).toBe(lines.length);
      // 마지막 윤곽이 시작할 때 첫 윤곽이 아직 그리는 중
      expect(Math.max(...starts)).toBeLessThan(Math.min(...lines.map(end)));
    });
  }
});

describe("로딩이 길 때", () => {
  const clouds = buildClouds("a");
  const hatches = clouds.flatMap((c) => c.strokes.filter((s) => s.kind === "hatch").map((s) => ({ c, s })));

  it("0.6 초 뒤에 오는 것은 빗금 묶음뿐이고, 구름 수는 그대로", () => {
    for (const c of clouds) for (const s of c.strokes) if (s.delayMs >= MIN_SHOW_MS) expect(s.kind).toBe("hatch");
    expect(hatches.length).toBeGreaterThan(clouds.length);
    for (const d of DESIGNS) expect(buildClouds(d).length).toBe(clouds.length);
  });

  it("빗금 묶음은 화면 아래쪽 것부터 하나씩 쌓인다", () => {
    const order = [...hatches].sort((p, q) => p.s.delayMs - q.s.delayMs);
    const screenY = order.map(({ c, s }) => c.y + ((s.cy! - CLOUD_H / 2) / CLOUD_W) * c.w);
    for (let i = 1; i < screenY.length; i++) expect(screenY[i]).toBeLessThanOrEqual(screenY[i - 1]);
    const delays = order.map(({ s }) => s.delayMs);
    expect(new Set(delays).size).toBe(delays.length);
  });

  it("빗금 묶음 하나 = 짧은 평행선 3 ~ 6 개 · 오른쪽 아래로 · 구름 아래쪽에만", () => {
    for (const { s } of hatches) {
      expect(s.segments).toBeGreaterThanOrEqual(3);
      expect(s.segments).toBeLessThanOrEqual(6);
      expect(s.d.split("M").length - 1).toBe(s.segments);
      for (const seg of s.d.split("M").slice(1)) {
        const pts = points(seg);
        const [ax, ay] = pts[0];
        const [bx, by] = pts[pts.length - 1];
        expect(bx).toBeGreaterThan(ax); // 오른쪽으로
        expect(by).toBeGreaterThan(ay); // 아래로
        expect(Math.hypot(bx - ax, by - ay)).toBeLessThan(25); // 짧게
        expect(by).toBeLessThan(BASE_Y); // 바닥선 위(구름 안)
      }
      // 위쪽은 비운다 — 묶음은 구름 높이의 아래 절반쯤 안에
      expect(s.cy!).toBeGreaterThan(BASE_Y * 0.4);
    }
  });
});

describe("모양", () => {
  it("옆으로 긴 뭉게구름(가로 : 세로 ≥ 3 : 1) · 윗면 굴곡이 촘촘", () => {
    for (const c of buildClouds("a")) {
      const pts = points(c.fill);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      expect(w / h).toBeGreaterThanOrEqual(3);
      expect((c.fill.match(/Q/g) ?? []).length).toBeGreaterThan(15);
    }
  });

  it("같은 씨앗이면 같은 선(시안이 달라도 모양은 같고 펴지는 꼴만 다르다)", () => {
    const a = buildClouds("a");
    for (const d of ["b", "c", "d"] as const) {
      const other = buildClouds(d);
      expect(other.map((c) => c.fill)).toEqual(a.map((c) => c.fill));
      expect(other.map((c) => c.part)).not.toEqual(a.map((c) => c.part));
    }
  });

  it("시안 d: 띠마다 좌우로 엇갈린다", () => {
    const dirs = buildClouds("d").map((c) => c.part.dx.includes("calc(-"));
    for (let i = 1; i < dirs.length; i++) expect(dirs[i]).not.toBe(dirs[i - 1]);
  });
});
