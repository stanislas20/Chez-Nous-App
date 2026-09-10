import { useMemo } from "react";
import { useCategoryListings } from "./useCategoryListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import {
  eventHours,
  eventPricing,
  eventWindowsFor,
  isEventListing,
} from "../data/events";
import { withoutTestSeed } from "../utils/testSeed";

// Events that somebody actually posted.
//
// There is no sample data behind this and there never will be: a made-up
// concert carries a real venue and a real date, and the cost of being wrong
// is somebody travelling across Cotonou to a room where nothing is
// happening. Every other vertical can seed itself with verifiable public
// facts — a bank branch, a landmark — because those are true whether or not
// the app exists. An event is only true because someone is running it.
//
// So this returns [] until the first person posts, and the screen says so.
export function useEvents(userCoords, now = Date.now()) {
  // Bounded to this one category in the QUERY rather than filtered out of
  // the whole catalogue in JavaScript. The array below has the same shape it
  // always had, so nothing downstream changed.
  const { listings } = useCategoryListings("events");

  return useMemo(() => {
    if (!listings) return [];

    return withoutTestSeed(
      listings
        .filter(isEventListing)
        // An event whose date has passed is not a listing you can act on.
        // It is hidden rather than deleted: the organiser still owns it,
        // and it still belongs in their own Mes annonces.
        .filter((listing) => {
          const windows = eventWindowsFor(listing.eventDateMs, now);
          return windows.length > 0;
        })
        .map((listing) => {
          const cityCoord = cityCoordinates[listing.city];
          return {
            ...listing,
            kind: listing.eventKind ?? "other",
            windows: eventWindowsFor(listing.eventDateMs, now),
            pricing: eventPricing(listing),
            hours: eventHours(listing),
            venue: listing.eventVenue ?? null,
            quartier: listing.eventQuartier ?? null,
            organiser: listing.eventOrganiser ?? listing.sellerCompanyName ?? null,
            payMode: listing.eventPayMode ?? null,
            // "Places limitées", "Groupe de 20 max" — the organiser's own
            // words about how much room is left, never a number the app
            // computed from reactions.
            capacityNote: listing.eventCapacityNote ?? null,
            distanceKm:
              userCoords && cityCoord
                ? distanceInKm(userCoords, cityCoord)
                : null,
          };
        })
        // Soonest first. Two events on the same evening keep the order the
        // feed gave them, which is by recency of posting.
        .sort((a, b) => (a.eventDateMs ?? 0) - (b.eventDateMs ?? 0)),
    );
  }, [listings, userCoords, now]);
}
