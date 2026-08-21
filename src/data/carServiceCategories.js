// The car section as a hub rather than a flat list of six trades.
//
// Forty categories on one screen is a wall nobody reads, so this is two
// levels: twelve that cover most of why someone opens this screen, and the
// long tail behind "Plus de services". Nothing is removed — it is ranked.
//
// Three kinds of destination, because these are not all the same thing:
//
//   query  — opens the Services category with a French search already filled
//            in. The results are whatever real providers have published; an
//            empty result means nobody has listed one yet, which is true and
//            useful, unlike a hand-kept directory that would rot.
//   intent — flips this screen's own Acheter / Louer / Vendre switch.
//   route  — a screen that already exists (parks, distributors).
//   tel    — places a real call. Used once, for 112.
//
// The queries are French on purpose: providers write their listings in
// French here, so a French term is what actually matches. The labels are
// for the UI, not for the search.

// The top button, and what it opens.
//
// This is a shortcut to people who can help, NOT a dispatch service — we
// send nobody. The sheet says so, and the one option that can genuinely
// summon help is the one that dials 112, the national emergency number.
export const carHelpOptions = [
  { key: "helpBreakdown", icon: "warning-outline", query: "dépannage" },
  { key: "helpBattery", icon: "flash-outline", query: "batterie" },
  { key: "helpPuncture", icon: "disc-outline", query: "pneu crevaison" },
  { key: "helpTowing", icon: "car-outline", query: "remorquage" },
  { key: "helpMechanic", icon: "construct-outline", query: "mécanicien" },
  // Not a search. An accident is the one case where the right action is a
  // phone call to the state, not a marketplace listing.
  { key: "helpAccident", icon: "call-outline", tel: "112", urgent: true },
];

// Acheter / Vendre / Louer are deliberately NOT here. They are the intent
// switch pinned to the top of this screen, visible at every scroll position
// — so a tile repeating them made the change happen off-screen, where the
// person who tapped could not see it. They are also not services: this
// section is the trades that surround owning a car, and mixing the
// marketplace's own three intents into it blurred what the section is for.
//
// Their three slots went to the trades that were sitting just below the
// fold in the tail — panel beating, auto-electrics and batteries are among
// the most-needed of the lot, not part of a long tail.
export const carServicesPrimary = [
  { key: "garage", icon: "construct-outline", query: "garage" },
  { key: "towing", icon: "warning-outline", query: "dépannage" },
  { key: "tyres", icon: "disc-outline", query: "pneu" },
  { key: "battery", icon: "battery-charging-outline", query: "batterie" },
  { key: "electrics", icon: "flash-outline", query: "électricité auto" },
  { key: "bodywork", icon: "color-fill-outline", query: "carrosserie" },
  { key: "driver", icon: "person-outline", query: "chauffeur" },
  { key: "parts", icon: "cog-outline", query: "pièce auto" },
  { key: "wash", icon: "water-outline", query: "lavage auto" },
  { key: "parking", icon: "location-outline", route: "CarParks" },
  {
    key: "documents",
    icon: "document-text-outline",
    query: "visite technique",
  },
  {
    key: "insurance",
    icon: "shield-checkmark-outline",
    query: "assurance auto",
  },
];

export const carServicesMore = [
  { key: "aircon", icon: "snow-outline", query: "climatisation auto" },
  { key: "keys", icon: "key-outline", query: "clé voiture" },
  { key: "gps", icon: "navigate-circle-outline", query: "gps traceur" },
  { key: "fleet", icon: "business-outline", query: "gestion de flotte" },
  { key: "dealers", icon: "storefront-outline", route: "CarDealerships" },
  { key: "drivingSchool", icon: "school-outline", query: "auto-école" },
  { key: "trucks", icon: "bus-outline", query: "camion utilitaire" },
  { key: "importation", icon: "boat-outline", query: "importation véhicule" },
  { key: "scrap", icon: "refresh-circle-outline", query: "casse automobile" },
  { key: "stayCar", icon: "home-outline", query: "séjour voiture" },
];
