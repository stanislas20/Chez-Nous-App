import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseAuth, firestore } from '../config/firebase';

const PSEUDO_EMAIL_DOMAIN = 'chez-nous.app';

export function normalizePhone(rawPhone) {
  const digitsAndPlus = rawPhone.trim().replace(/[^\d+]/g, '');
  if (digitsAndPlus.startsWith('+')) {
    return digitsAndPlus;
  }
  const digitsOnly = digitsAndPlus.replace(/\D/g, '');
  return `+229${digitsOnly}`;
}

export function isValidPhone(rawPhone) {
  const digitsOnly = rawPhone.trim().replace(/\D/g, '');
  return /^01\d{8}$/.test(digitsOnly);
}

function phoneToPseudoEmail(rawPhone) {
  const normalized = normalizePhone(rawPhone);
  return `${normalized.replace('+', '')}@${PSEUDO_EMAIL_DOMAIN}`;
}

export async function signUpSeller({ fullName, phone, password }) {
  const pseudoEmail = phoneToPseudoEmail(phone);
  const credential = await createUserWithEmailAndPassword(firebaseAuth, pseudoEmail, password);
  await updateProfile(credential.user, { displayName: fullName });
  await setDoc(doc(firestore, 'sellers', credential.user.uid), {
    fullName,
    phone: normalizePhone(phone),
    createdAt: serverTimestamp(),
  });
  return credential.user;
}

export async function loginSeller({ phone, password }) {
  const pseudoEmail = phoneToPseudoEmail(phone);
  const credential = await signInWithEmailAndPassword(firebaseAuth, pseudoEmail, password);
  return credential.user;
}

export async function logoutSeller() {
  await signOut(firebaseAuth);
}

export function mapAuthErrorToKey(error) {
  switch (error?.code) {
    case 'auth/email-already-in-use':
      return 'errorPhoneInUse';
    case 'auth/weak-password':
      return 'errorWeakPassword';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'errorInvalidCredentials';
    case 'auth/invalid-email':
      return 'errorInvalidPhone';
    default:
      return 'errorGeneric';
  }
}
