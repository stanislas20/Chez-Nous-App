#!/usr/bin/env node
//
// The property location hierarchy, wired end to end.
//
// A commune is where a property search stops being useful — Abomey-Calavi is
// Godomey and Calavi centre and Womey, an hour apart and half the price
// apart — so a property now carries an arrondissement and a quartier/village
// from INStaD's roll. Each joint below fails silently rather than loudly if
// it comes apart, which is why each one is stated here.
//
// THE FAILURE THIS MOSTLY GUARDS IS THE STALE PARENT. The two pickers only
// render the selected commune's children, so a value left over from a
// previous commune is invisible on screen and perfectly publishable: pick
// Cotonou -> 12ème -> Cadjèhoun, change the commune to Abomey-Calavi, and
// without the reset effects the listing goes out claiming a Cotonou quartier
// in an Atlantique commune. Nothing logs it and the card reads plausibly.
//
// THE SECOND IS THE ID LEAK. Identity is an id (BJ0800-12-004) because names
// are not unique — a commune can hold the same village name twice. Those ids
// are derived, not official, and must never be read by a human, so the rule
// is that the picker labels and the payload both carry names.
//
// Run: node scripts/check-real-estate-location.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const form = stripComments(read("src/screens/CreateListingScreen.js"));
const raw = read("src/screens/CreateListingScreen.js");

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };

// ── 1. It is the canonical roll, not a second commune system ───────────
if (!/from "\.\.\/data\/benin\/localities"/.test(form))
  fail("CreateListingScreen does not import the canonical localities hierarchy");
if (!/resolveCommune\(selectedCity\)\?\.code/.test(form))
  fail(
    "the commune the seller already chose is not resolved to a p-code — the " +
      "hierarchy must hang off the existing location field, not a second one",
  );
for (const helper of [
  "arrondissementsForCommune",
  "localitiesForArrondissement",
  "getArrondissement",
  "getLocality",
]) {
  if (!new RegExp(`\\b${helper}\\b`).test(form))
    fail(`the form no longer uses ${helper} from the canonical hierarchy`);
}

// ── 2. Options are scoped to the selected parent ───────────────────────
//
// Scoping is the whole point: 546 arrondissements and 3,768 localities exist,
// and offering any of them under the wrong parent is how a listing ends up
// somewhere its seller never chose.
if (!/arrondissementsForCommune\(communeCode\)/.test(form))
  fail("arrondissement options are not scoped to the selected commune");
if (!/localitiesForArrondissement\(canonicalArrondissement\.id\)/.test(form))
  fail("locality options are not scoped to the selected arrondissement");

// ── 3. Changing a parent clears everything under it ────────────────────
const resetBlocks = [
  [/previousCommuneCode/, "commune"],
  [/previousArrondissementId/, "arrondissement"],
];
for (const [pattern, level] of resetBlocks)
  if (!pattern.test(form))
    fail(`nothing resets the levels below when the ${level} changes`);

// The commune reset must clear BOTH levels, and both halves of each — the
// canonical id and the typed text. Clearing only the id leaves the manual
// value to reappear under a commune it was never typed for.
const communeEffect = form.slice(
  form.indexOf("previousCommuneCode.current === communeCode"),
  form.indexOf("previousArrondissementId"),
);
for (const setter of [
  "setArrondissementId(null)",
  'setArrondissementOther("")',
  "setLocalityId(null)",
  'setLocalityOther("")',
]) {
  if (!communeEffect.includes(setter))
    fail(`changing the commune does not run ${setter}`);
}
const arrEffect = form.slice(
  form.indexOf("previousArrondissementId.current === arrondissementId"),
);
const arrEffectBody = arrEffect.slice(0, arrEffect.indexOf("}, [arrondissementId]"));
for (const setter of ["setLocalityId(null)", 'setLocalityOther("")']) {
  if (!arrEffectBody.includes(setter))
    fail(`changing the arrondissement does not run ${setter}`);
}
// Keyed on the previous value, not fired on mount — otherwise every edit of
// an existing property wipes the hierarchy it just restored.
if (!/previousCommuneCode\.current === communeCode\) return;/.test(form))
  fail("the commune reset is not guarded against firing on mount, so editing a listing would clear its own location");

// ── 4. "Not listed" exists at both levels, and is not an empty answer ──
if (!/const PICK_OTHER = /.test(form)) fail("the not-listed sentinel is gone");
if (!/sellFieldArrondissementOther/.test(form))
  fail("there is no not-listed option for the arrondissement");
if (!/sellFieldLocalityOther/.test(form))
  fail("there is no not-listed option for the quartier/village");
if (!/errorArrondissementOther/.test(form) || !/errorLocalityOther/.test(form))
  fail(
    '"not listed" with nothing typed is accepted — that stores an empty ' +
      "answer that reads like an answer",
  );
// But it must stay OPTIONAL: a property could always be published without a
// quartier and still must be. Nothing may add it to the required list.
const missingBlock = form.slice(
  form.indexOf("const missing = [];"),
  form.indexOf('refuse(missing, "errorRequiredFields")'),
);
for (const word of ["arrondissement", "locality", "quartier"]) {
  if (missingBlock.toLowerCase().includes(word))
    fail(`${word} was added to the required fields; property location is optional`);
}

// ── 5. The sentinel never reaches a listing, and neither does an id ────
if (!/arrondissementIsCustom\s*\n?\s*\?\s*arrondissementOther\.trim\(\) \|\| null/.test(form))
  fail("the arrondissement sentinel is not resolved to the typed text");
if (!/localityIsCustom\s*\n?\s*\?\s*localityOther\.trim\(\) \|\| null/.test(form))
  fail("the locality sentinel is not resolved to the typed text");

// Picker rows print item.name. An id in a label would put "BJ0800-12" in
// front of a seller.
for (const m of raw.matchAll(/<SheetRowLabel[^>]*>\s*\{([^}]+)\}/g)) {
  if (/\bitem\.id\b|\barrondissementId\b|\blocalityId\b/.test(m[1]))
    fail(`a picker row renders an internal id as its label: ${m[1].trim()}`);
}
if (!/<SelectorText muted=\{!arrondissementValue\}>/.test(raw))
  fail("the arrondissement selector does not display the resolved name");
if (!/<SelectorText muted=\{!localityValue\}>/.test(raw))
  fail("the quartier/village selector does not display the resolved name");

// ── 6. The payload keeps the human-readable value under the old key ────
//
// `quartier` is what RealEstateScreen filters on, what the card prints and
// what searchTokens indexes, and thousands of documents already carry it.
// Replacing it with an id would orphan every one of them.
const payloadStart = form.indexOf("              realEstateDeal,");
const payloadEnd = form.slice(payloadStart).search(/^ {12}\}/m);
const payload = form.slice(payloadStart, payloadStart + payloadEnd);
if (!/quartier: localityValue,/.test(payload))
  fail("the payload no longer writes the quartier as a human-readable name");
if (!/arrondissement: arrondissementValue,/.test(payload))
  fail("the payload does not carry the arrondissement name");
for (const field of ["arrondissementId", "localityId", "localityType"]) {
  if (!new RegExp(`${field}: `).test(payload))
    fail(`the payload does not carry ${field}`);
}
// Canonical vs custom IS the id being null, so the id may only ever come
// from a canonical record. Reading it from the picker state would store the
// sentinel, and inventing one for a typed value would make a custom place
// indistinguishable from the roll.
if (!/arrondissementId: canonicalArrondissement\?\.id \?\? null,/.test(payload))
  fail("arrondissementId is not taken from the canonical record only");
if (!/localityId: canonicalLocality\?\.id \?\? null,/.test(payload))
  fail("localityId is not taken from the canonical record only");
if (!/localityType: canonicalLocality\?\.type \?\? null,/.test(payload))
  fail("localityType is not taken from the canonical record only");

// ── 7. Editing restores all three generations of document ──────────────
if (!/function seedPropertyLocation\(editing\)/.test(form))
  fail("there is no edit-seeding path for the property location");
const seedFn = form.slice(
  form.indexOf("function seedPropertyLocation(editing)"),
  form.indexOf("function seedPropertyLocation(editing)") + 2400,
);
if (!/editing\.arrondissementId/.test(seedFn) || !/editing\.localityId/.test(seedFn))
  fail("editing does not restore a canonical selection");
if (!/editing\.arrondissement\b/.test(seedFn))
  fail("editing does not restore a custom arrondissement the seller typed");
// The old-listing path: match back only when it is unambiguous. A commune can
// hold one village name twice, and choosing one of them would move a real
// listing to an arrondissement nobody picked.
if (!/resolveLocalities\(quartier, communeCode\)/.test(seedFn))
  fail("an older listing's quartier is not looked up against the roll");
if (!/matches\.length === 1 \? matches\[0\] : null/.test(seedFn))
  fail(
    "the old-listing match is not restricted to a single unambiguous result — " +
      "two villages share a name in the same commune 32 times",
  );
if (!/return \{ \.\.\.blank, localityId: PICK_OTHER, localityOther: quartier \}/.test(seedFn))
  fail("an unmatched old quartier is dropped instead of being kept as typed text");

// ── 8. Nothing else was dragged in ─────────────────────────────────────
//
// Vehicles were finished and isolated one commit earlier. The two features
// share this file and nothing else; a vehicle must not acquire a property's
// arrondissement, and the property hierarchy must not be gated on a vehicle
// flag.
for (const pattern of [
  /isVehicle[^\n]*arrondissement/i,
  /isTyreOffer[^\n]*arrondissement/i,
  /isBatteryOffer[^\n]*(arrondissement|localityId)/i,
  /arrondissement[^\n]*isVehicle/i,
]) {
  if (pattern.test(form))
    fail(`Vehicles and the property location hierarchy have become coupled: ${pattern}`);
}
// ── 10. The hierarchy is inside the property branch, and is one ladder ─
//
// This used to test that the string "isRealEstate" appeared SOMEWHERE earlier
// in the file, which is worth nothing: it is a 9,000-line screen and that
// string appears dozens of times, so the assertion passed no matter which
// category's branch the fields had landed in. What has to be true is
// structural — the fields sit between the opening and closing of the
// real-estate branch — so that is what is measured.
//
// Prettier closes a JSX conditional at the indent of the line that opened it,
// which is what makes the range findable without parsing the file.
const lineOf = (needle) => {
  const at = raw.indexOf(needle);
  return at === -1 ? -1 : raw.slice(0, at).split("\n").length;
};
const branchOpen = lineOf("{isRealEstate ? (");
if (branchOpen === -1) fail("the real-estate branch has gone");
const rawLines = raw.split("\n");
const openIndent = branchOpen > 0 ? rawLines[branchOpen - 1].match(/^ */)[0] : "";
let branchClose = -1;
for (let i = branchOpen; i < rawLines.length; i += 1) {
  if (rawLines[i] === `${openIndent}) : null}`) { branchClose = i + 1; break; }
}
if (branchClose === -1) fail("could not find the end of the real-estate branch");

const heading = lineOf('<Label>{t("sellSectionPropertyLocation")}</Label>');
const commune = lineOf("{communeField}");
const arrondissement = lineOf('<Label>{t("sellFieldArrondissement")}</Label>');
const locality = lineOf('<Label>{t("sellFieldLocality")}</Label>');
for (const [name, line] of [
  ["the section heading", heading],
  ["the commune field", commune],
  ["the arrondissement field", arrondissement],
  ["the quartier/village field", locality],
]) {
  if (line === -1) { fail(`${name} is not rendered at all`); continue; }
  if (branchOpen !== -1 && branchClose !== -1 && !(line > branchOpen && line < branchClose))
    fail(
      `${name} is at line ${line}, outside the real-estate branch ` +
        `(${branchOpen}-${branchClose}) — it would render for another category`,
    );
}

// The order is the hierarchy, and it is the whole point of the section:
// commune, then arrondissement, then quartier/village.
if (!(commune < arrondissement && arrondissement < locality))
  fail(
    `the three levels are out of order (commune ${commune}, arrondissement ` +
      `${arrondissement}, quartier ${locality}) — each only means something ` +
      `inside the one above it`,
  );

// And adjacent. They were separated by price, deposit and avance, which is
// what made "Arrondissement" read as a question about nothing. Nothing may
// come between them except their own controls.
const between = rawLines.slice(commune, locality - 1).join("\n");
const strayLabels = [...between.matchAll(/<Label>\{t\("([^"]+)"\)\}<\/Label>/g)]
  .map((m) => m[1])
  .filter((k) => !/^sellField(Arrondissement|Locality|Location)$/.test(k));
if (strayLabels.length)
  fail(
    `unrelated field(s) sit between the three location levels: ` +
      `${strayLabels.join(", ")} — they must read as one ladder`,
  );

// The commune is required to publish, so its only copy may not hide behind
// the rent-or-sale choice the rest of the property form waits for.
const dealGate = lineOf("{realEstateDeal ? (");
if (dealGate !== -1 && locality > dealGate)
  fail(
    "the location section is inside the realEstateDeal gate — the commune is " +
      "required to publish and would be unreachable until a deal type is picked",
  );

// Moved, not duplicated: one commune control in the whole screen.
const communeControls = (raw.match(/<Label>\{t\("sellFieldLocation"\)\}<\/Label>/g) ?? []).length;
if (communeControls !== 1)
  fail(`${communeControls} commune selectors in the form; there must be exactly one`);
if (!/\{!isRealEstate \? communeField : null\}/.test(raw))
  fail("the commune control is not suppressed at its generic site for property listings");

// A heading with nothing under it is what prompted this: before an
// arrondissement is chosen the row stays, inert, and says what to do first.
if (!/disabled=\{!canonicalArrondissement\}/.test(raw))
  fail("the quartier/village selector is not disabled before an arrondissement is chosen");
if (!/disabled=\{!communeCode\}/.test(raw))
  fail("the arrondissement selector is not disabled before a commune is chosen");
if (!/sellPickCommuneFirst/.test(raw) || !/sellPickArrondissementFirst/.test(raw))
  fail("a disabled level does not say which parent to answer first");
// Under a custom arrondissement there is no roll, so the row is dropped and
// the text field is the whole answer — but something must always be there.
if (!/\{!arrondissementIsCustom \? \(/.test(raw))
  fail(
    "the quartier/village row is not dropped for a custom arrondissement — it " +
      "would sit disabled above a text field that does the same job",
  );

// ── 9. Readers show names, and old listings still render ───────────────
const browse = stripComments(read("src/screens/RealEstateScreen.js"));
if (!/place: \[listing\.quartier, listing\.arrondissement, listing\.city\]/.test(browse))
  fail("the property card/detail does not show the arrondissement");
if (/listing\.(arrondissementId|localityId)/.test(browse))
  fail("RealEstateScreen renders an internal id");
// filter(Boolean) is what lets a listing published before the hierarchy
// existed read exactly as it did.
if (!/\.filter\(Boolean\)/.test(browse.slice(browse.indexOf("place: [listing.quartier"))))
  fail("the place line does not drop absent parts, so old listings would show stray separators");

// The old quartier filter still builds from what sellers actually typed.
if (!/quartiersFor\(city, listings\)/.test(browse))
  fail("the existing quartier filter was removed");

if (failures) process.exit(1);
console.log(
  "clean: property location — commune resolved to a p-code, arrondissement " +
    "scoped to it and locality scoped to that, both reset on a parent change, " +
    "not-listed at both levels, names in the payload and ids only when canonical",
);
