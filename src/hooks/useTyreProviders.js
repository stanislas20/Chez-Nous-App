import { useMemo } from "react";
import { useGarageProviders } from "./useGarageProviders";
import { parseTyreSize } from "../data/tyres";
import { withoutTestSeed } from "../utils/testSeed";

// The tyre professionals: the subset of garages whose own words are about
// tyres.
//
// Built on useGarageProviders rather than beside it, so a provider cannot
// appear under Garages → Pneus and be missing from the Pneus screen. The two
// disagreeing would be invisible to us and baffling to a user standing in
// front of the same shop.
export function useTyreProviders(userCoords) {
  const providers = useGarageProviders(userCoords);

  return useMemo(
    () =>
      withoutTestSeed(
        providers
          // `specialties` is already derived from the title AND the
          // description by useGarageProviders, so a second title-only test
          // could never add anything — it was strictly weaker than the check
          // beside it.
          .filter((provider) => provider.specialties?.includes("pneu"))
          .map((provider) => {
            const declared = provider.tyreServices ?? [];
            return {
              ...provider,
              tyreServices: declared,
              // "Se déplace" is a service like the others as far as the
              // provider is concerned, but it answers a different question for
              // somebody stuck at the roadside, so it is lifted out.
              mobile: declared.includes("mobile"),
              // Sizes the provider says they keep. Normalised on read so a
              // listing saved as "195/65R15" still matches a search typed as
              // three separate numbers.
              tyreSizes: (provider.tyreSizes ?? [])
                .map((size) => {
                  const parsed = parseTyreSize(size);
                  return parsed
                    ? `${parsed.width}/${parsed.ratio} R${parsed.diameter}`
                    : null;
                })
                .filter(Boolean),
              tyreBrands: provider.tyreBrands || null,
            };
          }),
      ),
    [providers],
  );
}
