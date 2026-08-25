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
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const SELLER = "seller-uid";
const BUYER = "buyer-uid";
const OUTSIDER = "outsider-uid";
const FOREIGN = "foreign-uid"; // signed in, but no canPost claim

const listing = {
  sellerId: SELLER,
  status: "pending",
  titleFr: "Annonce en attente",
  categoryKey: "services",
  city: "Cotonou",
};

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

  // ── The counters a reader is allowed to touch ───────────────────────────
  await check(
    "a reader may add one view",
    assertSucceeds(
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
  await check(
    "an account without canPost cannot apply for a job",
    assertFails(
      setDoc(doc(asForeign, "jobApplications/a1"), {
        applicantUid: FOREIGN,
        employerUid: SELLER,
        jobId: "live",
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
