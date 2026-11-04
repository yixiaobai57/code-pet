"""黑底版：下载 + 亮度键抠图转透明 webp + 预览"""
import urllib.request
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

urls = {
    "frog_idle_black.png": "https://aka.doubaocdn.com/s/iw1cmiCrWC",
    "frog_running_black.png": "https://aka.doubaocdn.com/s/UAPVUBqRev",
}
for name, url in urls.items():
    urllib.request.urlretrieve(url, base / name)
    print("downloaded:", name, base / name)

def luma_key(im: Image.Image, diag: str = ""):
    """亮度键：max(rgb)<30 透明；30-70 线性过渡；>70 保留"""
    rgba = im.convert("RGBA")
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
    im = Image.open(base / src)
    print("=== ", src, im.size, im.mode)
    w, h = im.size
    for label, (x, y) in {"TL": (5, 5), "TR": (w - 6, 5), "BL": (5, h - 6), "BR": (w - 6, h - 6)}.items():
        print("  corner", label, im.getpixel((x, y)))
    out_im = luma_key(im, dst)
    out_im.save(base / dst, "WEBP", lossless=True, quality=100)
    alpha = out_im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  saved:", base / dst, "opaque%:", round(opaque / (w * h) * 100, 1))
    canvas = Image.new("RGBA", out_im.size, (64, 128, 200, 255))
    canvas.alpha_composite(out_im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
    print("  preview:", out / (dst + ".preview.jpg"))
