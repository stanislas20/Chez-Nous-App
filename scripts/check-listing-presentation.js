#!/usr/bin/env node
//
// What a buyer reads where a listing says it is.
//
// Phase 2 taught listings to STORE commune -> arrondissement -> quartier.
// This is the other half: the one place those three become a line somebody
// reads, and the failures here are all failures of the gap between them.
//
//   THE GAP RENDERED. A listing with a quartier and no arrondissement is
//   not an edge case — it is every property published before the hierarchy
//   existed, and it is what a seller produces by picking a quartier and
//   then changing the commune. Joining three slots when one is empty gives
//   "Cadjehoun ·  · Cotonou", which reads as a bug because it is one.
//
//   THE PLAUSIBLE LIE. String(null) is "null" and String(42) is "42". Both
//   render as a place name, in the same type, in the same row, with the
//   same pin beside them. A buyer has no way to tell.
//
//   THE ID ON SCREEN. Identity is a derived key (BJ0800-12-004) that is not
//   official and was never meant for a person. It is stored beside the name
//   precisely so that nothing has to resolve it to display anything.
//
//   THE SILENT DIVERGENCE. Cards stay concise on purpose and Product Detail
//   goes precise on purpose. Both halves are pinned here, because "make the
//   card match" is the obvious-looking change that undoes the decision.
//
// Unlike the other checkers in this directory, most of this RUNS the code
// rather than reading it. A formatter is the rare thing here with a real
// signature and a real return value, and asserting on output is stronger
// than asserting on source. The source assertions that remain are the ones
// about what the module must NOT reach for.
//
// Run: node scripts/check-listing-presentation.js

// src/ is ESM with no "type": "module" in package.json, so Node sniffs each
// file it imports and warns that it did. That is true, it is unavoidable
// without changing package.json for every other tool in the repo, and it is
// emitted by the module loader itself rather than through process.
// emitWarning, so the only place to silence it is before startup. Re-exec
// once with the env var set; every later run short-circuits this block.
if (!process.env.NODE_NO_WARNINGS) {
  const { spawnSync } = require("child_process");
  const again = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  process.exit(again.status ?? 1);
}

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };
const eq = (what, actual, expected) => {
  if (actual !== expected)
    fail(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const SEP = " · ";

(async () => {
  const mod = await import(
    require("url").pathToFileURL(path.join(root, "src/utils/listingLocation.js")).href
  );
  const { listingLocation, listingLocationParts } = mod;
  if (typeof listingLocation !== "function" || typeof listingLocationParts !== "function") {
    fail("src/utils/listingLocation.js must export listingLocation and listingLocationParts");
    process.exit(1);
  }

  // ── A-D. The four shapes a real listing takes ────────────────────────
  eq("A city only",
    listingLocation({ city: "Cotonou" }),
    "Cotonou");
  eq("B arrondissement + city",
    listingLocation({ arrondissement: "12ème Arrondissement", city: "Cotonou" }),
    `12ème Arrondissement${SEP}Cotonou`);
  eq("C quartier + arrondissement + city",
    listingLocation({ quartier: "Cadjèhoun", arrondissement: "12ème Arrondissement", city: "Cotonou" }),
    `Cadjèhoun${SEP}12ème Arrondissement${SEP}Cotonou`);
  // The gap. Every pre-hierarchy property listing is this shape.
  eq("D quartier + city, no arrondissement",
    listingLocation({ quartier: "Cadjèhoun", arrondissement: null, city: "Cotonou" }),
    `Cadjèhoun${SEP}Cotonou`);
  // Order is the feature: most specific first, never reversed.
  eq("order is quartier -> arrondissement -> city",
    listingLocationParts({ city: "Cotonou", arrondissement: "A", quartier: "Q" }).join("|"),
    "Q|A|Cotonou");

  // ── E-G. Values that are not place names ─────────────────────────────
  eq("E whitespace-only quartier is dropped",
    listingLocation({ quartier: "   ", arrondissement: "A", city: "Cotonou" }),
    `A${SEP}Cotonou`);
  eq("E surrounding whitespace is trimmed",
    listingLocation({ quartier: "  Cadjèhoun  ", city: "Cotonou" }),
    `Cadjèhoun${SEP}Cotonou`);
  eq("E tab/newline-only value is dropped",
    listingLocation({ quartier: "\t\n", city: "Cotonou" }),
    "Cotonou");
  eq("F null is dropped",
    listingLocation({ quartier: null, arrondissement: null, city: "Cotonou" }),
    "Cotonou");
  eq("F undefined is dropped",
    listingLocation({ quartier: undefined, city: "Cotonou" }),
    "Cotonou");
  eq("F absent keys are dropped",
    listingLocation({ city: "Cotonou" }),
    "Cotonou");
  // Coercion is the bug: String(42) is a plausible-looking place name.
  for (const [label, value] of [
    ["number", 42], ["zero", 0], ["true", true], ["false", false],
    ["array", ["Cadjèhoun"]], ["object", { name: "Cadjèhoun" }], ["NaN", NaN],
  ]) {
    eq(`G malformed ${label} quartier is dropped`,
      listingLocation({ quartier: value, city: "Cotonou" }),
      "Cotonou");
  }

  // ── H. Nothing to say, said as nothing ───────────────────────────────
  //
  // null and not "", so a caller writes {line ? ... : null} and renders no
  // row and no pin at all, rather than an icon beside empty space.
  for (const [label, input] of [
    ["empty object", {}],
    ["all null", { quartier: null, arrondissement: null, city: null }],
    ["all blank strings", { quartier: "", arrondissement: "  ", city: "" }],
    ["null listing", null],
    ["undefined listing", undefined],
    ["a string", "Cotonou"],
    ["a number", 7],
  ]) {
    eq(`H ${label} returns null`, listingLocation(input), null);
  }
  if (listingLocation({}) === "")
    fail("H empty location returns \"\" rather than null — callers test truthiness, and \"\" is falsy by luck rather than by contract");
  eq("H parts of an empty listing is an empty array",
    JSON.stringify(listingLocationParts({})), "[]");

  // ── I. Canonical and typed are indistinguishable on screen ───────────
  //
  // Which list a name came from is the seller's business. A buyer reads a
  // place, and the ids exist to match on, not to change how it reads.
  const canonical = {
    quartier: "Cadjèhoun", localityId: "BJ0800-12-004",
    arrondissement: "12ème Arrondissement", arrondissementId: "BJ0800-12",
    city: "Cotonou", communeCode: "BJ0800",
  };
  const typed = {
    quartier: "Cadjèhoun", localityId: null,
    arrondissement: "12ème Arrondissement", arrondissementId: null,
    city: "Cotonou", communeCode: null,
  };
  eq("I canonical and typed render identically",
    listingLocation(canonical), listingLocation(typed));
  eq("I and both render the full hierarchy",
    listingLocation(typed), `Cadjèhoun${SEP}12ème Arrondissement${SEP}Cotonou`);

  // ── J. No id, no code, ever ──────────────────────────────────────────
  const withIds = listingLocation(canonical) ?? "";
  for (const secret of ["BJ0800-12-004", "BJ0800-12", "BJ0800"]) {
    if (withIds.includes(secret))
      fail(`J the output leaks an internal id or code: ${secret} in ${JSON.stringify(withIds)}`);
  }
  // And an id must not stand in for a missing name. A listing that lost its
  // name must show one level less, not a key.
  eq("J an id without its name shows nothing for that level",
    listingLocation({ localityId: "BJ0800-12-004", arrondissementId: "BJ0800-12", communeCode: "BJ0800", city: "Cotonou" }),
    "Cotonou");

  // ── K. No malformed separator, on any input ──────────────────────────
  const MALFORMED = [
    [/^\s*·/, "a leading separator"],
    [/·\s*$/, "a trailing separator"],
    [/·\s*·/, "a doubled separator"],
    [/\bnull\b/, "the text \"null\""],
    [/\bundefined\b/, "the text \"undefined\""],
    [/\bNaN\b/, "the text \"NaN\""],
    [/ {2}/, "a double space"],
    [/^\s|\s$/, "leading or trailing whitespace"],
  ];
  const auditLine = (line, where) => {
    if (line === null) return;
    if (typeof line !== "string") { fail(`${where}: returned a ${typeof line}, not a string or null`); return; }
    if (!line.length) { fail(`${where}: returned an empty string; that must be null`); return; }
    for (const [pattern, what] of MALFORMED)
      if (pattern.test(line)) fail(`${where}: output has ${what} — ${JSON.stringify(line)}`);
  };
  // Every combination of present/absent/blank/malformed across three levels.
  const CANDIDATES = ["Cadjèhoun", "", "   ", null, undefined, 42, {}];
  let combos = 0;
  for (const q of CANDIDATES) for (const a of CANDIDATES) for (const c of CANDIDATES) {
    combos += 1;
    auditLine(listingLocation({ quartier: q, arrondissement: a, city: c }), "K combination");
  }
  if (combos !== CANDIDATES.length ** 3)
    fail(`K only ${combos} combinations exercised; expected ${CANDIDATES.length ** 3}`);

  // ── L. The listing is not touched ────────────────────────────────────
  const frozen = Object.freeze({
    quartier: "Cadjèhoun", arrondissement: "12ème Arrondissement", city: "Cotonou",
  });
  try {
    listingLocation(frozen);
    listingLocationParts(frozen);
  } catch (error) {
    fail(`L the formatter writes to the listing it was given: ${error.message}`);
  }
  const snapshot = { quartier: " Cadjèhoun ", arrondissement: null, city: "Cotonou" };
  const before = JSON.stringify(snapshot);
  listingLocation(snapshot);
  if (JSON.stringify(snapshot) !== before)
    fail("L the formatter mutated its argument — trimming must produce a new value, not write one back");
  // And the array it hands back is its own, not shared state.
  const first = listingLocationParts(frozen);
  first.push("tampered");
  if (listingLocationParts(frozen).length !== 3)
    fail("L listingLocationParts returns shared state — a caller mutating it changed the next answer");

  // ── M. It reaches for nothing ────────────────────────────────────────
  const source = read("src/utils/listingLocation.js");
  const code = stripComments(source);
  if (/\bimport\b[^\n]*\bfrom\b/.test(code) || /\brequire\(/.test(code))
    fail("M the formatter has acquired a dependency — it must stay pure, or a display path can fail on a missing module");
  for (const [pattern, what] of [
    [/firebase/i, "Firebase"],
    [/benin\//, "the canonical Bénin dataset"],
    [/localities|communes/, "the locality or commune roll"],
    [/categoryKey|isRealEstate|PRECISE_LOCALITY/, "category awareness"],
  ]) {
    if (pattern.test(code)) fail(`M the formatter references ${what}; it must be purely presentational`);
  }
  // The ids may be named in the comments explaining why they are unused;
  // they may not be read by the code.
  for (const field of ["communeCode", "arrondissementId", "localityId", "localityType"]) {
    if (new RegExp(`\\b${field}\\b`).test(code))
      fail(`M the formatter reads ${field}; it must display stored names only`);
  }
  if (!/localityId/.test(source))
    fail("M the comments no longer say why the ids are not used — that omission is how somebody adds them back");

  // ── N. Product Detail uses it, in the row that already existed ───────
  const detail = read("src/screens/ProductDetailScreen.js");
  if (!/import \{ listingLocation \} from "\.\.\/utils\/listingLocation";/.test(detail))
    fail("N ProductDetailScreen does not import the shared formatter");
  if (!detail.includes("<MetaLabel>{listingLocation(listing) ?? listing.city}</MetaLabel>"))
    fail("N the Product Detail location byline does not use the shared formatter");
  if (/<MetaLabel>\{listing\.city\}<\/MetaLabel>/.test(detail))
    fail("N a bare city label is still in Product Detail — the precise line and a city-only line would say the same thing twice");
  // The pin, and the row it sits in, are what make it read as a place.
  const metaAt = detail.indexOf("<MetaLabel>{listingLocation(listing) ?? listing.city}</MetaLabel>");
  // Anchored on the enclosing MetaItem rather than a byte count, so adding
  // or removing a comment beside the label cannot quietly stop this looking
  // at the right thing.
  const itemAt = metaAt === -1 ? -1 : detail.lastIndexOf("<MetaItem>", metaAt);
  const around = itemAt === -1 ? "" : detail.slice(itemAt, metaAt);
  if (!/name="location-outline"/.test(around))
    fail("N the location pin no longer sits beside the location line");
  if (!/<MetaRow>/.test(detail))
    fail("N the meta row is gone; the location line has nowhere to wrap");
  // Wrapping is the long-name strategy. A line limit would eat the quartier,
  // which is the most specific part and the reason for the change.
  // Anchored WITHOUT the opening backtick, so a line limit added through
  // styled.Text.attrs({ numberOfLines: 1 }) — which sits before it — is
  // still inside the window this reads.
  const declOf = (name) => {
    const at = detail.indexOf(`const ${name} = styled.`);
    return at === -1 ? "" : detail.slice(at, at + 260);
  };
  const metaRowDecl = declOf("MetaRow");
  if (!metaRowDecl) fail("N MetaRow is no longer a styled component; this check cannot see it");
  if (!/flex-wrap: wrap/.test(metaRowDecl))
    fail("N MetaRow no longer wraps, so a long locality name would be clipped instead of flowing");
  const metaLabelDecl = declOf("MetaLabel");
  if (!metaLabelDecl) fail("N MetaLabel is no longer a styled component; this check cannot see it");
  if (/numberOfLines/.test(metaLabelDecl))
    fail("N MetaLabel has gained a line limit — truncation removes the quartier first");
  // One location statement on the screen: the map section stays a map.
  const spots = (detail.match(/listingLocation\(/g) ?? []).length;
  if (spots !== 1)
    fail(`N the formatter is called ${spots} times in Product Detail; expected 1 — a second call is a second place saying where the listing is`);

  // ── O. Cards stay concise, on purpose ────────────────────────────────
  const card = read("src/components/ListingCard.js");
  if (!/<City>\{listing\.city\}<\/City>/.test(card))
    fail("O ListingCard no longer shows the commune on its own — cards are scanned, and a three-part line in a 10.5px subtitle is noise");
  if (/listingLocation/.test(card))
    fail("O ListingCard has taken the precise hierarchy — that is deliberately Product Detail only");

  // ── P. The preview is the card, so it follows the card ───────────────
  const form = read("src/screens/CreateListingScreen.js");
  if (!/<ListingCard listing=\{previewListing\}/.test(form))
    fail("P the Create Listing preview is no longer a ListingCard — it exists to show what the feed will show");
  if (/listingLocation/.test(form))
    fail("P CreateListingScreen has taken the Product Detail formatter; the preview must match the card, not the detail screen");

  // ── Q. Property keeps its own, already-approved presentation ─────────
  const reList = read("src/screens/RealEstateScreen.js");
  const reDetail = read("src/screens/RealEstateDetailScreen.js");
  if (!/place: \[listing\.quartier, listing\.arrondissement, listing\.city\]/.test(reList))
    fail("Q buildPropertyView no longer composes the property place line");
  if (!/\.join\(", "\)/.test(reList))
    fail("Q the property place line no longer uses its own separator — converging it was deliberately left out of this phase");
  if (!/view\.place/.test(reDetail))
    fail("Q RealEstateDetailScreen no longer renders its place row");
  if (/listingLocation/.test(reList) || /listingLocation/.test(reDetail))
    fail("Q Real Estate has been switched to the new formatter; that was explicitly out of scope");

  // ── The whole roll, run through it ───────────────────────────────────
  //
  // 3,768 real localities under 546 real arrondissements in 77 real
  // communes. Accents, apostrophes, parentheses, hyphens and names up to 30
  // characters — the shapes a hand-written fixture does not think of.
  const bj = await import(
    require("url").pathToFileURL(path.join(root, "src/data/benin/localities.js")).href
  );
  const communes = await import(
    require("url").pathToFileURL(path.join(root, "src/data/benin/communes.js")).href
  );
  let checked = 0;
  let longest = "";
  for (const commune of communes.communes) {
    for (const group of bj.localitiesForCommune(commune.code)) {
      for (const locality of group.localities) {
        const line = listingLocation({
          quartier: locality.name,
          arrondissement: group.arrondissement.name,
          city: commune.name,
        });
        auditLine(line, `roll ${locality.name}`);
        if (line === null) fail(`roll: ${locality.name} produced no line at all`);
        else if (line.length > longest.length) longest = line;
        // Dropping a level must lose that level and nothing else.
        auditLine(
          listingLocation({ arrondissement: group.arrondissement.name, city: commune.name }),
          `roll (no quartier) ${group.arrondissement.name}`,
        );
        checked += 1;
      }
    }
  }
  if (checked !== 3768)
    fail(`the roll produced ${checked} combinations; expected 3768 — the dataset changed, or this stopped reading all of it`);

  if (failures) process.exit(1);
  console.log(
    `clean: listing presentation — formatter pure and dependency-free, ` +
      `${checked} real localities render without a malformed separator ` +
      `(longest ${longest.length} chars), ids never shown, canonical and ` +
      `typed identical, Product Detail precise, cards and preview concise, ` +
      `Real Estate untouched`,
  );
})().catch((error) => {
  console.error(`FAIL the checker itself threw: ${error.stack}`);
  process.exit(1);
});
