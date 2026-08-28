#!/usr/bin/env python3
"""Draw every shipped image of the mark from src/components/BrandMark.js.

One geometry, one script, so the app icon, the adaptive icon, the themed icon,
the favicon and the native splash cannot drift apart. They were five separate
files before, four of them Expo's placeholder chevron.

    assets/icon.png                     iOS and the general icon
    assets/android-icon-foreground.png  adaptive foreground, in the safe zone
    assets/android-icon-background.png  adaptive background
    assets/android-icon-monochrome.png  themed icon, tinted by the system
    assets/favicon.png                  web
    assets/splash-mark.png              the native splash

The icon is the mark reversed out of Vert Bénin, which is the version the
design doc says should ship: "en icône d'application, c'est la version unie qui
doit partir". A white ground was tried first and looks like an absence on a
home screen — every other icon there is a colour, and the one that is not reads
as missing rather than as restrained.

The splash keeps the opposite arrangement on purpose. It is a white plate on a
green field, so the icon a person taps and the plate that greets them are the
same two colours changing places, not two different marks.

Two things the geometry has to respect that nothing else in the app does:

  - Android crops an adaptive foreground to the middle 72 of 108dp, so the
    mark sits inside the central two thirds and nothing near the edge.
  - The whole point of the mark is the daylight between roof and door. It
    survives 20px at stroke 4.6 (see scripts/check-brand-mark.js) and these
    are all drawn at that weight, scaled — never re-weighted per size.

Run: python3 scripts/make-brand-assets.py
"""
from PIL import Image, ImageDraw
import os

BOX = 64.0
STROKE = 4.6
APEX_X, APEX_Y = 32.0, 17.0
EAVE_X, EAVE_Y = 14.0, 31.5
DOOR_LEFT, DOOR_RIGHT, DOOR_BOTTOM = 25.0, 39.0, 47.0
ARC_R, ARC_CY = 7.0, 37.5

# Vert Bénin, the palette's "marque, actions principales". Not the splash's
# darker ground: an icon is seen at 48px against a wallpaper and needs the
# more saturated of the two greens to hold its own.
GREEN = (0, 135, 81, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)
SPLASH_GROUND = (0, 85, 58, 255)

SS = 4  # supersample, then downscale — these are read at 48px on a home screen


def mark(draw, ox, oy, span, colour):
    """The mark, mapped from the 64-unit artboard into a square at (ox, oy)."""
    unit = span / BOX
    px = lambda x: ox + x * unit
    py = lambda y: oy + y * unit
    w = max(1, int(round(STROKE * unit)))

    for a, b in (((EAVE_X, EAVE_Y), (APEX_X, APEX_Y)),
                 ((APEX_X, APEX_Y), (BOX - EAVE_X, EAVE_Y))):
        draw.line([(px(a[0]), py(a[1])), (px(b[0]), py(b[1]))], fill=colour, width=w)
    # Round caps and a clean apex, which PIL's line joins do not give.
    for cx, cy in ((EAVE_X, EAVE_Y), (APEX_X, APEX_Y), (BOX - EAVE_X, EAVE_Y)):
        r = w / 2
        draw.ellipse([px(cx) - r, py(cy) - r, px(cx) + r, py(cy) + r], fill=colour)

    # PIL draws an arc's width INWARD from the bounding box, while it draws a
    # line centred on its path. Passing the arc the same box as the door's
    # centre line therefore put the arch's outer edge where the two verticals'
    # centres are — half a stroke out of step at each side, which closed up the
    # opening and left the arch reading as a blob rather than a doorway.
    #
    # Growing the box by half a stroke makes the arc straddle the radius the
    # way the verticals straddle theirs, and the three meet.
    half = w / 2
    draw.arc(
        [px(DOOR_LEFT) - half, py(ARC_CY - ARC_R) - half,
         px(DOOR_RIGHT) + half, py(ARC_CY + ARC_R) + half],
        180, 360, fill=colour, width=w,
    )
    for x in (DOOR_LEFT, DOOR_RIGHT):
        draw.line([(px(x), py(ARC_CY)), (px(x), py(DOOR_BOTTOM))], fill=colour, width=w)


def canvas(size, ground=None):
    n = size * SS
    im = Image.new("RGBA", (n, n), ground or (0, 0, 0, 0))
    return im, ImageDraw.Draw(im), n


def square_icon(size, ground, ink, fraction=0.62):
    """Full-bleed square. iOS and Android both apply their own mask."""
    im, d, n = canvas(size, ground)
    span = n * fraction
    mark(d, (n - span) / 2, (n - span) / 2, span, ink)
    return im.resize((size, size), Image.LANCZOS)


def adaptive_foreground(size, ink):
    """Android crops to the middle two thirds, so the mark stays well inside."""
    im, d, n = canvas(size)
    span = n * 0.42
    mark(d, (n - span) / 2, (n - span) / 2, span, ink)
    return im.resize((size, size), Image.LANCZOS)


def splash_mark(size):
    """A disc, because Android 12+ masks the splash drawable to a circle."""
    im, d, n = canvas(size)
    disc = n * 0.62
    d.ellipse([(n - disc) / 2, (n - disc) / 2, (n + disc) / 2, (n + disc) / 2], fill=WHITE)
    span = n * 0.34
    mark(d, (n - span) / 2, (n - span) / 2, span, GREEN)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = lambda name: os.path.join(root, "assets", name)

    written = [
        ("icon.png", square_icon(1024, GREEN, WHITE)),
        ("favicon.png", square_icon(256, GREEN, WHITE)),
        ("android-icon-foreground.png", adaptive_foreground(1024, WHITE)),
        ("android-icon-background.png", Image.new("RGBA", (1024, 1024), GREEN)),
        # Themed icons are tinted by the system from the alpha channel, so the
        # colour here is only a carrier.
        ("android-icon-monochrome.png", adaptive_foreground(1024, BLACK)),
        ("splash-mark.png", splash_mark(1024)),
    ]
    for name, image in written:
        image.save(out(name))
        print(f"  wrote assets/{name}  {image.size[0]}x{image.size[1]}")
