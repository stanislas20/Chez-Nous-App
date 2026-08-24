import { useMemo } from "react";
import { useGarageProviders } from "./useGarageProviders";
import { withoutTestSeed } from "../utils/testSeed";

// The professionals who test, boost, fit and take back a battery.
//
// Built on useGarageProviders for the same reason the tyre list is: a shop
// that appears under Garages → Batterie must appear here too, or the two
// screens disagree about the same business and neither can be trusted.
export function useBatteryProviders(userCoords) {
  const providers = useGarageProviders(userCoords);

  return useMemo(
    () =>
      withoutTestSeed(
        providers.filter((provider) => provider.specialties?.includes("batt")),
      ).map((provider) => {
        const declared = provider.batteryServices ?? [];
        return {
          ...provider,
          batteryServices: declared,
          // Lifted out of the list because it answers a different
          // question: not what they can do, but whether it can happen
          // where the car is stuck.
          mobile: declared.includes("mobile"),
        };
      }),
    [providers],
  );
}
