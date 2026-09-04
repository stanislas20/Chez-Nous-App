import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { useI18n } from "../i18n/I18nContext";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { collate, compareNames } from "../utils/collate";
import {
  getSourcingCountryLabel,
  isOverseasBuyerListing,
  isTransitaireListing,
  retainSourcingChannels,
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
  // Read here rather than taken as an argument: the sourcer order depends on
  // the country NAMES, which are language-dependent, so the memo has to
  // recompute when the language switches. A caller passing it in would work
  // until one forgot.
  const { language } = useI18n();

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
        return compareNames(a.titleFr, b.titleFr);
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
        // Filtered against the country rather than passed through. A listing
        // edited from the United States to Japan before the form learned to
        // prune could still carry `copart`, and a card offering a Japanese
        // sourcer's Copart account is a worse lie than saying nothing.
        channels: retainSourcingChannels(
          listing.sourcingChannels,
          listing.buysFrom ?? null,
        ),
      }))
      .sort((a, b) => {
        if (a.buysFrom && b.buysFrom) {
          // By the name the reader sees, not the ISO code behind it.
          // Sorting on the code puts Germany (DE) above Spain (ES) above
          // the United States (US), which is alphabetical in a language
          // nobody is reading — "Allemagne, Belgique, Canada" is the order
          // a French list is expected to arrive in.
          const aName = getSourcingCountryLabel(a.buysFrom, language) ?? a.buysFrom;
          const bName = getSourcingCountryLabel(b.buysFrom, language) ?? b.buysFrom;
          return collate(language)(aName, bName);
        }
        if (a.buysFrom) return -1;
        if (b.buysFrom) return 1;
        return compareNames(a.titleFr, b.titleFr);
      });

    return { brokers, sourcers };
  }, [listings, userCoords, language]);
}
