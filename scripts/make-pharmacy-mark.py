#!/usr/bin/env python3
"""Draw the coupe d'Hygie — the pharmacy sign — as an app asset.

The screen used Ionicons' "medkit", a first-aid case. That is the sign for
a doctor's bag, not for a pharmacy: the emblem over a pharmacie in Bénin, as
across the francophone world, is the bowl of Hygieia — a serpent coiled about
a chalice — usually beside a green cross.

Why an asset and not a component. There is no react-native-svg here, and the
plain-View technique BrandMark uses can draw an arch out of rectangles but
cannot draw a snake. Adding a native module for one glyph would mean a
rebuild of the app. So the mark is authored as SVG and rasterised with
qlmanage, which ships with macOS and is already how scripts/fetch-company-
logos.py turns vector logos into PNGs.

Drawn in black on transparent, then recoloured through the alpha channel:
qlmanage composites its thumbnail over white, so white strokes would render
as nothing at all.

The emblem is descriptive here — it labels a category of business, the way a
fuel pump labels a filling station. It is not placed on anything of ours that
could be read as claiming pharmaceutical standing.

Run: python3 scripts/make-pharmacy-mark.py
"""
import os
import subprocess
import tempfile
from PIL import Image

SIZE = 256

# Stroked rather than filled, so the weights stay even when the whole thing
# is scaled down to 22 points inside a 46-point box. Round caps and joins:
# a snake with mitred corners reads as a lightning bolt.
SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g fill="none" stroke="#000000" stroke-width="7"
     stroke-linecap="round" stroke-linejoin="round">
    <!-- the chalice: rim, bowl, stem, foot. The rim is its own line rather
         than closing the bowl path, which put a diagonal across the cup. -->
    <path d="M26 46 L 70 46"/>
    <path d="M28 46 C 28 64, 37 72, 48 72 C 59 72, 68 64, 68 46"/>
    <path d="M48 72 L 48 84"/>
    <path d="M34 88 L 62 88"/>
    <!-- The serpent. It climbs on the OUTSIDE of the bowl — the first
         attempt ran the body through the cup, which crossed the bowl's own
         curve twice and filled the inside with stray triangles. Above the
         rim it arches back over the opening, which is where the head belongs:
         the snake is drinking from the cup. -->
    <path d="M66 88 C 80 85, 87 72, 81 62
             C 76 53, 76 46, 78 39
             C 81 30, 70 22, 60 27"/>
  </g>
  <!-- the head, solid so it survives being scaled to 22 points -->
  <circle cx="60" cy="28" r="5.5" fill="#000000"/>
</svg>
"""


def rasterise(svg_text, px):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "mark.svg")
        with open(path, "w") as handle:
            handle.write(svg_text)
        subprocess.run(
            ["qlmanage", "-t", "-s", str(px), "-o", tmp, path],
            capture_output=True,
        )
        out = path + ".png"
        if not os.path.exists(out):
            raise SystemExit("qlmanage produced nothing — is this macOS?")
        image = Image.open(out)
        image.load()
        return image.convert("RGBA")


def recolour(image, rgb):
    """Keep the shape, replace the colour.

    qlmanage flattens onto white, so the drawing arrives as dark pixels on a
    white field rather than as alpha. Luminance becomes the mask: black
    strokes go fully opaque, the white ground goes fully transparent, and the
    anti-aliased edge in between keeps its softness.
    """
    grey = image.convert("L")
    alpha = grey.point(lambda value: 255 - value)
    solid = Image.new("RGBA", image.size, rgb + (255,))
    solid.putalpha(alpha)
    return solid


def trim(image):
    box = image.split()[3].getbbox()
    if not box:
        return image
    image = image.crop(box)
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "assets")
    # Rendered large and reduced, so the thin parts of the coil survive.
    raw = rasterise(SVG, 1024)
    for name, rgb in (("pharmacy-mark.png", (255, 255, 255)),):
        path = os.path.join(out_dir, name)
        trim(recolour(raw, rgb)).save(path)
        print(f"  {name}  {SIZE}x{SIZE}")
