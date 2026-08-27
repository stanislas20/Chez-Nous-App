import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "cheznous.fleet.v1";

// The vehicles this phone's owner runs, and the dates on their papers.
//
// On the device and nowhere else, for the same reason useVehiclePapers is:
// an insurance expiry, a plate and a driver's name are the owner's business,
// and a fleet is a business record — knowing which four vehicles somebody
// runs and who drives them is exactly the sort of thing a marketplace has no
// reason to hold.
//
// The cost is real and worth stating: a lost handset is a lost fleet. That
// is a trade the owner can be offered later, deliberately, the way paper
// reminders are — those leave the device only when somebody switches them
// on, and only so a server can send the reminder.
export function useFleet() {
  const [vehicles, setVehicles] = useState([]);
  const [papers, setPapers] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const saved = raw ? JSON.parse(raw) : {};
        setVehicles(Array.isArray(saved.vehicles) ? saved.vehicles : []);
        setPapers(saved.papers ?? {});
        setLoaded(true);
      })
      .catch(() => {
        // Storage failing costs the owner their list, never the screen.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const write = useCallback((nextVehicles, nextPapers) => {
    setVehicles(nextVehicles);
    setPapers(nextPapers);
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ vehicles: nextVehicles, papers: nextPapers }),
    ).catch(() => {});
  }, []);

  const addVehicle = useCallback(
    (vehicle) => write([...vehicles, vehicle], papers),
    [vehicles, papers, write],
  );

  // Removing a vehicle takes its dates with it. Leaving them behind would
  // quietly resurrect them under a new vehicle that happened to reuse the
  // id, and orphaned dates are worse than none: they look like an answer.
  const removeVehicle = useCallback(
    (id) => {
      const nextPapers = { ...papers };
      delete nextPapers[id];
      write(
        vehicles.filter((item) => item.id !== id),
        nextPapers,
      );
    },
    [vehicles, papers, write],
  );

  // A null date forgets the entry, which is how somebody corrects a date
  // they typed wrong — the same contract useVehiclePapers offers.
  const rememberDate = useCallback(
    (vehicleId, key, value) => {
      const forVehicle = { ...(papers[vehicleId] ?? {}) };
      if (value == null) delete forVehicle[key];
      else forVehicle[key] = value;
      write(vehicles, { ...papers, [vehicleId]: forVehicle });
    },
    [vehicles, papers, write],
  );

  return { vehicles, papers, loaded, addVehicle, removeVehicle, rememberDate };
}
