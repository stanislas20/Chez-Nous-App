import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { isOpenNow } from "../data/openingDays";
import { isPartsSellerListing, stockMatchesQuery } from "../data/vehicleParts";
import { withoutTestSeed } from "../utils/testSeed";

// The people who sell vehicle parts.
//
// An ordinary Services listing, placed by its own words like every trade in
// this app. What a shop stocks — which families, which qualities, cars or
// motorbikes, what it keeps on the shelf — is what they declared; a shop that
// declared nothing still appears, because their own words are why they are
// here.
//
// The search runs over the words the seller wrote plus the stock they listed,
// so "plaquettes" finds a shop that typed "plaquette de frein avant" in its
// description without ever ticking a box.
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
          const stock = listing.partStock ?? "";
          return {
            ...listing,
            partScopes: listing.partScopes ?? [],
            partCategories: listing.partCategories ?? [],
            partQualities: listing.partQualities ?? [],
            partSellerKind: listing.partSellerKind ?? null,
            partWarranty: listing.partWarranty ?? null,
            partDelivery: listing.partDelivery ?? null,
            partChecksFit: listing.partChecksFit === true,
            partBrands: listing.partBrands ?? null,
            // Everything a search may legitimately match: the advert plus the
            // stock list, so a shop is found by what it wrote either way.
            haystack: `${searchable(listing)} ${stock}`,
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

// Applied outside the hook so the screen can count "before the search" and
// "after the search" from one list.
export function filterPartsSellers(
  sellers,
  { scope, category, quality, query },
) {
  const keep = (declared, wanted) =>
    !wanted || declared.length === 0 || declared.includes(wanted);

  return sellers
    .filter((item) => keep(item.partScopes, scope))
    .filter((item) => keep(item.partCategories, category))
    .filter(
      (item) =>
        !quality || quality === "all" || keep(item.partQualities, quality),
    )
    .filter((item) => stockMatchesQuery(item.haystack, query))
    .sort((a, b) => {
      // Open first, then verified, then near — the order somebody about to
      // get in a taxi actually needs.
      if (a.openNow !== b.openNow) return a.openNow === false ? 1 : -1;
      if (Boolean(a.sellerVerified) !== Boolean(b.sellerVerified)) {
        return a.sellerVerified ? -1 : 1;
      }
      if (a.distanceKm != null && b.distanceKm != null) {
        return a.distanceKm - b.distanceKm;
      }
      return 0;
    });
}
