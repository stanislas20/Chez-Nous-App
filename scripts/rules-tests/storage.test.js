// The rules nobody had ever run.
//
// firestore.rules has had an emulator suite behind it for a while, and it
// shows: the audit found six gaps there, all of them narrow. storage.rules
// had none, and it had two holes wide enough to walk through — every job
// applicant's CV and every private chat attachment were readable by any
// signed-in account, on the reasoning that the app only ever reaches them
// through a Firestore document the rules already gate. True of the app.
// Irrelevant to the SDK, which addresses Storage by path, and which can also
// LIST a folder, because Storage evaluates a list against the same rule.
//
// So these cases do what the app never does: address an object by its path
// as somebody else, and enumerate a folder as somebody else.
//
// A note on what is deliberately NOT tested here, because it cannot be:
// a Firebase download URL — the tokenised
// `…?alt=media&token=…` string getDownloadURL() returns — is served without
// consulting these rules at all. That is how an employer opens a CV and how
// a buyer sees a photo their seller sent: the URL is stored on a document
// firestore.rules already restricts to the two parties, and opening it never
// touches storage.rules. Tightening read here therefore closes enumeration
// and path retrieval without changing a single thing the app does. The
// residual — a leaked URL is a capability until the object's token is
// rotated — is unchanged by these rules and is not something a rules test
// can assert.
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
  getBytes,
  listAll,
  ref,
  uploadBytes,
} = require("firebase/storage");

const APPLICANT = "applicant-uid";
const EMPLOYER = "employer-uid";
const SNOOP = "snoop-uid";
const BUYER = "buyer-uid";
const SELLER = "seller-uid";

// conversations/{listingId}_{buyerUid}/… — the id shape openChat writes, and
// the reason the old rule's search space was only one uid wide: listing ids
// are public on every approved listing.
const THREAD = `listing123_${BUYER}`;

const results = [];
const check = async (label, promise) => {
  try {
    await promise;
    results.push([true, label]);
  } catch (error) {
    results.push([false, `${label} — ${String(error.message).slice(0, 110)}`]);
  }
};

const bytes = () => new Uint8Array([1, 2, 3, 4]);

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "rules-probe",
    // The conversation upload rule asks Firestore who the participants are,
    // so this suite now needs both emulators. Without the Firestore half the
    // rule cannot resolve and every attachment upload would be denied — which
    // is exactly the silent failure the IAM grant risks in production, and
    // exactly why it is tested here rather than assumed.
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, "..", "..", "firestore.rules"),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: fs.readFileSync(
        path.join(__dirname, "..", "..", "storage.rules"),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 9199,
    },
  });

  // Seeded past the rules, so a failure below is a failure of the READ rule
  // rather than of the upload that put the file there.
  await env.withSecurityRulesDisabled(async (ctx) => {
    // The thread the uploads belong to. inConversation() reads this.
    const { doc, setDoc } = require("firebase/firestore");
    await setDoc(doc(ctx.firestore(), "conversations", THREAD), {
      participantIds: [BUYER, SELLER],
      buyerId: BUYER,
      sellerId: SELLER,
      listingId: THREAD.split("_")[0],
    });

    const st = ctx.storage();
    await Promise.all([
      uploadBytes(ref(st, `jobApplicationCvs/${APPLICANT}/cv.pdf`), bytes(), {
        contentType: "application/pdf",
      }),
      uploadBytes(ref(st, `conversations/${THREAD}/${BUYER}-1.jpg`), bytes(), {
        contentType: "image/jpeg",
      }),
      uploadBytes(ref(st, `conversations/${THREAD}/${SELLER}-2.jpg`), bytes(), {
        contentType: "image/jpeg",
      }),
      uploadBytes(
        ref(st, `sellerVerificationDocs/${APPLICANT}/rccm.pdf`),
        bytes(),
        { contentType: "application/pdf" },
      ),
      uploadBytes(ref(st, `listings/${SELLER}/1.jpg`), bytes(), {
        contentType: "image/jpeg",
      }),
    ]);
  });

  const asApplicant = env.authenticatedContext(APPLICANT).storage();
  const asEmployer = env.authenticatedContext(EMPLOYER).storage();
  const asSnoop = env.authenticatedContext(SNOOP).storage();
  const asBuyer = env.authenticatedContext(BUYER).storage();
  const asSeller = env.authenticatedContext(SELLER).storage();
  const asGuest = env.unauthenticatedContext().storage();

  // ── A3. A CV is the densest personal data in the app ────────────────────
  // Legal name, phone, home address, employment history, sometimes an ID
  // number. The path is jobApplicationCvs/{uid}/ and the uid is printed on
  // every public listing as sellerId, so the folder was addressable by
  // anybody who could read the market.
  await check(
    "an applicant reads their own CV",
    assertSucceeds(
      getBytes(ref(asApplicant, `jobApplicationCvs/${APPLICANT}/cv.pdf`)),
    ),
  );
  await check(
    "a signed-in stranger cannot fetch somebody's CV by path",
    assertFails(
      getBytes(ref(asSnoop, `jobApplicationCvs/${APPLICANT}/cv.pdf`)),
    ),
  );
  await check(
    "a signed-in stranger cannot enumerate a CV folder",
    assertFails(listAll(ref(asSnoop, `jobApplicationCvs/${APPLICANT}`))),
  );
  // The employer is refused BY PATH too, and that is correct rather than a
  // regression: their access is the tokenised URL on the jobApplications
  // document, which firestore.rules restricts to the applicant and the
  // employer. Granting path access here would mean granting it to everybody,
  // since a rule cannot see who the employer is without a cross-service
  // firestore.get() and the IAM grant that needs.
  await check(
    "not even the employer can walk the path — they hold the URL, not the path",
    assertFails(
      getBytes(ref(asEmployer, `jobApplicationCvs/${APPLICANT}/cv.pdf`)),
    ),
  );
  await check(
    "a signed-out caller cannot fetch a CV",
    assertFails(
      getBytes(ref(asGuest, `jobApplicationCvs/${APPLICANT}/cv.pdf`)),
    ),
  );
  await check(
    "an applicant can upload their own CV",
    assertSucceeds(
      uploadBytes(
        ref(asApplicant, `jobApplicationCvs/${APPLICANT}/new.pdf`),
        bytes(),
        { contentType: "application/pdf" },
      ),
    ),
  );
  await check(
    "nobody can upload a CV into somebody else's folder",
    assertFails(
      uploadBytes(
        ref(asSnoop, `jobApplicationCvs/${APPLICANT}/planted.pdf`),
        bytes(),
        { contentType: "application/pdf" },
      ),
    ),
  );

  // ── A4. Private conversation attachments ────────────────────────────────
  await check(
    "a sender reads back the photo they sent",
    assertSucceeds(
      getBytes(ref(asBuyer, `conversations/${THREAD}/${BUYER}-1.jpg`)),
    ),
  );
  await check(
    "a signed-in stranger cannot fetch a chat photo by path",
    assertFails(
      getBytes(ref(asSnoop, `conversations/${THREAD}/${BUYER}-1.jpg`)),
    ),
  );
  await check(
    "a signed-in stranger cannot enumerate a conversation's files",
    assertFails(listAll(ref(asSnoop, `conversations/${THREAD}`))),
  );
  await check(
    "a signed-out caller cannot fetch a chat photo",
    assertFails(
      getBytes(ref(asGuest, `conversations/${THREAD}/${BUYER}-1.jpg`)),
    ),
  );
  // ── E6: participation, not just filename ────────────────────────────
  await check(
    "the buyer can upload into their own conversation",
    assertSucceeds(
      uploadBytes(
        ref(asBuyer, `conversations/${THREAD}/${BUYER}-e6.jpg`),
        bytes(),
        { contentType: "image/jpeg" },
      ),
    ),
  );
  await check(
    "a signed-in stranger cannot upload into somebody else's conversation " +
      "even when the file is named after themselves",
    assertFails(
      uploadBytes(
        ref(asSnoop, `conversations/${THREAD}/${SNOOP}-e6.jpg`),
        bytes(),
        { contentType: "image/jpeg" },
      ),
    ),
  );
  await check(
    "a signed-out caller cannot upload into a conversation",
    assertFails(
      uploadBytes(
        ref(asGuest, `conversations/${THREAD}/anon-e6.jpg`),
        bytes(),
        { contentType: "image/jpeg" },
      ),
    ),
  );
  await check(
    "nobody can upload into a conversation that does not exist",
    assertFails(
      uploadBytes(
        ref(asBuyer, `conversations/no-such-thread_${BUYER}/${BUYER}-e6.jpg`),
        bytes(),
        { contentType: "image/jpeg" },
      ),
    ),
  );
  await check(
    "a participant still cannot upload an executable dressed as a chat photo",
    assertFails(
      uploadBytes(
        ref(asBuyer, `conversations/${THREAD}/${BUYER}-e6.bin`),
        bytes(),
        { contentType: "application/octet-stream" },
      ),
    ),
  );

  await check(
    "a participant can still send an attachment named after themselves",
    assertSucceeds(
      uploadBytes(
        ref(asSeller, `conversations/${THREAD}/${SELLER}-3.jpg`),
        bytes(),
        { contentType: "image/jpeg" },
      ),
    ),
  );
  await check(
    "nobody can post an attachment under somebody else's name",
    assertFails(
      uploadBytes(
        ref(asSnoop, `conversations/${THREAD}/${BUYER}-4.jpg`),
        bytes(),
        { contentType: "image/jpeg" },
      ),
    ),
  );

  // ── The rules that were already right, pinned so they stay that way ─────
  await check(
    "verification documents stay private to the seller who filed them",
    assertFails(
      getBytes(ref(asSnoop, `sellerVerificationDocs/${APPLICANT}/rccm.pdf`)),
    ),
  );
  await check(
    "a seller reads back their own verification documents",
    assertSucceeds(
      getBytes(ref(asApplicant, `sellerVerificationDocs/${APPLICANT}/rccm.pdf`)),
    ),
  );
  // Listing photos are public on purpose: a signed-out browser has to see
  // the market. This is the case that proves the two rules above are a
  // deliberate distinction rather than a blanket lockdown.
  await check(
    "listing photos stay readable by a signed-out browser",
    assertSucceeds(getBytes(ref(asGuest, `listings/${SELLER}/1.jpg`))),
  );
  await check(
    "nobody can upload into another seller's listing folder",
    assertFails(
      uploadBytes(ref(asSnoop, `listings/${SELLER}/planted.jpg`), bytes(), {
        contentType: "image/jpeg",
      }),
    ),
  );
  await check(
    "an unauthenticated caller cannot upload anywhere",
    assertFails(
      uploadBytes(ref(asGuest, `listings/${SELLER}/anon.jpg`), bytes(), {
        contentType: "image/jpeg",
      }),
    ),
  );

  await env.cleanup();

  const failed = results.filter(([ok]) => !ok);
  for (const [ok, label] of results) {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  }
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} failing`);
    process.exit(1);
  }
  console.log(`\nclean: ${results.length} storage rule cases`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
