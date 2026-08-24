import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firestore } from "../config/firebase";
import { normalizePhone, isValidPhone } from "./phoneAuth";
import { claimPostingRight } from "./postingClaim";

const PSEUDO_EMAIL_DOMAIN = "chez-nous.app";

function phoneToPseudoEmail(rawPhone) {
  const normalized = normalizePhone(rawPhone);
  return `${normalized.replace("+", "")}@${PSEUDO_EMAIL_DOMAIN}`;
}

export { isValidPhone };

export async function signUpAdvertiser({
  businessName,
  phone,
  password,
  phoneIdToken,
}) {
  const pseudoEmail = phoneToPseudoEmail(phone);

  if (!phoneIdToken) {
    // An advertiser publishes ads, and publishing needs the claim that only
    // a verified number can grant. Reaching here without the SMS token means
    // the account would be created and then be unable to do the one thing it
    // was created for.
    const error = new Error("Phone verification token missing.");
    error.code = "signup/missing-verification";
    throw error;
  }

  let uid;
  // Only an account this call created may be rolled back. The branch below
  // signs in to one that already exists — deleting that would destroy
  // somebody's account because their second sign-up attempt hit a bad
  // network.
  let created = false;
  try {
    const credential = await createUserWithEmailAndPassword(
      firebaseAuth,
      pseudoEmail,
      password,
    );
    uid = credential.user.uid;
    created = true;
  } catch (error) {
    if (error?.code !== "auth/email-already-in-use") {
      throw error;
    }
    const credential = await signInWithEmailAndPassword(
      firebaseAuth,
      pseudoEmail,
      password,
    );
    uid = credential.user.uid;
  }

  try {
    await setDoc(doc(firestore, "advertisers", uid), {
      businessName,
      phone: normalizePhone(phone),
      createdAt: serverTimestamp(),
    });
    // Without this the account exists and every ad it tries to publish is
    // refused by the rules, with nothing on screen explaining why.
    await claimPostingRight(phoneIdToken);
  } catch (error) {
    if (created) {
      await firebaseAuth.currentUser?.delete().catch(() => {});
    }
    throw error;
  }

  return uid;
}

export async function loginAdvertiser({ phone, password }) {
  const pseudoEmail = phoneToPseudoEmail(phone);
  const credential = await signInWithEmailAndPassword(
    firebaseAuth,
    pseudoEmail,
    password,
  );
  return credential.user;
}

export async function createAdvertiserProfile({ uid, businessName, phone }) {
  await setDoc(doc(firestore, "advertisers", uid), {
    businessName,
    phone: normalizePhone(phone),
    createdAt: serverTimestamp(),
  });
}
