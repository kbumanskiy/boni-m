#!/usr/bin/env python3
"""Убирает с геро-иллюстраций «обрезки» соседних картинок (отдельные островки),
оставляя только самую большую связную фигуру, затем обрезает по содержимому.
Только PIL: связные компоненты считаем на уменьшённой маске."""
from PIL import Image, ImageFilter
import os, sys

SRC = os.path.join(os.path.dirname(__file__), "..", "boni-m", "assets")
DST = os.path.join(os.path.dirname(__file__), "..", "app", "assets")
JOBS = [
    ("01-zastavka.png", "hero-zastavka.webp"),
    ("02-portret.png",  "hero-portret.webp"),
    ("03-radost.png",   "hero-radost.webp"),
    ("04-za-klyuchom.png", "hero-klyuch.webp"),
]
MASK_W = 360       # ширина уменьшённой маски для разметки компонент
ALPHA_T = 32       # порог непрозрачности
DILATE = 2         # склеить тонкие разрывы фигуры (в пикселях уменьшённой маски)
PAD = 10           # прозрачные поля вокруг содержимого, px (полного размера)
MAX_SIDE = 800     # ограничение длинной стороны на выходе

def components(mask, w, h):
    """8-связные компоненты по бинарной маске (list[bool]). Возвращает (labels, sizes)."""
    labels = [0] * (w * h)
    sizes = {0: 0}
    cur = 0
    for start in range(w * h):
        if not mask[start] or labels[start]:
            continue
        cur += 1
        cnt = 0
        stack = [start]
        labels[start] = cur
        while stack:
            p = stack.pop()
            cnt += 1
            y, x = divmod(p, w)
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= h:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if nx < 0 or nx >= w:
                        continue
                    q = ny * w + nx
                    if mask[q] and not labels[q]:
                        labels[q] = cur
                        stack.append(q)
        sizes[cur] = cnt
    return labels, sizes

def process(src_path, dst_path):
    im = Image.open(src_path).convert("RGBA")
    W, H = im.size
    a = im.split()[3]

    # уменьшённая маска
    mw = MASK_W
    mh = max(1, round(H * mw / W))
    small = a.resize((mw, mh), Image.BILINEAR)
    for _ in range(DILATE):
        small = small.filter(ImageFilter.MaxFilter(3))  # склейка тонких разрывов
    px = small.load()
    mask = [px[x, y] > ALPHA_T for y in range(mh) for x in range(mw)]

    labels, sizes = components(mask, mw, mh)
    keep = None
    dropped = 0
    if len(sizes) > 1:
        keep = max((k for k in sizes if k != 0), key=lambda k: sizes[k])
        total = sum(v for k, v in sizes.items() if k != 0)
        dropped = total - sizes[keep]
        print(f"  компонент: {len(sizes)-1}, оставляю {sizes[keep]}px, убираю {dropped}px "
              f"({dropped*100//max(1,total)}%)")

    if keep is not None and dropped > 0:
        # маска «оставить» в полном разрешении
        keepmask_small = Image.new("L", (mw, mh), 0)
        kp = keepmask_small.load()
        for y in range(mh):
            for x in range(mw):
                if labels[y * mw + x] == keep:
                    kp[x, y] = 255
        keepmask = keepmask_small.resize((W, H), Image.NEAREST)
        # новый альфа = исходный там, где попадаем в нужную компоненту
        newa = Image.new("L", (W, H), 0)
        na = newa.load(); oa = a.load(); km = keepmask.load()
        for y in range(H):
            for x in range(W):
                if km[x, y]:
                    na[x, y] = oa[x, y]
        im.putalpha(newa)

    # обрезка по содержимому + поля
    bbox = im.split()[3].getbbox()
    if bbox:
        l, t, r, b = bbox
        l = max(0, l - PAD); t = max(0, t - PAD)
        r = min(W, r + PAD); b = min(H, b + PAD)
        im = im.crop((l, t, r, b))

    # ограничение размера
    w, h = im.size
    if max(w, h) > MAX_SIDE:
        s = MAX_SIDE / max(w, h)
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)

    im.save(dst_path, "WEBP", quality=86, method=6)
    print(f"  -> {os.path.basename(dst_path)} {im.size}")

if __name__ == "__main__":
    for s, d in JOBS:
        print(os.path.basename(s))
        process(os.path.join(SRC, s), os.path.join(DST, d))
    print("Готово.")
