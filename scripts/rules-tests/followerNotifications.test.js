// The two things the client must never be able to touch.
//
// followerNotificationProcessedAt is the marker that says a listing's first
// publication has already been fanned out to followers. It is what stops a
// price correction re-announcing the listing. A seller who could clear it
// could announce the same listing to their followers as often as they liked,
// which is spam with the app's own voice.
//
// sellers/{uid}/notifications is where those announcements land. It is the
// notification, not a derivation of one, so a client that could write there
// could put words in the app's mouth on somebody else's phone — or delete a
// moderation decision from their own.
//
// Both are server-owned. This proves the rules say so.
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const SELLER = "seller-uid";
const OTHER = "other-uid";

const listing = {
  sellerId: SELLER,
  status: "approved",
  titleFr: "Annonce publiee",
  categoryKey: "services",
  city: "Cotonou",
  price: 1000,
  createdAt: serverTimestamp(),
  followerNotificationProcessedAt: serverTimestamp(),
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
    projectId: "follower-notifications-probe",
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, "..", "..", "firestore.rules"),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  const IDS = ["clear", "restamp", "alongside", "untouched"];
  await env.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all(
      IDS.map((id) => setDoc(doc(ctx.firestore(), `listings/${id}`), listing)),
    );
    await setDoc(
      doc(ctx.firestore(), `sellers/${SELLER}/notifications/L1`),
      { title: "Boutique a publie une annonce", body: "Robe wax", type: "followedSellerListing" },
    );
  });

  const seller = env.authenticatedContext(SELLER).firestore();
  const other = env.authenticatedContext(OTHER).firestore();

  // ── The processing marker ────────────────────────────────────────────
  await check(
    "a seller cannot clear the processing marker",
    assertFails(
      updateDoc(doc(seller, "listings/clear"), {
        followerNotificationProcessedAt: null,
      }),
    ),
  );
  await check(
    "a seller cannot re-stamp the processing marker",
    assertFails(
      updateDoc(doc(seller, "listings/restamp"), {
        followerNotificationProcessedAt: serverTimestamp(),
      }),
    ),
  );
  await check(
    "a seller cannot slip it in beside a legitimate edit",
    assertFails(
      updateDoc(doc(seller, "listings/alongside"), {
        titleFr: "Annonce corrigee",
        followerNotificationProcessedAt: null,
      }),
    ),
  );
  // The freeze must not cost the seller an ordinary edit.
  await check(
    "a seller can still edit their own listing",
    assertSucceeds(
      updateDoc(doc(seller, "listings/untouched"), { titleFr: "Annonce corrigee" }),
    ),
  );
  await check(
    "somebody else cannot touch the marker at all",
    assertFails(
      updateDoc(doc(other, "listings/clear"), {
        followerNotificationProcessedAt: null,
      }),
    ),
  );

  // ── The notification rows ────────────────────────────────────────────
  await check(
    "the owner can read their own notifications",
    assertSucceeds(getDoc(doc(seller, `sellers/${SELLER}/notifications/L1`))),
  );
  await check(
    "nobody else can read them",
    assertFails(getDoc(doc(other, `sellers/${SELLER}/notifications/L1`))),
  );
  await check(
    "the owner cannot write one",
    assertFails(
      setDoc(doc(seller, `sellers/${SELLER}/notifications/forged`), {
        title: "Gagnez un telephone",
        body: "Cliquez ici",
        type: "followedSellerListing",
      }),
    ),
  );
  await check(
    "the owner cannot edit one",
    assertFails(
      updateDoc(doc(seller, `sellers/${SELLER}/notifications/L1`), { title: "autre" }),
    ),
  );
  await check(
    "the owner cannot delete one",
    assertFails(deleteDoc(doc(seller, `sellers/${SELLER}/notifications/L1`))),
  );
  await check(
    "a stranger cannot plant one on somebody else",
    assertFails(
      setDoc(doc(other, `sellers/${SELLER}/notifications/planted`), {
        title: "Votre compte est suspendu",
        body: "Repondez immediatement",
      }),
    ),
  );

  await env.cleanup();

  const failed = results.filter(([ok]) => !ok);
  results.forEach(([ok, label]) => console.log(`${ok ? "  ok  " : "FAIL  "}${label}`));
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} failing`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} follower-notification rule(s) hold`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
