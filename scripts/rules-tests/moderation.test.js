// The moderation rules, exercised against the Firestore emulator.
//
// Every other check in scripts/ reads the rules as text — it can tell you the
// line is present, never that it does what the line appears to say. These run
// the real rules engine, which is the only thing that answers "can this
// account actually do this".
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
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const MOD = "moderator-uid";
const SELLER = "seller-uid";
const OUTSIDER = "outsider-uid";

// serverTimestamp() rather than a literal: the create rule requires
// createdAt to equal request.time, because every browse query orders by it
// and a date the client chooses is a permanent place at the top of the feed.
const listing = {
  sellerId: SELLER,
  status: "pending",
  titleFr: "Annonce en attente",
  categoryKey: "services",
  city: "Cotonou",
  createdAt: serverTimestamp(),
};

const results = [];
const check = async (label, promise) => {
  try {
    await promise;
    results.push([true, label]);
  } catch (error) {
    results.push([false, `${label} — ${error.message?.slice(0, 120)}`]);
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

  // One document per case. Sharing one let an earlier approval leave it in
  // "approved", so a later "seller approves their own" passed because the
  // status had not changed — a green tick for a reason unrelated to the rule.
  const DOCS = [
    "read",
    "approve",
    "misattribute",
    "unsigned",
    "priceEdit",
    "sellerApprove",
    "sellerForge",
    "outsider",
    "promote",
    "promoteForever",
    "promoteSelf",
    "unpromote",
  ];
  await env.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all(
      DOCS.map((id) => setDoc(doc(ctx.firestore(), `listings/${id}`), listing)),
    );
    await setDoc(doc(ctx.firestore(), "listings/own"), {
      ...listing,
      sellerId: MOD,
    });
    // Featuring only ever happens on something already public, so these
    // start where the real ones would.
    await Promise.all(
      ["promote", "promoteForever", "promoteSelf", "unpromote"].map((id) =>
        setDoc(doc(ctx.firestore(), `listings/${id}`), {
          ...listing,
          status: "approved",
          ...(id === "unpromote"
            ? {
                isPromoted: true,
                promotedUntil: new Date(Date.now() + 10 * 86400000),
              }
            : {}),
        }),
      ),
    );
  });

  const asModerator = env
    .authenticatedContext(MOD, { moderator: true, canPost: true })
    .firestore();
  const asSeller = env
    .authenticatedContext(SELLER, { canPost: true })
    .firestore();
  const asOutsider = env
    .authenticatedContext(OUTSIDER, { canPost: true })
    .firestore();

  // --- reading the queue
  await check(
    "moderator can read a pending listing",
    assertSucceeds(getDoc(doc(asModerator, "listings/read"))),
  );
  await check(
    "the author can read their own pending listing",
    assertSucceeds(getDoc(doc(asSeller, "listings/read"))),
  );
  await check(
    "a stranger cannot read a pending listing",
    assertFails(getDoc(doc(asOutsider, "listings/read"))),
  );

  // --- deciding
  await check(
    "moderator can approve, recording themselves",
    assertSucceeds(
      updateDoc(doc(asModerator, "listings/approve"), {
        status: "approved",
        moderatedBy: MOD,
        moderatedAt: new Date(),
        moderationNote: null,
      }),
    ),
  );
  await check(
    "moderator cannot attribute the decision to somebody else",
    assertFails(
      updateDoc(doc(asModerator, "listings/misattribute"), {
        status: "rejected",
        moderatedBy: SELLER,
        moderatedAt: new Date(),
      }),
    ),
  );
  await check(
    "a decision must name a decider",
    assertFails(
      updateDoc(doc(asModerator, "listings/unsigned"), { status: "rejected" }),
    ),
  );
  await check(
    "moderator cannot approve their own listing",
    assertFails(
      updateDoc(doc(asModerator, "listings/own"), {
        status: "approved",
        moderatedBy: MOD,
        moderatedAt: new Date(),
      }),
    ),
  );
  // --- featuring
  //
  // The whole point of the change: a seller could set isPromoted themselves,
  // free and for ever, because the rules had never heard of the field.
  const inDays = (n) => new Date(Date.now() + n * 86400000);

  await check(
    "moderator can feature an approved listing, with an end date",
    assertSucceeds(
      updateDoc(doc(asModerator, "listings/promote"), {
        status: "approved",
        isPromoted: true,
        promotedUntil: inDays(30),
        moderatedBy: MOD,
        moderatedAt: new Date(),
      }),
    ),
  );
  await check(
    "a promotion cannot be granted for longer than the cap",
    assertFails(
      updateDoc(doc(asModerator, "listings/promoteForever"), {
        status: "approved",
        isPromoted: true,
        promotedUntil: inDays(365),
        moderatedBy: MOD,
        moderatedAt: new Date(),
      }),
    ),
  );
  await check(
    "a promotion cannot be granted without an end date",
    assertFails(
      updateDoc(doc(asModerator, "listings/promoteSelf"), {
        status: "approved",
        isPromoted: true,
        moderatedBy: MOD,
        moderatedAt: new Date(),
      }),
    ),
  );
  await check(
    "moderator can stop featuring",
    assertSucceeds(
      updateDoc(doc(asModerator, "listings/unpromote"), {
        status: "approved",
        isPromoted: false,
        promotedUntil: null,
        moderatedBy: MOD,
        moderatedAt: new Date(),
      }),
    ),
  );
  await check(
    "the seller cannot feature their own listing by editing it",
    assertFails(
      updateDoc(doc(asSeller, "listings/promoteSelf"), {
        isPromoted: true,
        promotedUntil: inDays(30),
      }),
    ),
  );
  await check(
    "the seller cannot publish a listing already featured",
    assertFails(
      setDoc(doc(asSeller, "listings/newPromoted"), {
        ...listing,
        isPromoted: true,
      }),
    ),
  );
  // --- the category a seller writes for themselves
  //
  // Whatever they type here is offered to every future seller who picks
  // "Autre", so an unbounded one is a paragraph in everyone's chip row.
  await check(
    "a seller can name their own category",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/customCat"), {
        ...listing,
        categoryKey: "other",
        customCategory: "Instruments de musique",
      }),
    ),
  );
  await check(
    "a category label longer than the cap is refused",
    assertFails(
      setDoc(doc(asSeller, "listings/customCatLong"), {
        ...listing,
        categoryKey: "other",
        customCategory: "x".repeat(41),
      }),
    ),
  );
  await check(
    "a category label that is not a string is refused",
    assertFails(
      setDoc(doc(asSeller, "listings/customCatType"), {
        ...listing,
        categoryKey: "other",
        customCategory: { paragraph: "x".repeat(200) },
      }),
    ),
  );
  await check(
    "a trade label longer than the cap is refused",
    assertFails(
      setDoc(doc(asSeller, "listings/customTradeLong"), {
        ...listing,
        categoryKey: "services",
        customTrade: "x".repeat(41),
      }),
    ),
  );

  await check(
    "the seller can still ask to be featured",
    assertSucceeds(
      setDoc(doc(asSeller, "listings/newRequest"), {
        ...listing,
        isPromoted: false,
        promotionRequested: true,
      }),
    ),
  );

  await check(
    "moderator cannot edit a price while approving",
    assertFails(
      updateDoc(doc(asModerator, "listings/priceEdit"), {
        status: "approved",
        moderatedBy: MOD,
        moderatedAt: new Date(),
        price: 1,
      }),
    ),
  );
  await check(
    "a seller cannot approve their own listing",
    assertFails(
      updateDoc(doc(asSeller, "listings/sellerApprove"), {
        status: "approved",
        moderatedBy: SELLER,
        moderatedAt: new Date(),
      }),
    ),
  );
  await check(
    "a seller cannot stamp the audit fields on their own listing",
    assertFails(
      updateDoc(doc(asSeller, "listings/sellerForge"), {
        titleFr: "Annonce modifiée",
        moderatedBy: MOD,
        moderatedAt: new Date(),
      }),
    ),
  );
  await check(
    "a seller may still edit their own listing normally",
    assertSucceeds(
      updateDoc(doc(asSeller, "listings/sellerForge"), {
        titleFr: "Annonce corrigée",
      }),
    ),
  );
  await check(
    "a stranger cannot approve anything",
    assertFails(
      updateDoc(doc(asOutsider, "listings/outsider"), {
        status: "approved",
        moderatedBy: OUTSIDER,
        moderatedAt: new Date(),
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
  console.log(`\nclean: ${results.length} moderation rule cases`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
