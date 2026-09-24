import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
  connectAuthEmulator,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import {
  getFunctions,
  connectFunctionsEmulator,
} from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// One project, one key, one bucket — and one app id PER PLATFORM.
//
// Everything else in this config really is shared. The app id is not, and
// getting that wrong is invisible until it is expensive.
//
// App Check attestation is minted NATIVELY: App Attest on iOS, Play Integrity
// on Android. The native side always attests as the platform's own Firebase
// app, the one in GoogleService-Info.plist or google-services.json. The JS
// SDK — which owns Firestore, Storage and Functions here — attaches that
// token to requests it makes under whatever app id it was configured with.
// When the two disagree, the token is perfectly valid and belongs to a
// different app, so Firebase classifies the request INVALID.
//
// That is what shipped. A single EXPO_PUBLIC_FIREBASE_APP_ID holding the
// ANDROID id was used on both platforms. Android matched and verified. iOS
// attested as the iOS app, identified as the Android app, and every Storage
// request from the standalone iOS build was counted invalid — 3 more invalid
// for one photo and one voice note, with zero of them reaching "verified".
const androidAppId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
const iosAppId = process.env.EXPO_PUBLIC_FIREBASE_IOS_APP_ID;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: Platform.OS === 'ios' ? iosAppId : androidAppId,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Loud in a release build, quiet on a laptop with no backend.
//
// Running unconfigured is a real state and a useful one: a developer who
// has not filled in .env still gets a bootable app, and the screens know
// to say so. It is not a state a shipped build can be in — every listing,
// message and login would fail one by one, and the first person to notice
// would be a user.
//
// __DEV__ is false in a release bundle, which is the only signal available
// this early. Same shape as the APS_ENVIRONMENT check in app.config.js: a
// misconfiguration that cannot be seen in the build output gets a throw
// rather than a shrug.
if (!isFirebaseConfigured && !__DEV__) {
  throw new Error(
    "Firebase is not configured: EXPO_PUBLIC_FIREBASE_API_KEY and " +
      "EXPO_PUBLIC_FIREBASE_PROJECT_ID are missing from this build. A " +
      "release built without them cannot sign anybody in, load a listing " +
      "or deliver a message.",
  );
}

// No silent fallback to the Android id on iOS.
//
// A fallback is precisely what the previous state amounted to, and its
// failure mode is that there is no failure mode to see: uploads succeed,
// reads succeed, nothing logs, and the only symptom is a counter in a console
// nobody is watching. It stays invisible right up until App Check enforcement
// is switched on, and then every request from every iPhone is rejected at
// once — which is the worst possible moment to discover it.
//
// Same shape as the check above: __DEV__ is false in a release bundle, so a
// laptop without the variable still boots and a shipped build cannot.
if (Platform.OS === 'ios' && !iosAppId && !__DEV__) {
  throw new Error(
    "EXPO_PUBLIC_FIREBASE_IOS_APP_ID is missing from this iOS build. " +
      "The Firebase JS SDK would identify as the Android app while App " +
      "Attest mints tokens for the iOS app, making every App Check token " +
      "invalid — silently, until enforcement is enabled.",
  );
}

// Empty in every ordinary build, including every build that ships.
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
export const isUsingEmulators = Boolean(emulatorHost);

let auth = null;
let firestoreInstance = null;
let storageInstance = null;
let functionsInstance = null;

if (isFirebaseConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    auth = getAuth(app);
  }

  // Attestation before the services that need it.
  //
  // Started here rather than in App.js so it runs before the first Firestore
  // read is issued: App Check attaches its token to requests made after it
  // initialises, and a listener opened first would go out unattested. It
  // returns a promise nothing awaits on purpose — blocking startup on a Play
  // Integrity round trip would put a network call on the path to the first
  // frame, and enforcement is off, so an unattested first request is
  // accepted either way.
  //
  // Required lazily for the same reason the module itself requires its native
  // dependency lazily. See src/config/appCheck.js.
  try {
    // eslint-disable-next-line global-require
    require("./appCheck")
      .initializeAppCheckBridge(app)
      .catch(() => {});
  } catch (error) {
    // App Check is not available in this binary. Everything below still runs.
  }

  firestoreInstance = getFirestore(app);
  storageInstance = getStorage(app);
  functionsInstance = getFunctions(app);

  // Point the whole app at the local emulators.
  //
  // Off unless EXPO_PUBLIC_FIREBASE_EMULATOR_HOST is set, so a build that
  // does not ask for it behaves exactly as before — this is why the switch
  // is a host rather than a boolean, since there is no sensible default
  // that is also safe. A device is not the machine running the emulators,
  // so "localhost" only works behind `adb reverse`; on a plain LAN it wants
  // the host's address.
  //
  // What it is for: the states that are hard to reach in production and
  // dangerous to manufacture there. A rejected listing is the example that
  // prompted this — the rules refuse to let a moderator reject their own
  // listing, quite rightly, so a single-account project cannot produce one
  // at all without a service-account key and a write to the live market.
  // Against the emulator the same rules run off firestore.rules on disk,
  // which makes this a stricter test than production rather than a looser
  // one: it exercises the rules as written, not as last deployed.
  if (emulatorHost) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(firestoreInstance, emulatorHost, 8080);
    connectStorageEmulator(storageInstance, emulatorHost, 9199);
    connectFunctionsEmulator(functionsInstance, emulatorHost, 5001);
  }
}

export const firebaseAuth = auth;
export const firestore = firestoreInstance;
export const storage = storageInstance;
export const cloudFunctions = functionsInstance;
