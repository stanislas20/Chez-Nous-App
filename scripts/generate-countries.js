// Regenerates src/data/countries.js.
//
// The dial codes come from libphonenumber-js, which is also what validates a
// number's length at sign-up, so the picker and the validator can never
// disagree about which countries exist. The names come from Intl.DisplayNames
// in Node, resolved once here rather than at runtime: React Native's Hermes
// ships without the full ICU data, so asking the device for a French country
// name returns the ISO code on most Android builds.
//
// Run: node scripts/generate-countries.js

const fs = require("fs");
const path = require("path");
const {
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
} = require("libphonenumber-js");
// Mobile examples specifically: every account here is a handset that has to
// receive an SMS, so a landline example would be the wrong shape to copy.
const phoneExamples = require("libphonenumber-js/examples.mobile.json");

const en = new Intl.DisplayNames(["en"], { type: "region" });
const fr = new Intl.DisplayNames(["fr"], { type: "region" });

// Regional-indicator letters: 'BJ' -> 🇧🇯
const flagOf = (code) =>
  String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const rows = getCountries()
  .map((code) => ({
    code,
    dial: `+${getCountryCallingCode(code)}`,
    flag: flagOf(code),
    nameEn: en.of(code),
    nameFr: fr.of(code),
    // The placeholder under the field, in this country's own national
    // format. Generated from the same library as the dial code and the
    // length check, for the reason the header gives: a hint that disagrees
    // with the validator teaches people to type a number the form then
    // refuses.
    example: getExampleNumber(code, phoneExamples)?.formatNational() ?? null,
  }))
  // A code with no readable name is an ISO entry nobody would recognise in a
  // picker; libphonenumber carries a few.
  .filter((row) => row.nameEn && row.nameEn !== row.code)
  .sort((a, b) => a.nameFr.localeCompare(b.nameFr, "fr"));

const body = rows
  .map(
    (row) =>
      `  { code: "${row.code}", dial: "${row.dial}", flag: "${row.flag}", ` +
      `nameEn: ${JSON.stringify(row.nameEn)}, nameFr: ${JSON.stringify(row.nameFr)}, ` +
      `example: ${JSON.stringify(row.example)} },`,
  )
  .join("\n");

const file = `// Every country a phone number can be registered in.
//
// GENERATED — run \`node scripts/generate-countries.js\` to rebuild. Do not
// edit by hand: the dial codes here, the example under the field and the
// length validation at sign-up all come from libphonenumber-js, and
// hand-editing one of them is how a picker comes to offer a country whose
// numbers are then rejected.
//
// \`example\` is that country's own national format. The field used to show a
// Beninese one to everybody — pick France and the hint still read "01 23 45
// 67 89" while the validator was checking against +33.
//
// Anyone in the world may hold an account. Publishing is a separate question,
// answered by POSTING_COUNTRY below and enforced in Firestore rules — see
// canPublish.js.

// The one country whose numbers may publish a listing. Chez-Nous exists to
// show Bénin's businesses to the world, so the reading side is open to
// everyone and the writing side is not.
export const POSTING_COUNTRY = "BJ";
export const POSTING_DIAL = "+229";

export const countries = [
${body}
];

export function findCountryByCode(code) {
  return countries.find((item) => item.code === code) ?? null;
}

// The placeholder to print under a phone field, for whichever country the
// picker is on.
//
// Nullable on purpose. libphonenumber has no mobile example for a handful of
// territories, and inventing one would put us back where this started —
// showing somebody a format their own number does not have. Callers fall
// back to the generic wording when this returns null.
export function phoneExampleFor(code) {
  return findCountryByCode(code)?.example ?? null;
}

// Longest dial code first, so +229 is not shadowed by +22 and Canada's +1
// does not swallow +1242. Callers pass a full E.164 number.
const BY_DIAL_LENGTH = [...countries].sort(
  (a, b) => b.dial.length - a.dial.length,
);

export function findCountryByPhone(e164Phone) {
  if (!e164Phone) return null;
  const value = String(e164Phone).trim();
  return BY_DIAL_LENGTH.find((item) => value.startsWith(item.dial)) ?? null;
}
`;

fs.writeFileSync(path.join(__dirname, "..", "src/data/countries.js"), file);
console.log(`wrote src/data/countries.js — ${rows.length} countries`);
