import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { isDriverListing } from "../data/drivers";
import { withoutTestSeed } from "../utils/testSeed";

// Drivers advertising themselves, and cars advertised with a driver.
//
// An ordinary Services listing, placed by its own words like every trade in
// this app. What they charge for each arrangement, what it includes and what
// it does not, are declared — the app invents none of it and shows nothing
// that was left blank.
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
            occasions: listing.driverOccasions ?? [],
            prices: listing.driverPrices ?? {},
            included: listing.driverIncluded ?? null,
            excluded: listing.driverExcluded ?? null,
            permits: listing.driverPermits ?? [],
            languages: listing.driverLanguages ?? [],
            vehicleMode: listing.driverVehicleMode ?? null,
            vehicle: listing.driverVehicle ?? null,
            seats: listing.driverSeats ?? null,
            airConditioned: listing.driverAc === true,
            experience: listing.driverExperience ?? null,
            // Their own first photo, then the picture on their account.
            //
            // A driver who uploaded a picture of themselves should be shown
            // as themselves — this is the trade where a face is most of the
            // reassurance. The account photo is a real second chance at one:
            // the listing already carries a copy of it (sellerPhotoUrl, put
            // there at publish because a buyer cannot read sellers/{uid}), so
            // it costs nothing to read. The monogram stays last, rather than
            // a grey silhouette.
            photoUrl:
              listing.mediaUrl ??
              listing.media?.[0]?.mediaUrl ??
              listing.sellerPhotoUrl ??
              null,
            distanceKm:
              userCoords && cityCoord
                ? distanceInKm(userCoords, cityCoord)
                : null,
            place: listing.quartier || listing.area || listing.city || null,
          };
        }),
    );
  }, [listings, userCoords]);
}

// Cheapest first for the arrangement being looked at, which is the only sort
// that means anything here — and a driver who did not price this arrangement
// goes last rather than being read as free.
export function driversForOccasion(drivers, occasion) {
  const priceOf = (item) => {
    const value = Number(item.prices?.[occasion]);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  return [...drivers]
    .filter(
      (item) =>
        item.occasions.length === 0 || item.occasions.includes(occasion),
    )
    .sort((a, b) => {
      const left = priceOf(a);
      const right = priceOf(b);
      if (left != null && right != null) return left - right;
      if (left != null) return -1;
      if (right != null) return 1;
      return 0;
    });
}
