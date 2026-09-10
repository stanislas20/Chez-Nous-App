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

// A carousel, not a catalogue. Approved ads are ordered newest first and the
// screen shows a few; reading every ad ever approved to render three was the
// unbounded listener the audit found next to useVerifiedCompanies.
const ADS_CAP = 12;

export function useApprovedAds() {
  const [ads, setAds] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAds([]);
      return undefined;
    }

    const adsQuery = query(
      collection(firestore, "ads"),
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(ADS_CAP),
    );

    const unsubscribe = onSnapshot(adsQuery, (snapshot) => {
      setAds(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return unsubscribe;
  }, []);

  return ads;
}
