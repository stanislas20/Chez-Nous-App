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

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

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
