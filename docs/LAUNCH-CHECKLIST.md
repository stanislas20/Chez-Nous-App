# Chez-Nous production launch checklist

Ordered, and the order is the point: it is arranged so that no step can break
the app that is already installed on somebody's phone. Every item says who
does it and where. **Nothing in this repository has been deployed.**

Rewritten after the independent audit and Phase E. What changed, so that
anybody holding the old version knows not to use it:

| Was | Now |
|---|---|
| Search listed as undecided blocker B1 | Implemented, and re-fixed in Phase E after the audit disproved it |
| **No search backfill step at all** | Step 14 — without it, search finds nothing |
| Rules deployed before the new client | Client first; see §5 for why the old order caused an outage |
| "leaving the Places key in `.env` is harmless" | **False.** It shipped in every bundle. See step 3 |
| 189 rules assertions, 63 invariants | Counts are printed by the commands themselves; do not trust a number written here |
| No IAM step | Step 12 — Storage rules now read Firestore, and without the grant every attachment upload fails silently |

---

## 0. Launch blockers — decide these first

| # | Blocker | Decision needed |
|---|---|---|
| B1 | **The Places API key shipped inside every build.** Phase E removed it from `.env` and added `check-bundle-secrets`, but the key that already shipped must be treated as compromised. | Rotate it (step 2). Not optional, and not automatable from here. |
| B2 | **App Check unverified on a real device.** Play Integrity and App Attest cannot be tested from a development build. | Nothing to decide — steps 20-27. Enforcement stays off at launch. |
| B3 | **Counter semantics changed.** Views and contacts are now unique people per day, not taps. | Tell whoever reads the seller dashboard, or the numbers will look like a regression. |

---

## 1. AUTOMATED / CODE READY

Run these and read the totals they print. Numbers are deliberately not
written down here — a checklist that asserts a count goes stale silently, and
this one already did.

```
node scripts/rules-tests/run.js          # Firestore + Storage rules, search, pagination, deletion
node scripts/functions-tests/run.js      # placesProxy, reporting, App Check
for f in scripts/check-*.js; do node "$f" || echo "FAIL $f"; done
node scripts/check-bundle-secrets.js     # exports the real bundle and greps it
node scripts/check-release-config.js --release
npx firebase deploy --only firestore:rules,storage --dry-run --project benin-marketplace-3eb04
```

- [ ] 1. All of the above pass. `check-bundle-secrets` needs a full export and
      takes a few minutes; it is the one that would have caught B1.
- [ ] 2. `git status` clean; the deploy is from a known commit.
- [ ] 3. `.env` holds the production Firebase values and **nothing else**.
      There is no `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` and no
      `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`. The previous version of this
      checklist said leaving the Places key there was "harmless but
      pointless". It was neither: Metro inlines every `EXPO_PUBLIC_*`
      variable into the bundle whether or not any code reads it, and the key
      was extractable from every APK and IPA ever built.

---

## 2. GOOGLE CLOUD — before anything is deployed

- [ ] 4. **Budget alert.** Billing → Budgets & alerts on
      `benin-marketplace-3eb04`. Thresholds 50 / 90 / 100 / **200 %**. The last
      one matters: abuse does not stop politely at your budget, and Firebase
      has no hard spending cap on Blaze.
- [ ] 5. **Places API daily quota cap.** APIs & Services → Places API →
      Quotas. Phase E made the field mask server-chosen and added a per-account
      limit of 240/hour, so the cheap abuse is closed; the quota is what
      catches a bug in our own code.
- [ ] 6. **Blaze plan** confirmed.

---

## 3. ROTATE THE COMPROMISED KEY (B1)

The key that was compiled into every build must be replaced, not merely
removed from `.env`. Exact steps are in §11 at the end of this file.

- [ ] 7. New server-only Places key created, **API-restricted to Places API
      (New)**, with **no application restriction** (it is called from a Cloud
      Function, which has no bundle id and no SHA).
- [ ] 8. Old key **deleted**, not just unused.
- [ ] 9. Android Maps key restricted to package + release SHA-1.
- [ ] 10. iOS Maps key restricted to the bundle id — or confirmed absent, if
      iOS uses Apple Maps.
- [ ] 11. `firebase functions:secrets:set GOOGLE_PLACES_API_KEY` with the NEW
      key. Verify with `firebase functions:secrets:access`.

---

## 4. IAM — required before Storage rules (new in Phase E)

- [ ] 12. **Grant Firebase Storage read access to Firestore.** The chat
      attachment rule now asks Firestore who is in a conversation, and a
      cross-service rule whose grant is missing **denies every upload
      silently** — no error worth reading, on every device.

      ```
      gcloud projects add-iam-policy-binding benin-marketplace-3eb04 \
        --member="serviceAccount:service-PROJECT_NUMBER@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
        --role="roles/datastore.viewer"
      ```

      Find PROJECT_NUMBER in Firebase → Project settings → General. Do this
      **before** step 18, and re-test sending a chat photo immediately after.

---

## 5. DEPLOYMENT ORDER — client before rules

This is the section that changed most, and the reasoning is worth keeping.

The old order deployed Firestore rules at step 13 and shipped the new app at
step 27, days later after store review. It acknowledged that old builds would
then fail to publish, and treated that as a decision to make rather than a
problem to design away. Work the compatibility out and it does not need to be
a decision at all:

| | Old rules | New rules |
|---|---|---|
| **Old client** — sends `sellerVerified`, writes counters directly | works | **publishing and counters break** |
| **New client** — sends `sellerVerified: false`, writes counter markers | **works** | works |

The new client satisfies **both** rule sets: everything it stopped sending is
something the old rules merely permitted rather than required. The old client
satisfies only the old rules. So shipping the client first removes the
breakage window entirely instead of scheduling it.

Each step is separately reversible. Do not batch them.

- [ ] 13. **Indexes**, and wait for **Enabled** in the console — minutes to
      hours. Deploying anything that queries before its index exists fails
      with `FAILED_PRECONDITION`.
      ```
      npx firebase deploy --only firestore:indexes --project benin-marketplace-3eb04
      ```
      Phase E added three: `status + searchPairs + createdAt`, and the same
      with `categoryKey` and with `city`.
- [ ] 14. **Functions.** Before rules, because the functions are what make the
      new rules correct: `autoPublishVerifiedCompanyListing` grants the badge
      the rules refuse from a client, `syncListingSearchTokens` writes the
      search fields the rules freeze, and `onCounterMarkerCreated` applies the
      counters the rules no longer let a client write.
      ```
      npx firebase deploy --only functions --project benin-marketplace-3eb04
      ```
- [ ] 15. **Search backfill.** *Missing from every previous version of this
      checklist.* Existing listings have no `searchTokens` and no
      `searchPairs`, so until this runs **search finds nothing** — the exact
      failure the last two phases existed to remove.
      ```
      node scripts/backfillSearchTokens.js --dry-run    # read the count first
      node scripts/backfillSearchTokens.js
      ```
      Idempotent and resumable (`--after`). It writes only those two fields.
- [ ] 16. **Ship the new client to both stores** (§6 and §7 below) and wait for
      adoption. This is the step that used to be last.
- [ ] 17. **Firestore rules**, once adoption is high enough that the remaining
      old installs are acceptable to break.
      ```
      npx firebase deploy --only firestore:rules --project benin-marketplace-3eb04
      ```
- [ ] 18. **Storage rules.** Step 12's IAM grant must already be in place.
      ```
      npx firebase deploy --only storage --project benin-marketplace-3eb04
      ```
      Immediately send a chat photo and a voice note from two different
      accounts. If the grant is missing this is where you find out.
- [ ] 19. **Hosting**, if the share page changed.

---

## 6. POST-DEPLOYMENT VERIFICATION

- [ ] 20. Browse the feed, open a listing, open a category aisle, scroll past
      200 in the busiest one.
- [ ] 21. **Search for a two-word brand-and-model phrase** whose listing is
      old — "iphone 15", "toyota rav4". This is the audit's exact failure and
      the reason for Phase E's search rebuild.
- [ ] 22. Publish a listing with 3 photos; confirm it appears pending, and
      that a verified company's listing auto-publishes **with the badge**.
- [ ] 23. Delete a listing; confirm its photos *and thumbnails* are gone
      within a minute.
- [ ] 24. Open a pharmacy search; confirm `placesProxy` invocations appear and
      results render.
- [ ] 25. Send a message, an image and a voice note; block, confirm the
      blocked party is refused; unblock. **A failed block now shows an alert**
      — if you see one, step 12 or step 18 is wrong.
- [ ] 26. Save a listing, delete it from another account, reopen Saved
      listings — the row disappears, the screen does not break.
- [ ] 27. Delete a test account end to end; confirm the other party still has
      the conversation with your name removed, and that no `reports`,
      `contacts` or `dealershipSuggestions` rows survive.
- [ ] 28. Log out and log in as a second account **on the same handset**;
      confirm the first account's notifications stop arriving.

---

## 7. REAL ANDROID DEVICE TEST

Full instructions in `docs/APP-CHECK.md`.

- [ ] 28. Add the release **SHA-256** to the Firebase Android app.
- [ ] 29. Upload the app to Play (any track) — Play Integrity cannot verify an
       APK Play has never seen.
- [ ] 30. Register **Play Integrity** in Firebase → App Check.
- [ ] 31. Build and install a release APK on a **physical device with Play
       services**:
       ```
       npx expo prebuild -p android --clean
       echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
       npm run build:android
       ```
       Confirm no x86 slice: `unzip -l app-release.apk | grep 'lib/x86'`.
- [ ] 32. Exercise the app; watch App Check → Metrics for **Verified** climbing.
- [ ] 33. Confirm push notifications arrive (FCM, unrelated to App Check).
- [ ] 34. Trigger a deliberate non-fatal (`sendTestNonFatal`); confirm it
       reaches Crashlytics and carries **no** phone number, e-mail or message
       text.

---

## 8. REAL IPHONE TEST

- [ ] 35. Register **App Attest** in Firebase → App Check (Team `MY9Y7Y46Q7`,
       bundle `com.stanislas20.cheznous`).
- [ ] 36. Build with the production entitlement — **this is the one that fails
       silently if forgotten**:
       ```
       APS_ENVIRONMENT=production npx expo prebuild -p ios --clean
       ```
       Verify `ios/ChezNous/ChezNous.entitlements` says `production`.
- [ ] 37. Archive, upload to TestFlight, install on a **physical device
       (iOS 14+)**.
- [ ] 38. Confirm push works — a store build carrying `development` gets a
       sandbox token the live gateway rejects, silently, for every user.
- [ ] 39. Exercise the app; watch App Check → Metrics.
- [ ] 40. Confirm Crashlytics receives a test non-fatal.

---

## 9. APP CHECK ENFORCEMENT — LATER, NOT AT LAUNCH

Only after steps 28-40 show **Verified** clearly dominating, and after the new
build has been live long enough that unverified traffic from old installs has
fallen to near zero. Each switch locks out every client that cannot attest.

One at a time, watching metrics between each. Reversible from the same page.

- [ ] 41. **`placesProxy`** first — newest surface, fewest users, spends money
       per request. If anything is wrong you learn it here.
- [ ] 42. **Storage** — blast radius is "photos stop uploading", visible
       immediately.
- [ ] 43. **The other callables** — watch `claimPhoneCountry` especially: it
       runs during sign-up, so a failure means nobody can create an account.
- [ ] 44. **Firestore last.** It is everything; a mistake here is a total
       outage.
- [ ] 45. **Authentication** App Check is a separate switch, for the RNFirebase
       phone-auth path.

**Never enforce `listingPage`** — it is fetched by WhatsApp and Facebook
crawlers, which cannot attest.

---

## 10. ONGOING

- [ ] 46. Watch the signals in `docs/MONITORING.md` — Firestore reads/day,
       Storage total bytes, function errors, `placesProxy` invocations.
- [ ] 47. Set the log-based alerts listed there, especially the one on
       `"could not be removed and are now orphaned"`.
- [ ] 48. Rotate the service-account key mentioned in the sibling
       `chez-nous-pharmacy-sync` repository, which is committed there.

---

## 11. ROTATING THE COMPROMISED PLACES KEY

The key beginning `AIzaSyBIJ3…` was compiled into every build produced before
Phase E. Treat it as public. These steps are yours to perform — nothing here
touches your Google account.

**Create the replacement**

1. Google Cloud Console → **APIs & Services → Credentials**, on project
   `benin-marketplace-3eb04`.
2. **+ Create credentials → API key**. Name it `places-server-only`.
3. **Edit API restrictions** → *Restrict key* → tick **Places API (New)** only.
4. **Application restrictions** → leave as **None**. This is deliberate and it
   is the one place "unrestricted" is correct: the key is used by a Cloud
   Function, which has no bundle id, no package name and no stable IP, so
   every application restriction would block it. Its protection is that it
   never leaves the server.
5. Copy it straight into the secret — not into `.env`, not into any file:
   ```
   firebase functions:secrets:set GOOGLE_PLACES_API_KEY --project benin-marketplace-3eb04
   firebase functions:secrets:access GOOGLE_PLACES_API_KEY --project benin-marketplace-3eb04
   ```
6. Redeploy functions so they pick up the new version (step 14).

**Revoke the old one**

7. Credentials → find the key beginning `AIzaSyBIJ3` → **Delete**. Disabling
   is not enough; a deleted key cannot be re-enabled by anybody who has it.
8. Check **Metrics** on the Places API for the next few days. Traffic after
   deletion means something still holds it.

**The Maps keys are different keys and must NOT be rotated the same way**

The key in `app.json` (`AIzaSyDFtL…`) is *supposed* to ship — that is how the
native Maps SDK authenticates — and it is safe only because of its
restrictions.

9. **Android Maps key** → Application restrictions → **Android apps** → add
   package `com.stanislas20.cheznous` with the **release** signing SHA-1.
   Get it with:
   ```
   keytool -list -v -keystore <your-release.keystore> -alias <alias>
   ```
   If you use Play App Signing, take the SHA-1 from Play Console → Setup →
   App signing, not from your local keystore — otherwise maps work in your
   build and fail for every user.
   API restrictions → **Maps SDK for Android** only.
10. **iOS Maps key** → Application restrictions → **iOS apps** → bundle id
    `com.stanislas20.cheznous`; API restrictions → **Maps SDK for iOS** only.
    `app.json` currently sets no iOS Maps key, so if iOS uses Apple Maps there
    is nothing to do here — confirm rather than assume.
11. The two Firebase client keys in `google-services.json` and
    `GoogleService-Info.plist` are **not secrets** and are not rotated. They
    identify the project; the rules and App Check are what protect it.
