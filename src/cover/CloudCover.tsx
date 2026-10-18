// 첫 접속 · 새로고침 로딩 덮개 — 연필로 구름을 그리다가, 준비되면 구름이 펴지며 지도가 드러난다.
// 이 폴더(src/cover)는 본 프로젝트로 그대로 옮겨 붙인다: react 밖을 import 하지 않고, 전역 CSS 를 건드리지 않는다.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./cloudcover.css";
import { buildClouds, CLOUD_H, CLOUD_W, type CoverDesign } from "./cloudshape";
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
  /** 시안 고르기(시안 단계에서만 · 고른 뒤 뺀다) */
  design?: CoverDesign;
  /** 동작 줄이기를 밖에서 정함 — 없으면 prefers-reduced-motion 을 따른다 */
  reducedMotion?: boolean;
}

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

/** 구름 viewBox 둘레 여백 — 굴곡 · 굵기가 잘리지 않게 */
const VIEW_PAD = 10;
const VIEW_W = CLOUD_W + VIEW_PAD * 2;
const VIEW_H = CLOUD_H + VIEW_PAD * 2;

const session = () => (typeof window === "undefined" ? null : window.sessionStorage);

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 그리던 선을 지금 모습 그대로 멈춘다. 펴지기 동안에는 transform · opacity 애니메이션만 돌게 하려는 것 —
 * stroke-dashoffset 은 메인 스레드에서 돌고, 펴지는 순간은 덮개 밑에서 지도가 그려져 메인 스레드가 가장 바쁘다.
 * commitStyles() 는 쓰지 않는다: WebKit 에서 끝난 애니메이션 몇 개의 값을 처음 값(opacity 0)으로 남겼다.
 * 대신 지금 계산된 값을 한꺼번에 읽고 → inline 으로 쓰고 → 애니메이션을 끈다(읽기를 먼저 몰아 스타일 계산은 한 번).
 */
function freezeDrawing(root: HTMLElement | null): void {
  if (!root) return;
  const strokes = [...root.querySelectorAll<SVGElement>(".cloudcover-stroke")];
  // 채움 · 빗금 묶음은 opacity 로 나타난다
  const fills = [...root.querySelectorAll<SVGElement>(".cloudcover-fill, .cloudcover-hatch")];
  const offsets = strokes.map((el) => getComputedStyle(el).strokeDashoffset);
  const opacities = fills.map((el) => getComputedStyle(el).opacity);
  strokes.forEach((el, i) => el.style.setProperty("stroke-dashoffset", offsets[i]));
  fills.forEach((el, i) => el.style.setProperty("opacity", opacities[i]));
  for (const el of [...strokes, ...fills]) for (const anim of el.getAnimations()) anim.cancel();
}

export function CloudCover({ ready, note = null, capMs, onGone, design = "a", reducedMotion }: CloudCoverProps) {
  const [mountedAt] = useState(() => performance.now());
  const [mode] = useState(() =>
    pickMode({ reducedMotion: reducedMotion ?? prefersReducedMotion(), seenBefore: readSeen(session) }),
  );
  const timing = useMemo(() => timingFor(mode, capMs), [mode, capMs]);
  const clouds = useMemo(() => (mode === "reduced" ? [] : buildClouds(design)), [mode, design]);

  // 준비 신호는 한 번 켜지면 그대로 둔다(다시 꺼져도 덮개를 되살리지 않는다)
  const [readyAt, setReadyAt] = useState<number | null>(null);
  useEffect(() => {
    if (ready && readyAt === null) setReadyAt(performance.now());
  }, [ready, readyAt]);

  const rootRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<CoverPhase>("draw");
  const [decision, setDecision] = useState<CoverDecision>({ phase: "draw", partAt: null, reason: null, waitMs: null });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const d = decideCover({ mountedAt, readyAt, now: performance.now(), timing });
      if (d.phase !== "draw" && phaseRef.current === "draw") {
        freezeDrawing(rootRef.current);
        markSeen(session);
      }
      phaseRef.current = d.phase;
      setDecision(d);
      if (d.waitMs !== null) timer = setTimeout(step, d.waitMs);
    };
    step();
    return () => clearTimeout(timer);
  }, [mountedAt, readyAt, timing]);

  const goneCalled = useRef(false);
  useEffect(() => {
    if (decision.phase === "gone" && !goneCalled.current) {
      goneCalled.current = true;
      onGone?.();
    }
  }, [decision.phase, onGone]);

  if (decision.phase === "gone") return null;

  const rootStyle: CSSVars = { "--cloudcover-part-ms": `${timing.partMs}ms` };

  return (
    <div
      ref={rootRef}
      className="cloudcover"
      style={rootStyle}
      data-phase={decision.phase}
      data-mode={mode}
      data-design={design}
      data-reason={decision.reason ?? undefined}
      role="progressbar"
      aria-label="지도를 불러오는 중"
      aria-busy={decision.phase === "draw"}
    >
      <div className="cloudcover-sheet" />
      {clouds.map((c) => {
        const pieceStyle: CSSVars = {
          "--x": `${c.x}%`,
          "--y": `${c.y}%`,
          // 큰 화면에서 레이어가 끝없이 커지지 않게 상한(px)
          "--w": `min(${c.w}vw, ${c.w * 14}px)`,
          "--ratio": VIEW_H / VIEW_W,
          "--dx": c.part.dx,
          "--dy": c.part.dy,
          "--s": c.part.scale,
          "--o": c.part.opacity,
          "--lag": c.part.lag,
        };
        const driftStyle: CSSVars = { "--drift-s": `${c.drift.periodS}s`, "--drift-phase": `${c.drift.phaseS}s` };
        return (
          <div key={c.id} className="cloudcover-piece" style={pieceStyle}>
            <div className="cloudcover-drift" style={driftStyle}>
              <svg
                className="cloudcover-svg"
                viewBox={`${-VIEW_PAD} ${-VIEW_PAD} ${VIEW_W} ${VIEW_H}`}
                style={{ "--lw": c.lineWidth } as CSSVars}
                aria-hidden="true"
              >
                <path className="cloudcover-fill" d={c.fill} style={{ "--f": `${c.fillAtMs}ms` } as CSSVars} />
                {c.strokes.map((s, i) =>
                  s.kind === "hatch" ? (
                    // 빗금 묶음 = path 하나(선분 여럿) · 그어지지 않고 묶음째 나타난다
                    <path
                      key={i}
                      className="cloudcover-hatch"
                      d={s.d}
                      style={{ "--d": `${s.delayMs}ms`, "--t": `${s.durMs}ms` } as CSSVars}
                    />
                  ) : (
                    <path
                      key={i}
                      className={`cloudcover-stroke cloudcover-stroke-${s.kind}`}
                      d={s.d}
                      pathLength={1}
                      style={{ "--d": `${s.delayMs}ms`, "--t": `${s.durMs}ms` } as CSSVars}
                    />
                  ),
                )}
              </svg>
            </div>
          </div>
        );
      })}
      {note ? (
        <p className="cloudcover-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
