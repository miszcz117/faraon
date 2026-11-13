"""Turns raw generated art into game assets.

Sprites: cropped to their opaque pixels, building sprites stretched vertically so their
base edges run at exactly 2:1 (the game's projection), then resized and saved as WebP.
Textures: made tileable by cross-fading opposite edges, tinted, saved at two sizes.
Prints the sprite metadata the game needs (size and anchor in pixels).

Usage: python3 tools/process_art.py RAW_DIR
"""
import json, sys
import numpy as np
from PIL import Image

RAW = sys.argv[1]
OUT = 'art'

# name: (kind, target size in px along the fitted axis)
SPRITES = {
    'palm_a': ('tree', 420), 'palm_b': ('tree', 380), 'palm_c': ('tree', 420), 'reeds': ('tree', 220),
    'house_a': ('building', 420), 'house_b': ('building', 520), 'hut': ('building', 440),
    'granary': ('building', 520), 'workshop': ('building', 460), 'boat': ('flat', 420),
}
# name: (tile px, low-res px or None, target mean colour or None, strength of the tint)
TEXTURES = {
    'sand': (512, 128, (232, 203, 136), 1.0), 'water': (512, 128, None, 0), 'grass': (512, 128, (124, 172, 74), 0.6),
    'crops': (384, 96, None, 0), 'wheat': (384, 96, (226, 190, 84), 0.5), 'stone': (512, 128, (250, 241, 216), 1.0),
    'strata': (512, 128, (240, 228, 200), 0.9), 'earth': (384, 96, (207, 163, 107), 0.9),
}

def base_corners(a):
    ys, xs = np.where(a); x0, x1, y1 = xs.min(), xs.max(), ys.max()
    bot = np.where(a[y1 - 3:y1 + 1].any(axis=0))[0]; fx = float(np.median(bot))
    w = x1 - x0
    def side(cols):
        return float(np.median([np.where(a[:, c])[0].max() for c in cols if a[:, c].any()]))
    ly = side(range(x0, x0 + max(3, w // 60))); ry = side(range(x1 - max(3, w // 60), x1 + 1))
    return x0, x1, fx, float(y1), ly, ry

meta = {}
for name, (kind, size) in SPRITES.items():
    im = Image.open(f'{RAW}/{name}.png').convert('RGBA')
    im = im.crop(im.getbbox())
    a = np.array(im)[:, :, 3] > 40
    if kind == 'building':
        x0, x1, fx, fy, ly, ry = base_corners(a)
        slope = (fy - ly) / (fx - x0)                 # the left base edge is the reliable one
        im = im.resize((im.width, round(im.height * 0.5 / slope)), Image.LANCZOS)
        a = np.array(im)[:, :, 3] > 40
        x0, x1, fx, fy, ly, ry = base_corners(a)
        k = size / im.width
        im = im.resize((size, round(im.height * k)), Image.LANCZOS)
        meta[name] = dict(w=im.width, h=im.height, ax=round(fx * k, 1), ay=round(fy * k, 1), wd=round((fx - x0) / (x1 - fx), 3))
    else:
        k = size / (im.height if kind == 'tree' else im.width)
        ys, xs = np.where(a); y1 = ys.max()
        bx = float(np.median(np.where(a[int(y1 - im.height * 0.02):y1 + 1].any(axis=0))[0]))
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        if kind == 'tree': meta[name] = dict(w=im.width, h=im.height, ax=round(bx * k, 1), ay=im.height - 2)
        else: meta[name] = dict(w=im.width, h=im.height, ax=round(im.width / 2, 1), ay=round(im.height * 0.78, 1))
    im.save(f'{OUT}/{name}.webp', quality=88, method=6)

def seamless(arr, b):
    """Cross-fade the first b columns with the b columns past the cut, then the same for rows."""
    def fold(x):
        n = x.shape[1]; ramp = np.linspace(0, 1, b)[None, :, None]
        out = x[:, :n - b].copy()
        out[:, :b] = x[:, :b] * ramp + x[:, n - b:] * (1 - ramp)
        return out
    return fold(fold(arr).transpose(1, 0, 2)).transpose(1, 0, 2)

for name, (px, lo, target, strength) in TEXTURES.items():
    arr = np.asarray(Image.open(f'{RAW}/{name}.png').convert('RGB'), dtype=np.float32)
    arr = seamless(arr, 160)
    if target is not None:
        mean = arr.reshape(-1, 3).mean(axis=0)
        tinted = arr / mean * np.array(target, dtype=np.float32)
        arr = arr * (1 - strength) + tinted * strength
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    im.resize((px, px), Image.LANCZOS).save(f'{OUT}/{name}.webp', quality=86, method=6)
    if lo: im.resize((lo, lo), Image.LANCZOS).save(f'{OUT}/{name}_lo.webp', quality=86, method=6)

print(json.dumps(meta))
