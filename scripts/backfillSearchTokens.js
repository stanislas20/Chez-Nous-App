#!/usr/bin/env node
//
// Give every existing listing the words it can be found by.
//
// syncListingSearchTokens tokenises a listing whenever it is written, so
// everything published from now on is searchable. Everything published BEFORE
// it has no searchTokens field at all, and a listing with no tokens matches no
// query — it is not merely ranked badly, it is invisible. So the back
// catalogue has to be walked once.
//
// ── What it will not do ─────────────────────────────────────────────────
//
// This touches TWO fields. It writes `searchTokens` and `searchPairs` and
// matters more than it sounds:
//
//   * `status` is never read as a filter and never written, so nothing is
//     published, unpublished, approved or rejected by running this. Pending
//     and rejected listings are tokenised too — they are invisible to search
//     because the QUERY filters on status, not because they lack tokens, and
//     tokenising them now means a listing approved next week is searchable
//     the moment it is approved.
//   * There is no serverTimestamp anywhere in it. `updatedAt`, `createdAt`
//     and `approvedAt` are not touched, so nothing jumps to the top of a feed
//     ordered by recency and no "edited" state is implied.
//   * `sellerId` and the seller identity block are not touched.
//   * It writes with update(), so it can never create a document.
//
// It does fire the listing triggers, as any write does — so it is worth being
// explicit about which ones and why none of them do anything:
//
//   notifyListingModerated       requires before.status !== after.status
//   notifyModeratorOfEditedListing  same
//   notifyFollowersOfNewListing  same
//   autoPublishVerifiedCompanyListing  onDocumentCreated only
//   syncListingSearchTokens      returns immediately, because the tokens it
//                                would write are the ones just written
//
// So: no push notification is sent, and no listing is republished. The last
// one is why searchTokensUnchanged exists rather than writing unconditionally.
//
// ── Idempotent, resumable, bounded ──────────────────────────────────────
//
// Safe to stop with Ctrl-C and safe to re-run from the start: a listing whose
// tokens already match is skipped without a write, so a second full pass
// costs reads and no writes. Progress is paged by document id with a cursor,
// so a restart resumes rather than beginning again — and `--after <id>` lets
// you resume by hand if a run dies.
//
//   node scripts/backfillSearchTokens.js --dry-run     # count, write nothing
//   node scripts/backfillSearchTokens.js               # do it
//   node scripts/backfillSearchTokens.js --after <id>  # resume from an id
//
// Against the emulator:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfillSearchTokens.js
//
// Against production it needs GOOGLE_APPLICATION_CREDENTIALS pointing at a
// service-account key held OUTSIDE this repository. See .gitignore.
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
const {
  searchTokensFor,
  searchTokensUnchanged,
  searchPairsFor,
  searchPairsUnchanged,
} = require(path.join(__dirname, "..", "functions", "searchTokens.js"));

// Firestore caps a batch at 500 writes. Pages are smaller than that so a
// stopped run loses at most a few hundred documents' worth of progress, and
// so the memory held at any moment is a page rather than a catalogue.
const PAGE = 250;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const afterFlag = args.indexOf("--after");
const startAfter = afterFlag >= 0 ? args[afterFlag + 1] : null;

const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  (isEmulator ? "rules-probe" : undefined);

async function main() {
  if (!isEmulator && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "Refusing to run: neither FIRESTORE_EMULATOR_HOST nor " +
        "GOOGLE_APPLICATION_CREDENTIALS is set, so it is not clear which " +
        "database this would write to.",
    );
    process.exit(1);
  }
  if (!isEmulator) {
    console.log(
      `\n  ⚠  This will write to the LIVE project "${projectId ?? "(default)"}".\n` +
        `     It only ever writes the searchTokens and searchPairs fields.\n`,
    );
  }

  // Reuse an app if one is already up. The emulator test calls this
  // function directly after initialising its own, and re-initialising throws
  // app/duplicate-app — which would make the backfill untestable in exactly
  // the place it most needs testing.
  if (!admin.apps.length) admin.initializeApp(projectId ? { projectId } : {});
  const db = admin.firestore();

  let cursor = startAfter;
  let scanned = 0;
  let written = 0;
  let skipped = 0;
  let pages = 0;

  const started = Date.now();

  for (;;) {
    // Ordered by document id, not by a timestamp: ids are unique and total,
    // so a cursor on them cannot skip or repeat a document the way a cursor
    // on a non-unique field can. Ordering by createdAt would also omit every
    // listing that has no createdAt, which is exactly the old back catalogue
    // this exists for.
    let pageQuery = db
      .collection("listings")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);

    const snapshot = await pageQuery.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let inBatch = 0;

    for (const doc of snapshot.docs) {
      scanned += 1;
      const listing = doc.data();
      const tokensStale = !searchTokensUnchanged(listing, listing.searchTokens);
      const pairsStale = !searchPairsUnchanged(listing, listing.searchPairs);
      if (!tokensStale && !pairsStale) {
        skipped += 1;
        continue;
      }
      if (!dryRun) {
        // One field. See the note at the top for everything this does not do.
        const update = {};
        if (tokensStale) update.searchTokens = searchTokensFor(listing);
        if (pairsStale) update.searchPairs = searchPairsFor(listing);
        batch.update(doc.ref, update);
        inBatch += 1;
      }
      written += 1;
    }

    if (inBatch > 0) await batch.commit();

    cursor = snapshot.docs[snapshot.docs.length - 1].id;
    pages += 1;
    process.stdout.write(
      `\r  page ${pages}: scanned ${scanned}, ` +
        `${dryRun ? "would write" : "written"} ${written}, skipped ${skipped}` +
        `   (resume: --after ${cursor})`,
    );

    if (snapshot.size < PAGE) break;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n\n  ${dryRun ? "DRY RUN — nothing written" : "done"}\n` +
      `  scanned ${scanned} listings in ${pages} page(s), ${seconds}s\n` +
      `  ${dryRun ? "would write" : "wrote"} ${written}, skipped ${skipped} already correct\n`,
  );
  // Exported so the emulator test can assert on the numbers rather than
  // parsing this output.
  return { scanned, written, skipped, pages };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\nbackfill failed:", error);
      process.exit(1);
    });
}

module.exports = { main, PAGE };
