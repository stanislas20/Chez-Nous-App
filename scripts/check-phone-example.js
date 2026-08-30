// The hint under a phone field has to describe the country above it.
//
// One Beninese example was hardcoded and shown to all 245 countries. Sign-up
// is deliberately open to the world — "Open sign-up to the world, keep
// publishing to Bénin" — so somebody in Paris picked France, saw "ex. 01 23
// 45 67 89" under the field, and typed a number shaped like that. The
// validator, meanwhile, checks isPossibleNationalNumber against the country
// they actually chose. The form was describing a number it would then
// refuse, which is the worst kind of hint: confident, specific and wrong.
//
// The example now comes from libphonenumber-js, generated into countries.js
// beside the dial code and by the same script — which is the point. That
// file's own header says hand-editing one of them "is how a picker comes to
// offer a country whose numbers are then rejected", and an example that
// drifts from the validator is exactly that failure wearing different
// clothes.
//
// Run: node scripts/check-phone-example.js
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const vm = require("vm");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

const failures = [];

// 1. Nobody prints the fixed example under a field whose country can change.
{
  const PICKERS = [
    "src/screens/LoginScreen.js",
    "src/screens/SignUpScreen.js",
    "src/screens/ForgotPasswordScreen.js",
  ];
  for (const rel of PICKERS) {
    const source = read(rel);
    if (/placeholder=\{t\("fieldPhonePlaceholder"\)\}/.test(source)) {
      failures.push(
        `${rel} shows the fixed Beninese example under a field whose ` +
          `country the reader can change`,
      );
    }
    if (!/country\.example/.test(source)) {
      failures.push(`${rel} no longer reads the chosen country's example`);
    }
    // The picker and the hint must read the same country, or the hint is
    // just a different wrong answer.
    if (!/countries\.find\(\(item\) => item\.code === countryCode\)/.test(source)) {
      failures.push(`${rel} no longer derives its country from the picker`);
    }
  }
}

// 2. The data carries one, for every country the picker offers.
{
  const code = babel.transformFileSync(
    path.join(root, "src/data/countries.js"),
    {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    },
  ).code;
  const box = { module: { exports: {} }, exports: {} };
  box.module.exports = box.exports;
  vm.createContext(box);
  vm.runInContext(code, box);
  const { countries, phoneExampleFor } = box.module.exports;

  const missing = countries.filter((item) => !item.example);
  if (missing.length) {
    failures.push(
      `${missing.length} country/countries in the picker have no example ` +
        `(${missing.slice(0, 3).map((c) => c.code).join(", ")}) — the field ` +
        `falls back to a Beninese hint for them`,
    );
  }
  // The examples have to actually differ by country, which is the whole
  // bug: a generator that returned one string for everybody would satisfy
  // every other check here.
  const bj = phoneExampleFor("BJ");
  for (const other of ["FR", "US", "NG"]) {
    if (phoneExampleFor(other) === bj) {
      failures.push(`${other}'s example is identical to Bénin's`);
    }
  }
  // And they have to be the country's own national format, not E.164 — a
  // reader copies the shape they are shown.
  if (/^\+/.test(bj ?? "")) {
    failures.push("the examples are E.164, not the national format people type");
  }
}

// 3. countries.js stays generated. The example, the dial code and the length
//    check come from one library precisely so they cannot disagree.
{
  const raw = fs.readFileSync(path.join(root, "src/data/countries.js"), "utf8");
  if (!/GENERATED/.test(raw)) {
    failures.push("countries.js has lost its generated marker");
  }
  const gen = read("scripts/generate-countries.js");
  if (!/getExampleNumber\(/.test(gen)) {
    failures.push(
      "generate-countries.js no longer derives the example from " +
        "libphonenumber, so it can drift from the validator that rejects it",
    );
  }
  if (!/examples\.mobile\.json/.test(gen)) {
    failures.push(
      "the examples are no longer the mobile set — every account here is a " +
        "handset that has to receive an SMS, and a landline is the wrong shape",
    );
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  "clean: the phone hint follows the country picker, generated from the " +
    "same library that validates the number",
);
