import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

export async function resetSellerPassword({ idToken, newPassword }) {
  const callable = httpsCallable(cloudFunctions, 'resetSellerPassword');
  await callable({ idToken, newPassword });
}

// Best-effort: recovery does not depend on this, so a failure (offline, rate
// limited, function not deployed) leaves the card off the screen rather than
// blocking the flow.
export async function lookupSellerForRecovery({ phone }) {
  try {
    const callable = httpsCallable(cloudFunctions, 'lookupSellerForRecovery');
    const result = await callable({ phone });
    return result?.data ?? null;
  } catch {
    return null;
  }
}

export function mapResetPasswordErrorToKey(error) {
  switch (error?.code) {
    case 'functions/not-found':
      return 'errorResetNoAccount';
    case 'functions/deadline-exceeded':
    case 'functions/unauthenticated':
    case 'functions/permission-denied':
      return 'errorResetTokenExpired';
    case 'functions/invalid-argument':
      return 'errorWeakPassword';
    default:
      return 'errorGeneric';
  }
}
