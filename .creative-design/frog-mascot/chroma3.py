"""v3 色键：放宽洋红特征阈值 + 半透明残影净化"""
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

def is_magenta(r, g, b, th=12, min_rb=160):
    """洋红特征：红、蓝通道显著高于绿，且红蓝本身较高"""
    return r > min_rb and b > min_rb and (r - g) > th and (b - g) > th

def chroma_key_v3(im: Image.Image, diag: str = ""):
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    bg_count = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_magenta(r, g, b, th=12, min_rb=160):
                m = min((r - g - 12) / 35.0, (b - g - 12) / 35.0, 1.0)
                alpha = int(255 * (1 - m))
                if alpha < 16:
                    alpha = 0
                px[x, y] = (r, g, b, alpha)
                if alpha == 0:
                    bg_count += 1
    # 第二遍：残影净化——仍带明显洋红特征的低 alpha 像素归零
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 120 and is_magenta(r, g, b, th=25, min_rb=150):
                px[x, y] = (r, g, b, 0)
    total = w * h
    if diag:
        print(diag, "背景像素占比:", round(bg_count / total * 100, 1), "%")
    return rgba

for src, dst in [("frog_idle_magenta.png", "frog_idle.webp"),
                 ("frog_running_magenta.png", "frog_running.webp")]:
    im = Image.open(base / src)
    print("=== ", src, im.size, im.mode)
    out_im = chroma_key_v3(im, dst)
    out_im.save(base / dst, "WEBP", lossless=True, quality=100)
    alpha = out_im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  saved:", base / dst, "opaque%:", round(opaque / (im.size[0] * im.size[1]) * 100, 1))
    canvas = Image.new("RGBA", out_im.size, (64, 128, 200, 255))
    canvas.alpha_composite(out_im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
    print("  preview:", out / (dst + ".preview.jpg"))
