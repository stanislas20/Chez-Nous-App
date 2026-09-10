import { useEffect, useState } from "react";
import { searchPlacesNearby } from "../utils/places";
import { distanceInKm } from "../utils/geo";
import { extractPlacePhoto } from "../utils/placePhoto";

const SEARCH_RADIUS_METERS = 5000;
const FIELD_MASK =
  "places.id,places.displayName,places.location,places.formattedAddress," +
  "places.internationalPhoneNumber,places.currentOpeningHours.openNow," +
  "places.rating,places.userRatingCount,places.priceLevel,places.photos";

// Restaurants that exist near you but have not listed themselves here.
//
// The Restaurants screen only ever knew about published listings, of which
// there are currently none — so it showed its samples, and a maquis two
// streets away was invisible. Same gap the Pharmacie screen closed with
// Places, and this is deliberately the same shape as useNearbyPharmacies
// rather than a second way of doing it.
//
// Everything here is Google's and is labelled as Google's on the card. The
// screen must not merge these into the listed restaurants or mark them
// verified: nobody at Chez-Nous has checked them, the owner has not agreed
// to be here, and the opening state is Google's guess at their hours rather
// than the restaurant's own word.
//
// `maquis` is not a Places type, so this asks for restaurants and lets the
// results be what they are. Filtering to a narrower set would drop exactly
// the informal places people here eat at most.
export function useNearbyRestaurants(coords) {
  const [status, setStatus] = useState("idle"); // idle | loading | loaded | error
  const [restaurants, setRestaurants] = useState([]);

  useEffect(() => {
    if (!coords) return;

    let cancelled = false;
    setStatus("loading");

    // Through the Cloud Function — see useNearbyPharmacies for why.
    searchPlacesNearby({
      coords,
      radius: SEARCH_RADIUS_METERS,
      type: "restaurant",
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
            // The photo belongs to this place record by construction, and
            // extractPlacePhoto drops any that arrives without a
            // contributor to credit — Google requires the attribution, and
            // an uncredited photo is not shown at all.
            ...extractPlacePhoto(place),
            rating: place.rating ?? null,
            ratingCount: place.userRatingCount ?? null,
            // Google's own 1-4 band. Passed through untranslated into
            // FCFA: converting it would be inventing a price range for a
            // restaurant that never gave us one.
            priceLevel: place.priceLevel ?? null,
            distance: distanceInKm(coords, {
              latitude: place.location.latitude,
              longitude: place.location.longitude,
            }),
          }))
          .sort((a, b) => a.distance - b.distance);
        setRestaurants(results);
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [coords?.latitude, coords?.longitude]);

  return { status, restaurants };
}

// Drop the ones already published here.
//
// A restaurant that has a listing appears in both lists otherwise — its own
// card with its own words, and Google's card beside it — which reads as two
// different restaurants with the same name. The listing wins: it is the
// owner speaking.
//
// Matched on a folded name rather than an id, because the two sources share
// no identifier. Accents, case, punctuation and the words people drop go,
// so "Chez Maman Bénin" and "chez maman benin" are one place.
const NOISE = /\b(le|la|les|chez|restaurant|maquis|bar|resto)\b/g;

export function foldRestaurantName(name) {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(NOISE, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function withoutListed(places, listed) {
  const taken = new Set(
    (listed ?? []).map((item) => foldRestaurantName(item.name)).filter(Boolean),
  );
  return (places ?? []).filter(
    (place) => !taken.has(foldRestaurantName(place.name)),
  );
}
