"""黑底版 v5：候选背景 L<35，过渡区 32-40，西裤亮度(≈42+)全保"""
from PIL import Image
from collections import deque
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

def desaturate_blue(rgba: Image.Image, diag: str = ""):
    px = rgba.load()
    w, h = rgba.size
    fixed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if b > 70 and b > r + 20 and b > g + 8 and g < r + 40:
                lum = int(0.30 * r + 0.59 * g + 0.11 * b)
                px[x, y] = (lum, lum, lum, a)
                fixed += 1
    if diag:
        print(diag, "校正灰色像素:", fixed)
    return rgba

CAND_MAX = 35
TRANS_LO = 32
TRANS_HI = 40

def connected_luma_key(rgba: Image.Image, diag: str = ""):
    px = rgba.load()
    w, h = rgba.size
    cand = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            cand[y][x] = max(r, g, b) < CAND_MAX
    filled = [[False] * w for _ in range(h)]
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y][x] and not filled[y][x]:
                filled[y][x] = True
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y][x] and not filled[y][x]:
                filled[y][x] = True
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx in (x - 1, x, x + 1):
            for ny in (y - 1, y, y + 1):
                if 0 <= nx < w and 0 <= ny < h and cand[ny][nx] and not filled[ny][nx]:
                    filled[ny][nx] = True
                    dq.append((nx, ny))
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if filled[y][x]:
                px[x, y] = (r, g, b, 0)
            elif cand[y][x]:
                px[x, y] = (r, g, b, 255)
            else:
                L = max(r, g, b)
                if L < TRANS_HI:
                    alpha = int(255 * (L - TRANS_LO) / (TRANS_HI - TRANS_LO))
                    px[x, y] = (r, g, b, max(alpha, 0))
    if diag:
        filled_cnt = sum(sum(row) for row in filled)
        print(diag, "抠除背景:", filled_cnt, "占比:", round(filled_cnt / (w * h) * 100, 1), "%")
    return rgba

for src, dst in [("frog_idle_black.png", "frog_idle.webp"),
                 ("frog_running_black.png", "frog_running.webp")]:
    im = Image.open(base / src).convert("RGBA")
    print("=== ", src, im.size)
    im = desaturate_blue(im, dst)
    im = connected_luma_key(im, dst)
    im.save(base / dst, "WEBP", lossless=True, quality=100)
    alpha = im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  saved:", base / dst, "opaque%:", round(opaque / (im.size[0] * im.size[1]) * 100, 1))
    canvas = Image.new("RGBA", im.size, (64, 128, 200, 255))
    canvas.alpha_composite(im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
