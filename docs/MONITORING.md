# Production monitoring and cost guardrails

Console actions, listed because they cannot be done from a repository and are
worthless if nobody remembers they are missing. Nothing here has been done.

Two of them cost five minutes and are worth doing **before** anything else in
Phase B ships, because they are what turns an unbounded cost risk into a
capped and visible one.

---

## Do these first

### 1. Google Cloud budget alert

Console → Billing → Budgets & alerts → Create budget.

- Scope: project `benin-marketplace-3eb04`
- Amount: pick a monthly figure you would be unhappy to exceed, not a figure
  you expect. The point is the alarm, not the forecast.
- Thresholds: 50%, 90%, 100% **and 200%**. The last one matters: a scripted
  abuse run does not stop politely at your budget.
- Send to a real address somebody reads.

A budget alert does **not** cap spending — Firebase has no hard cap on the Blaze
plan. It tells you. That is the whole of what is available.

### 2. Places API quota cap

Console → APIs & Services → Places API → Quotas.

Set a **daily request cap** on the Places API. Even with the key now held in a
Cloud Function secret (Phase B, B12) rather than shipped in the app, a bug or a
signed-in abuser can loop `placesProxy`. A quota is the ceiling; the function's
auth requirement and type allowlist are the door.

While you are there, confirm the **Maps SDK key in `app.json`**
(`AIzaSyDFtL…`) is restricted: Android package name +
SHA-1, iOS bundle identifier. That key is *supposed* to ship in the app — that
is how the Maps SDK works — and the restriction is what makes shipping it safe.
It is a different key from the Places one and a different mechanism.

---

## Crash and error reporting

The code seam exists (`src/utils/reportError.js`) and currently writes to the
console. Attaching a reporter is one call.

**To attach Crashlytics** (it is in the same RNFirebase family already in use):

```
npx expo install @react-native-firebase/crashlytics
```

Add `"@react-native-firebase/crashlytics"` to `plugins` in `app.json`, add
`RNFBCrashlytics` to `forceStaticLinking`, prebuild, then in `App.js`:

```js
import crashlytics from "@react-native-firebase/crashlytics";
import { setErrorReporter } from "./src/utils/reportError";

setErrorReporter({
  recordError: (error, payload) => {
    crashlytics().setAttributes(
      Object.fromEntries(
        Object.entries(payload).map(([k, v]) => [k, String(v)]),
      ),
    );
    crashlytics().recordError(error);
  },
});
```

`reportError.js` already scrubs the payload — phone numbers, e-mails and long
tokens are replaced, and any key matching `pass|token|secret|credential|phone|
email|cv|message|body|text|rccm|ifu|name` is redacted outright. **Do not
bypass it** and call `crashlytics()` directly from a catch block: the scrubbing
is the reason everything reports through one function.

Verify with a deliberate non-fatal, then check Firebase console → Crashlytics.
Crashlytics does not report from a debug build attached to Metro by default.

### Analytics

Not installed, and deliberately left out of Phase B: it changes what the app
collects about people, which is a privacy decision rather than a reliability
one, and it needs a line in whatever privacy policy ships with the app.

The gap it leaves is real and worth naming: there is no funnel data, so nobody
can tell whether sign-ups are lost at the OTP step, at photo upload, or at the
price field.

---

## What to watch, once there is traffic

| Signal | Where | What it means |
|---|---|---|
| Firestore reads/day | Firebase console → Firestore → Usage | Phase B bounded them. A step change means a screen slipped back to an unbounded query — `scripts/check-bounded-reads.js` guards the code, this catches the rest |
| Firestore writes/day | same | A spike with no user growth is abuse. The counter rules are the usual door |
| Storage total bytes | Firebase console → Storage → Usage | Should now track listings, not climb on its own. A steady rise with flat listings means the delete trigger is failing — check its logs |
| Function errors | Cloud console → Logging, severity ≥ ERROR | `cleanupDeletedListingMedia` failing means orphans accumulating silently |
| `placesProxy` invocations | Cloud console → Functions | Per-request billing. Compare against pharmacy/restaurant screen usage |
| App Check unverified % | Firebase console → App Check | Must fall to near zero before enforcing Firestore. See `docs/APP-CHECK.md` |
| Crashlytics crash-free users | Firebase console → Crashlytics | Only meaningful once a reporter is attached |

### Suggested log-based alerts

Cloud console → Logging → Create alert, on:

- `severity>=ERROR AND resource.type="cloud_function"` — any function erroring
- `jsonPayload.message=~"could not be removed and are now orphaned"` — the
  cleanup trigger giving up on files
- `jsonPayload.message=~"deleteAccount.*incomplete"` — somebody unable to leave

---

## Deliberately not automated

No billing or account changes are made from this repository, and none should
be. Budgets, quotas and enforcement switches are the controls that stop a
mistake in this repository from becoming an unbounded bill — putting them under
the same version control as the mistake defeats the purpose.

---

## Collections with a retention policy (Phase F)

Three collections exist only to remember something briefly. Without a TTL
they grow for ever, which is how the post-Phase-E re-audit found them.

| Collection | TTL field | Retention | What it holds |
|---|---|---|---|
| `counterMarkers` | `expiresAt` | 7 days | one row per person, listing, kind and day |
| `placesQuota` | `expiresAt` | 2 hours | one row per uid and per IP, per 1-hour window |
| `recoveryLookups` | `expiresAt` | 2 hours | one row per hashed IP and hashed number |

**If TTL deletion is delayed** — Firestore gives no deletion-time guarantee,
only "within 24 hours of expiry" in practice — nothing breaks. The retention
is deliberately longer than the window each document serves, so a late
deletion means a slightly larger collection and never a wrong answer.

**Deleting a marker cannot re-enable an old duplicate.** A `counterMarkers`
document is keyed by its day. Once that day has passed, the bucket it guarded
can never be written again anyway: the rule derives the day from
`request.time` and refuses anything that is not today. So a marker for last
Tuesday is inert long before the TTL removes it.

**Watch:** document count per collection. A `counterMarkers` count that keeps
climbing after 7 days of steady traffic means the TTL policy is not enabled.
