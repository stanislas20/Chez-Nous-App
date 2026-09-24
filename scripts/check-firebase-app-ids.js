#!/usr/bin/env node
//
// The Firebase app id is per-platform, and using the wrong one fails silently.
//
// App Check attestation is minted natively — App Attest on iOS, Play Integrity
// on Android — and the native side always attests as the platform's OWN
// Firebase app, the one in GoogleService-Info.plist or google-services.json.
// The JS SDK attaches that token to requests it makes under whatever app id
// it was configured with. When those disagree the token is entirely valid and
// belongs to a different app, so Firebase records the request as INVALID.
//
// That shipped. One EXPO_PUBLIC_FIREBASE_APP_ID holding the ANDROID id served
// both platforms: Android matched and verified, iOS attested as the iOS app
// while identifying as the Android app, and a standalone iOS build put every
// Storage request in the invalid column — 147 requests, 6 ever verified.
//
// WHY A STATIC CHECK RATHER THAN CARE. Nothing about the failure is visible
// from inside the app. Uploads succeed, reads succeed, no error is logged,
// no user notices. The only symptom is a counter in a console, and the only
// moment it becomes loud is when App Check enforcement is switched on, at
// which point every request from every iPhone is rejected simultaneously.
// A defect with no symptom until the worst possible moment is exactly the
// kind this repository gates in a file rather than trusts to memory.
//
// Run: node scripts/check-firebase-app-ids.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let failures = 0;
const fail = (message) => {
  console.error(`FAIL ${message}`);
  failures += 1;
};

// ── 1. The source must SELECT, not assume ──────────────────────────────
const config = read("src/config/firebase.js");

if (!/Platform\.OS === ['"]ios['"]\s*\?\s*iosAppId\s*:\s*androidAppId/.test(config))
  fail(
    "src/config/firebase.js no longer picks appId by platform — the Android " +
      "id would be used on iOS again",
  );

if (!/EXPO_PUBLIC_FIREBASE_IOS_APP_ID/.test(config))
  fail("src/config/firebase.js does not read EXPO_PUBLIC_FIREBASE_IOS_APP_ID");

// The guard is the half that stops a MISSING variable degrading quietly into
// the original bug.
if (
  !/Platform\.OS === ['"]ios['"] && !iosAppId && !__DEV__/.test(config) ||
  !/throw new Error/.test(
    config.slice(config.indexOf("!iosAppId")),
  )
)
  fail(
    "an iOS release without EXPO_PUBLIC_FIREBASE_IOS_APP_ID no longer throws — " +
      "it would silently fall back to the Android app id",
  );

// ── 2. The ids themselves ──────────────────────────────────────────────
//
// Read from the native Firebase files, which are the things the native
// attestation actually uses, rather than from .env — .env is gitignored and
// absent in CI, and checking it would prove nothing about a build.
const APP_ID = /^1:(\d+):(android|ios):[0-9a-f]+$/;

function appIdFrom(label, value) {
  if (typeof value !== "string" || !APP_ID.test(value)) {
    fail(`${label} is not a Firebase app id: ${JSON.stringify(value)}`);
    return null;
  }
  const [, sender, platform] = value.match(APP_ID);
  return { value, sender, platform };
}

const plist = read("GoogleService-Info.plist");
const iosMatch = plist.match(
  /<key>GOOGLE_APP_ID<\/key>\s*<string>([^<]+)<\/string>/,
);
const ios = appIdFrom(
  "GoogleService-Info.plist GOOGLE_APP_ID",
  iosMatch ? iosMatch[1] : undefined,
);

const services = JSON.parse(read("google-services.json"));
const androidIds = (services.client ?? [])
  .map((c) => c?.client_info?.mobilesdk_app_id)
  .filter(Boolean);
if (androidIds.length !== 1)
  fail(
    `google-services.json declares ${androidIds.length} android apps; ` +
      `expected exactly 1`,
  );
const android = appIdFrom(
  "google-services.json mobilesdk_app_id",
  androidIds[0],
);

if (ios && ios.platform !== "ios")
  fail(`the iOS app id has platform segment "${ios.platform}", expected "ios"`);
if (android && android.platform !== "android")
  fail(
    `the Android app id has platform segment "${android.platform}", expected "android"`,
  );

if (ios && android && ios.value === android.value)
  fail("the iOS and Android app ids are identical — one of them is wrong");

// ── 3. Same project, or the token is wrong in a second way ─────────────
if (ios && android && ios.sender !== android.sender)
  fail(
    `sender ids differ: iOS ${ios.sender} vs Android ${android.sender} — ` +
      `these are different Firebase projects`,
  );

const plistProject = (plist.match(
  /<key>PROJECT_ID<\/key>\s*<string>([^<]+)<\/string>/,
) ?? [])[1];
const jsonProject = services?.project_info?.project_id;
if (plistProject && jsonProject && plistProject !== jsonProject)
  fail(
    `project ids differ: GoogleService-Info.plist ${plistProject} vs ` +
      `google-services.json ${jsonProject}`,
  );

const jsonSender = services?.project_info?.project_number;
if (android && jsonSender && jsonSender !== android.sender)
  fail(
    `google-services.json project_number ${jsonSender} does not match the ` +
      `android app id sender ${android.sender}`,
  );

if (failures) process.exit(1);
console.log(
  `clean: ios ${ios.platform} and android ${android.platform} app ids, ` +
    `distinct, sender ${ios.sender}, project ${plistProject} — and the JS SDK ` +
    `picks between them by platform`,
);
