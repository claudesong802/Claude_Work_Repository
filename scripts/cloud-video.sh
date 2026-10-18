#!/bin/sh
# 투명 구름 영상 다시 만들기 — 원본 RGBA PNG 연속 이미지(기다림 72 · 걷힘 24 장 · 1920×1080 · 30 fps)에서
#   WebM(VP9 알파 · 크롬용) 과 HEVC 알파(.mp4 hvc1 · WebKit 용) 를 만들어 src/cover/assets/video/ 에 둔다.
# 쓰는 법: scripts/cloud-video.sh <png 폴더(wait/ · reveal/ 를 담은)>   (macOS · ffmpeg 필요 — HEVC 알파는 VideoToolbox 인코더)
# 값: VP9 crf 38(1920 그대로 — 1280 은 선 가장자리가 뭉개짐 · crf 34/42 견줘 고름) · HEVC q 55 · 알파 품질 0.9 —
#   원본 56 MB(받은 WebM) → WebM 합 1.2 MB · HEVC 합 1.6 MB · 걷힘 프레임마다 불투명 몫이 원본 PNG 와 0.1 % 안쪽(2026-10-19 잼)
set -eu
SRC="$1"
OUT="$(dirname "$0")/../src/cover/assets/video"
mkdir -p "$OUT"
for seg in wait reveal; do
  ffmpeg -hide_banner -loglevel error -y -framerate 30 -i "$SRC/$seg/frame_%04d.png" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 38 -row-mt 1 -deadline good -cpu-used 2 -an "$OUT/$seg.webm"
  ffmpeg -hide_banner -loglevel error -y -framerate 30 -i "$SRC/$seg/frame_%04d.png" \
    -c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 0.9 -q:v 55 -pix_fmt bgra -tag:v hvc1 -movflags +faststart -an "$OUT/$seg.hevc.mp4"
done
# 첫 장면 그림 = 기다림 첫 프레임
python3 -c "from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'WEBP', quality=80, method=6)" \
  "$SRC/wait/frame_0000.png" "$OUT/poster.webp"
ls -l "$OUT"
