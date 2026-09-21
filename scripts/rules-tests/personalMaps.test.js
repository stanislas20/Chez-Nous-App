// Who may write whose entry in a conversation's per-person maps.
//
// archivedBy, favoritedBy, deletedBy and blockedBy all live on a document
// that BOTH participants can update, and each entry is one person's decision
// about their own copy of the thread. The update rule froze the identity
// fields and left everything else open, so either participant could write
// the other's entry: archive somebody else's inbox, clear the block they
// placed on you, or set their deletedBy cutoff — and deletedBy is the one
// the server reads to decide a conversation may be permanently purged.
//
// The half that is easy to get wrong is unreadCount, which works the other
// way round on purpose: the SENDER increments the RECIPIENT's counter on
// every message. A rule that pinned every map to the caller would reject
// every send in the app, so the last cases here exist to fail loudly if
// anybody ever "tidies" that into the same restriction.
//
// Run: node scripts/rules-tests/run.js
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc, deleteField } = require("firebase/firestore");

const ME = "me-uid";
const THEM = "them-uid";

const results = [];
const check = async (label, promise) => {
  try {
    await promise;
    results.push([true, label]);
  } catch (error) {
    results.push([false, `${label} — ${String(error.message).slice(0, 110)}`]);
  }
};

const conversation = {
  participantIds: [ME, THEM],
  buyerId: ME,
  sellerId: THEM,
  listingId: "listing-1",
  listingTitle: "Une annonce",
  createdAt: new Date(),
  lastMessage: "bonjour",
  lastMessageAt: new Date(),
  unreadCount: { [ME]: 0, [THEM]: 0 },
  archivedBy: {},
  favoritedBy: {},
  deletedBy: {},
  blockedBy: {},
};

// One document per case: sharing them lets an earlier successful write change
// the state a later case depends on, so a single hole makes several unrelated
// cases report whatever it left behind.
const CASES = [
  "ownArchive",
  "theirArchive",
  "ownFavorite",
  "theirFavorite",
  "ownDelete",
  "theirDelete",
  "ownBlock",
  "theirBlock",
  "unblockThem",
  "bothKeys",
  "unreadTheirs",
  "unreadMine",
  "previewAndOwnArchive",
  "identityFrozen",
];

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "personal-maps-probe",
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
    await Promise.all(
      CASES.map((id) =>
        setDoc(doc(db, `conversations/${id}`), {
          ...conversation,
          // This one needs THEIR block actually in place. Seeded empty, a
          // deleteField() on a key that is not there changes nothing, the
          // diff is empty, and "affected only my key" is vacuously true — so
          // the case passed as a no-op and proved nothing.
          blockedBy: id === "unblockThem" ? { [THEM]: true } : {},
        }),
      ),
    );
  });

  const mine = env.authenticatedContext(ME).firestore();
  const ref = (id) => doc(mine, `conversations/${id}`);

  // ── My own entries: all four must still work ────────────────────────────
  await check(
    "archive my own copy",
    assertSucceeds(updateDoc(ref("ownArchive"), { [`archivedBy.${ME}`]: true })),
  );
  await check(
    "favourite my own copy",
    assertSucceeds(
      updateDoc(ref("ownFavorite"), { [`favoritedBy.${ME}`]: true }),
    ),
  );
  await check(
    "delete my own copy",
    assertSucceeds(
      updateDoc(ref("ownDelete"), { [`deletedBy.${ME}`]: new Date() }),
    ),
  );
  await check(
    "block from my own side",
    assertSucceeds(updateDoc(ref("ownBlock"), { [`blockedBy.${ME}`]: true })),
  );

  // ── The other participant's entries: all four must be refused ───────────
  await check(
    "cannot archive THEIR copy",
    assertFails(
      updateDoc(ref("theirArchive"), { [`archivedBy.${THEM}`]: true }),
    ),
  );
  await check(
    "cannot favourite THEIR copy",
    assertFails(
      updateDoc(ref("theirFavorite"), { [`favoritedBy.${THEM}`]: true }),
    ),
  );
  // The sharpest one: deletedBy is what the purge trigger reads, so writing
  // the other person's cutoff is a way to have the server destroy a
  // conversation they never deleted.
  await check(
    "cannot set THEIR deletion cutoff",
    assertFails(
      updateDoc(ref("theirDelete"), { [`deletedBy.${THEM}`]: new Date() }),
    ),
  );
  await check(
    "cannot block on THEIR behalf",
    assertFails(updateDoc(ref("theirBlock"), { [`blockedBy.${THEM}`]: true })),
  );
  // Un-blocking yourself out of somebody else's block is the safety case.
  await check(
    "cannot clear THEIR block on me",
    assertFails(
      updateDoc(ref("unblockThem"), { [`blockedBy.${THEM}`]: deleteField() }),
    ),
  );
  await check(
    "cannot smuggle their key alongside mine",
    assertFails(
      updateDoc(ref("bothKeys"), {
        [`archivedBy.${ME}`]: true,
        [`archivedBy.${THEM}`]: true,
      }),
    ),
  );

  // ── unreadCount stays cross-writable, or sending breaks ────────────────
  await check(
    "CAN still increment THEIR unread counter (every send does this)",
    assertSucceeds(
      updateDoc(ref("unreadTheirs"), {
        [`unreadCount.${THEM}`]: 3,
        lastMessage: "nouveau message",
        lastMessageAt: new Date(),
      }),
    ),
  );
  await check(
    "CAN still clear my own unread counter (every open does this)",
    assertSucceeds(
      updateDoc(ref("unreadMine"), { [`unreadCount.${ME}`]: 0 }),
    ),
  );

  // ── The rest of the rule is unchanged ──────────────────────────────────
  await check(
    "preview plus my own archive in one write",
    assertSucceeds(
      updateDoc(ref("previewAndOwnArchive"), {
        lastMessage: "salut",
        [`archivedBy.${ME}`]: true,
      }),
    ),
  );
  await check(
    "identity fields still frozen",
    assertFails(
      updateDoc(ref("identityFrozen"), {
        participantIds: [ME, THEM, "stranger-uid"],
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
  console.log(`\nclean: ${results.length} cases on the per-person maps`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
