#!/usr/bin/env node
//
// The build number has to go up, and it has to say the same thing on both
// platforms.
//
// Every APK built during the release-candidate work carried versionCode 1,
// because the value is a literal in app.json and nothing ever changed it.
// Installing those over each other worked only because `adb install -r`
// permits an equal versionCode. Nothing else does: Play refuses an upload
// that does not exceed the last one, and a tester on any ordinary channel
// cannot receive a fix for the bug they just reported. That is not a
// cosmetic defect — it is the difference between a beta you can iterate on
// and a beta you can only restart.
//
// WHY THE NUMBER LIVES HERE AND NOT IN EAS.
//
// eas.json keeps appVersionSource "local", so this file is the number. The
// alternative, remote version management, is genuinely better at the one
// thing it does — it cannot be forgotten — and was rejected because this
// repository has TWO release paths. AGENTS.md documents a local Gradle
// release:
//
//   npm run build:android   # gradlew assembleRelease -PreactNativeArchitectures=...
//
// which never contacts EAS and reads this file. Under remote management an
// EAS build could be versionCode 7 while a local Gradle build of the SAME
// COMMIT emitted 1, and the two artefacts would silently refuse to upgrade
// one another — the failure this exists to prevent, wearing a disguise.
//
// Keeping it here also keeps provenance answerable: `git show <sha>:app.json`
// says exactly what a commit produced, which is how the release-candidate
// ambiguity of 52a35d7 versus 7f2f84f got untangled in the first place.
//
// THE COST is that a human has to increment it, and this file is what makes
// that a checked fact rather than a good intention. It cannot prove
// monotonicity — that needs history, not a file — so it enforces the three
// things a single snapshot CAN prove: the number is present, it is past the
// builds already installed on the test devices, and both platforms agree.
//
// Run: node scripts/check-build-version.js
const fs = require("fs");
const path = require("path");

const app = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "app.json"), "utf8"),
).expo;
const eas = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "eas.json"), "utf8"),
);

// A floor PER PLATFORM, because the platforms have stopped moving together.
//
// This file first required both numbers to be identical, so that "which build
// is this?" had one answer. That assumption died the first time a fix was
// needed on one platform only: the iOS App Check identity mismatch is an iOS
// defect, iOS Build 2 is installed and therefore spent, and Android has never
// produced a versionCode 2 at all — its device still runs 1. Holding them
// equal would mean manufacturing an Android build whose sole difference from
// the last one is a number nobody reads.
//
// So the rule is now what it should always have been: each platform's number
// must exceed what is already installed on that platform's device.
//
//   Android  device carries versionCode 1   → floor 2
//   iOS      device carries buildNumber 2   → floor 3  (Build 2 is spent)
//
// These floors are facts about the test devices and go up as builds are
// consumed. A snapshot cannot prove monotonicity — that needs history, not a
// file — so proving "past what is already out there" is the most this check
// can honestly do, and it is the part that actually prevents an artefact that
// cannot be installed over its predecessor.
const ANDROID_FLOOR = 2;
const IOS_FLOOR = 3;

let failures = 0;
const fail = (message) => {
  console.error(`FAIL ${message}`);
  failures += 1;
};

const versionCode = app?.android?.versionCode;
const buildNumber = app?.ios?.buildNumber;

if (!Number.isInteger(versionCode)) {
  fail(`android.versionCode must be an integer, got ${JSON.stringify(versionCode)}`);
} else if (versionCode < ANDROID_FLOOR) {
  fail(
    `android.versionCode is ${versionCode}; ${ANDROID_FLOOR} or higher is ` +
      `required — 1 is installed on the Android test device and cannot be ` +
      `upgraded over`,
  );
}

if (typeof buildNumber !== "string" || !/^[0-9]+$/.test(buildNumber)) {
  fail(
    `ios.buildNumber must be a string of digits, got ${JSON.stringify(buildNumber)} — ` +
      `unset means every iOS build claims the same version to App Store Connect`,
  );
} else if (Number(buildNumber) < IOS_FLOOR) {
  fail(
    `ios.buildNumber is ${buildNumber}; ${IOS_FLOOR} or higher is required — ` +
      `build ${IOS_FLOOR - 1} is installed on the iPhone and App Store ` +
      `Connect refuses a repeated build number`,
  );
}

// The two numbers are NOT required to match. See the floors above: they
// diverged the moment a platform needed a fix the other did not, and forcing
// them level would produce builds whose only change is the number.

// The number only governs the build if EAS is reading it from here.
if (eas?.cli?.appVersionSource !== "local") {
  fail(
    `eas.json cli.appVersionSource is ${JSON.stringify(eas?.cli?.appVersionSource)}; ` +
      `"local" is required, or app.json stops being the source of truth and the ` +
      `local Gradle release path diverges from EAS`,
  );
}

// The marketing version is deliberately NOT checked for progression: 1.0.0 is
// correct across many build numbers, and only changes when the product does.
if (typeof app?.version !== "string") {
  fail(`expo.version must be a string, got ${JSON.stringify(app?.version)}`);
}

if (failures) process.exit(1);
console.log(
  `clean: version ${app.version}, android versionCode ${versionCode} ` +
    `(floor ${ANDROID_FLOOR}), ios buildNumber ${buildNumber} ` +
    `(floor ${IOS_FLOOR}), read from app.json`,
);
