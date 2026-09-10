// The bounded reads, against enough data to tell the difference.
//
// Phase B's largest claim is that a screen's cost is now proportional to what
// it shows rather than to the size of the catalogue. That claim is only worth
// anything if it is measured on a catalogue big enough for the old code to
// have been visibly wrong — so this seeds 1,200 listings and a
// 2,000-message conversation and then reads them the way the app does.
//
// It exercises the QUERIES rather than the React hooks. The hooks are a
// cursor, a page array and four states around exactly these queries, and
// standing up a React renderer to prove that `startAfter` pages would test
// the renderer. What can go wrong here — a wrong index, a cursor that repeats
// a document, an end-of-results that never arrives, a filter that is not
// actually pushed into the query — all lives at this level.
//
// Run: node scripts/rules-tests/run.js
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
} = require("firebase/firestore");

const SELLER = "seller-uid";
const TOTAL_LISTINGS = 1200;
const TOTAL_MESSAGES = 2000;
const PAGE = 30;
const MESSAGE_PAGE = 50;

const CATEGORIES = ["vehicles", "services", "realEstate", "other"];
const CITIES = ["Cotonou", "Porto-Novo", "Parakou"];

const results = [];
const check = (label, ok, detail) => {
  results.push([ok, detail ? `${label} — ${detail}` : label]);
};

// Reads counted the way Firestore bills them: one per document returned.
// Printed at the end as the before/after the report quotes.
const measurements = {};

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "rules-probe",
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, "..", "..", "firestore.rules"),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  // Seeded past the rules: 1,200 documents through the create rule would be
  // testing the create rule 1,200 times, which the other file already does
  // once. Written in batches because a single Promise.all of 1,200 writes
  // exhausts the emulator's connection pool.
  process.stdout.write(`  seeding ${TOTAL_LISTINGS} listings`);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = Date.now() - TOTAL_LISTINGS * 1000;
    for (let start = 0; start < TOTAL_LISTINGS; start += 100) {
      await Promise.all(
        Array.from({ length: Math.min(100, TOTAL_LISTINGS - start) }, (_, k) => {
          const i = start + k;
          const { setDoc, doc } = require("firebase/firestore");
          return setDoc(doc(db, `listings/seed-${String(i).padStart(5, "0")}`), {
            sellerId: SELLER,
            status: "approved",
            titleFr: `Annonce ${i}`,
            descriptionFr: "Description.",
            price: 1000 + i,
            categoryKey: CATEGORIES[i % CATEGORIES.length],
            city: CITIES[i % CITIES.length],
            // Distinct and ordered, so a cursor has something unambiguous to
            // page on. Equal timestamps are the classic way a paginated feed
            // starts repeating rows.
            createdAt: Timestamp.fromMillis(base + i * 1000),
          });
        }),
      );
      process.stdout.write(".");
    }

    process.stdout.write(`\n  seeding ${TOTAL_MESSAGES} messages`);
    const { setDoc, doc } = require("firebase/firestore");
    await setDoc(doc(db, "conversations/bigthread"), {
      participantIds: [SELLER, "buyer-uid"],
      buyerId: "buyer-uid",
      sellerId: SELLER,
      listingId: "seed-00000",
    });
    const msgBase = Date.now() - TOTAL_MESSAGES * 1000;
    for (let start = 0; start < TOTAL_MESSAGES; start += 200) {
      await Promise.all(
        Array.from({ length: Math.min(200, TOTAL_MESSAGES - start) }, (_, k) => {
          const i = start + k;
          return setDoc(
            doc(db, `conversations/bigthread/messages/m-${String(i).padStart(5, "0")}`),
            {
              senderId: i % 2 ? SELLER : "buyer-uid",
              text: `Message ${i}`,
              createdAt: Timestamp.fromMillis(msgBase + i * 1000),
            },
          );
        }),
      );
      process.stdout.write(".");
    }
  });
  process.stdout.write("\n");

  const db = env.authenticatedContext(SELLER, { canPost: true }).firestore();
  const listings = collection(db, "listings");

  // ── What the old architecture cost ───────────────────────────────────
  // The unbounded query useApprovedListings used to open, run once so the
  // number in the report is measured rather than asserted.
  {
    const snapshot = await getDocs(
      query(listings, where("status", "==", "approved"), orderBy("createdAt", "desc")),
    );
    measurements.unboundedFeedReads = snapshot.size;
    // At LEAST the seeded set: the emulator is shared with the suites that
    // ran before this one, and they leave their own approved listings behind.
    // That is the point being made either way — the query reads everything
    // that exists, whatever that happens to be.
    check(
      "the old unbounded feed query really did read the whole catalogue",
      snapshot.size >= TOTAL_LISTINGS,
      `${snapshot.size} documents`,
    );
  }

  // ── B1: first page, next page, no duplicates, end of results ─────────
  {
    const seen = new Set();
    let cursor = null;
    const WANTED_PAGES = 5;
    let pages = 0;
    let firstPageReads = 0;
    let hasMore = true;

    while (hasMore && pages < WANTED_PAGES) {
      const constraints = [
        where("status", "==", "approved"),
        orderBy("createdAt", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(PAGE),
      ];
      const snapshot = await getDocs(query(listings, ...constraints));
      if (pages === 0) firstPageReads = snapshot.size;
      pages += 1;
      for (const d of snapshot.docs) {
        if (seen.has(d.id)) {
          check("paging never returns the same listing twice", false, `${d.id} repeated on page ${pages}`);
        }
        seen.add(d.id);
      }
      cursor = snapshot.docs[snapshot.docs.length - 1] ?? cursor;
      hasMore = snapshot.docs.length === PAGE;
    }

    measurements.firstPageReads = firstPageReads;
    check("the first page reads one page, not the catalogue", firstPageReads === PAGE, `${firstPageReads} documents`);
    check(
      "five pages yield five distinct pages of listings",
      seen.size === PAGE * WANTED_PAGES,
      `${seen.size} unique across ${pages} pages`,
    );
    check("paging never returns the same listing twice", true);
    check("more pages remain in a catalogue this size", hasMore === true);
  }

  // Reaching the true end of a filtered set, where hasMore must go false.
  {
    let cursor = null;
    let total = 0;
    let hasMore = true;
    let guard = 0;
    while (hasMore && guard < 40) {
      guard += 1;
      const snapshot = await getDocs(
        query(
          listings,
          where("status", "==", "approved"),
          where("categoryKey", "==", "realEstate"),
          orderBy("createdAt", "desc"),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(PAGE),
        ),
      );
      total += snapshot.size;
      cursor = snapshot.docs[snapshot.docs.length - 1] ?? cursor;
      hasMore = snapshot.docs.length === PAGE;
    }
    check(
      "paging a category reaches a real end",
      hasMore === false && total === TOTAL_LISTINGS / CATEGORIES.length,
      `${total} in realEstate`,
    );
  }

  // ── B1: the filters are in the query, not in JavaScript ──────────────
  {
    const snapshot = await getDocs(
      query(
        listings,
        where("status", "==", "approved"),
        where("categoryKey", "==", "vehicles"),
        orderBy("createdAt", "desc"),
        limit(200),
      ),
    );
    measurements.categoryReads = snapshot.size;
    const allVehicles = snapshot.docs.every((d) => d.data().categoryKey === "vehicles");
    check("a category read returns only that category", allVehicles);
    check(
      "a category read is bounded by the cap, not by the catalogue",
      snapshot.size === 200,
      `${snapshot.size} documents for a category holding ${TOTAL_LISTINGS / CATEGORIES.length}`,
    );
  }

  {
    const snapshot = await getDocs(
      query(
        listings,
        where("status", "==", "approved"),
        where("city", "==", "Cotonou"),
        orderBy("createdAt", "desc"),
        limit(60),
      ),
    );
    const allCotonou = snapshot.docs.every((d) => d.data().city === "Cotonou");
    check("a city-filtered page returns only that city", allCotonou);
    check("a city-filtered page is one page", snapshot.size === 60, `${snapshot.size}`);
  }

  // ── B1: empty results, and a failing query ───────────────────────────
  {
    const snapshot = await getDocs(
      query(
        listings,
        where("status", "==", "approved"),
        where("categoryKey", "==", "nothing-is-filed-here"),
        orderBy("createdAt", "desc"),
        limit(PAGE),
      ),
    );
    check("an empty result is empty rather than an error", snapshot.size === 0);
  }

  {
    // A query the rules refuse: `pending` is readable only by its owner or a
    // moderator, so an outsider asking for the pending set must be refused
    // rather than quietly handed an empty page. This is the case that made
    // useApprovedListingsState distinguish error from empty in the first
    // place, and the paginated hook has to keep it.
    const outsider = env.authenticatedContext("outsider-uid", {}).firestore();
    let refused = false;
    try {
      await getDocs(
        query(
          collection(outsider, "listings"),
          where("status", "==", "pending"),
          orderBy("createdAt", "desc"),
          limit(PAGE),
        ),
      );
    } catch (error) {
      refused = true;
    }
    check("a refused query fails loudly instead of looking empty", refused);
  }

  // ── B2: chat ─────────────────────────────────────────────────────────
  const messages = collection(db, "conversations/bigthread/messages");
  {
    const snapshot = await getDocs(
      query(messages, orderBy("createdAt", "desc")),
    );
    measurements.unboundedChatReads = snapshot.size;
    check(
      "the old unbounded chat query really did read the whole thread",
      snapshot.size === TOTAL_MESSAGES,
      `${snapshot.size} messages`,
    );
  }

  {
    const snapshot = await getDocs(
      query(messages, orderBy("createdAt", "desc"), limit(MESSAGE_PAGE)),
    );
    measurements.chatOpenReads = snapshot.size;
    check(
      "opening a 2,000-message thread reads fifty",
      snapshot.size === MESSAGE_PAGE,
      `${snapshot.size} messages`,
    );
    // Newest first, which is what an inverted list draws from the bottom up.
    const times = snapshot.docs.map((d) => d.data().createdAt.toMillis());
    const descending = times.every((t, i) => i === 0 || times[i - 1] >= t);
    check("the newest messages are the ones loaded", descending);
    check(
      "and they are the newest in the thread",
      snapshot.docs[0].id === `m-0${TOTAL_MESSAGES - 1}`.slice(-7),
      snapshot.docs[0].id,
    );
  }

  {
    // "Load earlier" grows the window. The window is the query, so page two
    // is a limit of 100 — and the first fifty of it must be exactly the
    // fifty already on screen, or the list would shuffle under the reader.
    const first = await getDocs(
      query(messages, orderBy("createdAt", "desc"), limit(MESSAGE_PAGE)),
    );
    const grown = await getDocs(
      query(messages, orderBy("createdAt", "desc"), limit(MESSAGE_PAGE * 2)),
    );
    const firstIds = first.docs.map((d) => d.id);
    const grownIds = grown.docs.map((d) => d.id);
    check("a grown window is a superset of the one before it", grown.size === MESSAGE_PAGE * 2);
    check(
      "load-earlier does not reorder what is already on screen",
      firstIds.every((id, i) => grownIds[i] === id),
    );
    check(
      "and every message in the window is distinct",
      new Set(grownIds).size === grownIds.length,
    );
  }

  await env.cleanup();

  for (const [ok, label] of results) {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  }

  console.log("\n  measured, on this seeded data:");
  console.log(`    marketplace feed, before : ${measurements.unboundedFeedReads} document reads per open`);
  console.log(`    marketplace feed, after  : ${measurements.firstPageReads} document reads per open`);
  console.log(`    category screen, after   : ${measurements.categoryReads} document reads (capped)`);
  console.log(`    2,000-message chat, before: ${measurements.unboundedChatReads} document reads per open`);
  console.log(`    2,000-message chat, after : ${measurements.chatOpenReads} document reads per open`);

  const failed = results.filter(([ok]) => !ok);
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} failing`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} pagination cases over ${TOTAL_LISTINGS} listings and ${TOTAL_MESSAGES} messages`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
