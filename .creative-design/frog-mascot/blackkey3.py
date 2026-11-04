"""黑底版 v3：蓝西装校正（不限亮度）+ 收紧亮度键 + 低 alpha 清理"""
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

def desaturate_blue(rgba: Image.Image, diag: str = ""):
    """深/亮蓝色偏 → 灰；排除绿色（g 高于 r 较多）与酒红（b<r）"""
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

def luma_key(rgba: Image.Image, diag: str = ""):
    px = rgba.load()
    w, h = rgba.size
    bg = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            L = max(r, g, b)
            if L <= 25:
                px[x, y] = (r, g, b, 0)
                bg += 1
            elif L < 45:
                alpha = int(255 * (L - 25) / 20.0)
                px[x, y] = (r, g, b, alpha)
    # 清理低 alpha 残噪
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 60 and max(r, g, b) < 42:
                px[x, y] = (r, g, b, 0)
    if diag:
        print(diag, "透明像素占比:", round(bg / (w * h) * 100, 1), "%")
    return rgba

for src, dst in [("frog_idle_black.png", "frog_idle.webp"),
                 ("frog_running_black.png", "frog_running.webp")]:
    im = Image.open(base / src).convert("RGBA")
    print("=== ", src, im.size)
    im = desaturate_blue(im, dst)
    im = luma_key(im, dst)
    im.save(base / dst, "WEBP", lossless=True, quality=100)
    alpha = im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  saved:", base / dst, "opaque%:", round(opaque / (im.size[0] * im.size[1]) * 100, 1))
    canvas = Image.new("RGBA", im.size, (64, 128, 200, 255))
    canvas.alpha_composite(im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
