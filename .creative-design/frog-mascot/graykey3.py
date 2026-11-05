"""中灰版 v3：平滑中性色 + 边缘连通 判定
- 候选背景：三通道接近中性（差<25）且 3x3 邻域亮度极差<8（无纹理平滑区）
- 从图像四边 flood fill，只有连通的候选才清除（阴影平滑渐变会被清，西装布纹有纹理不受影响）
- 与背景相邻的非候选中性像素一并清除，边缘硬切 1-2px，避免灰边光晕
"""
from PIL import Image
from collections import deque
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
src_dir = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot\source")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")


def smooth_gray_key(path: Path, diag: str = ""):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    # 预计算: 中性 / 平滑
    neutral = [[False] * w for _ in range(h)]
    smooth = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            neutral[y][x] = abs(r - g) < 25 and abs(g - b) < 25 and abs(r - b) < 25

    for y in range(h):
        for x in range(w):
            if not neutral[y][x]:
                continue
            lo, hi = 255, 0
            found = False
            for ny in (y - 1, y, y + 1):
                for nx in (x - 1, x, x + 1):
                    if 0 <= nx < w and 0 <= ny < h:
                        L = max(px[nx, ny][:3])
                        lo = min(lo, L)
                        hi = max(hi, L)
                        found = True
            if found and hi - lo < 8:
                smooth[y][x] = True

    cand = [[neutral[y][x] and smooth[y][x] for x in range(w)] for y in range(h)]

    bg = [[False] * w for _ in range(h)]
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y][x] and not bg[y][x]:
                bg[y][x] = True
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y][x] and not bg[y][x]:
                bg[y][x] = True
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx in (x - 1, x, x + 1):
            for ny in (y - 1, y, y + 1):
                if 0 <= nx < w and 0 <= ny < h and cand[ny][nx] and not bg[ny][nx]:
                    bg[ny][nx] = True
                    dq.append((nx, ny))

    # 与背景相邻的非候选中性像素（灰边光晕）一并清除
    edge_clear = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if bg[y][x] or not neutral[y][x]:
                continue
            for nx in (x - 1, x, x + 1):
                for ny in (y - 1, y, y + 1):
                    if 0 <= nx < w and 0 <= ny < h and bg[ny][nx]:
                        edge_clear[y][x] = True
                        break
                if edge_clear[y][x]:
                    break

    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if bg[y][x] or edge_clear[y][x]:
                px[x, y] = (r, g, b, 0)
                cleared += 1
            elif cand[y][x]:
                px[x, y] = (r, g, b, 255)

    if diag:
        print(diag, "清理背景+灰边:", cleared, "占比:", round(cleared / (w * h) * 100, 1), "%")
    return im


for src_name, dst in [("frog_idle_gray.png", "frog_idle.webp"),
                      ("frog_running_gray.png", "frog_running.webp")]:
    im = smooth_gray_key(src_dir / src_name, dst)
    im.save(base / dst, "WEBP", lossless=True, quality=100)
    alpha = im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  saved:", base / dst, "opaque%:", round(opaque / (im.size[0] * im.size[1]) * 100, 1))
    canvas = Image.new("RGBA", im.size, (64, 128, 200, 255))
    canvas.alpha_composite(im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
    print("  preview:", out / (dst + ".preview.jpg"))
