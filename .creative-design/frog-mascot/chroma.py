"""下载洋红背景奶蛙贴图，色键抠图转透明 webp，生成彩色背景预览"""
import urllib.request
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

urls = {
    "frog_idle_magenta.png": "https://aka.doubaocdn.com/s/zPXyctOGao",
    "frog_running_magenta.png": "https://aka.doubaocdn.com/s/3IKB2p8SCe",
}
for name, url in urls.items():
    urllib.request.urlretrieve(url, base / name)
    print("downloaded:", name)

def chroma_key(im: Image.Image) -> Image.Image:
    """去洋红背景：洋红(r>205,b>205,g<150)透明，边缘做过渡"""
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 205 and b > 205 and g < 150:
                px[x, y] = (r, g, b, 0)
            elif r > 180 and b > 180 and g < 190:
                px[x, y] = (r, g, b, max(0, a - 180))
    return rgba

for src, dst in [("frog_idle_magenta.png", "frog_idle.webp"),
                 ("frog_running_magenta.png", "frog_running.webp")]:
    im = Image.open(base / src)
    out_im = chroma_key(im)
    out_im.save(base / dst, "WEBP", lossless=True, quality=100)
    print("saved:", base / dst, out_im.size)
    # 统计不透明占比
    alpha = out_im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    print("  opaque%:", round(opaque / (out_im.size[0] * out_im.size[1]) * 100, 1))
    # 彩色背景预览
    canvas = Image.new("RGBA", out_im.size, (64, 128, 200, 255))
    canvas.alpha_composite(out_im)
    canvas.convert("RGB").save(out / (dst + ".preview.jpg"), quality=90)
    print("  preview:", out / (dst + ".preview.jpg"))
