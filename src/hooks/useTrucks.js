import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { getVehicleDeal } from "../data/vehicles";
import { bodiesForLoad, isHaulierListing, isGoodsVehicle } from "../data/truckTransport";
import { withoutTestSeed } from "../utils/testSeed";

// Goods vehicles to buy or hire, and hauliers who move a load for you.
//
// Three lists off one subscription, because the screen's three tabs are
// three questions about the same word. Buying and hiring read the Véhicules
// category and filter on the body type the seller declared; hauling reads
// Services, like every other trade.
//
// Nothing here invents a payload, a rate or a rating. A vehicle that
// declared no body type is absent rather than guessed into a tab — putting
// a saloon under "camion" because its description mentions transport is the
// text search this vertical exists to replace.
export function useTrucks(userCoords, loadSize) {
  const listings = useApprovedListings();

  return useMemo(() => {
    const empty = { forSale: [], forHire: [], hauliers: [] };
    if (!listings) return empty;

    const bodies = bodiesForLoad(loadSize);
    const searchable = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    const place = (listing) => {
      const cityCoord = cityCoordinates[listing.city];
      return {
        ...listing,
        distanceKm:
          userCoords && cityCoord ? distanceInKm(userCoords, cityCoord) : null,
      };
    };

    // Nearest first where both are placeable, then leave the order alone.
    // Never a rating: nobody has rated these, and sorting by price would
    // put the cheapest truck first regardless of whether it can carry the
    // load somebody just described.
    const byDistance = (a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return 0;
    };

    const vehicles = withoutTestSeed(
      listings
        .filter((listing) => listing.categoryKey === "vehicles")
        .filter(isGoodsVehicle)
        .filter((listing) => bodies.includes(listing.bodyType)),
    ).map(place);

    const intentOf = (listing) =>
      getVehicleDeal(listing.vehicleDeal)?.intent ?? null;

    const hauliers = withoutTestSeed(
      listings
        .filter((listing) => listing.categoryKey === "services")
        .filter((listing) =>
          isHaulierListing(searchable(listing), listing.trade),
        ),
    )
      .map(place)
      .sort(byDistance);

    return {
      forSale: vehicles.filter((l) => intentOf(l) === "buy").sort(byDistance),
      forHire: vehicles.filter((l) => intentOf(l) === "rent").sort(byDistance),
      hauliers,
    };
  }, [listings, userCoords, loadSize]);
}
