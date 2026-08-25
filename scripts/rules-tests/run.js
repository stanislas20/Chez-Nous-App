// Starts the Firestore emulator, runs the rules tests inside it, stops it.
// Wrapped so the test file never has to know the emulator exists.
const { spawnSync } = require("child_process");

const result = spawnSync(
  "npx",
  [
    "--no-install",
    "firebase",
    "emulators:exec",
    "--only",
    "firestore",
    "--project",
    "rules-probe",
    "node scripts/rules-tests/moderation.test.js",
  ],
  { stdio: "inherit", cwd: process.cwd() },
);
process.exit(result.status ?? 1);
