"""检查两张奶蛙贴图的透明通道、尺寸，必要时转存为 webp 透明图"""
from PIL import Image
from pathlib import Path

base = Path(r"C:\Users\19421\Doubao\chats\2026-11-03\new-chat\code-pet\pet\assets")
for name in ["frog_idle_raw.png", "frog_running_raw.png"]:
    p = base / name
    im = Image.open(p)
    print(name, im.size, im.mode)
    # 透明通道检查
    if im.mode in ("RGBA", "LA") or "transparency" in im.info:
        # 统计全透明像素占比
        if im.mode == "RGBA":
            alpha = im.getchannel("A")
            px = list(alpha.getdata())
            transparent = sum(1 for a in px if a < 16)
            print("  alpha<16 占比:", round(transparent / len(px) * 100, 1), "%")
    else:
        print("  !!! 无透明通道，需要去背景:", im.mode)

# 转存透明 webp（保留 alpha），供应用使用
for raw, out in [("frog_idle_raw.png", "frog_idle.webp"), ("frog_running_raw.png", "frog_running.webp")]:
    im = Image.open(base / raw)
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    # 若 alpha 全不透明（无透明），做白色背景去除
    alpha = im.getchannel("A")
    px = list(alpha.getdata())
    if all(a > 250 for a in px):
        print(out, "无 alpha，执行白底去除")
        rgba = im.convert("RGBA")
        data = rgba.getdata()
        new = []
        for r, g, b, a in data:
            if r > 245 and g > 245 and b > 245:
                new.append((r, g, b, 0))
            else:
                new.append((r, g, b, 255))
        rgba.putdata(new)
        im = rgba
    im.save(base / out, "WEBP", lossless=True, quality=100)
    print("saved:", out, im.size)
