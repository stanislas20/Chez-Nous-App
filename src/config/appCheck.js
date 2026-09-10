import { initializeAppCheck, CustomProvider } from "firebase/app-check";

// Attestation, across two SDKs that do not know about each other.
//
// This app runs two Firebase SDKs at once, and that is the whole difficulty:
//
//   @react-native-firebase  owns phone auth and messaging. It has native App
//                           Check providers — Play Integrity on Android, App
//                           Attest / DeviceCheck on iOS — which are the only
//                           attestation that means anything on a phone.
//   firebase (JS SDK)       owns Firestore, Storage and Functions. That is
//                           everything worth protecting. Its only built-in
//                           App Check providers are ReCaptcha, which is a
//                           browser technology and does nothing here.
//
// Initialising App Check in RNFirebase alone protects nothing that matters:
// the two SDKs hold separate app instances, separate token caches and
// separate request pipelines, so an attested token minted by one is never
// attached to a request made by the other. This is the trap the brief warned
// about and it is easy to walk into, because the RNFirebase setup succeeds,
// the console shows tokens arriving, and Firestore is still wide open.
//
// So: RNFirebase mints the token natively, and a CustomProvider hands that
// same token to the JS SDK, which attaches it to every Firestore, Storage and
// Functions request. One attestation, both pipelines.
//
// ── What this file does NOT do ──────────────────────────────────────────
//
// It does not turn enforcement on. Enforcement is a per-service switch in the
// Firebase console, and flipping it before a real signed build has been seen
// to produce valid tokens locks every user out of the database at once. See
// docs/APP-CHECK.md for the order to do it in.
//
// It is also fail-open by construction. Every path below is wrapped, and a
// failure leaves the app running exactly as it does today — unattested, but
// working. That is the correct trade while enforcement is off: a crash here
// would be a self-inflicted outage in exchange for a protection that is not
// yet being applied.

let started = false;

// The debug provider is for a simulator and a dev client, where neither Play
// Integrity nor App Attest can produce a real token. It prints a debug token
// to the log which then has to be registered in the console by hand — so it
// is gated on __DEV__ and can never be what a shipped build uses.
function providerOptions() {
  return {
    android: { provider: __DEV__ ? "debug" : "playIntegrity" },
    apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback" },
  };
}

/**
 * Starts native attestation and bridges it into the JS SDK.
 *
 * @param app the firebase/app instance Firestore, Storage and Functions use.
 */
export async function initializeAppCheckBridge(app) {
  if (started || !app) return { active: false, reason: "already-started" };
  started = true;

  let rnAppCheck;
  let nativeInstance;
  try {
    // Required lazily, not imported at module scope. This is a native module:
    // an import at the top is evaluated as the bundle loads, and a binary
    // built before the package was added throws there — which the dev client
    // reports, very unhelpfully, as "App entry not found". The same lesson
    // ensureNotificationChannels already carries a comment about.
    rnAppCheck = require("@react-native-firebase/app-check");
    const { getApp } = require("@react-native-firebase/app");

    const provider = rnAppCheck.newReactNativeFirebaseAppCheckProvider();
    provider.configure(providerOptions());

    nativeInstance = rnAppCheck.initializeAppCheck(getApp(), {
      provider,
      // The library refreshes tokens on its own. Without this every request
      // would wait on a fresh attestation, which on Play Integrity is a
      // round trip to Google.
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    // No native module in this binary (an older build, or Expo Go). The app
    // must keep working: enforcement is off, so unattested requests are
    // accepted, and the alternative is bricking the app to protect nothing.
    return { active: false, reason: "native-unavailable" };
  }

  try {
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          const result = await rnAppCheck.getToken(nativeInstance, false);
          return {
            token: result.token,
            // RNFirebase does not report the expiry, and the JS SDK requires
            // one. An hour is App Check's own default token lifetime; the
            // SDK refreshes ahead of it, and asking again early costs a
            // cached native token rather than a new attestation.
            expireTimeMillis: Date.now() + 60 * 60 * 1000,
          };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    return { active: false, reason: "bridge-failed" };
  }

  return { active: true, reason: null };
}
