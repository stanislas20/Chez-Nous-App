import { httpsCallable } from "firebase/functions";
import { getIdTokenResult } from "firebase/auth";
import { cloudFunctions, firebaseAuth } from "../config/firebase";

// Turning a verified phone number into the right to publish.
//
// The SMS step already proves somebody holds the handset; before this, that
// proof was confirmed on the device and then discarded. Here the token it
// produced is handed to a Cloud Function, which reads `phone_number` off it —
// a field Firebase sets, not the caller — and records a custom claim the
// Firestore rules read.
//
// It is the only way the claim is ever granted from inside the app, which is
// what makes "publishing is Bénin-only" a fact about the database rather than
// a hidden button.
export async function claimPostingRight(idToken) {
  const callable = httpsCallable(cloudFunctions, "claimPhoneCountry");
  const result = await callable({ idToken });

  // A claim set a moment ago is not in a token minted a minute ago, and
  // Firestore reads the token. Without this refresh the first attempt to
  // publish is refused for a permission the account already has.
  await firebaseAuth.currentUser?.getIdToken(true);

  return Boolean(result?.data?.canPost);
}

// What the account is currently allowed to do, as the server sees it.
//
// Read from the token rather than from the phone number, so the app and the
// database cannot disagree: if this says yes and the rules say no, the token
// is simply stale and refreshing settles it.
export async function readPostingClaim({ forceRefresh = false } = {}) {
  const user = firebaseAuth.currentUser;
  if (!user) return false;
  try {
    const token = await getIdTokenResult(user, forceRefresh);
    return token.claims?.canPost === true;
  } catch (error) {
    // Offline, or a token that will not refresh. The posting screens fall
    // back to the number on the account, which is right often enough to
    // explain the rule; the rules themselves still decide.
    return null;
  }
}
