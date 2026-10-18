import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CAP_MS,
  MIN_SHOW_MS,
  PART_MS,
  REDUCED_PART_MS,
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
    const d = decideCover({ mountedAt, readyAt, now: performance.now(), timing });
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
  it("ready 가 일찍 와도 그리기 최소(0.6 초) 뒤에 펴진다", () => {
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

  it("두 번째 짧은 판: 최소 보임 없이 0.3 초 펴지기", () => {
    const log = run(timingFor("short"), 10);
    vi.advanceTimersByTime(2000);
    expect(log[1].at).toBeCloseTo(10, 0);
    expect(log[2].at - log[1].at).toBeCloseTo(SHORT_PART_MS, 0);
  });

  it("동작 줄이기: 0.2 초 사라지기만", () => {
    const log = run(timingFor("reduced"), 10);
    vi.advanceTimersByTime(2000);
    expect(log[2].at - log[1].at).toBeCloseTo(REDUCED_PART_MS, 0);
  });
});

describe("pickMode", () => {
  it("동작 줄이기가 두 번째보다 먼저", () => {
    expect(pickMode({ reducedMotion: true, seenBefore: true })).toBe("reduced");
    expect(pickMode({ reducedMotion: false, seenBefore: true })).toBe("short");
    expect(pickMode({ reducedMotion: false, seenBefore: false })).toBe("full");
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
