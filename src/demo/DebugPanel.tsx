// ?debug=1 일 때만 — 펴지기 동안 프레임 수 · 가장 긴 프레임 간격 · 50 ms 넘은 프레임 수 ·
// 지도 준비(idle) · 준비 신호 · 펴지기 시작 · 끝 시각(페이지 연 때부터 ms) · devicePixelRatio.
import { useEffect, useState } from "react";
import type { DemoParams } from "./params";

interface Marks {
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

export function DebugPanel({ params, ready, idleAt }: { params: DemoParams; ready: boolean; idleAt: number | null }) {
  const [marks, setMarks] = useState<Marks>(() => blank());

  useEffect(() => {
    const m = blank();
    window.__coverMarks = m;
    // 펴지기 시작 · 끝 시각은 data-phase 변화로 잰다 — 메인 스레드가 막혀 rAF 가 한 번도 안 돌아도 놓치지 않게
    const watch = () => {
      const phase = document.querySelector<HTMLElement>(".cloudcover")?.dataset.phase ?? "gone";
      if (phase !== "draw" && m.partAt === null) m.partAt = performance.now();
      if (phase === "gone" && m.partAt !== null && m.goneAt === null) m.goneAt = performance.now();
    };
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-phase"] });
    // 프레임 간격: 한 프레임 구간이 펴지기 구간과 겹치면 펴지기 중 프레임으로 센다
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const gap = t - last;
      const overlapsPart = m.partAt !== null && t > m.partAt && last < (m.goneAt ?? Infinity);
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
    if (window.__coverMarks && idleAt !== null) window.__coverMarks.idleAt = idleAt;
  }, [idleAt]);

  useEffect(() => {
    if (ready && window.__coverMarks && window.__coverMarks.readyAt === null) window.__coverMarks.readyAt = performance.now();
  }, [ready]);

  const base = new URLSearchParams(window.location.search);
  const link = (design: string) => {
    const q = new URLSearchParams(base);
    q.set("design", design);
    q.set("fresh", "1");
    return `?${q.toString()}`;
  };

  return (
    <div className="demo-debug" aria-hidden="true">
      {`시안 ${params.design} · devicePixelRatio ${window.devicePixelRatio}\n`}
      {`지도 idle ${ms(marks.idleAt)} · 준비 ${ms(marks.readyAt)} · 펴지기 ${ms(marks.partAt)} → ${ms(marks.goneAt)} ms\n`}
      {`펴지기 중 프레임 ${marks.partFrames} · 가장 긴 간격 ${ms(marks.maxGapPart)} ms · ${SLOW_FRAME_MS} ms 넘은 것 ${marks.slowFramesPart}\n`}
      {`(페이지 전체 가장 긴 간격 ${ms(marks.maxGap)} ms)\n`}
      <span className="demo-debug-note">
        {"프레임 간격은 메인 스레드 기준 — transform · opacity 펴지기는 합성 단계라\n숫자가 나빠도 눈엔 부드러울 수 있음 · 판정은 눈이 먼저\n"}
      </span>
      <a href={link("a")}>a</a>
      <a href={link("b")}>b</a>
      <a href={link("c")}>c</a>
      <a href={window.location.search}>새로고침</a>
    </div>
  );
}

function blank(): Marks {
  return { idleAt: null, readyAt: null, partAt: null, goneAt: null, maxGap: 0, partFrames: 0, maxGapPart: 0, slowFramesPart: 0 };
}
