"""Genera le icone PWA (192, 512, maskable, apple-touch) a partire
da un'icona disegnata a pixel: calendario sfumato con badge 🔔.

Output in /home/z/my-project/public/
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/home/z/my-project/public"
os.makedirs(OUT, exist_ok=True)

# Palette identica al gradient header del progetto
TOP = (47, 42, 143)      # #2f2a8f
MID = (91, 63, 208)      # #5b3fd0
BOT = (194, 51, 154)     # #c2339a
WHITE = (255, 255, 255)
NOTI = (229, 56, 59)     # rosso badge

def gradient_bg(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), TOP)
    pixels = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        if t < 0.6:
            u = t / 0.6
            r = int(TOP[0] + (MID[0] - TOP[0]) * u)
            g = int(TOP[1] + (MID[1] - TOP[1]) * u)
            b = int(TOP[2] + (MID[2] - TOP[2]) * u)
        else:
            u = (t - 0.6) / 0.4
            r = int(MID[0] + (BOT[0] - MID[0]) * u)
            g = int(MID[1] + (BOT[1] - MID[1]) * u)
            b = int(MID[2] + (BOT[2] - MID[2]) * u)
        for x in range(size):
            pixels[x, y] = (r, g, b)
    return img

def draw_calendar(img: Image.Image, size: int, maskable: bool = False):
    d = ImageDraw.Draw(img, "RGBA")
    pad = int(size * 0.22) if maskable else int(size * 0.18)
    card_x0, card_y0 = pad, pad
    card_x1, card_y1 = size - pad, size - pad
    sh_off = max(2, size // 64)
    d.rounded_rectangle(
        [card_x0 + sh_off, card_y0 + sh_off, card_x1 + sh_off, card_y1 + sh_off],
        radius=int(size * 0.10),
        fill=(0, 0, 0, 80),
    )
    d.rounded_rectangle(
        [card_x0, card_y0, card_x1, card_y1],
        radius=int(size * 0.10),
        fill=WHITE,
    )
    band_h = int((card_y1 - card_y0) * 0.22)
    d.rounded_rectangle(
        [card_x0, card_y0, card_x1, card_y0 + band_h],
        radius=int(size * 0.10),
        fill=WHITE,
    )
    d.rectangle(
        [card_x0, card_y0 + band_h - int(size * 0.05), card_x1, card_y0 + band_h],
        fill=WHITE,
    )
    ring_r = max(2, size // 70)
    ring_y = card_y0 + band_h // 2
    n_rings = 3
    spacing = (card_x1 - card_x0) / (n_rings + 1)
    for i in range(n_rings):
        cx = int(card_x0 + spacing * (i + 1))
        d.ellipse(
            [cx - ring_r, ring_y - ring_r, cx + ring_r, ring_y + ring_r],
            fill=TOP,
        )
    day = "31"
    target_h = int((card_y1 - card_y0) * 0.55)
    font = None
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            for size_pt in range(int(target_h * 1.6), 8, -1):
                try:
                    f = ImageFont.truetype(path, size_pt)
                except Exception:
                    continue
                bbox = d.textbbox((0, 0), day, font=f)
                w = bbox[2] - bbox[0]
                h = bbox[3] - bbox[1]
                if h <= target_h and w <= (card_x1 - card_x0) * 0.7:
                    font = f
                    break
            if font:
                break
    if font is None:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), day, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (card_x0 + card_x1 - tw) // 2 - bbox[0]
    ty = card_y0 + band_h + ((card_y1 - card_y0 - band_h) - th) // 2 - bbox[1]
    d.text((tx, ty), day, font=font, fill=TOP)
    badge_r = int(size * 0.10)
    bx = card_x1 - badge_r // 2
    by = card_y0 + badge_r // 2
    d.ellipse(
        [bx - badge_r, by - badge_r, bx + badge_r, by + badge_r],
        fill=NOTI,
    )
    bell_r = int(badge_r * 0.55)
    d.ellipse(
        [bx - bell_r, by - bell_r, bx + bell_r, by + bell_r],
        fill=WHITE,
    )
    d.rectangle(
        [bx - bell_r, by, bx + bell_r, by + int(badge_r * 0.35)],
        fill=WHITE,
    )
    d.ellipse(
        [bx - int(badge_r * 0.18), by + int(badge_r * 0.30),
         bx + int(badge_r * 0.18), by + int(badge_r * 0.55)],
        fill=WHITE,
    )

def save(path: str, size: int, maskable: bool = False):
    canvas = gradient_bg(size)
    draw_calendar(canvas, size, maskable=maskable)
    canvas.save(path, "PNG", optimize=True)
    print(f"saved {path} ({size}x{size})")

save(f"{OUT}/icon-192.png", 192)
save(f"{OUT}/icon-512.png", 512)
save(f"{OUT}/icon-maskable-192.png", 192, maskable=True)
save(f"{OUT}/icon-maskable-512.png", 512, maskable=True)
save(f"{OUT}/apple-touch-icon.png", 180)
save(f"{OUT}/favicon-32.png", 32)
save(f"{OUT}/favicon-16.png", 16)

ico16 = Image.open(f"{OUT}/favicon-16.png")
ico32 = Image.open(f"{OUT}/favicon-32.png")
ico16.save(f"{OUT}/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)])
print("saved favicon.ico")
