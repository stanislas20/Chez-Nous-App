// Starts the emulators, runs the rules tests inside them, stops them.
// Wrapped so the test files never have to know the emulators exist.
//
// Storage joined firestore here in Phase A. storage.rules had never been
// exercised by a test, and it held the two widest holes the audit found —
// every CV and every private chat attachment readable by any signed-in
// account. The difference in defect density between the file that had a
// suite and the file that did not is exactly what you would predict, which
// is the argument for this line.
// Auth joined them in Phase C, for the callable tests. deleteAccount is the
// one function in this project that destroys data, and it shipped from Phase B
// having never been executed — so it now runs here against real emulated
// Firestore, Auth and Storage rather than being reasoned about.
const { spawnSync } = require("child_process");

// The suites, in the order they run. Kept as a list so adding one is a line
// rather than an edit to a shell string.
const SUITES = [
  "scripts/rules-tests/moderation.test.js",
  "scripts/rules-tests/rules.test.js",
  "scripts/rules-tests/storage.test.js",
  "scripts/rules-tests/pagination.test.js",
  // Measures rather than gates: every failure it reports is a known
  // property of the current search architecture, and C3 asked for it to be
  // measured before anything is chosen. It exits zero on purpose.
  "scripts/rules-tests/search.test.js",
  // Same: measures the 200-cap boundary, does not gate on it.
  "scripts/rules-tests/categoryCap.test.js",
  // Runs every multi-constraint query in the app against the emulator with
  // the real index file loaded, so a missing composite index fails here
  // rather than in production on a screen nobody opened.
  "scripts/rules-tests/indexes.test.js",
  // Callables. These use CallableFunction.run() with the admin SDK pointed at
  // the emulators, so the transport is skipped and everything else is real.
  "scripts/functions-tests/deleteAccount.test.js",
];

const result = spawnSync(
  "npx",
  [
    "--no-install",
    "firebase",
    "emulators:exec",
    "--only",
    "firestore,storage,auth",
    "--project",
    "rules-probe",
    SUITES.map((suite) => `node ${suite}`).join(" && "),
  ],
  {
    stdio: "inherit",
    cwd: process.cwd(),
    env: {
      ...process.env,
      // emulators:exec sets FIRESTORE_EMULATOR_HOST and
      // FIREBASE_AUTH_EMULATOR_HOST itself, but not the Storage one — the
      // admin SDK reads FIREBASE_STORAGE_EMULATOR_HOST and without it the
      // deleteAccount test would sweep files from a real bucket. It refuses
      // to start unless all three are present, so this is belt and braces
      // rather than the only guard.
      FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
    },
  },
);
process.exit(result.status ?? 1);
