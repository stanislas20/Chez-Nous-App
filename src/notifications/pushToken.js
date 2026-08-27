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
import * as Notifications from "expo-notifications";
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

// Asks for permission and stores a token, answering the one question a
// caller actually has: can this device be reached at all?
//
// Anything that offers to notify somebody later has to know this before it
// makes the offer. The papers screen learned that the hard way — its
// reminder switch was on for an account that had never granted permission,
// so it promised notifications that nothing could deliver.
//
// Three answers, not two, because "denied" and "unavailable" need opposite
// advice. A reader who has already granted permission and is still told to
// go and grant it in Settings concludes the app is broken — and on that
// occasion they are right, just not about the part they were shown.
export const PUSH_OK = "ok";
export const PUSH_DENIED = "denied";
export const PUSH_UNAVAILABLE = "unavailable";

// On Android 8 and later, a notification's sound and vibration are
// properties of its CHANNEL, not of the message. A push can ask for
// `sound: "default"` all it likes; if the channel it lands in was created
// with importance DEFAULT and no sound, the phone stays silent. That is why
// the paper reminders arrived without a sound: there was no channel, so they
// fell into whichever fallback the messaging library provides.
//
// Two channels rather than one, because they are not the same kind of
// interruption and somebody must be able to say so. A paper expiring is
// worth a sound and a buzz in a pocket; a new message is worth less, and
// anybody who disagrees can change either one in Android settings — which
// only works if they are separate channels.
export const PAPERS_CHANNEL = "papers";
export const MESSAGES_CHANNEL = "messages";

// A short double buzz: wait, buzz, pause, buzz. Long enough to feel through
// a pocket, short enough not to read as an alarm — this is a reminder about
// a date, not an emergency.
const PAPERS_VIBRATION = [0, 300, 200, 300];

export async function ensureNotificationChannels() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(PAPERS_CHANNEL, {
      name: "Papiers & contrôle",
      description:
        "Assurance, visite technique et autres dates qui arrivent à échéance.",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: PAPERS_VIBRATION,
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL, {
      name: "Messages",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      enableVibrate: true,
    });
  } catch (error) {
    // A channel that cannot be created costs the sound, never the app.
    // Android keeps its own copy once created, so this only has to succeed
    // once per install.
  }
}

export async function ensurePushToken(uid) {
  if (!uid) return PUSH_UNAVAILABLE;

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
  if (!enabled) return PUSH_DENIED;

  try {
    const token = await getToken(messaging);
    if (!token) return PUSH_UNAVAILABLE;
    await savePushToken(uid, token);
    return PUSH_OK;
  } catch {
    // Permission is granted and there is still no token. On iOS this is
    // what a build with no aps-environment entitlement looks like from in
    // here: the OS never issues an APNs token, so getToken can never
    // succeed however many times the reader visits Settings.
    return PUSH_UNAVAILABLE;
  }
}

// Requests notification permission and stores the device's push token on the
// seller's profile so the sendMessagePush Cloud Function can reach them.
// Returns an unsubscribe for the token-refresh listener, or undefined if
// permission was denied.
export async function registerPushToken(uid) {
  if (!uid) return undefined;
  const result = await ensurePushToken(uid);
  if (result !== PUSH_OK) return undefined;

  return onTokenRefresh(getMessaging(getApp()), (nextToken) =>
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
