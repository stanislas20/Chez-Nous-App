// The brand is complete and still before it leaves.
//
// The opening screen has three parts and only the middle one is the point:
// it assembles, it sits there, and it fades into the app. The sitting still
// is what a splash is for, and it is the part that goes missing — not by
// anybody deciding to remove it, but by an animation being added a little
// later, or a duration being nudged up, until the hold has been eaten and
// the screen is only ever mid-assembly or mid-departure.
//
// That is invisible in a screenshot. It only exists in motion, which is why
// it shipped once already: SPLASH_MS was the design doc's 2400 while the
// tricolour rule settled at 2650 and the tagline at 2800, so the last two
// elements were being faded out as they faded in.
//
// So this reads the timings out of the component and checks the arithmetic
// the comments claim.
//
// Run: node scripts/check-splash.js
const path = require("path");
const fs = require("fs");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "BrandSplash.js"),
  "utf8",
);

// Read from the source rather than executed.
//
// A first version imported the module in a VM and died on StyleSheet.create,
// which runs at import time — this is a component, not a data file. Stubbing
// enough of react-native to get past that would mean maintaining a fake
// react-native inside a check about animation timings. The numbers are plain
// literals; read them.
const number = (name) => {
  const found = source.match(new RegExp(`const ${name} = (\\d+);`));
  return found ? Number(found[1]) : NaN;
};

const COMPOSED_MS = number("COMPOSED_MS");
const SPLASH_HOLD_MS = number("SPLASH_HOLD_MS");
const SPLASH_EXIT_MS = number("SPLASH_EXIT_MS");
const SPLASH_MS = COMPOSED_MS + SPLASH_HOLD_MS;

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── When everything has actually arrived ───────────────────────────────
//
// Every `at(value, delay, duration)` in the main timeline, plus the two
// families built with map() and the tagline, which is animated in the
// font-gated effect and so is not an `at()` call at all. That last one is the
// one a naive scan misses — and it is the latest of them, which is exactly
// how the hold got eaten the first time.
const ends = {};
for (const [, name, delay, duration] of source.matchAll(
  /at\((\w+),\s*(\d+),\s*(\d+)/g,
)) {
  ends[name] = Math.max(ends[name] ?? 0, Number(delay) + Number(duration));
}

const ribbonStagger = source.match(/at\(value,\s*180 \+ index \* (\d+),\s*(\d+)/);
check("the ribbons are still built by a stagger", Boolean(ribbonStagger), true);
if (ribbonStagger) {
  ends.ribbons =
    180 + 2 * Number(ribbonStagger[1]) + Number(ribbonStagger[2]);
}

const letterStagger = source.match(
  /delay: after\((\d+) \+ index \* (\d+)\),\s*\n\s*duration: (\d+)/,
);
check("the letters are still built by a stagger", Boolean(letterStagger), true);
if (letterStagger) {
  // "Chez-Nous" is nine glyphs, so the last one starts at index 8.
  ends.letters =
    Number(letterStagger[1]) + 8 * Number(letterStagger[2]) + Number(letterStagger[3]);
}

const words = source.match(/delay: after\((\d+)\),\s*\n\s*duration: (\d+)/);
check("the tagline still has a timing of its own", Boolean(words), true);
if (words) {
  ends.words = Number(words[1]) + Number(words[2]);
}

// The ribbons are excluded on purpose: their opacity curve returns them to 0
// before their timing ends, so they are gone from the screen long before they
// stop animating. Everything else ends where it lands.
const arriving = Object.entries(ends).filter(([name]) => name !== "ribbons");
const composed = Math.max(...arriving.map(([, end]) => end));

const declared = Number(
  (source.match(/const COMPOSED_MS = (\d+);/) ?? [])[1],
);
check("the file declares when the composition is complete", Number.isFinite(declared), true);
check(
  `COMPOSED_MS matches the animations (latest is ${
    arriving.find(([, end]) => end === composed)?.[0]
  } at ${composed}ms)`,
  declared,
  composed,
);

// ── The hold ───────────────────────────────────────────────────────────
check("every timing was found", [COMPOSED_MS, SPLASH_HOLD_MS, SPLASH_EXIT_MS].every(Number.isFinite), true);
// The arithmetic has to live in the file, not only here.
check(
  "the file builds its total from the composition and the hold",
  /const SPLASH_MS = COMPOSED_MS \+ SPLASH_HOLD_MS;/.test(source),
  true,
);
check("there is a hold at all", SPLASH_HOLD_MS > 0, true);
// Long enough to read as deliberate. Below about a third of a second a pause
// is indistinguishable from a stutter.
check(
  `the hold is long enough to be seen (${SPLASH_HOLD_MS}ms)`,
  SPLASH_HOLD_MS >= 350,
  true,
);
check(
  "the splash leaves only after the composition plus the hold",
  SPLASH_MS,
  composed + SPLASH_HOLD_MS,
);
// The bug this file exists for, stated directly.
check(
  "nothing is still arriving when the fade begins",
  SPLASH_MS >= composed,
  true,
);

// ── The exit ───────────────────────────────────────────────────────────
check("the splash fades rather than cutting", SPLASH_EXIT_MS > 0, true);
check(
  "and hands over from the animation's own callback",
  /\}\)\.start\(\(\) => onDone\?\.\(\)\);/.test(source),
  true,
);
// An interrupted fade that only called onDone on `finished` would strand the
// splash on screen forever.
check(
  "onDone is not conditional on the fade completing",
  /start\(\(\{ ?finished ?\}\) =>/.test(source),
  false,
);

// ── The two lines that lost their last word ────────────────────────────
//
// The wordmark block used `alignItems: center` and nothing else, so it was
// only as wide as its widest child — "Chez-Nous" — and the tagline beneath is
// wider than that. Android laid it into the narrower box and dropped the last
// word instead of wrapping: "Le Bénin, à portée de". The place label lost
// "BÉNIN" the same way.
//
// Nothing looks clipped when that happens, which is the trap — it reads as
// copy somebody wrote short, not as a layout fault, and it survived several
// screenshots and a release build before anyone counted the words.
//
// Both lines are stretched to the full width and centred by textAlign now, so
// neither is ever shrink-wrapped and neither depends on Android measuring
// letterSpacing correctly.
for (const [name, block] of [
  ["the wordmark block", /wordmarkBlock: \{([^}]*)\}/],
  ["the tagline", /tagline: \{([\s\S]*?)\n  \},/],
  ["the place label", /place: \{([\s\S]*?)\n  \},/],
]) {
  const found = source.match(block);
  check(`${name} is still styled here`, Boolean(found), true);
  if (found) {
    check(
      `${name} spans the full width rather than shrink-wrapping`,
      /alignSelf: "stretch"/.test(found[1]),
      true,
    );
  }
}
// And the two that carry text centre themselves rather than being centred by
// a parent that has to measure them first.
for (const [name, block] of [
  ["the tagline", /tagline: \{([\s\S]*?)\n  \},/],
  ["the place label", /place: \{([\s\S]*?)\n  \},/],
]) {
  const found = source.match(block);
  if (found) {
    check(`${name} centres itself`, /textAlign: "center"/.test(found[1]), true);
  }
}

// ── Total ──────────────────────────────────────────────────────────────
//
// Not a correctness rule, a judgement: past about five seconds an opening
// screen has stopped being an entrance. Worth failing rather than debating,
// because every individual increase looks small.
const total = SPLASH_MS + SPLASH_EXIT_MS;
check(`the whole thing is under 5s (${total}ms)`, total <= 5000, true);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: splash — composed at ${composed}ms, held for ${SPLASH_HOLD_MS}ms, ` +
    `faded over ${SPLASH_EXIT_MS}ms, ${total}ms in total`,
);
