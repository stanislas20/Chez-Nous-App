import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { isOpenNow } from "../data/openingDays";
import { isInsuranceListing, insurancePriceKey } from "../data/insurance";
import { withoutTestSeed } from "../utils/testSeed";

// The agencies and brokers who write motor cover.
//
// Real listings placed by their own words, like every other trade in this
// app. There is no built-in list of insurers here and there must not be:
// naming companies we have not verified, and pricing them, is exactly the
// thing this screen tells the reader not to accept from anyone else.
export function useInsurers(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return [];

    const searchable = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    return withoutTestSeed(
      listings
        .filter((listing) => listing.categoryKey === "services")
        .filter((listing) =>
          isInsuranceListing(searchable(listing), listing.trade),
        )
        .map((listing) => {
          const cityCoord = cityCoordinates[listing.city];
          return {
            ...listing,
            insuranceVehicles: listing.insuranceVehicles ?? [],
            insuranceFormulas: listing.insuranceFormulas ?? [],
            insurancePrices: listing.insurancePrices ?? {},
            // Declared, not assumed. An agency that hands the attestation
            // over the counter the same day is worth more than one that is
            // cheaper and takes a week, and only they can say which they are.
            insuranceDelivery: listing.insuranceDelivery ?? null,
            insuranceMobileMoney: listing.insuranceMobileMoney === true,
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

// A premium this agency declared for exactly this cover, on exactly this
// vehicle, for exactly this term — or null.
//
// Never interpolated between terms and never scaled from the annual figure.
// A twelve-month premium divided by four is not the three-month premium, and
// presenting it as one is how somebody arrives at a counter expecting a
// number nobody there has ever quoted.
export function insurancePriceFor(provider, formula, vehicle, months) {
  const value = Number(
    provider.insurancePrices?.[insurancePriceKey(formula, vehicle, months)],
  );
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function filterInsurers(providers, { vehicle, formula, months }) {
  // An agency that declared nothing still appears: their own words are why
  // they are on this screen at all, and silence is not a refusal.
  const keep = (declared, wanted) =>
    !wanted || declared.length === 0 || declared.includes(wanted);

  return providers
    .filter((item) => keep(item.insuranceVehicles, vehicle))
    .filter((item) => keep(item.insuranceFormulas, formula))
    .sort((a, b) => {
      const priceA = insurancePriceFor(a, formula, vehicle, months);
      const priceB = insurancePriceFor(b, formula, vehicle, months);
      if (priceA != null && priceB != null && priceA !== priceB) {
        return priceA - priceB;
      }
      // An agency that did not quote this combination goes last rather than
      // being read as the cheapest.
      if ((priceA == null) !== (priceB == null)) return priceA == null ? 1 : -1;
      if (a.openNow !== b.openNow) return a.openNow === false ? 1 : -1;
      if (a.distanceKm != null && b.distanceKm != null) {
        return a.distanceKm - b.distanceKm;
      }
      return 0;
    });
}
