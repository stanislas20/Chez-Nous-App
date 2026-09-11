import { initializeAppCheck, CustomProvider } from "firebase/app-check";
import { reportNonFatal } from "../utils/reportError";

// ── The token's own expiry, not one we invented ─────────────────────────
//
// This used to hand the JS SDK `Date.now() + 3600000` because RNFirebase does
// not report an expiry. Checked rather than assumed, in v25.1.0: the Android
// bridge's getToken puts only `token` into the result map
// (ReactNativeFirebaseAppCheckModule.java:196) and publishes
// expireTimeMillis solely on the token-changed EVENT (line 252). So there is
// genuinely nothing to read from the call — the audit was right about that.
//
// But there is a source of truth, and it is the token itself. An App Check
// token is a JWT and its `exp` claim is the very value the Firebase backend
// checks. getToken(instance, false) returns a CACHED token that may be most
// of the way through its life; telling the SDK it has a fresh hour meant the
// SDK would keep presenting a token the backend had already rejected. Reading
// exp makes the two agree.
//
// No signature verification: this is not a trust decision. We minted the
// token, we are only asking when it expires, and a forged answer here would
// merely make our own requests fail.
const FALLBACK_TTL_MS = 5 * 60 * 1000;

// base64url, decoded without atob and without Buffer.
//
// The first version of this reached for `atob`, falling back to `Buffer`.
// The re-audit checked whether either exists in the target runtime and
// neither does: `atob` appears in zero files under react-native, `buffer` is
// not a dependency and `Buffer` is not a React Native global, and nothing in
// Expo SDK 54 polyfills them. So the decoder always threw, always returned
// null, and the token was always given the fallback lifetime — while four
// unit tests asserted the opposite, because they run in Node, where `Buffer`
// is a global. A test proving a behaviour the device cannot reach.
//
// Thirty lines of arithmetic instead of a dependency. Only the bytes of the
// JWT payload are needed, and a JWT payload is ASCII JSON, so this decodes
// to a string directly and does not need a TextDecoder either.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeBase64Url(input) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (c === "=") break;
    const index = B64.indexOf(c);
    // Any character outside the alphabet means this is not a token we can
    // read, and guessing at a malformed one is worse than the fallback.
    if (index === -1) return null;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

function decodeExpiry(token) {
  try {
    if (typeof token !== "string") return null;
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = decodeBase64Url(payload);
    if (!json) return null;
    const exp = JSON.parse(json)?.exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function tokenExpiryMillis(token, now = Date.now()) {
  const exp = decodeExpiry(token);
  if (exp === null) return now + FALLBACK_TTL_MS;
  // Already expired, or so close it will be by the time it is used.
  if (exp <= now) return now + FALLBACK_TTL_MS;
  return exp;
}

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
let attestationFailureReported = false;

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

    // ── The namespace getter, not the package object ──────────────────
    //
    // This used to call rnAppCheck.newReactNativeFirebaseAppCheckProvider()
    // and rnAppCheck.initializeAppCheck(getApp(), options) as if both were
    // package-level exports. In v25.1.0 neither is, and a physical device
    // said so plainly:
    //
    //   rnAppCheck.newReactNativeFirebaseAppCheckProvider is not a function
    //
    // Both are methods on the instance the DEFAULT export returns — the
    // package's own comment spells it out: `import appCheck from
    // '@react-native-firebase/app-check'; appCheck().X(...)`. modular.js
    // exports only getToken, getLimitedUseToken, setTokenAutoRefreshEnabled
    // and onTokenChanged.
    //
    // So App Check had never initialised on any build. It went unnoticed
    // because enforcement is off — every request simply went unattested and
    // was accepted — and because the test harness stubbed the module with
    // top-level functions, mirroring this code's assumption rather than the
    // library's shape.
    const appCheck = rnAppCheck.default ?? rnAppCheck;
    const module = appCheck();

    const provider = module.newReactNativeFirebaseAppCheckProvider();
    provider.configure(providerOptions());

    // initializeAppCheck takes options ONLY — no app argument — and returns
    // the native configureProvider promise rather than an instance. The
    // thing getToken needs is the module itself, which is what
    // nativeInstance holds.
    await module.initializeAppCheck({
      provider,
      // The library refreshes tokens on its own. Without this every request
      // would wait on a fresh attestation, which on Play Integrity is a
      // round trip to Google.
      isTokenAutoRefreshEnabled: true,
    });
    nativeInstance = module;
  } catch (error) {
    // No native module in this binary (an older build, or Expo Go). The app
    // must keep working: enforcement is off, so unattested requests are
    // accepted, and the alternative is bricking the app to protect nothing.
    //
    // Reported, though. Once enforcement is on, a device that reaches this
    // line has an app that cannot read anything — and the failure it shows
    // the user is a Firestore permission error, which looks exactly like an
    // empty marketplace. Play Integrity fails on rooted handsets, on devices
    // without Play services and on some older Android builds, all of which
    // exist in Bénin in numbers. Knowing HOW MANY before turning enforcement
    // on is the difference between a staged rollout and an outage.
    reportNonFatal("appCheckNativeUnavailable", error, {
      where: "initializeAppCheckBridge",
      stage: "native",
    });
    return { active: false, reason: "native-unavailable" };
  }

  try {
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          let result;
          try {
            result = await rnAppCheck.getToken(nativeInstance, false);
          } catch (error) {
            // Attestation was refused — a rooted device, a failed Play
            // Integrity verdict, a clock far enough out that the token is
            // rejected. Reported once per session rather than per request,
            // because the SDK retries and this would otherwise be a flood.
            if (!attestationFailureReported) {
              attestationFailureReported = true;
              reportNonFatal("appCheckAttestationRefused", error, {
                where: "CustomProvider.getToken",
                stage: "attestation",
              });
            }
            throw error;
          }
          return {
            token: result.token,
            expireTimeMillis: tokenExpiryMillis(result.token),
          };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    reportNonFatal("appCheckBridgeFailed", error, {
      where: "initializeAppCheckBridge",
      stage: "bridge",
    });
    return { active: false, reason: "bridge-failed" };
  }

  return { active: true, reason: null };
}
