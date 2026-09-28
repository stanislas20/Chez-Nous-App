#!/usr/bin/env node
//
// The Benin location hierarchy, generalised past property.
//
// Commune -> arrondissement -> quartier/village started as a property
// feature, because a flat in Godomey and a flat in Calavi centre are the
// same commune, an hour apart and half the price apart. But the argument was
// never about property: it is about anything a buyer has to travel to and
// collect by hand. A pushchair, a fridge, a wardrobe — "is this on my side of
// Cotonou?" decides the sale, and "Cotonou" cannot answer it.
//
// So the ladder is now offered to a NAMED SET of categories, and this file
// exists because a set is the kind of thing that rots quietly. Four failures
// in particular:
//
//   THE HALF-WIRED CATEGORY. The fields render but the payload drops them,
//   or the payload writes them but nothing renders. Either way the seller
//   answers a question that goes nowhere, and nothing logs it. One concept,
//   supportsPreciseLocality, is asked at every site, and this checks every
//   site asks it.
//
//   THE SILENT ENROLMENT. Somebody adds a key to the set because it seemed
//   to fit. Restaurants, Services and Events are the dangerous ones: they
//   already ask where they are, in `area` and `eventQuartier`, so joining
//   would put two "where exactly?" questions on one form and the answer
//   would land in whichever field the seller happened to fill. Membership is
//   pinned here in BOTH directions.
//
//   THE STALE HIERARCHY. An edit is an updateDoc, so a key left out of the
//   payload keeps whatever the document already held. A seller who fills the
//   ladder under Fashion and switches the listing to Services would leave a
//   quartier behind that no form can now see or correct. The six fields are
//   therefore written for every category — the value, not the key, is what
//   the gate decides.
//
//   THE REQUIRED LEVEL. Both levels are optional, everywhere, property
//   included. A commune is required and always was; making an arrondissement
//   required would block publishing from any village the 2013 roll missed.
//
// Run: node scripts/check-listing-location.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const raw = read("src/screens/CreateListingScreen.js");
const form = stripComments(raw);
// Prettier wraps the longer ternaries over three lines. Where the breaks
// fall is not what any of this is about.
const flat = form.replace(/\s+/g, " ");
const rawLines = raw.split("\n");
const categoriesSrc = stripComments(read("src/data/categories.js"));

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };

// ── 1-4. The category set, pinned in both directions ───────────────────
//
// Read out of the source rather than imported: the file is ESM and every
// other checker here is CommonJS, and parsing the literal has the side
// benefit of failing on a set built at runtime, which is not something this
// should ever become.
const APPROVED = [
  "realEstate",
  "fashion",
  "babyKids",
  "electronics",
  "homeGarden",
  "furniture",
  "sports",
  "other",
];
// Each of these is out for its own reason, and the reason is what makes
// re-adding it a decision rather than a tidy-up.
const EXCLUDED = {
  restaurants: "it already asks where it is, in `area`",
  services: "it already asks where it is, in `area`",
  events: "it already asks where it is, in `eventQuartier`",
  vehicles: "a vehicle is driven to the buyer, not collected from a quartier",
  agriculture: "not asked for; commune is the grain a farm is sold at",
  community: "plausible, but not asked for",
  jobs: "a quartier names the employer's premises, which a job ad should not",
  pharmacyOnDuty: "written by the ONPB importer; there is no seller to ask",
};

const setMatch = categoriesSrc.match(
  /export const PRECISE_LOCALITY_CATEGORIES = new Set\(\[([\s\S]*?)\]\)/,
);
if (!setMatch) {
  fail(
    "PRECISE_LOCALITY_CATEGORIES is not a plain `new Set([...])` literal in " +
      "src/data/categories.js — membership has to be readable without running " +
      "the app",
  );
} else {
  const members = [...setMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set(members);
  if (members.length !== seen.size)
    fail(`PRECISE_LOCALITY_CATEGORIES lists a category twice: ${members.join(", ")}`);
  for (const key of APPROVED)
    if (!seen.has(key))
      fail(`${key} was approved for the location hierarchy and is no longer in the set`);
  for (const [key, why] of Object.entries(EXCLUDED))
    if (seen.has(key))
      fail(
        `${key} has joined PRECISE_LOCALITY_CATEGORIES — it is deliberately ` +
          `out because ${why}. If that has genuinely changed, change this ` +
          `file too and say so`,
      );
  // Anything neither approved nor knowingly excluded is a category somebody
  // added without deciding. Silence is the failure mode here.
  const known = new Set([...APPROVED, ...Object.keys(EXCLUDED)]);
  for (const key of seen)
    if (!known.has(key))
      fail(`${key} is in the set but this checker has never heard of it — decide, then list it here`);
  // And every name in either list must be a real category, or a typo here
  // silently excuses a real category from the rule.
  const declared = new Set(
    [...categoriesSrc.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1]),
  );
  if (declared.size < 10)
    fail(`only ${declared.size} categories parsed out of categories.js — the parse likely broke`);
  else
    for (const key of known)
      if (!declared.has(key))
        fail(`${key} is named in this checker but is not a category in categories.js`);
}

// ── The single concept, asked once ─────────────────────────────────────
if (!/PRECISE_LOCALITY_CATEGORIES/.test(form))
  fail("CreateListingScreen does not import the category set");
if (!flat.includes("const supportsPreciseLocality = PRECISE_LOCALITY_CATEGORIES.has(selectedCategory);"))
  fail(
    "supportsPreciseLocality is not derived from PRECISE_LOCALITY_CATEGORIES — " +
      "a category test written out at each site is how one site gets missed",
  );
// Scattered category names next to the hierarchy are the thing the concept
// replaces. One test, read everywhere.
for (const pattern of [
  /selectedCategory === "fashion"[^\n]*(arrondissement|localityId|quartier)/i,
  /(arrondissement|localityId|quartier)[^\n]*selectedCategory === "/i,
  /isFashion[^\n]*(arrondissementValue|localityValue|communeCode)/i,
  /isBabyKids[^\n]*(arrondissementValue|localityValue|communeCode)/i,
]) {
  if (pattern.test(form))
    fail(`the hierarchy is gated on a category name instead of supportsPreciseLocality: ${pattern}`);
}

// ── 5. Commune, then arrondissement, then quartier/village ─────────────
const lineOf = (needle) => {
  const at = raw.indexOf(needle);
  return at === -1 ? -1 : raw.slice(0, at).split("\n").length;
};
const communeLabel = lineOf('<Label>{t("sellFieldLocation")}</Label>');
const arrondissementLabel = lineOf('<Label>{t("sellFieldArrondissement")}</Label>');
const localityLabel = lineOf('<Label>{t("sellFieldLocality")}</Label>');
for (const [name, line] of [
  ["the commune", communeLabel],
  ["the arrondissement", arrondissementLabel],
  ["the quartier/village", localityLabel],
]) {
  if (line === -1) fail(`${name} field is not rendered at all`);
}
if (!(communeLabel < arrondissementLabel && arrondissementLabel < localityLabel))
  fail(
    `the levels are declared out of order (commune ${communeLabel}, ` +
      `arrondissement ${arrondissementLabel}, quartier ${localityLabel}) — ` +
      `each only means something inside the one above it`,
  );
// At every render site, not just the first: the ladder is split by putting
// the commune in one place and its children several hundred pixels below.
const communeRenders = [];
rawLines.forEach((line, i) => {
  if (line.trim() === "{communeField}") communeRenders.push(i + 1);
});
if (communeRenders.length !== 2)
  fail(`${communeRenders.length} commune render site(s); expected 2`);
let gatedSites = 0;
for (const line of communeRenders) {
  const next = (rawLines[line] ?? "").trim();
  if (next === "{supportsPreciseLocality ? localityFields : null}") gatedSites += 1;
  else if (next !== "{localityFields}")
    fail(
      `the commune render at line ${line} is not immediately followed by the ` +
        `levels below it (next line is ${JSON.stringify(next)})`,
    );
}
if (gatedSites !== 1)
  fail(
    `${gatedSites} render site(s) gate the hierarchy on supportsPreciseLocality; ` +
      `expected exactly 1 — the generic site. Property is inside the set and ` +
      `renders them unconditionally inside its own location section`,
  );

// ── 6. Both levels stay optional, everywhere ───────────────────────────
const missingStart = form.indexOf("const missing = [];");
const missingEnd = form.indexOf('refuse(missing, "errorRequiredFields")');
if (missingStart === -1 || missingEnd === -1 || missingEnd < missingStart)
  fail("could not locate the required-fields block — the rest of this section is not being tested");
else {
  const missingBlock = form.slice(missingStart, missingEnd);
  if (!/missing\.push\("city"\)/.test(missingBlock))
    fail("the commune is no longer required; it always was, for every category");
  for (const word of ["arrondissement", "locality", "quartier"]) {
    if (missingBlock.toLowerCase().includes(word))
      fail(`${word} was added to the required fields; both levels below the commune are optional`);
  }
}

// ── 7-8. "Not listed" with nothing typed is the question dodged ────────
//
// The gate is supportsPreciseLocality, not isRealEstate: a Fashion seller
// who ticks "not listed" and types nothing would otherwise store an empty
// answer that reads like an answer.
const CUSTOM_GUARDS = [
  ["arrondissement",
   "if ( supportsPreciseLocality && arrondissementIsCustom && !arrondissementOther.trim() ) { Alert.alert(t(\"sellFormTitle\"), t(\"errorArrondissementOther\")); return; }"],
  ["quartier/village",
   "if ( supportsPreciseLocality && localityId === PICK_OTHER && !localityOther.trim() ) { Alert.alert(t(\"sellFormTitle\"), t(\"errorLocalityOther\")); return; }"],
];
for (const [level, guard] of CUSTOM_GUARDS) {
  if (!flat.includes(guard))
    fail(
      `a "not listed" ${level} with nothing typed is accepted, or is still ` +
        `guarded for property only — expected: ${guard}`,
    );
}

// ── 9-10. Parent changes clear everything below ────────────────────────
//
// THE FAILURE THIS GUARDS IS INVISIBLE. The pickers only render the selected
// parent's children, so a value left over from a previous parent is not on
// screen and is perfectly publishable: pick Cotonou -> 12eme -> Cadjehoun,
// change the commune to Abomey-Calavi, and the listing goes out claiming a
// Cotonou quartier in an Atlantique commune.
const effectAfter = (anchor, setters, what) => {
  const at = form.indexOf(anchor);
  if (at === -1) { fail(`the ${what} reset effect is gone`); return; }
  const body = form.slice(at, at + 700);
  for (const setter of setters)
    if (!new RegExp(`${setter}\\(`).test(body))
      fail(`changing the ${what} does not run ${setter}`);
};
effectAfter(
  "previousCommuneCode.current = communeCode;",
  ["setArrondissementId", "setArrondissementOther", "setLocalityId", "setLocalityOther"],
  "commune",
);
effectAfter(
  "previousArrondissementId.current = arrondissementId;",
  ["setLocalityId", "setLocalityOther"],
  "arrondissement",
);
// Keyed on the previous value, not fired on mount — otherwise every edit of
// an existing listing wipes the location it just restored.
for (const [guard, what] of [
  ["previousCommuneCode.current === communeCode) return;", "commune"],
  ["previousArrondissementId.current === arrondissementId) return;", "arrondissement"],
]) {
  if (!form.includes(guard))
    fail(`the ${what} reset is not guarded against firing on mount, so editing a listing would clear its own location`);
}

// ── 11-15. The payload ─────────────────────────────────────────────────
//
// `city` is ungated and always was: every category asks where the thing is,
// and that has not changed.
if (!flat.includes("city: selectedCity,"))
  fail("the payload no longer writes city");
if (/city: supportsPreciseLocality/.test(flat))
  fail("city has been put behind the hierarchy gate — it is required for every category");

// The submit payload's location block, and the property spread these six
// used to live in. Both slices are needed: one to read what is written, one
// to prove what is no longer written there.
const payloadAt = form.indexOf("city: selectedCity,");
const payload = payloadAt === -1 ? "" : form.slice(payloadAt, payloadAt + 2000);
if (!payload)
  fail("could not locate the submit payload — the rest of this section is not being tested");
const reAt = form.indexOf("              realEstateDeal,");
const reEnd = reAt === -1 ? -1 : form.slice(reAt).search(/^ {12}\}/m);
const rePayload = reAt === -1 || reEnd === -1 ? "" : form.slice(reAt, reAt + reEnd);
if (!rePayload)
  fail("could not locate the real-estate spread — the rest of this section is not being tested");

const HIERARCHY = [
  ["communeCode", "communeCode: supportsPreciseLocality ? communeCode : null,"],
  ["arrondissement", "arrondissement: supportsPreciseLocality ? arrondissementValue : null,"],
  ["arrondissementId", "arrondissementId: supportsPreciseLocality ? (canonicalArrondissement?.id ?? null) : null,"],
  ["quartier", "quartier: supportsPreciseLocality ? localityValue : null,"],
  ["localityId", "localityId: supportsPreciseLocality ? (canonicalLocality?.id ?? null) : null,"],
  ["localityType", "localityType: supportsPreciseLocality ? (canonicalLocality?.type ?? null) : null,"],
];
for (const [field, expression] of HIERARCHY) {
  if (!flat.includes(expression))
    fail(`the payload does not write ${field} correctly — expected exactly: ${expression}`);
  // Not ALSO inside the property spread, where all six began. A copy in
  // there would win for property and leave the shared one meaning nothing
  // for every other category — the old behaviour, restored by accident.
  if (new RegExp(`\\b${field}:`).test(rePayload))
    fail(
      `${field} is written inside the real-estate spread — it is a listing ` +
        `field now, and a copy in there is one only property would ever get`,
    );
}
// 15, stated exactly: the KEY is always written and the VALUE is what the
// gate decides. A conditional spread would omit the key instead, and a key
// left out of an updateDoc keeps whatever the document already held — so a
// seller who filled the ladder under Fashion and then switched the listing
// to Services would leave a quartier behind that no form can now see or
// correct.
if (/\.\.\.\(\s*supportsPreciseLocality/.test(flat))
  fail(
    "the hierarchy is written through a conditional spread — the six keys " +
      "must always be written, with the VALUE gated, or a listing that " +
      "leaves the set keeps a stale location forever",
  );
// The preview claims to show the result, so it carries the same location.
for (const expression of [
  "quartier: supportsPreciseLocality ? localityValue : null,",
  "arrondissement: supportsPreciseLocality ? arrondissementValue : null,",
  "communeCode: supportsPreciseLocality ? communeCode : null,",
]) {
  const copies = flat.split(expression).length - 1;
  if (copies !== 2)
    fail(
      `${copies} copy/copies of \`${expression}\` — expected 2, the submit ` +
        `payload and the preview, or the card shows a location the listing ` +
        `will not carry`,
    );
}
// Ids are derived keys (BJ0800-12-004), never official and never shown. An
// id invented for a place the seller typed would make it indistinguishable
// from one on INStaD's roll. Scoped to the payload: the seeding path legitimately
// pairs an id with a typed value, because restoring one IS setting both.
if (/(arrondissementId|localityId): [^\n]*(arrondissementOther|localityOther|PICK_OTHER)/.test(payload))
  fail("an id is being written for a manually typed place — canonical vs typed IS the id being null");

// ── 16-18. Editing ─────────────────────────────────────────────────────
const seedStart = form.indexOf("function seedPropertyLocation(editing)");
if (seedStart === -1) fail("there is no edit-seeding path for the listing location");
else {
  const seedFn = form.slice(seedStart, seedStart + 2400);
  // 16: canonical ids come back as canonical selections, and only when the
  // id still resolves — a renamed or removed place must not select nothing
  // while claiming to.
  if (!/editing\.arrondissementId/.test(seedFn) || !/editing\.localityId/.test(seedFn))
    fail("editing does not restore a canonical selection from its ids");
  if (!/getArrondissement\(storedArrondissementId\)/.test(seedFn))
    fail("editing restores an arrondissement id without checking it still resolves");
  if (!/getLocality\(storedLocalityId\)/.test(seedFn))
    fail("editing restores a locality id without checking it still resolves");
  // 17: a typed value comes back as typed, under the sentinel, not silently
  // promoted to a canonical place with a similar name.
  if (!/arrondissementId: PICK_OTHER/.test(seedFn))
    fail("editing does not restore a manually typed arrondissement as a typed one");
  if (!/localityId: PICK_OTHER/.test(seedFn))
    fail("editing does not restore a manually typed quartier as a typed one");
  // 18: city-only is the commonest document there is. It must seed to a
  // blank hierarchy rather than throwing or guessing.
  if (!/arrondissementId: null/.test(seedFn) || !/localityOther: ""/.test(seedFn))
    fail("there is no blank default, so a listing carrying only a city has nothing to seed to");
}
// A single unambiguous match may be upgraded to canonical; more than one may
// not. A commune can hold the same village name twice, and picking one of
// them would move a real listing to a place its seller never chose.
if (!/resolveLocalities\(/.test(form))
  fail("the old-listing upgrade path no longer resolves a typed quartier against the roll");
if (!/only\?\.arrondissementId/.test(form) && !/matches\.length === 1/.test(form))
  fail("the upgrade path no longer requires the match to be unambiguous");

// ── 19. Property still works exactly as it did ─────────────────────────
if (!/const isRealEstate = selectedCategory === "realEstate";/.test(form))
  fail("the property branch flag is gone");
if (!raw.includes('<Label>{t("sellSectionPropertyLocation")}</Label>'))
  fail("property no longer has its own location section");
// Property must not be made to depend on the set being right: it renders the
// ladder unconditionally inside its own section.
const reHeading = lineOf('<Label>{t("sellSectionPropertyLocation")}</Label>');
const reCommune = communeRenders.find((line) => line > reHeading);
if (reCommune === undefined || (rawLines[reCommune] ?? "").trim() !== "{localityFields}")
  fail("the property location section no longer renders the two lower levels unconditionally");

// ── 20-22. Nothing else was dragged in ─────────────────────────────────
//
// Sizing and vehicle parts share this 9,000-line file and nothing else. The
// test is non-interference: each keeps its own gate, and neither acquires
// the location one.
for (const [what, expression] of [
  ["fashion sizes", "fashionSizes: fashionHasSizes ? fashionSizes : [],"],
  ["fashion size system", "fashionSizeSystem: fashionHasSizes ? fashionSizeSystem : null,"],
  ["baby sizes", "babySizes: babyItemSubtype ? babySizes : [],"],
  ["baby size system", "babySizeSystem: babyItemSubtype ? babySizeSystem : null,"],
]) {
  if (!flat.includes(expression))
    fail(`${what} no longer written as it was — expected: ${expression}`);
}
for (const expression of [
  'const isTyreOffer = isVehicle && partType === "tyre"',
  'const isBatteryOffer = isVehicle && partType === "battery"',
  "const isPartOffer = isTyreOffer || isBatteryOffer",
]) {
  if (!form.includes(expression))
    fail(`vehicle subtype logic changed — expected: ${expression}`);
}
for (const pattern of [
  /supportsPreciseLocality[^\n]*(fashionSize|babySize|babyItemSubtype|partType|isTyreOffer|isBatteryOffer)/,
  /(fashionSize|babySize|babyItemSubtype|partType|isTyreOffer|isBatteryOffer)[^\n]*supportsPreciseLocality/,
]) {
  if (pattern.test(form))
    fail(`the location gate has become entangled with sizing or vehicle parts: ${pattern}`);
}
// Vehicles are excluded, so no vehicle flag may reach the hierarchy either.
for (const pattern of [
  /isVehicle[^\n]*(arrondissement|localityId|communeCode)/i,
  /(arrondissement|localityId|communeCode)[^\n]*isVehicle/i,
]) {
  if (pattern.test(form))
    fail(`Vehicles and the location hierarchy have become coupled: ${pattern}`);
}

// ── 23. Both sheets stay keyboard-safe ─────────────────────────────────
//
// app.json asks for softwareKeyboardLayoutMode "pan", and a React Native
// Modal is its own window, so a sheet inside one does not move when the
// keyboard opens. SheetRoot is the KeyboardAvoidingView that fixes it; a
// sheet that loses it loses its search box behind Gboard on Android.
for (const [state, what] of [
  ["arrondissementSheetOpen", "the arrondissement sheet"],
  ["localitySheetOpen", "the quartier/village sheet"],
]) {
  const at = raw.indexOf(`visible={${state}}`);
  if (at === -1) { fail(`${what} is gone`); continue; }
  const block = raw.slice(at, at + 900);
  if (!/<SheetRoot>/.test(block))
    fail(`${what} is not wrapped in SheetRoot — on Android the keyboard would cover its search box`);
  if (!/<SheetDismissArea/.test(block))
    fail(`${what} has no dismiss area — SheetRoot is a KeyboardAvoidingView, not a backdrop, so tapping away would do nothing`);
}
// And the searchable rows must survive a tap while the keyboard is up.
if (!/keyboardShouldPersistTaps:\s*"handled"/.test(form) &&
    !/keyboardShouldPersistTaps="handled"/.test(form))
  fail("the sheets do not keep taps alive while the keyboard is up — the first tap on a result would only dismiss it");

if (failures) process.exit(1);
console.log(
  `clean: listing location — ${APPROVED.length} categories offer the ladder, ` +
    `${Object.keys(EXCLUDED).length} deliberately do not, both levels optional, ` +
    `six fields written for every category with the value gated, parents reset ` +
    `their children, edits restore canonical and typed alike`,
);
