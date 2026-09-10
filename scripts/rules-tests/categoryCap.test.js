// What a reader sees at listing number 201.
//
// useCategoryListings caps a category at 200 documents. That is a bound, not
// pagination, and the difference matters at exactly one place: the reader who
// scrolls to the end of a category holding more than 200 and is shown
// nothing further, with no control that would load more and nothing on screen
// saying the list was cut.
//
// This measures the boundary rather than reasoning about it: 50, 199, 200,
// 201, 500 and 1,000 listings in one category, and for each, what comes back
// and whether the app can tell it was truncated.
//
// Run: node scripts/rules-tests/run.js
const fs = require("fs");
const path = require("path");
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

const CAP = 200; // CATEGORY_CAP in src/hooks/useCategoryListings.js
const SIZES = [50, 199, 200, 201, 500, 1000];
// Its own category key so the counts are exact and nothing from the other
// suites lands in them.
const CATEGORY = (size) => `capprobe-${size}`;

const results = [];
const rows = [];
const check = (label, ok, detail) =>
  results.push([ok, detail ? `${label} — ${detail}` : label]);

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

  process.stdout.write("  seeding category-cap probes");
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const size of SIZES) {
      const base = Date.now() - size * 1000;
      for (let start = 0; start < size; start += 100) {
        await Promise.all(
          Array.from({ length: Math.min(100, size - start) }, (_, k) => {
            const i = start + k;
            return setDoc(doc(db, `listings/cap-${size}-${String(i).padStart(5, "0")}`), {
              sellerId: "seller-uid",
              status: "approved",
              titleFr: `Article ${i}`,
              categoryKey: CATEGORY(size),
              city: "Cotonou",
              price: 1000,
              createdAt: Timestamp.fromMillis(base + i * 1000),
            });
          }),
        );
      }
      process.stdout.write(".");
    }
  });
  process.stdout.write("\n");

  const db = env.authenticatedContext("seller-uid", { canPost: true }).firestore();
  const listings = collection(db, "listings");

  for (const size of SIZES) {
    // Exactly the query useCategoryListings issues.
    const snapshot = await getDocs(
      query(
        listings,
        where("status", "==", "approved"),
        where("categoryKey", "==", CATEGORY(size)),
        orderBy("createdAt", "desc"),
        limit(CAP),
      ),
    );
    const returned = snapshot.size;
    const expected = Math.min(size, CAP);
    const hidden = Math.max(0, size - CAP);

    // Which listings are lost: the query orders by createdAt DESC, so the cap
    // keeps the NEWEST 200 and drops the oldest. For a browse aisle that is
    // the right end to lose — but for a directory sorted by distance, which
    // is what these screens actually render, it means a nearby provider who
    // posted a year ago is invisible while a distant one who posted
    // yesterday is not.
    const ids = snapshot.docs.map((d) => d.id);
    const keptNewest = ids[0] === `cap-${size}-${String(size - 1).padStart(5, "0")}`;
    const oldestKept = ids[ids.length - 1];
    const droppedOldest =
      hidden > 0 && oldestKept !== `cap-${size}-00000`;

    rows.push({ size, returned, hidden, truncated: returned === CAP && size > CAP });

    check(
      `a category of ${size} returns ${expected}`,
      returned === expected,
      `${returned} documents`,
    );
    if (hidden > 0) {
      check(
        `a category of ${size} silently hides ${hidden}`,
        droppedOldest && keptNewest,
        `keeps the newest ${CAP}, drops the oldest ${hidden}`,
      );
    }
  }

  // The load-bearing question: can the app TELL it was truncated?
  //
  // useCategoryListings returns { listings, status, refresh }. There is no
  // hasMore, so a full page and a truncated one are indistinguishable to
  // every screen that consumes it — which is why nothing on screen says the
  // list was cut, and why no screen offers a way to see the rest.
  {
    const hook = fs.readFileSync(
      path.join(__dirname, "..", "..", "src", "hooks", "useCategoryListings.js"),
      "utf8",
    );
    // Phase C's fix. Before it, a cut list and a complete one were
    // indistinguishable to every caller, so no screen could say the list was
    // not all of it and none offered a way to see the rest.
    const exposesTruncation = /hasMore: entry\.hasMore/.test(hook);
    const canGrow = /current\.window \+= CATEGORY_PAGE/.test(hook);
    check(
      "the hook tells its callers when it truncated a category",
      exposesTruncation,
      exposesTruncation ? "" : "it does not — a cut list looks exactly like a complete one",
    );
    check(
      "and offers a way to see past the cap",
      canGrow,
      canGrow ? "" : "the cap is a dead end",
    );

    // The screen whose whole job is browsing an aisle to its end has to use
    // it. The directory landing pages deliberately do not: they show rails
    // and groupings and are discovery surfaces, not exhaustive lists.
    const screen = fs.readFileSync(
      path.join(__dirname, "..", "..", "src", "screens", "CategoryListingsScreen.js"),
      "utf8",
    );
    check(
      "the category browse screen loads past the cap",
      /onEndReached=\{loadMoreInCategory\}/.test(screen),
      "",
    );
    check(
      "and says when it has reached the real end",
      /localEndOfResults/.test(screen),
      "",
    );
  }

  await env.cleanup();

  for (const [ok, label] of results) console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  console.log("\n  category size -> what the reader gets:");
  console.log("    in category   returned   hidden   reader can tell?");
  for (const r of rows) {
    console.log(
      `    ${String(r.size).padStart(9)}   ${String(r.returned).padStart(8)}   ` +
        `${String(r.hidden).padStart(6)}   ${r.truncated ? "no" : "n/a"}`,
    );
  }

  const failed = results.filter(([ok]) => !ok);
  console.log(
    `\nmeasured: ${results.length - failed.length} of ${results.length} category-cap ` +
      `assertions hold (${failed.length} do not)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
