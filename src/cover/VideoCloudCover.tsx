// 영상 덮개 — 투명 영상 두 토막으로: 기다림(구름이 덮은 채 흐름 · 반복) → 걷힘(가운데가 열리며 구름이 커져 바깥으로 · 한 번).
// 걷힘 영상은 구름이 빠진 자리가 진짜 투명이라 그 밑의 지도가 그대로 드러난다.
// 판정(언제 펴나 · 갈래)은 PNG 덮개와 같은 coverclock 을 쓴다. 다른 것은 「무엇으로 그리나」 뿐.
// 이 폴더(src/cover)는 본 프로젝트로 그대로 옮겨 붙인다: react 와 이 폴더 밖을 import 하지 않고, 전역 CSS 를 건드리지 않는다.
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./cloudcover.css";
import {
  POSTER_URL,
  REVEAL_MS,
  VIDEO_URL,
  WAIT_LOOP_MS,
  pickVideoKind,
  type VideoKind,
} from "./cloudvideo";
import {
  decideCover,
  markSeen,
  pickMode,
  readSeen,
  timingFor,
  type CoverMode,
} from "./coverclock";

export interface VideoCloudCoverProps {
  /** 지도가 다 그려짐 — MapLibre map.once("idle") 로 켠다("load" 가 아님) */
  ready: boolean;
  /** 덮개 아래 한 줄(예: 「서버 준비 중」) */
  note?: string | null;
  /** 준비 신호가 이만큼(ms) 안 오면 그냥 편다 */
  capMs?: number;
  /** 덮개가 다 사라진 뒤 한 번 */
  onGone?: () => void;
  /** 걷힘이 시작될 때 한 번(걷힘 길이 ms) */
  onPartStart?: (partMs: number) => void;
  /** 동작 줄이기를 밖에서 정함 — 없으면 prefers-reduced-motion 을 따른다 */
  reducedMotion?: boolean;
  /**
   * 기다림 → 걷힘을 언제 잇나. loop = 기다림이 한 바퀴 끝나는 자리에서(첫 · 끝 프레임이 같아 이음매가 안 보임 · 최대 2.4 초 더 기다림) ·
   * now = 곧바로(구름 자리가 살짝 튈 수 있음). 시안 단계에서 견주고 하나만 남긴다
   */
  switchAt?: "loop" | "now";
  /** 형식을 밖에서 정함(시험용) — 없으면 브라우저 엔진으로 고른다 */
  kind?: VideoKind;
}

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;
type Phase = "draw" | "part" | "gone";

/** 같은 창 두 번째는 걷힘을 이만큼 빨리 — 0.8 초 영상이 0.5 초에 끝난다 */
const SHORT_RATE = 1.6;
/** 영상을 못 틀 때(저전력 모드 · 형식 못 읽음) 첫 장면 그림을 이만큼 동안 커지며 사라지게 */
const FALLBACK_MS = 450;
/** 걷힘 영상이 끝 신호를 안 줘도 이만큼 넘으면 거둔다 */
const END_SLACK_MS = 1500;

const session = () =>
  typeof window === "undefined" ? null : window.sessionStorage;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function partLength(mode: CoverMode): number {
  if (mode === "short") return Math.round(REVEAL_MS / SHORT_RATE);
  return REVEAL_MS;
}

// 동작 줄이기(B+)는 영상(크게 확대되며 날아감)을 쓰지 않고 구름 조각 덮개의 줄인 펴짐으로 — 그 갈래에서만 따로 불러온다
// (보통 영상 사용자가 PNG 구름까지 받지 않게)
const CloudCoverLazy = lazy(() =>
  import("./CloudCover").then((m) => ({ default: m.CloudCover })),
);

export function VideoCloudCover(props: VideoCloudCoverProps) {
  const [reduced] = useState(
    () => props.reducedMotion ?? prefersReducedMotion(),
  );
  if (!reduced) return <VideoCover {...props} reducedMotion={false} />;
  const { ready, note, capMs, onGone, onPartStart } = props;
  return (
    <Suspense
      fallback={
        <div
          className="cloudcover"
          data-phase="draw"
          data-mode="reduced"
          role="progressbar"
          aria-label="지도를 불러오는 중"
          aria-busy
        >
          <div className="cloudcover-sheet" />
        </div>
      }
    >
      <CloudCoverLazy
        ready={ready}
        note={note}
        capMs={capMs}
        onGone={onGone}
        onPartStart={onPartStart}
        reducedMotion
      />
    </Suspense>
  );
}

function VideoCover({
  ready,
  note = null,
  capMs,
  onGone,
  onPartStart,
  reducedMotion,
  switchAt = "loop",
  kind: kindProp,
}: VideoCloudCoverProps) {
  const [mountedAt] = useState(() => performance.now());
  const [mode] = useState(() =>
    pickMode({
      reducedMotion: reducedMotion ?? prefersReducedMotion(),
      seenBefore: readSeen(session),
    }),
  );
  const [kind] = useState<VideoKind>(
    () => kindProp ?? pickVideoKind(navigator),
  );
  const [timing] = useState(() => timingFor(mode, capMs, partLength(mode)));
  const src = VIDEO_URL[kind];

  const waitRef = useRef<HTMLVideoElement>(null);
  const revealRef = useRef<HTMLVideoElement>(null);

  // 첫 장면이 보이는 때: 첫 장면 그림이 풀렸거나 기다림 영상이 돌기 시작한 때 — 늦어도 artWaitMs 뒤
  const [artAt, setArtAt] = useState<number | null>(() =>
    timing.artWaitMs === 0 ? mountedAt : null,
  );
  const markArt = () => setArtAt((v) => v ?? performance.now());
  useEffect(() => {
    if (artAt !== null) return;
    const t = setTimeout(
      markArt,
      Math.max(0, mountedAt + timing.artWaitMs - performance.now()),
    );
    const img = new Image();
    img.src = POSTER_URL;
    void img.decode().then(markArt, () => undefined);
    return () => clearTimeout(t);
  }, [artAt, mountedAt, timing.artWaitMs]);

  // 영상을 못 틀면(저전력 모드는 자동 재생을 막는다 · 형식을 못 읽음) 첫 장면 그림으로 덮고, 걷힘은 그림이 커지며 사라지는 것으로
  const [stillOnly, setStillOnly] = useState(false);
  useEffect(() => {
    const w = waitRef.current;
    if (!w) return;
    w.play().catch(() => setStillOnly(true));
  }, []);

  const [readyAt, setReadyAt] = useState<number | null>(null);
  useEffect(() => {
    if (ready && readyAt === null) setReadyAt(performance.now());
  }, [ready, readyAt]);

  const [phase, setPhase] = useState<Phase>("draw");
  /** 걷힘 영상이 실제로 돌기 시작함 — 그때 밑의 바탕 · 첫 장면 · 기다림을 걷는다(같은 그림이라 이음매가 안 보인다) */
  const [swapped, setSwapped] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [reason, setReason] = useState<"ready" | "cap" | null>(null);
  const started = useRef(false);
  const onPartStartRef = useRef(onPartStart);
  onPartStartRef.current = onPartStart;

  // 언제 펴나 — PNG 덮개와 같은 판정(최소 보임 · 상한)
  useEffect(() => {
    if (started.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const d = decideCover({
        mountedAt,
        artAt,
        readyAt,
        now: performance.now(),
        timing,
      });
      if (d.phase === "draw") {
        if (d.waitMs !== null) timer = setTimeout(step, d.waitMs);
        return;
      }
      started.current = true;
      setReason(d.reason);
      begin();
    };
    step();
    return () => clearTimeout(timer);
    // begin 은 refs 와 상태 setter 만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountedAt, artAt, readyAt, timing]);

  function startPart(partMs: number) {
    markSeen(session);
    onPartStartRef.current?.(partMs);
    setPhase("part");
  }

  function fallbackFade() {
    setFallback(true);
    startPart(FALLBACK_MS);
    setTimeout(() => setPhase("gone"), FALLBACK_MS);
  }

  function playReveal() {
    const r = revealRef.current;
    if (!r) return fallbackFade();
    const rate = mode === "short" ? SHORT_RATE : 1;
    startPart(timing.partMs);
    r.playbackRate = rate;
    r.currentTime = 0;
    const safety = setTimeout(
      () => setPhase("gone"),
      timing.partMs + END_SLACK_MS,
    );
    r.onended = () => {
      clearTimeout(safety);
      setPhase("gone");
    };
    r.play().catch(() => {
      clearTimeout(safety);
      fallbackFade();
    });
  }

  function begin() {
    if (stillOnlyRef.current) return fallbackFade();
    const w = waitRef.current;
    // 기다림이 아직 안 돌면(받는 중) 이을 바퀴가 없다 — 첫 장면 그림 위에서 곧바로 걷힘
    const waitPlaying = !!w && !w.paused && w.readyState >= 2;
    if (mode === "full" && switchAt === "loop" && w && waitPlaying) {
      // 한 바퀴 끝에서 잇는다 — 반복을 끄면 끝 프레임에서 멈추고(= 걷힘 첫 프레임) ended 가 온다.
      // ended 가 끝내 안 오는 브라우저 · 기기도 있다(CI WebKit 에서 덮개가 8 초 넘게 남은 적이 있음 · 10-19) —
      // 남은 바퀴 + 여유가 지나면 그냥 잇는다. 둘 중 먼저 온 쪽 한 번만
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        playReveal();
      };
      const left = Number.isFinite(w.duration)
        ? ((w.duration - w.currentTime) / (w.playbackRate || 1)) * 1000
        : WAIT_LOOP_MS;
      const safety = setTimeout(go, Math.max(0, left) + END_SLACK_MS);
      w.loop = false;
      w.onended = go;
      if (w.ended) go();
      return;
    }
    playReveal();
  }
  const stillOnlyRef = useRef(stillOnly);
  stillOnlyRef.current = stillOnly;

  const goneCalled = useRef(false);
  useEffect(() => {
    if (phase === "gone" && !goneCalled.current) {
      goneCalled.current = true;
      onGone?.();
    }
  }, [phase, onGone]);

  if (phase === "gone") return null;

  const rootStyle: CSSVars = {
    "--cloudcover-part-ms": `${fallback ? FALLBACK_MS : timing.partMs}ms`,
  };
  const shown = artAt !== null;

  return (
    <div
      className="cloudcover cloudcover--video"
      style={rootStyle}
      data-phase={phase}
      data-mode={mode}
      data-engine="video"
      data-kind={kind}
      data-switch={switchAt}
      data-reason={reason ?? undefined}
      data-shown={shown ? "1" : undefined}
      data-swapped={swapped ? "1" : undefined}
      data-fallback={fallback ? "1" : undefined}
      data-still={stillOnly ? "1" : undefined}
      role="progressbar"
      aria-label="지도를 불러오는 중"
      aria-busy={phase === "draw"}
    >
      <div className="cloudcover-sheet" />
      {/* 첫 장면 그림 — 영상이 돌기 전 · 영상을 못 틀 때 */}
      <img
        className="cloudcover-still"
        src={POSTER_URL}
        alt=""
        draggable={false}
        data-on={shown ? "1" : "0"}
      />
      {mode === "full" ? (
        <video
          ref={waitRef}
          className="cloudcover-video"
          data-role="wait"
          src={src.wait}
          data-on={shown && !stillOnly ? "1" : "0"}
          muted
          playsInline
          loop
          autoPlay
          preload="auto"
          disablePictureInPicture
          onPlaying={markArt}
          onError={() => setStillOnly(true)}
        />
      ) : null}
      <video
        ref={revealRef}
        className="cloudcover-video"
        data-role="reveal"
        src={src.reveal}
        data-on={swapped ? "1" : "0"}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        onPlaying={() => setSwapped(true)}
      />
      {note ? (
        <p className="cloudcover-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
