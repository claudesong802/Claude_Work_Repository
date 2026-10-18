// ?debug=1 일 때만 — 펴지기 동안 프레임 수 · 가장 긴 프레임 간격 · 50 ms 넘은 프레임 수 ·
// 지도 준비(idle) · 준비 신호 · 펴지기 시작 · 끝 시각(페이지 연 때부터 ms) · devicePixelRatio.
import { useEffect, useState } from "react";
import type { DemoParams } from "./params";

interface Marks {
  /** 덮개 갈래(full · short · reduced) — 처음 본 값 */
  mode: string | null;
  /** 영상 덮개: 형식(hevc · webm) · 영상 대신 그림으로 걷었나 */
  kind: string | null;
  fallback: boolean;
  /** 지도 idle 시각(nomap 이면 null) */
  idleAt: number | null;
  /** 덮개에 ready 를 켠 시각(idle · 서버 준비 · delay 뒤) */
  readyAt: number | null;
  partAt: number | null;
  goneAt: number | null;
  /** 페이지 전체에서 가장 긴 프레임 간격 */
  maxGap: number;
  /** 펴지기 동안 */
  partFrames: number;
  maxGapPart: number;
  slowFramesPart: number;
}

declare global {
  interface Window {
    /** e2e 와 진단이 같이 읽는 기록 */
    __coverMarks?: Marks;
  }
}

/** 이보다 긴 프레임은 「느린 프레임」 으로 센다 */
const SLOW_FRAME_MS = 50;

const ms = (v: number | null) => (v === null ? "—" : `${Math.round(v)}`);

export function DebugPanel({
  params,
  ready,
  idleAt,
}: {
  params: DemoParams;
  ready: boolean;
  idleAt: number | null;
}) {
  const [marks, setMarks] = useState<Marks>(() => blank());

  useEffect(() => {
    const m = blank();
    window.__coverMarks = m;
    // 펴지기 시작 · 끝 시각은 data-phase 변화로 잰다 — 메인 스레드가 막혀 rAF 가 한 번도 안 돌아도 놓치지 않게
    const watch = () => {
      const el = document.querySelector<HTMLElement>(".cloudcover");
      if (el && m.mode === null) m.mode = el.dataset.mode ?? null;
      if (el && m.kind === null) m.kind = el.dataset.kind ?? null;
      if (el?.dataset.fallback) m.fallback = true;
      const phase = el?.dataset.phase ?? "gone";
      if (phase !== "draw" && m.partAt === null) m.partAt = performance.now();
      if (phase === "gone" && m.partAt !== null && m.goneAt === null)
        m.goneAt = performance.now();
    };
    const mo = new MutationObserver(watch);
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-phase", "data-fallback"],
    });
    watch();
    // 프레임 간격: 한 프레임 구간이 펴지기 구간과 겹치면 펴지기 중 프레임으로 센다
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const gap = t - last;
      const overlapsPart =
        m.partAt !== null && t > m.partAt && last < (m.goneAt ?? Infinity);
      last = t;
      m.maxGap = Math.max(m.maxGap, gap);
      if (overlapsPart) {
        m.partFrames++;
        m.maxGapPart = Math.max(m.maxGapPart, gap);
        if (gap > SLOW_FRAME_MS) m.slowFramesPart++;
      }
      setMarks({ ...m });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (window.__coverMarks && idleAt !== null)
      window.__coverMarks.idleAt = idleAt;
  }, [idleAt]);

  useEffect(() => {
    if (ready && window.__coverMarks && window.__coverMarks.readyAt === null)
      window.__coverMarks.readyAt = performance.now();
  }, [ready]);

  const base = new URLSearchParams(window.location.search);
  const link = (key: "motion" | "switch", value: string) => {
    const q = new URLSearchParams(base);
    q.set(key, value);
    q.set("fresh", "1");
    return `?${q.toString()}`;
  };

  return (
    <div className="demo-debug" aria-hidden="true">
      {`영상 덮개 · 형식 ${marks.kind ?? "—"} · 잇기 ${params.switchAt === "loop" ? "한 바퀴 끝" : "곧바로"}${marks.fallback ? " · 영상 못 틀어 그림으로 걷음" : ""} · devicePixelRatio ${window.devicePixelRatio}\n`}
      {`갈래 ${MODE_LABEL[marks.mode ?? ""] ?? "—"} · 기기 동작 줄이기 ${reducedSetting() ? "켜짐" : "꺼짐"}\n`}
      {`지도 idle ${ms(marks.idleAt)} · 준비 ${ms(marks.readyAt)} · 펴지기 ${ms(marks.partAt)} → ${ms(marks.goneAt)} ms\n`}
      {`펴지기 중 프레임 ${marks.partFrames} · 가장 긴 간격 ${ms(marks.maxGapPart)} ms · ${SLOW_FRAME_MS} ms 넘은 것 ${marks.slowFramesPart}\n`}
      {`(페이지 전체 가장 긴 간격 ${ms(marks.maxGap)} ms)\n`}
      <span className="demo-debug-note">
        {
          "프레임 간격은 메인 스레드 기준 — transform · opacity 펴지기는 합성 단계라\n숫자가 나빠도 눈엔 부드러울 수 있음 · 판정은 눈이 먼저\n"
        }
      </span>
      <a href={link("motion", "full")}>동작 강제</a>
      <a href={link("switch", "loop")}>바퀴 끝</a>
      <a href={link("switch", "now")}>곧바로</a>
      <a href={window.location.search}>새로고침</a>
    </div>
  );
}

const MODE_LABEL: Record<string, string> = {
  full: "첫 접속",
  short: "같은 창 두 번째",
  reduced: "동작 줄이기(구름 없음)",
};

function reducedSetting(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function blank(): Marks {
  return {
    mode: null,
    kind: null,
    fallback: false,
    idleAt: null,
    readyAt: null,
    partAt: null,
    goneAt: null,
    maxGap: 0,
    partFrames: 0,
    maxGapPart: 0,
    slowFramesPart: 0,
  };
}
