// 구름 모양 · 배치 · 시안별 펴지는 방향. DOM 없음 — 같은 씨앗이면 언제나 같은 선이 나온다.
// 손맛은 SVG 필터 대신 「같은 윤곽을 살짝 어긋나게 두 번 긋기 + 아래쪽 빗금」 으로 낸다(WebKit 에서 싸다).

export type CoverDesign = "a" | "b" | "c";

/** 구름 한 장의 viewBox 크기(가로 · 세로) */
export const CLOUD_W = 400;
export const CLOUD_H = 230;

export interface Stroke {
  d: string;
  /** line = 첫 윤곽 · again = 겹쳐 그은 둘째 윤곽 · hatch = 아래쪽 빗금 */
  kind: "line" | "again" | "hatch";
  /** 그리기 시작 · 길이(ms, 덮개가 뜬 때부터) */
  delayMs: number;
  durMs: number;
}

export interface Cloud {
  id: number;
  /** 화면 안 가운데 자리(%) · 가로 크기(vmax) */
  x: number;
  y: number;
  w: number;
  /** 흰 채움(깨끗한 윤곽) · 채움이 나타나는 시각 */
  fill: string;
  fillAtMs: number;
  strokes: Stroke[];
  /** 펴지기: 옮겨 가는 곳(CSS 길이) · 크기 · 투명도 · 늦게 시작(펴지기 길이에 대한 비율 0~1) */
  part: { dx: string; dy: string; scale: number; opacity: number; lag: number };
  /** 그리는 동안 천천히 흐르는 결(초 · 위상) */
  drift: { periodS: number; phaseS: number };
}

type Pt = [number, number];

/** 씨앗 하나로 도는 작은 난수(mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 위는 둥근 혹 여럿 · 아래는 거의 평평한 구름 윤곽의 마디(왼쪽 아래에서 시계 방향) */
function outline(rand: () => number): { start: Pt; segs: [Pt, Pt, Pt][] } {
  const cx = CLOUD_W / 2;
  const cy = CLOUD_H * 0.66;
  const rx = CLOUD_W * 0.44;
  const ry = CLOUD_H * 0.5;
  const bumps = 5 + Math.floor(rand() * 3);
  const pts: Pt[] = [];
  for (let i = 0; i <= bumps; i++) {
    const t = i / bumps;
    const ang = Math.PI * (1 - t) + (i > 0 && i < bumps ? (rand() - 0.5) * 0.18 : 0);
    const squash = i === 0 || i === bumps ? 1 : 0.86 + rand() * 0.2;
    pts.push([cx + Math.cos(ang) * rx, cy - Math.sin(ang) * ry * squash]);
  }
  const segs: [Pt, Pt, Pt][] = [];
  // 위쪽 혹: 마디 사이를 바깥으로 부풀린 3차 곡선
  for (let i = 0; i < bumps; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    let nx = mx - cx;
    let ny = my - cy;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const lift = Math.hypot(bx - ax, by - ay) * (0.55 + rand() * 0.25);
    segs.push([
      [ax + nx * lift, ay + ny * lift],
      [bx + nx * lift, by + ny * lift],
      [bx, by],
    ]);
  }
  // 아래쪽: 오른쪽 끝에서 왼쪽 끝으로 살짝 처진 선 두 마디
  const right = pts[bumps];
  const left = pts[0];
  const bottom = cy + CLOUD_H * 0.16;
  const mid: Pt = [cx + (rand() - 0.5) * 30, bottom + rand() * 6];
  segs.push([
    [right[0] + 10, right[1] + 30],
    [mid[0] + 70, bottom + 4],
    mid,
  ]);
  segs.push([
    [mid[0] - 70, bottom + 4],
    [left[0] - 10, left[1] + 30],
    left,
  ]);
  return { start: left, segs };
}

function toPath(start: Pt, segs: [Pt, Pt, Pt][], wobble: number, rand: () => number, close: boolean): string {
  const j = (v: number) => r1(v + (rand() - 0.5) * wobble);
  let d = `M${j(start[0])} ${j(start[1])}`;
  for (const [c1, c2, p] of segs) {
    d += `C${j(c1[0])} ${j(c1[1])} ${j(c2[0])} ${j(c2[1])} ${j(p[0])} ${j(p[1])}`;
  }
  return close ? d + "Z" : d;
}

/** 아래쪽 안쪽에 짧은 빗금 몇 줄 — 연필 그림자(y0 = 빗금 띠의 위쪽, 세로 비율) */
function hatches(rand: () => number, y0Frac: number): string[] {
  const n = 3 + Math.floor(rand() * 3);
  const out: string[] = [];
  const y0 = CLOUD_H * y0Frac;
  for (let i = 0; i < n; i++) {
    const x = CLOUD_W * (0.3 + (0.4 * i) / n) + rand() * 8;
    const y = y0 + rand() * 14;
    const len = 16 + rand() * 10;
    out.push(`M${r1(x)} ${r1(y + len * 0.6)}L${r1(x + len * 0.8)} ${r1(y)}`);
  }
  return out;
}

/**
 * 덮개 위 구름 자리(x · y %, w vmax) — 네 장이 화면 가운데에서 서로 겹친다.
 * 구름 수는 이것으로 끝이다: 로딩이 길어지면 구름을 늘리지 않고 같은 구름에 덧선 · 빗금을 더한다.
 */
const LAYOUT: { x: number; y: number; w: number; seed: number }[] = [
  { x: 27, y: 32, w: 62, seed: 11 },
  { x: 77, y: 30, w: 58, seed: 37 },
  { x: 24, y: 69, w: 60, seed: 41 },
  { x: 78, y: 71, w: 62, seed: 53 },
];

/** 첫 장면: 네 구름의 첫 윤곽을 70 ms 시차로 같이 긋는다 — 마지막 것이 0.59 초에 끝나 최소 보임(0.6 초) 안에 한 장면이 완성된다 */
export const FIRST_LINE_GAP_MS = 70;
export const FIRST_LINE_MS = 380;

/**
 * 그리기 시간표(ms, 덮개가 뜬 때부터). 첫 장면 뒤로는 길게 기다릴수록 같은 구름에 손이 더 간다:
 * 0.62 초~ 둘째 덧선 → 1.4 초~ 아래 빗금 → 2.6 초~ 셋째 덧선 → 3.8 초~ 안쪽 빗금(약 4.9 초에 끝, 그 뒤로는 천천히 흐르기만).
 * 빨리 준비되면 그때까지 그린 만큼만 펴진다 — 덜 그린 선은 그 자리에서 멈춘다.
 */
function drawPlan(order: number) {
  return {
    line: { at: order * FIRST_LINE_GAP_MS, dur: FIRST_LINE_MS },
    again: { at: 620 + order * 180, dur: 320 },
    hatch: { at: 1400 + order * 220, gap: 40, dur: 50 },
    again2: { at: 2600 + order * 260, dur: 380 },
    hatch2: { at: 3800 + order * 240, gap: 45, dur: 55 },
  };
}

function partFor(design: CoverDesign, x: number, y: number, w: number, order: number): Cloud["part"] {
  // 늦게 출발하는 몫(lag)은 펴지기 길이 안에 들어간다 — 끝나는 시각은 모두 같다
  switch (design) {
    case "a": {
      // 가운데서 갈라짐 — 네 구름이 만나는 가운데가 갈라지며 바깥으로 밀려나고 커진다(구름 사이로 내려가는 느낌)
      const vx = x - 50;
      const vy = (y - 50) * 0.8;
      const l = Math.hypot(vx, vy) || 1;
      return { dx: `${r1((vx / l) * 80)}vmax`, dy: `${r1((vy / l) * 80)}vmax`, scale: 1.45, opacity: 1, lag: r1(order * 0.03) };
    }
    case "b": {
      // 한쪽으로 걷힘 — 오른쪽 것부터 차례로 오른쪽 밖으로 쓸려 간다
      return { dx: `calc(${r1(112 - x)}vw + ${r1(w * 0.6)}vmax)`, dy: "-3vh", scale: 1.08, opacity: 1, lag: r1((1 - Math.min(Math.max(x, 0), 100) / 100) * 0.3) };
    }
    case "c": {
      // 위로 걷힘 — 위의 것부터 하늘로 들려 올라가고 아래 것이 뒤따른다
      return { dx: `${r1((x - 50) * 0.08)}vw`, dy: `calc(${r1(-(y + 25))}vh - ${r1(w * 0.6)}vmax)`, scale: 1.12, opacity: 1, lag: r1((Math.min(Math.max(y, 0), 100) / 100) * 0.28) };
    }
  }
}

export function buildClouds(design: CoverDesign): Cloud[] {
  return LAYOUT.map((c, order) => {
    const rand = rng(c.seed);
    const shape = outline(rand);
    const plan = drawPlan(order);
    const strokes: Stroke[] = [
      { d: toPath(shape.start, shape.segs, 3, rand, false), kind: "line", delayMs: plan.line.at, durMs: plan.line.dur },
      // 덧선은 조금 더 어긋나게 — 한 번에 그은 것 같지 않게
      { d: toPath(shape.start, shape.segs, 7, rand, false), kind: "again", delayMs: plan.again.at, durMs: plan.again.dur },
    ];
    hatches(rand, 0.7).forEach((d, i) => {
      strokes.push({ d, kind: "hatch", delayMs: plan.hatch.at + i * plan.hatch.gap, durMs: plan.hatch.dur });
    });
    strokes.push({ d: toPath(shape.start, shape.segs, 10, rand, false), kind: "again", delayMs: plan.again2.at, durMs: plan.again2.dur });
    hatches(rand, 0.55).forEach((d, i) => {
      strokes.push({ d, kind: "hatch", delayMs: plan.hatch2.at + i * plan.hatch2.gap, durMs: plan.hatch2.dur });
    });
    return {
      id: order,
      x: c.x,
      y: c.y,
      w: c.w,
      fill: toPath(shape.start, shape.segs, 0, rand, true),
      fillAtMs: plan.line.at + Math.round(plan.line.dur * 0.7),
      strokes,
      part: partFor(design, c.x, c.y, c.w, order),
      drift: { periodS: 8 + rand() * 5, phaseS: -rand() * 8 },
    };
  });
}

export function isDesign(v: unknown): v is CoverDesign {
  return v === "a" || v === "b" || v === "c";
}
