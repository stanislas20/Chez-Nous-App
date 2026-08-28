#!/usr/bin/env python3
"""Draw the native splash icon from the same geometry as src/components/BrandMark.js.

The Android splash theme always references @drawable/splashscreen_logo, and
expo-splash-screen only generates that drawable when an `image` is configured.
Declaring a background colour alone therefore produces a theme pointing at a
drawable that does not exist, and resource linking fails at the very end of the
build — after an hour of native compilation, which is a bad way to find out.

So there is an image, and it is the mark rather than a placeholder: the native
splash is the first frame of the animated one, and the two have to agree. What
Android shows before any JS runs is now a white disc carrying the green arch on
the #00553A ground, which is what BrandSplash draws a moment later.

A disc, not the rounded plate the animated splash uses, because Android 12+
masks this drawable to a circle. Fighting that would clip the corners off a
square; leaning into it gives the same reading — white ground, green mark —
with nothing cut.

Geometry is copied from BrandMark's 64x64 artboard and must stay in step with
it; scripts/check-brand-mark.js guards the stroke that both depend on.

Run: python3 scripts/make-splash-icon.py
"""
from PIL import Image, ImageDraw
import math
import os

BOX = 64.0
STROKE = 4.6
APEX_X, APEX_Y = 32.0, 17.0
EAVE_X, EAVE_Y = 14.0, 31.5
DOOR_LEFT, DOOR_RIGHT, DOOR_BOTTOM = 25.0, 39.0, 47.0
ARC_R, ARC_CY = 7.0, 37.5

GREEN = (0, 135, 81, 255)
WHITE = (255, 255, 255, 255)

CANVAS = 1024
SS = 4  # supersample, then downscale — the edges have to survive being small
# Android 12+ masks this to a circle and shows roughly the middle two thirds,
# so everything stays well inside that.
DISC_FRACTION = 0.62
MARK_FRACTION = 0.34


def draw(size):
    n = size * SS
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    disc = n * DISC_FRACTION
    d.ellipse(
        [(n - disc) / 2, (n - disc) / 2, (n + disc) / 2, (n + disc) / 2],
        fill=WHITE,
    )

    # The mark, mapped from the 64-unit artboard into a centred square.
    mark = n * MARK_FRACTION
    unit = mark / BOX
    ox = (n - mark) / 2
    oy = (n - mark) / 2
    px = lambda x: ox + x * unit
    py = lambda y: oy + y * unit
    w = int(round(STROKE * unit))

    # Roof: two strokes meeting at the apex, round caps.
    for a, b in (((EAVE_X, EAVE_Y), (APEX_X, APEX_Y)),
                 ((APEX_X, APEX_Y), (BOX - EAVE_X, EAVE_Y))):
        d.line([(px(a[0]), py(a[1])), (px(b[0]), py(b[1]))], fill=GREEN, width=w)
    for cx, cy in ((EAVE_X, EAVE_Y), (APEX_X, APEX_Y), (BOX - EAVE_X, EAVE_Y)):
        r = w / 2
        d.ellipse([px(cx) - r, py(cy) - r, px(cx) + r, py(cy) + r], fill=GREEN)

    # Door: an arch, open at the bottom.
    d.arc(
        [px(DOOR_LEFT), py(ARC_CY - ARC_R), px(DOOR_RIGHT), py(ARC_CY + ARC_R)],
        180, 360, fill=GREEN, width=w,
    )
    for x in (DOOR_LEFT, DOOR_RIGHT):
        d.line(
            [(px(x), py(ARC_CY)), (px(x), py(DOOR_BOTTOM))], fill=GREEN, width=w
        )

    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "assets", "splash-mark.png")
    draw(CANVAS).save(out)
    print(f"wrote {out} ({CANVAS}x{CANVAS})")
