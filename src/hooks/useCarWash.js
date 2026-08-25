import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { isOpenNow } from "../data/openingDays";
import { isWashListing, washPriceKey } from "../data/carWash";
import { withoutTestSeed } from "../utils/testSeed";

// The people who wash vehicles.
//
// An ordinary Services listing, placed by its own words like every trade in
// this app. Where they work, what they take and what they charge for it are
// declared by them; a washer who declared nothing still appears, because
// their own words are why they are here at all.
export function useCarWash(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return [];

    const searchable = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    return withoutTestSeed(
      listings
        .filter((listing) => listing.categoryKey === "services")
        .filter((listing) => isWashListing(searchable(listing)))
        .map((listing) => {
          const cityCoord = cityCoordinates[listing.city];
          return {
            ...listing,
            washModes: listing.washModes ?? [],
            washVehicles: listing.washVehicles ?? [],
            washFormulas: listing.washFormulas ?? [],
            washPrices: listing.washPrices ?? {},
            // What it costs to have them come to you, on top of the wash.
            // Kept separate from the prices because it is charged once for
            // the visit, not once per formula.
            washHomeFee: listing.washHomeFee ?? null,
            washEquipment: listing.washEquipment ?? null,
            washWaterSupply: listing.washWaterSupply ?? null,
            washByAppointment: listing.washByAppointment === true,
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
            photoUrl:
              listing.mediaUrl ??
              listing.media?.[0]?.mediaUrl ??
              listing.sellerPhotoUrl ??
              null,
          };
        }),
    );
  }, [listings, userCoords]);
}

// A declared price for exactly this formula on exactly this vehicle, or
// null. Never a nearby cell, never an average of the others: a saloon price
// shown against a 4×4 is the error this whole screen exists to avoid.
export function washPriceFor(provider, formula, vehicle) {
  const value = Number(provider.washPrices?.[washPriceKey(formula, vehicle)]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Applied outside the hook so the screen can count the full list and the
// filtered one from a single source.
export function filterWashProviders(providers, { mode, vehicle, formula }) {
  const keep = (declared, wanted) =>
    !wanted || declared.length === 0 || declared.includes(wanted);

  return providers
    .filter((item) => keep(item.washModes, mode))
    .filter((item) => keep(item.washVehicles, vehicle))
    .filter((item) => keep(item.washFormulas, formula))
    .sort((a, b) => {
      // Cheapest first for the exact job being asked about, which is the
      // only sort that means anything once a formula and a vehicle are
      // chosen. A washer who did not price this combination goes last
      // rather than being read as free.
      const priceA = washPriceFor(a, formula, vehicle);
      const priceB = washPriceFor(b, formula, vehicle);
      if (priceA != null && priceB != null && priceA !== priceB) {
        return priceA - priceB;
      }
      if ((priceA == null) !== (priceB == null)) return priceA == null ? 1 : -1;
      if (a.openNow !== b.openNow) return a.openNow === false ? 1 : -1;
      if (a.distanceKm != null && b.distanceKm != null) {
        return a.distanceKm - b.distanceKm;
      }
      return 0;
    });
}
