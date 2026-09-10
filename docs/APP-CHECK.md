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
