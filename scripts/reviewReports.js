// Moderation queue for reported listings.
//
// Reports are write-only from the app — firestore.rules lets a signed-in
// user file one and never read any back, so neither a reporter nor the
// reported party can see the queue. This script is the only way to read it,
// which is what makes "reports are reviewed by a moderator" true rather
// than a claim on a screen.
//
// Grouped by listing rather than listed flat, because the number that
// matters is how many DIFFERENT people reported the same thing. Report ids
// are `${listingId}_${reporterId}`, so one person cannot inflate a count by
// reporting twice.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/reviewReports.js                    # the queue
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/reviewReports.js <listingId>        # one listing in full
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/reviewReports.js <listingId> --unpublish "reason"
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/reviewReports.js <listingId> --dismiss
//
// --unpublish sends the listing back to 'pending', which is the same state
// a new listing sits in: it disappears from every public feed but is not
// destroyed, and the seller keeps it in Mes annonces. notifyListingModerated
// does NOT fire on this (it watches for approved/rejected), so the seller is
// not told — decide separately whether to reject it properly instead.
const admin = require('../functions/node_modules/firebase-admin');

admin.initializeApp({ projectId: 'benin-marketplace-3eb04' });
const db = admin.firestore();

const REASON_LABEL = {
  spam: 'Spam',
  prohibited: 'Prohibited',
  scam: 'Scam',
  other: 'Other',
};

function formatDate(value) {
  const date = value?.toDate?.();
  return date ? date.toISOString().slice(0, 16).replace('T', ' ') : '—';
}

async function describeReporter(uid) {
  if (!uid) return 'unknown';
  const snap = await db.doc(`sellers/${uid}`).get();
  if (!snap.exists) return `${uid.slice(0, 8)}… (no profile)`;
  const seller = snap.data();
  return seller.companyName || seller.fullName || uid.slice(0, 8);
}

async function listQueue() {
  const snapshot = await db.collection('reports').orderBy('createdAt', 'desc').get();
  if (snapshot.empty) {
    console.log('No reports.');
    return;
  }

  const byListing = new Map();
  for (const doc of snapshot.docs) {
    const report = doc.data();
    const key = report.listingId ?? '(unknown)';
    if (!byListing.has(key)) byListing.set(key, []);
    byListing.get(key).push(report);
  }

  // Most-reported first: a listing three different people flagged is a
  // different problem from three listings flagged once each.
  const groups = [...byListing.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log(`${snapshot.size} report(s) across ${groups.length} listing(s)\n`);
  for (const [listingId, reports] of groups) {
    const listingSnap = await db.doc(`listings/${listingId}`).get();
    const listing = listingSnap.exists ? listingSnap.data() : null;
    const title = listing?.titleFr || listing?.titleEn || reports[0].listingTitle || '(untitled)';
    const status = listing ? listing.status : 'NOT A LISTING (sample data?)';
    const reasons = reports.map((r) => REASON_LABEL[r.reason] ?? r.reason).join(', ');

    console.log(`${reports.length}×  ${title}`);
    console.log(`     listing : ${listingId}  [${status}]`);
    console.log(`     reasons : ${reasons}`);
    console.log(`     latest  : ${formatDate(reports[0].createdAt)}`);
    if (listing?.reportCount != null) console.log(`     counter : ${listing.reportCount}`);
    console.log('');
  }
  console.log('Run with a listing id to see the written details.');
}

async function showListing(listingId) {
  const snapshot = await db.collection('reports').where('listingId', '==', listingId).get();
  if (snapshot.empty) {
    console.log('No reports for that listing.');
    return;
  }
  const listingSnap = await db.doc(`listings/${listingId}`).get();
  const listing = listingSnap.exists ? listingSnap.data() : null;

  console.log(listing?.titleFr || listing?.titleEn || '(listing not found)');
  console.log(`status: ${listing?.status ?? '—'}   reports: ${snapshot.size}\n`);

  for (const doc of snapshot.docs) {
    const report = doc.data();
    const who = await describeReporter(report.reporterId);
    console.log(`- ${REASON_LABEL[report.reason] ?? report.reason} · ${formatDate(report.createdAt)} · ${who}`);
    if (report.details) console.log(`  "${report.details}"`);
  }
}

async function unpublish(listingId, note) {
  const ref = db.doc(`listings/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log('No such listing.');
    return;
  }
  await ref.update({
    status: 'pending',
    moderationNote: note ?? 'Unpublished after report',
    unpublishedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`Unpublished ${listingId}. It is out of every public feed and still in the seller's Mes annonces.`);
}

async function dismiss(listingId) {
  const snapshot = await db.collection('reports').where('listingId', '==', listingId).get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  // The counter goes with them, or a dismissed listing carries a scarlet
  // letter forever.
  batch.update(db.doc(`listings/${listingId}`), { reportCount: 0 });
  await batch.commit();
  console.log(`Dismissed ${snapshot.size} report(s) on ${listingId}.`);
}

async function main() {
  const [listingId, action, note] = process.argv.slice(2);
  if (!listingId) return listQueue();
  if (action === '--unpublish') return unpublish(listingId, note);
  if (action === '--dismiss') return dismiss(listingId);
  return showListing(listingId);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
