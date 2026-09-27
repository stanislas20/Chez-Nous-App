#!/usr/bin/env node
//
// Bottom sheets that must not vanish behind the Android keyboard.
//
// The rule is one line and the reason is three:
//
//   1. app.json asks for softwareKeyboardLayoutMode "pan", so the Android
//      window never resizes when the keyboard opens.
//   2. A React Native Modal is its own window, and the pan applies to the
//      activity behind it — so a sheet inside a Modal does not move at all.
//   3. KeyboardAvoidingView with no `behavior` does nothing. Writing
//      behavior={Platform.OS === "ios" ? "padding" : undefined} therefore
//      leaves Android — the only platform that needs help here — with none.
//
// So: behavior="padding", unconditionally, on the container that holds the
// sheet's bottom anchor. "height" is not a substitute; it measures a box that
// adjustPan never changed.
//
// This guards the named sheets below rather than scanning for the shape,
// because the app has other Modals with text in them that are not
// bottom-anchored and do not need this. It is deliberately a short list of
// the ones that were fixed and the ones they were copied from.
//
// Run: node scripts/check-sheet-keyboard.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

// file, the container that takes the padding, the component that anchors the
// sheet to the bottom (usually the same one; Tyres puts the anchor on the
// backdrop it wraps, which works just as well — the padding shrinks the
// container, the backdrop fills what is left, flex-end sits at the bottom of
// that), and what it is for.
const SHEETS = [
  // Converted wrappers: the container itself is the avoider. Only safe where
  // dismissal does not live on it — both of these use a separate absolutely
  // positioned dismiss area.
  ["src/screens/CreateListingScreen.js", "SheetRoot", "SheetRoot", "the commune, arrondissement and quartier/village pickers"],
  ["src/screens/RestaurantsScreen.js", "SheetRoot", "SheetRoot", "the area picker"],

  // Wrapping avoiders: the sheet's backdrop is the Pressable that dismisses
  // it, so the avoider goes around the backdrop and the backdrop keeps the
  // bottom anchor. Turning those into a KeyboardAvoidingView would drop
  // tap-to-dismiss without any test noticing.
  ["src/screens/TyresScreen.js", "SheetKeyboard", "Backdrop", "the vehicle picker"],
  ["src/screens/PapersScreen.js", "SheetLift", "SheetLift", "the paper-date sheet"],
  ["src/screens/FleetScreen.js", "SheetLift", "SheetLift", "the add-vehicle sheet"],
  ["src/screens/BatteryScreen.js", "SheetLift", "Backdrop", "the vehicle picker"],
  ["src/screens/CarsScreen.js", "SheetLift", "SheetBackdrop", "the marque and city pickers"],
  ["src/screens/CategoryListingsScreen.js", "SheetLift", "SheetBackdrop", "the city picker"],
  ["src/screens/ForYouScreen.js", "SheetLift", "JobSheetBackdrop", "the job-city picker"],
  ["src/screens/LocalScreen.js", "SheetLift", "SheetBackdrop", "the location picker"],
  ["src/screens/TourismScreen.js", "SheetLift", "SheetBackdrop", "the origin picker"],
  ["src/screens/VehicleListScreen.js", "SheetLift", "SheetBackdrop", "the searchable filter sheets"],
];

// EventsScreen is deliberately absent. Its city sheet solves the same problem
// a different and equally valid way — a Keyboard listener setting
// marginBottom on the sheet, plus a maxHeight on the list while the keyboard
// is up. Adding an avoider on top of that would lift it twice.
const NOT_A_SHEET_LIFT = [
  ["src/screens/EventsScreen.js", "keyboardHeight", "marginBottom: keyboardHeight"],
];

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };

for (const [file, container, anchor, what] of SHEETS) {
  const src = read(file);
  const declared = new RegExp(`const ${container} = styled\\(?`).test(src);
  if (!declared) {
    fail(`${file} no longer declares ${container} — if ${what} moved, this check must move with it`);
    continue;
  }

  // Either set once on the styled component (.attrs) or passed at every use.
  const viaAttrs = new RegExp(
    `const ${container} = styled\\([^)]*\\)\\.attrs\\([^)]*\\)\\s*\\(\\s*\\{[\\s\\S]{0,200}?behavior:\\s*"padding"`,
  ).test(src.replace(/\s+/g, " ")) || /behavior:\s*"padding"/.test(
    src.slice(src.indexOf(`const ${container} =`), src.indexOf(`const ${container} =`) + 400),
  );
  const uses = [...src.matchAll(new RegExp(`<${container}\\b([^>]*)>`, "g"))].map((m) => m[1]);
  const viaProp = uses.length > 0 && uses.every((attrs) => /behavior="padding"/.test(attrs));

  if (!viaAttrs && !viaProp)
    fail(
      `${file}: ${container} (${what}) does not get behavior="padding" — ` +
        `on Android that is a KeyboardAvoidingView that does nothing, and the ` +
        `keyboard covers the sheet`,
    );

  // The specific regression: re-introducing the platform guard.
  for (const attrs of uses) {
    if (/behavior=\{[^}]*Platform\.OS/.test(attrs))
      fail(
        `${file}: ${container} guards its behavior with Platform.OS — that is ` +
          `not a weaker fix, it is none: Android gets undefined`,
      );
  }

  // Padding only lifts something if the container actually gives up space…
  const decl = src.slice(src.indexOf(`const ${container} =`), src.indexOf(`const ${container} =`) + 300);
  if (!/flex: 1/.test(decl))
    fail(`${file}: ${container} is not flex: 1, so padding on it has nothing to take space from`);
  // …and the sheet is pinned to the bottom of whatever is left.
  const anchorDecl = src.slice(src.indexOf(`const ${anchor} =`), src.indexOf(`const ${anchor} =`) + 300);
  if (!/justify-content: flex-end/.test(anchorDecl))
    fail(`${file}: ${anchor} does not pin the sheet to the bottom, so there is nothing for the padding to lift`);
}

// The screen that solves it another way must keep solving it.
for (const [file, state, applied] of NOT_A_SHEET_LIFT) {
  const src = read(file);
  if (!src.includes(state) || !src.includes(applied))
    fail(
      `${file} no longer lifts its sheet with ${applied} — it is exempt from ` +
        `the rule above only because it does this instead`,
    );
  if (/<SheetLift[\s/>]/.test(src))
    fail(`${file} has gained a SheetLift on top of its own keyboard handling — that lifts the sheet twice`);
}

// Every searchable sheet has to keep taps alive while the keyboard is up, or
// the first tap on a result is swallowed dismissing the keyboard.
const PERSIST_TAPS = [
  "src/screens/BatteryScreen.js",
  "src/screens/CarsScreen.js",
  "src/screens/CategoryListingsScreen.js",
  "src/screens/EventsScreen.js",
  "src/screens/ForYouScreen.js",
  "src/screens/LocalScreen.js",
  "src/screens/RestaurantsScreen.js",
  "src/screens/TourismScreen.js",
  "src/screens/VehicleListScreen.js",
  "src/screens/CreateListingScreen.js",
];
for (const file of PERSIST_TAPS) {
  const src = read(file);
  // The VALUE, not just the prop: "never" is worse than absent, because it
  // reads as though somebody considered it.
  // Either spelling: the JSX attribute, or set once on the styled component
  // through .attrs, which several screens do so a new sheet cannot forget it.
  const asAttribute = /keyboardShouldPersistTaps="handled"/.test(src);
  const viaAttrs = /keyboardShouldPersistTaps:\s*"handled"/.test(src);
  if (!asAttribute && !viaAttrs)
    fail(`${file} does not set keyboardShouldPersistTaps to "handled" — the first tap on a result would only dismiss the keyboard`);
  const bad = src.match(/keyboardShouldPersistTaps[:=]\s*"(?!handled)([a-z-]+)"/);
  if (bad) fail(`${file} sets keyboardShouldPersistTaps to "${bad[1]}"; it must be "handled"`);
}

// The setting the whole rule depends on. If this ever becomes "resize", these
// sheets still work — but the comments explaining them stop being true, and
// somebody should notice.
const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const mode = app?.expo?.android?.softwareKeyboardLayoutMode;
if (mode !== "pan")
  fail(
    `app.json softwareKeyboardLayoutMode is ${JSON.stringify(mode)}, not "pan" — ` +
      `the sheets above are commented on the assumption that it is; re-read them`,
  );

if (failures) process.exit(1);
console.log(
  `clean: ${SHEETS.length} modal sheet container(s) lift with behavior="padding" ` +
    `on both platforms, none guarded by Platform.OS (app runs adjustPan)`,
);
