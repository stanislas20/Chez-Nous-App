import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { isOpenNow } from "../data/openingDays";
import { isDriverListing } from "../data/drivers";
import { withoutTestSeed } from "../utils/testSeed";

// Drivers advertising themselves.
//
// An ordinary Services listing, like every trade in this app — membership is
// decided by the words the person wrote, not by a category they picked. What
// they declare on top of that (permit, availability, languages, whose car) is
// what the screen filters on; a driver who declared none of it still appears
// in the unfiltered list, because their own words are why they are here.
export function useDrivers(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return [];

    const searchable = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    return withoutTestSeed(
      listings
        .filter((listing) => listing.categoryKey === "services")
        .filter((listing) => isDriverListing(searchable(listing)))
        .map((listing) => {
          const cityCoord = cityCoordinates[listing.city];
          return {
            ...listing,
            permits: listing.driverPermits ?? [],
            availability: listing.driverAvailability ?? [],
            languages: listing.driverLanguages ?? [],
            vehicleMode: listing.driverVehicleMode ?? null,
            experience: listing.driverExperience ?? null,
            distanceKm:
              userCoords && cityCoord
                ? distanceInKm(userCoords, cityCoord)
                : null,
            // null means no hours were declared — no badge at all rather than
            // guessing "Fermé" at somebody whose work has no opening times.
            openNow: isOpenNow(
              listing.openDays,
              listing.openTime,
              listing.closeTime,
            ),
            place: listing.quartier || listing.area || listing.city || null,
            photoUrl: listing.mediaUrl ?? null,
          };
        }),
    );
  }, [listings, userCoords]);
}
