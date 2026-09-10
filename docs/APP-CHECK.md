# App Check: what is protected, and the order to switch it on

Nothing in this document has been done. The integration is written and the app
builds with it; enforcement is **off**, which is the only safe state until a
real signed build has been seen producing valid tokens.

## What App Check actually protects here, and why it took a bridge

This app runs two Firebase SDKs at once, and they do not share App Check
state. That is the single fact that decides everything below.

| SDK | Owns | App Check providers it has |
|---|---|---|
| `@react-native-firebase` | phone auth, messaging | Play Integrity (Android), App Attest / DeviceCheck (iOS) — real device attestation |
| `firebase` (JS SDK) | **Firestore, Storage, Functions** | ReCaptcha only — a browser technology, useless on a phone |

Everything worth protecting is on the JS SDK. Everything capable of attesting
is on the native one.

**Initialising App Check in React Native Firebase alone protects none of it.**
The two SDKs hold separate app instances, separate token caches and separate
request pipelines, so a token minted by one is never attached to a request made
by the other. The RNFirebase setup succeeds, the console shows tokens arriving,
and Firestore stays wide open. It is a convincing failure.

So `src/config/appCheck.js` mints the token natively and hands it to the JS SDK
through a `CustomProvider`. One attestation, both pipelines.

### Covered once enforcement is on

- **Firestore** — every read and write from the app
- **Storage** — every upload and download by path
- **Callable Functions** — `claimPhoneCountry`, `resetSellerPassword`,
  `lookupSellerForRecovery`, `placesProxy`, `deleteAccount`

### Not covered, and worth being explicit about

- **Phone auth / SMS** — this runs through RNFirebase, which attests
  separately. Enable App Check for Authentication in the console too; it is a
  different switch.
- **`listingPage`** (`onRequest`) — a public web page fetched by WhatsApp and
  Facebook crawlers, which cannot attest. It must stay unenforced. It reads one
  approved listing and prints no phone number, so the exposure is bounded by
  design rather than by App Check.
- **Firestore rules still do the real work.** App Check answers "is this a
  genuine copy of our app", never "is this person allowed". A real user with a
  real build can still call anything their rules permit. Phase A is what stops
  that; this only raises the cost of scripting it.

## Before switching anything on

1. `npx expo prebuild --clean` — App Check is a native module and the plugin
   must land in the generated projects. Remember `APS_ENVIRONMENT=production`
   for an iOS build destined for TestFlight (see `AGENTS.md`), and rewrite
   `android/local.properties`.
2. **Android — Play Integrity.** In the Play Console, the app must be uploaded
   at least once. In the Firebase console, App Check → your Android app →
   register Play Integrity. The SHA-256 signing certificate of the build you
   are testing has to be on the Firebase app; a build signed with a different
   key attests as a different app and is rejected.
3. **iOS — App Attest.** Firebase console → App Check → your iOS app →
   register App Attest. App Attest needs a real device on iOS 14+; it does not
   work in the simulator, which is what the debug provider is for.
4. **Debug builds.** `__DEV__` selects the debug provider automatically. It
   prints a debug token on first run; copy it into Firebase console → App Check
   → Manage debug tokens. One per machine or simulator. These never reach a
   release build — the provider is chosen by `__DEV__`.

## What Phase C validated locally

Everything below was run, not reasoned about. `scripts/functions-tests/appCheck.test.js`
(13 cases) and the iOS/Android prebuilds:

| Checked | Result |
|---|---|
| Release build selects Play Integrity / App Attest+DeviceCheck | PASS |
| Debug build selects the debug provider, gated on `__DEV__` alone | PASS |
| The native token actually reaches the JS SDK through `CustomProvider` | PASS |
| The token carries the `expireTimeMillis` the JS SDK requires (≈1h) | PASS |
| Auto-refresh enabled on both SDKs | PASS |
| A binary with no native module keeps working (fail-open) | PASS |
| A JS SDK failure does not throw either | PASS |
| Calling the bridge twice does not open two | PASS |
| `app.json` carries the plugin and `RNFBAppCheck` static linking | PASS |
| The bridge starts before Firestore, Storage and Functions are created | PASS |
| Nothing in `functions/` sets `enforceAppCheck: true` | PASS |
| iOS: `pod install` resolves `RNFBAppCheck` → `FirebaseAppCheck 12.15.0` | PASS |
| Android: RN autolinking picks up `@react-native-firebase/app-check` | PASS |

**Not validated, and not validatable here:** Play Integrity and App Attest
producing a real token. That needs the physical devices below.

## Real-device test — ANDROID (Play Integrity)

1. Firebase console → Project settings → your Android app → add the **SHA-256**
   of the certificate that will sign the build you are testing. A build signed
   with a different key attests as a different app and is rejected. For a Play
   internal-testing build this is Play's own app-signing certificate, listed in
   Play Console → Setup → App integrity.
2. Play Console: the app must have been uploaded at least once, to any track.
   Play Integrity cannot verify an APK Play has never seen.
3. Firebase console → App Check → your Android app → **register Play Integrity**.
4. Build a release-configuration APK/AAB signed with that key:
   ```
   npx expo prebuild -p android --clean
   echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
   npm run build:android
   ```
5. Install it on a **physical device with Google Play services** and a Google
   account signed in. Play Integrity does not work on an emulator, on a device
   without Play services, or on a rooted device — all three report as
   unverified, which is correct behaviour and not a bug to chase.
6. Use the app: open the feed, open a listing, send a message, upload a photo.
7. Firebase console → App Check → **Metrics**, per service. Within a few
   minutes Firestore, Storage and Functions should each show **Verified**
   requests climbing.

**What each outcome means**
- *Verified climbing* → the bridge works end to end.
- *Unverified climbing* → tokens are not reaching the JS SDK. Do not enforce.
- *Invalid climbing* → wrong signing certificate, or an unregistered debug
  token. Check step 1.

## Real-device test — iOS (App Attest / DeviceCheck)

1. Firebase console → App Check → your iOS app → **register App Attest**.
   The Team ID (`MY9Y7Y46Q7`) and bundle id (`com.stanislas20.cheznous`) on the
   Firebase app must match the build exactly.
2. App Attest requires a **physical device on iOS 14+**. The simulator cannot
   attest — that is what the debug provider is for. DeviceCheck is the
   configured fallback for older devices.
3. Build for release, with the entitlement set correctly:
   ```
   APS_ENVIRONMENT=production npx expo prebuild -p ios --clean
   ```
   Then archive in Xcode, or `npx expo run:ios --configuration Release`.
   Verified in Phase C: with `APS_ENVIRONMENT=production` the generated
   `ios/ChezNous/ChezNous.entitlements` contains
   `<key>aps-environment</key><string>production</string>`.
4. Install via TestFlight or a direct device build, and use the app as above.
5. Firebase console → App Check → Metrics. Read them exactly as for Android.

**iOS-specific gotcha:** App Attest keys are per-device-per-install. Deleting
and reinstalling the app produces a fresh attestation, so a device that has
just been reinstalled may briefly report unverified.

## Verifying before enforcing

Do this in a **release-configuration build on a real device**, not a dev
client. The debug provider will happily make everything look fine.

1. Firebase console → App Check → **Metrics**, per service.
2. Use the app: browse a feed, open a listing, send a message, upload a photo,
   sign in with SMS.
3. Read the metrics. Each service reports **Verified / Unverified / Invalid**.
   - Verified rising → the bridge works.
   - Unverified rising → tokens are not reaching the JS SDK. Do not enforce.
   - Invalid rising → the wrong signing key, or an unregistered debug token.
4. Wait for enough traffic that "verified" clearly dominates. Old versions of
   the app installed on real phones have no App Check at all and will report as
   unverified for as long as anybody is still running them.

## The order to enforce in

Enforcement is per service. **Turn them on one at a time**, in this order,
watching metrics between each. Every one of these locks out any client that
cannot attest — including every already-installed copy of the current release.

1. **`placesProxy`** first. It is a callable, it is the newest surface, it has
   the fewest users, and it is the one that spends money per request. If
   something is wrong you find out here.
2. **Storage.** Upload paths are already rules-restricted, and the blast radius
   of a mistake is that photos stop uploading — visible immediately, and
   reversible in one click.
3. **The other callable Functions.** Watch `claimPhoneCountry` especially: it
   runs during sign-up, so a failure here means nobody can create an account.
4. **Firestore last.** It is everything. A mistake here is a total outage.

**Do not enforce Firestore until a build with App Check has been live long
enough that unverified traffic has fallen to near zero**, or every user still on
the previous release loses the app at once.

Each switch is reversible from the same page, and reverting takes effect within
minutes. Keep that page open while you do it.

## What this does not remove

- Set the **budget alert** anyway (see `docs/MONITORING.md`). App Check raises
  the cost of abuse; a budget alert is what tells you when something got past
  it, or when ordinary traffic simply grew.
- The **counter writes** in `firestore.rules` now require authentication (Phase
  A, A5). App Check does not replace that, and neither replaces the other: one
  says the caller is a real app, the other says it is a real account.
