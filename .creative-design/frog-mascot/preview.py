"""生成去底预览：把 webp 合成到彩色背景，检查边缘质量"""
from PIL import Image, ImageDraw
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

for name in ["frog_idle.webp", "frog_running.webp"]:
    im = Image.open(base / name).convert("RGBA")
    # 统计残留不透明像素
    alpha = im.getchannel("A")
    opaque = sum(1 for a in list(alpha.getdata()) if a > 16)
    total = im.size[0] * im.size[1]
    print(name, "不透明像素占比:", round(opaque / total * 100, 1), "%")
    # 合成到彩色背景预览
    canvas = Image.new("RGBA", im.size, (64, 128, 200, 255))  # 蓝色背景
    canvas.alpha_composite(im)
    canvas.convert("RGB").save(out / (name + ".preview.jpg"), quality=90)
    print("preview saved:", out / (name + ".preview.jpg"))
