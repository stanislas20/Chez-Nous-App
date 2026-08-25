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
//
// The five that are not 112 now open the Garages screen filtered to the
// trade they name, rather than a text search. Same providers either way —
// a garage listing is still an ordinary Services listing — but the screen
// can say whether each one is open right now and what they charge, which a
// raw search result cannot.
export const carHelpOptions = [
  {
    key: "helpBreakdown",
    icon: "warning-outline",
    route: "Breakdown",
  },
  {
    key: "helpBattery",
    icon: "flash-outline",
    route: "Breakdown",
    problem: "battery",
  },
  {
    key: "helpPuncture",
    icon: "disc-outline",
    route: "Breakdown",
    problem: "puncture",
  },
  {
    key: "helpTowing",
    icon: "car-outline",
    route: "Breakdown",
  },
  {
    key: "helpMechanic",
    icon: "construct-outline",
    route: "Garages",
    specialty: "meca",
  },
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
// The six repair trades route into the Garages screen at their own
// specialty; the rest stay as searches because no screen covers them yet.
export const carServicesPrimary = [
  { key: "garage", icon: "construct-outline", route: "Garages" },
  { key: "towing", icon: "warning-outline", route: "Breakdown" },
  // Its own screen rather than the Garages list filtered to "pneu": a tyre
  // is bought by a size, and no list of garages can answer "which of these
  // has 195/65 R15".
  { key: "tyres", icon: "disc-outline", route: "Tyres" },
  // Its own screen rather than the garage list filtered to "batt": a
  // battery is bought by a capacity, and no list of garages can answer
  // "which of these has a 60 Ah that fits my Corolla".
  { key: "battery", icon: "battery-charging-outline", route: "Battery" },
  // Its own screen rather than the garage list filtered to "elec": an
  // electrical fault is described by symptom, and no list of garages can
  // answer "who fixes a window that stopped halfway".
  { key: "electrics", icon: "flash-outline", route: "Electric" },
  // Its own screen rather than the garage list filtered to "carro": a body
  // repair is priced from photographs, and no list of garages can carry the
  // photographs.
  { key: "bodywork", icon: "color-fill-outline", route: "Bodywork" },
  // Its own screen rather than a text search: a driver is chosen on a permit
  // category, an availability and a language, and no keyword search can ask
  // those questions.
  { key: "driver", icon: "person-outline", route: "Drivers" },
  // Its own screen rather than a text search: "pièce" alone finds every
  // three-room flat in the country, and a parts shop is chosen on what it
  // stocks and whether that stock is new or from a casse.
  { key: "parts", icon: "cog-outline", route: "Parts" },
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
  { key: "aircon", icon: "snow-outline", route: "Garages", specialty: "clim" },
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
