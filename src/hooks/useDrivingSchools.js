import { useMemo } from "react";
import { useCategoryListings } from "./useCategoryListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { declaredCategories, isDrivingSchoolListing } from "../data/drivingSchools";
import { withoutTestSeed } from "../utils/testSeed";

// Driving schools that have published themselves, nearest first.
//
// An ordinary Services listing like every other trade here. What the school
// teaches, what it charges and when it opens are its own words; this hook
// reads them and invents nothing. A school that declared no categories comes
// through with an empty list rather than a guess — see the screen, which
// shows those under "Toutes" and never under a category chip, because
// putting it under B would be answering a question it did not answer.
export function useDrivingSchools(userCoords) {
  // Bounded to this one category in the QUERY rather than filtered out of
  // the whole catalogue in JavaScript. The array below has the same shape it
  // always had, so nothing downstream changed.
  const { listings } = useCategoryListings("services");

  return useMemo(() => {
    if (!listings) return [];

    const searchable = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    return withoutTestSeed(
      listings
        .filter((listing) => listing.categoryKey === "services")
        .filter((listing) =>
          isDrivingSchoolListing(searchable(listing), listing.trade),
        )
        .map((listing) => {
          const cityCoord = cityCoordinates[listing.city];
          return {
            ...listing,
            categories: declaredCategories(listing),
            distanceKm:
              userCoords && cityCoord
                ? distanceInKm(userCoords, cityCoord)
                : null,
          };
        })
        .sort((a, b) => {
          // Distance when both are placeable, then whichever was published
          // most recently. Never a rating: nobody has rated these.
          if (a.distanceKm != null && b.distanceKm != null) {
            return a.distanceKm - b.distanceKm;
          }
          if (a.distanceKm != null) return -1;
          if (b.distanceKm != null) return 1;
          return 0;
        }),
    );
  }, [listings, userCoords]);
}
