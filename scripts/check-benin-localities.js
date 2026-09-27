#!/usr/bin/env node
//
// Two levels below the commune, where a property search actually happens.
//
// Phase 1 fixed the commune list. A commune is still the wrong unit to sell a
// flat in: Abomey-Calavi is Godomey and Calavi centre and Womey, an hour apart
// and half the price apart, and the file this replaces knew it — it offered 21
// hand-written names for four of the seventy-seven communes and said in its
// own header that the commune each one belonged to had never been checked.
//
// WHAT THE PARENT RELATION RESTS ON. INStaD's cahiers des villages et
// quartiers de ville (RGPH-4, 2016) print the hierarchy as rows — DEP:, COM:,
// ARROND:, then the localities of that arrondissement — so every parent here
// is stated by the administrative source. Nothing is placed by proximity.
// That matters because the obvious alternative does not work: geoBoundaries
// publishes 546 arrondissement polygons, agreeing exactly on the count, and
// its geometry puts KANDI I's own point inside Kandi II. A locality filed
// under the wrong arrondissement is invisible in its own filter and nothing
// logs it, which is the same failure the old file warned about.
//
// So this checks the shape of the roll rather than trusting the extraction:
// the counts the twelve cahiers state about themselves, that every parent
// exists, that no id repeats, and that no alias is ambiguous inside a commune.
//
// THE ALIAS AND LEGACY RULES ARE THE LOAD-BEARING ONES. Listings store
// `quartier` as a display string and are never rewritten, so a name that stops
// resolving takes its listing out of its own filter. The nine legacy names
// INStaD does not carry — Akpakpa, Ganhi, Sainte-Rita and the rest — are real
// places people actually say, spanning several official quartiers. They are
// kept, with their commune and WITHOUT an arrondissement, and this refuses to
// let anything hand them one.
//
// Run: node scripts/check-benin-localities.js
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "src", "data", "benin");
const load = (file, names) => {
  const body = fs.readFileSync(path.join(dir, file), "utf8").replace(/^export\s+/gm, "");
  return new Function(`${body}; return { ${names.join(", ")} };`)();
};

const { communes } = load("communes.js", ["communes"]);
const L = load("localities.js", [
  "arrondissements", "localitiesByArrondissement", "localityCoordinates",
  "sourceNameExceptions", "aliases", "legacyQuartiers", "QUARTIER_COMMUNE_CODES",
  "arrondissementsForCommune", "localitiesForCommune", "localitiesForArrondissement",
  "resolveLocality", "resolveLocalities", "searchLocalities", "getArrondissement", "getLocality",
]);

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };

const communeCodes = new Set(communes.map((c) => c.code));
const arrIds = new Set();
const fold = (v) => String(v ?? "").normalize("NFD")
  .replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── 1. The counts the sources state about themselves ───────────────────
//
// 546 is Bénin's official arrondissement count AND the sum of the twelve
// figures each cahier prints in its own prose. An extraction that drifts —
// a name wrapping onto the next page, a row read twice — moves this number,
// which is why it is pinned rather than recomputed.
if (L.arrondissements.length !== 546)
  fail(`${L.arrondissements.length} arrondissements; the twelve cahiers and the official roll both say 546`);

const localityCount = Object.values(L.localitiesByArrondissement)
  .reduce((n, list) => n + list.length, 0);
if (localityCount !== 3768)
  fail(`${localityCount} localities; the extraction yields 3768`);

// Littoral's cahier is the one that states its own unit type and total:
// Cotonou is 13 arrondissements and 143 quartiers de ville.
const cotonou = L.arrondissementsForCommune("BJ0800");
if (cotonou.length !== 13)
  fail(`Cotonou has ${cotonou.length} arrondissements; its cahier says 13`);
const cotonouLocalities = L.localitiesForCommune("BJ0800")
  .reduce((n, g) => n + g.localities.length, 0);
if (cotonouLocalities !== 143)
  fail(`Cotonou has ${cotonouLocalities} quartiers; its cahier says 143`);

// ── 2. Every parent exists, and every commune is reachable ─────────────
const covered = new Set();
for (const [id, name] of L.arrondissements) {
  if (arrIds.has(id)) fail(`duplicate arrondissement id ${id}`);
  arrIds.add(id);
  const code = id.slice(0, 6);
  if (!communeCodes.has(code))
    fail(`arrondissement ${id} (${name}) hangs off ${code}, which is not one of the 77 commune codes`);
  covered.add(code);
  if (!name || !String(name).trim()) fail(`arrondissement ${id} has no name`);
  if (/[-–]\s*$/.test(name))
    fail(`arrondissement ${id} name "${name}" is cut off — a wrapped row was not rejoined`);
}
if (covered.size !== communeCodes.size)
  fail(`${communeCodes.size - covered.size} commune(s) have no arrondissement; every commune has at least one`);

for (const arrId of Object.keys(L.localitiesByArrondissement)) {
  if (!arrIds.has(arrId))
    fail(`localitiesByArrondissement has ${arrId}, which is not an arrondissement`);
}
for (const id of arrIds) {
  if (!(L.localitiesByArrondissement[id] ?? []).length)
    fail(`arrondissement ${id} has no localities; every arrondissement in the roll has at least one`);
}

// ── 3. No id repeats, and none straddles two communes ──────────────────
const locIds = new Set();
for (const [arrId, names] of Object.entries(L.localitiesByArrondissement)) {
  const seen = new Set();
  names.forEach((name, i) => {
    const id = `${arrId}-${String(i + 1).padStart(3, "0")}`;
    if (locIds.has(id)) fail(`duplicate locality id ${id}`);
    locIds.add(id);
    if (id.slice(0, 6) !== arrId.slice(0, 6))
      fail(`locality ${id} claims a different commune from its arrondissement ${arrId}`);
    if (/[-–]\s*$/.test(name))
      fail(`locality ${id} name "${name}" is cut off`);
    // The same place cannot be listed twice in one arrondissement; when the
    // extraction double-read a wrapped row, that is exactly what it produced.
    const key = fold(name);
    if (seen.has(key)) fail(`${arrId} lists "${name}" twice`);
    seen.add(key);
  });
}

// ── 4. Sparse maps may only name records that exist ────────────────────
for (const [id] of Object.entries(L.localityCoordinates))
  if (!locIds.has(id)) fail(`localityCoordinates names ${id}, which is not a locality`);
for (const [id] of Object.entries(L.sourceNameExceptions))
  if (!locIds.has(id) && !arrIds.has(id)) fail(`sourceNameExceptions names unknown id ${id}`);
for (const [id] of Object.entries(L.aliases))
  if (!locIds.has(id) && !arrIds.has(id)) fail(`aliases names unknown id ${id}`);

// ── 5. Coordinates are sourced, not borrowed ───────────────────────────
//
// The temptation this forbids is handing every locality its commune's
// centroid, which looks like data and is not. A coordinate here came from a
// GeoNames record of that name inside that commune, or it is absent.
const centroids = new Map(communes.map((c) => [c.code, [c.lat, c.lon]]));
for (const [id, [lat, lon]] of Object.entries(L.localityCoordinates)) {
  if (lat < 6.0 || lat > 12.5 || lon < 0.7 || lon > 3.9)
    fail(`locality ${id} at ${lat},${lon} is outside Bénin`);
  const c = centroids.get(id.slice(0, 6));
  if (c && Math.abs(c[0] - lat) < 1e-9 && Math.abs(c[1] - lon) < 1e-9)
    fail(`locality ${id} has been given its commune's centroid, which is not a locality coordinate`);
}

// ── 6. Same-name places, of which there are two kinds ─────────────────
//
// Scoped to the commune deliberately: names recur across the country and a
// national index would resolve Tokpota into whichever one it saw first.
//
// Inside a commune a name legitimately repeats. An arrondissement is normally
// named after its own chief village, so Gounarou contains Gounarou — one place
// at two levels, 234 times, and not ambiguity. The other 32 are true
// namesakes: Koussoucoingou is a village in two different Boukoumbé
// arrondissements. Those are real and cannot be deduped away, so what is
// checked is that they stay distinguishable — no two share an arrondissement —
// and that their number does not drift, since a new one almost certainly means
// a row was read into the wrong arrondissement rather than a village founded.
const slots = new Map();
const claim = (communeCode, key, id) => {
  const slot = `${communeCode}:${fold(key)}`;
  if (!slots.has(slot)) slots.set(slot, new Set());
  slots.get(slot).add(id);
};
for (const [id, name] of L.arrondissements)
  for (const k of [name, ...(L.aliases[id] ?? [])]) claim(id.slice(0, 6), k, id);
for (const [arrId, names] of Object.entries(L.localitiesByArrondissement))
  names.forEach((name, i) => {
    const id = `${arrId}-${String(i + 1).padStart(3, "0")}`;
    for (const k of [name, ...(L.aliases[id] ?? [])]) claim(arrId.slice(0, 6), k, id);
  });

let eponymous = 0;
const namesakes = [];
for (const [slot, set] of slots) {
  if (set.size < 2) continue;
  const ids = [...set];
  const arrs = ids.filter((x) => x.length === 9);
  const locs = ids.filter((x) => x.length > 9);
  if (ids.length === 2 && arrs.length === 1 && locs[0]?.startsWith(`${arrs[0]}-`)) {
    eponymous += 1;
    continue;
  }
  namesakes.push([slot, ids]);
  // The one thing that must hold: a name plus an arrondissement is unique, so
  // a picker grouped by arrondissement can always tell them apart.
  const parents = ids.map((x) => x.slice(0, 9));
  if (new Set(parents).size !== parents.length)
    fail(`"${slot}" names two places in the same arrondissement: ${ids.join(", ")}`);
}
if (eponymous !== 234)
  fail(`${eponymous} arrondissements share a name with their own chief village; 234 do`);
if (namesakes.length !== 32)
  fail(`${namesakes.length} true namesakes inside a commune; 32 is what the cahiers contain — ` +
       `a change means a locality was probably filed under the wrong arrondissement`);

// ── 7. Nothing the app already shipped may stop resolving ──────────────
const LEGACY = {
  "BJ0800": ["Fidjrossè", "Akpakpa", "Cadjèhoun", "Ganhi", "Vedoko", "Zogbo", "Sainte-Rita"],
  "BJ0301": ["Calavi centre", "Womey", "Godomey", "Zogbadjè", "Tankpè", "Akassato"],
  "BJ1008": ["Ouando", "Djègan-Kpèvi", "Houinmè", "Tokpota"],
  "BJ0405": ["Zongo", "Titirou", "Banikanni", "Guéma"],
};
const carried = new Map(L.legacyQuartiers.map((q) => [`${q.communeCode}:${fold(q.name)}`, q]));
for (const [code, names] of Object.entries(LEGACY))
  for (const name of names) {
    const q = carried.get(`${code}:${fold(name)}`);
    if (!q) {
      fail(`"${name}" was selectable in quartiers.js and is no longer carried; listings hold it`);
      continue;
    }
    // The nine INStaD does not list keep their commune and must NOT be handed
    // an arrondissement. Resolving one is the failure mode, not the fix.
    if (q.resolvesTo && !locIds.has(q.resolvesTo) && !arrIds.has(q.resolvesTo))
      fail(`legacy "${name}" resolves to ${q.resolvesTo}, which does not exist`);
  }
const unparented = L.legacyQuartiers.filter((q) => !q.resolvesTo);
if (unparented.length !== 13)
  fail(`${unparented.length} legacy names lack a match in the roll; 13 do — ` +
       `a change here means something was given a parent it has no evidence for`);
for (const q of L.legacyQuartiers)
  if (!communeCodes.has(q.communeCode))
    fail(`legacy "${q.name}" names commune ${q.communeCode}, which does not exist`);

// ── 8. The lookups behave ──────────────────────────────────────────────
// Asserted against a NAMED id, not against each other. Comparing two lookups
// for equality passes when both return nothing, which is exactly what a broken
// index does — dropping the commune from the key silently resolves everything
// to null and every negative test below still passes.
for (const spelling of ["FIDJROSSE CENTRE", "fidjrosse centre", "Fidjrossè-Centre"]) {
  const hit = L.resolveLocality(spelling, "BJ0800");
  if (hit?.id !== "BJ0800-12-004")
    fail(`resolveLocality("${spelling}") gave ${hit?.id ?? "nothing"}, expected BJ0800-12-004`);
}
if (L.resolveLocality("Godomey", "BJ0301")?.id !== "BJ0301-02")
  fail("a legacy name that IS in the roll no longer resolves to it");
if (L.resolveLocalities("Koussoucoingou", "BJ0201").length !== 2)
  fail("the two Boukoumbé villages called Koussoucoingou must both be returned");
if (L.resolveLocalities("Gounarou", "BJ0102")[0]?.id !== "BJ0102-02")
  fail("an eponymous name must resolve to the arrondissement first");
if (L.resolveLocality("Fidjrosse Centre", "BJ0301"))
  fail("resolveLocality leaked a Cotonou quartier into Abomey-Calavi — lookups must be commune-scoped");
if (L.resolveLocality("a place that does not exist", "BJ0800"))
  fail("resolveLocality invented a match; it must return null");
if (!L.searchLocalities("BJ0800", "fidj").length)
  fail("searchLocalities found nothing for a prefix that exists");
if (L.searchLocalities("BJ0800", "").length !== 143)
  fail("an empty query must return the whole commune, not nothing");
const typed = L.localitiesForCommune("BJ0800")[0].localities[0];
if (typed.type !== "quartier")
  fail("Cotonou's units are documented as quartiers de ville and must be typed so");
const elsewhere = L.localitiesForCommune("BJ0301")[0].localities[0];
if (elsewhere.type !== "locality")
  fail(`outside Cotonou no cahier says village or quartier, so the type must stay "locality", got "${elsewhere.type}"`);

if (failures) process.exit(1);
console.log(
  `clean: 546 arrondissements across ${covered.size} communes, ${localityCount} ` +
  `localities, ${Object.keys(L.localityCoordinates).length} sourced coordinates, ` +
  `${L.legacyQuartiers.length} legacy names carried (${unparented.length} deliberately parentless)`,
);
