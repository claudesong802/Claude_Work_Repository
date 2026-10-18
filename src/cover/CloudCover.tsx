// 첫 접속 · 새로고침 로딩 덮개 — 손그림 구름이 화면을 덮은 채 천천히 흐르다가,
// 지도가 준비되면 가운데가 열리며 구름이 커지면서 바깥으로 밀려나 지도가 드러난다(구름을 뚫고 내려가는 느낌).
// 이 폴더(src/cover)는 본 프로젝트로 그대로 옮겨 붙인다: react 와 이 폴더 밖을 import 하지 않고, 전역 CSS 를 건드리지 않는다.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./cloudcover.css";
import { ART_URL, artReady } from "./cloudart";
import { buildClouds, SKY_PART_MS, type CoverDesign, type Sky } from "./cloudshape";
import {
  decideCover,
  markSeen,
  pickMode,
  readSeen,
  timingFor,
  type CoverDecision,
  type CoverPhase,
} from "./coverclock";

export interface CloudCoverProps {
  /** 지도가 다 그려짐 — MapLibre map.once("idle") 로 켠다("load" 가 아님: load 에 걷으면 빈 지도가 보인다) */
  ready: boolean;
  /** 덮개 아래 한 줄(예: 「서버 준비 중」) — 없으면 안 보인다 */
  note?: string | null;
  /** 준비 신호가 이만큼(ms) 안 오면 그냥 편다 */
  capMs?: number;
  /** 덮개가 다 사라진 뒤 한 번 */
  onGone?: () => void;
  /** 펴지기가 시작될 때 한 번(펴지기 길이 ms) — 밑의 지도를 같이 움직이고 싶을 때(시안 b) */
  onPartStart?: (partMs: number) => void;
  /** 시안 고르기(시안 단계에서만 · 고른 뒤 뺀다) — 펴지는 꼴 */
  design?: CoverDesign;
  /** 시안 고르기(시안 단계에서만 · 고른 뒤 뺀다) — 하늘 결(구름 수 · 크기 · 펴지기 길이) */
  sky?: Sky;
  /** 동작 줄이기를 밖에서 정함 — 없으면 prefers-reduced-motion 을 따른다 */
  reducedMotion?: boolean;
}

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

const session = () => (typeof window === "undefined" ? null : window.sessionStorage);

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function CloudCover({
  ready,
  note = null,
  capMs,
  onGone,
  onPartStart,
  design = "a",
  sky = "mid",
  reducedMotion,
}: CloudCoverProps) {
  const [mountedAt] = useState(() => performance.now());
  const [mode] = useState(() =>
    pickMode({ reducedMotion: reducedMotion ?? prefersReducedMotion(), seenBefore: readSeen(session) }),
  );
  const timing = useMemo(() => timingFor(mode, capMs, SKY_PART_MS[sky]), [mode, capMs, sky]);
  const clouds = useMemo(() => (mode === "reduced" ? [] : buildClouds(design, sky)), [mode, design, sky]);

  // 구름을 띄우는 때: 그림이 다 받아져 해독된 때 — 늦어도 artWaitMs 뒤(그림 없이라도 시간은 간다).
  // 그 전에는 불투명한 흰 바탕만(지도가 먼저 비치지 않게). 두 번째 · 동작 줄이기는 기다리지 않는다.
  const [artAt, setArtAt] = useState<number | null>(() => (timing.artWaitMs === 0 ? mountedAt : null));
  useEffect(() => {
    if (artAt !== null) return;
    let done = false;
    const start = () => {
      if (done) return;
      done = true;
      setArtAt(performance.now());
    };
    const t = setTimeout(start, Math.max(0, mountedAt + timing.artWaitMs - performance.now()));
    void artReady().then(start);
    return () => {
      done = true;
      clearTimeout(t);
    };
  }, [artAt, mountedAt, timing.artWaitMs]);

  // 준비 신호는 한 번 켜지면 그대로 둔다(다시 꺼져도 덮개를 되살리지 않는다)
  const [readyAt, setReadyAt] = useState<number | null>(null);
  useEffect(() => {
    if (ready && readyAt === null) setReadyAt(performance.now());
  }, [ready, readyAt]);

  const phaseRef = useRef<CoverPhase>("draw");
  const [decision, setDecision] = useState<CoverDecision>({ phase: "draw", partAt: null, reason: null, waitMs: null });
  const onPartStartRef = useRef(onPartStart);
  onPartStartRef.current = onPartStart;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const d = decideCover({ mountedAt, artAt, readyAt, now: performance.now(), timing });
      if (d.phase !== "draw" && phaseRef.current === "draw") {
        markSeen(session);
        onPartStartRef.current?.(timing.partMs);
      }
      phaseRef.current = d.phase;
      setDecision(d);
      if (d.waitMs !== null) timer = setTimeout(step, d.waitMs);
    };
    step();
    return () => clearTimeout(timer);
  }, [mountedAt, artAt, readyAt, timing]);

  const goneCalled = useRef(false);
  useEffect(() => {
    if (decision.phase === "gone" && !goneCalled.current) {
      goneCalled.current = true;
      onGone?.();
    }
  }, [decision.phase, onGone]);

  if (decision.phase === "gone") return null;

  const rootStyle: CSSVars = { "--cloudcover-part-ms": `${timing.partMs}ms` };
  const shown = artAt !== null;

  return (
    <div
      className="cloudcover"
      style={rootStyle}
      data-phase={decision.phase}
      data-mode={mode}
      data-design={design}
      data-sky={sky}
      data-reason={decision.reason ?? undefined}
      data-shown={shown ? "1" : undefined}
      role="progressbar"
      aria-label="지도를 불러오는 중"
      aria-busy={decision.phase === "draw"}
    >
      <div className="cloudcover-sheet" />
      {shown && clouds.length > 0 ? (
        <div className="cloudcover-sky">
          {clouds.map((c) => {
            const pieceStyle: CSSVars = {
              "--x": `${c.x}%`,
              "--y": `${c.y}%`,
              "--w": `${c.w}vmax`,
              "--ratio": c.ratio,
              "--z": c.z,
              "--dx": c.part.dx,
              "--dy": c.part.dy,
              "--s": c.part.scale,
              "--o": c.part.opacity,
              "--lag": c.part.lag,
            };
            const driftStyle: CSSVars = {
              "--drift-s": `${c.drift.periodS}s`,
              "--drift-phase": `${c.drift.phaseS}s`,
              "--drift-x": `${c.drift.dx}vmax`,
              "--drift-y": `${c.drift.dy}vmax`,
            };
            const artStyle: CSSVars = { "--rot": `${c.rot}deg`, "--flip": c.flip ? -1 : 1 };
            return (
              <div
                key={c.id}
                className="cloudcover-piece"
                style={pieceStyle}
                data-art={c.art}
                data-burst={c.part.opacity === 0 ? "1" : undefined}
              >
                <div className="cloudcover-drift" style={driftStyle}>
                  <img className="cloudcover-art" src={ART_URL[c.art]} alt="" draggable={false} style={artStyle} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {note ? (
        <p className="cloudcover-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
