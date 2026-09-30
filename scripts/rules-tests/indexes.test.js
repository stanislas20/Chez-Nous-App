// Every query the app issues, run against the emulator with the deployed
// index set — and no others.
//
// A missing composite index is the quietest deployment failure Firestore
// offers. The rules pass, the code is correct, the emulator is permissive by
// default, and the query fails in production with FAILED_PRECONDITION on a
// screen nobody opened during testing. Phase B added three indexes on the
// strength of reading the code; this checks the code against them the other
// way round.
//
// The emulator creates composite indexes on demand unless it is told not to,
// so `firestore.indexes` in firebase.json points it at the real file — which
// is what makes a query needing an index that is not there fail here the way
// it would fail in production.
//
// Run: node scripts/rules-tests/run.js
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const {
  collection,
  collectionGroup,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} = require("firebase/firestore");

const results = [];
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

  const db = env.authenticatedContext("seller-uid", { canPost: true }).firestore();
  const moderatorDb = env
    .authenticatedContext("moderator-uid", { moderator: true })
    .firestore();
  const uid = "seller-uid";

  // The parent this suite used to inherit from whichever test ran before it.
  //
  // The messages read rule resolves participantIds by get()ing the parent
  // conversation, and that get() throws — not returns empty — when the
  // document is absent. So "ChatScreen — the message window" was only ever
  // reaching the index because an earlier suite happened to leave a
  // conversation behind. Once the suites started clearing between runs it
  // failed, correctly, and this is the seed it should always have had.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const { doc: rawDoc, setDoc: rawSet } = require("firebase/firestore");
    await rawSet(rawDoc(ctx.firestore(), "conversations/thread"), {
      participantIds: [uid, "buyer-uid"],
      buyerId: "buyer-uid",
      sellerId: uid,
      listingId: "thread-listing",
    });
  });

  // Every query in the app that carries more than one constraint, named by
  // where it lives. Equality-only queries are omitted: Firestore serves those
  // from single-field indexes it maintains automatically.
  const QUERIES = [
    // ── Phase B: the bounded reads ──────────────────────────────────────
    [
      "useListingsQuery — feed page (ForYou, Local unfiltered)",
      () => query(collection(db, "listings"), where("status", "==", "approved"), orderBy("createdAt", "desc"), limit(30)),
    ],
    [
      "useListingsQuery — second page via cursor",
      async () => {
        const first = await getDocs(
          query(collection(db, "listings"), where("status", "==", "approved"), orderBy("createdAt", "desc"), limit(1)),
        );
        const cursor = first.docs[0];
        return query(
          collection(db, "listings"),
          where("status", "==", "approved"),
          orderBy("createdAt", "desc"),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(30),
        );
      },
    ],
    [
      "useListingsQuery — Local with a city chosen",
      () => query(collection(db, "listings"), where("status", "==", "approved"), where("city", "==", "Cotonou"), orderBy("createdAt", "desc"), limit(60)),
    ],
    [
      "useCategoryListings — one category",
      () => query(collection(db, "listings"), where("status", "==", "approved"), where("categoryKey", "==", "vehicles"), orderBy("createdAt", "desc"), limit(200)),
    ],
    // useListingsByIds does NOT appear here as a query, and that is the
    // finding rather than an omission. It used to use
    // `where(documentId(), "in", [...])`, which needs no composite index and
    // fails for a different reason: a list query is all-or-nothing against
    // the rules, and the listings read rule throws on an id that no longer
    // exists. One deleted favourite failed the whole screen. It now reads
    // each id with getDoc, which is per-id and needs no index; the
    // regression is pinned in the deleted-favourite cases below.
    // The three-field index Phase B added but nothing yet uses. Exercised so
    // it is either justified or removed, rather than deployed on a guess.
    [
      "status + categoryKey + city + createdAt (declared, not yet used)",
      () => query(collection(db, "listings"), where("status", "==", "approved"), where("categoryKey", "==", "vehicles"), where("city", "==", "Cotonou"), orderBy("createdAt", "desc"), limit(30)),
    ],

    // ── Pre-existing queries, re-checked ────────────────────────────────
    [
      "useMyListings — the seller's own",
      () => query(collection(db, "listings"), where("sellerId", "==", uid), orderBy("createdAt", "desc")),
    ],
    [
      "useSellerListings — a seller's approved listings",
      () => query(collection(db, "listings"), where("sellerId", "==", uid), where("status", "==", "approved")),
    ],
    [
      "useNewListingsFeed — notification bell",
      () => query(collection(db, "listings"), where("status", "==", "approved"), orderBy("approvedAt", "desc"), limit(30)),
    ],
    [
      // As a MODERATOR: the read rule only lets a moderator (or the owner)
      // see pending listings, so running this as an ordinary account is
      // refused by the rules and tells you nothing about the index.
      "useModerationQueue — pending, capped",
      () => query(collection(moderatorDb, "listings"), where("status", "==", "pending"), orderBy("createdAt", "desc"), limit(100)),
    ],
    [
      "useConversations — the inbox",
      () => query(collection(db, "conversations"), where("participantIds", "array-contains", uid), orderBy("lastMessageAt", "desc")),
    ],
    [
      "ChatScreen — the message window",
      () => query(collection(db, "conversations/thread/messages"), orderBy("createdAt", "desc"), limit(50)),
    ],
    // ── Phase F: the whole search path, which was not covered before ────
    //
    // The re-audit found that neither searchPairs nor getCountFromServer
    // appeared in this file, so every query Phase E's search actually issues
    // was outside the one invariant that exists to catch a missing index —
    // the quietest deployment failure Firestore offers, and the exact thing
    // this file's header warns about.
    //
    // Both shapes matter and they are different. The count carries no
    // orderBy, so it must be servable by an index whose trailing field is
    // only used for ordering; the fetch adds orderBy(createdAt).
    [
      "useListingsSearch — pair fetch, no filter",
      () => query(collection(db, "listings"), where("status", "==", "approved"), where("searchPairs", "array-contains", "a|b"), orderBy("createdAt", "desc"), limit(120)),
    ],
    [
      "useListingsSearch — pair count, no filter",
      () => getCountFromServer(query(collection(db, "listings"), where("status", "==", "approved"), where("searchPairs", "array-contains", "a|b"))),
    ],
    [
      "useListingsSearch — pair fetch, category filter",
      () => query(collection(db, "listings"), where("status", "==", "approved"), where("categoryKey", "==", "vehicles"), where("searchPairs", "array-contains", "a|b"), orderBy("createdAt", "desc"), limit(120)),
    ],
    [
      "useListingsSearch — pair count, category filter",
      () => getCountFromServer(query(collection(db, "listings"), where("status", "==", "approved"), where("categoryKey", "==", "vehicles"), where("searchPairs", "array-contains", "a|b"))),
    ],
    [
      "useListingsSearch — pair fetch, city filter",
      () => query(collection(db, "listings"), where("status", "==", "approved"), where("city", "==", "Cotonou"), where("searchPairs", "array-contains", "a|b"), orderBy("createdAt", "desc"), limit(120)),
    ],
    [
      "useListingsSearch — pair count, city filter",
      () => getCountFromServer(query(collection(db, "listings"), where("status", "==", "approved"), where("city", "==", "Cotonou"), where("searchPairs", "array-contains", "a|b"))),
    ],
    // The single-token path: one-word queries, and the fallback a two-word
    // query takes when its pair matches nothing.
    [
      "useListingsSearch — token fetch, no filter",
      () => query(collection(db, "listings"), where("status", "==", "approved"), where("searchTokens", "array-contains", "corolla"), orderBy("createdAt", "desc"), limit(120)),
    ],
    [
      "useListingsSearch — token count, no filter",
      () => getCountFromServer(query(collection(db, "listings"), where("status", "==", "approved"), where("searchTokens", "array-contains", "corolla"))),
    ],
    [
      "useListingsSearch — token fetch, category filter",
      () => query(collection(db, "listings"), where("status", "==", "approved"), where("categoryKey", "==", "vehicles"), where("searchTokens", "array-contains", "corolla"), orderBy("createdAt", "desc"), limit(120)),
    ],
    [
      "useListingsSearch — token count, city filter",
      () => getCountFromServer(query(collection(db, "listings"), where("status", "==", "approved"), where("city", "==", "Cotonou"), where("searchTokens", "array-contains", "corolla"))),
    ],
    [
      "useJobApplications — an employer's inbox",
      () => query(collection(db, "jobApplications"), where("employerUid", "==", uid), orderBy("createdAt", "desc")),
    ],
    [
      "useRatings — a seller's reviews",
      () => query(collection(db, "ratings"), where("ratedId", "==", uid), orderBy("updatedAt", "desc"), limit(10)),
    ],
    [
      "useFollowList — followers",
      () => query(collection(db, "follows"), where("sellerId", "==", uid), orderBy("createdAt", "desc")),
    ],
    [
      "useFollowList — following",
      () => query(collection(db, "follows"), where("followerId", "==", uid), orderBy("createdAt", "desc")),
    ],
    [
      "useApprovedAds — approved ads",
      () => query(collection(db, "ads"), where("status", "==", "approved"), orderBy("createdAt", "desc")),
    ],
    [
      "useDirectory — car parks, approved and ordered",
      () => query(collection(db, "carParks"), where("status", "==", "approved"), orderBy("order", "asc")),
    ],
    [
      "useDirectory — dealerships, ordered",
      () => query(collection(db, "dealerships"), orderBy("order", "asc")),
    ],
    [
      // The Events screen asks by WHEN AN EVENT HAPPENS, not by when the
      // listing was posted, so it needs its own composite index. Without
      // it the query fails at runtime rather than degrading, and the
      // screen would go empty for everybody.
      "useUpcomingEvents — approved events dated today or later",
      () =>
        query(
          collection(db, "listings"),
          where("status", "==", "approved"),
          where("categoryKey", "==", "events"),
          where("eventDateMs", ">=", 1700000000000),
          orderBy("eventDateMs", "asc"),
          limit(200),
        ),
    ],
    [
      "useFavorites — the viewer's own",
      () => query(collection(db, "favorites"), where("userId", "==", uid)),
    ],
    [
      "useSellerRatings — a chunk of sellerStats by id",
      () => query(collection(db, "sellerStats"), where(documentId(), "in", ["a", "b"])),
    ],
    [
      "notifyFollowersOfNewListing — a seller's followers (server-side)",
      () => query(collection(db, "follows"), where("sellerId", "==", uid)),
    ],
  ];

  // ── The saved-listings read, pinned ──────────────────────────────────
  // Not an index question, but this is the suite that caught it and this is
  // where it stays caught: a favourite whose listing was deleted or rejected
  // must remove its own row and nothing else.
  {
    const { doc, getDoc, setDoc, Timestamp } = require("firebase/firestore");
    await env.withSecurityRulesDisabled(async (ctx) => {
      const raw = ctx.firestore();
      await setDoc(doc(raw, "listings/fav-live"), {
        sellerId: "someone", status: "approved", titleFr: "Saved", createdAt: Timestamp.now(),
      });
      await setDoc(doc(raw, "listings/fav-rejected"), {
        sellerId: "someone", status: "rejected", titleFr: "Refused", createdAt: Timestamp.now(),
      });
    });
    const readOne = async (id) => {
      try {
        const snapshot = await getDoc(doc(db, "listings", id));
        return snapshot.exists() ? snapshot.id : null;
      } catch (error) {
        return null;
      }
    };
    const ids = ["fav-live", "fav-deleted-long-ago", "fav-rejected"];
    const rows = (await Promise.all(ids.map(readOne))).filter(Boolean);
    check(
      "useListingsByIds — a deleted or rejected favourite drops its own row only",
      rows.length === 1 && rows[0] === "fav-live",
      `${rows.length} of 3 ids resolved`,
    );
  }

  for (const [label, build] of QUERIES) {
    try {
      // A builder either hands back a Query to run, or has already run its
      // own read — which is how the count shapes are expressed, since
      // getCountFromServer takes a query and returns a snapshot rather than
      // being something getDocs can be pointed at.
      const built = await build();
      if (built && built.type === "query") await getDocs(built);
      check(label, true);
    } catch (error) {
      const needsIndex =
        error.code === "failed-precondition" ||
        /requires an index/i.test(String(error.message));
      check(
        label,
        false,
        needsIndex
          ? "NEEDS AN INDEX that firestore.indexes.json does not declare"
          : String(error.message).slice(0, 120),
      );
    }
  }

  // And the reverse: an index declared but matching no query above is dead
  // weight in the deployment. Reported rather than failed — an index costs
  // storage and write latency, not correctness.
  const declared = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "firestore.indexes.json"), "utf8"),
  ).indexes;
  console.log(`\n  ${declared.length} composite indexes declared:`);
  for (const index of declared) {
    const fields = index.fields
      .map((f) => `${f.fieldPath} ${f.order ?? f.arrayConfig}`)
      .join(", ");
    console.log(`    ${index.collectionGroup.padEnd(18)} ${fields}`);
  }

  await env.cleanup();

  for (const [ok, label] of results) console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  const failed = results.filter(([ok]) => !ok);
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} queries have no index`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} queries all served by the declared indexes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
