import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { reportNonFatal } from "../utils/reportError";

// A seller's public shopfront, readable by anybody. Unbounded, this was the
// one listings listener a stranger could open on somebody else's catalogue —
// the reader pays for every advert the seller has ever had approved, on every
// visit to the profile.
const SELLER_LISTINGS_CAP = 60;

// A seller's other approved listings — safe to query publicly (the same
// read rule that lets any buyer open one of these listings already allows
// querying them), unlike the private sellers/{uid} profile doc.
export function useSellerListings(sellerId) {
  const [listings, setListings] = useState(null);
  // Whether the empty array above means empty, or means the read failed.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !sellerId) {
      setListings([]);
      return undefined;
    }

    const listingsQuery = query(
      collection(firestore, "listings"),
      where("sellerId", "==", sellerId),
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(SELLER_LISTINGS_CAP),
    );

    const unsubscribe = onSnapshot(
      listingsQuery,
      (snapshot) => {
        setFailed(false);
        setListings(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
      // An error is not an empty shop.
      //
      // This used to collapse a failed listener into [], which draws exactly
      // the same screen as a seller who has never posted anything — so a
      // network failure told a visitor the seller has nothing for sale, and
      // told the seller their own catalogue had vanished. The audit filed
      // this as P2-7. The flag is returned so the screen can say which it is.
      (error) => {
        setFailed(true);
        setListings([]);
        reportNonFatal("sellerListings", error, { where: "useSellerListings" });
      },
    );

    return unsubscribe;
  }, [sellerId]);

  // An array, plus whether it is empty because it is empty.
  return { listings, failed };
}
