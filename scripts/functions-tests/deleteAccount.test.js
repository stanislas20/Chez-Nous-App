// deleteAccount, executed against real emulated Firestore, Auth and Storage.
//
// Phase B shipped this "parses but has not been executed", which is not a
// standard to accept for the one function that destroys somebody's data. The
// failure mode that matters is not a crash — it is a quiet success that took
// too much, or too little, and nobody notices until the person it belonged to
// asks for it back.
//
// The handler runs in-process via CallableFunction.run(), against the
// emulators. That is deliberate rather than convenient: the admin SDK talks to
// the real Firestore, Auth and Storage emulators, so every read, batch write,
// trigger-shaped delete and token revocation below is the real one. Only the
// HTTPS transport is skipped, and that is Google's code.
//
// Two accounts exist throughout. Everything is asserted twice: that the
// leaver's data is gone, and that the bystander's is untouched. A deletion
// test that only checks the first half passes just as happily when it deletes
// the entire database.
//
// Run: node scripts/rules-tests/run.js  (started with the emulators)
const path = require("path");
const { check, expectHttpsError, callerContext, report, assert } =
  require("./harness");

const FUNCTIONS = path.join(__dirname, "..", "..", "functions");
const admin = require(path.join(FUNCTIONS, "node_modules", "firebase-admin"));

const LEAVER = "leaver-uid";
const BYSTANDER = "bystander-uid";
// A third account, used only to force the partial-failure path. Deleting
// the bystander to prove that test would destroy the fixture every
// assertion after it depends on.
const FAILER = "failer-uid";
const BUCKET = "rules-probe.appspot.com";

let db;
let auth;
let bucket;
let deleteAccount;

// Everything the leaver owns, and a mirror of it owned by the bystander.
// The mirror is the whole point: it is what turns "the data is gone" into
// "the right data is gone".
async function seed() {
  const batch = db.batch();

  for (const uid of [LEAVER, BYSTANDER, FAILER]) {
    batch.set(db.doc(`sellers/${uid}`), {
      fullName: `Name ${uid}`,
      phone: "+2290100000000",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`sellerStats/${uid}`), { followers: 1, rating: 4 });
    batch.set(db.doc(`advertisers/${uid}`), { businessName: `Biz ${uid}` });

    for (let i = 0; i < 3; i += 1) {
      batch.set(db.doc(`listings/${uid}-listing-${i}`), {
        sellerId: uid,
        status: "approved",
        titleFr: `Annonce ${i}`,
        categoryKey: "vehicles",
        city: "Cotonou",
        mediaPath: `listings/${uid}/${i}.jpg`,
        thumbPath: `listings/${uid}/${i}-thumb.jpg`,
        media: [
          {
            mediaPath: `listings/${uid}/${i}.jpg`,
            thumbPath: `listings/${uid}/${i}-thumb.jpg`,
          },
        ],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    batch.set(db.doc(`favorites/${uid}_someListing`), {
      userId: uid,
      listingId: "someListing",
    });
    batch.set(db.doc(`jobFavorites/${uid}_someJob`), {
      userId: uid,
      jobId: "someJob",
    });
    batch.set(db.doc(`follows/${uid}_target`), {
      followerId: uid,
      sellerId: "target-uid",
    });
    // Somebody following THEM, which is the other direction and a different
    // query.
    batch.set(db.doc(`follows/follower_${uid}`), {
      followerId: "follower-uid",
      sellerId: uid,
    });
    batch.set(db.doc(`jobApplications/job_${uid}`), {
      applicantUid: uid,
      employerUid: "employer-uid",
      jobId: "job",
      status: "new",
      cvUrl: "https://example.test/cv.pdf",
    });
    batch.set(db.doc(`ratings/${uid}_rated`), {
      raterId: uid,
      ratedId: "rated-uid",
      stars: 5,
    });
  }

  // The shared thread. Both accounts are in it, and each wrote messages.
  batch.set(db.doc("conversations/shared"), {
    participantIds: [LEAVER, BYSTANDER],
    buyerId: LEAVER,
    sellerId: BYSTANDER,
    listingId: `${BYSTANDER}-listing-0`,
    participantNames: { [LEAVER]: "Leaver Name", [BYSTANDER]: "Bystander Name" },
  });
  batch.set(db.doc("conversations/shared/messages/m1"), {
    senderId: LEAVER,
    text: "Bonjour, toujours disponible ?",
  });
  batch.set(db.doc("conversations/shared/messages/m2"), {
    senderId: BYSTANDER,
    text: "Oui, passez demain.",
  });
  // A second thread the leaver is not in at all, which must be untouched.
  batch.set(db.doc("conversations/other"), {
    participantIds: [BYSTANDER, "third-uid"],
    buyerId: "third-uid",
    sellerId: BYSTANDER,
    listingId: `${BYSTANDER}-listing-1`,
    participantNames: { [BYSTANDER]: "Bystander Name" },
  });

  // ── The four collections the independent audit found ──────────────────
  //
  // Seeded for BOTH accounts, so "gone" has to mean the leaver's and not
  // everybody's. These are the rows 24 passing tests never looked at.
  for (const uid of [LEAVER, BYSTANDER]) {
    batch.set(db.doc(`reports/some-listing_${uid}`), {
      reporterId: uid,
      listingId: "some-listing",
      reason: "spam",
    });
    batch.set(db.doc(`dealershipSuggestions/sugg-${uid}`), {
      submittedBy: uid,
      name: "Garage Test",
      city: "Cotonou",
      brands: "Toyota",
      status: "pending",
    });
    batch.set(db.doc(`carParks/park-${uid}`), {
      submittedBy: uid,
      name: `Parc ${uid}`,
      commune: "Cotonou",
      status: "approved",
    });
  }
  // A contact pair the leaver is inside, and one they are not.
  batch.set(db.doc(`contacts/${LEAVER}_${BYSTANDER}`), {
    participantIds: [LEAVER, BYSTANDER],
  });
  batch.set(db.doc(`contacts/${BYSTANDER}_third-uid`), {
    participantIds: [BYSTANDER, "third-uid"],
  });

  await batch.commit();

  // Storage. Both accounts own files under the same prefixes.
  await Promise.all(
    [LEAVER, BYSTANDER, FAILER].flatMap((uid) => [
      bucket.file(`listings/${uid}/0.jpg`).save("x"),
      bucket.file(`listings/${uid}/0-thumb.jpg`).save("x"),
      bucket.file(`sellers/${uid}/logo.jpg`).save("x"),
      bucket.file(`sellerVerificationDocs/${uid}/rccm.pdf`).save("x"),
      bucket.file(`jobApplicationCvs/${uid}/cv.pdf`).save("x"),
    ]),
  );
  // A chat attachment, which is named after its uploader but lives inside a
  // thread the other person keeps. It must survive.
  await bucket.file(`conversations/shared/${LEAVER}-1.jpg`).save("x");

  await Promise.all(
    [LEAVER, BYSTANDER, FAILER].map((uid) =>
      auth.createUser({ uid, email: `${uid}@chez-nous.app`, password: "secret123" }),
    ),
  );
}

const countWhere = async (collection, field, value) =>
  (await db.collection(collection).where(field, "==", value).get()).size;

const exists = async (docPath) => (await db.doc(docPath).get()).exists;

const fileExists = async (filePath) => (await bucket.file(filePath).exists())[0];

async function main() {
  // The emulators, addressed the way the admin SDK expects. run.js exports
  // these; asserted rather than assumed, because a missing one would make
  // this test quietly write to a real project.
  for (const variable of [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
  ]) {
    if (!process.env[variable]) {
      console.error(
        `${variable} is not set — refusing to run against anything that ` +
          `might not be an emulator.`,
      );
      process.exit(1);
    }
  }

  admin.initializeApp({ projectId: "rules-probe", storageBucket: BUCKET });
  db = admin.firestore();
  auth = admin.auth();
  bucket = admin.storage().bucket();
  ({ deleteAccount } = require(path.join(FUNCTIONS, "deleteAccount.js")));

  await seed();

  // ── 1. Authentication is required ─────────────────────────────────────
  await check("an unauthenticated caller cannot delete anything", async () => {
    await expectHttpsError(
      deleteAccount.run({ auth: null, data: {} }),
      "unauthenticated",
    );
    assert.ok(await exists(`sellers/${LEAVER}`), "the profile was touched anyway");
  });

  // ── 2. Recent authentication is required ──────────────────────────────
  await check("a stale sign-in is refused", async () => {
    await expectHttpsError(
      deleteAccount.run({
        // Ten minutes old, against a five-minute window. This is the phone
        // left on a table.
        ...callerContext(LEAVER, { authTimeSecondsAgo: 600 }),
        data: {},
      }),
      "failed-precondition",
    );
    assert.ok(await exists(`sellers/${LEAVER}`), "a stale token deleted data");
    assert.strictEqual((await countWhere("listings", "sellerId", LEAVER)), 3);
  });

  await check("a token with no auth_time at all is refused", async () => {
    await expectHttpsError(
      deleteAccount.run({ auth: { uid: LEAVER, token: { uid: LEAVER } }, data: {} }),
      "failed-precondition",
    );
  });

  // ── 3. Nobody can delete somebody else's account ──────────────────────
  // There is no uid parameter — the function reads request.auth.uid and
  // nothing else — so this asserts the shape rather than a rejected
  // argument: a caller supplying another uid deletes their OWN account, not
  // the named one.
  await check("the target is the caller, never a uid they supplied", async () => {
    const source = require("fs").readFileSync(
      path.join(FUNCTIONS, "deleteAccount.js"),
      "utf8",
    );
    assert.ok(
      /const uid = request\.auth\.uid;/.test(source),
      "the uid is not taken from the verified token",
    );
    assert.ok(
      !/request\.data\.(uid|userId|targetUid)/.test(source),
      "the function reads a uid out of the request body, which the caller controls",
    );
  });

  // ── 4-7. The deletion itself ──────────────────────────────────────────
  let result;
  await check("a fresh, authenticated owner can delete their account", async () => {
    result = await deleteAccount.run({ ...callerContext(LEAVER), data: {} });
    assert.strictEqual(result.deleted, true);
  });

  await check("their profile, stats and advertiser record are gone", async () => {
    assert.strictEqual(await exists(`sellers/${LEAVER}`), false);
    assert.strictEqual(await exists(`sellerStats/${LEAVER}`), false);
    assert.strictEqual(await exists(`advertisers/${LEAVER}`), false);
  });

  await check("their listings are gone", async () => {
    assert.strictEqual(await countWhere("listings", "sellerId", LEAVER), 0);
  });

  await check("their favourites, follows, applications and ratings are gone", async () => {
    assert.strictEqual(await countWhere("favorites", "userId", LEAVER), 0);
    assert.strictEqual(await countWhere("jobFavorites", "userId", LEAVER), 0);
    assert.strictEqual(await countWhere("follows", "followerId", LEAVER), 0);
    assert.strictEqual(await countWhere("follows", "sellerId", LEAVER), 0);
    assert.strictEqual(await countWhere("jobApplications", "applicantUid", LEAVER), 0);
    assert.strictEqual(await countWhere("ratings", "raterId", LEAVER), 0);
  });

  await check("their own Storage files are gone", async () => {
    for (const file of [
      `listings/${LEAVER}/0.jpg`,
      `listings/${LEAVER}/0-thumb.jpg`,
      `sellers/${LEAVER}/logo.jpg`,
      `sellerVerificationDocs/${LEAVER}/rccm.pdf`,
      `jobApplicationCvs/${LEAVER}/cv.pdf`,
    ]) {
      assert.strictEqual(await fileExists(file), false, `${file} survived`);
    }
  });

  // ── 5. Shared conversations are anonymised, not deleted ───────────────
  await check("the shared thread still exists for the other person", async () => {
    assert.ok(await exists("conversations/shared"));
  });

  await check("both people's messages are still readable", async () => {
    const messages = await db.collection("conversations/shared/messages").get();
    assert.strictEqual(messages.size, 2, "a message was destroyed");
    const senders = messages.docs.map((d) => d.data().senderId).sort();
    assert.deepStrictEqual(senders, [BYSTANDER, LEAVER].sort());
  });

  await check("the leaver's name is removed from the thread", async () => {
    const thread = (await db.doc("conversations/shared").get()).data();
    assert.strictEqual(thread.participantNames[LEAVER], null);
    assert.ok(
      (thread.deletedParticipants ?? []).includes(LEAVER),
      "the thread does not record that a participant left",
    );
  });

  await check("the other person's name is untouched", async () => {
    const thread = (await db.doc("conversations/shared").get()).data();
    assert.strictEqual(thread.participantNames[BYSTANDER], "Bystander Name");
  });

  await check("participantIds is left alone so the survivor keeps access", async () => {
    // Removing the uid would not protect anybody — the account is gone — and
    // the rules read this array to decide who may open the thread.
    const thread = (await db.doc("conversations/shared").get()).data();
    assert.ok(thread.participantIds.includes(BYSTANDER));
  });

  await check("a chat attachment inside the shared thread survives", async () => {
    assert.strictEqual(
      await fileExists(`conversations/shared/${LEAVER}-1.jpg`),
      true,
      "deleting the account blanked a photo out of somebody else's thread",
    );
  });

  // ── 6. The bystander is completely untouched ──────────────────────────
  await check("the other account's data is entirely intact", async () => {
    assert.ok(await exists(`sellers/${BYSTANDER}`));
    assert.ok(await exists(`sellerStats/${BYSTANDER}`));
    assert.ok(await exists(`advertisers/${BYSTANDER}`));
    assert.strictEqual(await countWhere("listings", "sellerId", BYSTANDER), 3);
    assert.strictEqual(await countWhere("favorites", "userId", BYSTANDER), 1);
    assert.strictEqual(await countWhere("jobFavorites", "userId", BYSTANDER), 1);
    assert.strictEqual(await countWhere("follows", "followerId", BYSTANDER), 1);
    assert.strictEqual(await countWhere("follows", "sellerId", BYSTANDER), 1);
    assert.strictEqual(await countWhere("jobApplications", "applicantUid", BYSTANDER), 1);
    assert.strictEqual(await countWhere("ratings", "raterId", BYSTANDER), 1);
    assert.ok(await exists("conversations/other"));
  });

  await check("the other account's Storage files are intact", async () => {
    for (const file of [
      `listings/${BYSTANDER}/0.jpg`,
      `sellers/${BYSTANDER}/logo.jpg`,
      `sellerVerificationDocs/${BYSTANDER}/rccm.pdf`,
      `jobApplicationCvs/${BYSTANDER}/cv.pdf`,
    ]) {
      assert.strictEqual(await fileExists(file), true, `${file} was deleted`);
    }
  });

  await check("the other account can still sign in", async () => {
    const record = await auth.getUser(BYSTANDER);
    assert.strictEqual(record.uid, BYSTANDER);
  });

  // ── 7. The auth account goes last ─────────────────────────────────────
  // ── E7: the four collections the audit found still holding the uid ────
  await check("their abuse reports are gone", async () => {
    assert.strictEqual(await countWhere("reports", "reporterId", LEAVER), 0);
    assert.strictEqual(await exists(`reports/some-listing_${LEAVER}`), false);
  });
  await check("their pending directory suggestions are gone", async () => {
    assert.strictEqual(
      await countWhere("dealershipSuggestions", "submittedBy", LEAVER),
      0,
    );
  });
  await check("the contact pairs naming them are gone", async () => {
    const snap = await db
      .collection("contacts")
      .where("participantIds", "array-contains", LEAVER)
      .get();
    assert.strictEqual(snap.size, 0, "a contact pair still names the leaver");
  });
  await check(
    "their public car park survives, with their name taken off it",
    async () => {
      const park = await db.doc(`carParks/park-${LEAVER}`).get();
      assert.ok(park.exists, "the public directory entry was destroyed");
      assert.strictEqual(
        park.data().submittedBy,
        undefined,
        "the departing uid is still on a public document",
      );
      assert.strictEqual(park.data().name, `Parc ${LEAVER}`, "the entry lost its content");
    },
  );
  await check("the bystander keeps all four kinds of record", async () => {
    assert.strictEqual(await countWhere("reports", "reporterId", BYSTANDER), 1);
    assert.strictEqual(
      await countWhere("dealershipSuggestions", "submittedBy", BYSTANDER),
      1,
    );
    assert.strictEqual(
      await countWhere("carParks", "submittedBy", BYSTANDER),
      1,
      "the bystander's park lost its submitter",
    );
    const contacts = await db
      .collection("contacts")
      .where("participantIds", "array-contains", BYSTANDER)
      .get();
    assert.strictEqual(
      contacts.size,
      1,
      "the bystander's unrelated contact pair was destroyed",
    );
  });

  await check("the Firebase Auth user is gone", async () => {
    let notFound = false;
    try {
      await auth.getUser(LEAVER);
    } catch (error) {
      notFound = error.code === "auth/user-not-found";
    }
    assert.ok(notFound, "the auth account survived the deletion");
  });

  await check("the auth account is deleted after the data, not before", async () => {
    // Asserted from the source as well as from behaviour: the ordering is
    // the property that makes a partial failure recoverable, and it is
    // invisible once the function has succeeded.
    const source = require("fs").readFileSync(
      path.join(FUNCTIONS, "deleteAccount.js"),
      "utf8",
    );
    const authDelete = source.indexOf("deleteUser(uid)");
    const firestoreDelete = source.indexOf("deleteQueryInBatches");
    const storageDelete = source.indexOf("deleteFiles");
    assert.ok(authDelete > firestoreDelete, "auth is deleted before Firestore");
    assert.ok(authDelete > storageDelete, "auth is deleted before Storage");
  });

  // ── 8. Partial failure is recoverable ─────────────────────────────────
  // Forced rather than waited for: the bucket is swapped for one that throws,
  // so the storage sweep fails while everything else succeeds. The account
  // must survive, so the person can sign in and try again.
  await check("a failure during cleanup leaves the account able to retry", async () => {
    // `admin.storage` is an inherited accessor, not an own property, so a
    // plain assignment does not shadow it — the first attempt at this test
    // silently ran the real thing and reported success. defineProperty is
    // what actually replaces it.
    const realDescriptor = Object.getOwnPropertyDescriptor(admin, "storage");
    Object.defineProperty(admin, "storage", {
      value: () => ({
        bucket: () => ({
          deleteFiles: async () => {
            throw new Error("simulated Storage outage");
          },
        }),
      }),
      configurable: true,
      writable: true,
    });
    try {
      await expectHttpsError(
        deleteAccount.run({ ...callerContext(FAILER), data: {} }),
        "internal",
      );
      const record = await auth.getUser(FAILER);
      assert.strictEqual(
        record.uid,
        FAILER,
        "the auth account was destroyed despite the cleanup failing — the " +
          "person can no longer sign in to finish leaving",
      );
    } finally {
      if (realDescriptor) Object.defineProperty(admin, "storage", realDescriptor);
      else delete admin.storage;
    }
  });

  await check("and retrying after the outage completes the deletion", async () => {
    // The point of keeping the account alive: the person signs in again and
    // finishes leaving. Storage is real again here.
    const result2 = await deleteAccount.run({ ...callerContext(FAILER), data: {} });
    assert.strictEqual(result2.deleted, true);
    let notFound = false;
    try {
      await auth.getUser(FAILER);
    } catch (error) {
      notFound = error.code === "auth/user-not-found";
    }
    assert.ok(notFound, "the retry did not finish the job");
    assert.strictEqual(await fileExists(`sellers/${FAILER}/logo.jpg`), false);
  });

  // ── 9. Idempotence ────────────────────────────────────────────────────
  await check("deleting an already-deleted account is safe", async () => {
    // The Firestore and Storage passes run against nothing and succeed; the
    // auth deletion is the only step with anything left to say, and it says
    // user-not-found. What must NOT happen is a crash, a hang, or damage to
    // anybody else.
    let outcome = "resolved";
    try {
      await deleteAccount.run({ ...callerContext(LEAVER), data: {} });
    } catch (error) {
      outcome = error.code ?? "threw";
    }
    assert.ok(
      outcome === "resolved" || outcome === "internal",
      `a repeat deletion produced "${outcome}"`,
    );
    // And the survivor is still there after the second run.
    assert.ok(await exists("conversations/shared"));
    const messages = await db.collection("conversations/shared/messages").get();
    assert.strictEqual(messages.size, 2);
  });

  await check("the second run did not touch the other account", async () => {
    assert.ok(await exists("conversations/other"));
    assert.ok(await exists(`sellers/${BYSTANDER}`));
    assert.strictEqual(await countWhere("listings", "sellerId", BYSTANDER), 3);
    assert.strictEqual(await fileExists(`sellers/${BYSTANDER}/logo.jpg`), true);
    const record = await auth.getUser(BYSTANDER);
    assert.strictEqual(record.uid, BYSTANDER);
  });

  report("deleteAccount cases");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
