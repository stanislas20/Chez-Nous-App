import { useMemo } from "react";
import { useApprovedListings } from "./useApprovedListings";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { allInNightly } from "../data/hotelTerms";
import { realEstateHasCapacity } from "../data/realEstate";

// Who counts as a hotel.
//
// There is no hotel category in Firestore and there should not be one: an
// hotelier already has the right form. A room for the night is a
// realEstate listing with the shortStay deal — the form asks the nightly
// rate, the furnishing and now the tax, the generator and the rest — and a
// salle de fête is the same category with the commercial deal and the hall
// type, which is where the halls advertised here already file themselves.
//
// So this hook is a reading of listings that exist, not a new kind of
// listing. That is what stops the Hôtels screen becoming a directory that
// nobody can appear in without being told about a secret category.
export function useHotels(userCoords) {
  const listings = useApprovedListings();

  return useMemo(() => {
    if (!listings) return { rooms: null, halls: null };

    const decorate = (listing) => {
      const cityCoord = cityCoordinates[listing.city];
      return {
        ...listing,
        allIn: allInNightly(listing),
        distanceKm:
          userCoords && cityCoord ? distanceInKm(userCoords, cityCoord) : null,
      };
    };

    const property = listings.filter(
      (listing) => listing.categoryKey === "realEstate",
    );

    return {
      rooms: property
        .filter((listing) => listing.realEstateDeal === "shortStay")
        .map(decorate),
      // Asked of realEstate.js rather than compared against a string.
      //
      // This filter was written as commercialType === "hall". The key is
      // "eventHall", so it matched nothing and the Salle tab would have
      // stayed empty however many halls were posted — indistinguishable
      // from nobody having posted one, which is the failure this codebase
      // keeps finding. realEstateHasCapacity is the form's own test for
      // "is this a hall", so the screen and the form cannot disagree.
      halls: property.filter((listing) =>
        realEstateHasCapacity(listing.realEstateDeal, listing.commercialType),
      ).map(decorate),
    };
  }, [listings, userCoords]);
}
