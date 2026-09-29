#!/usr/bin/env node
//
// Who hears about a new listing, and how many times.
//
// Two defects this pins, both of which shipped:
//
//   THE GLOBAL BELL. useNotificationCenter derived its "new listings"
//   section from useNewListingsFeed, which asks for the thirty most recently
//   approved listings ACROSS EVERY SELLER. No uid, no follower filter. Every
//   listing published anywhere in Benin incremented every user's badge. The
//   OS push was always follower-only; the bell never was, and the two were
//   easy to mistake for one system.
//
//   THE SECOND PUBLICATION. A material edit (title, price, photo, category,
//   city, partType) sends a live listing back to pending, and the
//   moderator's re-approval is another pending -> approved transition. With
//   no marker, correcting a price told every follower the seller had
//   published something new.
//
// This does not grep for identifiers. It loads the real trigger out of
// functions/index.js against an in-memory Firestore and messaging stub, runs
// it, and asserts on what was written and what was sent. No emulator, so it
// belongs in the ordinary check suite and runs in a second.
//
// Run: node scripts/check-follower-notifications.js
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };
const eq = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

// ── An in-memory Firestore, only as much as the trigger touches ────────
const SERVER_TS = "__serverTimestamp__";
const DELETE = "__delete__";

function makeWorld() {
  // path -> data. Subcollections are just longer paths.
  const docs = new Map();
  const sent = [];
  const world = { docs, sent };

  const snapOf = (p) => ({
    id: p.split("/").pop(),
    exists: docs.has(p),
    data: () => docs.get(p),
    ref: { path: p },
  });

  // IMMUTABLE, like the real one. The trigger builds two queries off a
  // single `collection("follows")` handle — an ordered one and an unordered
  // sweep — and a builder that mutated shared state would leak the orderBy
  // into the sweep, silently defeating the very thing the sweep exists for.
  // The first version of this stub did exactly that and the legacy-follow
  // case caught it.
  function collection(name, state = { filters: [], cap: Infinity, ordered: null }) {
    const derive = (patch) => collection(name, { ...state, ...patch });
    const { filters, cap, ordered } = state;
    const api = {
      where(field, _op, value) { return derive({ filters: [...filters, [field, value]] }); },
      orderBy(field) { return derive({ ordered: field }); },
      limit(n) { return derive({ cap: n }); },
      async get() {
        let rows = [...docs.entries()]
          .filter(([p]) => p.startsWith(`${name}/`) && p.split("/").length === 2)
          .filter(([, d]) => filters.every(([f, v]) => d[f] === v));
        // orderBy drops documents missing the field, exactly as Firestore
        // does — the behaviour the trigger's second "sweep" query exists for.
        if (ordered) rows = rows.filter(([, d]) => d[ordered] !== undefined);
        rows = rows.slice(0, cap);
        const list = rows.map(([p]) => snapOf(p));
        return { docs: list, size: list.length, empty: list.length === 0 };
      },
      doc: (id) => docRef(`${name}/${id}`),
    };
    return api;
  }

  function docRef(p) {
    return {
      path: p,
      async get() { return snapOf(p); },
      async set(value) { docs.set(p, { ...value }); },
      async update(value) {
        const current = docs.get(p) ?? {};
        for (const [k, v] of Object.entries(value)) {
          if (v === DELETE) delete current[k];
          else current[k] = v;
        }
        docs.set(p, current);
      },
      collection: (name) => {
        const base = `${p}/${name}`;
        return { doc: (id) => docRef(`${base}/${id}`), async add(value) {
          docs.set(`${base}/auto-${Math.random().toString(36).slice(2)}`, { ...value });
        } };
      },
    };
  }

  const firestore = () => ({
    collection,
    doc: docRef,
    async getAll(...refs) { return refs.map((r) => snapOf(r.path)); },
    async runTransaction(fn) {
      // Serial by construction here; the concurrency case is driven by
      // invoking the handler twice and is asserted separately.
      return fn({
        get: async (ref) => snapOf(ref.path),
        update: (ref, value) => docRef(ref.path).update(value),
      });
    },
  });
  firestore.FieldValue = {
    serverTimestamp: () => SERVER_TS,
    delete: () => DELETE,
  };

  world.admin = {
    initializeApp() {},
    firestore,
    messaging: () => ({
      async sendEachForMulticast(message) {
        sent.push(message);
        return { responses: message.tokens.map(() => ({ success: true })) };
      },
    }),
  };
  return world;
}

// ── Load the real trigger with those stubs ─────────────────────────────
function loadTrigger(world) {
  // onDocument* returns the handler, so `exports.notifyFollowersOfNewListing`
  // IS the function under test. Keying by trigger path would not do: four
  // triggers are registered on listings/{listingId} and the last would win.
  const capture = () => (pathSpec, handler) => handler;
  const noop = () => () => {};
  const stubs = {
    "firebase-admin": world.admin,
    "firebase-functions/logger": { info() {}, warn() {}, error() {} },
    "firebase-functions/v2": { setGlobalOptions() {} },
    "firebase-functions/v2/https": { onCall: noop, HttpsError: class extends Error {} },
    "firebase-functions/v2/firestore": {
      onDocumentCreated: capture(),
      onDocumentDeleted: capture(),
      onDocumentUpdated: capture(),
      onDocumentWritten: capture(),
    },
    "./deleteAccount": {}, "./listingPage": {}, "./paperReminders": {},
    "./pharmacyRosterSync": {}, "./placesProxy": {}, "./profilePage": {},
  };

  const load = (rel, extra = {}) => {
    const file = path.join(root, rel);
    const m = new Module(file, null);
    m.filename = file;
    m.paths = Module._nodeModulePaths(path.dirname(file));
    const table = { ...stubs, ...extra };
    m.require = (id) => (id in table ? table[id] : Module.prototype.require.call(m, id));
    m._compile(fs.readFileSync(file, "utf8"), file);
    return m.exports;
  };

  // The real recordNotification, against the same stubbed admin — so the
  // deterministic-id behaviour under test is the shipped one.
  const recordNotification = load("functions/recordNotification.js");
  const fns = load("functions/index.js", { "./recordNotification": recordNotification });
  if (typeof fns.notifyFollowersOfNewListing !== "function")
    throw new Error("notifyFollowersOfNewListing is not exported as a handler");
  return { notify: fns.notifyFollowersOfNewListing, recordNotification };
}

// ── Fixtures ───────────────────────────────────────────────────────────
function seed(world, { followers = [], tokens = {}, seller = "seller1" } = {}) {
  world.docs.set(`sellers/${seller}`, { fullName: "Boutique" });
  followers.forEach((uid, i) => {
    world.docs.set(`follows/${uid}_${seller}`, {
      followerId: uid, sellerId: seller, createdAt: 1000 + i,
    });
    world.docs.set(`sellers/${uid}`, tokens[uid] ? { pushToken: tokens[uid] } : {});
  });
}

const LISTING = { sellerId: "seller1", titleFr: "Robe wax", sellerName: "Boutique" };

async function run(world, notify, { before, after, listingId = "L1" }) {
  world.docs.set(`listings/${listingId}`, { ...after });
  await notify({
    params: { listingId },
    data: {
      before: { data: () => before },
      after: {
        data: () => after,
        // A real ref: the trigger passes this straight into the transaction.
        ref: world.admin.firestore().doc(`listings/${listingId}`),
      },
    },
  });
}

const rowsFor = (world, listingId = "L1") =>
  [...world.docs.keys()]
    .filter((p) => p.includes("/notifications/") && p.endsWith(`/${listingId}`))
    .map((p) => p.split("/")[1])
    .sort();

const pushedTokens = (world) => world.sent.flatMap((m) => m.tokens).sort();

// ── The cases ──────────────────────────────────────────────────────────
(async () => {
  const pending = { ...LISTING, status: "pending" };
  const approved = { ...LISTING, status: "approved" };

  // 1. First publication: a record per follower, a push per token.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a", "b", "c"], tokens: { a: "tok-a", b: "tok-b" } });
    await run(w, notify, { before: pending, after: approved });
    eq("1 records go to every follower", rowsFor(w), ["a", "b", "c"]);
    eq("1 pushes go only to followers with a token", pushedTokens(w), ["tok-a", "tok-b"]);
    // c has no token and still has a record.
    if (!w.docs.has("sellers/c/notifications/L1"))
      fail("1 a follower without a push token got no notification record");
    const row = w.docs.get("sellers/a/notifications/L1");
    eq("1 the row carries the type", row.type, "followedSellerListing");
    eq("1 the row deep links to the listing", row.data.listingId, "L1");
    eq("1 the row and the banner say the same thing",
      [row.title, row.body], [w.sent[0].notification.title, w.sent[0].notification.body]);
    if (!w.docs.get("listings/L1").followerNotificationProcessedAt)
      fail("1 the publication was not marked processed");
  }

  // 2. Zero followers: nothing sent, nothing written, STILL marked.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: [] });
    await run(w, notify, { before: pending, after: approved });
    eq("2 no records", rowsFor(w), []);
    eq("2 no pushes", w.sent.length, 0);
    if (!w.docs.get("listings/L1").followerNotificationProcessedAt)
      fail("2 a publication with no followers was not marked processed — followers gained later would be told about it on the next re-approval");
  }

  // 3. THE CASE THE MARKER IS NAMED FOR. Published to nobody, gains
  //    followers, gets edited, is re-approved. Nobody hears about it.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: [] });
    await run(w, notify, { before: pending, after: approved });
    seed(w, { followers: ["a", "b"], tokens: { a: "tok-a", b: "tok-b" } });
    const processed = { ...approved, followerNotificationProcessedAt: SERVER_TS };
    await run(w, notify, { before: { ...pending, followerNotificationProcessedAt: SERVER_TS }, after: processed });
    eq("3 followers gained after publication are not told", rowsFor(w), []);
    eq("3 and nothing is pushed", w.sent.length, 0);
  }

  // 4. Material edit -> pending -> re-approved: no second event.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a"], tokens: { a: "tok-a" } });
    await run(w, notify, { before: pending, after: approved });
    const marked = w.docs.get("listings/L1");
    eq("4 first approval notified once", w.sent.length, 1);
    await run(w, notify, { before: { ...marked, status: "pending" }, after: { ...marked, status: "approved" } });
    eq("4 re-approval sends nothing further", w.sent.length, 1);
    eq("4 and adds no second row", rowsFor(w), ["a"]);
  }

  // 5. Ordinary edit while approved: the status never changes.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a"], tokens: { a: "tok-a" } });
    await run(w, notify, { before: approved, after: { ...approved, titleFr: "Robe wax bleue" } });
    eq("5 an edit that keeps the status notifies nobody", w.sent.length, 0);
    eq("5 and writes no row", rowsFor(w), []);
  }

  // 6. Rejected, edited, then approved for the first time: this IS its
  //    first publication and must notify.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a"], tokens: { a: "tok-a" } });
    await run(w, notify, { before: { ...LISTING, status: "rejected" }, after: approved });
    eq("6 a first approval after a rejection notifies", rowsFor(w), ["a"]);
  }

  // 7. Rejection itself notifies no follower.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a"], tokens: { a: "tok-a" } });
    await run(w, notify, { before: pending, after: { ...LISTING, status: "rejected" } });
    eq("7 a rejection tells no follower", w.sent.length, 0);
    eq("7 and is not marked processed", w.docs.get("listings/L1").followerNotificationProcessedAt, undefined);
  }

  // 8. Repeated invocation of the same event: one fan-out, one row each.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a", "b"], tokens: { a: "tok-a", b: "tok-b" } });
    await run(w, notify, { before: pending, after: approved });
    const first = w.sent.length;
    // The retry sees the document as the claim left it.
    await run(w, notify, { before: pending, after: w.docs.get("listings/L1") });
    eq("8 a repeated invocation sends nothing further", w.sent.length, first);
    eq("8 and leaves one row per follower", rowsFor(w), ["a", "b"]);
  }

  // 9. The seller never hears about their own listing, even with a stale
  //    self-follow row the rules would refuse today.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a"], tokens: { a: "tok-a" } });
    w.docs.set("follows/seller1_seller1", { followerId: "seller1", sellerId: "seller1", createdAt: 1 });
    w.docs.set("sellers/seller1", { fullName: "Boutique", pushToken: "tok-self" });
    await run(w, notify, { before: pending, after: approved });
    eq("9 the seller gets no record", rowsFor(w), ["a"]);
    if (pushedTokens(w).includes("tok-self"))
      fail("9 the seller was pushed their own listing");
  }

  // 10. A follower of a DIFFERENT seller is untouched.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a"], tokens: { a: "tok-a" } });
    w.docs.set("follows/z_other", { followerId: "z", sellerId: "other", createdAt: 1 });
    w.docs.set("sellers/z", { pushToken: "tok-z" });
    await run(w, notify, { before: pending, after: approved });
    eq("10 a non-follower gets no record", rowsFor(w), ["a"]);
    if (pushedTokens(w).includes("tok-z")) fail("10 a non-follower was pushed");
  }

  // 11. A legacy follow row with no createdAt is still reached — the
  //     ordered query drops it, the sweep catches it.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a"], tokens: { a: "tok-a" } });
    w.docs.set("follows/legacy_seller1", { followerId: "legacy", sellerId: "seller1" });
    w.docs.set("sellers/legacy", { pushToken: "tok-legacy" });
    await run(w, notify, { before: pending, after: approved });
    eq("11 a follow row predating createdAt is still notified", rowsFor(w), ["a", "legacy"]);
  }

  // 12. recordNotification stays backward compatible: no id means add().
  {
    const w = makeWorld();
    const { recordNotification } = loadTrigger(w);
    await recordNotification.recordNotification("u1", { title: "T", body: "B", data: { type: "x" } });
    await recordNotification.recordNotification("u1", { title: "T", body: "B", data: { type: "x" } });
    const auto = [...w.docs.keys()].filter((p) => p.startsWith("sellers/u1/notifications/"));
    eq("12 two id-less calls write two rows", auto.length, 2);
    await recordNotification.recordNotification("u2", { id: "L9", title: "T", body: "B", data: {} });
    await recordNotification.recordNotification("u2", { id: "L9", title: "T", body: "B", data: {} });
    const fixed = [...w.docs.keys()].filter((p) => p.startsWith("sellers/u2/notifications/"));
    eq("12 two calls with the same id write one row", fixed, ["sellers/u2/notifications/L9"]);
  }

  // 13. NOBODY has a token. The records must still be written — this is
  //     what proves they are written before the token gate rather than
  //     after it, and it is the case the old senders got wrong: the person
  //     least able to receive a push was the one guaranteed no record.
  {
    const w = makeWorld();
    const { notify } = loadTrigger(w);
    seed(w, { followers: ["a", "b"], tokens: {} });
    await run(w, notify, { before: pending, after: approved });
    eq("13 records are written even when no follower has a token", rowsFor(w), ["a", "b"]);
    eq("13 and nothing is pushed", w.sent.length, 0);
  }

  // ── Source-level: the bell, the rules, and the preserved feed ────────
  const centre = stripComments(read("src/hooks/useNotificationCenter.js"));
  if (/useNewListingsFeed/.test(centre))
    fail("useNotificationCenter still reads the global approved-listings feed — every listing in Benin would badge every user");
  if (/newListings/.test(centre))
    fail("a global newListings term is still in the notification centre");
  // The badge EXPRESSION, not the file. newStoredNotifications is computed
  // a few lines above whatever the badge adds up, so testing the whole file
  // for the identifier passes even when the badge has stopped counting it.
  const badgeAt = centre.indexOf("badgeCount:");
  const badge = badgeAt === -1 ? "" : centre.slice(badgeAt, centre.indexOf("markSeen", badgeAt));
  if (!badge) fail("could not read the badgeCount expression — the rest of this assertion is not running");
  else {
    if (/newListings/.test(badge)) fail("badgeCount still counts global listings");
    if (!/newStoredNotifications/.test(badge))
      fail("badgeCount no longer counts stored notifications, which is where follower listings now arrive — the bell would go silent");
    if (!/unreadMessageCount/.test(badge))
      fail("badgeCount no longer counts unread messages");
    if (!/newJobApplications/.test(badge))
      fail("badgeCount no longer counts job applications");
  }

  const screen = stripComments(read("src/screens/NotificationsScreen.js"));
  if (/newListings/.test(screen))
    fail("NotificationsScreen still renders the global listings feed");
  if (!/followedSellerListing/.test(screen))
    fail("NotificationsScreen does not give a followed-seller listing its own treatment");

  // Preserved on purpose: discovery is a real surface, just not a personal
  // notification. Deleting it would throw the query away.
  if (!fs.existsSync(path.join(root, "src/hooks/useNewListingsFeed.js")))
    fail("useNewListingsFeed.js was deleted — it is kept for a future discovery surface");

  const rules = read("firestore.rules");
  if (!/'followerNotificationProcessedAt'/.test(rules))
    fail("firestore.rules does not freeze followerNotificationProcessedAt — a seller could clear it and re-announce the same listing to their followers as often as they liked");
  if (!/allow write: if false/.test(rules.slice(rules.indexOf("match /notifications/{notificationId}"), rules.indexOf("match /notifications/{notificationId}") + 200)))
    fail("the notifications subcollection is no longer client-unwritable");

  // The push itself must never go wide.
  const fns = stripComments(read("functions/index.js"));
  for (const [pattern, what] of [
    [/sendToTopic|subscribeToTopic|topic:/, "an FCM topic"],
    [/collection\("sellers"\)\s*\.get\(\)/, "an unbounded read of every seller"],
  ]) {
    if (pattern.test(fns)) fail(`the fan-out has acquired ${what} — listing pushes must stay follower-only`);
  }

  if (failures) process.exit(1);
  console.log(
    "clean: follower notifications — a publication is claimed once and " +
      "recorded per follower before any push, zero followers still counts as " +
      "published, re-approval adds nothing, the seller and non-followers get " +
      "nothing, and the bell no longer reads the global catalogue",
  );
})().catch((error) => {
  console.error(`FAIL the checker itself threw: ${error.stack}`);
  process.exit(1);
});
