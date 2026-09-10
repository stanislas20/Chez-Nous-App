// Can Chez-Nous find a listing that exists?
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
          });
        }),
      );
      process.stdout.write(".");
    }
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
  async function probe({ name, source, constraints, cap }) {
    const snapshot = await getDocs(query(listings, ...constraints, limit(cap)));
    const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const matches = rows.filter((l) =>
      queryMatches(TARGET_QUERY, l.titleFr, l.city, l.descriptionFr),
    );
    const found = matches.some((l) => l.id === TARGET_ID);
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
    source: "B — current paginated page only (60)",
    constraints: [where("status", "==", "approved"), orderBy("createdAt", "desc")],
    cap: FEED_PAGE,
  });

  await probe({
    name: "Local (no city chosen)",
    source: "B — current paginated page only (60)",
    constraints: [where("status", "==", "approved"), orderBy("createdAt", "desc")],
    cap: FEED_PAGE,
  });

  await probe({
    name: "Local (filtered to the right city)",
    source: "B — paginated page, city pushed into the query",
    constraints: [
      where("status", "==", "approved"),
      where("city", "==", TARGET_CITY),
      orderBy("createdAt", "desc"),
    ],
    cap: FEED_PAGE,
  });

  await probe({
    name: "Category aisle (Autre)",
    source: "C — capped category dataset (200)",
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
    source: "C — capped category dataset (200)",
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
    check(
      "scrolling far enough does eventually reach it",
      found,
      `${pagesRead} pages and ${docsRead} document reads of scrolling`,
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
