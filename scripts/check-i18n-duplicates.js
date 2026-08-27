// No key defined twice in either language.
//
// This exists because a duplicate is silent in every direction. JavaScript
// takes the last one and discards the first without a warning; the app
// renders, the key resolves, and check-i18n-keys passes because the key does
// exist — it just holds somebody else's words.
//
// The one that was here when this was written: sellFieldDriverVehicle was
// defined twice, once as "Votre véhicule" and once, further down, as "Quel
// véhicule" — a copy-paste of the neighbouring sellFieldDriverVehicleMode.
// The second won, so the driver form showed two consecutive labels both
// reading "Quel véhicule": one over the picker asking whose car it is, and
// one over the free-text field asking what the car is. Nothing failed. It
// simply asked the same question twice and meant two different things.
//
// Run: node scripts/check-i18n-duplicates.js
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "src", "i18n", "translations.js");
const source = fs.readFileSync(file, "utf8");

const failures = [];
let total = 0;

for (const lang of ["en", "fr"]) {
  const start = source.indexOf(`\n  ${lang}: {`);
  if (start === -1) {
    failures.push(`could not find the ${lang} block`);
    continue;
  }
  const end = source.indexOf("\n  },", start);
  const body = source.slice(start, end);

  // Top-level keys only — two spaces of indent inside the language object.
  // Nested objects are indented further and are not what this guards.
  const seen = new Map();
  for (const match of body.matchAll(/^    ([A-Za-z_][\w]*):/gm)) {
    const key = match[1];
    const line =
      source.slice(0, start + match.index).split("\n").length;
    if (seen.has(key)) {
      failures.push(
        `${lang}: "${key}" is defined twice — line ${seen.get(key)} is ` +
          `discarded, line ${line} is what the app shows`,
      );
    } else {
      seen.set(key, line);
    }
  }
  total += seen.size;
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(`clean: ${total} translation key(s), none defined twice`);
