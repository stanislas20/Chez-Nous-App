// The mark keeps its daylight.
//
// Chez-Nous is a roof standing clear above an open door. Join the two and it
// becomes a house — specifically it becomes Ionicons' `home-outline`, which
// is the icon in this app's own tab bar under "Pour vous". An app icon that
// looks like one of its own buttons is not a brand, and the only thing
// holding the two apart is the gap.
//
// The gap is spent by boldness. "Make the logo a bit heavier so it reads when
// small" is a reasonable-sounding request that closes it, and the design doc
// itself proposes exactly that: a 6.4 stroke for the 20px preview. Rendered
// at 20, 24, 32 and 48 and downsampled the way an OS rasterises an icon, 4.6
// survives 20px intact and 6.4 is too heavy by 48. So the single weight is
// asserted here, along with the clearance it buys.
//
// Run: node scripts/check-brand-mark.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");
const fs = require("fs");

function loadEsm(relative) {
  const shim = { exports: {} };
  vm.runInNewContext(
    babel.transformFileSync(path.join(__dirname, "..", relative), {
      // preset-react as well: unlike the data files the other checks load,
      // this module is a component and its JSX has to parse before the two
      // pure functions above it can be reached.
      presets: [
        ["@babel/preset-env", { targets: { node: "current" } }],
        ["@babel/preset-react", { runtime: "automatic" }],
      ],
      babelrc: false,
      configFile: false,
    }).code,
    {
      module: shim,
      exports: shim.exports,
      // The component imports react-native for its views; nothing this file
      // asserts renders anything, so an empty stub is enough.
      require: () => ({}),
      console,
    },
  );
  return shim.exports;
}

const { MARK_MIN_PX, roofToDoorGap } = loadEsm("src/components/BrandMark.js");
const source = fs.readFileSync(
  path.join(__dirname, "..", "src/components/BrandMark.js"),
  "utf8",
);

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

const BOX = 64;
// Measured, not chosen: 4.6 gives 2.58px at 20px and reads cleanly; 6.4 gives
// 1.93px and starts to look like a button. The floor sits between them, close
// enough to the working value that any real thickening trips it.
const MIN_GAP_PX = 2.4;

const stroke = Number((source.match(/const STROKE = ([\d.]+);/) ?? [])[1]);
check("the mark declares one stroke weight", Number.isFinite(stroke), true);
check("and it is the weight that was proven", stroke, 4.6);

const gapPx = (roofToDoorGap(stroke) / BOX) * MARK_MIN_PX;
check(
  `the roof clears the door at ${MARK_MIN_PX}px (${gapPx.toFixed(2)}px)`,
  gapPx >= MIN_GAP_PX,
  true,
);
// The failure this is really about: the gap has to close before the shapes
// touch, so a positive number is not on its own good news.
check(
  "the roof and the door never meet",
  roofToDoorGap(stroke) > 0,
  true,
);
// And the direction of the risk, stated as an assertion so it cannot be
// argued with later: heavier is worse, not safer.
check(
  "a heavier stroke spends the clearance",
  roofToDoorGap(6.4) < roofToDoorGap(4.6),
  true,
);
check(
  "the doc's 20px variant is the one that would fail",
  (roofToDoorGap(6.4) / BOX) * MARK_MIN_PX < MIN_GAP_PX,
  true,
);

// One weight, everywhere. A second `strokeWidth`-style prop would let a call
// site opt out of all of the above without touching this file.
check(
  "the stroke is not a prop any caller can override",
  /function BrandMark\(\{[^}]*stroke/.test(source),
  false,
);

// The door is an arch. A rectangle reads as a closed box, which is the
// opposite of what the name says, and it is one deleted border-radius away.
check(
  "the door keeps its arch",
  /borderTopLeftRadius: \(ARC_R \+ STROKE \/ 2\) \* u/.test(source),
  true,
);
check(
  "and stays open at the bottom",
  /borderBottomWidth: 0/.test(source),
  true,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: brand mark — one stroke at ${stroke}, roof clears the door by ` +
    `${gapPx.toFixed(2)}px at ${MARK_MIN_PX}px, door still an arch`,
);
