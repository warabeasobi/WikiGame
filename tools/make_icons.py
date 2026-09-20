#!/usr/bin/env python3
"""Generates the PNG app icons (no external dependencies).

Draws a rounded-square app icon with a "route" motif using signed-distance
functions so edges are anti-aliased. Outputs:
  icons/icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")

BG_A = (0x5B, 0x9B, 0xFF)   # top-left
BG_B = (0x2C, 0x62, 0xD6)   # bottom-right
FG = (0xFF, 0xFF, 0xFF)


def write_png(path, width, height, pixels):
    """pixels: list of rows, each row a list of (r,g,b,a) ints."""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for (r, g, b, a) in row:
            raw += bytes((r & 255, g & 255, b & 255, a & 255))
    def chunk(tag, data):
        out = struct.pack(">I", len(data)) + tag + data
        return out + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)
    return len(png)


def sdf_rounded_rect(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r


def sdf_circle(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r


def sdf_segment(px, py, ax, ay, bx, by, r):
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)) - r


def coverage(sd, aa):
    """1 inside, 0 outside, smooth in between."""
    return max(0.0, min(1.0, 0.5 - sd / aa))


def lerp(a, b, t):
    return a + (b - a) * t


def render(size, *, maskable=False):
    scale = 1.0 if maskable else 1.0
    pad = 0.0 if maskable else 0.0
    radius = 0.0 if maskable else 0.225 * size
    aa = 1.2

    # Route geometry (normalised 0..1, y down); maskable content shrinks into
    # the 80% safe zone.
    shrink = 0.78 if maskable else 1.0
    off = (1 - shrink) / 2

    def P(x, y):
        return ((off + x * shrink) * size, (off + y * shrink) * size)

    start = P(0.245, 0.755)
    w1 = P(0.455, 0.640)
    w2 = P(0.360, 0.395)
    target = P(0.735, 0.275)
    stroke = 0.072 * size * shrink
    start_r = 0.082 * size * shrink
    target_outer = 0.115 * size * shrink
    target_inner = 0.056 * size * shrink

    rows = []
    for y in range(size):
        py = y + 0.5
        row = []
        for x in range(size):
            px = x + 0.5

            # Background: full bleed (maskable) or rounded square.
            if maskable:
                bg_cov = 1.0
            else:
                bg_cov = coverage(sdf_rounded_rect(px, py, size / 2, size / 2, size / 2 - pad, size / 2 - pad, radius), aa)

            t = (px / size * 0.55 + py / size * 0.45)
            base = (lerp(BG_A[0], BG_B[0], t), lerp(BG_A[1], BG_B[1], t), lerp(BG_A[2], BG_B[2], t))

            # Foreground shapes
            fg = 0.0
            fg = max(fg, coverage(sdf_segment(px, py, *start, *w1, stroke / 2), aa))
            fg = max(fg, coverage(sdf_segment(px, py, *w1, *w2, stroke / 2), aa))
            fg = max(fg, coverage(sdf_segment(px, py, *w2, *target, stroke / 2), aa))
            fg = max(fg, coverage(sdf_circle(px, py, *start, start_r), aa))
            # target: ring
            ring = min(
                coverage(sdf_circle(px, py, *target, target_outer), aa),
                1.0 - coverage(sdf_circle(px, py, *target, target_inner), aa),
            )
            fg = max(fg, ring)

            r = lerp(base[0], FG[0], fg)
            g = lerp(base[1], FG[1], fg)
            b = lerp(base[2], FG[2], fg)
            a = bg_cov * 255.0
            row.append((int(round(r)), int(round(g)), int(round(b)), int(round(a))))
        rows.append(row)
    return rows


def main():
    os.makedirs(ICONS, exist_ok=True)
    jobs = [
        ("icon-180.png", 180, False),
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("icon-1024.png", 1024, False),
    ]
    for name, size, maskable in jobs:
        rows = render(size, maskable=maskable)
        written = write_png(os.path.join(ICONS, name), size, size, rows)
        print(f"{name}: {size}x{size} ({written // 1024} KB)")


if __name__ == "__main__":
    main()
