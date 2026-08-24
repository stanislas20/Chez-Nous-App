import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { isOpenNow } from "../data/openingDays";
import {
  garageSpecialtiesFor,
  isGarageListing,
} from "../data/garageSpecialties";

// The car-repair providers, decorated once.
//
// Two screens need this list — Garages, where somebody is choosing a garage,
// and Dépannage, where somebody is stuck by the road — and they must agree
// about who counts as a mechanic and which trades each provider covers.
// Written twice, the two would drift the first time a term was added, and a
// provider would appear on one screen and not the other for no reason a user
// could see.
//
// There is no garage category in Firestore: a garage publishes an ordinary
// Services listing, so membership is decided by the words the provider
// wrote (see garageSpecialties).
export function useGarageProviders(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return [];
    const searchableText = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    return listings
      .filter((listing) => listing.categoryKey === "services")
      .filter((listing) => isGarageListing(searchableText(listing)))
      .map((listing) => {
        const cityCoord = cityCoordinates[listing.city];
        return {
          ...listing,
          specialties: garageSpecialtiesFor(searchableText(listing)),
          distanceKm:
            userCoords && cityCoord
              ? distanceInKm(userCoords, cityCoord)
              : null,
          // null means the provider declared no hours — no badge at all
          // rather than guessing "Fermé" and costing them the work.
          openNow: isOpenNow(
            listing.openDays,
            listing.openTime,
            listing.closeTime,
          ),
          place: listing.quartier || listing.area || listing.city || null,
          photoUrl: listing.mediaUrl ?? null,
        };
      });
  }, [listings, userCoords]);
}
