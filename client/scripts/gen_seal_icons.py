"""
印章图标生成器 — 用 PIL 画"印章"风格应用图标
- 512×512 青瓷绿底
- 圆角矩形 4% inset
- 双层回字纹边框
- 中央汉字"说"

输出到 client/src-tauri/icons/，并打包进 .ico
"""

import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# 青瓷绿（温润淡雅的传统瓷器色）
SEAL_GREEN = (64, 120, 98)
EDGE_DARK = (42, 85, 68)
WHITE = (245, 250, 248)  # 浅米白——青瓷阴刻的"露白"色

# 中央字符
CHARACTER = "说"

# 字号（针对 512 设计）
CHAR_FONT_SIZE = 220
INSET_RATIO = 0.04  # 矩形 inset
INNER_FRAME_INSET = 0.10  # 内嵌边框距外边
CORNER_NOTCH_INSET = 0.13  # 4 角缺口起始点
CORNER_NOTCH_SIZE = 0.06  # 缺口大小

# 多分辨率
SIZES = [32, 128, 256, 512, 1024]

FONT_PATH = "C:/Windows/Fonts/simhei.ttf"  # 黑体，印章里的常用字体


def hex_corner(draw, x, y, w, h, color):
    """L 形拐角装饰 — 内嵌回字纹（左上/右上/左下/右下之一）"""
    # 横线
    draw.rectangle([x, y, x + w, y + h], fill=color)
    # 拐角留白


def draw_seal(canvas_size: int) -> Image.Image:
    size = canvas_size
    img = Image.new("RGBA", (size, size), SEAL_GREEN + (255,))
    draw = ImageDraw.Draw(img)

    px = lambda ratio: int(size * ratio)

    # === 1. 内嵌白色描边（柔和过渡，像印章的"白边"）===
    edge_inset = px(INSET_RATIO)
    edge_w = max(1, px(0.012))
    # 圆角矩形描边（米白色边）
    draw.rounded_rectangle(
        [edge_inset, edge_inset, size - edge_inset, size - edge_inset],
        radius=px(0.08),
        outline=WHITE,
        width=edge_w,
    )

    # === 2. 内嵌回字纹边框 — 在外边内 INSET 处画 4 个 L 形缺口 ===
    inner_inset = px(INNER_FRAME_INSET)
    # 边线宽
    line_w = max(2, px(0.018))
    # 左上角 L
    L_w = px(0.16)  # L 长度
    L_h = px(0.012)  # L 横线粗
    notch_start = px(CORNER_NOTCH_INSET)
    notch_len = px(CORNER_NOTCH_SIZE)
    notch_h = px(CORNER_NOTCH_SIZE)

    # 4 个角的内嵌缺口（米白色装饰块）
    corners = [
        # (起点 x, 起点 y) — 左上 L（水平段 + 垂直段）
        (inner_inset, inner_inset),                                   # 左上
        (size - inner_inset, inner_inset),                            # 右上
        (inner_inset, size - inner_inset),                            # 左下
        (size - inner_inset, size - inner_inset),                     # 右下
    ]
    for cx, cy in corners:
        # 横向 L 段
        hx_start = cx - notch_start if cx < size / 2 else cx - L_w + notch_start
        hx_end = cx + notch_len if cx < size / 2 else cx - notch_len
        # 由于用 L_w 算的对称，做法简化：直接画方块再 mask
        # 用 ImageDraw 画 4 个小方块代表回字纹 4 角
        if cx < size / 2 and cy < size / 2:
            # 左上 — 一个 L，由一个横条 + 竖条组成
            draw.rectangle(
                [cx, cy, cx + L_w, cy + L_h],
                fill=WHITE,
            )
            draw.rectangle(
                [cx, cy, cx + L_h, cy + L_w],
                fill=WHITE,
            )
        elif cx > size / 2 and cy < size / 2:
            # 右上
            draw.rectangle(
                [cx - L_w, cy, cx, cy + L_h],
                fill=WHITE,
            )
            draw.rectangle(
                [cx - L_h, cy, cx, cy + L_w],
                fill=WHITE,
            )
        elif cx < size / 2 and cy > size / 2:
            # 左下
            draw.rectangle(
                [cx, cy - L_h, cx + L_w, cy],
                fill=WHITE,
            )
            draw.rectangle(
                [cx, cy - L_w, cx + L_h, cy],
                fill=WHITE,
            )
        else:
            # 右下
            draw.rectangle(
                [cx - L_w, cy - L_h, cx, cy],
                fill=WHITE,
            )
            draw.rectangle(
                [cx - L_h, cy - L_w, cx, cy],
                fill=WHITE,
            )

    # === 3. 中央汉字 ===
    font_size = int(size * 0.55)  # 字占 55%
    try:
        font = ImageFont.truetype(FONT_PATH, font_size)
    except OSError:
        font = ImageFont.load_default()

    # 测量尺寸，居中
    bbox = draw.textbbox((0, 0), CHARACTER, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (size - text_w) // 2 - bbox[0]
    text_y = (size - text_h) // 2 - bbox[1]

    # 文字用米白色（"阴刻"效果）
    draw.text((text_x, text_y), CHARACTER, fill=WHITE, font=font)

    # === 4. 印章质感 — 加一个内阴影（深红）模拟磨损 ===
    # 角落稍暗
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    # 4 角淡淡深红 50 alpha
    corner_size = int(size * 0.5)
    for (cx, cy) in corners:
        ox = cx - corner_size // 2
        oy = cy - corner_size // 2
        overlay_draw.rectangle(
            [ox, oy, ox + corner_size, oy + corner_size],
            fill=(0, 0, 0, 0),  # 先不放，后续可加
        )
    img = Image.alpha_composite(img, overlay)

    return img


def main():
    icons_dir = Path(r"E:\SayIt-main\SayIt-main\client\src-tauri\icons")
    icons_dir.mkdir(exist_ok=True)

    # 先画最大尺寸（1024）作为主源
    master = draw_seal(1024)
    master.save(icons_dir / "icon.png", "PNG", optimize=True)

    # 各尺寸
    for s in SIZES:
        if s == 1024:
            continue  # 已存为 icon.png
        resized = master.resize((s, s), Image.LANCZOS)
        if s == 32:
            resized.save(icons_dir / "32x32.png", "PNG", optimize=True)
        elif s == 128:
            resized.save(icons_dir / "128x128.png", "PNG", optimize=True)
        elif s == 256:
            resized.save(icons_dir / "128x128@2x.png", "PNG", optimize=True)
        elif s == 512:
            resized.save(icons_dir / "256x256.png", "PNG", optimize=True)
        print(f"  generated {s}x{s}.png")

    # .ico 多分辨率打包（包含 16/32/48/64/128/256）
    ico_sizes = [16, 32, 48, 64, 128, 256]
    base = Image.open(icons_dir / "icon.png").convert("RGBA")
    ico_imgs = [base.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    base.save(
        icons_dir / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_imgs[1:],
    )
    print(f"  generated icon.ico (sizes {ico_sizes})")
    print("\nAll icons written to:", icons_dir)


if __name__ == "__main__":
    main()
