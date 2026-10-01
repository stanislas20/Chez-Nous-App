import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Public follower/following/like counts and rating summary for a seller.
//
// These live in their own collection rather than on `sellers` because that
// document is private — firestore.rules lets nobody but the owner read it,
// which is what keeps RCCM, IFU and the representative's ID off the wire.
// A visitor still has to see these three numbers, so the counts are
// projected out the same way verified companies are.
//
// They're counters rather than live queries because the underlying data is
// unreadable to the viewer by design: `favorites` is per-user private, so a
// visitor literally cannot count anyone's likes themselves. Only the Cloud
// Functions in functions/index.js write here.
export function useSellerStats(sellerId) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !sellerId) {
      setStats(null);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(firestore, "sellerStats", sellerId),
      (snapshot) => {
        const data = snapshot.data();
        // A seller nobody has followed or liked yet has no document at all,
        // which is three zeroes rather than an error state.
        // Clamped as well as defaulted: a counter that drifted below zero
        // before the trigger learned to floor it should still read as 0
        // rather than showing "-1 abonné".
        const atLeastZero = (value) => Math.max(0, Number(value) || 0);
        setStats({
          followers: atLeastZero(data?.followers),
          following: atLeastZero(data?.following),
          likes: atLeastZero(data?.likes),
          // Profile likes are a DIFFERENT number from `likes` above.
          //
          // `likes` counts private listing saves received and is what the
          // per-listing analytics read. `profileLikes` counts people who
          // publicly liked this seller's profile, which is the number the
          // dashboard shows and the one Likes Received lists. Keeping them
          // apart is the whole point: a save is a bookmark its author was
          // promised privacy on, a profile like is an endorsement.
          profileLikes: atLeastZero(data?.profileLikes),
          // Written by applyRatingDelta in functions/index.js, already
          // rounded to one decimal there. These were missing from this
          // projection, so every screen reading stats.rating got undefined
          // and the star average silently never rendered — the reviews
          // themselves were listed, with no score above them.
          rating: atLeastZero(data?.rating),
          ratingCount: atLeastZero(data?.ratingCount),
          // Projected from the private profile by syncSellerPublicProfile,
          // because sellers/{uid} is unreadable to anyone but its owner.
          // Always current, unlike a copy stamped onto a listing at publish
          // time — which is why the picture shows on listings posted long
          // before the seller uploaded one.
          photoUrl: data?.photoUrl ?? null,
          displayName: data?.displayName ?? null,
        });
      },
      () =>
        setStats({
          followers: 0,
          following: 0,
          likes: 0,
          profileLikes: 0,
          rating: 0,
          ratingCount: 0,
        }),
    );

    return unsubscribe;
  }, [sellerId]);

  return stats;
}
