"""中灰版：RGB 分段色键——中性色且亮度接近 128 的像素抠除，其他全保"""
import urllib.request
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

urls = {
    "frog_idle_gray.png": "https://aka.doubaocdn.com/s/AiYQt99re5",
    "frog_running_gray.png": "https://aka.doubaocdn.com/s/JFVn2yUHbL",
}
for name, url in urls.items():
    urllib.request.urlretrieve(url, base / name)
    print("downloaded:", name)

def gray_key(im: Image.Image, diag: str = ""):
    """背景=中性色(通道差<25)且亮度距 128 小于 45 → 透明；45-60 过渡；其余保留"""
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    bg = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            L = max(r, g, b)
            neutral = abs(r - g) < 25 and abs(g - b) < 25 and abs(r - b) < 25
            d = abs(L - 128)
            if neutral and d < 45:
                px[x, y] = (r, g, b, 0)
                bg += 1
            elif neutral and d < 60:
                alpha = int(255 * (d - 45) / 15.0)
                px[x, y] = (r, g, b, alpha)
    if diag:
        print(diag, "抠除背景:", bg, "占比:", round(bg / (w * h) * 100, 1), "%")
    return rgba

for src, dst in [("frog_idle_gray.png", "frog_idle.webp"),
                 ("frog_running_gray.png", "frog_running.webp")]:
    im = Image.open(base / src)
    print("=== ", src, im.size, im.mode)
    w, h = im.size
    for label, (x, y) in {"TL": (5, 5), "TR": (w - 6, 5), "BL": (5, h - 6), "BR": (w - 6, h - 6)}.items():
        print("  corner", label, im.getpixel((x, y)))
    out_im = gray_key(im, dst)
    out_im.save(base / dst, "WEBP", lossless=True, quality=100)
    alpha = out_im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  saved:", base / dst, "opaque%:", round(opaque / (w * h) * 100, 1))
    canvas = Image.new("RGBA", out_im.size, (64, 128, 200, 255))
    canvas.alpha_composite(out_im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
    print("  preview:", out / (dst + ".preview.jpg"))
