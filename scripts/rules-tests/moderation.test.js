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
const { doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");

const MOD = "moderator-uid";
const SELLER = "seller-uid";
const OUTSIDER = "outsider-uid";

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
  ];
  await env.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all(
      DOCS.map((id) => setDoc(doc(ctx.firestore(), `listings/${id}`), listing)),
    );
    await setDoc(doc(ctx.firestore(), "listings/own"), {
      ...listing,
      sellerId: MOD,
    });
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
