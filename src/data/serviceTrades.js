// The service trades, in the order the form offers them.
//
// Extracted from CreateListingScreen so the Services category screen can
// group by the same vocabulary the form writes. It was defined inside the
// form, which meant any screen wanting to LABEL a trade had to either import
// from a screen or keep a second copy — and a second copy of this list is
// exactly how a trade comes to have one name where it is published and
// another where it is browsed.
//
// `labelKey` rather than a label: these are shown in French and English and
// the strings live in translations.js with everything else.
//
// The car trades that have a screen of their own, offered inside the form
// so they are reachable without walking back out to Voitures. Ordered by how
// often somebody publishes one, not alphabetically.
//
// "tyres" and "battery" are the same trade keys the Pneus and Batterie
// screens pass, deliberately: under Vehicles they mean somebody selling a
// tyre, and under Services the same key means somebody who fits one. The
// examples differ by category rather than by inventing two more keys that
// every downstream test would then have to know about.
export const serviceTrades = [
  { key: "garage", icon: "construct-outline", labelKey: "sellTradeGarage" },
  {
    key: "bodywork",
    icon: "color-fill-outline",
    labelKey: "sellTradeBodywork",
  },
  { key: "driver", icon: "person-outline", labelKey: "sellTradeDriver" },
  { key: "parts", icon: "cog-outline", labelKey: "sellTradeParts" },
  { key: "wash", icon: "water-outline", labelKey: "sellTradeWash" },
  { key: "electric", icon: "flash-outline", labelKey: "sellTradeElectric" },
  { key: "tyres", icon: "disc-outline", labelKey: "sellTradeTyres" },
  {
    key: "battery",
    icon: "battery-charging-outline",
    labelKey: "sellTradeBattery",
  },
  {
    key: "insurance",
    icon: "shield-checkmark-outline",
    labelKey: "sellTradeInsurance",
  },
  { key: "clim", icon: "snow-outline", labelKey: "sellTradeAircon" },
  { key: "keys", icon: "key-outline", labelKey: "sellTradeKeys" },
  { key: "gps", icon: "navigate-circle-outline", labelKey: "sellTradeGps" },
  {
    key: "drivingSchool",
    icon: "school-outline",
    labelKey: "sellTradeDrivingSchool",
  },
  // Carrying goods for other people. Distinct from "driver", which is a
  // person driving passengers in a car: this one owns a load bed and is
  // found from the Camions screen's third tab.
  { key: "haulier", icon: "cube-outline", labelKey: "sellTradeHaulier" },
  // Clearing somebody else's cargo through the port. Not a haulier, who
  // owns a load bed and moves goods that are already in the country: this
  // one files the declaration, and the two are found from opposite ends of
  // the same journey.
  { key: "transitaire", icon: "boat-outline", labelKey: "sellTradeTransitaire" },
  // The other end of the same journey: somebody abroad who buys the vehicle
  // or the goods and ships them here, either as their own stock to sell or
  // on order for a buyer in Bénin. Distinct from "transitaire" on purpose —
  // the two are found from the same screen and asked different questions,
  // and half the transitaire listings say "importation" too.
  { key: "importateur", icon: "airplane-outline", labelKey: "sellTradeImportateur" },
];

export function getServiceTradeLabelKey(key) {
  return serviceTrades.find((trade) => trade.key === key)?.labelKey ?? null;
}
