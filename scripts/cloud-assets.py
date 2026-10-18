"""손그림 구름 PNG(assets-src/clouds) → 덮개용 WebP(src/cover/assets).

  - 투명 바탕 그대로 · 투명 여백은 잘라 레이어를 작게
  - 구름 안쪽 알파 250~254 를 255 로 — 겹친 뒷구름 선이 희미하게 비치지 않게
  - 긴 변 최대 1600 px(원본보다 키우지 않음) — iPad mini(배율 2)에서 가장 크게 그려지는 구름을 또렷하게
  - WebP q82(알파 q90)

돌리는 법: python3 scripts/cloud-assets.py   (Pillow 필요)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src" / "clouds"
OUT = ROOT / "src" / "cover" / "assets"

MAX_SIDE = 1600
SOLID_FROM = 250  # 이 알파부터는 불투명으로

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
    print(f"합 {total // 1024} KB")


if __name__ == "__main__":
    main()
