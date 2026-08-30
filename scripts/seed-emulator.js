// States the app cannot reach on its own, written into the emulators.
//
// Moderation had no way to be tested. The rules refuse a moderator their
// own listing — correctly, it is the first thing that goes wrong with two
// moderators — so a project with one account cannot produce a rejected
// listing at all, and "rejected" is the state the whole resubmission path
// starts from. The alternatives were a service-account key and a write to
// the live market, or not testing it. This is the third option.
//
// Everything here talks to the emulators, so no credential exists to leak:
// firebase-admin against FIRESTORE_EMULATOR_HOST accepts any project id and
// authenticates nothing. Custom claims work, which is the part that matters
// — canPost and moderator are what the rules actually read.
//
// Usage:
//   npx firebase emulators:start --only firestore,auth
//   node scripts/seed-emulator.js
//   EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 npx expo start --dev-client
//
// On a physical Android device add, for each port the app talks to:
//   adb reverse tcp:8080 tcp:8080   # and 9099, 9199, 5001
// The device is not the machine running the emulators; without this the
// app dials its own loopback and hangs with no error worth reading.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

// Same path moderateListing.js uses — firebase-admin is a functions
// dependency, not a root one.
const admin = require("../functions/node_modules/firebase-admin");
admin.initializeApp({ projectId: "benin-marketplace-3eb04" });

const auth = admin.auth();
const db = admin.firestore();

const SELLER_PHONE = "+2290197000001";
const SELLER_EMAIL = "2290197000001@chez-nous.app";
const PASSWORD = "test1234";
const MOD_EMAIL = "2290166000002@chez-nous.app";

async function ensureUser(email, name, claims) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: PASSWORD, displayName: name });
  }
  await auth.setCustomUserClaims(user.uid, claims);
  return user;
}

(async () => {
  const seller = await ensureUser(SELLER_EMAIL, "Vendeur Test", { canPost: true });
  const mod = await ensureUser(MOD_EMAIL, "Moderateur Test", {
    canPost: true,
    moderator: true,
  });

  await db.doc(`sellers/${seller.uid}`).set({
    fullName: "Vendeur Test",
    phone: SELLER_PHONE,
    accountType: "individual",
    verificationStatus: "pending",
    verifiedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    notificationsLastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const base = {
    sellerId: seller.uid,
    sellerName: "Vendeur Test",
    city: "Cotonou",
    categoryKey: "services",
    phone: "+2290197000001",
    price: 15000,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // The case under test: refused, with a reason, by somebody else.
  await db.doc("listings/seed-rejected").set({
    ...base,
    titleFr: "Soudure et ferronnerie Ganhi",
    titleEn: "Welding and metalwork Ganhi",
    descriptionFr: "Portails, grilles et réparations sur place.",
    descriptionEn: "Gates, grilles and on-site repairs.",
    status: "rejected",
    moderationNote:
      "Le numéro ne répond pas. Corrigez-le et renvoyez l'annonce.",
    moderatedBy: mod.uid,
    moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // A control: approved, so the list has something to contrast against and
  // the hint must NOT appear on it.
  await db.doc("listings/seed-approved").set({
    ...base,
    titleFr: "Menuiserie bois Akpakpa",
    titleEn: "Woodwork Akpakpa",
    descriptionFr: "Meubles sur mesure.",
    descriptionEn: "Custom furniture.",
    status: "approved",
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    moderatedBy: mod.uid,
    moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
    viewCount: 4,
  });

  // Already answered by the seller: pending again, still carrying the note
  // and the uid of the moderator who wrote it. This is the state that could
  // not be approved.
  await db.doc("listings/seed-resubmitted").set({
    ...base,
    titleFr: "Plomberie express Fidjrossè",
    titleEn: "Express plumbing Fidjrosse",
    descriptionFr: "Fuites, chauffe-eau, robinetterie.",
    descriptionEn: "Leaks, water heaters, taps.",
    serviceRateType: "fixed",
    status: "pending",
    moderationNote: "Le numéro ne répond pas. Corrigez-le et renvoyez.",
    moderatedBy: mod.uid,
    moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("seller uid:", seller.uid);
  console.log("moderator uid:", mod.uid);
  console.log("sign in with:", SELLER_PHONE, "/", PASSWORD);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
