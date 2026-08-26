// Every `trade` a screen sends to CreateListing must be a trade that form
// knows about.
//
// This exists because the same bug shipped twice. The Assurance screen's
// "Publier une agence d'assurance" passed a trade the form had never heard
// of, so an insurance agency was shown a plumber as its worked example. The
// Climatisation screen's "Publier un atelier" passed "garage", so somebody
// publishing an air-conditioning workshop was shown a mechanic's example and
// asked a mechanic's questions.
//
// Neither failed anywhere a test could see. The navigate call is valid, the
// form renders, and the only symptom is that the copy is about the wrong
// trade — which nobody notices until a user says "this isn't about
// insurance".
//
// So: collect every trade key passed from a screen, and require that the
// form both offers it and has a title example for it. A trade with no
// example silently falls back to the generic Services one, which is the
// exact failure.
//
// What this CANNOT catch, and it is worth being plain about: a screen that
// passes a valid trade belonging to somebody else. "garage" is a real trade
// with a real example, so Climatisation passing it looked correct from here
// and wrong on the phone. Only reading the screen catches that. What the
// script does cover is the half that is mechanical — a trade the form has
// never heard of — which is the half that shipped first.
//
// Run: node scripts/check-post-trades.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const formPath = path.join(root, "src", "screens", "CreateListingScreen.js");
const form = fs.readFileSync(formPath, "utf8");

const failures = [];

function keysOf(objectName) {
  const start = form.indexOf(`const ${objectName} = `);
  if (start === -1) return null;
  const open = form.indexOf("{", start);
  const close = form.indexOf("\n};", open);
  if (open === -1 || close === -1) return null;
  const body = form.slice(open, close);
  return new Set(
    [...body.matchAll(/^\s{2}(?:"([\w-]+)"|([A-Za-z_$][\w$]*)):/gm)].map(
      (match) => match[1] ?? match[2],
    ),
  );
}

// The trades the in-form picker offers — from SERVICE_TRADES specifically.
// Scanning the whole file for key/icon pairs also swept up PART_TYPES, whose
// entries are kinds of thing being sold rather than trades, and reported
// them as missing examples they were never supposed to have.
function serviceTradeKeys() {
  const start = form.indexOf("const SERVICE_TRADES = [");
  if (start === -1) return null;
  const close = form.indexOf("\n];", start);
  if (close === -1) return null;
  const body = form.slice(start, close);
  return new Set([...body.matchAll(/key:\s*"([\w-]+)"/g)].map((m) => m[1]));
}

const offered = serviceTradeKeys();
if (!offered) {
  console.error("FAIL could not read SERVICE_TRADES from the form");
  process.exit(1);
}
const hinted = keysOf("TRADE_HINT_KEYS");

if (!hinted) {
  console.error("FAIL could not read TRADE_HINT_KEYS from the form");
  process.exit(1);
}

// Trades the form handles by its own words rather than by a picker entry —
// they still need a hint, they just are not offered as a chip.
const CATEGORY_ONLY = new Set([]);

const screensDir = path.join(root, "src", "screens");
const screens = fs
  .readdirSync(screensDir)
  .filter((file) => file.endsWith(".js"));

let found = 0;
for (const file of screens) {
  if (file === "CreateListingScreen.js") continue;
  const source = fs.readFileSync(path.join(screensDir, file), "utf8");

  // navigate("CreateListing", { … trade: "x" … })
  for (const match of source.matchAll(
    /navigate\(\s*"CreateListing"\s*,\s*\{([\s\S]{0,400}?)\}\s*\)/g,
  )) {
    const block = match[1];
    const trade = block.match(/trade:\s*"([\w-]+)"/);
    if (!trade) continue;
    const key = trade[1];
    found += 1;

    if (!hinted.has(key)) {
      failures.push(
        `${file} posts with trade "${key}", which has no title example — ` +
          `the form falls back to the generic Services one`,
      );
    }
    if (!offered.has(key) && !CATEGORY_ONLY.has(key)) {
      failures.push(
        `${file} posts with trade "${key}", which the form's trade picker ` +
          `does not offer, so nobody can reach that form any other way`,
      );
    }
  }
}

// And the reverse: a trade offered in the picker with no example is the same
// bug waiting for somebody to pick it.
for (const key of offered) {
  if (!hinted.has(key)) {
    failures.push(
      `the form offers "${key}" in its trade picker but has no title ` +
        `example for it`,
    );
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: ${found} posting hand-off(s) from screens, ` +
    `${offered.size} trades offered, every one with its own example`,
);
