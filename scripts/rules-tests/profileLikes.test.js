// Who may like a profile, who may see those likes, and who may undo one.
//
// A profile like is public by design — the person liked is meant to see who
// liked them — and that makes it the opposite of the heart on a LISTING,
// which writes `favorites` and is readable by its author alone. The two
// must never be confused, so this file proves both sides: the new
// collection admits exactly two readers, and the old one still admits one.
//
// The cases that matter are the ones a plausible rule edit would open:
// liking in somebody else's name, liking yourself to inflate your own
// counter, writing the document under an id that lets you like twice, and
// editing an existing like to point at a different person.
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
  getDocs,
  collection,
  query,
  where,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const LIKER = "liker-uid";
const SELLER = "seller-uid";
const STRANGER = "stranger-uid";
const ID = `${LIKER}_${SELLER}`;

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
    projectId: "profile-likes-probe",
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, "..", "..", "firestore.rules"),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  const liker = env.authenticatedContext(LIKER).firestore();
  const seller = env.authenticatedContext(SELLER).firestore();
  const stranger = env.authenticatedContext(STRANGER).firestore();
  const anon = env.unauthenticatedContext().firestore();

  const like = { likerId: LIKER, sellerId: SELLER, createdAt: new Date() };

  // ── Creating ─────────────────────────────────────────────────────────
  await check(
    "an unauthenticated visitor cannot like a profile",
    assertFails(setDoc(doc(anon, `profileLikes/${ID}`), like)),
  );
  await check(
    "a like cannot be written in somebody else's name",
    assertFails(
      setDoc(doc(stranger, `profileLikes/${STRANGER}_${SELLER}`), {
        ...like,
        likerId: LIKER,
      }),
    ),
  );
  await check(
    "a like cannot be filed under an id that does not name the pair",
    assertFails(setDoc(doc(liker, "profileLikes/anything-at-all"), like)),
  );
  await check(
    "nobody can like their own profile",
    assertFails(
      setDoc(doc(seller, `profileLikes/${SELLER}_${SELLER}`), {
        likerId: SELLER,
        sellerId: SELLER,
        createdAt: new Date(),
      }),
    ),
  );
  await check(
    "the liker can like another profile",
    assertSucceeds(setDoc(doc(liker, `profileLikes/${ID}`), like)),
  );

  // ── Reading ──────────────────────────────────────────────────────────
  await check(
    "the liker can read their own like, so the button knows its state",
    assertSucceeds(getDoc(doc(liker, `profileLikes/${ID}`))),
  );
  await check(
    "the person liked can read a like they received",
    assertSucceeds(getDoc(doc(seller, `profileLikes/${ID}`))),
  );
  await check(
    "the person liked can list the likes they received",
    assertSucceeds(
      getDocs(
        query(collection(seller, "profileLikes"), where("sellerId", "==", SELLER)),
      ),
    ),
  );
  await check(
    "an unrelated account cannot read somebody else's like",
    assertFails(getDoc(doc(stranger, `profileLikes/${ID}`))),
  );
  await check(
    "an unrelated account cannot enumerate another person's likes received",
    assertFails(
      getDocs(
        query(collection(stranger, "profileLikes"), where("sellerId", "==", SELLER)),
      ),
    ),
  );

  // ── Editing ──────────────────────────────────────────────────────────
  await check(
    "a like cannot be repointed at a different person",
    assertFails(
      updateDoc(doc(liker, `profileLikes/${ID}`), { sellerId: STRANGER }),
    ),
  );
  await check(
    "nor can its author be rewritten",
    assertFails(
      updateDoc(doc(seller, `profileLikes/${ID}`), { likerId: SELLER }),
    ),
  );

  // ── Deleting ─────────────────────────────────────────────────────────
  await check(
    "an unrelated account cannot delete somebody else's like",
    assertFails(deleteDoc(doc(stranger, `profileLikes/${ID}`))),
  );
  await check(
    "the person liked cannot delete a like given to them",
    assertFails(deleteDoc(doc(seller, `profileLikes/${ID}`))),
  );
  await check(
    "the liker can take their own like back",
    assertSucceeds(deleteDoc(doc(liker, `profileLikes/${ID}`))),
  );

  // ── The boundary this feature must not move ──────────────────────────
  //
  // A listing save stays private to the person who made it, including from
  // the seller who owns the listing. Adding a public profile like must not
  // have widened this by a single principal.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `listings/listing-1`), {
      sellerId: SELLER,
      status: "approved",
    });
    await setDoc(doc(ctx.firestore(), `favorites/${LIKER}_listing-1`), {
      userId: LIKER,
      listingId: "listing-1",
      createdAt: new Date(),
    });
  });
  await check(
    "the saver can still read their own save",
    assertSucceeds(getDoc(doc(liker, `favorites/${LIKER}_listing-1`))),
  );
  await check(
    "the seller still cannot see who saved their listing",
    assertFails(getDoc(doc(seller, `favorites/${LIKER}_listing-1`))),
  );
  await check(
    "nor can the seller enumerate saves of their own listing",
    assertFails(
      getDocs(
        query(collection(seller, "favorites"), where("listingId", "==", "listing-1")),
      ),
    ),
  );
  await check(
    "an unrelated account cannot read somebody else's save",
    assertFails(getDoc(doc(stranger, `favorites/${LIKER}_listing-1`))),
  );
  await check(
    "nobody can sweep the favourites collection",
    assertFails(getDocs(query(collection(stranger, "favorites")))),
  );
  // The server-side cleanup added in Phase B1 runs through the Admin SDK and
  // bypasses rules by design. This proves the CLIENT still cannot run the
  // same query the cleanup depends on.
  await check(
    "a listing-scoped favourite query stays closed to clients",
    assertFails(
      getDocs(
        query(collection(liker, "favorites"), where("listingId", "==", "listing-1")),
      ),
    ),
  );

  await env.cleanup();

  const failed = results.filter(([ok]) => !ok);
  results.forEach(([ok, label]) => console.log(`${ok ? "  ok  " : "FAIL  "}${label}`));
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} failing`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} profile-like rule(s) hold`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
