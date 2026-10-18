"""구름 덮기 배치 찾기 — 그림의 실제 알파로 여러 화면비에서 빈틈을 재며 자리 · 크기 · 돌리기를 고른다.

손으로 맞추면 가로로 얇은 구름 띠 사이에 빈틈이 남는다. 이 도구는 iPad 가로 · 세로 · 폰 가로 · 세로 ·
데스크톱 · 넓은 데스크톱에서 「구름으로 안 덮인 화소」 가 0 이 되게 담금질(simulated annealing)로 찾고,
src/cover/cloudshape.ts 의 LAYOUT 에 붙일 줄을 찍는다. 기다림 흐름의 양 끝(옮겨 간 자리)에서도 잰다.

돌리는 법: python3 scripts/cloud-layout.py --count 16 --w-min 32 --w-max 58 --center-w-max 46 --iters 8000
          (Pillow · numpy 필요 · 하늘 결마다 값은 docs/DESIGN.md 의 표)
"""
import argparse
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "cover" / "assets"
ARTS = ["original", "wide", "billowy", "diagonal", "wispy", "curled"]
VIEWPORTS = [(768, 1024), (1024, 768), (390, 844), (844, 390), (1920, 1080), (2560, 1080), (1366, 1024)]
LONG = 160  # 잴 때 화면 긴 변(px) — 작게 줄여 빨리
COVER_ALPHA = 128  # 이 알파부터 덮였다고 본다
# 구름 크기(vmax) — 본보기처럼 중간 크기 구름이 겹겹이(화면만 한 구름 한 장으로 덮지 않게)
W_MIN, W_MAX, CENTER_W_MAX = 40, 72, 56  # main() 이 인자로 바꾼다

masks: dict[tuple[str, int, bool], Image.Image] = {}


def mask(art: str, rot: int, flip: bool) -> Image.Image:
    key = (art, rot, flip)
    if key not in masks:
        a = Image.open(ASSETS / f"cloud-{art}.webp").getchannel("A")
        a.thumbnail((400, 400))
        if flip:
            a = a.transpose(Image.FLIP_LEFT_RIGHT)
        # CSS rotate(+) 는 시계 방향 · PIL rotate(+) 는 반시계
        masks[key] = a.rotate(-rot, resample=Image.BILINEAR, expand=False)
    return masks[key]


def drift(order: int) -> tuple[float, float]:
    """cloudshape.ts 의 drift dx · dy(vmax) 와 같은 식"""
    dx = round((((order % 3) - 1) * 0.6) or 0.4, 1)
    dy = round(((order % 2) * 2 - 1) * 0.3, 1)
    return dx, dy


def gap(layout: list[dict], vw: int, vh: int, drifted: bool) -> float:
    k = LONG / max(vw, vh)
    W, H = max(1, round(vw * k)), max(1, round(vh * k))
    vmax = max(W, H) / 100
    canvas = np.zeros((H, W), dtype=np.uint8)
    for order, c in enumerate(layout):
        m = mask(c["art"], c["rot"], c["flip"])
        cw = c["w"] * vmax
        ch = cw * m.height / m.width
        if cw < 1 or ch < 1:
            continue
        cx = c["x"] / 100 * W
        cy = c["y"] / 100 * H
        if drifted:
            dx, dy = drift(order)
            cx += dx * vmax
            cy += dy * vmax
        x0, y0 = round(cx - cw / 2), round(cy - ch / 2)
        im = np.asarray(m.resize((max(1, round(cw)), max(1, round(ch))), Image.BILINEAR))
        sx0, sy0 = max(0, -x0), max(0, -y0)
        dx0, dy0 = max(0, x0), max(0, y0)
        w = min(im.shape[1] - sx0, W - dx0)
        h = min(im.shape[0] - sy0, H - dy0)
        if w <= 0 or h <= 0:
            continue
        region = canvas[dy0 : dy0 + h, dx0 : dx0 + w]
        np.maximum(region, im[sy0 : sy0 + h, sx0 : sx0 + w], out=region)
    return float((canvas < COVER_ALPHA).mean())


def repeat_penalty(layout: list[dict]) -> float:
    """같은 그림끼리는 멀리(30 % 넘게) 그리고 뒤집기 · 돌리기가 달라야 — cloudshape 단위 시험과 같은 규칙"""
    p = 0.0
    for i, a in enumerate(layout):
        for b in layout[i + 1 :]:
            if a["art"] != b["art"]:
                continue
            if math.hypot(a["x"] - b["x"], a["y"] - b["y"]) <= 30:
                p += 1
            if a["flip"] == b["flip"] and a["rot"] == b["rot"]:
                p += 1
    return p


def score(layout: list[dict]) -> tuple[float, float]:
    worst = 0.0
    total = 0.0
    for vw, vh in VIEWPORTS:
        for drifted in (False, True):
            g = gap(layout, vw, vh, drifted)
            worst = max(worst, g)
            total += g
    size = sum(c["w"] ** 2 for c in layout) / 100  # 큰 구름일수록 레이어 메모리가 넓이로 는다
    counts = {a: sum(1 for c in layout if c["art"] == a) for a in ARTS}
    lo = len(layout) // len(ARTS)
    uneven = sum(max(0, lo - n) + max(0, n - (lo + 1)) for n in counts.values())  # 그림마다 고루
    return total * 50 + worst * 400 + size * 0.006 + repeat_penalty(layout) * 5 + uneven * 5, worst


def start(n: int, rnd: random.Random) -> list[dict]:
    rows = 6
    out = []
    for i in range(n - 1):
        row = i * rows // (n - 1)
        out.append(
            {
                "art": ARTS[i % len(ARTS)],
                "x": rnd.uniform(0, 100),
                "y": (row + 0.5) * 100 / rows + rnd.uniform(-5, 5),
                "w": rnd.uniform(W_MIN + 10, W_MAX),
                "rot": rnd.randint(-3, 3),
                "flip": rnd.random() < 0.5,
                "center": False,
            }
        )
    out.append({"art": "billowy", "x": 50, "y": 52, "w": CENTER_W_MAX, "rot": -2, "flip": False, "center": True})
    return out


def tweak(layout: list[dict], rnd: random.Random, t: float) -> list[dict]:
    new = [dict(c) for c in layout]
    c = rnd.choice(new)
    what = rnd.random()
    if what < 0.35:
        c["x"] = min(110, max(-10, c["x"] + rnd.gauss(0, 12 * t + 1)))
        c["y"] = min(108, max(-8, c["y"] + rnd.gauss(0, 10 * t + 1)))
    elif what < 0.6:
        c["w"] = min(W_MAX, max(W_MIN, c["w"] + rnd.gauss(0, 10 * t + 1)))
    elif what < 0.75:
        c["rot"] = max(-5, min(5, c["rot"] + rnd.choice([-1, 1])))
    elif what < 0.85:
        c["flip"] = not c["flip"]
    elif not c["center"]:
        c["art"] = rnd.choice(ARTS)
    if c["center"]:
        c["x"] = min(56, max(44, c["x"]))
        c["y"] = min(58, max(44, c["y"]))
        c["w"] = min(CENTER_W_MAX, c["w"])
    return new


def main() -> None:
    global W_MIN, W_MAX, CENTER_W_MAX
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=14)
    ap.add_argument("--w-min", type=float, default=W_MIN)
    ap.add_argument("--w-max", type=float, default=W_MAX)
    ap.add_argument("--center-w-max", type=float, default=CENTER_W_MAX)
    ap.add_argument("--iters", type=int, default=6000)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    W_MIN, W_MAX, CENTER_W_MAX = args.w_min, args.w_max, args.center_w_max
    iters = args.iters
    rnd = random.Random(args.seed)
    cur = start(args.count, rnd)
    cur_s, cur_w = score(cur)
    best, best_s, best_w = cur, cur_s, cur_w
    for i in range(iters):
        t = 1 - i / iters
        cand = tweak(cur, rnd, t)
        if repeat_penalty(cand) > repeat_penalty(cur):
            continue  # 같은 그림 규칙은 어기는 쪽으로 가지 않는다
        s, w = score(cand)
        if s < cur_s or rnd.random() < math.exp((cur_s - s) / max(1e-6, 0.4 * t)):
            cur, cur_s, cur_w = cand, s, w
            if s < best_s:
                best, best_s, best_w = cand, s, w
        if i % 500 == 0:
            print(f"# {i} best={best_s:.3f} worst-gap={best_w * 100:.3f}%", file=sys.stderr)
    # 겹침 차례: 위에서 아래로, 가운데 구름은 맨 뒤(맨 앞에 그림)
    rest = sorted((c for c in best if not c["center"]), key=lambda c: c["y"])
    rows = {round(c["y"] / 100 * 5) for c in rest}
    print(f"// 빈틈 최대 {best_w * 100:.3f}% (잴 때 긴 변 {LONG}px) · 띠 {len(rows)} · 같은 그림 규칙 어김 {repeat_penalty(best):.0f}")
    for c in rest + [c for c in best if c["center"]]:
        flip = ", flip: true" if c["flip"] else ""
        rot = f", rot: {c['rot']}" if c["rot"] else ""
        row = min(5, max(0, round(c["y"] / 100 * 5)))
        print(f'  {{ art: "{c["art"]}", x: {round(c["x"])}, y: {round(c["y"])}, w: {round(c["w"])}{flip}{rot}, row: {row} }},')


if __name__ == "__main__":
    main()
