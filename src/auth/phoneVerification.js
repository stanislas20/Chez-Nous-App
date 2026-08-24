import { getApp } from "@react-native-firebase/app";
import {
  getAuth,
  signInWithPhoneNumber,
  signOut,
  getIdToken,
} from "@react-native-firebase/auth";

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
  // Firebase refuses to send an SMS to a country outside the project's
  // region allowlist, and the refusal arrives with no dedicated error code —
  // just a message. Read it, because the alternative is telling somebody in
  // Lagos "an error occurred" when the truthful answer is that we do not
  // send codes to Nigeria yet. Matching on a message is fragile, so it sits
  // in front of the code switch rather than replacing any part of it.
  const message = String(error?.message ?? "");
  if (/region|not allowed|unsupported/i.test(message)) {
    return "errorPhoneRegionBlocked";
  }

  switch (error?.code) {
    case "auth/invalid-verification-code":
      return "errorOtpInvalidCode";
    case "auth/code-expired":
      return "errorOtpExpired";
    case "auth/too-many-requests":
      return "errorOtpTooManyRequests";
    case "auth/invalid-phone-number":
      return "errorInvalidPhone";
    default:
      return "errorGeneric";
  }
}
