// Manual company-verification tool.
//
// There's no automated way to check a submitted RCCM/IFU against Bénin's
// business registry from this app (see the "Company account" signup flow
// for why — no public API for it exists today; the closest thing is the
// public https://monentreprise.bj/annuaire search, and the real API-grade
// access route is registering as an X-Road member with ASSI, which is an
// institutional process outside this script's scope). So this is the
// actual verification step: look at what the applicant submitted, decide,
// then run this to record that decision. It's also the ONLY way that
// decision ever gets recorded — firestore.rules blocks the client from
// ever writing verificationStatus/verifiedAt itself (see the sellers
// collection rule), specifically so a self-submitted company can't grant
// itself the badge.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/verifySeller.js <uid>              # approve
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/verifySeller.js <uid> --reject      # reject
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/verifySeller.js --list-pending      # see who's waiting
//
// After approving, existing listings that company already posted are NOT
// retroactively updated (same staleness tradeoff sellerName/
// sellerMemberSince already accept elsewhere in this app) — only new
// listings posted after this point pick up the Verified badge.

const admin = require('../functions/node_modules/firebase-admin');

admin.initializeApp({ projectId: 'benin-marketplace-3eb04' });
const db = admin.firestore();

async function listPending() {
  const snap = await db
    .collection('sellers')
    .where('accountType', '==', 'company')
    .where('verificationStatus', '==', 'pending')
    .get();
  if (snap.empty) {
    console.log('No companies pending verification.');
    return;
  }
  snap.forEach((doc) => {
    const d = doc.data();
    console.log(`\n${doc.id}`);
    console.log(`  Company:        ${d.companyName}`);
    console.log(`  RCCM:           ${d.rccm}`);
    console.log(`  IFU:            ${d.ifu}`);
    console.log(`  Sector:         ${d.sector}`);
    console.log(`  City:           ${d.companyCity}`);
    console.log(`  Representative: ${d.repName} (${d.repRole})`);
    console.log(`  RCCM doc:       ${d.rccmDocUrl}`);
    console.log(`  IFU doc:        ${d.ifuDocUrl}`);
    console.log(`  Rep ID doc:     ${d.repIdDocUrl}`);
    console.log(`  Submitted at:   ${d.verificationSubmittedAt?.toDate?.() ?? 'n/a'}`);
    console.log(`  Cross-check:    https://monentreprise.bj/annuaire (search "${d.rccm}" or "${d.ifu}")`);
  });
}

async function setStatus(uid, status) {
  const ref = db.doc(`sellers/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`No seller found with uid ${uid}`);
    process.exit(1);
  }
  const data = snap.data();
  if (data.accountType !== 'company') {
    console.error(`${uid} is not a company account (accountType=${data.accountType}).`);
    process.exit(1);
  }
  await ref.update({
    verificationStatus: status,
    verifiedAt: status === 'verified' ? admin.firestore.FieldValue.serverTimestamp() : null,
  });
  console.log(`${data.companyName} (${uid}) marked as "${status}".`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list-pending')) {
    await listPending();
    return;
  }
  const uid = args[0];
  if (!uid) {
    console.error('Usage: node scripts/verifySeller.js <uid> [--reject]');
    console.error('       node scripts/verifySeller.js --list-pending');
    process.exit(1);
  }
  const status = args.includes('--reject') ? 'rejected' : 'verified';
  await setStatus(uid, status);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
