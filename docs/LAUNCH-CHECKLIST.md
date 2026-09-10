# Chez-Nous production launch checklist

Ordered. Every step says who does it and where. Nothing in this repository has
been deployed; every item below is outstanding.

Two things are worth doing **before** anything else, because they are the ones
that stop a mistake anywhere else becoming an unbounded bill: the budget alert
and the Places quota cap. They are steps 6 and 7, five minutes together.

---

## 0. Launch blockers — decide these first

| # | Blocker | Why it blocks | Decision needed |
|---|---|---|---|
| B1 | **Search cannot find listings outside the loaded page.** 6 of 10 probes fail. | A marketplace whose search returns "no results" for listings it holds reads as empty. Sellers' listings are invisible; neither side can tell anything is wrong. | Approve `docs/SEARCH.md` Option A (≈1 day, no new service), or accept the limitation for a small beta where the catalogue fits in one page. |
| B2 | **App Check unverified on a real device.** | Everything else about it is validated, but Play Integrity and App Attest cannot be tested here. | Nothing to decide — steps 20–21 below. Enforcement stays off until they pass. |

Everything else is ready.

---

## 1. AUTOMATED / CODE READY

All green as of this checklist. Re-run before deploying.

```
node scripts/rules-tests/run.js          # 189 emulator assertions + 2 measurement suites
node scripts/functions-tests/run.js      # 52 function/reporting assertions
for f in scripts/check-*.js; do node "$f" || echo "FAIL $f"; done   # 63 invariants
npx expo export --platform android       # Android JS bundle
npx expo export --platform ios           # iOS JS bundle
npx firebase deploy --only firestore:rules,storage --dry-run --project benin-marketplace-3eb04
```

- [ ] 1. All of the above pass.
- [ ] 2. `git status` clean; the deploy is from a known commit.
- [ ] 3. `.env` holds the production Firebase values (`EXPO_PUBLIC_FIREBASE_*`).
      `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` is **no longer read by the app** —
      it now lives as a Functions secret (step 10). Leaving it in `.env` is
      harmless but pointless; removing it is cleaner.

---

## 2. MANUAL FIREBASE CONSOLE ACTION

- [ ] 4. **Firestore indexes first, and wait for them to build.** Deploying
      code before its indexes means every paginated query fails with
      `FAILED_PRECONDITION` until they finish. Three are new:
      `status+categoryKey+createdAt`, `status+city+createdAt`,
      `status+categoryKey+city+createdAt`. Deploy command in step 13; watch
      Firestore → Indexes until all show **Enabled**.
- [ ] 5. **Blaze plan** confirmed — Cloud Functions and outbound calls to
      Google Places both require it.

---

## 3. MANUAL GOOGLE CLOUD ACTION — do these before deploying

- [ ] 6. **Budget alert.** Billing → Budgets & alerts → Create budget on
      `benin-marketplace-3eb04`. Thresholds 50 / 90 / 100 / **200 %**. The last
      one matters: abuse does not stop politely at your budget. Firebase has no
      hard spending cap on Blaze — the alert is all that exists.
- [ ] 7. **Places API daily quota cap.** APIs & Services → Places API → Quotas.
      Set a daily request ceiling. The key is server-side now, but a bug or a
      signed-in abuser can still loop `placesProxy`.
- [ ] 8. **Maps SDK key restriction.** The key in `app.json`
      (`AIzaSyDFtL…`) is *supposed* to ship in the app — that is how the Maps
      SDK works — and the restriction is what makes that safe. Restrict to the
      Android package `com.stanislas20.cheznous` + release SHA-1, and the iOS
      bundle id. This is a **different key** from the Places one.
- [ ] 9. **Confirm the Places key is a separate, server-only key.** If the Maps
      key and the Places key are the same key, split them: the Maps key must be
      app-restricted and the Places key must not be in any app.

---

## 4. SECRETS

- [ ] 10. `firebase functions:secrets:set GOOGLE_PLACES_API_KEY`
       (paste the server-only Places key). Verify with
       `firebase functions:secrets:access GOOGLE_PLACES_API_KEY`.
       Without this, `placesProxy` returns `failed-precondition` and pharmacy
       and restaurant search stop working — tested, and it fails safe.

---

## 5. DEPLOYMENT COMMANDS — in this order

Each step is separately reversible. Do not batch them.

- [ ] 11. **Indexes**, and wait:
      ```
      npx firebase deploy --only firestore:indexes --project benin-marketplace-3eb04
      ```
      Wait for **Enabled** in the console. This can take minutes to hours.
- [ ] 12. **Functions.** Deploy before rules: `cleanupDeletedListingMedia` and
      `autoPublishVerifiedCompanyListing` are what make the new rules correct —
      the badge is granted server-side, so rules that refuse a client-written
      badge must not land while no function grants it.
      ```
      npx firebase deploy --only functions --project benin-marketplace-3eb04
      ```
      New or changed: `placesProxy`, `deleteAccount`,
      `cleanupDeletedListingMedia`, `autoPublishVerifiedCompanyListing`.
- [ ] 13. **Firestore rules.**
      ```
      npx firebase deploy --only firestore:rules --project benin-marketplace-3eb04
      ```
- [ ] 14. **Storage rules.**
      ```
      npx firebase deploy --only storage --project benin-marketplace-3eb04
      ```
- [ ] 15. **Hosting**, if the share page changed:
      ```
      npx firebase deploy --only hosting --project benin-marketplace-3eb04
      ```

---

## 6. POST-DEPLOYMENT VERIFICATION — before any build ships

Against production, with the currently-installed app or a debug build.

- [ ] 16. **The old app still works.** Existing installs have no App Check and
       write `sellerVerified` from the client. The rules now refuse that — so
       **a listing published from an old build will fail.** Decide: either ship
       the new build first and force-update, or accept that publishing breaks
       for anyone who has not updated. *This is the single most likely
       post-deploy surprise.*
- [ ] 17. Browse the feed, open a listing, open a category aisle, scroll past
       200 in the busiest one.
- [ ] 18. Publish a listing with 3 photos; confirm it appears pending, and that
       a verified company's listing auto-publishes **with the badge**.
- [ ] 19. Delete a listing; confirm in Storage that its photos *and thumbnails*
       are gone within a minute (`cleanupDeletedListingMedia` logs the count).
- [ ] 20. Open a pharmacy search; confirm `placesProxy` invocations appear in
       Cloud console → Functions and results render.
- [ ] 21. Send a message, an image and a voice note; block, confirm the blocked
       party is refused; unblock.
- [ ] 22. Save a listing, delete it from another account, reopen Saved
       listings — the row disappears, **the screen does not break**. (This was
       broken until Phase C.)
- [ ] 23. Delete a test account end to end; confirm the other party still has
       the conversation with your name removed.

---

## 7. REAL ANDROID DEVICE TEST

Full instructions in `docs/APP-CHECK.md`.

- [ ] 24. Add the release **SHA-256** to the Firebase Android app.
- [ ] 25. Upload the app to Play (any track) — Play Integrity cannot verify an
       APK Play has never seen.
- [ ] 26. Register **Play Integrity** in Firebase → App Check.
- [ ] 27. Build and install a release APK on a **physical device with Play
       services**:
       ```
       npx expo prebuild -p android --clean
       echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
       npm run build:android
       ```
       Confirm no x86 slice: `unzip -l app-release.apk | grep 'lib/x86'`.
- [ ] 28. Exercise the app; watch App Check → Metrics for **Verified** climbing.
- [ ] 29. Confirm push notifications arrive (FCM, unrelated to App Check).
- [ ] 30. Trigger a deliberate non-fatal (`sendTestNonFatal`); confirm it
       reaches Crashlytics and carries **no** phone number, e-mail or message
       text.

---

## 8. REAL IPHONE TEST

- [ ] 31. Register **App Attest** in Firebase → App Check (Team `MY9Y7Y46Q7`,
       bundle `com.stanislas20.cheznous`).
- [ ] 32. Build with the production entitlement — **this is the one that fails
       silently if forgotten**:
       ```
       APS_ENVIRONMENT=production npx expo prebuild -p ios --clean
       ```
       Verify `ios/ChezNous/ChezNous.entitlements` says `production`.
- [ ] 33. Archive, upload to TestFlight, install on a **physical device
       (iOS 14+)**.
- [ ] 34. Confirm push works — a store build carrying `development` gets a
       sandbox token the live gateway rejects, silently, for every user.
- [ ] 35. Exercise the app; watch App Check → Metrics.
- [ ] 36. Confirm Crashlytics receives a test non-fatal.

---

## 9. APP CHECK ENFORCEMENT — LATER, NOT AT LAUNCH

Only after steps 24–36 show **Verified** clearly dominating, and after the new
build has been live long enough that unverified traffic from old installs has
fallen to near zero. Each switch locks out every client that cannot attest.

One at a time, watching metrics between each. Reversible from the same page.

- [ ] 37. **`placesProxy`** first — newest surface, fewest users, spends money
       per request. If anything is wrong you learn it here.
- [ ] 38. **Storage** — blast radius is "photos stop uploading", visible
       immediately.
- [ ] 39. **The other callables** — watch `claimPhoneCountry` especially: it
       runs during sign-up, so a failure means nobody can create an account.
- [ ] 40. **Firestore last.** It is everything; a mistake here is a total
       outage.
- [ ] 41. **Authentication** App Check is a separate switch, for the RNFirebase
       phone-auth path.

**Never enforce `listingPage`** — it is fetched by WhatsApp and Facebook
crawlers, which cannot attest.

---

## 10. ONGOING

- [ ] 42. Watch the signals in `docs/MONITORING.md` — Firestore reads/day,
       Storage total bytes, function errors, `placesProxy` invocations.
- [ ] 43. Set the log-based alerts listed there, especially the one on
       `"could not be removed and are now orphaned"`.
- [ ] 44. Rotate the service-account key mentioned in the sibling
       `chez-nous-pharmacy-sync` repository, which is committed there.
