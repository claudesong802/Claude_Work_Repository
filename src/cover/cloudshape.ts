// 구름 모양 · 배치 · 시안별 펴지는 방향. DOM 없음 — 같은 씨앗이면 언제나 같은 선이 나온다.
// 결(사용자 10-19 본보기): 옆으로 긴 뭉게구름 · 가는 펜 선 한 줄 · 덩어리 겹친 자리의 짧은 안쪽 곡선 ·
// 아래쪽 배와 덩어리 밑에 몰린 짧은 평행 빗금 묶음(오른쪽 아래로 비스듬히) · 흰 채움.
// 그림을 벡터로 따지 않고 같은 결을 코드로 만든다 — 선이 「그어지는」 애니메이션을 하려면 면이 아니라 선이어야 한다.

export type CoverDesign = "a" | "b" | "c" | "d";

/** 구름 한 장의 viewBox 크기(가로 · 세로 ≈ 3.3 : 1) */
export const CLOUD_W = 600;
export const CLOUD_H = 180;
/** 아래 평평한 바닥선의 높이 */
export const BASE_Y = 150;

export interface Stroke {
  d: string;
  /** line = 윤곽 · inner = 안쪽 곡선(부피) · hatch = 빗금 묶음 하나(여러 선분이 한 path) */
  kind: "line" | "inner" | "hatch";
  /** 그리기(나타나기) 시작 · 길이(ms, 덮개가 뜬 때부터) */
  delayMs: number;
  durMs: number;
  /** hatch 만: 묶음 안 선분 수 · 묶음 가운데 높이(viewBox y) */
  segments?: number;
  cy?: number;
}

export interface Cloud {
  id: number;
  /** 화면 안 가운데 자리(%) · 가로 크기(vw) */
  x: number;
  y: number;
  w: number;
  /** 윤곽 굵기(viewBox 단위) — 구름마다 살짝 다르다 */
  lineWidth: number;
  /** 흰 채움(윤곽과 같은 모양) · 채움이 나타나는 시각 */
  fill: string;
  fillAtMs: number;
  strokes: Stroke[];
  /** 펴지기: 옮겨 가는 곳(CSS 길이) · 크기 · 투명도 · 늦게 시작(펴지기 길이에 대한 비율 0~1) */
  part: { dx: string; dy: string; scale: number; opacity: number; lag: number };
  /** 그리는 동안 천천히 흐르는 결(초 · 위상) */
  drift: { periodS: number; phaseS: number };
}

type Pt = [number, number];
interface Mass {
  cx: number;
  rx: number;
  ry: number;
}

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
const between = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);

/** 큰 덩어리 서너 개 — 가운데가 높고 양 끝이 낮게, 옆 덩어리와 겹치게 */
function masses(rand: () => number): Mass[] {
  const n = 3 + Math.floor(rand() * 2);
  const left = 40;
  const right = CLOUD_W - 40;
  const span = (right - left) / n;
  const out: Mass[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const tall = 1 - Math.abs(t - 0.5) * 1.1; // 가운데 덩어리가 높다
    const rx = span * between(rand, 0.72, 0.9);
    out.push({
      cx: left + span * (i + 0.5) + between(rand, -0.1, 0.1) * span,
      rx,
      ry: Math.min(rx * 1.05, (BASE_Y - 40) * between(rand, 0.75, 0.95) * tall + 30),
    });
  }
  return out;
}

/** x 자리에서 덩어리들 가장 높은 윗면(y, 위로 갈수록 작다) */
function envelope(ms: Mass[], x: number): number {
  let y = BASE_Y;
  for (const m of ms) {
    const u = (x - m.cx) / m.rx;
    if (u > -1 && u < 1) y = Math.min(y, BASE_Y - m.ry * Math.sqrt(1 - u * u));
  }
  return y;
}

interface Top {
  start: Pt;
  end: Pt;
  d: string;
}

/** 윗면을 촘촘한 몽글 굴곡으로 — 윗면 선을 비슷한 길이씩 끊어, 마디마다 바깥으로 부풀린 곡선 */
function topBumps(ms: Mass[], rand: () => number): Top {
  const x0 = Math.min(...ms.map((m) => m.cx - m.rx)) + 0.5;
  const x1 = Math.max(...ms.map((m) => m.cx + m.rx)) - 0.5;
  // 윗면을 잘게 따라 간 꺾은선(양 끝은 바닥까지 내려간다)
  const poly: Pt[] = [];
  for (let x = x0; x <= x1; x += 1) poly.push([x, envelope(ms, x)]);
  poly[0] = [x0, BASE_Y];
  poly.push([x1, BASE_Y]);
  // 길이를 따라 마디 고르기(마디 길이 18~32 — 작은 굴곡)
  const knots: Pt[] = [poly[0]];
  let acc = 0;
  let next = between(rand, 18, 32);
  for (let i = 1; i < poly.length - 1; i++) {
    acc += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    if (acc >= next) {
      knots.push(poly[i]);
      acc = 0;
      next = between(rand, 18, 32);
    }
  }
  const end = poly[poly.length - 1];
  knots.push(end);
  let d = "";
  for (let i = 1; i < knots.length; i++) {
    const [ax, ay] = knots[i - 1];
    const [bx, by] = knots[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    // 왼쪽 → 오른쪽으로 윗면을 돌 때 바깥쪽 = (dy, -dx)
    const lift = len * between(rand, 0.3, 0.48);
    const cx = (ax + bx) / 2 + (dy / len) * lift;
    const cy = (ay + by) / 2 - (dx / len) * lift;
    d += `Q${r1(cx)} ${r1(cy)} ${r1(bx)} ${r1(by)}`;
  }
  return { start: knots[0], end, d };
}

/** 구름 윤곽: 왼쪽 바닥 → 윗면 굴곡 → 오른쪽 바닥 → 살짝 물결진 평평한 바닥 */
function outline(top: Top, sag: number, close: boolean): string {
  const [sx, sy] = top.start;
  const [ex, ey] = top.end;
  const midX = (sx + ex) / 2;
  const bottom =
    `Q${r1((ex + midX) / 2)} ${r1(ey + sag)} ${r1(midX)} ${r1(BASE_Y + sag * 0.4)}` +
    `Q${r1((sx + midX) / 2)} ${r1(sy + sag)} ${r1(sx)} ${r1(sy)}`;
  return `M${r1(sx)} ${r1(sy)}${top.d}${bottom}${close ? "Z" : ""}`;
}

/** 덩어리 겹친 자리마다 짧은 안쪽 곡선 — 앞(낮은) 덩어리의 윤곽이 뒤 덩어리 안으로 이어지는 꼴 */
function innerCurves(ms: Mass[], rand: () => number): string[] {
  const out: string[] = [];
  for (let i = 0; i < ms.length - 1; i++) {
    const a = ms[i];
    const b = ms[i + 1];
    const frontIsA = a.ry < b.ry; // 낮은 쪽이 앞
    const front = frontIsA ? a : b;
    // 두 덩어리 윗면이 만나는 골짜기 x(사이에서 윗면이 가장 낮은 곳)
    let vx = (a.cx + b.cx) / 2;
    let lowest = -Infinity;
    for (let x = a.cx; x <= b.cx; x += 1) {
      const y = envelope(ms, x);
      if (y > lowest) {
        lowest = y;
        vx = x;
      }
    }
    // 앞 덩어리 타원 위 골짜기 자리 각도에서, 뒤 덩어리 쪽으로 더 돌아 안쪽(아래)으로 내려간다
    const u0 = Math.max(-0.995, Math.min(0.995, (vx - front.cx) / front.rx));
    const t0 = Math.acos(u0); // 0 = 오른쪽 끝, π = 왼쪽 끝
    const t1 = frontIsA ? t0 - between(rand, 0.3, 0.5) : t0 + between(rand, 0.3, 0.5);
    const p = (t: number): Pt => [front.cx + front.rx * Math.cos(t), BASE_Y - front.ry * Math.sin(t)];
    const [x0, y0] = p(t0);
    const [xm, ym] = p((t0 + t1) / 2);
    const [x1, y1] = p(t1);
    // 곡선이 가운데 점을 지나도록 조절점 = 2·가운데 − 양 끝 평균
    out.push(`M${r1(x0)} ${r1(y0 + 2)}Q${r1(2 * xm - (x0 + x1) / 2)} ${r1(2 * ym - (y0 + y1) / 2)} ${r1(x1)} ${r1(y1)}`);
  }
  return out;
}

interface Bundle {
  d: string;
  segments: number;
  cy: number;
}

/**
 * 빗금 묶음: 짧은 평행선 3 ~ 6 개 · 오른쪽 아래로 비스듬히 · 곡면을 따라 살짝 휨 — 선분 여럿을 한 path 에.
 * 자리는 아래쪽 배(바닥선 바로 위)와 각 덩어리 밑. 위쪽은 비운다.
 */
function hatchBundles(ms: Mass[], rand: () => number): Bundle[] {
  const spots: Pt[] = [];
  // 아래쪽 배 — 바닥선 위를 따라 띄엄띄엄
  const x0 = Math.min(...ms.map((m) => m.cx - m.rx)) + 55;
  const x1 = Math.max(...ms.map((m) => m.cx + m.rx)) - 60;
  for (let x = x0 + between(rand, 0, 30); x < x1; x += between(rand, 95, 135)) spots.push([x, BASE_Y - between(rand, 13, 18)]);
  // 각 덩어리 밑 — 덩어리 아래 쪽, 가운데에서 살짝 오른쪽
  for (const m of ms) {
    if (m.ry < 55) continue;
    spots.push([m.cx + between(rand, 0, 0.3) * m.rx, BASE_Y - m.ry * between(rand, 0.36, 0.46)]);
  }
  return spots.map(([cx, cy]) => {
    const n = 3 + Math.floor(rand() * 4);
    const gap = between(rand, 6, 7.5);
    // 선 방향(오른쪽 아래) — 줄은 오른쪽으로 늘어선다
    const dirX = 0.68;
    const dirY = 0.73;
    let d = "";
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * gap;
      const len = between(rand, 12, 18) * (1 - Math.abs(k - (n - 1) / 2) / (n + 1)); // 가운데가 길다
      const mx = cx + off;
      const my = cy + off * 0.12; // 오른쪽으로 갈수록 아주 조금 내려앉음(곡면)
      const ax = mx - (dirX * len) / 2;
      const ay = my - (dirY * len) / 2;
      const bx = mx + (dirX * len) / 2;
      const by = my + (dirY * len) / 2;
      // 곡면을 따라 살짝 휨 — 선 가운데를 왼쪽 아래로 조금
      d += `M${r1(ax)} ${r1(ay)}Q${r1(mx - 0.8)} ${r1(my + 0.8)} ${r1(bx)} ${r1(by)}`;
    }
    return { d, segments: n, cy };
  });
}

/**
 * 덮개 위 구름 자리(x · y %, w vw) — 옆으로 긴 구름 네 장을 가로 띠로 겹쳐 화면을 덮는다.
 * 구름 수는 이것으로 끝이다: 로딩이 길어지면 구름을 늘리지 않고 아래쪽부터 빗금 묶음을 쌓는다.
 */
const LAYOUT: { x: number; y: number; w: number; seed: number }[] = [
  { x: 38, y: 19, w: 112, seed: 11 },
  { x: 64, y: 41, w: 116, seed: 37 },
  { x: 36, y: 63, w: 114, seed: 41 },
  { x: 62, y: 85, w: 118, seed: 53 },
];

/** 첫 장면: 네 구름의 윤곽을 60 ms 시차로 같이 긋는다 — 윤곽 · 안쪽 곡선 모두 0.6 초 안에 끝나 한 장면이 완성된다 */
export const FIRST_LINE_GAP_MS = 60;
export const FIRST_LINE_MS = 340;
const INNER_MS = 120;
const INNER_GAP_MS = 40;
/** 빗금 묶음은 0.65 초부터 0.22 초마다 하나씩, 화면 아래쪽 것부터 */
export const HATCH_START_MS = 650;
export const HATCH_GAP_MS = 220;
const HATCH_FADE_MS = 180;

function partFor(design: CoverDesign, x: number, y: number, w: number, order: number): Cloud["part"] {
  // 늦게 출발하는 몫(lag)은 펴지기 길이 안에 들어간다 — 끝나는 시각은 모두 같다
  switch (design) {
    case "a": {
      // 가운데서 갈라짐 — 화면 가운데에서 바깥(위아래 · 좌우)으로 밀려나며 커진다(구름 사이로 내려가는 느낌)
      const vx = x - 50;
      const vy = (y - 50) * 1.6;
      const l = Math.hypot(vx, vy) || 1;
      return { dx: `${r1((vx / l) * 70)}vmax`, dy: `${r1((vy / l) * 75)}vmax`, scale: 1.5, opacity: 1, lag: r1(Math.abs(y - 50) < 15 ? 0 : 0.05) };
    }
    case "b": {
      // 한쪽으로 걷힘 — 위 띠부터 차례로 오른쪽 밖으로 쓸려 간다
      return { dx: `calc(${r1(100 - x)}vw + ${r1(w * 0.55)}vw)`, dy: "-2vh", scale: 1.05, opacity: 1, lag: r1(order * 0.08) };
    }
    case "c": {
      // 위로 걷힘 — 위의 것부터 하늘로 들려 올라가고 아래 것이 뒤따른다
      return { dx: "0px", dy: `calc(${r1(-(y + 15))}vh - ${r1(w * 0.2)}vw)`, scale: 1.1, opacity: 1, lag: r1(order * 0.08) };
    }
    case "d": {
      // 띠마다 좌우로 엇갈려 흘러나감 — 짝수 띠는 왼쪽, 홀수 띠는 오른쪽
      const toLeft = order % 2 === 0;
      const dx = toLeft ? `calc(${r1(-x)}vw - ${r1(w * 0.55)}vw)` : `calc(${r1(100 - x)}vw + ${r1(w * 0.55)}vw)`;
      return { dx, dy: "0px", scale: 1.04, opacity: 1, lag: r1(order * 0.05) };
    }
  }
}

export function buildClouds(design: CoverDesign): Cloud[] {
  const built = LAYOUT.map((c, order) => {
    const rand = rng(c.seed);
    const ms = masses(rand);
    const top = topBumps(ms, rand);
    const sag = between(rand, 1, 3.5);
    const lineAt = order * FIRST_LINE_GAP_MS;
    const strokes: Stroke[] = [{ d: outline(top, sag, false), kind: "line", delayMs: lineAt, durMs: FIRST_LINE_MS }];
    innerCurves(ms, rand).forEach((d, j) => {
      strokes.push({ d, kind: "inner", delayMs: lineAt + Math.round(FIRST_LINE_MS * 0.6) + j * INNER_GAP_MS, durMs: INNER_MS });
    });
    const cloud: Cloud = {
      id: order,
      x: c.x,
      y: c.y,
      w: c.w,
      lineWidth: r1(between(rand, 1.25, 1.5)),
      fill: outline(top, sag, true),
      fillAtMs: lineAt + Math.round(FIRST_LINE_MS * 0.7),
      strokes,
      part: partFor(design, c.x, c.y, c.w, order),
      drift: { periodS: between(rand, 9, 14), phaseS: -between(rand, 0, 8) },
    };
    return { cloud, bundles: hatchBundles(ms, rand) };
  });
  // 빗금 묶음 차례: 화면에서 아래쪽에 있는 것부터 하나씩 — 구름을 넘나들며 밑에서부터 그늘이 쌓인다
  const queue = built.flatMap(({ cloud, bundles }) =>
    bundles.map((b) => ({ cloud, b, screenY: cloud.y + ((b.cy - CLOUD_H / 2) / CLOUD_W) * cloud.w })),
  );
  queue.sort((p, q) => q.screenY - p.screenY);
  queue.forEach(({ cloud, b }, k) => {
    cloud.strokes.push({ d: b.d, kind: "hatch", delayMs: HATCH_START_MS + k * HATCH_GAP_MS, durMs: HATCH_FADE_MS, segments: b.segments, cy: b.cy });
  });
  return built.map(({ cloud }) => cloud);
}

export function isDesign(v: unknown): v is CoverDesign {
  return v === "a" || v === "b" || v === "c" || v === "d";
}
