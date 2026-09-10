import { useEffect, useState } from "react";
import { searchPlacesByText } from "../utils/places";
import { distanceInKm } from "../utils/geo";
import { extractPlacePhoto } from "../utils/placePhoto";

const FIELD_MASK =
  "places.id,places.displayName,places.location,places.formattedAddress," +
  "places.internationalPhoneNumber,places.currentOpeningHours.openNow,places.rating," +
  "places.photos";

// useNearbyPharmacies only ever sees whatever's within a fixed radius of the
// user (capped at 20 results) — a specific pharmacy the user names by
// search, like "Pharmacie Les Archanges", can easily be further away than
// that, or just outside the top 20 nearest. This calls Google Places' Text
// Search (searching by name, not proximity) so a user can look up any real
// pharmacy by name, on duty or not, anywhere — not only ones close by.
// Distinct from the ONPB on-duty roster: these are ordinary Google Places
// results and never claim to be "on duty" — CategoryListingsScreen already
// keeps that distinction visually explicit for useNearbyPharmacies results,
// and this reuses the exact same presentation.
export function useSearchPharmacies(query, coords) {
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'loaded' | 'error'
  const [pharmacies, setPharmacies] = useState([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setStatus("idle");
      setPharmacies([]);
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");

    // Through the Cloud Function. The Bénin bounding rectangle is applied
    // there as well as here: this endpoint is now reachable by any signed-in
    // caller, and an unbounded text search is a general-purpose Places
    // account for whoever finds it.
    searchPlacesByText({
      textQuery: `${trimmed} pharmacy Benin`,
      type: "pharmacy",
      fieldMask: FIELD_MASK,
    })
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setStatus("error");
          return;
        }
        const results = (data.places ?? [])
          .filter((place) => place.location)
          .map((place) => ({
            id: place.id,
            name: place.displayName?.text ?? "",
            address: place.formattedAddress,
            latitude: place.location.latitude,
            longitude: place.location.longitude,
            phone: place.internationalPhoneNumber ?? null,
            isOpenNow: place.currentOpeningHours?.openNow ?? null,
            // Exact match by construction: this photo belongs to this
            // place record, not to a name we guessed at.
            ...extractPlacePhoto(place),
            rating: place.rating ?? null,
            distance: coords
              ? distanceInKm(coords, {
                  latitude: place.location.latitude,
                  longitude: place.location.longitude,
                })
              : null,
          }));
        setPharmacies(results);
        setStatus("loaded");
      })
      .catch((e) => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, coords?.latitude, coords?.longitude]);

  return { status, pharmacies };
}
