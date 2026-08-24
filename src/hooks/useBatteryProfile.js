import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "cheznous.battery.v1";

// What this phone knows about its owner's battery.
//
// Two things, both entered by the person themselves and both kept on the
// device: which vehicle they drive, and when they last had the battery
// tested. The second is the honest version of a "status" line — the app
// cannot test a battery or watch one age, so the only truthful thing it can
// show is what the owner told it and when.
export function useBatteryProfile() {
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        setProfile(raw ? JSON.parse(raw) : null);
        setLoaded(true);
      })
      .catch(() => {
        // Storage failing costs the reader a convenience, never the screen.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback((next) => {
    setProfile(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const rememberVehicle = useCallback(
    (make, model, spec) =>
      setProfile((prev) => {
        const next = { ...(prev ?? {}), make, model, spec };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      }),
    [],
  );

  const rememberTest = useCallback(
    () =>
      setProfile((prev) => {
        const next = { ...(prev ?? {}), testedAt: Date.now() };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      }),
    [],
  );

  const forget = useCallback(() => {
    setProfile(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  return { profile, loaded, save, rememberVehicle, rememberTest, forget };
}
