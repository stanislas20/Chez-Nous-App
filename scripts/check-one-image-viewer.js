// One fullscreen photo viewer, and it is the one that works.
//
// A property listing had its own. Its "tap to enlarge" hint was there, the
// modal opened, the photograph filled the screen — and pinching did
// nothing. It was built on the legacy PinchGestureHandler driving a plain
// Animated.Value, which is precisely the combination ImageLightbox exists
// to replace: under the New Architecture Android never activates that
// pinch at all, and iOS zooms but cannot get back to fit. That copy also
// sprang the scale back to 1 the moment the fingers left the glass, so on
// the platform where the gesture did fire, the photograph snapped away
// from the person looking at it. No panning, no double-tap, and a video
// handed to <Image>, which draws nothing.
//
// None of that reports itself. The viewer opens, the picture is there, and
// the gesture is simply ignored — which is indistinguishable from a phone
// being slow, so nobody files it. It took somebody saying "I can't zoom
// this one" to find, on a listing type where looking closely at the walls
// and the tiling is the entire reason for the photographs.
//
// The rule: nothing in src may build its own pinch-zoom, and every screen
// that opens a photo fullscreen goes through ImageLightbox.
//
// Run: node scripts/check-one-image-viewer.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// Comments stripped before the identifier is looked for, the same way
// check-import-paths does it. The note above explaining this very bug says
// "PinchGestureHandler" in prose, and the first version of this check
// happily reported the explanation as the offence.
const readCode = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
const failures = [];

const walk = (dir = "src") =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith(".js")
          ? [path.join(dir, entry.name)]
          : [],
    );

const VIEWER = path.join("src", "components", "ImageLightbox.js");

// The legacy handler, anywhere but the viewer's own note about it.
for (const file of walk()) {
  if (file === VIEWER) continue;
  const source = readCode(file);
  if (/\bPinchGestureHandler\b/.test(source)) {
    failures.push(
      `${file} builds its own pinch-zoom on the legacy PinchGestureHandler — ` +
        `that combination does not work under the New Architecture, which is ` +
        `why ImageLightbox exists`,
    );
  }
}

// The viewer itself must still be the real thing: the working combination
// is gesture-handler's Gesture API with reanimated shared values.
const viewer = read(VIEWER);
[
  ["Gesture.Pinch(", "pinch"],
  ["Gesture.Pan(", "pan"],
  ["useSharedValue(", "reanimated shared values"],
].forEach(([needle, what]) => {
  if (!viewer.includes(needle)) {
    failures.push(`ImageLightbox no longer uses ${what}`);
  }
});

// And a video must not be handed to <Image>, which renders an .mp4 as
// nothing at all.
if (!/isVideo/.test(viewer)) {
  failures.push(
    "ImageLightbox no longer distinguishes video from stills — an .mp4 in " +
      "an <Image> draws an empty screen with no error",
  );
}

// Every screen that opens a photo fullscreen uses it. Listed rather than
// inferred: a screen showing a photo inline is not the same as one that
// opens it, and only the second needs the viewer.
const OPENS_FULLSCREEN = [
  "src/screens/ProductDetailScreen.js",
  "src/screens/RealEstateDetailScreen.js",
];
for (const file of OPENS_FULLSCREEN) {
  if (!/\bImageLightbox\b/.test(readCode(file))) {
    failures.push(
      `${file} opens a photo fullscreen without ImageLightbox — whatever it ` +
        `draws instead, nobody will be able to zoom it`,
    );
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: one image viewer — ImageLightbox on ${OPENS_FULLSCREEN.length} ` +
    `screen(s), no private pinch-zoom anywhere in src`,
);
