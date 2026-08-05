import { getApp } from '@react-native-firebase/app';
import { getAuth, signInWithPhoneNumber, signOut, getIdToken } from '@react-native-firebase/auth';

export async function sendOtp(e164Phone) {
  return signInWithPhoneNumber(getAuth(getApp()), e164Phone);
}

export async function confirmOtp(confirmation, code) {
  const userCredential = await confirmation.confirm(code);
  // forceRefresh so the token's auth_time reflects this sign-in, not a stale cached one.
  const idToken = await getIdToken(userCredential.user, true);
  await signOut(getAuth(getApp()));
  return idToken;
}

export function mapPhoneAuthErrorToKey(error) {
  switch (error?.code) {
    case 'auth/invalid-verification-code':
      return 'errorOtpInvalidCode';
    case 'auth/code-expired':
      return 'errorOtpExpired';
    case 'auth/too-many-requests':
      return 'errorOtpTooManyRequests';
    case 'auth/invalid-phone-number':
      return 'errorInvalidPhone';
    default:
      return 'errorGeneric';
  }
}
