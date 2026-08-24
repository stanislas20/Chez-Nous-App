import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "cheznous.tyreSize.v1";

// The size of the car you own does not change between visits.
//
// Making somebody read three numbers off a sidewall every time they open the
// screen is the reason a search box gets used once and never again. Kept on
// the device rather than the profile on purpose: it needs no account, it is
// nobody else's business, and it survives being signed out.
export function useSavedTyreSize() {
  const [saved, setSaved] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (cancelled) return;
        setSaved(value || null);
        setLoaded(true);
      })
      .catch(() => {
        // A device that cannot read its own storage still has a working
        // search box — this is a convenience, never a dependency.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((size) => {
    if (!size) return;
    setSaved(size);
    AsyncStorage.setItem(STORAGE_KEY, size).catch(() => {});
  }, []);

  const forget = useCallback(() => {
    setSaved(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  return { saved, loaded, remember, forget };
}
