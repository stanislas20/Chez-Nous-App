// Phase C's failure test, repeated against the fix.
//
// Same dataset shape, same buried target, same ten surfaces. Phase C measured
// 4/10. This measures what Option A actually achieves, and it measures the
// cost of achieving it — because "search works now" is worthless if the way it
// works is by downloading the catalogue again.
//
// It also runs the backfill, because the back catalogue is most of a real
// database and a search that only finds listings published after Tuesday is
// not a working search.
//
// Run: node scripts/rules-tests/run.js
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const admin = require(path.join(ROOT, "functions", "node_modules", "firebase-admin"));
const { searchTokensFor } = require(path.join(ROOT, "functions", "searchTokens.js"));

function loadEsm(relative) {
  const { code } = babel.transformFileSync(path.join(ROOT, relative), {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(module, module.exports, require);
  return module.exports;
}
const { primarySearchToken, querySearchTokens } = loadEsm("src/utils/searchTokens.js");
const { queryMatches } = loadEsm("src/utils/search.js");

// Phase C's numbers exactly: 2,408 listings, target at position 2,321 by
// recency. 2,408 is what the shared emulator held at that point; here it is
// seeded deliberately so the comparison is like for like.
const TOTAL = 2408;
const TARGET_POSITION = 2321; // 1-based, by createdAt DESC
const TARGET_ID = "d-target";
const TARGET_TITLE = "Congélateur Hisense 300L très bon état";
const TARGET_CATEGORY = "other";
const TARGET_CITY = "Parakou";

// The three ways a reader might type it.
const QUERIES = {
  exact: "Congélateur Hisense",
  unaccented: "congelateur hisense",
  shouting: "CONGELATEUR HISENSE",
};

const FEED_PAGE = 60;
const CATEGORY_CAP = 200;
const SEARCH_FETCH = 120; // SEARCH_FETCH in useListingsSearch

const CATEGORIES = ["vehicles", "services", "realEstate", "other"];
const CITIES = ["Cotonou", "Porto-Novo", "Parakou"];

const results = [];
const findings = [];
const measurements = {};
const check = (label, ok, detail) =>
  results.push([ok, detail ? `${label} — ${detail}` : label]);

async function main() {
  for (const variable of ["FIRESTORE_EMULATOR_HOST"]) {
    if (!process.env[variable]) {
      console.error(`${variable} is not set — refusing to run.`);
      process.exit(1);
    }
  }

  const env = await initializeTestEnvironment({
    projectId: "rules-probe",
    firestore: {
      rules: fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  // Seeded WITHOUT searchTokens, deliberately: this is the back catalogue as
  // it exists today, and the backfill below is what has to make it findable.
  process.stdout.write(`  seeding ${TOTAL} listings with no tokens`);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = Date.now() - TOTAL * 1000;
    // Position 2,321 of 2,408 counting DOWN from newest means index
    // TOTAL - TARGET_POSITION in ascending-createdAt terms.
    const targetIndex = TOTAL - TARGET_POSITION;
    for (let start = 0; start < TOTAL; start += 200) {
      await Promise.all(
        Array.from({ length: Math.min(200, TOTAL - start) }, (_, k) => {
          const i = start + k;
          const isTarget = i === targetIndex;
          return setDoc(doc(db, `listings/${isTarget ? TARGET_ID : `d-${String(i).padStart(5, "0")}`}`), {
            sellerId: "seller-uid",
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
    // The category screens' own buried target. The first one is in "other";
    // probing Cars with it would only prove that a category filter excludes
    // other categories, which is asserted separately below.
    await setDoc(doc(db, "listings/d-target-vehicle"), {
      sellerId: "seller-uid", status: "approved",
      titleFr: "Peugeot Partner utilitaire diesel",
      titleEn: "Peugeot Partner utilitaire diesel",
      brand: "Peugeot", model: "Partner",
      categoryKey: "vehicles", city: "Cotonou",
      // Older than every seeded listing, so it is behind all 2,408 of them
      // and far outside the 200-cap of its own category.
      createdAt: Timestamp.fromMillis(base - 60000),
    });

    // Two listings that must never be findable, whatever their tokens say.
    await setDoc(doc(db, "listings/d-pending"), {
      sellerId: "other-seller", status: "pending",
      titleFr: TARGET_TITLE, categoryKey: TARGET_CATEGORY, city: TARGET_CITY,
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, "listings/d-rejected"), {
      sellerId: "other-seller", status: "rejected",
      titleFr: TARGET_TITLE, categoryKey: TARGET_CATEGORY, city: TARGET_CITY,
      createdAt: Timestamp.now(),
    });
  });
  process.stdout.write("\n");

  // ── The backfill, run for real ────────────────────────────────────────
  // Not simulated: this is scripts/backfillSearchTokens.js against the
  // emulator, which is what D3 asks for.
  process.stdout.write("  running the backfill");
  admin.initializeApp({ projectId: "rules-probe" });
  const backfill = require(path.join(ROOT, "scripts", "backfillSearchTokens.js"));
  const before = Date.now();
  const firstRun = await backfill.main();
  const backfillSeconds = ((Date.now() - before) / 1000).toFixed(1);
  measurements.backfill = { ...firstRun, seconds: backfillSeconds };

  // At LEAST this run's seed: the emulator is shared with the suites that ran
  // before, and their listings have no tokens either — so the backfill
  // correctly writes those too.
  check(
    "the backfill tokenises every listing that needs it",
    firstRun.written >= TOTAL + 2,
    `wrote ${firstRun.written} across ${firstRun.pages} pages, ${backfillSeconds}s`,
  );

  // Idempotence: a second full pass must write nothing.
  const secondRun = await backfill.main();
  check(
    "running the backfill twice writes nothing the second time",
    secondRun.written === 0 && secondRun.skipped >= TOTAL + 2,
    `wrote ${secondRun.written}, skipped ${secondRun.skipped} already correct`,
  );

  // And it changed nothing it was not asked to.
  {
    const db = admin.firestore();
    const snapshot = await db.doc(`listings/${TARGET_ID}`).get();
    const listing = snapshot.data();
    check(
      "the backfill did not touch status, timestamps or seller identity",
      listing.status === "approved" &&
        listing.sellerId === "seller-uid" &&
        listing.updatedAt === undefined &&
        listing.approvedAt === undefined &&
        typeof listing.createdAt?.toMillis === "function",
      "",
    );
    check(
      "the buried listing now carries the words a reader would type",
      Array.isArray(listing.searchTokens) &&
        listing.searchTokens.includes("congelateur") &&
        listing.searchTokens.includes("hisense"),
      JSON.stringify(listing.searchTokens?.slice(0, 6)),
    );
  }

  const db = env.authenticatedContext("buyer-uid", {}).firestore();
  const listings = collection(db, "listings");

  // Confirm the premise still holds: the target really is buried.
  {
    const page = await getDocs(
      query(listings, where("status", "==", "approved"), orderBy("createdAt", "desc"), limit(FEED_PAGE)),
    );
    const inFirstPage = page.docs.some((d) => d.id === TARGET_ID);
    check("the target is still nowhere near the first page", !inFirstPage, `position ${TARGET_POSITION} of ${TOTAL}`);
  }
  {
    const capped = await getDocs(
      query(listings, where("status", "==", "approved"), where("categoryKey", "==", TARGET_CATEGORY), orderBy("createdAt", "desc"), limit(CATEGORY_CAP)),
    );
    check(
      "and outside its own category's 200-cap",
      !capped.docs.some((d) => d.id === TARGET_ID),
      `${capped.size} in the cap`,
    );
  }

  // ── The search, exactly as useListingsSearch performs it ──────────────
  async function search(text, { filters = [], countReads = false } = {}) {
    const token = primarySearchToken(text);
    if (!token) return { rows: [], reads: 0, ms: 0 };
    const constraints = [
      where("status", "==", "approved"),
      where("searchTokens", "array-contains", token),
      ...filters.map((f) => where(f.field, "==", f.value)),
      orderBy("createdAt", "desc"),
      limit(SEARCH_FETCH),
    ];
    const started = Date.now();
    const snapshot = await getDocs(query(listings, ...constraints));
    const ms = Date.now() - started;
    const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const words = querySearchTokens(text).length;
    const narrowed =
      words <= 1
        ? rows
        : rows.filter((l) => queryMatches(text, l.titleFr, l.titleEn, l.city, l.descriptionFr));
    if (countReads) {
      measurements.reads = snapshot.size;
      measurements.ms = ms;
      measurements.returned = narrowed.length;
    }
    return { rows: narrowed, reads: snapshot.size, ms };
  }

  // ── D9: every surface from docs/SEARCH.md ────────────────────────────
  async function probe(name, source, options) {
    const { rows, reads } = await search(QUERIES.unaccented, options ?? {});
    const found = rows.some((l) => l.id === TARGET_ID);
    findings.push({ name, source, found, reads });
    check(`${name}: finds a listing that exists`, found, found ? `${reads} documents read` : "NOT FOUND");
    return found;
  }

  await probe("Marketplace / Pour vous", "F — Firestore token search");
  await probe("Local (no city chosen)", "F — Firestore token search");
  await probe("Local (city chosen)", "F — token search + city filter", {
    filters: [{ field: "city", value: TARGET_CITY }],
  });
  await probe("Category aisle (Autre)", "F — token search + category filter", {
    filters: [{ field: "categoryKey", value: TARGET_CATEGORY }],
  });
  // Probed with the vehicle target and a vehicle query, which is what these
  // screens actually do. The cross-category exclusion is asserted separately.
  {
    const { rows, reads } = await search("peugeot partner", {
      filters: [{ field: "categoryKey", value: "vehicles" }],
    });
    const found = rows.some((l) => l.id === "d-target-vehicle");
    findings.push({
      name: "Cars / Services / Garages / Immobilier (same shape)",
      source: "F — token search + category filter",
      found,
      reads,
    });
    check(
      "Cars / Services / Garages / Immobilier: finds a listing that exists",
      found,
      found ? `${reads} documents read` : "NOT FOUND",
    );
  }

  {
    const capped = await getDocs(
      query(listings, where("status", "==", "approved"), where("categoryKey", "==", "vehicles"), orderBy("createdAt", "desc"), limit(CATEGORY_CAP)),
    );
    check(
      "the vehicle target is outside the Cars 200-cap too",
      !capped.docs.some((d) => d.id === "d-target-vehicle"),
      `${capped.size} in the cap`,
    );
  }

  // ── D6: the three spellings, and multi-word ──────────────────────────
  for (const [label, text] of Object.entries(QUERIES)) {
    const { rows } = await search(text);
    check(`"${text}" finds it`, rows.some((l) => l.id === TARGET_ID), label);
  }
  {
    const { rows } = await search("Toyota Corolla");
    check(
      "a query for something that does not exist returns nothing, not everything",
      rows.length === 0,
      `${rows.length} results`,
    );
  }
  {
    // Multi-word AND: "congelateur parakou" must find it (title + city), and
    // "congelateur cotonou" must not (right thing, wrong city).
    const hit = await search("congelateur parakou");
    const miss = await search("congelateur cotonou");
    check(
      "multi-word search combines terms with AND",
      hit.rows.some((l) => l.id === TARGET_ID) && !miss.rows.some((l) => l.id === TARGET_ID),
      `"congelateur parakou" ${hit.rows.length} hit(s), "congelateur cotonou" ${miss.rows.length}`,
    );
  }
  {
    // Category + search, and city + search, both narrowing rather than
    // widening.
    const wrongCategory = await search(QUERIES.unaccented, {
      filters: [{ field: "categoryKey", value: "vehicles" }],
    });
    check(
      "a category filter excludes a match in another category",
      !wrongCategory.rows.some((l) => l.id === TARGET_ID),
      "",
    );
    const wrongCity = await search(QUERIES.unaccented, {
      filters: [{ field: "city", value: "Cotonou" }],
    });
    check("a city filter excludes a match in another city", !wrongCity.rows.some((l) => l.id === TARGET_ID), "");
  }
  {
    // Honest about the limitation Option A carries.
    const { rows } = await search("congelateurr hisense");
    check(
      "a genuine misspelling finds nothing — Option A has no typo tolerance",
      rows.length === 0,
      "documented in docs/SEARCH.md, not a defect",
    );
  }

  // ── D7: search must not become a way past the read rules ─────────────
  {
    const { rows } = await search(QUERIES.unaccented);
    check(
      "a pending listing with matching tokens stays hidden",
      !rows.some((l) => l.id === "d-pending"),
      "",
    );
    check(
      "a rejected listing with matching tokens stays hidden",
      !rows.some((l) => l.id === "d-rejected"),
      "",
    );
  }
  {
    // The query itself must be refused if it drops the status filter, rather
    // than returning unapproved listings.
    let refused = false;
    try {
      await getDocs(
        query(listings, where("searchTokens", "array-contains", "congelateur"), limit(20)),
      );
    } catch (error) {
      refused = true;
    }
    check("a search that omits the approved filter is refused by the rules", refused, "");
  }

  // ── D10: the cost of finding it ──────────────────────────────────────
  {
    const { reads, ms } = await search(QUERIES.unaccented, { countReads: true });
    measurements.position = TARGET_POSITION;
    measurements.total = TOTAL;
    check(
      "finding the buried listing reads a bounded number of documents",
      reads <= SEARCH_FETCH,
      `${reads} documents (cap ${SEARCH_FETCH}), ${ms}ms`,
    );
    check(
      "and far fewer than the catalogue",
      reads < TOTAL / 10,
      `${reads} vs ${TOTAL} in the database`,
    );
  }
  {
    const started = Date.now();
    const { rows, reads } = await search("xyzzyplugh");
    measurements.emptyReads = reads;
    measurements.emptyMs = Date.now() - started;
    check(
      "a search with no matches reads nothing and returns nothing",
      reads === 0 && rows.length === 0,
      `${reads} documents, ${measurements.emptyMs}ms`,
    );
  }

  await env.cleanup();

  for (const [ok, label] of results) console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);

  console.log("\n  search surface map, AFTER:");
  console.log("    screen                                        data searched                        result");
  for (const f of findings) {
    console.log(`    ${f.name.padEnd(45)} ${f.source.padEnd(36)} ${f.found ? "FOUND" : "NOT FOUND"}`);
  }

  console.log("\n  measured:");
  console.log(`    buried target position : ${measurements.position} of ${measurements.total}`);
  console.log(`    documents read         : ${measurements.reads}`);
  console.log(`    results returned       : ${measurements.returned}`);
  console.log(`    search latency         : ${measurements.ms}ms (emulator)`);
  console.log(`    maximum result count   : ${SEARCH_FETCH} fetched, 60 shown`);
  console.log(`    zero-result search     : ${measurements.emptyReads} reads, ${measurements.emptyMs}ms`);
  console.log(
    `    backfill               : ${measurements.backfill.written} written, ` +
      `${measurements.backfill.pages} pages, ${measurements.backfill.seconds}s`,
  );

  const failed = results.filter(([ok]) => !ok);
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} failing`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} search cases over ${TOTAL} listings`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
