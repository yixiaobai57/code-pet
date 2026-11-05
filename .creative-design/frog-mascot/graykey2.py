"""中灰版 v2：加连通域约束的 RGB 分段色键
- 背景候选：中性色且 |L-128|<45
- 只有与图像边缘连通的候选取样才清理 → 西装内部孤立高光（亮度接近 128）保留不透明
- 与背景相邻的过渡像素给半透明防锯齿，其余全保
"""
from PIL import Image
from collections import deque
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
src_dir = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot\source")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")


def gray_key_connected(path: Path, diag: str = ""):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    neutral_map = [[False] * w for _ in range(h)]
    cand_map = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            L = max(r, g, b)
            neutral = abs(r - g) < 25 and abs(g - b) < 25 and abs(r - b) < 25
            neutral_map[y][x] = neutral
            cand_map[y][x] = neutral and abs(L - 128) < 45

    # 从四边 flood fill 连通候选（8 连通）
    bg = [[False] * w for _ in range(h)]
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand_map[y][x] and not bg[y][x]:
                bg[y][x] = True
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if cand_map[y][x] and not bg[y][x]:
                bg[y][x] = True
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx in (x - 1, x, x + 1):
            for ny in (y - 1, y, y + 1):
                if 0 <= nx < w and 0 <= ny < h and cand_map[ny][nx] and not bg[ny][nx]:
                    bg[ny][nx] = True
                    dq.append((nx, ny))

    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            L = max(r, g, b)
            if bg[y][x]:
                px[x, y] = (r, g, b, 0)
                cleared += 1
            elif cand_map[y][x]:
                # 角色内部孤立亮部（西装高光）：保留完全不透明
                px[x, y] = (r, g, b, 255)
            elif neutral_map[y][x] and 45 <= abs(L - 128) < 60:
                # 仅当紧邻背景时才做边缘过渡，避免角色内部被削半透明
                near_bg = False
                for nx in (x - 1, x, x + 1):
                    for ny in (y - 1, y, y + 1):
                        if 0 <= nx < w and 0 <= ny < h and bg[ny][nx]:
                            near_bg = True
                            break
                    if near_bg:
                        break
                if near_bg:
                    alpha = int(255 * (abs(L - 128) - 45) / 15.0)
                    px[x, y] = (r, g, b, max(0, min(255, alpha)))

    if diag:
        print(diag, "清理连通背景:", cleared, "占比:", round(cleared / (w * h) * 100, 1), "%")
    return im


for src_name, dst in [("frog_idle_gray.png", "frog_idle.webp"),
                      ("frog_running_gray.png", "frog_running.webp")]:
    im = gray_key_connected(src_dir / src_name, dst)
    im.save(base / dst, "WEBP", lossless=True, quality=100)
    alpha = im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  saved:", base / dst, "opaque%:", round(opaque / (im.size[0] * im.size[1]) * 100, 1))
    canvas = Image.new("RGBA", im.size, (64, 128, 200, 255))
    canvas.alpha_composite(im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
    print("  preview:", out / (dst + ".preview.jpg"))
