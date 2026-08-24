import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { formatTyreSize, isAgedTyre, tyreAgeYears } from "../data/tyres";
import { withoutTestSeed } from "../utils/testSeed";

// Tyres actually for sale.
//
// A tyre offer is an ordinary Vehicles listing that declares a size — the
// category whose own description is "cars, motorbikes, parts". No separate
// collection, no separate moderation path: it is approved, reported and
// deleted like everything else, and it shows up in normal browsing too.
//
// A listing without a complete size is dropped rather than shown, because a
// tyre whose size is unknown cannot be matched to a car and would only ever
// waste a call.
export function useTyreOffers(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return [];

    // Seeded rows step aside as soon as a genuine tyre offer exists.
    return withoutTestSeed(
      listings.filter((listing) => listing.partType === "tyre"),
    )
      .map((listing) => {
        const size = formatTyreSize(
          listing.tyreWidth,
          listing.tyreRatio,
          listing.tyreDiameter,
        );
        if (!size) return null;
        const cityCoord = cityCoordinates[listing.city];
        return {
          ...listing,
          size,
          // Only a used tyre has an age worth stating; a new one's DOT year
          // is the year it was made and says nothing a buyer needs.
          ageYears:
            listing.tyreCondition === "used"
              ? tyreAgeYears(listing.tyreDotYear)
              : null,
          isAged:
            listing.tyreCondition === "used" && isAgedTyre(listing.tyreDotYear),
          distanceKm:
            userCoords && cityCoord
              ? distanceInKm(userCoords, cityCoord)
              : null,
          place: listing.quartier || listing.area || listing.city || null,
          photoUrl: listing.mediaUrl ?? null,
        };
      })
      .filter(Boolean);
  }, [listings, userCoords]);
}
