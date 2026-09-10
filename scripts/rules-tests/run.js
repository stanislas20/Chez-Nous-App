// Starts the emulators, runs the rules tests inside them, stops them.
// Wrapped so the test files never have to know the emulators exist.
//
// Storage joined firestore here in Phase A. storage.rules had never been
// exercised by a test, and it held the two widest holes the audit found —
// every CV and every private chat attachment readable by any signed-in
// account. The difference in defect density between the file that had a
// suite and the file that did not is exactly what you would predict, which
// is the argument for this line.
const { spawnSync } = require("child_process");

const result = spawnSync(
  "npx",
  [
    "--no-install",
    "firebase",
    "emulators:exec",
    "--only",
    "firestore,storage",
    "--project",
    "rules-probe",
    "node scripts/rules-tests/moderation.test.js && node scripts/rules-tests/rules.test.js && node scripts/rules-tests/storage.test.js && node scripts/rules-tests/pagination.test.js",
  ],
  { stdio: "inherit", cwd: process.cwd() },
);
process.exit(result.status ?? 1);
