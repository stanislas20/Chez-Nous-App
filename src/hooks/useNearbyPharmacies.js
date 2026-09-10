import { useEffect, useState } from "react";
import { searchPlacesNearby } from "../utils/places";
import { distanceInKm } from "../utils/geo";
import { extractPlacePhoto } from "../utils/placePhoto";

const SEARCH_RADIUS_METERS = 5000;
// Real, live nearby pharmacies from Google Places (New) — distinct from the
// ONPB on-duty roster, this covers ordinary pharmacies that keep normal
// hours (not part of any "de garde" rotation), so a user can find any
// pharmacy by name even when it isn't currently on call.
export function useNearbyPharmacies(coords) {
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'loaded' | 'error'
  const [pharmacies, setPharmacies] = useState([]);

  useEffect(() => {
    if (!coords) return;

    let cancelled = false;
    setStatus("loading");

    // Through the Cloud Function, not straight at Google. The key this used
    // to carry was inlined into the app bundle by EXPO_PUBLIC_, and a Places
    // REST key cannot be restricted to a package the way a Maps SDK key can.
    // The answer's shape is unchanged — this is still Google's own JSON.
    searchPlacesNearby({
      coords,
      radius: SEARCH_RADIUS_METERS,
      type: "pharmacy",
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
            distance: distanceInKm(coords, {
              latitude: place.location.latitude,
              longitude: place.location.longitude,
            }),
          }))
          .sort((a, b) => a.distance - b.distance);
        setPharmacies(results);
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [coords?.latitude, coords?.longitude]);

  return { status, pharmacies };
}
