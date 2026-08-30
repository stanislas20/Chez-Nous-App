import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import {
  isOverseasBuyerListing,
  isTransitaireListing,
  sourcerOffersFor,
  transitaireScopesFor,
} from "../data/importation";

// The two kinds of people who help an import, decorated once and kept apart.
//
// They are found the same way and they are not the same job. The broker is
// here and files the declaration; the sourcer is abroad and buys the thing.
// One hook because the screen shows both and has to order them by the
// reader's stage — split in two they would walk the same listings twice for
// no gain.
//
//
// There is no transitaire category in Firestore and there should not be one:
// a broker publishes an ordinary Services listing, so membership is decided
// by the words they wrote. That is the same rule the garage list runs on, and
// the reason is the one written in carServices — a hand-kept directory would
// rot, and a directory that rots is worse than no directory, because it sends
// somebody to a number that stopped working a year ago.
export function useImportHelpers(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return { brokers: [], sourcers: [] };
    const searchableText = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    const services = listings.filter(
      (listing) => listing.categoryKey === "services",
    );

    const brokers = services
      .filter((listing) =>
        isTransitaireListing(searchableText(listing), listing.trade),
      )
      .map((listing) => {
        const cityCoord = cityCoordinates[listing.city];
        return {
          ...listing,
          scopes: transitaireScopesFor(
            searchableText(listing),
            listing.transitaireScopes,
          ),
          distanceKm:
            userCoords && cityCoord
              ? distanceInKm(userCoords, cityCoord)
              : null,
        };
      })
      .sort((a, b) => {
        // Nearest first when we know where the reader is, because a broker is
        // visited in person and the port is in Cotonou. Alphabetical when we
        // do not, so the order is at least stable rather than arbitrary.
        if (a.distanceKm != null && b.distanceKm != null) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm != null) return -1;
        if (b.distanceKm != null) return 1;
        return (a.titleFr ?? "").localeCompare(b.titleFr ?? "", "fr");
      });

    // No distance sort for these, deliberately: the whole point of a sourcer
    // is that they are not here, so "3.2 km away" would be a lie about the
    // person and meaningless about the listing. They are ordered by the
    // country they buy from, which is the axis a reader actually chooses on.
    const sourcers = services
      .filter((listing) =>
        isOverseasBuyerListing(searchableText(listing), listing.trade),
      )
      .map((listing) => ({
        ...listing,
        offers: sourcerOffersFor(
          searchableText(listing),
          listing.sourcerOffers,
        ),
        // Declared on the posting form, never inferred: a sentence
        // mentioning Belgium is not a statement that the seller lives there,
        // and somebody deciding who to wire money to deserves better than a
        // keyword's guess.
        buysFrom: listing.buysFrom ?? null,
      }))
      .sort((a, b) => {
        if (a.buysFrom && b.buysFrom) {
          return a.buysFrom.localeCompare(b.buysFrom, "fr");
        }
        if (a.buysFrom) return -1;
        if (b.buysFrom) return 1;
        return (a.titleFr ?? "").localeCompare(b.titleFr ?? "", "fr");
      });

    return { brokers, sourcers };
  }, [listings, userCoords]);
}
