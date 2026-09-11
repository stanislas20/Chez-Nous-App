// The security rules, run against the real rules engine.
//
// Everything else in scripts/ reads the rules as text. That can tell you a
// line is present; it cannot tell you the line does what it appears to say.
// The first section of these tests — moderation — found two holes that had
// already been deployed and were invisible in the source, so the rest of the
// file is now covered the same way.
//
// What is tested is the property, not the syntax: can a stranger read a
// phone number, can a seller publish without review, can a company grant
// itself a badge, can somebody read a conversation they are not in. Those are
// the questions a rules file exists to answer.
//
// Run: node scripts/rules-tests/run.js

const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} = require("firebase/firestore");

const SELLER = "seller-uid";
const BUYER = "buyer-uid";
const OUTSIDER = "outsider-uid";
const FOREIGN = "foreign-uid"; // signed in, but no canPost claim

// createdAt is serverTimestamp() and not a date, because the create rule now
// requires it to equal request.time — the server's clock, not the phone's.
// Every browse query orders by this field, so a client-chosen value is a
// permanent place at the top of every feed. Written as a literal here the
// legitimate-publish case would fail, which is exactly the point.
const listing = {
  sellerId: SELLER,
  status: "pending",
  titleFr: "Annonce en attente",
  categoryKey: "services",
  city: "Cotonou",
  createdAt: serverTimestamp(),
};

// A future date inside the 120-day ceiling expiresAtOk allows, for the cases
// that check renewal still works.
const inThirtyDays = () =>
  Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);

const results = [];
const check = async (label, promise) => {
  try {
    await promise;
    results.push([true, label]);
  } catch (error) {
    results.push([false, `${label} — ${String(error.message).slice(0, 110)}`]);
  }
};

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

  // One document per case. Sharing them lets an earlier write change the
  // state a later case depends on, and the tick it produces then has nothing
  // to do with the rule under test.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, "listings/pendingA"), listing),
      setDoc(doc(db, "listings/rejectedA"), {
        ...listing,
        status: "rejected",
        moderationNote: "La photo ne montre pas l'article.",
        moderatedBy: "moderator-uid",
        moderatedAt: new Date(),
      }),
      setDoc(doc(db, "listings/rejectedB"), {
        ...listing,
        status: "rejected",
        moderatedBy: "moderator-uid",
        moderatedAt: new Date(),
      }),
      // Judged once already, by MOD, and now pending again — the state a
      // resubmission produces.
      setDoc(doc(db, "listings/resubmitted"), {
        ...listing,
        status: "pending",
        moderationNote: "Le numéro ne répond pas.",
        moderatedBy: "moderator-uid",
        moderatedAt: new Date(),
      }),
      setDoc(doc(db, "listings/resubmitted2"), {
        ...listing,
        status: "pending",
        moderationNote: "Le numéro ne répond pas.",
        moderatedBy: "moderator-uid",
        moderatedAt: new Date(),
      }),
      setDoc(doc(db, "listings/rejectedC"), {
        ...listing,
        sellerId: FOREIGN,
        status: "rejected",
        moderatedBy: "moderator-uid",
        moderatedAt: new Date(),
      }),
      setDoc(doc(db, "listings/live"), {
        ...listing,
        status: "approved",
        viewCount: 5,
        shareCount: 1,
      }),
      setDoc(doc(db, "sellers/" + SELLER), {
        fullName: "Vendeur",
        phone: "+2290146464674",
        rccm: "RB/COT/123",
        verificationStatus: "pending",
        verifiedAt: null,
      }),
      setDoc(doc(db, "sellers/" + BUYER), {
        fullName: "Acheteur",
        companyName: "Ancienne SARL",
        rccm: "RB/COT/999",
        ifu: "1234",
        verificationStatus: "verified",
        verifiedAt: new Date(),
      }),
      setDoc(doc(db, "verifiedCompanies/" + BUYER), {
        companyName: "Publique SARL",
      }),
      setDoc(doc(db, "contacts/" + `${BUYER}_${SELLER}`), { at: new Date() }),
      setDoc(doc(db, "conversations/thread"), {
        participantIds: [BUYER, SELLER],
        buyerId: BUYER,
      }),
      setDoc(doc(db, "conversations/thread/messages/m1"), {
        senderId: BUYER,
        text: "bonjour",
      }),
    ]);
  });

  const asSeller = env
    .authenticatedContext(SELLER, { canPost: true })
    .firestore();
  const asBuyer = env
    .authenticatedContext(BUYER, { canPost: true })
    .firestore();
  const asOutsider = env
    .authenticatedContext(OUTSIDER, { canPost: true })
    .firestore();
  const asForeign = env
    .authenticatedContext(FOREIGN, { canPost: false })
    .firestore();
  const asGuest = env.unauthenticatedContext().firestore();

  // ── Privacy of a seller's own file ──────────────────────────────────────
  // This document holds the phone number, the RCCM, the IFU and the path to
  // the representative's ID. It is the most sensitive collection in the app.
  await check(
    "a seller reads their own profile",
    assertSucceeds(getDoc(doc(asSeller, "sellers/" + SELLER))),
  );
  await check(
    "a stranger cannot read a seller's profile",
    assertFails(getDoc(doc(asOutsider, "sellers/" + SELLER))),
  );
  await check(
    "a signed-out visitor cannot read a seller's profile",
    assertFails(getDoc(doc(asGuest, "sellers/" + SELLER))),
  );
  await check(
    "the public company projection stays world-readable",
    assertSucceeds(getDoc(doc(asGuest, "verifiedCompanies/" + BUYER))),
  );
  await check(
    "nobody can write the public company projection",
    assertFails(
      setDoc(doc(asBuyer, "verifiedCompanies/" + BUYER), {
        companyName: "Moi",
      }),
    ),
  );

  // ── The verified badge ──────────────────────────────────────────────────
  await check(
    "an account cannot create itself already verified",
    assertFails(
      setDoc(doc(asOutsider, "sellers/" + OUTSIDER), {
        fullName: "Malin",
        verificationStatus: "verified",
      }),
    ),
  );
  await check(
    "an account cannot promote itself to verified",
    assertFails(
      updateDoc(doc(asSeller, "sellers/" + SELLER), {
        verificationStatus: "verified",
      }),
    ),
  );
  await check(
    "an account cannot backdate its own verifiedAt",
    assertFails(
      updateDoc(doc(asSeller, "sellers/" + SELLER), { verifiedAt: new Date() }),
    ),
  );
  await check(
    "a verified company cannot rewrite the identity that was checked",
    assertFails(
      updateDoc(doc(asBuyer, "sellers/" + BUYER), { rccm: "RB/COT/000" }),
    ),
  );
  await check(
    "a verified company can still edit everything else",
    assertSucceeds(
      updateDoc(doc(asBuyer, "sellers/" + BUYER), { fullName: "Acheteur B." }),
    ),
  );

  // ── Publishing ──────────────────────────────────────────────────────────
  await check(
    "a Bénin account creates a pending listing",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/new1"), { ...listing, sellerId: SELLER }),
    ),
  );
  await check(
    "a listing cannot be created already approved",
    assertFails(
      setDoc(doc(asSeller, "listings/new2"), {
        ...listing,
        sellerId: SELLER,
        status: "approved",
      }),
    ),
  );
  await check(
    "an account without canPost cannot publish",
    assertFails(
      setDoc(doc(asForeign, "listings/new3"), {
        ...listing,
        sellerId: FOREIGN,
      }),
    ),
  );
  await check(
    "a listing cannot be created in somebody else's name",
    assertFails(
      setDoc(doc(asSeller, "listings/new4"), {
        ...listing,
        sellerId: OUTSIDER,
      }),
    ),
  );
  await check(
    "a seller cannot approve their own listing by update",
    assertFails(
      updateDoc(doc(asSeller, "listings/pendingA"), { status: "approved" }),
    ),
  );
  await check(
    "everyone can read an approved listing",
    assertSucceeds(getDoc(doc(asGuest, "listings/live"))),
  );
  await check(
    "a stranger cannot read a pending listing",
    assertFails(getDoc(doc(asOutsider, "listings/pendingA"))),
  );

  // ── The way back from a rejection ───────────────────────────────────────
  // Rejection used to be terminal: the status equality held in both
  // directions, so a seller could correct exactly what they were told to
  // correct and the listing stayed invisible forever. These pin the one
  // door that opened, and that it is the only one.
  await check(
    "a seller resubmits a rejected listing",
    assertSucceeds(
      updateDoc(doc(asSeller, "listings/rejectedA"), {
        status: "pending",
        titleFr: "Annonce corrigée",
      }),
    ),
  );
  await check(
    "resubmitting needs no material change — a corrected phone is enough",
    assertSucceeds(
      updateDoc(doc(asSeller, "listings/rejectedB"), {
        status: "pending",
        phone: "+2290146464674",
      }),
    ),
  );
  await check(
    "a seller cannot rewrite why they were rejected on the way back",
    assertFails(
      updateDoc(doc(asSeller, "listings/rejectedA"), {
        status: "pending",
        moderationNote: "Approuvée",
      }),
    ),
  );
  await check(
    "a seller cannot jump the queue from rejected straight to approved",
    assertFails(
      updateDoc(doc(asSeller, "listings/rejectedA"), { status: "approved" }),
    ),
  );
  await check(
    "an account without canPost cannot resubmit — re-entering the queue is publishing",
    assertFails(
      updateDoc(doc(asForeign, "listings/rejectedC"), { status: "pending" }),
    ),
  );
  await check(
    "a stranger cannot resubmit somebody else's rejected listing",
    assertFails(
      updateDoc(doc(asOutsider, "listings/rejectedB"), { status: "pending" }),
    ),
  );
  await check(
    "the door is one-way: an approved listing cannot be pushed to rejected by its seller",
    assertFails(
      updateDoc(doc(asSeller, "listings/live"), { status: "rejected" }),
    ),
  );

  // ── Deciding a listing that has been decided before ─────────────────────
  // Found on a device, not here: the first version of the resubmission work
  // let a seller send a rejected listing back, and then the moderator who
  // had rejected it could not act on it. affectedKeys() lists keys whose
  // value CHANGED, and re-stamping moderatedBy with the same uid changes
  // nothing — so hasAll(['moderatedBy', ...]) failed and the write was
  // refused. With one moderator that made the queue a place listings could
  // enter and never leave, which is worse than the dead end it replaced.
  const asMod = env
    .authenticatedContext("moderator-uid", { moderator: true })
    .firestore();
  const asMod2 = env
    .authenticatedContext("moderator-2-uid", { moderator: true })
    .firestore();
  await check(
    "the moderator who rejected a listing can approve the corrected version",
    assertSucceeds(
      updateDoc(doc(asMod, "listings/resubmitted"), {
        status: "approved",
        moderationNote: null,
        moderatedBy: "moderator-uid",
        moderatedAt: new Date(),
      }),
    ),
  );
  // The reason hasAll was there in the first place, which must still hold:
  // an omitted moderatedBy carries the PREVIOUS moderator's uid through
  // request.resource.data, and that must not pass for somebody else.
  await check(
    "a second moderator cannot leave the first one's name on their decision",
    assertFails(
      updateDoc(doc(asMod2, "listings/resubmitted2"), {
        status: "approved",
        moderatedAt: new Date(),
      }),
    ),
  );
  await check(
    "a second moderator deciding under their own name is fine",
    assertSucceeds(
      updateDoc(doc(asMod2, "listings/resubmitted2"), {
        status: "approved",
        moderatedBy: "moderator-2-uid",
        moderatedAt: new Date(),
      }),
    ),
  );

  // ── The counters, which a reader may no longer touch at all ────────────
  //
  // These two assertions changed in Phase E, and the change is a tightening.
  //
  // They used to require that a reader COULD add exactly one view and one
  // contact, because the rules had an allow-update branch for each. That
  // branch checked with real care that the increment was exactly +1 and that
  // nothing else on the document moved — and never asked how many times it
  // could happen. Any signed-in account could loop it: a rival's advert
  // buried under fabricated views, our bill one write per iteration.
  //
  // The counters are now server-authored. A reader creates a counterMarkers
  // document whose ID is listingId_uid_kind_day, Firestore refuses the second
  // create of that id by itself, and onCounterMarkerCreated applies the
  // increment with the Admin SDK. So the correct assertion is the opposite of
  // the old one.
  await check(
    "a reader may no longer write a view count directly",
    assertFails(
      updateDoc(doc(asOutsider, "listings/live"), { viewCount: 6 }),
    ),
  );
  await check(
    "a reader cannot inflate the view count",
    assertFails(
      updateDoc(doc(asOutsider, "listings/live"), { viewCount: 900 }),
    ),
  );
  await check(
    "a reader cannot edit a price while bumping a counter",
    assertFails(
      updateDoc(doc(asOutsider, "listings/live"), { viewCount: 7, price: 1 }),
    ),
  );
  // The contact counter is the one a seller acts on — eleven people rang
  // about the Corolla and nobody rang about the fridge — so it gets the
  // same three questions the view counter gets, plus the one its rule was
  // missing.
  await check(
    "a reader may no longer write a contact count directly",
    assertFails(
      updateDoc(doc(asOutsider, "listings/live"), {
        contactCount: 1,
        contactCountToday: 1,
        contactCountDate: "2026-09-04",
      }),
    ),
  );

  // ── The marker that replaced them, and the bucket it cannot invent ────
  //
  // Phase E required `day` to be a ten-character string and nothing else.
  // The re-audit showed what that bought: the field is part of the document
  // id, so every distinct string is a distinct document and a distinct
  // allowed create. One account produced 55 markers for one listing in a
  // burst. The rule now derives the day from request.time and the client's
  // value merely has to agree.
  const utc = new Date();
  const today = utc.toISOString().slice(0, 10);
  const tomorrow = new Date(utc.getTime() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(utc.getTime() - 86400000).toISOString().slice(0, 10);
  const marker = (uid, listingId, kind, day, overrides = {}) => ({
    listingId,
    uid,
    kind,
    day,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
    ...overrides,
  });
  const markerId = (listingId, uid, kind, day) => `${listingId}_${uid}_${kind}_${day}`;

  await check(
    "a reader may record one counted view today",
    assertSucceeds(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "view", today)}`),
        marker(OUTSIDER, "live", "view", today),
      ),
    ),
  );
  await check(
    "the same reader cannot record the same view twice",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "view", today)}`),
        marker(OUTSIDER, "live", "view", today),
      ),
    ),
  );
  await check(
    "a day in the future is refused",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "view", tomorrow)}`),
        marker(OUTSIDER, "live", "view", tomorrow),
      ),
    ),
  );
  await check(
    "a fabricated past day is refused",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "view", yesterday)}`),
        marker(OUTSIDER, "live", "view", yesterday),
      ),
    ),
  );
  await check(
    "an arbitrary ten-character string is refused — the Phase E bypass",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "view", "0000000001")}`),
        marker(OUTSIDER, "live", "view", "0000000001"),
      ),
    ),
  );
  await check(
    "so is a non-date of the right length",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "view", "aaaaaaaaaa")}`),
        marker(OUTSIDER, "live", "view", "aaaaaaaaaa"),
      ),
    ),
  );
  await check(
    "a different KIND is its own bucket",
    assertSucceeds(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "share", today)}`),
        marker(OUTSIDER, "live", "share", today),
      ),
    ),
  );
  await check(
    "a different LISTING is its own bucket",
    assertSucceeds(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live-2", OUTSIDER, "view", today)}`),
        marker(OUTSIDER, "live-2", "view", today),
      ),
    ),
  );
  await check(
    "a different USER is its own bucket",
    assertSucceeds(
      setDoc(
        doc(asBuyer, `counterMarkers/${markerId("live", BUYER, "view", today)}`),
        marker(BUYER, "live", "view", today),
      ),
    ),
  );
  await check(
    "a listing id containing underscores still composes correctly",
    assertSucceeds(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("deal_of_the_day", OUTSIDER, "view", today)}`),
        marker(OUTSIDER, "deal_of_the_day", "view", today),
      ),
    ),
  );
  await check(
    "a reader cannot record a view under somebody else's name",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", "someone-else", "view", today)}`),
        marker("someone-else", "live", "view", today),
      ),
    ),
  );
  await check(
    "a signed-out visitor cannot record a counted event",
    assertFails(
      setDoc(
        doc(asGuest, `counterMarkers/${markerId("live", "anon", "view", today)}`),
        marker("anon", "live", "view", today),
      ),
    ),
  );
  await check(
    "a marker cannot be back-dated",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "contact", today)}`),
        marker(OUTSIDER, "live", "contact", today, { createdAt: new Date(2020, 0, 1) }),
      ),
    ),
  );
  await check(
    "a marker cannot ask to be kept for a year",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "contact", today)}`),
        marker(OUTSIDER, "live", "contact", today, {
          expiresAt: Timestamp.fromMillis(Date.now() + 365 * 86400000),
        }),
      ),
    ),
  );
  await check(
    "nor to be forgotten immediately",
    assertFails(
      setDoc(
        doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "contact", today)}`),
        marker(OUTSIDER, "live", "contact", today, {
          expiresAt: Timestamp.fromMillis(Date.now() + 60000),
        }),
      ),
    ),
  );
  await check(
    "nobody can read the markers back",
    assertFails(
      getDoc(doc(asOutsider, `counterMarkers/${markerId("live", OUTSIDER, "view", today)}`)),
    ),
  );
  await check(
    "a reader cannot inflate the contact count",
    assertFails(
      updateDoc(doc(asOutsider, "listings/live"), {
        contactCount: 400,
        contactCountToday: 400,
        contactCountDate: "2026-09-04",
      }),
    ),
  );
  // The hole this rule had: every counter beside it refused a listing that
  // is not approved, and this one did not — so figures could be moved on a
  // listing nobody can see. Nothing read them, which is why it survived.
  await check(
    "a contact cannot be counted on a listing that is not approved",
    assertFails(
      updateDoc(doc(asOutsider, "listings/pendingA"), {
        contactCount: 1,
        contactCountToday: 1,
        contactCountDate: "2026-09-04",
      }),
    ),
  );

  // ── Ratings ─────────────────────────────────────────────────────────────
  await check(
    "somebody who has been in contact can rate",
    assertSucceeds(
      setDoc(doc(asBuyer, `ratings/${BUYER}_${SELLER}`), {
        raterId: BUYER,
        ratedId: SELLER,
        stars: 5,
      }),
    ),
  );
  await check(
    "rating without ever having been in contact is refused",
    assertFails(
      setDoc(doc(asOutsider, `ratings/${OUTSIDER}_${SELLER}`), {
        raterId: OUTSIDER,
        ratedId: SELLER,
        stars: 5,
      }),
    ),
  );
  await check(
    "rating yourself is refused",
    assertFails(
      setDoc(doc(asBuyer, `ratings/${BUYER}_${BUYER}`), {
        raterId: BUYER,
        ratedId: BUYER,
        stars: 5,
      }),
    ),
  );
  await check(
    "six stars is refused",
    assertFails(
      setDoc(doc(asBuyer, `ratings/${BUYER}_${OUTSIDER}`), {
        raterId: BUYER,
        ratedId: OUTSIDER,
        stars: 6,
      }),
    ),
  );
  await check(
    "a rating cannot be filed in somebody else's name",
    assertFails(
      setDoc(doc(asOutsider, `ratings/${BUYER}_${SELLER}`), {
        raterId: BUYER,
        ratedId: SELLER,
        stars: 1,
      }),
    ),
  );

  // ── Conversations ───────────────────────────────────────────────────────
  await check(
    "a participant reads the thread",
    assertSucceeds(getDoc(doc(asBuyer, "conversations/thread"))),
  );
  await check(
    "somebody outside the thread cannot read it",
    assertFails(getDoc(doc(asOutsider, "conversations/thread"))),
  );
  await check(
    "somebody outside the thread cannot read its messages",
    assertFails(
      getDocs(collection(asOutsider, "conversations/thread/messages")),
    ),
  );
  await check(
    "a participant reads the messages",
    assertSucceeds(
      getDocs(collection(asSeller, "conversations/thread/messages")),
    ),
  );
  await check(
    "somebody outside the thread cannot post into it",
    assertFails(
      setDoc(doc(asOutsider, "conversations/thread/messages/x"), {
        senderId: OUTSIDER,
        text: "salut",
      }),
    ),
  );
  await check(
    "a participant cannot post as somebody else",
    assertFails(
      setDoc(doc(asSeller, "conversations/thread/messages/y"), {
        senderId: BUYER,
        text: "pas moi",
      }),
    ),
  );
  await check(
    "a participant posts as themselves",
    assertSucceeds(
      setDoc(doc(asSeller, "conversations/thread/messages/z"), {
        senderId: SELLER,
        text: "bonjour",
      }),
    ),
  );

  // ── Reports ─────────────────────────────────────────────────────────────
  await check(
    "anyone signed in can report a listing",
    assertSucceeds(
      setDoc(doc(asOutsider, `reports/live_${OUTSIDER}`), {
        reporterId: OUTSIDER,
        listingId: "live",
        reason: "spam",
      }),
    ),
  );
  await check(
    "a report cannot be filed in somebody else's name",
    assertFails(
      setDoc(doc(asOutsider, `reports/live_${BUYER}`), {
        reporterId: BUYER,
        listingId: "live",
        reason: "spam",
      }),
    ),
  );
  await check(
    "nobody can read reports back, not even their own",
    assertFails(getDoc(doc(asOutsider, `reports/live_${OUTSIDER}`))),
  );

  // ── Job applications ────────────────────────────────────────────────────
  // The id is the one the client now writes. It used to be "a1", which under
  // the deterministic-id rule fails for two reasons at once — and a case that
  // can pass for the wrong reason is not testing what its name says.
  await check(
    "an account without canPost cannot apply for a job",
    assertFails(
      setDoc(doc(asForeign, `jobApplications/live_${FOREIGN}`), {
        applicantUid: FOREIGN,
        employerUid: SELLER,
        jobId: "live",
        status: "new",
      }),
    ),
  );
  // A8. An auto-id let the same candidate apply as many times as they
  // tapped: one document, one push to the employer and one more copy of the
  // CV in Storage per tap.
  await check(
    "an application must be filed at jobId_applicantUid",
    assertFails(
      setDoc(doc(asOutsider, "jobApplications/whatever-i-like"), {
        applicantUid: OUTSIDER,
        employerUid: SELLER,
        jobId: "live",
        status: "new",
      }),
    ),
  );
  await check(
    "a candidate applies once",
    assertSucceeds(
      setDoc(doc(asOutsider, `jobApplications/live_${OUTSIDER}`), {
        applicantUid: OUTSIDER,
        employerUid: SELLER,
        jobId: "live",
        applicantMessage: "Je suis disponible immédiatement.",
        status: "new",
      }),
    ),
  );
  await check(
    "the same candidate cannot apply to the same job twice",
    assertFails(
      setDoc(doc(asOutsider, `jobApplications/live_${OUTSIDER}`), {
        applicantUid: OUTSIDER,
        employerUid: SELLER,
        jobId: "live",
        applicantMessage: "Encore moi.",
        status: "new",
      }),
    ),
  );
  await check(
    "a covering letter cannot be a pasted document",
    assertFails(
      setDoc(doc(asBuyer, `jobApplications/live_${BUYER}`), {
        applicantUid: BUYER,
        employerUid: SELLER,
        jobId: "live",
        applicantMessage: "x".repeat(2001),
        status: "new",
      }),
    ),
  );

  // ── Favourites and follows are personal ─────────────────────────────────
  await check(
    "a favourite can only be saved for yourself",
    assertFails(
      setDoc(doc(asOutsider, `favorites/${BUYER}_live`), {
        userId: BUYER,
        listingId: "live",
      }),
    ),
  );
  await check(
    "saving your own favourite works",
    assertSucceeds(
      setDoc(doc(asOutsider, `favorites/${OUTSIDER}_live`), {
        userId: OUTSIDER,
        listingId: "live",
      }),
    ),
  );

  // ══ Phase A ═════════════════════════════════════════════════════════════
  // Everything below was written against a specific audit finding, and every
  // one of them passed — that is, the attack succeeded — before the rule it
  // exercises existed. Each is attempted through the Firestore SDK directly,
  // which is the only way that matters: the app's own forms would never send
  // any of these.

  // ── A1. The Vérifié badge ───────────────────────────────────────────────
  // The badge means a human checked an RCCM and IFU against the national
  // registry. It travelled denormalised on the listing, written from the
  // phone, believed by every card that renders it — and filtered out of the
  // moderation screen as plumbing, so the human approving the listing never
  // saw the claim being made.
  await check(
    "a seller cannot publish wearing the Vérifié badge",
    assertFails(
      setDoc(doc(asSeller, "listings/forgedBadge"), {
        ...listing,
        sellerId: SELLER,
        sellerVerified: true,
      }),
    ),
  );
  await check(
    "a job post cannot carry the badge under its second name",
    assertFails(
      setDoc(doc(asSeller, "listings/forgedBadgeJob"), {
        ...listing,
        sellerId: SELLER,
        categoryKey: "jobs",
        verified: true,
      }),
    ),
  );
  await check(
    "an ordinary listing still publishes with the badge off",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/honestBadge"), {
        ...listing,
        sellerId: SELLER,
        sellerVerified: false,
      }),
    ),
  );
  await check(
    "a seller cannot switch the badge on after approval",
    assertFails(
      updateDoc(doc(asSeller, "listings/live"), { sellerVerified: true }),
    ),
  );
  // The other half of A1: the badge has to still be grantable, or closing
  // the hole would have quietly unverified every real company. Only the
  // Admin SDK can do it, which is what autoPublishVerifiedCompanyListing and
  // backfillVerifiedBadge run as.
  await check(
    "the server can still grant the badge",
    assertSucceeds(
      env.withSecurityRulesDisabled((ctx) =>
        updateDoc(doc(ctx.firestore(), "listings/live"), {
          sellerVerified: true,
        }),
      ),
    ),
  );

  // ── A2. Ownership ───────────────────────────────────────────────────────
  // The rule authorised on the stored sellerId and never asked whether the
  // incoming one matched, so a seller could publish, get approved, and then
  // move the listing onto somebody else's public profile — still carrying
  // their own phone number.
  await check(
    "a seller cannot hand their listing to another account",
    assertFails(
      updateDoc(doc(asSeller, "listings/live"), { sellerId: BUYER }),
    ),
  );
  await check(
    "a seller cannot orphan their listing by dropping sellerId",
    assertFails(
      updateDoc(doc(asSeller, "listings/live"), { sellerId: deleteField() }),
    ),
  );
  await check(
    "a stranger still cannot edit somebody else's listing",
    assertFails(
      updateDoc(doc(asOutsider, "listings/live"), { titleFr: "Détourné" }),
    ),
  );
  await check(
    "a seller can still edit the things an edit is for",
    assertSucceeds(
      updateDoc(doc(asSeller, "listings/live"), {
        titleFr: "Titre corrigé",
        descriptionFr: "Description corrigée.",
        price: 45000,
        city: "Porto-Novo",
        saleStatus: "negotiating",
      }),
    ),
  );

  // ── A6. The rest of the fields a listing asserts about itself ───────────
  await check(
    "a seller cannot type their own view count",
    assertFails(updateDoc(doc(asSeller, "listings/live"), { viewCount: 9000 })),
  );
  await check(
    "a seller cannot rewrite the name buyers see",
    assertFails(
      updateDoc(doc(asSeller, "listings/live"), {
        sellerCompanyName: "Bank of Africa",
      }),
    ),
  );
  await check(
    "a listing cannot be published with its counters already seeded",
    assertFails(
      setDoc(doc(asSeller, "listings/seededCounters"), {
        ...listing,
        sellerId: SELLER,
        viewCount: 4000,
      }),
    ),
  );
  await check(
    "a listing cannot be published already stamped approved by somebody",
    assertFails(
      setDoc(doc(asSeller, "listings/forgedAudit"), {
        ...listing,
        sellerId: SELLER,
        approvedAt: new Date(),
        moderatedBy: "moderator-uid",
      }),
    ),
  );
  // Every browse query orders by createdAt descending, so a date the client
  // chooses is a permanent place at the top of every feed.
  await check(
    "a listing cannot be published with a date it chose itself",
    assertFails(
      setDoc(doc(asSeller, "listings/forgedDate"), {
        ...listing,
        sellerId: SELLER,
        createdAt: Timestamp.fromMillis(Date.now() + 3153600000000),
      }),
    ),
  );
  await check(
    "a seller cannot backdate an existing listing to the top of the feed",
    assertFails(
      updateDoc(doc(asSeller, "listings/live"), {
        createdAt: Timestamp.fromMillis(Date.now() + 3153600000000),
      }),
    ),
  );
  // expiresAt is the only thing keeping the catalogue from growing forever,
  // and the client writes it — at publish and again on every renewal.
  await check(
    "a listing cannot be given a lifetime measured in decades",
    assertFails(
      setDoc(doc(asSeller, "listings/immortal"), {
        ...listing,
        sellerId: SELLER,
        expiresAt: Timestamp.fromMillis(Date.now() + 3153600000000),
      }),
    ),
  );
  await check(
    "a listing publishes with an ordinary expiry",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/mortal"), {
        ...listing,
        sellerId: SELLER,
        expiresAt: inThirtyDays(),
      }),
    ),
  );
  await check(
    "renewing a listing from the dashboard still works",
    assertSucceeds(
      updateDoc(doc(asSeller, "listings/live"), { expiresAt: inThirtyDays() }),
    ),
  );

  // ── A7. Length, on the server, where it binds ───────────────────────────
  await check(
    "a description cannot be a pasted document",
    assertFails(
      setDoc(doc(asSeller, "listings/wall"), {
        ...listing,
        sellerId: SELLER,
        descriptionFr: "x".repeat(5001),
      }),
    ),
  );
  await check(
    "a title cannot be a paragraph",
    assertFails(
      setDoc(doc(asSeller, "listings/longTitle"), {
        ...listing,
        sellerId: SELLER,
        titleFr: "x".repeat(121),
      }),
    ),
  );
  await check(
    "a price cannot be astronomical",
    assertFails(
      setDoc(doc(asSeller, "listings/richest"), {
        ...listing,
        sellerId: SELLER,
        price: 99999999999999,
      }),
    ),
  );
  await check(
    "a real listing's own text and price are comfortably inside the limits",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/ordinary"), {
        ...listing,
        sellerId: SELLER,
        titleFr: "Toyota RAV4 2013, boîte automatique, climatisation",
        descriptionFr: "Véhicule bien entretenu. ".repeat(40),
        price: 3500000,
      }),
    ),
  );
  await check(
    "an edit cannot smuggle a pasted document past the create rule",
    assertFails(
      updateDoc(doc(asSeller, "listings/live"), {
        descriptionFr: "x".repeat(5001),
      }),
    ),
  );
  await check(
    "a message cannot be a pasted document",
    assertFails(
      setDoc(doc(asBuyer, "conversations/thread/messages/wall"), {
        senderId: BUYER,
        text: "x".repeat(4001),
      }),
    ),
  );
  await check(
    "an ordinary message still sends",
    assertSucceeds(
      setDoc(doc(asBuyer, "conversations/thread/messages/normal"), {
        senderId: BUYER,
        text: "Bonjour, est-ce toujours disponible ?",
      }),
    ),
  );
  await check(
    "a photo message carries no text at all and still sends",
    assertSucceeds(
      setDoc(doc(asBuyer, "conversations/thread/messages/photo"), {
        senderId: BUYER,
        imageUrl: "https://example.test/x.jpg",
      }),
    ),
  );

  // ── A5. The last unauthenticated writes in the database ─────────────────
  // These three counter rules were the only place a caller with no account
  // could write. The Firebase config ships in the app bundle and there is no
  // App Check, so that was an open, billed write path against any listing id
  // a script could read.
  await check(
    "a signed-out reader can no longer add a view",
    assertFails(updateDoc(doc(asGuest, "listings/live"), { viewCount: 6 })),
  );
  await check(
    "a signed-out reader can no longer count a contact",
    assertFails(
      updateDoc(doc(asGuest, "listings/live"), {
        contactCount: 1,
        contactCountToday: 1,
        contactCountDate: "2026-09-10",
      }),
    ),
  );
  await check(
    "a signed-out reader can no longer count a share",
    assertFails(updateDoc(doc(asGuest, "listings/live"), { shareCount: 2 })),
  );
  await check(
    "a signed-out visitor can still read the listing itself",
    assertSucceeds(getDoc(doc(asGuest, "listings/live"))),
  );

  // ── The document the app actually sends ─────────────────────────────────
  // Every case above builds its payload from a four-field fixture, which is
  // how a rule can pass a whole suite and still refuse every real publish.
  // It nearly did: tightening sellerVerified made the create rule reject the
  // value CreateListingScreen was sending — `Boolean(accountType ===
  // 'company' && verificationStatus === 'verified')` — so publishing would
  // have broken for exactly the verified companies the badge exists for,
  // and every test here would still have been green.
  //
  // So this one mirrors the real payload: the seller-identity block, the
  // media block, the counters that are absent, the lifecycle fields. Keep it
  // in step with the `data` object in CreateListingScreen#handleSubmit and
  // the addDoc in ParkInventoryScreen.
  const publishedShape = {
    sellerId: SELLER,
    sellerName: "Kossi A.",
    sellerMemberSince: null,
    sellerPhotoUrl: null,
    sellerVerified: false,
    sellerCompanyName: null,
    titleEn: "Toyota RAV4 2013",
    titleFr: "Toyota RAV4 2013",
    descriptionEn: "Véhicule bien entretenu, climatisation, boîte auto.",
    descriptionFr: "Véhicule bien entretenu, climatisation, boîte auto.",
    price: 3500000,
    condition: "used",
    negotiable: true,
    categoryKey: "vehicles",
    customCategory: null,
    customTrade: null,
    city: "Cotonou",
    latitude: 6.37,
    longitude: 2.39,
    media: [
      {
        mediaType: "image",
        mediaUrl: "https://firebasestorage.googleapis.com/x.jpg",
        mediaPath: `listings/${SELLER}/1.jpg`,
        thumbUrl: "https://firebasestorage.googleapis.com/x-thumb.jpg",
        thumbPath: `listings/${SELLER}/1-thumb.jpg`,
      },
    ],
    mediaType: "image",
    mediaUrl: "https://firebasestorage.googleapis.com/x.jpg",
    mediaPath: `listings/${SELLER}/1.jpg`,
    thumbUrl: "https://firebasestorage.googleapis.com/x-thumb.jpg",
    isPromoted: false,
    promotionRequested: false,
    popular: false,
    status: "pending",
    expiresAt: inThirtyDays(),
    createdAt: serverTimestamp(),
  };
  await check(
    "the document CreateListingScreen actually sends still publishes",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/realShape"), publishedShape),
    ),
  );
  // A job post carries the badge under a second name, and the same screen
  // writes it. Same trap, one field over.
  await check(
    "the document a job post actually sends still publishes",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/realShapeJob"), {
        ...publishedShape,
        categoryKey: "jobs",
        company: "Sobebra",
        jobType: "fullTime",
        jobCategory: "logistics",
        verified: false,
        price: 0,
        createdAt: serverTimestamp(),
      }),
    ),
  );
  // What the edit flow sends: CreateListingScreen destructures the identity
  // and lifecycle fields out before updateDoc, so an ordinary edit touches
  // none of the newly frozen keys.
  await check(
    "the update an edit actually sends still saves",
    assertSucceeds(
      updateDoc(doc(asSeller, "listings/realShape"), {
        titleFr: "Toyota RAV4 2013 — prix revu",
        descriptionFr: "Véhicule bien entretenu. Prix négociable.",
        price: 3200000,
        previousPrice: 3500000,
        priceDroppedAt: serverTimestamp(),
        media: publishedShape.media,
        updatedAt: serverTimestamp(),
      }),
    ),
  );
  await check(
    "a seller can still delete their own listing",
    assertSucceeds(deleteDoc(doc(asSeller, "listings/realShapeJob"))),
  );
  await check(
    "a stranger still cannot delete somebody else's listing",
    assertFails(deleteDoc(doc(asOutsider, "listings/realShape"))),
  );
  // Opening a chat and sending the first message — the whole contact flow a
  // buyer goes through, unchanged by Phase A and pinned so it stays that way.
  await check(
    "a buyer can still open a conversation on a listing",
    assertSucceeds(
      setDoc(doc(asBuyer, `conversations/realShape_${BUYER}`), {
        listingId: "realShape",
        listingTitle: "Toyota RAV4 2013",
        sellerId: SELLER,
        buyerId: BUYER,
        participantIds: [SELLER, BUYER],
        unreadCount: { [SELLER]: 0, [BUYER]: 0 },
        createdAt: serverTimestamp(),
      }),
    ),
  );
  await check(
    "and send the first message into it",
    assertSucceeds(
      setDoc(doc(asBuyer, `conversations/realShape_${BUYER}/messages/m1`), {
        senderId: BUYER,
        text: "Bonjour, est-ce toujours disponible ?",
        createdAt: serverTimestamp(),
      }),
    ),
  );

  // ══ Phase B ═════════════════════════════════════════════════════════════

  // ── B9. Conversation identity, and blocking that blocks ─────────────────
  await check(
    "a conversation cannot be opened at an id of the caller's choosing",
    assertFails(
      setDoc(doc(asOutsider, "conversations/chez-nous-securite"), {
        listingId: "realShape",
        listingTitle: "Chez-Nous · Sécurité",
        sellerId: SELLER,
        buyerId: OUTSIDER,
        participantIds: [SELLER, OUTSIDER],
      }),
    ),
  );
  await check(
    "a conversation cannot name a seller the listing does not have",
    assertFails(
      setDoc(doc(asOutsider, `conversations/realShape_${OUTSIDER}`), {
        listingId: "realShape",
        sellerId: BUYER,
        buyerId: OUTSIDER,
        participantIds: [BUYER, OUTSIDER],
      }),
    ),
  );
  await check(
    "a conversation cannot be opened against somebody who is not in it",
    assertFails(
      setDoc(doc(asOutsider, `conversations/realShape_${OUTSIDER}`), {
        listingId: "realShape",
        sellerId: SELLER,
        buyerId: OUTSIDER,
        participantIds: [SELLER, BUYER, OUTSIDER],
      }),
    ),
  );
  await check(
    "a genuine conversation still opens",
    assertSucceeds(
      setDoc(doc(asOutsider, `conversations/realShape_${OUTSIDER}`), {
        listingId: "realShape",
        listingTitle: "Toyota RAV4 2013",
        sellerId: SELLER,
        buyerId: OUTSIDER,
        participantIds: [SELLER, OUTSIDER],
        createdAt: serverTimestamp(),
      }),
    ),
  );
  await check(
    "a participant cannot add a third person to the thread",
    assertFails(
      updateDoc(doc(asOutsider, `conversations/realShape_${OUTSIDER}`), {
        participantIds: [SELLER, OUTSIDER, FOREIGN],
      }),
    ),
  );
  await check(
    "a participant cannot repoint the thread at another listing",
    assertFails(
      updateDoc(doc(asOutsider, `conversations/realShape_${OUTSIDER}`), {
        listingId: "live",
      }),
    ),
  );
  await check(
    "a participant can still write the things a send writes",
    assertSucceeds(
      updateDoc(doc(asOutsider, `conversations/realShape_${OUTSIDER}`), {
        lastMessage: "Bonjour",
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: OUTSIDER,
        [`unreadCount.${SELLER}`]: 1,
      }),
    ),
  );
  await check(
    "a message sends while nobody has blocked anybody",
    assertSucceeds(
      setDoc(
        doc(asOutsider, `conversations/realShape_${OUTSIDER}/messages/a`),
        { senderId: OUTSIDER, text: "Bonjour", createdAt: serverTimestamp() },
      ),
    ),
  );
  await check(
    "blocking is a write the blocker is allowed to make",
    assertSucceeds(
      updateDoc(doc(asSeller, `conversations/realShape_${OUTSIDER}`), {
        [`blockedBy.${SELLER}`]: true,
      }),
    ),
  );
  // The finding this closes: the block was a field only the client and the
  // push trigger read, so the blocked party kept writing and the person who
  // blocked them kept receiving — silently.
  await check(
    "a blocked user cannot post through the SDK",
    assertFails(
      setDoc(
        doc(asOutsider, `conversations/realShape_${OUTSIDER}/messages/b`),
        { senderId: OUTSIDER, text: "encore moi", createdAt: serverTimestamp() },
      ),
    ),
  );
  await check(
    "and neither can the person who did the blocking",
    assertFails(
      setDoc(doc(asSeller, `conversations/realShape_${OUTSIDER}/messages/c`), {
        senderId: SELLER,
        text: "…",
        createdAt: serverTimestamp(),
      }),
    ),
  );
  await check(
    "unblocking lets the thread run again",
    assertSucceeds(
      updateDoc(doc(asSeller, `conversations/realShape_${OUTSIDER}`), {
        [`blockedBy.${SELLER}`]: false,
      }),
    ),
  );
  await check(
    "a message sends once the block is lifted",
    assertSucceeds(
      setDoc(
        doc(asOutsider, `conversations/realShape_${OUTSIDER}/messages/d`),
        { senderId: OUTSIDER, text: "merci", createdAt: serverTimestamp() },
      ),
    ),
  );

  // ── D7. Search metadata is the server's ─────────────────────────────────
  // searchTokens is what makes a listing findable, so a client that could
  // write it could put "toyota", "corolla" and "iphone" on a broken chair and
  // appear in all three searches — invisibly, because a moderator reads the
  // title and not the token array. Refused on the way in, frozen afterwards,
  // and written only by syncListingSearchTokens under the Admin SDK.
  await check(
    "a seller cannot publish with search tokens of their own choosing",
    assertFails(
      setDoc(doc(asSeller, "listings/stuffed"), {
        ...listing,
        sellerId: SELLER,
        searchTokens: ["toyota", "corolla", "iphone", "climatiseur"],
      }),
    ),
  );
  await check(
    "a seller cannot add search tokens to a listing after approval",
    assertFails(
      updateDoc(doc(asSeller, "listings/live"), {
        searchTokens: ["iphone", "toyota"],
      }),
    ),
  );
  await check(
    "a stranger cannot rewrite somebody else's search tokens",
    assertFails(
      updateDoc(doc(asOutsider, "listings/live"), { searchTokens: ["spam"] }),
    ),
  );
  await check(
    "an ordinary publish, carrying no tokens, still works",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/unstuffed"), {
        ...listing,
        sellerId: SELLER,
      }),
    ),
  );
  await check(
    "the server can write search tokens",
    assertSucceeds(
      env.withSecurityRulesDisabled((ctx) =>
        updateDoc(doc(ctx.firestore(), "listings/live"), {
          searchTokens: ["congelateur", "hisense"],
        }),
      ),
    ),
  );
  // The size bound, exercised against the Admin SDK's own write path being
  // absent: a client write is refused for carrying the field at all, so this
  // proves the belt-and-braces ceiling is real rather than decorative.
  await check(
    "an oversized token array is refused even where the field is permitted",
    assertFails(
      setDoc(doc(asSeller, "listings/hugeTokens"), {
        ...listing,
        sellerId: SELLER,
        searchTokens: Array.from({ length: 500 }, (_, i) => `spam${i}`),
      }),
    ),
  );
  // And the read side: matching tokens must never make an unapproved listing
  // visible. The status filter is what does that, and it is the rules that
  // require it.
  await check(
    "a search that omits the approved filter is refused",
    assertFails(
      getDocs(
        query(
          collection(asOutsider, "listings"),
          where("searchTokens", "array-contains", "congelateur"),
        ),
      ),
    ),
  );
  await check(
    "a search that keeps the approved filter is allowed",
    assertSucceeds(
      getDocs(
        query(
          collection(asOutsider, "listings"),
          where("status", "==", "approved"),
          where("searchTokens", "array-contains", "congelateur"),
        ),
      ),
    ),
  );

  await env.cleanup();

  const failed = results.filter(([ok]) => !ok);
  results.forEach(([ok, label]) =>
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`),
  );
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} failing`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} rule cases across the whole file`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
