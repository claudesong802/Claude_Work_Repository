// 덮개의 시간 · 갈래 판정. DOM 을 만지지 않는다 — 시각(now)과 저장소(storage)는 밖에서 받는다.
// 화면(CloudCover.tsx)은 이 판정이 말하는 장면을 그리고, waitMs 뒤에 다시 묻기만 한다.

/**
 * full = 첫 접속 · short = 같은 창 두 번째(같은 꼴을 짧게).
 * 두 갈래 모두 같은 꼴(B+): 구름은 흐르지 않고 덮개가 뜬 때부터 보이며, 준비되면 가운데부터 조금만 벌어지며 옅어진다.
 * 기기 「동작 줄이기」 는 갈래를 바꾸지 않는다 — B+ 가 원래 그 설정을 위해 만든 움직임(큰 확대 · 날아감 없음)이고,
 * 사용자가 10-19 이 꼴을 모두에게 쓰기로 정했다(「모두 B+, 영상은 빼기」).
 */
export type CoverMode = "full" | "short";

/** draw = 그리기(로딩 중) · part = 펴지기 · gone = 다 사라짐(DOM 에서 뺌) */
export type CoverPhase = "draw" | "part" | "gone";

export interface CoverTiming {
  /** 구름이 보이기 시작한 뒤 이보다 먼저는 펴지지 않는다 — 빨리 준비돼도 구름이 보이고 걷히게 */
  minShowMs: number;
  /** 구름 그림이 이만큼 안 오면 기다리지 않고 그리기를 시작한다 */
  artWaitMs: number;
  /** 펴지기 길이 — 준비가 빨리 오든 늦게 오든 같다 */
  partMs: number;
  /** 준비 신호가 이만큼 안 오면 그냥 편다 — 구름 뒤에 갇히지 않게 */
  capMs: number;
}

/** 첫 접속: 구름을 이만큼은 보인다(B+ 의 최소 보임 그대로) */
export const MIN_SHOW_MS = 400;
/** 첫 접속 펴지기 길이(B+ 그대로 · 움직임 크기는 cloudcover.css cloudcover-part-soft) */
export const PART_MS = 600;
/**
 * 같은 창 두 번째 펴지기 길이 — 첫 접속 0.6 초의 2/3(60 Hz 에서 24 프레임).
 * 늦게 출발하는 몫(최대 펴지기 길이의 15 %)을 빼도 모서리 구름이 0.34 초 움직여 「벌어지며」 가 읽힌다.
 * 예전 두 번째 0.3 초(PNG 큰 펴짐)는 이동이 작은 B+(6 %)에선 옅어지기만으로 보일 수 있어 쓰지 않았다 — iPad 에서 눈으로 확인할 값.
 */
export const SHORT_PART_MS = 400;
export const DEFAULT_CAP_MS = 15000;
export const ART_WAIT_MS = 1200;

/** 같은 창에서 덮개를 이미 한 번 다 봤다는 표시(sessionStorage 열쇠) */
export const SEEN_KEY = "cloudcover-seen";

export function pickMode(opts: { seenBefore: boolean }): CoverMode {
  return opts.seenBefore ? "short" : "full";
}

export function timingFor(mode: CoverMode, capMs: number = DEFAULT_CAP_MS): CoverTiming {
  switch (mode) {
    case "full":
      return { minShowMs: MIN_SHOW_MS, artWaitMs: ART_WAIT_MS, partMs: PART_MS, capMs };
    case "short":
      return { minShowMs: 0, artWaitMs: 0, partMs: SHORT_PART_MS, capMs };
  }
}

export interface CoverDecision {
  phase: CoverPhase;
  /** 펴지기를 시작하는(시작한) 시각 — 아직 모르면 null(준비 신호 전 · 상한 전) */
  partAt: number | null;
  /** 왜 펴졌나 — 준비 신호 · 상한 */
  reason: "ready" | "cap" | null;
  /** 이만큼 뒤에 다시 물어야 장면이 바뀐다 — gone 이면 null */
  waitMs: number | null;
}

/** 그리기가 시작된(될) 시각 — 그림이 준비된 때, 늦어도 덮개가 뜬 뒤 artWaitMs */
export function drawStart(mountedAt: number, artAt: number | null, timing: CoverTiming): number {
  return Math.min(artAt ?? Infinity, mountedAt + timing.artWaitMs);
}

/**
 * 지금 어떤 장면인가.
 * 펴지기 시작 = max(준비 시각, 그리기 시작 + 최소 보임) 이되 덮개가 뜬 때 + 상한 을 넘지 않는다.
 * 준비가 상한 뒤에 와도 이미 상한에 펴진 것이 바뀌지 않는다(같은 식이 같은 답을 낸다).
 */
export function decideCover(input: {
  mountedAt: number;
  /** 구름 그림이 준비된 시각(아직이면 null) — 없으면 mountedAt + artWaitMs 로 본다 */
  artAt?: number | null;
  readyAt: number | null;
  now: number;
  timing: CoverTiming;
}): CoverDecision {
  const { mountedAt, readyAt, now, timing } = input;
  const capAt = mountedAt + timing.capMs;
  const minAt = drawStart(mountedAt, input.artAt ?? null, timing) + timing.minShowMs;

  let partAt: number | null;
  let reason: CoverDecision["reason"];
  if (readyAt !== null && Math.max(readyAt, minAt) < capAt) {
    partAt = Math.max(readyAt, minAt);
    reason = "ready";
  } else if (readyAt !== null || now >= capAt) {
    partAt = capAt;
    reason = "cap";
  } else {
    // 준비 신호를 기다리는 중 — 다음으로 볼 시각은 상한
    return { phase: "draw", partAt: null, reason: null, waitMs: capAt - now };
  }

  const goneAt = partAt + timing.partMs;
  if (now < partAt) return { phase: "draw", partAt, reason, waitMs: partAt - now };
  if (now < goneAt) return { phase: "part", partAt, reason, waitMs: goneAt - now };
  return { phase: "gone", partAt, reason, waitMs: null };
}

/** sessionStorage 꼴 — 시험에서는 가짜를 넘긴다 */
export interface SeenStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 막혀 있거나(사생활 창 · 설정) 없으면 「처음」 으로 본다 — 덮개는 언제나 정상으로 뜬다 */
export function readSeen(store: () => SeenStore | null | undefined): boolean {
  try {
    return store()?.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSeen(store: () => SeenStore | null | undefined): void {
  try {
    store()?.setItem(SEEN_KEY, "1");
  } catch {
    // 못 써도 다음 접속이 첫 접속 꼴로 뜰 뿐이다
  }
}
