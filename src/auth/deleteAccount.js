import { httpsCallable } from "firebase/functions";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
} from "firebase/auth";
import { cloudFunctions, firebaseAuth } from "../config/firebase";

// Deleting your own account, with the one thing that makes it safe: proof
// that the person holding the phone is the person who owns it.
//
// The server requires a token minted in the last five minutes — the same
// freshness window resetSellerPassword uses — because a phone left on a table
// carries a signed-in session for as long as its refresh token lives. So the
// password is asked for again here and exchanged for a fresh token before the
// call goes out.
//
// The account uses the pseudo-email built from the verified phone number, so
// re-authentication is an email credential even though the person has never
// seen an email address in this app.
export async function deleteOwnAccount({ password }) {
  const user = firebaseAuth?.currentUser;
  if (!user) {
    const error = new Error("Not signed in.");
    error.code = "unauthenticated";
    throw error;
  }
  if (!password) {
    const error = new Error("Password required.");
    error.code = "auth/missing-password";
    throw error;
  }

  // Throws auth/invalid-credential or auth/wrong-password on a bad password,
  // which the screen maps to the same message a failed sign-in gets.
  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(user.email, password),
  );
  // reauthenticate refreshes auth_time, but the ID token in memory was minted
  // before it. Forcing a refresh is what makes the server's freshness check
  // pass rather than fail on a token that is technically stale.
  await user.getIdToken(true);

  await httpsCallable(cloudFunctions, "deleteAccount")({});

  // The server has already revoked the tokens and removed the user, so this
  // is housekeeping rather than security: it clears the local session so the
  // app returns to its signed-out state immediately instead of holding a
  // user object that no longer resolves.
  await signOut(firebaseAuth).catch(() => {});
}

export function mapDeleteAccountErrorToKey(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/missing-password":
      return "errorInvalidCredentials";
    case "auth/too-many-requests":
      return "errorOtpTooManyRequests";
    case "functions/failed-precondition":
      return "deleteAccountReauthNeeded";
    case "functions/internal":
      return "deleteAccountPartial";
    default:
      return "errorGeneric";
  }
}
