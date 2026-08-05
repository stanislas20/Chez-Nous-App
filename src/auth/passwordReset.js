import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

export async function resetSellerPassword({ idToken, newPassword }) {
  const callable = httpsCallable(cloudFunctions, 'resetSellerPassword');
  await callable({ idToken, newPassword });
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
