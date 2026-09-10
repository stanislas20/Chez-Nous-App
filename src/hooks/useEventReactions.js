import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Two listeners, and the second was the larger of the two problems the audit
// found here: `collection(firestore, "eventReactions")` with no filter and no
// limit is every reaction anybody has ever left on any event, held live, for
// every reader.
//
// MY_LIKES_CAP bounds the reader's own likes, which they control the size of.
//
// REACTIONS_CAP is the honest one. Reaction COUNTS are derived by tallying
// this stream, so a cap makes a count approximate once a single event passes
// it — the glyphs stay right, the number stops climbing. The alternative is a
// server-maintained counter per event, which is a new trigger and a new field
// rather than a bound on an existing read, and this phase is remediation. The
// boundary is written down here so nobody later mistakes a plateaued count
// for a bug in the tally.
const MY_LIKES_CAP = 500;
const REACTIONS_CAP = 1000;

// Liking, and reacting, for events.
//
// Two collections because they are two different gestures with two
// different audiences — see the note in src/data/events.js. A like is
// private and follows the same shape as favorites/jobFavorites. A reaction
// is public, one per person per event, and changeable: tapping the same
// glyph again takes it back.
//
// The counts are read from the reaction documents themselves rather than
// kept on the listing. They cannot live on the listing: firestore.rules
// lets only a listing's own seller write it, so an attendee incrementing a
// counter there would be denied — and loosening that rule to allow it would
// open every field on every listing to every account.
//
// That means this subscribes to the whole reactions collection to total
// them up. At the scale this app is at, that is a handful of documents and
// the simplest thing that is actually correct. It is the piece to revisit
// first if events take off: the fix is a counter maintained by a Cloud
// Function, not a client-side loosening of the listing rules.
export function useEventReactions(userId) {
  const [likedIds, setLikedIds] = useState(new Set());
  const [myReactions, setMyReactions] = useState(new Map());
  const [reactionDocs, setReactionDocs] = useState([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !userId) {
      setLikedIds(new Set());
      return undefined;
    }

    const likesQuery = query(
      collection(firestore, "eventLikes"),
      where("userId", "==", userId),
      limit(MY_LIKES_CAP),
    );
    return onSnapshot(
      likesQuery,
      (snapshot) =>
        setLikedIds(new Set(snapshot.docs.map((d) => d.data().eventId))),
      () => setLikedIds(new Set()),
    );
  }, [userId]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setReactionDocs([]);
      return undefined;
    }

    return onSnapshot(
      query(collection(firestore, "eventReactions"), limit(REACTIONS_CAP)),
      (snapshot) => setReactionDocs(snapshot.docs.map((d) => d.data())),
      () => setReactionDocs([]),
    );
  }, []);

  // Mine is derived from the same stream rather than fetched separately, so
  // the glyph you just tapped and the count it belongs to can never
  // disagree with each other.
  useEffect(() => {
    if (!userId) {
      setMyReactions(new Map());
      return;
    }
    const mine = new Map();
    reactionDocs.forEach((entry) => {
      if (entry.userId === userId && entry.reaction) {
        mine.set(entry.eventId, entry.reaction);
      }
    });
    setMyReactions(mine);
  }, [reactionDocs, userId]);

  // eventId -> { fire: 3, love: 1, ... }, and a total for the card.
  const reactionCounts = useMemo(() => {
    const counts = new Map();
    reactionDocs.forEach((entry) => {
      if (!entry.eventId || !entry.reaction) return;
      const forEvent = counts.get(entry.eventId) ?? {};
      forEvent[entry.reaction] = (forEvent[entry.reaction] ?? 0) + 1;
      counts.set(entry.eventId, forEvent);
    });
    return counts;
  }, [reactionDocs]);

  // The heart flips first and the write follows.
  //
  // It used to wait for the snapshot to come back, which meant a tap did
  // nothing visible for as long as the round trip took — and did nothing at
  // all, silently, when the write was refused. A rejected promise nobody
  // catches is not feedback. Now the state moves at once and puts itself
  // back if the write fails, and the failure is thrown for the screen to
  // say out loud.
  const toggleLike = async (eventId) => {
    if (!isFirebaseConfigured || !userId) return;
    const wasLiked = likedIds.has(eventId);
    const apply = (liked) =>
      setLikedIds((previous) => {
        const next = new Set(previous);
        if (liked) next.add(eventId);
        else next.delete(eventId);
        return next;
      });

    apply(!wasLiked);
    const likeRef = doc(firestore, "eventLikes", `${userId}_${eventId}`);
    try {
      if (wasLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          userId,
          eventId,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      apply(wasLiked);
      throw error;
    }
  };

  // One reaction per person. Tapping what you already chose removes it,
  // tapping a different glyph replaces it — the document id is per person
  // per event, so there is no way to end up counted twice.
  const setReaction = async (eventId, reaction) => {
    if (!isFirebaseConfigured || !userId) return;
    const reactionRef = doc(
      firestore,
      "eventReactions",
      `${userId}_${eventId}`,
    );
    const previous = myReactions.get(eventId) ?? null;
    const apply = (value) =>
      setMyReactions((current) => {
        const next = new Map(current);
        if (value) next.set(eventId, value);
        else next.delete(eventId);
        return next;
      });

    apply(previous === reaction ? null : reaction);
    try {
      if (previous === reaction) {
        await deleteDoc(reactionRef);
      } else {
        await setDoc(reactionRef, {
          userId,
          eventId,
          reaction,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      apply(previous);
      throw error;
    }
  };

  return { likedIds, myReactions, reactionCounts, toggleLike, setReaction };
}
