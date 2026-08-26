import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "cheznous.papers.v1";

// What this phone knows about its owner's vehicle papers.
//
// Dates the owner typed, kept on the device and nowhere else. They are not
// sent anywhere: an insurance expiry and a licence date are the reader's
// business, the app gains nothing by holding them on a server, and a
// document date is exactly the sort of thing that should not leave a handset
// without a reason. The same store the battery screen uses.
export function useVehiclePapers() {
  const [papers, setPapers] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        setPapers(raw ? JSON.parse(raw) : {});
        setLoaded(true);
      })
      .catch(() => {
        // Storage failing costs the reader their dates, never the screen.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const write = useCallback((next) => {
    setPapers(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // An ISO date for the papers that expire, `true` for the ones that are
  // simply held or not. Passing null forgets the entry entirely, which is
  // how somebody corrects a date they typed wrong.
  const remember = useCallback(
    (key, value) =>
      setPapers((prev) => {
        const next = { ...prev };
        if (value == null) delete next[key];
        else next[key] = value;
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      }),
    [],
  );

  // The folder's own name, kept beside the dates rather than in a store of
  // its own. It is not a paper and must never be counted as one: the screen
  // filters on paperKinds, so a stored label cannot be mistaken for a
  // document the reader has entered.
  const rememberVehicle = useCallback(
    (label) =>
      setPapers((prev) => {
        const next = { ...prev };
        const trimmed = (label ?? "").trim();
        if (!trimmed) delete next.vehicle;
        else next.vehicle = trimmed;
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      }),
    [],
  );

  return { papers, loaded, remember, rememberVehicle, write };
}
