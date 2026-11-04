"""黑底版 v2：深蓝西装校正为深灰 → 亮度键抠图 → 透明 webp + 预览"""
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

def desaturate_blue(rgba: Image.Image, diag: str = ""):
    """把深色且明显偏蓝的像素（西装）校正为同亮度灰色"""
    px = rgba.load()
    w, h = rgba.size
    fixed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            L = max(r, g, b)
            if L < 130 and b > r + 22 and b > g + 10 and b > 70:
                # 深蓝偏色 → 灰（保留明暗结构）
                lum = int(0.30 * r + 0.59 * g + 0.11 * b)
                px[x, y] = (lum, lum, lum, a)
                fixed += 1
    if diag:
        print(diag, "校正为灰色的像素数:", fixed)
    return rgba

def luma_key(rgba: Image.Image, diag: str = ""):
    px = rgba.load()
    w, h = rgba.size
    bg = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            L = max(r, g, b)
            if L <= 30:
                px[x, y] = (r, g, b, 0)
                bg += 1
            elif L < 70:
                alpha = int(255 * (L - 30) / 40.0)
                px[x, y] = (r, g, b, alpha)
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
    print("  preview:", out / (dst + ".preview.jpg"))
