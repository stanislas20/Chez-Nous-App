// What the search metadata costs every ordinary listing read.
//
// Firestore bills per document, not per byte, so this is not a read-cost
// question — it is bandwidth on a metered mobile connection in Bénin and
// parse time on a low-end Android phone. Neither shows up in a Firebase bill
// and both show up on the device.
//
// The post-Phase-E re-audit measured 91 pairs and 1,404 bytes per listing:
// a 30-listing feed page carrying 45 KB of metadata the UI never reads, an
// 11x increase over Phase D. Phase F regrouped the pairs by role, which made
// them both more correct and fewer. This prints the figure so a future
// change to PAIR_SUBJECT_MAX cannot quietly undo that.
//
// Run: node scripts/check-search-payload.js
const path = require("path");
const S = require(path.join(__dirname, "..", "functions", "searchTokens.js"));

// A ceiling, not an average: the caps are what bound the worst case.
const MAX_PAIRS =
  (S.PAIR_SUBJECT_MAX * (S.PAIR_SUBJECT_MAX - 1)) / 2 +
  S.PAIR_SUBJECT_MAX * S.PAIR_PLACE_MAX +
  (S.PAIR_PLACE_MAX * (S.PAIR_PLACE_MAX - 1)) / 2;

const FIXTURES = [
  ["vehicle, ordinary title", {
    titleFr: "Toyota Corolla 2015 essence automatique",
    brand: "Toyota", model: "Corolla", categoryKey: "vehicles",
    city: "Cotonou", quartier: "Akpakpa",
    descriptionFr: "Vehicule en tres bon etat, papiers a jour, premiere main.",
  }],
  ["vehicle, long title", {
    titleFr: "Toyota Corolla 2015 essence automatique climatisation full option premiere main papiers a jour",
    brand: "Toyota", model: "Corolla", categoryKey: "vehicles",
    city: "Parakou", quartier: "Zongo",
    descriptionFr: "Vehicule en tres bon etat.",
  }],
  ["property", {
    titleFr: "Terrain 500m2 titre foncier a vendre",
    categoryKey: "realEstate", city: "Calavi", quartier: "Tankpe",
    descriptionFr: "Terrain viabilise, acces goudron.",
  }],
];

const bytes = (a) => a.reduce((n, s) => n + Buffer.byteLength(s) + 1, 0);
const failures = [];

console.log(
  `caps: PAIR_SUBJECT_MAX=${S.PAIR_SUBJECT_MAX} PAIR_PLACE_MAX=${S.PAIR_PLACE_MAX} ` +
    `-> at most ${MAX_PAIRS} pairs (rules cap ${S.SEARCH_PAIR_MAX})\n`,
);

// The ceiling the rules enforce has to be above what the writers can produce,
// or a legitimate listing is refused.
if (MAX_PAIRS > S.SEARCH_PAIR_MAX) {
  failures.push(
    `the groups can produce ${MAX_PAIRS} pairs but firestore.rules caps ` +
      `searchPairs at ${S.SEARCH_PAIR_MAX} — a legitimate listing would be refused`,
  );
}

// A regression guard. Phase E shipped 91 pairs / ~1.4 KB and the re-audit
// called it bloat; Phase F must not drift back above it.
const PAIR_BUDGET = 80;

let worstPairs = 0;
let worstBytes = 0;
console.log("  fixture                     tokens  pairs   token B   pair B   total B");
for (const [name, listing] of FIXTURES) {
  const t = S.searchTokensFor(listing);
  const p = S.searchPairsFor(listing);
  const tb = bytes(t);
  const pb = bytes(p);
  worstPairs = Math.max(worstPairs, p.length);
  worstBytes = Math.max(worstBytes, tb + pb);
  console.log(
    `  ${name.padEnd(26)} ${String(t.length).padStart(6)} ${String(p.length).padStart(6)} ` +
      `${String(tb).padStart(9)} ${String(pb).padStart(8)} ${String(tb + pb).padStart(9)}`,
  );
}

console.log("\n  page cost, worst fixture (metadata the UI never reads):");
for (const page of [30, 60, 200]) {
  console.log(
    `    ${String(page).padStart(3)} listings -> ${((worstBytes * page) / 1024).toFixed(0).padStart(4)} KB`,
  );
}

if (worstPairs > PAIR_BUDGET) {
  failures.push(
    `a fixture produced ${worstPairs} pairs, over the ${PAIR_BUDGET} budget. ` +
      `Phase E's 91 was measured as an 11x payload increase on every feed page; ` +
      `do not drift back to it without deciding to.`,
  );
}

if (failures.length) {
  console.error("\ncheck-search-payload FAILED");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nworst fixture: ${worstPairs} pairs, ${worstBytes} bytes (budget ${PAIR_BUDGET} pairs)`);
