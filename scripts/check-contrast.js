// Text you can read on the colour it is printed on.
//
// This exists because of a button nobody could have caught by looking. The
// WhatsApp action on the listing screen was white on #25d366 — the brand's
// light green — which measures 1.98:1 against a 4.5:1 minimum. It was
// reported as "looks dimmed", which is what illegible looks like when the
// colours are pleasant. No amount of font weight would have fixed it, and
// nothing in the app complained.
//
// So: find every styled-component that sets both a literal background and a
// literal text colour, and measure the pair. Literals only, deliberately —
// theme values are resolved at runtime against two palettes and cannot be
// read from the source. What is left is exactly the risky set: the
// hand-picked brand colours somebody typed in, which are the ones nobody
// checked.
//
// WCAG AA: 4.5:1 for body text, 3:1 for large text (>=18.66px bold, or
// >=24px). The size is read from the same block where it can be found.
//
// Run: node scripts/check-contrast.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function channel(value) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(value) {
  const [r, g, b] = toRgb(value);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Colours that are not a surface behind text: a border, a shadow, a rule.
// Measuring text against them is meaningless.
const NOT_A_SURFACE = /border-color|shadow-color|tint-color/;

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGBA = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/;
const COLOUR = new RegExp(`${HEX.source}|${RGBA.source}`, "g");

// Translucent fills are most of the chips in this app, and leaving them
// unmeasured is how the guard ends up with nothing to guard: after the
// first pass fixed the only opaque offender, the check measured zero pairs
// and could no longer fail at all.
//
// A tint is composited over the light theme's surface, which is what it
// sits on everywhere it is used. The dark theme is a different question and
// is not answered here — those colours come from the palette, not from
// literals, so they are outside what this file can see.
const LIGHT_SURFACE = [255, 255, 255];

// A white or black wash is not a tint on the page, it is a scrim on top of
// something this file cannot see: a photograph, a gradient banner, a video
// still. Compositing those over white reports nonsense — white text on a
// white-over-white scrim measures 1.00:1 and is perfectly legible in the
// app, because what is actually underneath is a photograph.
//
// Coloured tints are the opposite: they are the chip idiom used throughout,
// and they always sit on the page's own surface, which is what makes them
// measurable. This is the honest boundary of a check that reads source
// rather than pixels.
const isScrim = (value) =>
  /^rgba?\(\s*(255,\s*255,\s*255|0,\s*0,\s*0)\b/.test(value);

function toRgb(value) {
  if (value.startsWith("#")) {
    const clean = value.slice(1);
    const full =
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const parts = value
    .slice(value.indexOf("(") + 1, value.indexOf(")"))
    .split(",")
    .map((n) => Number(n.trim()));
  const [r, g, b, a = 1] = parts;
  return [r, g, b].map((channelValue, i) =>
    Math.round(channelValue * a + LIGHT_SURFACE[i] * (1 - a)),
  );
}

const colours = (line) => line.match(COLOUR) ?? [];

// A separate, non-global copy for .test(). A /g regex keeps lastIndex
// between calls, so testing the same pattern twice returns true then false
// on identical input — which silently halved what this file looked at.
const HAS_COLOUR = new RegExp(`${HEX.source}|${RGBA.source}`);

// A line that picks between two colours, where one branch is a named
// constant this file cannot resolve, cannot be paired reliably: the
// background's visible branch gets matched against the label's visible
// branch even when they belong to opposite states. That is how
// `added ? EMERALD : tint` on a badge and `added ? white : EMERALD` on its
// label produced "white on tint" — a combination the app never draws.
//
// If a branch is invisible, the honest answer is not to guess.
const unreadable = (line) => /[?]/.test(line) && colours(line).length < 2;

// The container holds the background and a separate component holds the
// text — WhatsAppButton and WhatsAppLabel, CallButton and CallButtonLabel.
// That split is why the unreadable pair was invisible: neither component on
// its own says anything is wrong.
//
// Pairing is by name, which is the convention this codebase already
// follows: strip the container's role suffix and look for a component with
// the same stem that carries a text role.
const CONTAINER =
  /(Button|Card|Pill|Chip|Bar|Cta|Badge|Box|Tag|Disc|Banner|Row|Ghost|Plate|Tile)$/;
const TEXT = /(Label|Text|Title|Value|Copy|Name)$/;

const failures = [];

// Module-level colour constants, resolved so the lines that use them can be
// measured at all.
//
// Without this the guard saw five pairs in the whole app, because nearly
// every screen writes `color: ${EMERALD}` rather than the hex. Five pairs is
// not a guard, it is a rounding error — and the WhatsApp button that started
// all of this would have slipped through untouched had it been written with
// a constant instead of a literal.
const CONSTANT = /^const ([A-Z][A-Z0-9_]*) = "(#[0-9a-fA-F]{3,8})";$/gm;

function resolveConstants(source, body) {
  let out = body;
  for (const match of source.matchAll(CONSTANT)) {
    out = out.split("${" + match[1] + "}").join(match[2]);
  }
  return out;
}

const declarations = [];
for (const file of walk(path.join(root, "src"))) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  for (const match of source.matchAll(
    /const (\w+) = styled[^`]*`([\s\S]*?)`;/g,
  )) {
    const [, name, rawBody] = match;
    const body = resolveConstants(source, rawBody);
    declarations.push({
      file: rel,
      name,
      body,
      line: source.slice(0, match.index).split("\n").length,
    });
  }
}

const byFile = new Map();
for (const decl of declarations) {
  if (!byFile.has(decl.file)) byFile.set(decl.file, []);
  byFile.get(decl.file).push(decl);
}

// A label belongs to the closest container whose name it extends, not to
// every one that shares a prefix. HeroPostCtaLabel sits inside HeroPostCta,
// which is dark; pairing it with HeroPostBar, which is white, measured
// white on white and reported a fault that does not exist.
// Full name first, stem second.
//
// Both rules alone are wrong, in opposite directions. HeroPostBar,
// HeroPostDisc and HeroPostCta all reduce to the stem "HeroPost", so
// matching on stems handed HeroPostCtaLabel to whichever had the longest
// name — the icon disc — and measured text against a tint no text is ever
// printed on. But matching on full names only drops WhatsAppButton and
// WhatsAppLabel, which is the pair this whole file exists because of.
//
// So: if any container's whole name prefixes the label, the longest of
// those owns it. Otherwise fall back to the longest stem that prefixes it.
function ownerOf(label, siblings) {
  const containers = siblings.filter(
    (other) => other !== label && CONTAINER.test(other.name),
  );
  const exact = containers.filter((other) => label.name.startsWith(other.name));
  const pool = exact.length
    ? exact
    : containers.filter((other) =>
        label.name.startsWith(other.name.replace(CONTAINER, "")),
      );
  let best = null;
  for (const other of pool) {
    if (!best || other.name.length > best.name.length) best = other;
  }
  return best;
}

function textColoursFor(container, siblings) {
  const stem = container.name.replace(CONTAINER, "");
  if (!stem) return [];
  const out = [];
  for (const other of siblings) {
    if (other === container) continue;
    if (!other.name.startsWith(stem) || !TEXT.test(other.name)) continue;
    if (ownerOf(other, siblings) !== container) continue;
    const line = other.body
      .split("\n")
      .find(
        (l) =>
          /^\s*color:/.test(l) && HAS_COLOUR.test(l) && !NOT_A_SURFACE.test(l),
      );
    if (line && !unreadable(line)) {
      out.push({ owner: other, colours: colours(line) });
    }
  }
  return out;
}

let pairs = 0;
for (const [file, siblings] of byFile) {
  for (const container of siblings) {
    const bgLine = container.body
      .split("\n")
      .find((l) => /^\s*background(-color)?:/.test(l) && HAS_COLOUR.test(l));
    if (!bgLine) continue;
    // WCAG 1.4.3 exempts inactive controls, and every one of these lines is
    // a ternary whose other half is a disabled grey. Measuring the greyed
    // state would report a dozen faults for the one thing a disabled button
    // is supposed to look like.
    if (/disabled/.test(bgLine)) continue;
    const backgrounds = colours(bgLine).filter((value) => !isScrim(value));
    if (!backgrounds.length) continue;

    // The component's own colour, plus any matching label's.
    const ownColour = container.body
      .split("\n")
      .find(
        (l) =>
          /^\s*color:/.test(l) && HAS_COLOUR.test(l) && !NOT_A_SURFACE.test(l),
      );
    const texts = textColoursFor(container, siblings);
    if (ownColour)
      texts.push({ owner: container, colours: colours(ownColour) });
    if (!texts.length) continue;

    for (const { owner, colours } of texts) {
      const sizeMatch = owner.body.match(/font-size:\s*([\d.]+)px/);
      const size = sizeMatch ? Number(sizeMatch[1]) : 14;
      const bold = /font-weight:\s*(700|800|900|bold)|fontFamily\.bold/.test(
        owner.body,
      );
      const large = size >= 24 || (bold && size >= 18.66);
      const floor = large ? 3 : 4.5;

      // A ternary carries one colour per state, and the states line up:
      // `added ? EMERALD : tint` on the background pairs with
      // `added ? white : EMERALD` on the label, in that order. Crossing them
      // measured white on the pale tint — a combination the app never draws
      // — and reported three faults that were not there.
      //
      // Only when the counts match. Anything else falls back to measuring
      // everything against everything, which is the conservative direction.
      const aligned =
        backgrounds.length === colours.length && backgrounds.length > 1;
      const combinations = aligned
        ? backgrounds.map((bg, i) => [bg, colours[i]])
        : backgrounds.flatMap((bg) => colours.map((fg) => [bg, fg]));

      for (const [bg, fg] of combinations) {
        pairs += 1;
        const value = contrast(fg, bg);
        if (value < floor) {
          failures.push(
            `${file}:${container.line} ${owner.name} on ${container.name} — ` +
              `${fg} on ${bg} is ${value.toFixed(2)}:1, needs ${floor}:1 at ${size}px`,
          );
        }
      }
    }
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: ${pairs} hard-coded text-on-colour pair(s), all legible against WCAG AA`,
);
