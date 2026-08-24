import { useMemo } from "react";
import { useGarageProviders } from "./useGarageProviders";
import { withoutTestSeed } from "../utils/testSeed";

// The carrossiers: the garages whose own words are about bodywork.
//
// Built on useGarageProviders like the tyre, battery and electrics lists, so
// a workshop that appears under Garages → Carrosserie cannot be missing from
// the Carrosserie screen. Two screens disagreeing about the same business is
// invisible to us and baffling to somebody standing in front of it.
export function useBodyworkProviders(userCoords) {
  const providers = useGarageProviders(userCoords);

  return useMemo(
    () =>
      withoutTestSeed(
        providers
          .filter((provider) => provider.specialties?.includes("carro"))
          .map((provider) => {
            const declared = provider.bodyworkServices ?? [];
            return {
              ...provider,
              bodyworkServices: declared,
              // Both lifted out of the list because they answer questions the
              // service names do not: whether the work can happen where the
              // car is, and whether photographs are enough to get a price.
              mobile: declared.includes("mobile"),
              quotesFromPhotos: declared.includes("estimate"),
            };
          }),
      ),
    [providers],
  );
}
