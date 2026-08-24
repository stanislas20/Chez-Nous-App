import { getApp } from "@react-native-firebase/app";
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
} from "@react-native-firebase/messaging";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { firestore } from "../config/firebase";
import { openNotification } from "./openNotification";
import { currentRoute } from "../navigation/navigationRef";

function savePushToken(uid, token) {
  return setDoc(
    doc(firestore, "sellers", uid),
    { pushToken: token },
    { merge: true },
  );
}

// Requests notification permission and stores the device's push token on the
// seller's profile so the sendMessagePush Cloud Function can reach them.
// Returns an unsubscribe for the token-refresh listener, or undefined if
// permission was denied.
export async function registerPushToken(uid) {
  if (!uid) return undefined;

  if (Platform.OS === "android" && Platform.Version >= 33) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  }

  const messaging = getMessaging(getApp());
  const authStatus = await requestPermission(messaging);
  const enabled =
    authStatus === AuthorizationStatus.AUTHORIZED ||
    authStatus === AuthorizationStatus.PROVISIONAL;
  if (!enabled) return undefined;

  const token = await getToken(messaging);
  await savePushToken(uid, token);

  return onTokenRefresh(messaging, (nextToken) =>
    savePushToken(uid, nextToken),
  );
}

// Both iOS and Android suppress the system notification banner for a
// message that arrives while the app is already open in the foreground —
// without this, a push like "pharmacy roster drafts ready" (or a new chat
// message) would land completely silently whenever the app happens to be
// open. Shown as a blocking alert rather than an in-app banner since these
// are rare, important events, not routine noise.
export function registerForegroundMessageHandler() {
  const messaging = getMessaging(getApp());
  return onMessage(messaging, async (remoteMessage) => {
    const title = remoteMessage.notification?.title;
    const body = remoteMessage.notification?.body;
    if (!title && !body) return;

    // Not while the reader is already in that conversation. An alert saying
    // "new message" on top of the message itself, arriving in front of them,
    // is noise that interrupts the reply they were typing.
    const conversationId = remoteMessage.data?.conversationId;
    const route = currentRoute();
    if (
      conversationId &&
      route?.name === "Chat" &&
      route?.params?.conversationId === conversationId
    ) {
      return;
    }

    // An alert with somewhere to go. Previously this said what had happened
    // and left the reader to find it themselves.
    Alert.alert(title ?? "", body ?? "", [
      { text: "Fermer", style: "cancel" },
      {
        text: "Voir",
        onPress: () => openNotification(remoteMessage.data),
      },
    ]);
  });
}

// A tap on the notification itself, which arrives by two different paths
// depending on whether the app was alive at the time.
//
// onNotificationOpenedApp covers a tap while the app sits in the background.
// getInitialNotification covers the tap that LAUNCHED the app — that one
// never reaches the listener, because it happened before any listener could
// be registered, and forgetting it is how "tapping the notification does
// nothing" survives a fix that looked complete.
export function registerNotificationTapHandlers() {
  const messaging = getMessaging(getApp());

  const unsubscribe = onNotificationOpenedApp(messaging, (remoteMessage) => {
    openNotification(remoteMessage?.data);
  });

  getInitialNotification(messaging)
    .then((remoteMessage) => {
      if (remoteMessage) openNotification(remoteMessage.data);
    })
    .catch(() => {});

  return unsubscribe;
}
