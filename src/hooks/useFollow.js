import { useEffect, useState } from "react";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// One document per follow, keyed `{follower}_{seller}` so the pair can only
// exist once — following twice is the same write, not a second follower.
// The counts these drive are maintained by Cloud Functions; the client
// never writes them, so a follower count can't be inflated from a phone.
export function useFollow(sellerId, userId, names = {}) {
  const [isFollowing, setIsFollowing] = useState(false);
  // Distinguishes "not following" from "not known yet", so the button
  // doesn't flash the wrong label on first paint.
  const [isReady, setIsReady] = useState(false);

  const canFollow = Boolean(
    isFirebaseConfigured && sellerId && userId && sellerId !== userId,
  );

  useEffect(() => {
    if (!canFollow) {
      setIsFollowing(false);
      setIsReady(Boolean(sellerId));
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(firestore, "follows", `${userId}_${sellerId}`),
      (snapshot) => {
        setIsFollowing(snapshot.exists());
        setIsReady(true);
      },
      () => setIsReady(true),
    );

    return unsubscribe;
  }, [canFollow, sellerId, userId]);

  // Returns whether the write landed. Swallowing the rejection here is
  // what made a denied follow look like an unresponsive button: nothing
  // moved, and nothing said why.
  const toggleFollow = async () => {
    if (!canFollow) return false;
    const followRef = doc(firestore, "follows", `${userId}_${sellerId}`);
    try {
      if (isFollowing) {
        await deleteDoc(followRef);
      } else {
        await setDoc(followRef, {
          followerId: userId,
          sellerId,
          // Denormalized so the followers and following lists can name
          // people without reading their profiles — sellers/{uid} is
          // owner-only by design. Nulls stay null; the list shows a
          // placeholder rather than inventing a name.
          followerName: names.followerName ?? null,
          sellerName: names.sellerName ?? null,
          createdAt: serverTimestamp(),
        });
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  // `canFollow` is false for your own profile and while signed out, which
  // is how the caller knows to hide the button rather than show one that
  // fails on press.
  return { isFollowing, isReady, canFollow, toggleFollow };
}
