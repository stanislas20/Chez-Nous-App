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

// versionCode 1 is burned: it is what every validation APK carried and what
// is installed on both test devices right now. Anything intended to replace
// them has to exceed it.
const FLOOR = 2;

let failures = 0;
const fail = (message) => {
  console.error(`FAIL ${message}`);
  failures += 1;
};

const versionCode = app?.android?.versionCode;
const buildNumber = app?.ios?.buildNumber;

if (!Number.isInteger(versionCode)) {
  fail(`android.versionCode must be an integer, got ${JSON.stringify(versionCode)}`);
} else if (versionCode < FLOOR) {
  fail(
    `android.versionCode is ${versionCode}; ${FLOOR} or higher is required — ` +
      `1 is installed on the test devices and cannot be upgraded over`,
  );
}

if (typeof buildNumber !== "string" || !/^[0-9]+$/.test(buildNumber)) {
  fail(
    `ios.buildNumber must be a string of digits, got ${JSON.stringify(buildNumber)} — ` +
      `unset means every iOS build claims the same version to App Store Connect`,
  );
} else if (Number(buildNumber) < FLOOR) {
  fail(`ios.buildNumber is ${buildNumber}; ${FLOOR} or higher is required`);
}

// One number for both platforms, so "which build is this?" has one answer.
// Nothing technical forces it; the value is that a tester on either phone
// reports a number that means the same thing.
if (
  Number.isInteger(versionCode) &&
  typeof buildNumber === "string" &&
  /^[0-9]+$/.test(buildNumber) &&
  Number(buildNumber) !== versionCode
) {
  fail(
    `android.versionCode (${versionCode}) and ios.buildNumber (${buildNumber}) ` +
      `disagree — they are meant to be the same build number`,
  );
}

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
  `clean: version ${app.version}, build ${versionCode} on both platforms, ` +
    `read from app.json`,
);
