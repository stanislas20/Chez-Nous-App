import { getApp } from '@react-native-firebase/app';
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';

function savePushToken(uid, token) {
  return setDoc(doc(firestore, 'sellers', uid), { pushToken: token }, { merge: true });
}

// Requests notification permission and stores the device's push token on the
// seller's profile so the sendMessagePush Cloud Function can reach them.
// Returns an unsubscribe for the token-refresh listener, or undefined if
// permission was denied.
export async function registerPushToken(uid) {
  if (!uid) return undefined;

  if (Platform.OS === 'android' && Platform.Version >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }

  const messaging = getMessaging(getApp());
  const authStatus = await requestPermission(messaging);
  const enabled =
    authStatus === AuthorizationStatus.AUTHORIZED ||
    authStatus === AuthorizationStatus.PROVISIONAL;
  if (!enabled) return undefined;

  const token = await getToken(messaging);
  await savePushToken(uid, token);

  return onTokenRefresh(messaging, (nextToken) => savePushToken(uid, nextToken));
}
