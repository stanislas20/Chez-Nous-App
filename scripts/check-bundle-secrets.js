// No server-only key may reach a shipped bundle.
//
// The audit that produced Phase E found EXPO_PUBLIC_GOOGLE_PLACES_API_KEY
// compiled into the JavaScript bundle months after the last line of code that
// read it had been deleted. Nothing was wrong with the code. Metro's env
// module inlines EVERY EXPO_PUBLIC_* variable it finds in .env into
// process.env in the bundle, read or not, and `unzip` is all it takes to get
// it back out of an APK or an IPA.
//
// So the invariant cannot be "no code imports the key". It has to be asserted
// against the artefact that actually ships. This script exports the real
// bundle and greps it.
//
// ── What is a secret here and what is not ───────────────────────────────
//
// Firebase client configuration is NOT a secret. The API key in
// google-services.json and GoogleService-Info.plist identifies the project to
// Google; it authorises nothing on its own, and Firebase documents it as
// public. Security comes from the rules and from App Check, not from hiding
// it. The Maps SDK key in app.json is the same: it is *supposed* to ship —
// that is how the native Maps SDK authenticates — and what makes it safe is
// the package/SHA and bundle-id restriction on the key itself.
//
// What must never ship is a key that authorises billable server-side calls
// with no app restriction possible: the Places key placesProxy holds as a
// Cloud Functions secret.
//
// Run:
//   node scripts/check-bundle-secrets.js              # exports, then scans
//   node scripts/check-bundle-secrets.js --reuse DIR  # scans an existing export
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const GOOGLE_KEY_RE = /AIza[0-9A-Za-z_\-]{35}/g;

// Keys that are expected in a client bundle, read from the files that put
// them there. Nothing is hard-coded: if the project is re-pointed at another
// Firebase project the allowlist follows it, and a key from anywhere else is
// still a failure.
function expectedPublicKeys() {
  const allowed = new Map();
  const add = (key, why) => {
    if (key) allowed.set(key, why);
  };

  const readKeys = (rel, why) => {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) return;
    const text = fs.readFileSync(full, "utf8");
    for (const key of text.match(GOOGLE_KEY_RE) ?? []) add(key, why);
  };

  readKeys("google-services.json", "Firebase Android client config (public)");
  readKeys("GoogleService-Info.plist", "Firebase iOS client config (public)");

  // app.json carries the native Maps SDK key, which ships by design.
  try {
    const appJson = require(path.join(root, "app.json"));
    add(
      appJson?.expo?.android?.config?.googleMaps?.apiKey,
      "Android Maps SDK key (ships by design; must be package/SHA restricted)",
    );
    add(
      appJson?.expo?.ios?.config?.googleMapsApiKey,
      "iOS Maps SDK key (ships by design; must be bundle-id restricted)",
    );
  } catch {
    // app.json unreadable is a different problem than this check's.
  }

  // The web config in .env is the same public Firebase key.
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^EXPO_PUBLIC_FIREBASE_API_KEY=(.+)$/);
      if (m) add(m[1].trim(), "Firebase web client config (public)");
    }
  }

  return allowed;
}

// Variables that must not appear in a bundle carrying a value, whatever the
// value is. EMULATOR_HOST is checked by scripts/check-release-config.js for
// the build-type rule; here it is only reported, because a development export
// is allowed to carry it.
const FORBIDDEN_ENV = ["EXPO_PUBLIC_GOOGLE_PLACES_API_KEY"];

// android and ios, never "all".
//
// `--platform all` includes web, and this app cannot bundle for web: it
// imports react-native/Libraries/Utilities/codegenNativeCommands, which is
// native-only, and the export dies there. Web is not a shipping target, so
// asking for it proved nothing and cost the whole check.
const SHIPPING_PLATFORMS = ["android", "ios"];

function exportBundle() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cheznous-bundle-"));
  for (const platform of SHIPPING_PLATFORMS) {
    process.stdout.write(`exporting ${platform}… `);
    execFileSync(
      "npx",
      [
        "expo",
        "export",
        "--platform",
        platform,
        "--output-dir",
        path.join(out, platform),
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: process.env },
    );
    process.stdout.write("done\n");
  }
  return out;
}

function jsFilesUnder(dir) {
  const files = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(js|hbc|json|map)$/.test(entry.name)) files.push(p);
    }
  };
  walk(dir);
  return files;
}

function main() {
  const reuseIndex = process.argv.indexOf("--reuse");
  const dir =
    reuseIndex !== -1 ? path.resolve(process.argv[reuseIndex + 1]) : exportBundle();

  const allowed = expectedPublicKeys();
  const failures = [];
  const seen = new Map();

  for (const file of jsFilesUnder(dir)) {
    const text = fs.readFileSync(file, "utf8");

    for (const key of text.match(GOOGLE_KEY_RE) ?? []) {
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key).add(path.relative(dir, file));
    }

    for (const name of FORBIDDEN_ENV) {
      // Matches the shape Metro emits: "NAME": { enumerable: true, value: "…" }
      const re = new RegExp(`"${name}"\\s*:\\s*\\{[^}]*value:\\s*"([^"]+)"`);
      const m = text.match(re);
      if (m && m[1].trim()) {
        failures.push(
          `${name} is inlined into ${path.relative(dir, file)} with a value ` +
            `(${m[1].slice(0, 10)}…). Remove it from .env — Metro inlines every ` +
            `EXPO_PUBLIC_* variable whether or not the app reads it.`,
        );
      }
    }
  }

  for (const [key, files] of seen) {
    if (allowed.has(key)) continue;
    failures.push(
      `Unrecognised Google API key ${key.slice(0, 10)}… in ${[...files].join(", ")}. ` +
        `It is not the Firebase client config and not a Maps SDK key, so it ` +
        `should not be in a client bundle.`,
    );
  }

  console.log(`scanned ${jsFilesUnder(dir).length} files in ${dir}`);
  for (const [key, why] of allowed) {
    const present = seen.has(key);
    console.log(`  ${present ? "present" : "absent "}  ${key.slice(0, 10)}…  ${why}`);
  }

  if (failures.length) {
    console.error("\ncheck-bundle-secrets FAILED");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nno server-only key reached the bundle");
}

main();
