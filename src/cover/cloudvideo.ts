// 영상 덮개의 주소 · 형식 고르기. 투명 영상은 브라우저마다 읽는 형식이 다르다 —
//   WebKit(사파리 · iPad · iPhone 의 모든 브라우저) = HEVC 알파(.mp4 · hvc1) · 그 밖(크롬 · 엣지) = WebM VP9 알파.
// WebKit 은 WebM 을 재생해도 알파를 버리고(흰 네모가 지도를 가림), 크롬은 HEVC 알파의 알파를 버린다 — 그래서 엔진으로 가른다.
import poster from "./assets/video/poster.webp";
import revealHevc from "./assets/video/reveal.hevc.mp4";
import revealWebm from "./assets/video/reveal.webm";
import waitHevc from "./assets/video/wait.hevc.mp4";
import waitWebm from "./assets/video/wait.webm";

export type VideoKind = "hevc" | "webm";

/** 기다림(반복) · 걷힘(한 번) · 첫 장면 그림 — 기다림 첫 프레임 = 끝 프레임 = 걷힘 첫 프레임(원본 RGBA 가 같다) */
export const VIDEO_URL: Record<VideoKind, { wait: string; reveal: string }> = {
  hevc: { wait: waitHevc, reveal: revealHevc },
  webm: { wait: waitWebm, reveal: revealWebm },
};
export const POSTER_URL = poster;

/** 걷힘 영상 길이(30 fps · 24 프레임) — 구름은 0.53 초쯤 다 빠지고 나머지는 빈 화면 */
export const REVEAL_MS = 800;
/** 기다림 영상 한 바퀴(30 fps · 72 프레임) */
export const WAIT_LOOP_MS = 2400;

export function pickVideoKind(nav: { userAgent: string; platform?: string; maxTouchPoints?: number }): VideoKind {
  const ua = nav.userAgent;
  // iPadOS 는 데스크톱 사파리처럼 「Macintosh」 로 자신을 알린다 — 터치 점 수로 가른다
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  const safari = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|Firefox/.test(ua);
  return ios || safari ? "hevc" : "webm";
}
