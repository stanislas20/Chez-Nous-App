import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseAuth, firestore } from '../config/firebase';
import { normalizePhone, isValidPhone } from './phoneAuth';

const PSEUDO_EMAIL_DOMAIN = 'chez-nous.app';

function phoneToPseudoEmail(rawPhone) {
  const normalized = normalizePhone(rawPhone);
  return `${normalized.replace('+', '')}@${PSEUDO_EMAIL_DOMAIN}`;
}

export { isValidPhone };

export async function signUpAdvertiser({ businessName, phone, password }) {
  const pseudoEmail = phoneToPseudoEmail(phone);

  let uid;
  try {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, pseudoEmail, password);
    uid = credential.user.uid;
  } catch (error) {
    if (error?.code !== 'auth/email-already-in-use') {
      throw error;
    }
    const credential = await signInWithEmailAndPassword(firebaseAuth, pseudoEmail, password);
    uid = credential.user.uid;
  }

  await setDoc(doc(firestore, 'advertisers', uid), {
    businessName,
    phone: normalizePhone(phone),
    createdAt: serverTimestamp(),
  });

  return uid;
}

export async function loginAdvertiser({ phone, password }) {
  const pseudoEmail = phoneToPseudoEmail(phone);
  const credential = await signInWithEmailAndPassword(firebaseAuth, pseudoEmail, password);
  return credential.user;
}

export async function createAdvertiserProfile({ uid, businessName, phone }) {
  await setDoc(doc(firestore, 'advertisers', uid), {
    businessName,
    phone: normalizePhone(phone),
    createdAt: serverTimestamp(),
  });
}
