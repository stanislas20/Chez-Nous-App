import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { isOpenNow } from "../data/openingDays";
import { isPartsSellerListing } from "../data/vehicleParts";
import { withoutTestSeed } from "../utils/testSeed";

// The people who sell vehicle parts.
//
// An ordinary Services listing, placed by its own words like every trade in
// this app. What a shop stocks — which systems, which conditions, cars or
// motorbikes — is what they declared; a shop that declared nothing still
// appears, because their own words are why they are here.
export function usePartsSellers(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return [];

    const searchable = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    return withoutTestSeed(
      listings
        .filter((listing) => listing.categoryKey === "services")
        .filter((listing) => isPartsSellerListing(searchable(listing)))
        .map((listing) => {
          const cityCoord = cityCoordinates[listing.city];
          return {
            ...listing,
            partScopes: listing.partScopes ?? [],
            partCategories: listing.partCategories ?? [],
            partConditions: listing.partConditions ?? [],
            distanceKm:
              userCoords && cityCoord
                ? distanceInKm(userCoords, cityCoord)
                : null,
            openNow: isOpenNow(
              listing.openDays,
              listing.openTime,
              listing.closeTime,
            ),
            place: listing.quartier || listing.area || listing.city || null,
          };
        }),
    );
  }, [listings, userCoords]);
}
