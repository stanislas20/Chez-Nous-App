// The one write a non-sender may make to somebody else's message.
//
// Marking a voice note as heard has to come from the listener, because only
// the listener knows they listened — inferring it from the sender's side
// would be inventing the fact. That makes it the single exception to "a
// message belongs to whoever sent it", so every other thing a caller might
// try to do through that exception is enumerated here.
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
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
} = require("firebase/firestore");

const SENDER = "sender-uid";
const LISTENER = "listener-uid";
const STRANGER = "stranger-uid";
const CONV = "conv-listen";

const results = [];
const check = async (label, promise) => {
  try {
    await promise;
    results.push([true, label]);
  } catch (error) {
    results.push([false, `${label} — ${String(error.message).slice(0, 110)}`]);
  }
};

const audioMessage = {
  senderId: SENDER,
  audioUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/a.m4a",
  audioDuration: 7,
  createdAt: new Date(),
};

const CASES = [
  "ok",
  "okAgain",
  "senderSelf",
  "stranger",
  "othersKey",
  "bothKeys",
  "clientTime",
  "alsoText",
  "alsoAudioUrl",
  "onText",
  "deleteOther",
];

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "listen-receipt-probe",
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, "..", "..", "firestore.rules"),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `conversations/${CONV}`), {
      participantIds: [SENDER, LISTENER],
      buyerId: LISTENER,
      sellerId: SENDER,
      listingId: "l1",
      createdAt: new Date(),
    });
    await Promise.all(
      CASES.map((id) => {
        // One case is a text message, to prove the receipt cannot be written
        // onto something that was never listened to. Built WITHOUT audioUrl
        // rather than deleting it: deleteField() is not valid inside setDoc.
        const { audioUrl, audioDuration, ...withoutAudio } = audioMessage;
        const data =
          id === "onText"
            ? { ...withoutAudio, text: "bonjour" }
            : { ...audioMessage };
        if (id === "deleteOther") data.listenedBy = { [STRANGER]: new Date() };
        return setDoc(doc(db, `conversations/${CONV}/messages/${id}`), data);
      }),
    );
  });

  const listener = env.authenticatedContext(LISTENER).firestore();
  const sender = env.authenticatedContext(SENDER).firestore();
  const outsider = env.authenticatedContext(STRANGER).firestore();
  const m = (db, id) => doc(db, `conversations/${CONV}/messages/${id}`);

  await check(
    "the listener may mark a voice note heard",
    assertSucceeds(
      updateDoc(m(listener, "ok"), {
        [`listenedBy.${LISTENER}`]: serverTimestamp(),
      }),
    ),
  );
  await check(
    "writing the same receipt twice is allowed (retry is harmless)",
    assertSucceeds(
      updateDoc(m(listener, "okAgain"), {
        [`listenedBy.${LISTENER}`]: serverTimestamp(),
      }),
    ),
  );

  // ── Everything the exception must not become ───────────────────────────
  await check(
    "the SENDER cannot mark their own clip as heard",
    assertFails(
      updateDoc(m(sender, "senderSelf"), {
        [`listenedBy.${SENDER}`]: serverTimestamp(),
      }),
    ),
  );
  await check(
    "a non-participant cannot write a receipt",
    assertFails(
      updateDoc(m(outsider, "stranger"), {
        [`listenedBy.${STRANGER}`]: serverTimestamp(),
      }),
    ),
  );
  await check(
    "the listener cannot write SOMEBODY ELSE's receipt",
    assertFails(
      updateDoc(m(listener, "othersKey"), {
        [`listenedBy.${SENDER}`]: serverTimestamp(),
      }),
    ),
  );
  await check(
    "cannot smuggle another key alongside their own",
    assertFails(
      updateDoc(m(listener, "bothKeys"), {
        [`listenedBy.${LISTENER}`]: serverTimestamp(),
        [`listenedBy.${STRANGER}`]: serverTimestamp(),
      }),
    ),
  );
  // A client-chosen time would let somebody claim they listened before the
  // clip was sent, or hours later than they did.
  await check(
    "cannot back-date the receipt with a client clock",
    assertFails(
      updateDoc(m(listener, "clientTime"), {
        [`listenedBy.${LISTENER}`]: new Date(2000, 0, 1),
      }),
    ),
  );
  await check(
    "cannot edit the text while marking it heard",
    assertFails(
      updateDoc(m(listener, "alsoText"), {
        [`listenedBy.${LISTENER}`]: serverTimestamp(),
        text: "rewritten by the recipient",
      }),
    ),
  );
  await check(
    "cannot repoint the audio while marking it heard",
    assertFails(
      updateDoc(m(listener, "alsoAudioUrl"), {
        [`listenedBy.${LISTENER}`]: serverTimestamp(),
        audioUrl: "https://example.com/other.m4a",
      }),
    ),
  );
  await check(
    "cannot write a receipt onto a TEXT message",
    assertFails(
      updateDoc(m(listener, "onText"), {
        [`listenedBy.${LISTENER}`]: serverTimestamp(),
      }),
    ),
  );
  await check(
    "cannot delete another person's receipt",
    assertFails(
      updateDoc(m(listener, "deleteOther"), {
        [`listenedBy.${STRANGER}`]: deleteField(),
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
  console.log(`\nclean: ${results.length} cases on the listen receipt`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
