#!/usr/bin/env python3
"""Download each company's own logo from its own site.

The cards carried monogram plates because nothing here holds a logo for a
bank or an insurer. This fetches them from the source that is entitled to
publish them — the company's own homepage — rather than from an image search,
so what ships is the mark the company puts on its own front door.

Only sites whose <title> identifies the company are listed below.

What is still missing, and why, so nobody repeats the search:

  BSIC, CCEI, Coris, GAB,          no domain resolves under any name tried
  L'Africaine
  AFG, NOBILA, ChinaDrive          site is live but publishes no raster logo
                                   anywhere — not HTML, CSS, manifest or
                                   schema.org
  BGFI                             bgfi.com serves HTML but its logo asset
                                   answers 522; worth retrying, it may just
                                   have been down

APBEF-Bénin, the banks' own association, looked like it would solve most of
this in one page. Its domain is compromised: every path returns the same
spam page serving images from an unrelated gambling brand. Not a source.

Those companies keep their monogram. A wrong logo is worse than no logo — it
is a different company's mark on this one's card.

Candidates are ordered by what the tag is FOR, and og:image is deliberately
not among them. It is a social-preview image, and plenty of sites make that a
photograph: Société Générale's was a stock shot of two people at a desk, which
the first version of this script duly downloaded and called a logo. A wrong
image is worse than none — it puts somebody else's picture on a company's
card — so only tags that mean "this is our mark" are read.

Assets whose path says "logo" come FIRST, ahead of the icons. That order was
the other correction: MTN's apple-touch-icon is a black-and-white oval, while
the logo in their own footer is the yellow mark everybody recognises. An icon
is what a site shows in a browser tab, and plenty of brands strip the colour
out of it.

SVG is rasterised with qlmanage, which ships with macOS — that is where most
of the colour logos live, MTN's included.

Run: python3 scripts/fetch-company-logos.py
"""
import io
import os
import re
import subprocess
import urllib.parse
from PIL import Image

# key -> the company's own site, each confirmed by reading its <title>.
SITES = {
    # Mobile operators — ARCEP
    "mtn": "https://www.mtn.bj/",
    "celtiis": "https://celtiis.bj/",
    "moov": "https://www.moov-africa.ci/",
    # Banks — BCEAO
    "boa": "https://boabenin.com/",
    "sgb": "https://societegenerale.bj/",
    "uba": "https://ubabenin.com/",
    "ecobank": "https://ecobank.com/",
    "nsia": "https://groupensia.com/",
    "bgfi": "https://bgfi.com/",
    "coris": "https://www.corisbank.com/",
    "bgfi": "https://bgfi.com/",
    "atlantique": "https://www.banqueatlantique.net/",
    "biic": "https://www.biic.bj/",
    # Insurers — ASA Bénin
    "nsia-iard": "https://www.nsiaassurancesbenin.com/",
    "nsia-vie": "https://site.nsiaviebenin.com/",
    "sunu": "https://www.sunu-group.com/",
    "sunu-vie": "https://www.sunu-group.com/",
    "afg": "https://afgassurances.bj/",
    "afg-vie": "https://afgassurances.bj/",
    "biic": "https://www.biic-bank.com/fr/",
    "sanlam": "https://sanlamallianz.com/",
    "sanlam-vie": "https://sanlamallianz.com/",
    "alst": "https://www.africanlease.com/",
    "nobila": "https://nobilaassurances.com/",
    # Car distributors — their own sites, already in carDealerships.js
    "cfao": "https://www.toyota.bj",
    "sonaec": "https://sonaec.com",
    "socar": "https://www.socar-benin.com",
    "chinadrive": "https://www.chinadrivebj.com",
}

SIZE = 256
UA = "Mozilla/5.0"

# Sites that answer with something, but not with their own logo. Kept here
# with the reason so a re-run does not quietly put them back — every one of
# these was downloaded once and had to be deleted by hand after looking at it.
#
#   cfao        toyota.bj serves the TOYOTA mark. It is the right site — CFAO
#               distributes Toyota — but on a card headed "CFAO Mobility
#               Bénin" it says the manufacturer is the verified business.
#   sanlam      sanlam.com's logo image is the Investment Analysts Society of
#               South Africa, which is not Sanlam and not in Bénin.
#   ecobank     the logo SVG rasterises to an empty frame.
#   chinadrive  ditto, a blank PNG.
REJECTED = {"chinadrive"}

# Assets the generic extraction cannot reach, each with why it needs naming.
#
#   celtiis  the site is Next.js and serves every image through /_next/image
#            ?url=<encoded>, inside a srcset. The wrapper is what a src regex
#            captures; the asset itself never appears as a plain URL.
#   moov     moov-africa.bj answers 522 — Cloudflare cannot reach the origin,
#            so the Bénin site is down rather than blocking us. Moov Africa is
#            one brand across its markets and publishes one mark, so this is
#            taken from Moov Africa Côte d'Ivoire. It is the same company's
#            own logo from the same company's own site, in a country where
#            the site is up. Swap it for the .bj asset when that returns.
DIRECT = {
    "celtiis": "https://celtiis.bj/celtiis-logo-rounded.svg",
    # ecobank.com's own logo SVG rasterises to an empty frame; the
    # apple-touch-icon beside it is the same mark and renders.
    "ecobank": "https://ecobank.com/img/eco/apple-touch-icon.png",
    # nsiabanque.bj is behind Cloudflare (403). This is the NSIA group's own
    # mark from groupensia.com, which is the branding NSIA Banque Bénin uses.
    "nsia": "https://groupensia.com/sites/default/files/LOGO-NSIA-031-1024x470_1.png",
    # bgfi.com is the group site; BGFIBank Bénin trades under the group mark.
    "bgfi": "https://bgfi.com/assets/images/logo-bgfi.png",
    # SanlamAllianz is the brand ASA Bénin lists. sanlam.com — a different
    # company's site — served the Investment Analysts Society of South
    # Africa, which is how the first attempt went wrong.
    "sanlam": "https://www.sanlamallianz.com/uploads/settings/1687440332-logo.svg",
    "sanlam-vie": "https://www.sanlamallianz.com/uploads/settings/1687440332-logo.svg",
    # ALST publishes its own mark on its group's site, which our data already
    # records as "Groupe African Lease".
    "alst": "https://africanlease.com/wp-content/uploads/2024/10/"
    "Plan-de-travail-1ALST-logo-1.svg",
    # CFAO's OWN mark, from CFAO Group. Not toyota.bj — that site is CFAO's
    # but serves the TOYOTA logo, and on a card headed "CFAO Mobility Bénin"
    # the manufacturer's mark says the manufacturer is the business.
    "cfao": "https://www.cfaogroup.com/wp-content/themes/hds_theme/assets/img/logo-noir.svg",
    "moov": "https://www.moov-africa.ci/wp-content/uploads/2020/11/"
    "cropped-favicon-moov-01-192x192.png",
}


def get(url, binary=False):
    out = subprocess.run(
        ["curl", "-sSL", "-m", "25", "-A", UA, url], capture_output=True
    ).stdout
    return out if binary else out.decode("utf-8", "replace")


def stylesheet_urls(page_url, html):
    """Logos hidden in CSS.

    Plenty of sites never put the logo in an <img> at all — it is a
    background-image on a header div. AFG, Ecobank and Celtiis all failed the
    first pass for exactly this reason, which looked like "no logo" and was
    really "not looking in the right file".
    """
    found = []
    for match in re.finditer(
        r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)', html, re.I
    ):
        sheet = urllib.parse.urljoin(page_url, match.group(1))
        css = get(sheet)
        for hit in re.finditer(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', css):
            asset = urllib.parse.urljoin(sheet, hit.group(1))
            if "logo" in asset.lower():
                found.append(asset)
    return found


def structured_logo(page_url, html):
    """schema.org publishers declare a logo, which is as explicit as it gets."""
    found = []
    for match in re.finditer(r'"logo"\s*:\s*"([^"]+)"', html):
        found.append(urllib.parse.urljoin(page_url, match.group(1).replace("\\/", "/")))
    for match in re.finditer(
        r'<link[^>]+rel=["\']manifest["\'][^>]+href=["\']([^"\']+)', html, re.I
    ):
        manifest_url = urllib.parse.urljoin(page_url, match.group(1))
        for hit in re.finditer(r'"src"\s*:\s*"([^"]+)"', get(manifest_url)):
            found.append(urllib.parse.urljoin(manifest_url, hit.group(1)))
    return found


def candidates(page_url):
    html = get(page_url)
    found = []
    patterns = [
        r'<img[^>]+(?:src|data-src)=["\']([^"\']*logo[^"\']*)["\']',
        r'<link[^>]+rel=["\'][^"\']*apple-touch-icon[^"\']*["\'][^>]+href=["\']([^"\']+)',
        r'<link[^>]+rel=["\'][^"\']*icon[^"\']*["\'][^>]+href=["\']([^"\']+)',
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, html, re.I):
            url = urllib.parse.urljoin(page_url, match.group(1))
            if url not in found:
                found.append(url)
    # Then the places a logo hides when it is not an <img>.
    for extra in structured_logo(page_url, html) + stylesheet_urls(page_url, html):
        if extra not in found:
            found.append(extra)
    return found


def square(image):
    """Trim the transparent or flat border, then centre on a square canvas.

    Sites publish logos padded to whatever their own layout wanted. Without
    trimming, one arrives twice the size of the next and the row looks
    accidental.
    """
    image = image.convert("RGBA")
    alpha = image.split()[3]
    box = alpha.getbbox() if alpha.getextrema()[0] < 255 else None
    if box is None:
        # Opaque image: trim against the corner colour instead.
        flat = Image.new("RGB", image.size, image.convert("RGB").getpixel((0, 0)))
        from PIL import ImageChops

        diff = ImageChops.difference(image.convert("RGB"), flat)
        box = diff.getbbox()
    if box:
        image = image.crop(box)

    side = max(image.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def rasterise(data):
    """SVG -> PNG via qlmanage, which is already on every Mac."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        svg = os.path.join(tmp, "logo.svg")
        with open(svg, "wb") as handle:
            handle.write(data)
        subprocess.run(
            ["qlmanage", "-t", "-s", "512", "-o", tmp, svg],
            capture_output=True,
        )
        out = svg + ".png"
        if not os.path.exists(out):
            return None
        image = Image.open(out)
        image.load()
        return image


def best(urls):
    for url in urls:
        data = get(url, binary=True)
        if len(data) < 256:
            continue
        try:
            if url.lower().split("?")[0].endswith(".svg") or data[:5] == b"<?xml":
                image = rasterise(data)
                if image is None:
                    continue
            else:
                image = Image.open(io.BytesIO(data))
                image.load()
        except Exception:
            continue
        # A logo narrower than 48px in either direction is a favicon crop.
        if min(image.size) < 48:
            continue
        return url, square(image)
    return None, None


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "assets", "logos")
    os.makedirs(out_dir, exist_ok=True)

    for key, site in SITES.items():
        if key in REJECTED:
            print(f"  {key:11} skipped — see REJECTED")
            continue
        url, image = (
            best([DIRECT[key]]) if key in DIRECT else best(candidates(site))
        )
        if image is None:
            print(f"  {key:11} no usable image at {site}")
            continue
        path = os.path.join(out_dir, f"{key}.png")
        image.save(path)
        print(f"  {key:11} {image.size[0]}x{image.size[1]}  <- {url[:70]}")
