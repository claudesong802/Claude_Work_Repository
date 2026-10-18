// 구름 배치 · 기다림 흐름 · 시안별 펴지는 꼴. DOM 없음 — 그림 주소는 cloudart.ts 가 쥔다.
// 결(사용자 10-19): 손그림 구름 PNG 6장을 그대로 겹쳐 화면을 빈틈없이 덮고(구름 바다),
// 지도가 준비되면 영상처럼 가운데가 열리며 구름이 커지면서 바깥으로 밀려난다(구름을 뚫고 내려가는 느낌).

export type CoverDesign = "a" | "b" | "c";

/**
 * 하늘 결(시안 단계에서 견줌 · 고른 뒤 하나만 남긴다):
 * dense = 영상처럼 작은 구름 20 장 · 펴지기 0.5 초 / mid = 16 장 중간 크기 · 0.6 초(기본) / sparse = 큰 구름 14 장 · 0.8 초
 */
export type Sky = "dense" | "mid" | "sparse";
export const SKY_PART_MS: Record<Sky, number> = { dense: 500, mid: 600, sparse: 800 };

/** 그림 이름과 크기(px · 투명 여백을 자른 뒤) — scripts/cloud-assets.py 가 낸 값 */
export const ART = {
  original: { w: 1600, h: 567 },
  wide: { w: 1600, h: 525 },
  billowy: { w: 1199, h: 995 },
  diagonal: { w: 1600, h: 846 },
  wispy: { w: 1600, h: 587 },
  curled: { w: 1222, h: 1183 },
} as const;
export type ArtName = keyof typeof ART;

export interface Cloud {
  id: number;
  art: ArtName;
  /** 화면 안 가운데 자리(%) · 가로 크기(vmax) · 좌우 뒤집기 · 살짝 돌리기(도) · 겹침 차례(클수록 앞) */
  x: number;
  y: number;
  w: number;
  flip: boolean;
  rot: number;
  z: number;
  /** 세로 / 가로 */
  ratio: number;
  /** 가로 띠 번호(위에서 0) — 시안 c 의 좌우 엇갈림 */
  row: number;
  /** 펴지기: 옮겨 가는 곳(CSS 길이) · 크기 · 투명도 · 늦게 시작(펴지기 길이에 대한 비율 0~1) */
  part: { dx: string; dy: string; scale: number; opacity: number; lag: number };
  /** 기다리는 동안 덮은 채 천천히 흐름 — 몇 px 이동 · 크기 1.00 ~ 1.03(초 · 위상 · 이동 vmax) */
  drift: { periodS: number; phaseS: number; dx: number; dy: number };
}

/**
 * 덮개 위 구름 자리 — 위에서 아래로 겹겹이, 아래 것이 앞 · 가운데 구름이 맨 앞(펴질 때 가장 먼저 열린다).
 * 자리 · 크기 · 돌리기는 scripts/cloud-layout.py 가 그림의 실제 알파로 iPad 가로 · 세로 · 폰 · 데스크톱 화면비마다
 * 빈틈을 재며 찾은 값이다(기다림 흐름의 양 끝에서도) — 손으로 고치면 그 도구를 다시 돌리고 e2e 「빈틈」 으로 확인한다.
 * 같은 그림은 멀리 두고 뒤집기 · 돌리기를 바꿔 나란히 반복돼 보이지 않게 한다.
 */
type Spot = { art: ArtName; x: number; y: number; w: number; flip?: boolean; rot?: number; row: number };

const SPARSE: Spot[] = [
  { art: "wide", x: 89, y: 1, w: 50, flip: true, rot: 5, row: 0 },
  { art: "original", x: 30, y: 7, w: 68, rot: -2, row: 0 },
  { art: "billowy", x: 72, y: 11, w: 72, rot: 4, row: 1 },
  { art: "wide", x: 54, y: 19, w: 57, row: 1 },
  { art: "wispy", x: -9, y: 34, w: 69, flip: true, rot: 1, row: 2 },
  { art: "curled", x: 9, y: 39, w: 67, flip: true, rot: 1, row: 2 },
  { art: "diagonal", x: 32, y: 41, w: 41, rot: 1, row: 2 },
  { art: "curled", x: 78, y: 59, w: 61, flip: true, rot: 4, row: 3 },
  { art: "curled", x: -10, y: 66, w: 72, flip: true, row: 3 },
  { art: "wispy", x: -2, y: 70, w: 55, flip: true, rot: -5, row: 3 },
  { art: "billowy", x: 80, y: 77, w: 69, row: 4 },
  { art: "diagonal", x: 36, y: 78, w: 63, flip: true, rot: -2, row: 4 },
  { art: "original", x: 35, y: 93, w: 60, rot: -5, row: 5 },
  // 가운데 — 맨 앞에 두어 펴질 때 가장 먼저 커지며 사라진다(가운데가 열림)
  { art: "billowy", x: 50, y: 57, w: 56, rot: -3, row: 3 },
];

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** 화면 가운데에서 떨어진 정도 0(가운데) ~ 1(모서리) */
export function centerDistance(x: number, y: number): number {
  return Math.min(1, Math.hypot((x - 50) / 50, (y - 50) / 50) / Math.SQRT2);
}

/** 가운데 구름부터 먼저 — 모서리 구름은 펴지기 길이의 이만큼 늦게 출발한다 */
export const CENTER_FIRST_LAG = 0.3;

function partFor(design: CoverDesign, x: number, y: number, row: number): Cloud["part"] {
  // 늦게 출발하는 몫(lag)은 펴지기 길이 안에 들어간다 — 끝나는 시각은 모두 같다
  const dist = centerDistance(x, y);
  switch (design) {
    case "a":
    case "b": {
      // 영상 그대로: 가운데가 열리고 구름 하나하나가 약 2 배로 커지며 화면 중심에서 바깥으로 밀려난다(가속)
      // b 는 여기에 밑의 지도가 1.04 → 1 로 다가옴(지도 쪽 몫 · onPartStart)
      const lag = r2(dist * CENTER_FIRST_LAG);
      if (dist < 0.12) return { dx: "0px", dy: "0px", scale: 2.6, opacity: 0, lag };
      const vx = x - 50;
      const vy = y - 50;
      const l = Math.hypot(vx, vy) || 1;
      return { dx: `${r1((vx / l) * 80)}vmax`, dy: `${r1((vy / l) * 80)}vmax`, scale: 2, opacity: 1, lag };
    }
    case "c": {
      // 가로 띠로 좌우 엇갈려 흘러나감 — 짝수 띠는 왼쪽, 홀수 띠는 오른쪽 · 가운데 띠부터
      const toLeft = row % 2 === 0;
      const lag = r2((Math.abs(y - 50) / 50) * 0.2);
      return { dx: toLeft ? "-130vmax" : "130vmax", dy: "0px", scale: 1.15, opacity: 1, lag };
    }
  }
}

const MID: Spot[] = [
  { art: "original", x: 80, y: 6, w: 57, flip: true, rot: 5, row: 0 },
  { art: "original", x: 8, y: 6, w: 56, flip: true, rot: -2, row: 0 },
  { art: "billowy", x: 45, y: 13, w: 56, rot: 2, row: 1 },
  { art: "wide", x: 10, y: 16, w: 56, rot: -4, row: 1 },
  { art: "diagonal", x: 106, y: 18, w: 56, flip: true, rot: -2, row: 1 },
  { art: "wispy", x: 82, y: 25, w: 47, rot: 5, row: 1 },
  { art: "curled", x: 3, y: 47, w: 58, flip: true, rot: 5, row: 2 },
  { art: "curled", x: 78, y: 47, w: 56, flip: true, rot: -4, row: 2 },
  { art: "original", x: 8, y: 47, w: 56, rot: 5, row: 2 },
  { art: "billowy", x: 74, y: 60, w: 58, rot: 4, row: 3 },
  { art: "curled", x: 18, y: 75, w: 57, row: 4 },
  { art: "billowy", x: 32, y: 81, w: 58, row: 4 },
  { art: "diagonal", x: 78, y: 85, w: 58, rot: 3, row: 4 },
  { art: "wispy", x: 71, y: 88, w: 52, rot: 1, row: 4 },
  { art: "wide", x: 88, y: 96, w: 53, flip: true, rot: 1, row: 5 },
  // 가운데 — 맨 앞에 두어 펴질 때 가장 먼저 커지며 사라진다(가운데가 열림)
  { art: "billowy", x: 47, y: 44, w: 46, flip: true, rot: -5, row: 2 },
];

// 잠정 — scripts/cloud-layout.py 를 22 장으로 다시 돌린 값으로 바꾼다
const DENSE: Spot[] = [
  { art: "billowy", x: 40, y: 5, w: 45, flip: true, rot: 1, row: 0 },
  { art: "diagonal", x: 110, y: 7, w: 44, flip: true, rot: -4, row: 0 },
  { art: "billowy", x: 74, y: 9, w: 45, flip: true, rot: -3, row: 0 },
  { art: "curled", x: 2, y: 18, w: 45, flip: true, rot: -1, row: 1 },
  { art: "original", x: 15, y: 24, w: 45, rot: 5, row: 1 },
  { art: "wispy", x: 101, y: 25, w: 43, rot: -2, row: 1 },
  { art: "original", x: 57, y: 31, w: 45, rot: 1, row: 2 },
  { art: "wispy", x: 28, y: 35, w: 45, rot: -1, row: 2 },
  { art: "wispy", x: 63, y: 36, w: 44, flip: true, rot: 4, row: 2 },
  { art: "billowy", x: 89, y: 44, w: 45, flip: true, rot: -2, row: 2 },
  { art: "diagonal", x: 10, y: 50, w: 44, rot: -1, row: 3 },
  { art: "curled", x: -2, y: 54, w: 45, flip: true, rot: -2, row: 3 },
  { art: "curled", x: 44, y: 56, w: 45, rot: -2, row: 3 },
  { art: "original", x: 64, y: 66, w: 45, flip: true, rot: 5, row: 3 },
  { art: "wide", x: 89, y: 77, w: 45, rot: 3, row: 4 },
  { art: "curled", x: 94, y: 81, w: 45, rot: -1, row: 4 },
  { art: "billowy", x: 20, y: 82, w: 45, rot: -4, row: 4 },
  { art: "billowy", x: 58, y: 85, w: 45, flip: true, rot: 2, row: 4 },
  { art: "diagonal", x: 105, y: 87, w: 45, flip: true, rot: -3, row: 4 },
  // 가운데 — 맨 앞에 두어 펴질 때 가장 먼저 커지며 사라진다(가운데가 열림)
  { art: "billowy", x: 55, y: 48, w: 36, rot: -1, row: 2 },
];

const LAYOUTS: Record<Sky, Spot[]> = { dense: DENSE, mid: MID, sparse: SPARSE };

export function buildClouds(design: CoverDesign, sky: Sky = "mid"): Cloud[] {
  return LAYOUTS[sky].map((c, order) => {
    const art = ART[c.art];
    return {
      id: order,
      art: c.art,
      x: c.x,
      y: c.y,
      w: c.w,
      flip: !!c.flip,
      rot: c.rot ?? 0,
      z: order + 1,
      ratio: art.h / art.w,
      row: c.row,
      part: partFor(design, c.x, c.y, c.row),
      // 씨앗 대신 차례로 흩음 — 구름마다 흐르는 주기 · 위상 · 방향이 다르게(이동은 1 vmax 안 = iPad 에서 몇 px)
      drift: {
        periodS: r1(7 + ((order * 7) % 5)),
        phaseS: -r1((order * 3.7) % 7),
        dx: r1(((order % 3) - 1) * 0.6 || 0.4),
        dy: r1(((order % 2) * 2 - 1) * 0.3),
      },
    };
  });
}

export function isSky(v: unknown): v is Sky {
  return v === "dense" || v === "mid" || v === "sparse";
}

export function isDesign(v: unknown): v is CoverDesign {
  return v === "a" || v === "b" || v === "c";
}
