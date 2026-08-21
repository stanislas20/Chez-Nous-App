import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'recentlyViewedListings';
const MAX_ITEMS = 20;

// A real, on-device history of listings this seller actually opened —
// stored locally (not Firestore) since it's personal browsing history, not
// shared/public data. Only the fields ListingCard needs are kept, snapshotted
// at view time (not live), same "what you actually saw" semantics as a
// browser's history.
async function readList() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function recordRecentlyViewed(listing) {
  if (!listing?.id) return;
  const snapshot = {
    id: listing.id,
    titleEn: listing.titleEn,
    titleFr: listing.titleFr,
    price: listing.price,
    city: listing.city,
    categoryKey: listing.categoryKey,
    mediaUrl: listing.mediaUrl ?? listing.image ?? null,
    mediaType: listing.mediaType ?? null,
    sellerId: listing.sellerId ?? null,
    popular: !!listing.popular,
    isPromoted: !!listing.isPromoted,
    saleStatus: listing.saleStatus ?? null,
    viewedAt: Date.now(),
  };
  try {
    const existing = await readList();
    const deduped = existing.filter((item) => item.id !== listing.id);
    const next = [snapshot, ...deduped].slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Non-critical — losing local view history shouldn't disrupt browsing.
  }
}

export function useRecentlyViewed() {
  const [listings, setListings] = useState(null);

  const refresh = useCallback(() => {
    readList().then(setListings);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { listings, refresh };
}
