# 구름 덮개 (cloud cover)

「드라이브 코스」 웹앱의 첫 접속 · 새로고침 로딩 덮개를 본 프로젝트와 떼어 만들고 시연하는 저장소입니다.
손그림 구름(사용자가 준 PNG 6장)이 화면을 빈틈없이 덮은 채 천천히 흐르다가, 준비 신호(`map.once("idle")`)가 오면
가운데가 열리며 구름이 커지면서 바깥으로 밀려나 지도가 드러납니다(구름을 뚫고 내려가는 느낌 · 움직임 본보기는 사용자의 영상).

- 덮개(옮겨 붙일 몫): `src/cover/`
- 시연 페이지(옮기지 않음): `src/demo/` — 덮개 밑에 진짜 MapLibre 지도(OpenFreeMap positron)
- 설계 · 길이 · 까닭 · 잰 값: [`docs/DESIGN.md`](docs/DESIGN.md)

## 돌리는 법

Node 26 이 필요합니다(`.nvmrc`).

| 명령 | 하는 일 |
| --- | --- |
| `npm ci` | 의존성 설치 |
| `npm run dev` | 개발 서버(같은 망의 iPad 에서 `http://<맥 주소>:5173/` 로 열림) |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | `dist/` 를 4173 에서 띄움 |
| `npm run typecheck` | 형 검사 |
| `npm test` | 단위 시험(Vitest · 가짜 시계) |
| `npm run e2e` | e2e(Playwright · chromium · webkit · iPad Mini 흉내) — 처음 한 번 `npx playwright install --with-deps chromium webkit` |

GitHub Actions: 푸시 · PR 마다 `검사`(typecheck · build · test · e2e), main 은 `시연 페이지 배포`(GitHub Pages).

### 구름 그림 · 배치 다시 만들기(Python 3 · Pillow · numpy)

| 명령 | 하는 일 |
| --- | --- |
| `python3 scripts/cloud-assets.py` | `assets-src/clouds/*.png`(원본) → `src/cover/assets/cloud-*.webp`(투명 유지 · 안쪽 알파 250 ~ 254 를 255 로 · 긴 변 최대 1600 · q82) |
| `python3 scripts/cloud-layout.py --count 16 --w-min 32 --w-max 58 --center-w-max 46 --iters 8000` | 그림의 실제 알파로 여러 화면비에서 빈틈을 재며 배치를 찾아 `cloudshape.ts` 에 붙일 줄을 찍음(하늘 결마다 값은 DESIGN.md) |

그림을 바꾸면 두 명령을 차례로 돌리고, `cloudshape.ts` 의 `ART` 크기와 배치를 바꾼 뒤 e2e 「빈틈」 으로 확인합니다.

## 시연 주소 칸

| 칸 | 뜻 | 예 |
| --- | --- | --- |
| `design=a\|b\|c` | 펴지는 꼴 — a 영상 그대로(가운데가 열리고 커지며 바깥으로) · b a + 밑의 지도가 1.04 → 1 로 다가옴 · c 가로 띠로 좌우 엇갈려 흘러나감 | `?design=b` |
| `sky=dense\|mid\|sparse` | 하늘 결 견줌 — dense(가) 작은 구름 22 장 · 0.5 초 / mid(다 · 기본) 16 장 · 0.6 초 / sparse(나) 큰 구름 14 장 · 0.8 초 | `?sky=dense` |
| `delay=<ms>` | 지도 idle 뒤 준비 신호를 늦춤(긴 로딩 흉내) | `?delay=4000` |
| `hang=1` | 준비 신호 없음 → 상한에 펴짐 | `?hang=1` |
| `cap=<ms>` | 상한 바꾸기(기본 15000) | `?hang=1&cap=5000` |
| `warm=<ms>` | 그동안 「서버 준비 중」 표시 · 준비 신호도 그 뒤 | `?warm=3000` |
| `reduced=1` | 동작 줄이기 흉내(prefers-reduced-motion 과 같은 갈래) | `?reduced=1` |
| `motion=full` | 기기의 「동작 줄이기」 를 무시하고 첫 접속 모습으로 — iPad 설정(손쉬운 사용 → 동작 → 동작 줄이기)이 켜져 있으면 구름은 흐르지 않고, 준비되면 가운데부터 조금만 벌어지며 0.6 초에 옅어진다(B+ · 사용자 10-19) | `?motion=full` |
| `engine=png\|video` | 덮개 그리는 방식 — png 구름 PNG 조각(기본) · video 투명 영상 두 토막(기다림 반복 → 걷힘) | `?engine=video` |
| `switch=loop\|now` | 영상 덮개: 기다림 → 걷힘을 언제 잇나 — loop 한 바퀴(2.4 초) 끝에서(이음매 없음 · 기본) · now 곧바로(구름 자리가 살짝 튈 수 있음) | `?engine=video&switch=now` |
| `fresh=1` | 같은 창 표시를 지우고 첫 접속처럼 | `?fresh=1` |
| `debug=1` | 구석 진단: 갈래(첫 접속 · 두 번째 · 동작 줄이기)와 기기 동작 줄이기 설정 · 펴지기 중 프레임 수 · 가장 긴 간격 · 50 ms 넘은 프레임 수 · 지도 idle · 준비 · 펴지기 시작 → 끝 시각 · devicePixelRatio, 시안 · 하늘 바꾸기 고리 | `?debug=1` |
| `nomap=1` | 지도 없이 시계로만 준비 신호(시험용) | `?nomap=1&delay=1000` |

새로고침하면 「같은 창 두 번째」 갈래(펴지기만 0.3 초)가 됩니다. 첫 접속 모습을 다시 보려면 `fresh=1` 을 붙입니다.

## 옮겨 붙이는 법(본 프로젝트 `ui/src`)

1. `src/cover/` 폴더를 통째로 복사합니다: `CloudCover.tsx` · `cloudcover.css` · `coverclock.ts` · `cloudshape.ts` · `cloudart.ts` · `assets/cloud-*.webp`(6장 · 518 KB).
   이 폴더는 `react` 와 폴더 안 파일 밖을 import 하지 않고, 전역 CSS 를 건드리지 않습니다(클래스 앞머리 `cloudcover-`).
   그림은 Vite 의 자산 import 로 불러 해시 붙은 주소로 함께 배포됩니다.
2. 지도 위에 얹습니다.

   ```tsx
   const [mapReady, setMapReady] = useState(false);
   const [coverGone, setCoverGone] = useState(false);
   // 지도 만든 곳에서 — "load" 가 아니라 "idle"(타일까지 다 그려진 뒤)
   map.once("idle", () => setMapReady(true));

   {coverGone ? null : (
     <CloudCover
       ready={mapReady}
       note={serverWarming ? "서버 준비 중" : null}  // /api 503 동안
       onGone={() => setCoverGone(true)}
     />
   )}
   ```

   | prop | 꼴 | 뜻 |
   | --- | --- | --- |
   | `ready` | `boolean` | 지도가 다 그려짐(idle). 한 번 켜지면 다시 꺼져도 덮개를 되살리지 않음 |
   | `note` | `string \| null` | 덮개 아래 한 줄. 없으면 안 보임 |
   | `capMs` | `number` | 상한 — 기본 15000 |
   | `onGone` | `() => void` | 덮개가 다 사라진 뒤 한 번 |
   | `onPartStart` | `(partMs: number) => void` | 펴지기가 시작될 때 한 번 — 시안 b 처럼 밑의 지도를 같이 움직일 때(지도 컨테이너에 `scale(1.04) → 1` 을 partMs 동안) |
   | `design` | `"a" \| "b" \| "c"` | 시안 단계에서만 — 고른 뒤 뺌 |
   | `sky` | `"dense" \| "mid" \| "sparse"` | 시안 단계에서만 — 고른 뒤 하나만 남김 |
   | `reducedMotion` | `boolean` | 동작 줄이기를 밖에서 정함(없으면 media query) — 켜지면 구름은 보이되 흐름 없이, 조금만 벌어지며 옅어진다(줄인 펴짐) |

3. 덮개가 지도 묶음을 기다리지 않게 maplibre 를 `import()` 로 늦게 불러오는 편이 좋습니다 — 시연은 이렇게 해서 덮개가 첫 묶음(약 73 KB gzip)과 구름 그림(518 KB)만으로 뜹니다.
   `index.html` 의 `html, body` 바탕도 흰색으로 두면 자바스크립트가 오기 전 화면도 덮개와 같은 색입니다.

## 영상 덮개(VideoCloudCover)

`src/cover/VideoCloudCover.tsx` — PNG 덮개와 같은 판정(`coverclock`)에 투명 영상 두 토막을 얹는다. props 는 `CloudCover` 와 같고 `switchAt`(loop · now) · `kind`(시험용)가 더 있다.

| 파일(`src/cover/assets/video/`) | 크기 | 쓰는 곳 |
| --- | --- | --- |
| `wait.webm` · `reveal.webm` | 533 · 653 KB | 크롬 · 엣지(VP9 알파) |
| `wait.hevc.mp4` · `reveal.hevc.mp4` | 983 · 631 KB | WebKit — 사파리 · iPad · iPhone 의 모든 브라우저(HEVC 알파 · hvc1) |
| `poster.webp` | 161 KB | 기다림 첫 프레임 — 영상 받기 전 · 동작 줄이기 · 영상을 못 틀 때 |

- 형식은 엔진으로 고른다(`cloudvideo.pickVideoKind`) — WebKit 은 WebM 알파를, 크롬은 HEVC 알파를 버린다.
- 원본: 1920×1080 · 30 fps RGBA PNG(기다림 72 · 걷힘 24 장 · 기다림 첫 = 끝 = 걷힘 첫 프레임). 다시 만드는 법은 `scripts/cloud-video.sh`.
- 저전력 모드 · 형식을 못 읽음 → 첫 장면 그림이 커지며 사라지는 대체 길(`data-fallback`).
- 동작 줄이기 → 영상(크게 확대되며 날아감)을 쓰지 않고 구름 조각 덮개(`CloudCover`)의 줄인 펴짐으로 넘긴다. 그 갈래에서만 따로 불러온다(`lazy`) — 영상만 쓰는 앱이면 보통 사용자는 PNG 구름을 받지 않는다(시연 페이지는 두 방식을 다 불러 Vite 가 「INEFFECTIVE_DYNAMIC_IMPORT」 경고를 낸다).

## 흐린 미리보기 구름

`src/cover/cloudblur.ts` — 만든 파일(`scripts/cloud-assets.py` 가 씀 · 손으로 고치지 않음). 구름 6장을 긴 변 200 px WebP 로 줄여 data URL 로 싣는다(34 KB).
덮개는 첫 화면부터 이 흐린 구름을 띄우고, 선명한 그림이 다 풀리면 그 위에 겹쳐 나타난다(`data-sharp`) — 선명한 그림 6장 해독 약 0.3 초 동안 흰 바탕만 보이던 것을 없앰(사용자 10-19).
