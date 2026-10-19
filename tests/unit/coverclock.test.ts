import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ART_WAIT_MS,
  DEFAULT_CAP_MS,
  MIN_SHOW_MS,
  PART_MS,
  SEEN_KEY,
  SHORT_PART_MS,
  decideCover,
  markSeen,
  pickMode,
  readSeen,
  timingFor,
  type CoverTiming,
  type SeenStore,
} from "../../src/cover/coverclock";

// 가짜 시계로 「덮개가 하는 일」 그대로 흉내: 판정 → waitMs 뒤 다시 판정
function run(timing: CoverTiming, readyAfterMs: number | null) {
  const mountedAt = performance.now();
  let readyAt: number | null = null;
  if (readyAfterMs !== null) setTimeout(() => (readyAt = performance.now()), readyAfterMs);
  const log: { phase: string; at: number }[] = [];
  const step = () => {
    const d = decideCover({ mountedAt, artAt: mountedAt, readyAt, now: performance.now(), timing });
    if (log.at(-1)?.phase !== d.phase) log.push({ phase: d.phase, at: performance.now() - mountedAt });
    if (d.waitMs !== null) setTimeout(step, d.waitMs);
  };
  step();
  // 준비 신호가 오면 덮개가 다시 묻는다(useEffect 의 readyAt 의존)
  if (readyAfterMs !== null) setTimeout(step, readyAfterMs + 0.001);
  return log;
}

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => vi.useRealTimers());

describe("decideCover", () => {
  it("ready 가 일찍 와도 최소 보임(0.4 초) 뒤에 펴진다", () => {
    const log = run(timingFor("full"), 50);
    vi.advanceTimersByTime(5000);
    expect(log.map((l) => l.phase)).toEqual(["draw", "part", "gone"]);
    expect(log[1].at).toBeCloseTo(MIN_SHOW_MS, 0);
    expect(log[2].at - log[1].at).toBeCloseTo(PART_MS, 0);
  });

  it("ready 가 늦게 오면 그때 펴지고 펴지기 길이는 같다", () => {
    const log = run(timingFor("full"), 4000);
    vi.advanceTimersByTime(3999);
    expect(log.at(-1)?.phase).toBe("draw");
    vi.advanceTimersByTime(5000);
    expect(log[1].at).toBeCloseTo(4000, 0);
    expect(log[2].at - log[1].at).toBeCloseTo(PART_MS, 0);
  });

  it("준비 신호가 끝내 없으면 상한에 펴진다", () => {
    const log = run(timingFor("full"), null);
    vi.advanceTimersByTime(DEFAULT_CAP_MS - 1);
    expect(log.at(-1)?.phase).toBe("draw");
    vi.advanceTimersByTime(2);
    expect(log.at(-1)?.phase).toBe("part");
    vi.advanceTimersByTime(PART_MS);
    expect(log.at(-1)?.phase).toBe("gone");
  });

  it("상한 뒤에 온 준비 신호는 이미 시작한 펴지기를 바꾸지 않는다", () => {
    const t = timingFor("full", 2000);
    const at = (now: number, readyAt: number | null) => decideCover({ mountedAt: 0, readyAt, now, timing: t });
    expect(at(2100, null)).toMatchObject({ phase: "part", partAt: 2000, reason: "cap" });
    expect(at(2100, 2050)).toMatchObject({ phase: "part", partAt: 2000, reason: "cap" });
  });

  it("상한 값은 props 로 바뀐다", () => {
    const log = run(timingFor("full", 3000), null);
    vi.advanceTimersByTime(3001);
    expect(log[1]).toMatchObject({ phase: "part" });
    expect(log[1].at).toBeCloseTo(3000, 0);
  });

  it("두 번째 짧은 판: 최소 보임 없이 첫 접속보다 짧게 펴진다(0.4 초)", () => {
    const log = run(timingFor("short"), 10);
    vi.advanceTimersByTime(2000);
    expect(log[1].at).toBeCloseTo(10, 0);
    expect(log[2].at - log[1].at).toBeCloseTo(SHORT_PART_MS, 0);
    expect(SHORT_PART_MS).toBeLessThan(PART_MS);
  });

  it("첫 접속(B+ · 사용자 10-19): 최소 보임 0.4 초 · 펴짐 0.6 초", () => {
    expect(timingFor("full")).toMatchObject({ minShowMs: 400, partMs: 600 });
    expect(MIN_SHOW_MS).toBe(400);
    expect(PART_MS).toBe(600);
  });
});

describe("구름 그림을 기다리는 동안", () => {
  const t = timingFor("full");
  const at = (now: number, artAt: number | null, readyAt: number | null) =>
    decideCover({ mountedAt: 0, artAt, readyAt, now, timing: t });

  it("최소 보임은 그림이 준비돼 그리기가 시작된 때부터 센다", () => {
    expect(at(400 + MIN_SHOW_MS - 100, 400, 100)).toMatchObject({ phase: "draw", partAt: 400 + MIN_SHOW_MS });
    expect(at(400 + MIN_SHOW_MS, 400, 100)).toMatchObject({ phase: "part", partAt: 400 + MIN_SHOW_MS, reason: "ready" });
  });

  it("그림이 끝내 안 와도 1.2 초 뒤엔 그리기를 시작한 것으로 본다", () => {
    expect(at(ART_WAIT_MS + MIN_SHOW_MS - 100, null, 100)).toMatchObject({ phase: "draw", partAt: ART_WAIT_MS + MIN_SHOW_MS });
    expect(at(ART_WAIT_MS + MIN_SHOW_MS, null, 100).phase).toBe("part");
    // 그림이 그 뒤에 와도 시작 시각은 앞당겨지지도 늦춰지지도 않는다
    expect(at(ART_WAIT_MS + MIN_SHOW_MS - 100, 5000, 100).partAt).toBe(ART_WAIT_MS + MIN_SHOW_MS);
  });

  it("상한은 그림과 상관없이 덮개가 뜬 때부터", () => {
    expect(at(DEFAULT_CAP_MS, null, null)).toMatchObject({ phase: "part", reason: "cap", partAt: DEFAULT_CAP_MS });
  });

  it("두 번째는 그림을 기다리지 않는다", () => {
    expect(timingFor("short").artWaitMs).toBe(0);
    expect(decideCover({ mountedAt: 0, artAt: null, readyAt: 10, now: 10, timing: timingFor("short") }).phase).toBe("part");
  });
});

describe("pickMode", () => {
  it("같은 창 표시로만 가른다 — 기기 「동작 줄이기」 는 갈래를 바꾸지 않는다(모두 B+ · 사용자 10-19)", () => {
    expect(pickMode({ seenBefore: true })).toBe("short");
    expect(pickMode({ seenBefore: false })).toBe("full");
  });
});

describe("readSeen · markSeen", () => {
  const mem = (): SeenStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it("쓰고 읽는다", () => {
    const s = mem();
    expect(readSeen(() => s)).toBe(false);
    markSeen(() => s);
    expect(s.data.get(SEEN_KEY)).toBe("1");
    expect(readSeen(() => s)).toBe(true);
  });

  it("저장소가 막혀 있어도 던지지 않고 첫 접속으로 본다", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(readSeen(blocked)).toBe(false);
    expect(() => markSeen(blocked)).not.toThrow();
    const broken: SeenStore = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readSeen(() => broken)).toBe(false);
    expect(() => markSeen(() => broken)).not.toThrow();
    expect(readSeen(() => null)).toBe(false);
  });
});
