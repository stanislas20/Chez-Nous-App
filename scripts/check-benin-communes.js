#!/usr/bin/env node
//
// The commune list is the spine of every location feature, and it was wrong.
//
// The app shipped 61 names against an official 77: seventeen communes could
// not be selected at all, one entry was not a commune, one was a typo. None
// of that failed loudly — a seller in Ségbana simply found their commune
// absent and picked a neighbouring one, which is worse than an error because
// the listing then claims to be somewhere it is not.
//
// So the roll is checked rather than trusted. Identity and geometry come from
// OCHA/HDX COD-AB v01; display names are verified French spellings, because
// every name column in COD-AB is unaccented despite declaring lang "fr".
//
// THE ALIAS RULE IS THE IMPORTANT ONE. Listings store `city` as a display
// string and are never rewritten, so resolution has to absorb every spelling
// a document might hold. An alias that resolved to two different communes
// would silently move listings between them, so that is checked explicitly.
//
// Run: node scripts/check-benin-communes.js
const path = require("path");
const fs = require("fs");

const SOURCE = path.join(__dirname, "..", "src", "data", "benin", "communes.js");
const src = fs.readFileSync(SOURCE, "utf8");

// The module is ESM and imports nothing, so it is evaluated directly rather
// than parsed with a regex that would drift from the data it checks.
const body = src.replace(/^export\s+/gm, "");
const mod = new Function(
  `${body}; return { departments, communes, legacyPlaces, resolveCommune, canonicalCityName, communeNames };`,
)();
const { departments, communes, legacyPlaces, resolveCommune, canonicalCityName, communeNames } = mod;

let failures = 0;
const fail = (m) => {
  console.error(`FAIL ${m}`);
  failures += 1;
};

// ── Shape of the roll ──────────────────────────────────────────────────
if (departments.length !== 12)
  fail(`${departments.length} departments; Bénin has 12`);
if (communes.length !== 77)
  fail(`${communes.length} communes; Bénin has 77`);
if (communeNames.length !== 77)
  fail(`communeNames exposes ${communeNames.length}; expected 77`);

const depCodes = new Set(departments.map((d) => d.code));
if (depCodes.size !== departments.length) fail("duplicate department codes");

const codes = new Set();
for (const c of communes) {
  if (codes.has(c.code)) fail(`duplicate commune p-code ${c.code}`);
  codes.add(c.code);
  if (!/^BJ\d{4}$/.test(c.code)) fail(`${c.name}: p-code ${c.code} is malformed`);
  if (!depCodes.has(c.departmentCode))
    fail(`${c.name}: department ${c.departmentCode} is not one of the 12`);
  if (typeof c.lat !== "number" || typeof c.lon !== "number")
    fail(`${c.name}: missing coordinate`);
  // Bénin spans roughly 6.2-12.5 N and 0.7-3.9 E. A centroid outside that is
  // not a rounding error, it is the wrong country.
  if (c.lat < 6 || c.lat > 12.6) fail(`${c.name}: latitude ${c.lat} is outside Bénin`);
  if (c.lon < 0.6 || c.lon > 4.0) fail(`${c.name}: longitude ${c.lon} is outside Bénin`);
  if (!c.name || !c.sourceName) fail(`${c.code}: name or sourceName missing`);
}

const names = communes.map((c) => c.name);
if (new Set(names).size !== names.length) fail("duplicate commune display names");

// ── Aliases must never be ambiguous ────────────────────────────────────
const fold = (v) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const owner = new Map();
for (const c of communes) {
  for (const key of [c.name, c.sourceName, ...c.aliases]) {
    const k = fold(key);
    const prev = owner.get(k);
    if (prev && prev.code !== c.code)
      fail(`"${key}" resolves to both ${prev.name} (${prev.code}) and ${c.name} (${c.code})`);
    owner.set(k, c);
  }
}

// ── Backward compatibility: every spelling a listing may already hold ──
const mustResolve = {
  // accented names the app has always used
  "Aplahoué": "Aplahoué",
  "Kétou": "Kétou",
  "Sèmè-Kpodji": "Sèmè-Kpodji",
  // the app's own typo, still stored on listings
  "Torri-Bossito": "Tori-Bossito",
  // COD-AB spellings, including its two errors
  "Akpo-Misserete": "Akpro-Missérété",
  "Kobli": "Cobly",
  "Pehunco": "Péhunco",
  "Aplahoue": "Aplahoué",
  // the variants research left open
  "Boukombé": "Boukoumbé",
  "Segbana": "Ségbana",
};
for (const [stored, expected] of Object.entries(mustResolve)) {
  const got = canonicalCityName(stored);
  if (got !== expected)
    fail(`stored city "${stored}" resolves to "${got}", expected "${expected}"`);
}

// ── Ikpinlé: resolvable, but not offered ───────────────────────────────
if (communeNames.includes("Ikpinlé"))
  fail("Ikpinlé is selectable; it is not one of the 77 communes");
if (!legacyPlaces.some((p) => p.name === "Ikpinlé"))
  fail("Ikpinlé was dropped entirely; listings stored under it would stop matching");
if (resolveCommune("Ikpinlé"))
  fail("Ikpinlé resolves to a commune; the research did not establish a parent");

// ── The derived files keep the shapes ~30 call sites depend on ─────────
const citiesSrc = fs.readFileSync(path.join(__dirname, "..", "src", "data", "cities.js"), "utf8");
if (!/export const cities = communeNames/.test(citiesSrc))
  fail("cities.js no longer derives from the canonical roll");
const coordSrc = fs.readFileSync(path.join(__dirname, "..", "src", "data", "cityCoordinates.js"), "utf8");
if (!/export const cityCoordinates = entries/.test(coordSrc))
  fail("cityCoordinates.js is no longer a plain keyed object");
if (!/for \(const alias of commune\.aliases\)/.test(coordSrc))
  fail("cityCoordinates no longer keys aliases — a legacy city string would lose its coordinate");

if (failures) process.exit(1);
console.log(
  `clean: ${departments.length} departments, ${communes.length} communes, ` +
    `${owner.size} resolvable spellings, none ambiguous`,
);
