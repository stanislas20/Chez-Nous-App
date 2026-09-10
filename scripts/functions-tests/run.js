// The function and reporting tests that need no emulator.
//
// deleteAccount is deliberately NOT here: it writes to Firestore, Auth and
// Storage, so it runs inside scripts/rules-tests/run.js where the emulators
// are already up. Everything below stubs its dependencies and runs in-process,
// which is why it is worth having as a separate, fast command.
//
// Run: node scripts/functions-tests/run.js
const { spawnSync } = require("child_process");
const path = require("path");

const SUITES = [
  // placesProxy, with global.fetch replaced so no real Google call is made.
  "scripts/functions-tests/places.test.js",
  // What actually leaves the device when something goes wrong.
  "scripts/functions-tests/reporting.test.js",
  // The App Check bridge across both SDKs, with both stubbed.
  "scripts/functions-tests/appCheck.test.js",
];

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n── ${path.basename(suite)} ${"─".repeat(Math.max(0, 56 - suite.length))}`);
  // Run from functions/ so `require("firebase-functions/...")` resolves —
  // the Cloud Functions have their own node_modules, separate from the app's.
  const result = spawnSync("node", [path.join("..", suite)], {
    stdio: "inherit",
    cwd: path.join(process.cwd(), "functions"),
  });
  if (result.status !== 0) failed += 1;
}

if (failed) {
  console.error(`\n${failed} of ${SUITES.length} function suites failing`);
  process.exit(1);
}
console.log(`\nall ${SUITES.length} function suites clean`);
