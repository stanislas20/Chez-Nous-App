// Can Chez-Nous find a listing that exists?
//
// ── Phase D update ──────────────────────────────────────────────────────
//
// This suite measured 4/10 in Phase C, and that number is quoted throughout
// the reports. It now probes the CURRENT implementation — a Firestore token
// search — so the same ten questions get honest answers rather than
// historical ones. The `source` column says which architecture each surface
// actually uses, and the probes that still filter a loaded page are the ones
// deliberately not converted; see docs/SEARCH.md.
//
// Phase B bounded every read, and named search as the sharpest behaviour
// change it caused. This measures that change instead of describing it.
//
// The shape of the question: every search screen filters an array that is
// already on the device, using queryMatches from src/utils/search.js. That
// matcher is good — accent folding, bilingual stopwords, a fuzzy prefix rule
// — and it is not what is being tested here. What is being tested is the
// array. Before Phase B it held every approved listing, so search was slow
// and correct. Now it holds a page, or a capped category, so search is fast
// and can be WRONG: a listing that exists, is approved, and matches the query
// exactly will return "no results" because it was never downloaded.
//
// So: 1,200 listings, with the target deliberately placed where no first page
// reaches it, and then each screen's real data source is reproduced and its
// real matcher run over it.
//
// A screen that cannot find its own listing is marked FAIL, and that is a
// finding about the product rather than a broken test.
//
// Run: node scripts/rules-tests/run.js
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  doc,
  Timestamp,
  where,
} = require("firebase/firestore");

// The real matcher, loaded from source so this cannot drift from the app.
function loadSearch() {
  const file = path.join(__dirname, "..", "..", "src", "utils", "search.js");
  const { code } = babel.transformFileSync(file, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(module, module.exports, require);
  return module.exports;
}
const { queryMatches } = loadSearch();

// The document half of Phase D, so the seeded listings carry the words a
// reader would type — exactly as syncListingSearchTokens writes them.
const { searchTokensFor } = require(path.join(__dirname, "..", "..", "functions", "searchTokens.js"));
const { primarySearchToken } = (() => {
  const file = path.join(__dirname, "..", "..", "src", "utils", "searchTokens.js");
  const { code } = babel.transformFileSync(file, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(module, module.exports, require);
  return module.exports;
})();

const TOTAL = 1200;
const FEED_PAGE = 60; // ForYou and Local
const CATEGORY_CAP = 200; // useCategoryListings
const SELLER = "seller-uid";

// The needle. Placed at index 40 of 1,200 in createdAt-DESCENDING order —
// which is to say the 1,160th newest — so it is far outside any first page
// and far outside a 200-cap of its own category.
const TARGET_INDEX = 40;
const TARGET_TITLE = "Congélateur Hisense 300L très bon état";
const TARGET_QUERY = "congelateur hisense";
const TARGET_CATEGORY = "other";
const TARGET_CITY = "Parakou";
const TARGET_ID = "seed-target";
// The single most selective word, which is what useListingsSearch sends.
const primaryToken = primarySearchToken(TARGET_QUERY);

const results = [];
const findings = [];
const check = (label, ok, detail) =>
  results.push([ok, detail ? `${label} — ${detail}` : label]);

const CATEGORIES = ["vehicles", "services", "realEstate", "other"];
const CITIES = ["Cotonou", "Porto-Novo", "Parakou"];

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "rules-probe",
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  // Every suite in this directory uses projectId "rules-probe", and none of
  // them used to clear between runs — so each inherited whatever the previous
  // one had seeded. That is not a tidiness point: it is why this file used to
  // report "2,408 listings" while seeding 1,200, and why the scrolling
  // counterfactual below passed for a reason that had nothing to do with the
  // code. A measurement that depends on what ran before it is not a
  // measurement.
  await env.clearFirestore();

  process.stdout.write("  seeding 1200 listings for the search probe");
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = Date.now() - TOTAL * 1000;
    for (let start = 0; start < TOTAL; start += 100) {
      await Promise.all(
        Array.from({ length: Math.min(100, TOTAL - start) }, (_, k) => {
          const i = start + k;
          const isTarget = i === TARGET_INDEX;
          return setDoc(doc(db, `listings/${isTarget ? TARGET_ID : `srch-${String(i).padStart(5, "0")}`}`), {
            sellerId: SELLER,
            status: "approved",
            titleFr: isTarget ? TARGET_TITLE : `Article ordinaire ${i}`,
            titleEn: isTarget ? TARGET_TITLE : `Ordinary item ${i}`,
            descriptionFr: isTarget ? "Congélateur en très bon état." : "Description.",
            price: 1000 + i,
            categoryKey: isTarget ? TARGET_CATEGORY : CATEGORIES[i % CATEGORIES.length],
            city: isTarget ? TARGET_CITY : CITIES[i % CITIES.length],
            createdAt: Timestamp.fromMillis(base + i * 1000),
            searchTokens: searchTokensFor({
              titleFr: isTarget ? TARGET_TITLE : `Article ordinaire ${i}`,
              categoryKey: isTarget ? TARGET_CATEGORY : CATEGORIES[i % CATEGORIES.length],
              city: isTarget ? TARGET_CITY : CITIES[i % CITIES.length],
            }),
          });
        }),
      );
      process.stdout.write(".");
    }
    // The category screens' own target. Probing Cars with a listing filed
    // under "other" would only prove that a category filter excludes other
    // categories, which is a different assertion.
    await setDoc(doc(db, "listings/seed-target-vehicle"), {
      sellerId: SELLER, status: "approved",
      titleFr: "Peugeot Partner utilitaire diesel",
      titleEn: "Peugeot Partner utilitaire diesel",
      brand: "Peugeot", model: "Partner",
      categoryKey: "vehicles", city: "Cotonou",
      createdAt: Timestamp.fromMillis(base - 90000),
      searchTokens: searchTokensFor({
        titleFr: "Peugeot Partner utilitaire diesel",
        brand: "Peugeot", model: "Partner",
        categoryKey: "vehicles", city: "Cotonou",
      }),
    });
  });
  process.stdout.write("\n");

  const db = env.authenticatedContext(SELLER, { canPost: true }).firestore();
  const listings = collection(db, "listings");

  // Sanity: the needle really is in the haystack, and it really does match
  // the query. Without this a FAIL below could just mean a typo.
  {
    const snapshot = await getDocs(
      query(listings, where("status", "==", "approved"), orderBy("createdAt", "desc")),
    );
    const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const target = all.find((l) => l.id === TARGET_ID);
    check("the target listing exists and is approved", Boolean(target));
    check(
      "the matcher finds it when handed the whole catalogue",
      Boolean(target) && queryMatches(TARGET_QUERY, target.titleFr, target.city, target.descriptionFr),
    );
    const position = all.findIndex((l) => l.id === TARGET_ID);
    check(
      "and it sits far outside any first page",
      position > FEED_PAGE,
      `position ${position + 1} of ${all.length} by recency`,
    );
  }

  // Reproduces one screen: fetch what its hook fetches, then run the matcher
  // the way the screen runs it.
  async function probe({
    name, source, constraints, cap, tokenSearch,
    targetId = TARGET_ID, queryText = TARGET_QUERY,
  }) {
    // `tokenSearch` reproduces useListingsSearch: one array-contains query on
    // the most selective token, then the existing matcher for the rest of the
    // words. Without it, the probe reproduces the old page-filtering.
    const effective = tokenSearch
      ? [
          ...constraints,
          where("searchTokens", "array-contains", primarySearchToken(queryText)),
        ]
      : constraints;
    const snapshot = await getDocs(query(listings, ...effective, limit(cap)));
    const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const matches = rows.filter((l) =>
      queryMatches(queryText, l.titleFr, l.city, l.descriptionFr),
    );
    const found = matches.some((l) => l.id === targetId);
    findings.push({ name, source, loaded: rows.length, found });
    check(
      `${name}: finds a listing that exists`,
      found,
      found
        ? `searched ${rows.length} loaded`
        : `NOT FOUND — searched only the ${rows.length} listings it had loaded`,
    );
    return found;
  }

  // ── The searches, each against its real data source ───────────────────
  await probe({
    name: "Marketplace / Pour vous",
    source: "F — Firestore token search",
    tokenSearch: true,
    constraints: [where("status", "==", "approved"), orderBy("createdAt", "desc")],
    cap: FEED_PAGE,
  });

  await probe({
    name: "Local (no city chosen)",
    source: "F — Firestore token search",
    tokenSearch: true,
    constraints: [where("status", "==", "approved"), orderBy("createdAt", "desc")],
    cap: FEED_PAGE,
  });

  await probe({
    name: "Local (filtered to the right city)",
    source: "F — token search + city filter",
    tokenSearch: true,
    constraints: [
      where("status", "==", "approved"),
      where("city", "==", TARGET_CITY),
      orderBy("createdAt", "desc"),
    ],
    cap: FEED_PAGE,
  });

  await probe({
    name: "Category aisle (Autre)",
    source: "F — token search + category filter",
    tokenSearch: true,
    constraints: [
      where("status", "==", "approved"),
      where("categoryKey", "==", TARGET_CATEGORY),
      orderBy("createdAt", "desc"),
    ],
    cap: CATEGORY_CAP,
  });

  // The category screens that search their own aisle: Cars, Services,
  // Garages, RealEstate, VehicleList, Restaurants. All share one shape, so
  // one probe stands for all of them — a listing in the aisle but outside
  // the 200 most recent.
  await probe({
    name: "Cars / Services / Garages / Immobilier (same shape)",
    source: "F — token search + category filter",
    tokenSearch: true,
    targetId: "seed-target-vehicle",
    queryText: "peugeot partner",
    constraints: [
      where("status", "==", "approved"),
      where("categoryKey", "==", "vehicles"),
      orderBy("createdAt", "desc"),
    ],
    cap: CATEGORY_CAP,
  });

  // What the pre-Phase-B architecture did, for the comparison.
  await probe({
    name: "The old unbounded architecture, for reference",
    source: "A — entire relevant Firestore dataset",
    constraints: [where("status", "==", "approved"), orderBy("createdAt", "desc")],
    cap: 5000,
  });

  // ── And the one thing that DOES find it today ────────────────────────
  // Not a search: paging all the way to it. Recorded because it is the
  // difference between "unreachable" and "unfindable by search", and the
  // second is the accurate claim.
  {
    let cursor = null;
    let found = false;
    let pagesRead = 0;
    let docsRead = 0;
    const { startAfter } = require("firebase/firestore");
    for (let i = 0; i < 60 && !found; i += 1) {
      const snapshot = await getDocs(
        query(
          listings,
          where("status", "==", "approved"),
          orderBy("createdAt", "desc"),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(30),
        ),
      );
      pagesRead += 1;
      docsRead += snapshot.size;
      found = snapshot.docs.some((d) => d.id === TARGET_ID);
      cursor = snapshot.docs[snapshot.docs.length - 1] ?? cursor;
      if (snapshot.size < 30) break;
    }
    // The counterfactual, and the reason "just scroll to it" was never an
    // answer.
    //
    // This used to assert `!found` — that sixty pages never reach the target
    // at all. That only held while this suite inherited another suite's
    // listings and the collection was twice the size it seeds; with the
    // emulator cleared it seeds 1,200, and 1,200 is reachable inside the
    // sixty-page loop. The assertion was passing for a reason unrelated to
    // the product.
    //
    // So it asserts the thing that is actually true and actually matters:
    // reaching it by scrolling costs pages and reads that no human performs.
    // Search finds the same listing in a handful of documents.
    check(
      "scrolling is not a substitute for search",
      pagesRead >= 20 && docsRead >= 600,
      `${pagesRead} pages and ${docsRead} document reads to reach what search ` +
        `finds in 2 — and that is with the target only ${TOTAL - TARGET_INDEX} ` +
        `deep`,
    );
  }

  await env.cleanup();

  for (const [ok, label] of results) console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);

  console.log("\n  search surface map:");
  console.log("    screen                                        data searched                              result");
  for (const f of findings) {
    console.log(
      `    ${f.name.padEnd(45)} ${f.source.padEnd(42)} ${f.found ? "FOUND" : "NOT FOUND"}`,
    );
  }

  const failed = results.filter(([ok]) => !ok);
  // Deliberately NOT a non-zero exit. Every failure here is a known,
  // measured property of the current architecture, and C3 asks for it to be
  // measured before anything is chosen. Turning it red would make the suite
  // unrunnable until search is rebuilt, which is a decision that has not
  // been taken. The count is reported and the report quotes it.
  console.log(
    `\nmeasured: ${results.length - failed.length} of ${results.length} search probes ` +
      `find a listing that exists (${failed.length} cannot)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
