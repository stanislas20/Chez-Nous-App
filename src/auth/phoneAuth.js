import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { isPossiblePhoneNumber } from "libphonenumber-js";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { firebaseAuth, firestore, storage } from "../config/firebase";
import { claimPostingRight } from "./postingClaim";

const PSEUDO_EMAIL_DOMAIN = "chez-nous.app";

export function normalizePhone(rawPhone) {
  const digitsAndPlus = rawPhone.trim().replace(/[^\d+]/g, "");
  if (digitsAndPlus.startsWith("+")) {
    return digitsAndPlus;
  }
  const digitsOnly = digitsAndPlus.replace(/\D/g, "");
  return `+229${digitsOnly}`;
}

// The Bénin shape, kept for the advertiser screens, which only ever accept a
// Bénin number: an advertiser buys placement inside Bénin.
export function isValidPhone(rawPhone) {
  const digitsOnly = rawPhone.trim().replace(/\D/g, "");
  return /^01\d{8}$/.test(digitsOnly);
}

// Whether a number is possible in the country it was entered for.
//
// The three account screens used to accept anything eight digits or longer,
// which is neither here nor there: a French mobile is nine digits after +33,
// a Bénin number ten, and a Salvadoran eight. Eight-or-more let a mistyped
// number through to the SMS step, where it fails as "auth/invalid-phone-
// number" — a Firebase error code shown to somebody who simply dropped a
// digit.
//
// isPossiblePhoneNumber, not isValidPhoneNumber: the first checks the length
// for that country, the second checks the number matches a known operator
// range. Ranges go stale and new ones are issued constantly, and refusing a
// real new number is a worse failure than accepting a plausible fake one —
// the SMS is what settles it either way.
export function isPossibleNationalNumber(nationalDigits, countryCode) {
  if (!nationalDigits || !countryCode) return false;
  try {
    return isPossiblePhoneNumber(nationalDigits, countryCode);
  } catch (error) {
    return false;
  }
}

function phoneToPseudoEmail(rawPhone) {
  const normalized = normalizePhone(rawPhone);
  return `${normalized.replace("+", "")}@${PSEUDO_EMAIL_DOMAIN}`;
}

// createUserWithEmailAndPassword is not undone by a later failure. If the
// profile write or a document upload throws after it, Firebase Auth is left
// holding an account with no seller profile behind it — and because the
// pseudo-email is derived from the phone number, every retry from then on
// fails with auth/email-already-in-use. The user is permanently locked out
// of their own number, with no way to fix it from inside the app. Deleting
// the just-created user restores the pre-signup state so a retry can
// actually succeed.
async function withProfileRollback(credential, work) {
  try {
    return await work();
  } catch (error) {
    // Kept: the rollback deletes the account, so without a log line the only
    // trace of what failed disappears with it. This one cost an afternoon.
    console.warn("[signup] rollback:", error?.code ?? "(no code)");
    // Swallow a failed rollback: the original error is the one worth
    // reporting, and a deletion that fails leaves things no worse.
    await credential.user.delete().catch(() => {});
    throw error;
  }
}

// Recording the verified number is part of creating the account, not a
// nicety attempted afterwards.
//
// It was best-effort at first, and best-effort was wrong: a claim that
// failed left a real account that could sign in, browse and message but
// could never publish, with nothing on screen saying why and no way to fix
// it. Worse, the account holds the pseudo-email derived from their number,
// so every retry then failed with auth/email-already-in-use — they were
// locked out of their own number by a network blip.
//
// Inside withProfileRollback, a failure here deletes the half-made account
// like any other, and the person simply tries again.
async function recordVerifiedNumber(phoneIdToken) {
  if (!phoneIdToken) {
    // Reaching here means a caller skipped the SMS step. Nothing downstream
    // could tell the difference, which is exactly why it must not be
    // tolerated quietly.
    const error = new Error("Phone verification token missing.");
    error.code = "signup/missing-verification";
    throw error;
  }
  await claimPostingRight(phoneIdToken);
}

export async function signUpSeller({
  fullName,
  phone,
  password,
  phoneIdToken,
}) {
  const pseudoEmail = phoneToPseudoEmail(phone);
  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    pseudoEmail,
    password,
  );
  return withProfileRollback(credential, async () => {
    await updateProfile(credential.user, { displayName: fullName });
    await setDoc(doc(firestore, "sellers", credential.user.uid), {
      accountType: "individual",
      fullName,
      phone: normalizePhone(phone),
      createdAt: serverTimestamp(),
      // Backdates the notification bell's "seen" cursor to signup time, so a
      // brand-new account isn't immediately shown a badge for every listing
      // already in the catalog (see useNotificationsSeen).
      notificationsLastSeenAt: serverTimestamp(),
    });
    await recordVerifiedNumber(phoneIdToken);
    return credential.user;
  });
}

// Uploads one picked document (from expo-document-picker or the CV-style
// scan/gallery flow) to this seller's own private verification-docs path.
// Only ever called after the Firebase Auth account already exists — the
// wizard steps that pick these files run before any session exists (OTP
// confirmation itself signs out again right after verifying the code, see
// phoneVerification.js), so there's no uid, and therefore no valid Storage
// path, until sign-up itself has actually created the account.
async function uploadCompanyLogo(uid, asset) {
  if (!asset) return null;
  const storageRef = ref(storage, `sellers/${uid}/logo-${Date.now()}.jpg`);
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  await new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: "image/jpeg",
    });
    uploadTask.on("state_changed", null, reject, resolve);
  });
  return getDownloadURL(storageRef);
}

async function uploadVerificationDoc(uid, docType, asset) {
  if (!asset) return null;
  const extension = asset.name?.split(".").pop() || "pdf";
  // Storage only accepts application/pdf or image/* here. A picker that
  // reports something else — or nothing — produced storage/unauthorized and
  // took the whole signup down with it, so anything unrecognised is declared
  // as PDF rather than left to be rejected.
  const reported = asset.mimeType ?? "";
  const contentType =
    reported === "application/pdf" || reported.startsWith("image/")
      ? reported
      : "application/pdf";
  const storageRef = ref(
    storage,
    `sellerVerificationDocs/${uid}/${docType}-${Date.now()}.${extension}`,
  );
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  await new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType,
    });
    uploadTask.on("state_changed", null, reject, resolve);
  });
  return getDownloadURL(storageRef);
}

// A company account uses the exact same phone+password auth mechanism as
// an individual one (same pseudo-email trick) — the only difference is the
// richer profile it's created with. verificationStatus always starts at
// 'pending' here regardless of what the caller passes: this function is
// the one and only place a company profile gets created, and no submitted
// RCCM/IFU has actually been checked against anything yet at signup time
// (see firestore.rules — the client is also blocked from ever writing
// 'verified' directly, so this isn't just cosmetic).
export async function signUpCompanySeller({
  fullName,
  phone,
  password,
  companyName,
  rccm,
  ifu,
  sector,
  companyCity,
  rccmDoc,
  ifuDoc,
  repName,
  repRole,
  repIdDoc,
  logoAsset,
  phoneIdToken,
}) {
  const pseudoEmail = phoneToPseudoEmail(phone);
  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    pseudoEmail,
    password,
  );
  // Three uploads and a profile write follow, any of which can fail on a
  // patchy connection — far more exposure than the individual flow has, so
  // the rollback matters most here.
  return withProfileRollback(credential, async () => {
    await updateProfile(credential.user, {
      displayName: fullName || companyName,
    });

    const uid = credential.user.uid;
    // The logo goes to sellers/{uid}, not sellerVerificationDocs — it is the
    // one image here meant to be public, and that path's rules allow the
    // world to read it. The verification documents never leave the private
    // path.
    const [rccmDocUrl, ifuDocUrl, repIdDocUrl, photoUrl] = await Promise.all([
      uploadVerificationDoc(uid, "rccm", rccmDoc),
      uploadVerificationDoc(uid, "ifu", ifuDoc),
      uploadVerificationDoc(uid, "rep-id", repIdDoc),
      uploadCompanyLogo(uid, logoAsset),
    ]);

    await setDoc(doc(firestore, "sellers", uid), {
      accountType: "company",
      fullName: fullName || repName,
      phone: normalizePhone(phone),
      companyName,
      rccm,
      ifu,
      sector,
      companyCity,
      rccmDocUrl,
      ifuDocUrl,
      repName,
      repRole,
      repIdDocUrl,
      photoUrl,
      verificationStatus: "pending",
      verificationSubmittedAt: serverTimestamp(),
      verifiedAt: null,
      createdAt: serverTimestamp(),
      notificationsLastSeenAt: serverTimestamp(),
    });
    await recordVerifiedNumber(phoneIdToken);
    return credential.user;
  });
}

export async function loginSeller({ phone, password }) {
  const pseudoEmail = phoneToPseudoEmail(phone);
  const credential = await signInWithEmailAndPassword(
    firebaseAuth,
    pseudoEmail,
    password,
  );
  return credential.user;
}

export async function logoutSeller() {
  await signOut(firebaseAuth);
}

export function mapAuthErrorToKey(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "errorPhoneInUse";
    // The number was verified but the server could not be told. The account
    // has been rolled back, so this asks for a retry rather than reporting a
    // half-made account as a success.
    case "signup/missing-verification":
    case "functions/unavailable":
    case "functions/internal":
    case "functions/deadline-exceeded":
    case "functions/unauthenticated":
    case "functions/permission-denied":
    case "functions/not-found":
      return "errorSignupVerification";
    case "auth/weak-password":
      return "errorWeakPassword";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "errorInvalidCredentials";
    case "auth/invalid-email":
      return "errorInvalidPhone";
    // A Firestore/Storage rejection, not an auth one — it surfaced here as
    // the catch-all "an error occurred", which said nothing about a write
    // being refused and made a rules mismatch nearly undiagnosable.
    case "permission-denied":
    case "storage/unauthorized":
      return "errorPermissionDenied";
    default:
      return "errorGeneric";
  }
}
