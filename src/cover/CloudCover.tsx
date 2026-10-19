// 첫 접속 · 새로고침 로딩 덮개(B+) — 손그림 구름 PNG 를 겹쳐 화면을 덮고(흐름 없음), 지도가 준비되면
// 가운데 구름부터 조금만 벌어지며 옅어져 지도가 드러난다(구름이 자연스럽게 걷히는 느낌).
// 사용자 10-19 「모두 B+, 영상은 빼기」 — 처음엔 기기 「동작 줄이기」 용으로 만든 꼴이었으나 모두에게 쓰고, 영상 덮개는 걷었다.
// 기기 「동작 줄이기」 는 갈래를 바꾸지 않는다(큰 확대 · 날아가는 움직임이 원래 없음).
// 구름은 첫 화면부터 — 코드에 든 흐린 미리보기(cloudblur)로 바로 띄우고, 선명한 그림이 다 풀리면 겹쳐 나타난다.
// 이 폴더(src/cover)는 본 프로젝트로 그대로 옮겨 붙인다: react 와 이 폴더 밖을 import 하지 않고, 전역 CSS 를 건드리지 않는다.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./cloudcover.css";
import { ART_URL, artReady } from "./cloudart";
import { BLUR_URL } from "./cloudblur";
import { buildClouds } from "./cloudshape";
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
  /** 펴지기가 시작될 때 한 번(펴지기 길이 ms) */
  onPartStart?: (partMs: number) => void;
}

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

const session = () =>
  typeof window === "undefined" ? null : window.sessionStorage;

export function CloudCover({
  ready,
  note = null,
  capMs,
  onGone,
  onPartStart,
}: CloudCoverProps) {
  const [mountedAt] = useState(() => performance.now());
  // 같은 창 두 번째(새로고침)는 같은 꼴을 짧게 — 최소 보임 없이 · 펴짐 0.4 초
  const [mode] = useState(() => pickMode({ seenBefore: readSeen(session) }));
  const timing = useMemo(() => timingFor(mode, capMs), [mode, capMs]);
  const clouds = useMemo(() => buildClouds(), []);

  // 흐린 미리보기는 코드에 들어 있어 덮개가 뜬 때부터 구름이 보인다 — 「구름이 보이기 시작한 때」 = 덮개가 뜬 때
  const artAt = mountedAt;
  // 선명한 그림(assets/*.webp)은 이때 받기 · 해독을 시작하고(cloudart), 다 풀리면 겹쳐 나타난다
  const [sharp, setSharp] = useState(false);
  useEffect(() => {
    let live = true;
    void artReady().then(() => live && setSharp(true));
    return () => {
      live = false;
    };
  }, []);

  // 준비 신호는 한 번 켜지면 그대로 둔다(다시 꺼져도 덮개를 되살리지 않는다)
  const [readyAt, setReadyAt] = useState<number | null>(null);
  useEffect(() => {
    if (ready && readyAt === null) setReadyAt(performance.now());
  }, [ready, readyAt]);

  const phaseRef = useRef<CoverPhase>("draw");
  const [decision, setDecision] = useState<CoverDecision>({
    phase: "draw",
    partAt: null,
    reason: null,
    waitMs: null,
  });
  const onPartStartRef = useRef(onPartStart);
  onPartStartRef.current = onPartStart;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const d = decideCover({
        mountedAt,
        artAt,
        readyAt,
        now: performance.now(),
        timing,
      });
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

  return (
    <div
      className="cloudcover"
      style={rootStyle}
      data-phase={decision.phase}
      data-mode={mode}
      data-reason={decision.reason ?? undefined}
      data-shown="1"
      data-sharp={sharp ? "1" : undefined}
      role="progressbar"
      aria-label="지도를 불러오는 중"
      aria-busy={decision.phase === "draw"}
    >
      <div className="cloudcover-sheet" />
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
            "--lag": c.part.lag,
          };
          const artStyle: CSSVars = {
            "--rot": `${c.rot}deg`,
            "--flip": c.flip ? -1 : 1,
          };
          return (
            <div
              key={c.id}
              className="cloudcover-piece"
              style={pieceStyle}
              data-art={c.art}
            >
              <img
                className="cloudcover-art cloudcover-blur"
                src={BLUR_URL[c.art]}
                alt=""
                draggable={false}
                style={artStyle}
              />
              <img
                className="cloudcover-art cloudcover-sharp"
                src={ART_URL[c.art]}
                alt=""
                draggable={false}
                style={artStyle}
              />
            </div>
          );
        })}
      </div>
      {note ? (
        <p className="cloudcover-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
