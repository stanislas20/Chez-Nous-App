import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { withoutTestSeed } from "../utils/testSeed";

// Batteries actually for sale.
//
// An ordinary Vehicles listing that declares a capacity — the same shape as
// a tyre offer, filed under the category whose own description is "cars,
// motorbikes, parts". A listing without a capacity is dropped rather than
// shown: a battery whose Ah is unknown cannot be matched to a car, and would
// only ever waste a call.
export function useBatteryOffers(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return [];

    // Seeded rows step aside as soon as a genuine battery offer exists.
    return withoutTestSeed(
      listings
        .filter((listing) => listing.partType === "battery")
        .filter((listing) => Number(listing.batteryAh) > 0),
    ).map((listing) => {
      const cityCoord = cityCoordinates[listing.city];
      return {
        ...listing,
        distanceKm:
          userCoords && cityCoord ? distanceInKm(userCoords, cityCoord) : null,
        place: listing.quartier || listing.area || listing.city || null,
        photoUrl: listing.mediaUrl ?? null,
      };
    });
  }, [listings, userCoords]);
}
