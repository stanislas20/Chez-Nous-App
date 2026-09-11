// Datasets built specifically to break candidate selection.
//
// The independent audit disproved Phase D's search by constructing the case
// Phase D's own tests had not: decoys that share the token the query would be
// sent as. "iphone 15" sent "iphone", the newest 120 iPhones came back, none
// of them was an iPhone 15, and the screen said "no results" with two exact
// matches in the database.
//
// Phase D's suite could not have caught it. Its decoys did not carry the
// target's chosen token, so the window was never full of near-misses. That is
// the difference between a test that describes a design and a test that
// attacks it, and it is why this file exists alongside search.test.js rather
// than replacing it.
//
// Every case here reports the documents it read, because "correct" and
// "bounded" are two different claims and the audit is entitled to both.
//
// Run: node scripts/rules-tests/run.js
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  doc,
  Timestamp,
  where,
} = require("firebase/firestore");

const root = path.join(__dirname, "..", "..");
const {
  searchTokensFor,
  searchPairsFor,
  querySearchTokens,
  queryPairCandidates,
} = require(path.join(root, "functions", "searchTokens.js"));

// The hook's constants, read out of the hook rather than copied, so a change
// there is a change here and this suite cannot quietly stop testing the real
// bounds.
function hookConstants() {
  const src = fs.readFileSync(
    path.join(root, "src", "hooks", "useListingsSearch.js"),
    "utf8",
  );
  const number = (name) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
    if (!m) throw new Error(`useListingsSearch.js no longer defines ${name}`);
    return Number(m[1]);
  };
  return {
    SEARCH_FETCH: number("SEARCH_FETCH"),
    SEARCH_RESULTS: number("SEARCH_RESULTS"),
    MAX_COUNTED_CANDIDATES: number("MAX_COUNTED_CANDIDATES"),
  };
}
const { SEARCH_FETCH, SEARCH_RESULTS, MAX_COUNTED_CANDIDATES } = hookConstants();

let passed = 0;
const failures = [];
function ok(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// A faithful reproduction of what the hook does, including the counting step.
// Returns the results and the reads it took to get them.
async function search(db, text, filters = []) {
  const words = querySearchTokens(text);
  const listings = collection(db, "listings");
  const scope = [where("status", "==", "approved"), ...filters];

  if (words.length === 0) {
    return { rows: [], docsRead: 0, counts: 0, total: null, complete: true };
  }

  const cheapest = async (candidates) => {
    const counted = await Promise.all(
      candidates.map(async (candidate) => {
        const snap = await getCountFromServer(
          query(listings, ...scope, where(candidate.field, "array-contains", candidate.value)),
        );
        return { candidate, count: snap.data().count };
      }),
    );
    return counted.reduce((a, b) => (b.count < a.count ? b : a));
  };

  const pairPlan =
    words.length >= 2
      ? queryPairCandidates(text)
          .slice(0, MAX_COUNTED_CANDIDATES)
          .map((value) => ({ field: "searchPairs", value }))
      : [];
  const tokenPlan = words
    .slice(0, MAX_COUNTED_CANDIDATES)
    .map((value) => ({ field: "searchTokens", value }));

  // The Phase F fallback: a pair that matches nothing may simply not have
  // been built, so the search retries on the rarest single token rather than
  // reporting an empty, complete result.
  let counts = 0;
  let best = null;
  if (pairPlan.length) {
    best = await cheapest(pairPlan);
    counts += pairPlan.length;
  }
  let viaFallback = false;
  if (!best || best.count === 0) {
    best = await cheapest(tokenPlan);
    counts += tokenPlan.length;
    viaFallback = words.length >= 2;
  }

  const snapshot = await getDocs(
    query(
      listings,
      ...scope,
      where(best.candidate.field, "array-contains", best.candidate.value),
      orderBy("createdAt", "desc"),
      limit(SEARCH_FETCH),
    ),
  );
  const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  const needsLocalPass = viaFallback || words.length > 2 || pairPlan.length === 0;
  const narrowed =
    needsLocalPass && words.length > 1
      ? rows.filter((r) => {
          const t = r.searchTokens ?? [];
          return words.every((w) => t.includes(w));
        })
      : rows;

  const exhaustive = best.count <= SEARCH_FETCH;
  const visible = narrowed.slice(0, SEARCH_RESULTS);
  return {
    rows: visible,
    docsRead: snapshot.size,
    counts,
    total: exhaustive && needsLocalPass ? narrowed.length : best.count,
    totalIsExact: !needsLocalPass,
    complete: exhaustive && narrowed.length <= SEARCH_RESULTS,
    chosen: best.candidate.value,
    viaFallback,
  };
}

// Ground truth, computed without the search path, so "should have been found"
// is never the search's own opinion.
async function trueMatches(db, text, filters = []) {
  const words = querySearchTokens(text);
  const snap = await getDocs(
    query(collection(db, "listings"), where("status", "==", "approved"), ...filters),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => words.every((w) => (r.searchTokens ?? []).includes(w)));
}

const BASE = Date.UTC(2024, 0, 1);
function listing(id, fields, minutesOld) {
  const data = {
    status: "approved",
    city: "Cotonou",
    categoryKey: "other",
    createdAt: Timestamp.fromMillis(BASE + (100000 - minutesOld) * 60000),
    ...fields,
  };
  data.searchTokens = searchTokensFor(data);
  data.searchPairs = searchPairsFor(data);
  return [id, data];
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "cheznous-search-adversarial",
    firestore: { host: "127.0.0.1", port: 8080 },
  });
  await env.clearFirestore();

  const docs = [];

  // 1-3. Three brand families, each 500 strong, each hiding one target far
  //      down the recency order. 400+ newer decoys all carry the word the old
  //      implementation would have chosen.
  const families = [
    { word: "iPhone", decoy: "iPhone 11 occasion", target: "iPhone 15 Pro Max", q: "iphone 15" },
    { word: "Toyota", decoy: "Toyota Corolla", target: "Toyota RAV4 2018", q: "toyota rav4" },
    { word: "Samsung", decoy: "Samsung Galaxy A12", target: "Samsung Galaxy Z Fold", q: "samsung fold" },
  ];
  families.forEach((f, fi) => {
    // The target is the OLDEST of its family: 499 newer listings share its
    // first word.
    docs.push(listing(`target-${fi}`, { titleFr: f.target }, 0));
    for (let i = 0; i < 499; i += 1) {
      docs.push(listing(`decoy-${fi}-${i}`, { titleFr: `${f.decoy} ${i}` }, i + 1));
    }
  });

  // 4. Two-character terms that are real products.
  docs.push(listing("two-hp", { titleFr: "HP 15 ordinateur portable" }, 5));
  docs.push(listing("two-lg", { titleFr: "TV LG 43 pouces" }, 6));
  docs.push(listing("two-x5", { titleFr: "BMW X5 xDrive" }, 7));

  // 5. Accents.
  docs.push(listing("acc-1", { titleFr: "Congélateur Hisense 300L", city: "Parakou" }, 8));
  docs.push(listing("acc-2", { titleFr: "Terrain à vendre", city: "Ouémé" }, 9));

  // 6. Multi-word trade search.
  docs.push(
    listing("trade-1", { titleFr: "Mécanicien auto expérimenté", city: "Cotonou", categoryKey: "services" }, 10),
  );

  // 8/9. Category and city filtering.
  docs.push(listing("cat-veh", { titleFr: "Peugeot Partner utilitaire", categoryKey: "vehicles", city: "Cotonou" }, 11));
  docs.push(listing("cat-oth", { titleFr: "Peugeot Partner pièces", categoryKey: "other", city: "Porto-Novo" }, 12));

  // ── Phase F: the long-title cases the re-audit used ──────────────────
  //
  // These are the ones Phase E could not find. A title long enough to push
  // the location out of the pair window made "product + place" return zero
  // while reporting complete — the most ordinary query a classifieds site
  // gets. The titles here are all inside the 120-character rule.
  const W = (n) => Array.from({ length: n }, (_, i) => `mot${i}`).join(" ");
  docs.push(listing("long-10", {
    titleFr: `Corolla ${W(9)}`, brand: "Toyota", model: "Corolla",
    categoryKey: "vehicles", city: "Parakou", quartier: "Zongo",
  }, 20));
  docs.push(listing("long-11", {
    titleFr: `Terrain ${W(10)}`, categoryKey: "realEstate", city: "Calavi", quartier: "Tankpe",
  }, 21));
  docs.push(listing("long-20", {
    titleFr: `Appartement ${W(19)}`.slice(0, 118),
    categoryKey: "realEstate", city: "Cotonou", quartier: "Fidjrosse",
  }, 22));
  docs.push(listing("long-20-model", {
    titleFr: `Voiture ${W(19)}`.slice(0, 118),
    brand: "Peugeot", model: "Partner", categoryKey: "vehicles", city: "Bohicon",
  }, 23));

  // 10. A target buried beyond 2,000 listings.
  docs.push(listing("deep-target", { titleFr: "Groupe électrogène Kipor silencieux", city: "Bohicon" }, 0));
  for (let i = 0; i < 2100; i += 1) {
    docs.push(listing(`filler-${i}`, { titleFr: `Chaise plastique ${i}` }, i + 1));
  }

  // Something pending and something rejected carrying the same words, to
  // prove visibility is still enforced by the query rather than by luck.
  docs.push([
    "hidden-pending",
    { ...listing("x", { titleFr: "iPhone 15 Pro Max" }, 0)[1], status: "pending" },
  ]);
  docs.push([
    "hidden-rejected",
    { ...listing("x", { titleFr: "Toyota RAV4 2018" }, 0)[1], status: "rejected" },
  ]);

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (let i = 0; i < docs.length; i += 400) {
      await Promise.all(
        docs.slice(i, i + 400).map(([id, data]) => setDoc(doc(db, "listings", id), data)),
      );
    }
  });
  console.log(`  seeded ${docs.length} listings\n`);

  const db = env.unauthenticatedContext().firestore();

  // ── 1-3. The audit's exact failures ──────────────────────────────────
  for (const [fi, f] of families.entries()) {
    const truth = await trueMatches(db, f.q);
    const res = await search(db, f.q);
    const found = res.rows.some((r) => r.id === `target-${fi}`);
    ok(
      `"${f.q}" finds the target buried under 499 newer listings sharing "${f.word.toLowerCase()}"`,
      found && truth.length > 0,
      `${truth.length} in DB, ${res.rows.length} returned, ${res.docsRead} docs read + ${res.counts} count(s), pair "${res.chosen}"`,
    );
  }

  // ── 4. Two-character product terms ───────────────────────────────────
  for (const [q, id] of [
    ["hp 15", "two-hp"],
    ["tv lg", "two-lg"],
    ["bmw x5", "two-x5"],
    ["lg 43", "two-lg"],
  ]) {
    const res = await search(db, q);
    ok(
      `two-character term: "${q}"`,
      res.rows.some((r) => r.id === id),
      `${res.rows.length} result(s), ${res.docsRead} docs read`,
    );
  }

  // ── 5. Accents ───────────────────────────────────────────────────────
  for (const q of ["congélateur hisense", "congelateur hisense", "CONGELATEUR Hisense"]) {
    const res = await search(db, q);
    ok(`accent folding: "${q}"`, res.rows.some((r) => r.id === "acc-1"), `${res.docsRead} docs read`);
  }
  for (const q of ["terrain Ouémé", "terrain oueme"]) {
    const res = await search(db, q);
    ok(`accent folding on a city: "${q}"`, res.rows.some((r) => r.id === "acc-2"), `${res.docsRead} docs read`);
  }

  // ── 6. Multi-word ────────────────────────────────────────────────────
  {
    const q = "mecanicien auto cotonou";
    const res = await search(db, q);
    ok(
      `three words: "${q}"`,
      res.rows.some((r) => r.id === "trade-1"),
      `${res.rows.length} result(s), ${res.docsRead} docs read + ${res.counts} counts, pair "${res.chosen}"`,
    );
  }

  // ── 7. Zero results really means zero ────────────────────────────────
  {
    const res = await search(db, "helicoptere submersible");
    ok("a query for something absent returns nothing and reads nothing", res.rows.length === 0 && res.docsRead === 0, `${res.docsRead} docs read`);
  }

  // ── 8/9. Category and city filters ───────────────────────────────────
  {
    const res = await search(db, "peugeot partner", [where("categoryKey", "==", "vehicles")]);
    ok(
      "category filter keeps the match in that category and excludes the other",
      res.rows.some((r) => r.id === "cat-veh") && !res.rows.some((r) => r.id === "cat-oth"),
      `${res.rows.length} result(s), ${res.docsRead} docs read`,
    );
  }
  {
    const res = await search(db, "peugeot partner", [where("city", "==", "Porto-Novo")]);
    ok(
      "city filter keeps the match in that city and excludes the other",
      res.rows.some((r) => r.id === "cat-oth") && !res.rows.some((r) => r.id === "cat-veh"),
      `${res.rows.length} result(s), ${res.docsRead} docs read`,
    );
  }

  // ── 10. Buried beyond 2,000 ──────────────────────────────────────────
  {
    const res = await search(db, "groupe electrogene kipor");
    ok(
      "a target buried beyond 2,000 listings is still found",
      res.rows.some((r) => r.id === "deep-target"),
      `${res.rows.length} result(s), ${res.docsRead} docs read of ${docs.length} seeded`,
    );
  }

  // ── Phase F: long titles must not hide the location ──────────────────
  for (const [q, id, why] of [
    ["corolla zongo", "long-10", "10-word title + quartier"],
    ["corolla parakou", "long-10", "10-word title + city"],
    ["corolla parakou zongo", "long-10", "three words, one past the window"],
    ["terrain calavi", "long-11", "11-word title + city"],
    ["terrain tankpe", "long-11", "11-word title + quartier"],
    ["appartement cotonou", "long-20", "20-word title + city"],
    ["appartement fidjrosse", "long-20", "20-word title + quartier"],
    ["voiture partner", "long-20-model", "20-word title + model"],
    ["partner bohicon", "long-20-model", "model + city on a 20-word title"],
  ]) {
    const truth = await trueMatches(db, q);
    const r = await search(db, q);
    const found = r.rows.some((x) => x.id === id);
    ok(
      `${why}: "${q}"`,
      found && truth.length > 0,
      `${truth.length} in DB, ${r.rows.length} returned, ${r.docsRead} docs read` +
        `, total=${r.total} complete=${r.complete}` +
        (r.viaFallback ? " (token fallback)" : ` pair "${r.chosen}"`),
    );
  }

  // The honesty rule: an empty result may only claim completeness when the
  // search actually proved it. This is what Phase E got wrong — it returned
  // total=0 complete=true on a listing it simply could not see.
  {
    const r = await search(db, "corolla zongo");
    ok(
      "a search that finds something never reports itself empty-and-complete",
      !(r.rows.length === 0 && r.complete === true && r.total === 0),
      `rows=${r.rows.length} total=${r.total} complete=${r.complete}`,
    );
  }

  // ── Visibility still holds ───────────────────────────────────────────
  {
    const res = await search(db, "iphone 15");
    ok("a pending listing with matching words stays hidden", !res.rows.some((r) => r.id === "hidden-pending"));
  }
  {
    const res = await search(db, "toyota rav4");
    ok("a rejected listing with matching words stays hidden", !res.rows.some((r) => r.id === "hidden-rejected"));
  }

  // ── The cap is honest rather than silent ─────────────────────────────
  {
    const res = await search(db, "toyota corolla");
    ok(
      "a query with more matches than the page says so instead of truncating quietly",
      res.total > SEARCH_RESULTS && res.complete === false,
      `total ${res.total}, showing ${res.rows.length}, complete=${res.complete}`,
    );
  }
  {
    const res = await search(db, "iphone 15");
    ok(
      "a query whose matches fit the page reports itself complete",
      res.complete === true,
      `total ${res.total}, complete=${res.complete}`,
    );
  }

  // ── Boundedness ──────────────────────────────────────────────────────
  {
    const res = await search(db, "chaise plastique");
    ok(
      "even the widest query reads no more than the fetch cap",
      res.docsRead <= SEARCH_FETCH,
      `${res.docsRead} docs read (cap ${SEARCH_FETCH}) of ${docs.length} seeded`,
    );
  }

  await env.cleanup();

  console.log(`\nclean: ${passed} adversarial search cases over ${docs.length} listings`);
  if (failures.length) {
    console.error(`\n${failures.length} FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
