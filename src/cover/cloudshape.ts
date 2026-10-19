// 동작 줄이기(B+) 덮개의 구름 배치와 줄인 펴짐 방향. DOM 없음 — 그림 주소는 cloudart.ts · 흐린 미리보기는 cloudblur.ts 가 쥔다.
// 첫 접속 덮개는 영상(VideoCloudCover · 사용자 10-19 영상 방식 선택)이고, 이 배치는 「동작 줄이기」 를 켠 기기만 본다 —
// 손그림 구름 PNG 6장을 겹쳐 화면을 빈틈없이 덮고, 준비되면 가운데 구름부터 화면 중심에서 바깥쪽으로 조금만 벌어지며 옅어진다
// (이동 크기 · 확대는 cloudcover.css cloudcover-part-soft — 여기서는 방향과 늦게 출발하는 몫만).
// 시안 단계에서 견주던 펴지는 꼴 a · b · c · 하늘 결 dense · mid · sparse 는 10-19 정리하며 걷었다(남긴 것: 하늘 mid 배치 · 시안 a 의 방향).

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
  /** 펴지기: 화면 중심 → 구름 자리 방향(CSS 길이 · 첫 접속 크기 80 vmax 기준 — CSS 가 줄여 씀) · 늦게 시작(펴지기 길이에 대한 비율 0~1) */
  part: { dx: string; dy: string; lag: number };
}

/**
 * 덮개 위 구름 자리 — 위에서 아래로 겹겹이, 아래 것이 앞 · 가운데 구름이 맨 앞.
 * 자리 · 크기 · 돌리기는 scripts/cloud-layout.py 가 그림의 실제 알파로 iPad 가로 · 세로 · 폰 · 데스크톱 화면비마다
 * 빈틈을 재며 찾은 값이다 — 손으로 고치면 그 도구를 다시 돌리고 e2e 「빈틈」 으로 확인한다.
 * 같은 그림은 멀리 두고 뒤집기 · 돌리기를 바꿔 나란히 반복돼 보이지 않게 한다.
 */
type Spot = {
  art: ArtName;
  x: number;
  y: number;
  w: number;
  flip?: boolean;
  rot?: number;
  center?: true;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** 화면 가운데에서 떨어진 정도 0(가운데) ~ 1(모서리) */
export function centerDistance(x: number, y: number): number {
  return Math.min(1, Math.hypot((x - 50) / 50, (y - 50) / 50) / Math.SQRT2);
}

/** 가운데 구름부터 먼저 — 모서리 구름은 펴지기 길이의 이만큼 늦게 출발한다(CSS 가 다시 절반으로 줄여 씀) */
export const CENTER_FIRST_LAG = 0.3;

/** 펴지는 방향 — 화면 중심에서 구름 자리 쪽 · 화면 가운데 구름은 제자리에서 옅어짐 */
function partFor(x: number, y: number, center: boolean): Cloud["part"] {
  const lag = r2(centerDistance(x, y) * CENTER_FIRST_LAG);
  if (center) return { dx: "0px", dy: "0px", lag: 0 };
  const vx = x - 50;
  const vy = y - 50;
  const l = Math.hypot(vx, vy) || 1;
  return {
    dx: `${r1((vx / l) * 80)}vmax`,
    dy: `${r1((vy / l) * 80)}vmax`,
    lag,
  };
}

const MID: Spot[] = [
  { art: "original", x: 80, y: 6, w: 57, flip: true, rot: 5 },
  { art: "original", x: 8, y: 6, w: 56, flip: true, rot: -2 },
  { art: "billowy", x: 45, y: 13, w: 56, rot: 2 },
  { art: "wide", x: 10, y: 16, w: 56, rot: -4 },
  { art: "diagonal", x: 106, y: 18, w: 56, flip: true, rot: -2 },
  { art: "wispy", x: 82, y: 25, w: 47, rot: 5 },
  { art: "curled", x: 3, y: 47, w: 58, flip: true, rot: 5 },
  { art: "curled", x: 78, y: 47, w: 56, flip: true, rot: -4 },
  { art: "original", x: 8, y: 47, w: 56, rot: 5 },
  { art: "billowy", x: 74, y: 60, w: 58, rot: 4 },
  { art: "curled", x: 18, y: 75, w: 57 },
  { art: "billowy", x: 32, y: 81, w: 58 },
  { art: "diagonal", x: 78, y: 85, w: 58, rot: 3 },
  { art: "wispy", x: 71, y: 88, w: 52, rot: 1 },
  { art: "wide", x: 88, y: 96, w: 53, flip: true, rot: 1 },
  // 가운데 — 맨 앞에 두어 펴질 때 가장 먼저 커지며 사라진다(가운데가 열림)
  { art: "billowy", x: 47, y: 44, w: 46, flip: true, rot: -5, center: true },
];

export function buildClouds(): Cloud[] {
  return MID.map((c, order) => {
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
      part: partFor(c.x, c.y, !!c.center),
    };
  });
}
