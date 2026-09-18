import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Who wrote each review.
//
// A rating document carries raterId, ratedId, stars and a comment — and
// nothing about the person. So the reviews list could show a score and a
// sentence but never a name or a face, which reads as anonymous feedback
// about somebody you are deciding whether to trust.
//
// ── Where the face comes from ───────────────────────────────────────────
//
// NOT from sellers/{uid}. That document is private:
//
//   match /sellers/{userId} {
//     allow read: if request.auth != null && request.auth.uid == userId;
//   }
//
// Reading another person's profile is denied, and it should be — that
// document also holds push tokens and, for company accounts, the RCCM and
// IFU papers. Widening it to show a 40px circle would be a poor trade.
//
// sellerStats/{uid} is the public projection that exists for exactly this:
// `allow read: if true`, `allow write: if false`, carrying displayName and
// photoUrl, written only by syncSellerPublicProfile in functions/index.js.
// It is also always current, unlike a name copied onto the rating at the
// moment it was written — somebody who fixes their photo fixes it on every
// review they have ever left.
//
// ── Why one document at a time ──────────────────────────────────────────
//
// `where(documentId(), "in", ids)` would be one round trip instead of N,
// and useListingsByIds.js documents why that shape was abandoned there: a
// query is all-or-nothing against the rules, so one id the rules throw on
// fails the WHOLE query rather than dropping one row. sellerStats reads as
// `if true` and cannot throw, so the argument is weaker here — but the
// failure it produces is the same shape (one bad id costs every face on the
// screen), the saving is at most 25 reads on a screen that is already
// loading listing images, and a partial answer is the correct answer here.
//
// ── The cap ─────────────────────────────────────────────────────────────
//
// useRatings caps the list at REVIEW_PAGE, so the caller passes at most 25
// ids today. That is the caller's bound, not this hook's, and a bound that
// lives somewhere else is one refactor away from being gone. This hook
// therefore refuses to read more than MAX_LOOKUPS no matter what it is
// handed.
const MAX_LOOKUPS = 25;

export function useReviewerProfiles(raterIds) {
  const [profiles, setProfiles] = useState({});

  // Resolved ids, kept across snapshots. The ratings listener re-fires on
  // every star change and every new review; without this, each of those
  // re-read every face on the screen.
  //
  // A miss is cached too, as null. A person with no projection yet is a
  // permanent, cheap "no picture" — retrying them on every snapshot would
  // be an unbounded read loop against the one case guaranteed to fail.
  const resolved = useRef(new Map());

  // The caller builds this array inline, so it is a new identity on every
  // render and useless as a dependency. The ids themselves are the input.
  const key = Array.isArray(raterIds)
    ? [...new Set(raterIds.filter(Boolean))].sort().join(",")
    : "";

  useEffect(() => {
    if (!isFirebaseConfigured || !key) return undefined;

    let active = true;
    const wanted = key.split(",").slice(0, MAX_LOOKUPS);
    const missing = wanted.filter((uid) => !resolved.current.has(uid));
    if (missing.length === 0) return undefined;

    (async () => {
      for (const uid of missing) {
        let value = null;
        try {
          const snapshot = await getDoc(doc(firestore, "sellerStats", uid));
          if (snapshot.exists()) {
            const data = snapshot.data();
            value = {
              displayName: data?.displayName ?? null,
              photoUrl: data?.photoUrl ?? null,
            };
          }
        } catch {
          // A failed lookup is not a failed review. The card still renders
          // with its initial, which is what it did before this hook
          // existed — never a blank space where a person should be.
          value = null;
        }
        // Checked after the await, not before the loop: the screen can be
        // gone by the time any one of these resolves.
        //
        // This single check covers both things that must stop at teardown.
        // It abandons the REMAINING lookups — closing a profile with twenty
        // faces still pending should not go on paying for them — and,
        // because returning here skips the setProfiles below and nothing
        // between the two awaits, it is also what prevents a state update on
        // a screen that is gone. A second guard down there reads as belt and
        // braces but is unreachable, and an unreachable guard is a line no
        // test can hold to account.
        if (!active) return;
        resolved.current.set(uid, value);
      }

      setProfiles(Object.fromEntries(resolved.current));
    })();

    return () => {
      active = false;
    };
  }, [key]);

  return profiles;
}
