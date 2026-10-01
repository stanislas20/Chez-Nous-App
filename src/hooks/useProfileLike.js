import { useEffect, useState } from "react";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Liking a profile, which is not following one.
//
// Follow says "tell me what this seller posts". A like says "this seller is
// worth dealing with" — an endorsement that stands on its own and does not
// subscribe you to anything. The two are deliberately separate documents,
// separate counters and separate buttons; merging them would make a quiet
// compliment into a feed subscription nobody asked for.
//
// It is also not a Save. The heart on a LISTING writes `favorites`, which
// firestore.rules makes readable by its author alone — a private bookmark.
// This is the opposite by design: a profile like is public, and the person
// liked is meant to see who did it.
//
// One document per pair, keyed `{liker}_{seller}` so liking twice is the
// same write rather than a second like. The counter it drives is maintained
// by a Cloud Function; the client never writes it, so a like count cannot be
// inflated from a phone.
export function useProfileLike(sellerId, userId) {
  const [isLiked, setIsLiked] = useState(false);
  // Distinguishes "not liked" from "not known yet", so the button does not
  // flash the wrong label on first paint.
  const [isReady, setIsReady] = useState(false);

  // False on your own profile and while signed out, which is how the caller
  // knows to hide the button rather than show one that fails on press. The
  // rules reject a self-like too; this stops it ever being offered.
  const canLike = Boolean(
    isFirebaseConfigured && sellerId && userId && sellerId !== userId,
  );

  useEffect(() => {
    if (!canLike) {
      setIsLiked(false);
      setIsReady(Boolean(sellerId));
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(firestore, "profileLikes", `${userId}_${sellerId}`),
      (snapshot) => {
        setIsLiked(snapshot.exists());
        setIsReady(true);
      },
      () => setIsReady(true),
    );

    return unsubscribe;
  }, [canLike, sellerId, userId]);

  // Returns whether the write landed. Swallowing the rejection is what makes
  // a denied write look like an unresponsive button: nothing moves, and
  // nothing says why.
  const toggleLike = async () => {
    if (!canLike) return false;
    const likeRef = doc(firestore, "profileLikes", `${userId}_${sellerId}`);
    try {
      if (isLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          likerId: userId,
          sellerId,
          createdAt: serverTimestamp(),
        });
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  return { isLiked, isReady, canLike, toggleLike };
}
