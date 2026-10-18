"""손그림 구름 PNG(assets-src/clouds) → 덮개용 WebP(src/cover/assets).

  - 투명 바탕 그대로 · 투명 여백은 잘라 레이어를 작게
  - 구름 안쪽 알파 250~254 를 255 로 — 겹친 뒷구름 선이 희미하게 비치지 않게
  - 긴 변 최대 1600 px(원본보다 키우지 않음) — iPad mini(배율 2)에서 가장 크게 그려지는 구름을 또렷하게
  - WebP q82(알파 q90)
  - 흐린 미리보기: 같은 그림을 긴 변 200 px · WebP q60 으로 줄여 data URL 로 src/cover/cloudblur.ts 에 싣는다 —
    코드와 함께 와서 첫 화면부터 구름이 보인다(선명한 그림 6장 해독 약 0.3 초 동안 흰 바탕만 보이던 것을 없앰 · 사용자 10-19)

돌리는 법: python3 scripts/cloud-assets.py   (Pillow 필요)
"""
import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src" / "clouds"
OUT = ROOT / "src" / "cover" / "assets"

MAX_SIDE = 1600
SOLID_FROM = 250  # 이 알파부터는 불투명으로
BLUR_SIDE = 200  # 흐린 미리보기 긴 변(160 → 6장 base64 합 26 KB · 240 → 44 KB 견줘 고름)
BLUR_TS = ROOT / "src" / "cover" / "cloudblur.ts"

NAMES = {
    "cloud-00-original-video.png": "original",
    "cloud-01-wide.png": "wide",
    "cloud-02-billowy.png": "billowy",
    "cloud-03-diagonal.png": "diagonal",
    "cloud-04-wispy.png": "wispy",
    "cloud-05-curled.png": "curled",
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    blur: dict[str, str] = {}
    for src_name, name in NAMES.items():
        im = Image.open(SRC / src_name).convert("RGBA")
        im = im.crop(im.getchannel("A").getbbox())
        side = max(im.size)
        if side > MAX_SIDE:
            k = MAX_SIDE / side
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        a = im.getchannel("A").point(lambda v: 255 if v >= SOLID_FROM else v)
        im.putalpha(a)
        path = OUT / f"cloud-{name}.webp"
        im.save(path, "WEBP", quality=82, alpha_quality=90, method=6)
        size = path.stat().st_size
        total += size
        print(f"{name}: {im.width}x{im.height} {size // 1024} KB")
        k = BLUR_SIDE / max(im.size)
        small = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        buf = io.BytesIO()
        small.save(buf, "WEBP", quality=60, alpha_quality=70, method=6)
        blur[name] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    print(f"합 {total // 1024} KB")
    lines = [
        "// 만든 파일 — scripts/cloud-assets.py 가 쓴다(손으로 고치지 않는다).",
        "// 흐린 미리보기 구름(긴 변 200 px WebP · data URL) — 코드와 함께 와서 첫 화면부터 구름이 보인다.",
        "// 선명한 그림(assets/*.webp)이 다 풀리면 그 위에 겹쳐 나타난다(CloudCover data-sharp).",
        'import type { ArtName } from "./cloudshape";',
        "",
        "export const BLUR_URL: Record<ArtName, string> = {",
        *[f'  {n}: "{u}",' for n, u in blur.items()],
        "};",
        "",
    ]
    BLUR_TS.write_text("\n".join(lines))
    print(f"흐린 미리보기 {BLUR_TS.name} {BLUR_TS.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
