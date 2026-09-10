// A release build must not be able to carry the emulator switch.
//
// EXPO_PUBLIC_FIREBASE_EMULATOR_HOST is how a developer points the app at the
// Firebase emulators. It is a host rather than a boolean precisely so that an
// ordinary build cannot accidentally turn it on — but "ordinary" was doing a
// lot of work there. Metro inlines the variable into the bundle from .env or
// from the shell, and nothing anywhere refused a release build that carried
// it. The independent audit found the value 10.0.0.181 in a real bundle: a
// LAN address on the machine that happened to build it. Shipped, that app
// talks to a laptop nobody can reach and fails with no message worth reading.
//
// The comment in src/config/firebase.js says the variable is "empty in every
// ordinary build". This file is what makes that a fact rather than a hope.
//
// ── Where this runs ─────────────────────────────────────────────────────
//
// Two entry points, because this project has two release paths:
//
//   app.config.js          throws during prebuild/export when
//                          APS_ENVIRONMENT=production (the iOS release path)
//   npm run build:android   runs this with --release before gradlew
//
// Development keeps working untouched: without --release the emulator host is
// reported and allowed.
//
// Run:
//   node scripts/check-release-config.js            # dev: report only
//   node scripts/check-release-config.js --release  # release: fail if set
//   node scripts/check-release-config.js --release --scan DIR
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const VAR = "EXPO_PUBLIC_FIREBASE_EMULATOR_HOST";

// The shell wins over .env in Metro, so both have to be consulted, and a
// variable set to empty counts as unset.
function emulatorHostSources() {
  const found = [];

  const fromShell = process.env[VAR];
  if (fromShell && fromShell.trim()) {
    found.push({ where: "the environment", value: fromShell.trim() });
  }

  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(new RegExp(`^${VAR}=(.*)$`));
      if (m && m[1].trim()) {
        found.push({ where: ".env", value: m[1].trim() });
      }
    }
  }

  return found;
}

// Anything that looks like it points at a development machine rather than at
// Google. Checked against a built artefact when one is available, because the
// bundle is the thing that ships.
const LOCAL_ADDRESS_RE =
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;

function scanArtefacts(dir) {
  const hits = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(js|hbc|json|plist|xml)$/.test(entry.name)) continue;
      const text = fs.readFileSync(p, "utf8");

      const inlined = text.match(
        new RegExp(`"${VAR}"\\s*:\\s*\\{[^}]*value:\\s*"([^"]+)"`),
      );
      if (inlined && inlined[1].trim()) {
        hits.push(`${path.relative(dir, p)}: ${VAR} = ${inlined[1]}`);
      }

      // Only report a local address when it sits next to something Firebase
      // shaped. React Native's own dev plumbing mentions localhost in strings
      // that never dial anything, and flagging those trains people to ignore
      // this check.
      for (const m of text.match(LOCAL_ADDRESS_RE) ?? []) {
        const at = text.indexOf(m);
        const around = text.slice(Math.max(0, at - 120), at + 120);
        if (/firestore|firebase|emulator|:8080|:9099|:9199|:5001/i.test(around)) {
          hits.push(`${path.relative(dir, p)}: Firebase-adjacent local address ${m}`);
        }
      }
    }
  };
  walk(dir);
  return [...new Set(hits)];
}

function main() {
  const release =
    process.argv.includes("--release") || process.env.CHEZ_NOUS_RELEASE === "1";
  const scanIndex = process.argv.indexOf("--scan");
  const scanDir = scanIndex !== -1 ? path.resolve(process.argv[scanIndex + 1]) : null;

  const sources = emulatorHostSources();
  const artefactHits = scanDir && fs.existsSync(scanDir) ? scanArtefacts(scanDir) : [];

  console.log(`build type: ${release ? "RELEASE" : "development"}`);
  if (sources.length === 0) {
    console.log(`  ${VAR}: not set`);
  } else {
    for (const s of sources) console.log(`  ${VAR}: ${s.value} (from ${s.where})`);
  }
  if (scanDir) {
    console.log(`  scanned ${scanDir}: ${artefactHits.length} finding(s)`);
    for (const h of artefactHits) console.log(`    ${h}`);
  }

  if (!release) {
    if (sources.length) {
      console.log("\ndevelopment build — emulator host allowed");
    }
    return;
  }

  const failures = [];
  for (const s of sources) {
    failures.push(
      `${VAR} is set to "${s.value}" in ${s.where}. A release build carrying ` +
        `it ships an app that talks to a development machine instead of ` +
        `Firebase, and fails on every device with no message worth reading.`,
    );
  }
  for (const h of artefactHits) {
    failures.push(`built artefact still points at a development machine — ${h}`);
  }

  if (failures.length) {
    console.error("\ncheck-release-config FAILED");
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      `\n  To build for release: unset ${VAR} in your shell and remove it ` +
        `from .env.`,
    );
    process.exit(1);
  }
  console.log("\nrelease build carries no emulator configuration");
}

main();
