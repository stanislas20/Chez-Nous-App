// No picture reaches Storage at camera resolution.
//
// Every picker in the app already asked for `quality: 0.8` and it read as if
// that were the answer. It is not: quality is compression, not resizing, and
// it only applies when expo-image-picker re-encodes at all. A photo pulled
// back out of a real listing was 4032×3024 and 2.9 MB — a 49 MB bitmap the
// moment anything decoded it, uploaded over a mobile connection somebody in
// Cotonou pays for by the megabyte, and in a format (HEIC) no browser or
// link preview can read.
//
// So the resize is not optional and not per-screen. There are twelve places
// a picture can be chosen across eight screens — the sell form and the park
// stock form pick twice each, from the library and from the camera, as do
// chat and the CV scanner — and a new screen added next month will copy
// whichever one it finds first. Every one of
// them is checked here, by hand, because the failure is invisible: the app
// works perfectly with a 12 MP upload. It is the bill and the phone that
// suffer.
//
// Run: node scripts/check-photo-downscale.js
const fs = require("fs");
const path = require("path");

const failures = [];
function check(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
}

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

// ── The helper itself ──────────────────────────────────────────────────
const helper = read("src/utils/downscalePhoto.js");

const maxEdge = Number(/MAX_UPLOAD_EDGE = (\d+)/.exec(helper)?.[1]);
check("a maximum edge is set", Number.isFinite(maxEdge), true);
// Above ~2048 the resize stops being worth doing; below ~1000 a listing
// photo would look soft on the detail screen, which is drawn at the full
// width of the phone.
check("the maximum edge is between 1000 and 2048", maxEdge >= 1000 && maxEdge <= 2048, true);

check(
  "it saves as JPEG, the one format every browser and crawler reads",
  /SaveFormat\.JPEG/.test(helper),
  true,
);
// A failed resize must never cost somebody their listing.
check("a failure returns the original uri", /catch\s*{[\s\S]*?return uri;/.test(helper), true);
// Handing a video to the image manipulator produces a still or an error.
check("videos pass through untouched", /asset\.type === "video"/.test(helper), true);
// Resizing by a guessed edge would enlarge a small picture.
check(
  "the real dimensions are read before resizing",
  /renderAsync\(\)[\s\S]*?Math\.max\(source\.width, source\.height\)/.test(helper),
  true,
);
check(
  "the long edge is the one resized, whatever the orientation",
  /source\.width >= source\.height/.test(helper),
  true,
);

// ── The native module is declared ──────────────────────────────────────
//
// It is a native module: a bundle that imports it while the installed build
// does not contain it crashes on the first import, not at the picker.
const deps = JSON.parse(read("package.json")).dependencies;
check(
  "expo-image-manipulator is a dependency",
  Boolean(deps["expo-image-manipulator"]),
  true,
);

// ── Every picker uses it ───────────────────────────────────────────────
const screens = fs
  .readdirSync(path.join(root, "src/screens"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => `src/screens/${name}`);

const pickers = screens.filter((file) =>
  /launchImageLibraryAsync|launchCameraAsync/.test(read(file)),
);

// If these numbers fall, a picker was deleted and this check should be read
// again rather than quietly covering less than it used to.
check("eight screens can pick a picture", pickers.length, 8);

// Counted rather than merely present. Half of these screens pick twice —
// once from the library and once from the camera — and importing the helper
// for the library path while the camera path uploads the original is
// exactly the kind of half-wiring that reads as done.
let callSites = 0;
pickers.forEach((file) => {
  const source = read(file);
  const picks = (source.match(/launch(ImageLibrary|Camera)Async\(/g) ?? []).length;
  const shrinks = (
    source.match(/(?<!import\s*{?\s*)\bdownscale(Photo|PickedAssets)\(/g) ?? []
  ).length;
  callSites += picks;
  check(`${file} shrinks every picture it picks (${picks})`, shrinks >= picks, true);
  check(
    `${file} imports it from the one place`,
    /from "\.\.\/utils\/downscalePhoto"/.test(source),
    true,
  );
});
check("twelve places can choose a picture", callSites, 12);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: photo downscale — long edge capped at ${maxEdge}px and saved as ` +
    `JPEG, across all ${pickers.length} pickers, videos untouched`,
);
