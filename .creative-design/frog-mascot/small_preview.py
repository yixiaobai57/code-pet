"""生成 120px 小尺寸预览（桌宠实际显示尺度）"""
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
out = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\.creative-design\frog-mascot")

for name, small in [("frog_idle.webp", "frog_idle_120.png"), ("frog_running.webp", "frog_running_120.png")]:
    im = Image.open(base / name).convert("RGBA")
    im.thumbnail((120, 120))
    canvas = Image.new("RGBA", (120, 120), (64, 128, 200, 255))
    canvas.alpha_composite(im)
    canvas.convert("RGB").save(out / small)
    print("saved:", out / small)
