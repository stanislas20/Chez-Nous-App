import { useMemo } from "react";
import { useGarageProviders } from "./useGarageProviders";
import { withoutTestSeed } from "../utils/testSeed";

// The auto electricians: the garages whose own words are about electrics or
// diagnostics.
//
// Built on useGarageProviders for the same reason the tyre and battery lists
// are — a shop that appears under Garages → Électricité has to appear here
// too, or the two screens disagree about the same business and neither can
// be trusted.
//
// Both trades, not just "elec": the fault that sends somebody here is as
// often a warning light as a dead alternator, and the workshop with the OBD
// reader is frequently filed under diagnostics. Splitting them would hide
// half the answer behind a word the reader never typed.
export function useElectricProviders(userCoords) {
  const providers = useGarageProviders(userCoords);

  return useMemo(
    () =>
      withoutTestSeed(
        providers
          .filter(
            (provider) =>
              provider.specialties?.includes("elec") ||
              provider.specialties?.includes("diag"),
          )
          .map((provider) => {
            const declared = provider.electricServices ?? [];
            return {
              ...provider,
              electricServices: declared,
              // Lifted out of the list because it answers a different
              // question: not what they can do, but whether it can happen
              // where the vehicle is.
              mobile: declared.includes("mobile") || provider.mobile === true,
              // A provider who never filled the services in is still shown —
              // their listing text is why they are here — but a filter on a
              // named service cannot honestly keep them.
              declaresServices: declared.length > 0,
            };
          }),
      ),
    [providers],
  );
}
