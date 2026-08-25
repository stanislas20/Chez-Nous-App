// Manual listing-moderation tool.
//
// Every listing is created with status 'pending' (see CreateListingScreen)
// and firestore.rules pins it there: the create rule only accepts
// 'pending', and the seller's own update rule requires
// `request.resource.data.status == resource.data.status`, so a seller can
// edit their listing but can never publish it. Nothing in the app or in
// functions/ flips that field either — this script is the only thing that
// does, which is what makes moderation a real gate rather than a label.
//
// Either outcome fires notifyListingModerated, which tells the seller and
// — on approval — stamps `approvedAt`, the field the "new listings" feed
// and the notification centre order off. That stamp is the Cloud
// Function's job on purpose, so this script deliberately does not write it
// itself and the field can never disagree with whether the notification
// path ran. It does mean functions must be deployed for approvals to reach
// those feeds.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/moderateListing.js --list-pending
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/moderateListing.js <listingId>
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/moderateListing.js <listingId> --reject "blurry photos"

const admin = require("../functions/node_modules/firebase-admin");

admin.initializeApp({ projectId: "benin-marketplace-3eb04" });
const db = admin.firestore();

const priceFormatter = new Intl.NumberFormat("fr-FR");

function formatPrice(listing) {
  if (listing.categoryKey === "pharmacies" || listing.categoryKey === "jobs")
    return "—";
  return `${priceFormatter.format(listing.price ?? 0)} FCFA`;
}

// Whether a seller is a verified company is worth surfacing in the queue:
// it is the one signal here that has already been checked by a human, so
// it tells you how much scrutiny the rest of the row deserves.
async function describeSeller(sellerId) {
  if (!sellerId) return "unknown";
  const snap = await db.doc(`sellers/${sellerId}`).get();
  if (!snap.exists) return `${sellerId} (no profile)`;
  const seller = snap.data();
  if (seller.accountType === "company") {
    return `${seller.companyName || seller.fullName || sellerId} [company: ${seller.verificationStatus || "pending"}]`;
  }
  return `${seller.fullName || sellerId} [individual]`;
}

async function listPending() {
  const snap = await db
    .collection("listings")
    .where("status", "==", "pending")
    .get();
  if (snap.empty) {
    console.log("No listings pending moderation.");
    return;
  }

  // Oldest first — the queue should be drained in the order sellers have
  // actually been waiting, not in whatever order Firestore returns.
  const docs = snap.docs.sort(
    (a, b) =>
      (a.data().createdAt?.toMillis?.() ?? 0) -
      (b.data().createdAt?.toMillis?.() ?? 0),
  );

  for (const doc of docs) {
    const listing = doc.data();
    const media = (listing.media ?? [])
      .map((item) => item.mediaUrl)
      .filter(Boolean);
    console.log(`\n${doc.id}`);
    console.log(
      `  Title:    ${listing.titleFr || listing.titleEn || "(untitled)"}`,
    );
    console.log(`  Seller:   ${await describeSeller(listing.sellerId)}`);
    console.log(`  Category: ${listing.categoryKey || "—"}`);
    console.log(`  Price:    ${formatPrice(listing)}`);
    console.log(`  City:     ${listing.city || "—"}`);
    console.log(
      `  Photos:   ${media.length ? media.join("\n            ") : "none"}`,
    );
    console.log(`  Posted:   ${listing.createdAt?.toDate?.() ?? "n/a"}`);
    console.log(
      `  Text:     ${(listing.descriptionFr || listing.descriptionEn || "").slice(0, 200)}`,
    );
  }
  console.log(`\n${docs.length} listing(s) awaiting moderation.`);
}

async function setStatus(listingId, status, note) {
  const ref = db.doc(`listings/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`No listing found with id ${listingId}`);
    process.exit(1);
  }
  const listing = snap.data();
  if (listing.status === status) {
    console.error(`${listingId} is already "${status}".`);
    process.exit(1);
  }

  await ref.update({
    status,
    // Cleared on approval so a listing that was rejected, fixed and then
    // approved doesn't keep showing the seller an obsolete reason.
    moderationNote: status === "rejected" ? note || null : null,
    moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
    // In the app this field holds the uid of whoever decided, pinned by the
    // rules to the signed-in account. Here there is no signed-in account:
    // this runs on the service-account key, which is one credential several
    // people could in principle hold. Naming the route rather than inventing
    // a uid keeps the audit honest — "decided from a laptop with the admin
    // key" is the true and useful answer, and it is greppable.
    moderatedBy: "admin-cli",
  });

  const title = listing.titleFr || listing.titleEn || listingId;
  console.log(`"${title}" marked as "${status}".`);
  if (status === "rejected" && !note) {
    console.log(
      "  Note: no reason given — the seller will see a generic message.",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list-pending")) {
    await listPending();
    return;
  }

  const listingId = args[0];
  if (!listingId || listingId.startsWith("--")) {
    console.error(
      'Usage: node scripts/moderateListing.js <listingId> [--reject "reason"]',
    );
    console.error("       node scripts/moderateListing.js --list-pending");
    process.exit(1);
  }

  const rejectIndex = args.indexOf("--reject");
  if (rejectIndex === -1) {
    await setStatus(listingId, "approved");
    return;
  }
  await setStatus(listingId, "rejected", args[rejectIndex + 1]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
