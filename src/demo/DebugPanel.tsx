// ?debug=1 일 때만 — 지난 프레임 간격 최대 · 펴지기 시작 · 끝 시각(페이지 연 때부터 ms).
import { useEffect, useState } from "react";
import type { DemoParams } from "./params";

interface Marks {
  readyAt: number | null;
  partAt: number | null;
  goneAt: number | null;
  maxGap: number;
  maxGapPart: number;
}

declare global {
  interface Window {
    /** e2e 와 진단이 같이 읽는 기록 */
    __coverMarks?: Marks;
  }
}

const ms = (v: number | null) => (v === null ? "—" : `${Math.round(v)}`);

export function DebugPanel({ params, ready }: { params: DemoParams; ready: boolean }) {
  const [marks, setMarks] = useState<Marks>({ readyAt: null, partAt: null, goneAt: null, maxGap: 0, maxGapPart: 0 });

  useEffect(() => {
    if (!ready) return;
    const at = performance.now();
    if (window.__coverMarks && window.__coverMarks.readyAt === null) window.__coverMarks.readyAt = at;
    setMarks((m) => (m.readyAt === null ? { ...m, readyAt: at } : m));
  }, [ready]);

  useEffect(() => {
    const m: Marks = { readyAt: null, partAt: null, goneAt: null, maxGap: 0, maxGapPart: 0 };
    window.__coverMarks = m;
    let last = performance.now();
    let raf = 0;
    let phase: string | null = null;
    const tick = (t: number) => {
      const gap = t - last;
      last = t;
      const el = document.querySelector<HTMLElement>(".cloudcover");
      const now = el?.dataset.phase ?? "gone";
      if (now !== phase) {
        if (now === "part") m.partAt = t;
        if (now === "gone" && m.goneAt === null) m.goneAt = t;
        phase = now;
      }
      m.maxGap = Math.max(m.maxGap, gap);
      if (phase === "part") m.maxGapPart = Math.max(m.maxGapPart, gap);
      setMarks({ ...m });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const base = new URLSearchParams(window.location.search);
  const link = (design: string) => {
    const q = new URLSearchParams(base);
    q.set("design", design);
    q.set("fresh", "1");
    return `?${q.toString()}`;
  };

  return (
    <div className="demo-debug" aria-hidden="true">
      {`시안 ${params.design} · 프레임 간격 최대 ${ms(marks.maxGap)} ms (펴지기 중 ${ms(marks.maxGapPart)})\n`}
      {`준비 ${ms(marks.readyAt)} · 펴지기 ${ms(marks.partAt)} → ${ms(marks.goneAt)} ms\n`}
      <a href={link("a")}>a</a>
      <a href={link("b")}>b</a>
      <a href={link("c")}>c</a>
      <a href={window.location.search}>새로고침</a>
    </div>
  );
}
