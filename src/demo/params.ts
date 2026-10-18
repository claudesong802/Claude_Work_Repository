// 시연 주소 칸 읽기 — 로딩 갈래를 흉내 낸다(README 의 표와 같다). 옮겨 붙이지 않는 몫.
import { isDesign, isSky, type CoverDesign, type Sky } from "../cover/cloudshape";

export interface DemoParams {
  /** 지도 idle 뒤 준비 신호를 이만큼 늦춤 */
  delayMs: number;
  /** 준비 신호를 아예 안 냄(상한 갈래) */
  hang: boolean;
  /** 처음 이만큼 「서버 준비 중」 — 그동안은 준비 신호도 안 냄 */
  warmMs: number;
  /** 동작 줄이기 흉내(prefers-reduced-motion 과 같은 갈래) */
  reduced: boolean;
  /** 기기의 「동작 줄이기」 를 무시하고 첫 접속 모습을 강제로(motion=full) — iPad 설정을 바꾸지 않고 구름을 볼 때 */
  forceMotion: boolean;
  /** sessionStorage 표시를 지우고 첫 접속처럼 */
  fresh: boolean;
  design: CoverDesign;
  /** 하늘 결 견줌 — dense(가) · mid(다 · 기본) · sparse(나) */
  sky: Sky;
  /** 구석 진단 */
  debug: boolean;
  /** 상한(ms) — 없으면 덮개 기본값 */
  capMs: number | undefined;
  /** 지도 없이 시계로만 준비 신호(시험용) */
  noMap: boolean;
  /** 덮개 그리는 방식 — png(구름 PNG 조각 · 기본) · video(투명 영상 두 토막) */
  engine: "png" | "video";
  /** 영상 덮개: 기다림 → 걷힘을 언제 잇나 — loop(한 바퀴 끝 · 기본) · now(곧바로) */
  switchAt: "loop" | "now";
}

function num(q: URLSearchParams, key: string): number | undefined {
  const v = q.get(key);
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const on = (q: URLSearchParams, key: string) => q.get(key) === "1";

export function readParams(search: string): DemoParams {
  const q = new URLSearchParams(search);
  const design = q.get("design");
  const sky = q.get("sky");
  return {
    delayMs: num(q, "delay") ?? 0,
    hang: on(q, "hang"),
    warmMs: num(q, "warm") ?? 0,
    reduced: on(q, "reduced"),
    forceMotion: q.get("motion") === "full",
    fresh: on(q, "fresh"),
    design: isDesign(design) ? design : "a",
    sky: isSky(sky) ? sky : "mid",
    debug: on(q, "debug"),
    capMs: num(q, "cap"),
    noMap: on(q, "nomap"),
    engine: q.get("engine") === "video" ? "video" : "png",
    switchAt: q.get("switch") === "now" ? "now" : "loop",
  };
}
