#!/usr/bin/env node
//
// Writing a review, you could not see what you were writing.
//
// The rating sheet is a transparent Modal whose backdrop uses
// justify-content: flex-end, so the sheet is pinned to the bottom of the
// screen — exactly where the keyboard opens. The TextInput, the Submit
// button and the delete row were all underneath it.
//
// The part worth remembering is why Android did not save it. app.json asks
// for softwareKeyboardLayoutMode "pan", which shifts the window to keep a
// focused input visible — and that would normally be enough. But a React
// Native Modal is its own window, and the pan applies to the activity's
// window rather than to the modal's, so the sheet sat exactly where it was
// while the keyboard covered it. A reader on Android would reasonably
// assume the setting already handled this. It does not, and the only
// evidence is on a device.
//
// Two things are defended here, because the second is the one that gets
// dropped:
//
//   the sheet lifts                — a KeyboardAvoidingView inside the Modal
//   the submit button still works  — keyboardShouldPersistTaps on the
//                                    ScrollView, without which the first tap
//                                    on Submit is swallowed dismissing the
//                                    keyboard and the reader has to press it
//                                    twice
//
// Run: node scripts/check-review-composer-keyboard.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const SCREEN = "src/screens/SellerProfileScreen.js";
const APP_JSON = "app.json";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

if (!fs.existsSync(path.join(root, SCREEN))) {
  console.log(`FAIL ${SCREEN} is missing — this check reads it`);
  process.exit(1);
}

const source = stripComments(read(SCREEN));

// The rating sheet's Modal, from its opening tag to its close. Everything
// asserted below has to hold INSIDE it — a KeyboardAvoidingView elsewhere on
// this screen would satisfy a whole-file match and lift nothing.
const modalStart = source.search(/<Modal\b/);
const modalEnd = source.search(/<\/Modal>/);
if (modalStart === -1 || modalEnd === -1) {
  failures.push(
    `${SCREEN} no longer contains the rating Modal — if the review composer ` +
      `moved, this check has to move with it`,
  );
} else {
  const modal = source.slice(modalStart, modalEnd);

  if (!/<KeyboardAvoidingView/.test(modal)) {
    failures.push(
      "the rating Modal contains no KeyboardAvoidingView — the sheet is " +
        "bottom-anchored, so the keyboard covers the review composer and the " +
        "reader cannot see what they are typing",
    );
  }

  // Order matters: the avoider has to be OUTSIDE the backdrop. Inside it,
  // the backdrop keeps its full height, the sheet stays pinned to the real
  // bottom of the screen, and nothing moves.
  const kavIndex = modal.search(/<KeyboardAvoidingView/);
  const backdropIndex = modal.search(/<SheetBackdrop/);
  if (kavIndex !== -1 && backdropIndex !== -1 && kavIndex > backdropIndex) {
    failures.push(
      "the KeyboardAvoidingView is nested INSIDE SheetBackdrop — the backdrop " +
        "is what holds the sheet at the bottom, so shrinking something below " +
        "it lifts nothing",
    );
  }

  if (!/behavior="padding"/.test(modal)) {
    failures.push(
      'the KeyboardAvoidingView does not use behavior="padding" — this app ' +
        'runs Android in "pan" mode, where "height" has no window resize to ' +
        "measure against, and padding is what SubmitDealershipScreen already " +
        "uses on both platforms",
    );
  }

  // The ScrollView inside the sheet must keep taps alive, or Submit needs
  // two presses whenever the keyboard is up — which is always, here.
  if (!/keyboardShouldPersistTaps="handled"/.test(modal)) {
    failures.push(
      "the review sheet's ScrollView does not set " +
        'keyboardShouldPersistTaps="handled", so the first tap on Submit is ' +
        "swallowed dismissing the keyboard",
    );
  }

  // Scrollability is what keeps this usable on a small screen once the
  // keyboard has taken most of the height.
  if (!/<ScrollView/.test(modal)) {
    failures.push(
      "the rating sheet no longer scrolls — with the keyboard up there is " +
        "not enough height for the stars, the comment box and the submit " +
        "button on a small screen",
    );
  }
}

// No global fix. Changing the app-wide keyboard mode would move every screen
// in the app to solve one sheet.
if (fs.existsSync(path.join(root, APP_JSON))) {
  const app = JSON.parse(read(APP_JSON));
  const mode = app?.expo?.android?.softwareKeyboardLayoutMode;
  if (mode !== "pan") {
    failures.push(
      `android.softwareKeyboardLayoutMode is "${mode}" — it was "pan", and ` +
        `changing it relayouts every screen in the app to fix one modal, ` +
        `which is a global change made to solve a local problem`,
    );
  }
}

if (failures.length === 0) {
  console.log(
    "clean: the review sheet rises above the keyboard, and Submit still takes " +
      "the first tap",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
