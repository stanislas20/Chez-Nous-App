import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Newest first, capped: a profile shows recent experience, and nobody
// scrolls to review number 200. The average on the profile comes from
// sellerStats, which counts every rating rather than just these.
const REVIEW_PAGE = 25;

export function useRatings(ratedId) {
  const [ratings, setRatings] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !ratedId) {
      setRatings([]);
      return undefined;
    }

    const ratingsQuery = query(
      collection(firestore, "ratings"),
      where("ratedId", "==", ratedId),
      orderBy("updatedAt", "desc"),
      limit(REVIEW_PAGE),
    );

    const unsubscribe = onSnapshot(
      ratingsQuery,
      (snapshot) =>
        setRatings(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        ),
      // Most often a composite index still building; an empty list is a
      // better failure than a screen stuck loading forever.
      () => setRatings([]),
    );

    return unsubscribe;
  }, [ratedId]);

  return ratings;
}

// Everything the rating control needs: whether this person is allowed to
// rate at all, and what they said last time if they already have.
// Three attempts at 1s, 2s, 4s. Enough to ride out a handover or a lift,
// short enough that it is finished long before anybody wonders, and
// finite so a permanently unreachable backend cannot turn this into a
// polling loop.
const RATING_GATE_MAX_RETRIES = 3;
const RATING_GATE_RETRY_BASE_MS = 1000;

export function useMyRating(ratedId, userId) {
  const [state, setState] = useState({
    canRate: false,
    // "loading" until the first answer. Distinct from "ineligible", which
    // is a real verdict, and from "unknown", which is a failed read.
    eligibility: "loading",
    isReady: false,
    myRating: null,
  });

  useEffect(() => {
    let active = true;

    if (!isFirebaseConfigured || !ratedId || !userId || ratedId === userId) {
      setState({
        canRate: false,
        eligibility: "ineligible",
        isReady: true,
        myRating: null,
      });
      return undefined;
    }

    // The contacts marker is the interaction gate — see firestore.rules.
    // Checked both ways round because it is stored under the sorted pair.
    const pair = [userId, ratedId].sort().join("_");

    // ── Why a failed read is not an answer ──────────────────────────────
    //
    // This was one getDoc whose rejection was swallowed into
    // `canRate = false` — so a single transient network failure hid "Leave
    // a review" for the entire life of the screen, with nothing retrying
    // and nothing said. Observed during RC2 testing: the link vanished
    // after a network blip and only came back on a fresh mount, which
    // reads as the app forgetting the two of you had ever spoken.
    //
    // The three outcomes are now kept apart:
    //
    //   contact.exists() true   ELIGIBLE     — show the control
    //   contact.exists() false  INELIGIBLE   — a real answer: these two
    //                                          have never messaged. Final,
    //                                          no retry, control stays
    //                                          hidden.
    //   the read threw          UNKNOWN      — not an answer at all. Retry,
    //                                          bounded; keep the control
    //                                          hidden meanwhile.
    //
    // The direction of the failure mode matters: UNKNOWN renders exactly
    // like INELIGIBLE. Someone who genuinely may not review is never shown
    // the control because a read failed, only the reverse — and the server
    // rules are the real gate regardless of what this hook believes.
    let attempt = 0;
    let retryTimer = null;

    const resolveEligibility = async (snapshot) => {
      let eligibility;
      try {
        const contact = await getDoc(doc(firestore, "contacts", pair));
        eligibility = contact.exists() ? "eligible" : "ineligible";
      } catch {
        eligibility = "unknown";
      }
      if (!active) return;

      setState({
        canRate: eligibility === "eligible",
        eligibility,
        isReady: true,
        myRating: snapshot.exists()
          ? { id: snapshot.id, ...snapshot.data() }
          : null,
      });

      if (eligibility !== "unknown") {
        attempt = 0;
        return;
      }
      // Bounded, and backing off: 1s, 2s, 4s, then stop. Not polling — a
      // definite answer ends it, and so does running out of attempts, so
      // this cannot become a permanent read loop against Firestore.
      if (attempt >= RATING_GATE_MAX_RETRIES) return;
      const delay = RATING_GATE_RETRY_BASE_MS * 2 ** attempt;
      attempt += 1;
      retryTimer = setTimeout(() => {
        if (active) resolveEligibility(snapshot);
      }, delay);
    };

    const unsubscribe = onSnapshot(
      doc(firestore, "ratings", `${userId}_${ratedId}`),
      (snapshot) => {
        if (retryTimer) clearTimeout(retryTimer);
        attempt = 0;
        resolveEligibility(snapshot);
      },
      () =>
        active &&
        setState({
          canRate: false,
          // The ratings listener itself failed, which says nothing about
          // whether these two have spoken.
          eligibility: "unknown",
          isReady: true,
          myRating: null,
        }),
    );

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [ratedId, userId]);

  return state;
}

// Returns whether the write landed, so the caller can say something useful
// instead of leaving a button that appears to do nothing.
export async function submitRating({
  ratedId,
  userId,
  stars,
  comment,
  isEdit,
}) {
  if (!isFirebaseConfigured || !ratedId || !userId || ratedId === userId)
    return false;
  const value = Number(stars);
  if (!Number.isInteger(value) || value < 1 || value > 5) return false;

  try {
    await setDoc(
      doc(firestore, "ratings", `${userId}_${ratedId}`),
      {
        raterId: userId,
        ratedId,
        stars: value,
        comment: String(comment ?? "")
          .trim()
          .slice(0, 500),
        updatedAt: serverTimestamp(),
        // Only on the first write. `merge` does not protect a field you
        // send again — including createdAt here would restamp an edited
        // review as if it were new.
        ...(isEdit ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true },
    );
    return true;
  } catch {
    return false;
  }
}

export async function removeRating({ ratedId, userId }) {
  if (!isFirebaseConfigured || !ratedId || !userId) return false;
  try {
    await deleteDoc(doc(firestore, "ratings", `${userId}_${ratedId}`));
    return true;
  } catch {
    return false;
  }
}
