"""升级版色键：洋红特征抠图（r、b 通道显著高于 g 的像素视为背景，距离式过渡）+ 诊断输出"""
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

def chroma_key_v2(im: Image.Image, diag: str = ""):
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    bg_count = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # 洋红特征：红、蓝通道显著高于绿
            if r > 180 and b > 180 and (r - g) > 20 and (b - g) > 20:
                m = min((r - g - 20) / 40.0, (b - g - 20) / 40.0, 1.0)
                alpha = int(255 * (1 - m))
                if alpha < 0:
                    alpha = 0
                px[x, y] = (r, g, b, alpha)
                if alpha < 16:
                    bg_count += 1
    total = w * h
    if diag:
        print(diag, "背景像素占比:", round(bg_count / total * 100, 1), "%")
    return rgba

for src, dst in [("frog_idle_magenta.png", "frog_idle.webp"),
                 ("frog_running_magenta.png", "frog_running.webp")]:
    im = Image.open(base / src)
    print("=== ", src, im.size, im.mode)
    w, h = im.size
    for label, (x, y) in {"TL": (5, 5), "TR": (w - 6, 5), "BL": (5, h - 6), "BR": (w - 6, h - 6), "C": (w // 2, h // 2)}.items():
        print("  corner", label, im.getpixel((x, y)))
    out_im = chroma_key_v2(im, dst)
    out_im.save(base / dst, "WEBP", lossless=True, quality=100)
    alpha = out_im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  saved:", base / dst, "opaque%:", round(opaque / (w * h) * 100, 1))
    canvas = Image.new("RGBA", out_im.size, (64, 128, 200, 255))
    canvas.alpha_composite(out_im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
