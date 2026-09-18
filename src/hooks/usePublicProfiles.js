import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// The public face and name behind a uid.
//
// Three screens need the same thing and none of them can read it directly.
// A rating carries raterId and nothing about the person. A conversation
// carries participantIds and a denormalised name, but no picture. So a
// review was anonymous feedback about somebody you are deciding whether to
// trust, and a thread was a letter from an initial.
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
// Both callers are already bounded — useRatings caps a profile's reviews at
// REVIEW_PAGE (25) and useConversations caps the inbox at CONVERSATIONS_CAP
// (50). Those are the CALLERS' bounds though, and a bound that lives in
// another file is one refactor from being gone, so this hook refuses to read
// more than MAX_LOOKUPS whatever it is handed. It is set to cover the larger
// of the two.
const MAX_LOOKUPS = 50;

// ── The cache is MODULE scope, deliberately ─────────────────────────────
//
// Per-hook state was enough when only the reviews list used this. It is not
// enough now: the same person is the counterpart of a conversation row, the
// header of the thread you open from it, and the author of a review on their
// profile. A per-instance cache re-reads that one uid on each of those
// screens, and again every time you navigate back.
//
// One Map, for the life of the process. A uid is fetched once and every
// screen afterwards reads it for free — which is what makes opening a thread
// from the inbox cost nothing at all.
//
// It is never invalidated, and that is a real trade: a profile picture
// changed during a session shows the old one until the app restarts. The
// alternative is a listener per uid, which is the unbounded thing this hook
// exists to avoid, and a stale avatar for one session is a small price.
const profileCache = new Map();

export function usePublicProfiles(uids) {
  const [profiles, setProfiles] = useState({});

  // A miss is cached too, as null. A person with no projection yet is a
  // permanent, cheap "no picture" — retrying them on every snapshot would be
  // an unbounded read loop against the one case guaranteed to fail.
  const resolved = useRef(profileCache);

  // The caller builds this array inline, so it is a new identity on every
  // render and useless as a dependency. The ids themselves are the input.
  const key = Array.isArray(uids)
    ? [...new Set(uids.filter(Boolean))].sort().join(",")
    : "";

  useEffect(() => {
    if (!isFirebaseConfigured || !key) return undefined;

    let active = true;
    const wanted = key.split(",").slice(0, MAX_LOOKUPS);
    const missing = wanted.filter((uid) => !resolved.current.has(uid));

    // Publish what is already known BEFORE fetching anything, and before the
    // early return below.
    //
    // This line is what a module-level cache costs. With per-instance state
    // every mount started empty and filled itself, so the only way to get a
    // face on screen was to fetch one. Now a uid another screen already
    // looked up is sitting in the Map — and without this the effect saw
    // nothing missing, returned immediately, never called setProfiles, and
    // the component rendered initials for somebody whose photo it was
    // holding. A cache that makes the second visit WORSE than the first.
    const known = Object.fromEntries(
      wanted
        .filter((uid) => resolved.current.has(uid))
        .map((uid) => [uid, resolved.current.get(uid)]),
    );
    if (Object.keys(known).length) setProfiles(known);

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

      setProfiles(
        Object.fromEntries(
          wanted.map((uid) => [uid, resolved.current.get(uid) ?? null]),
        ),
      );
    })();

    return () => {
      active = false;
    };
  }, [key]);

  return profiles;
}
