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
// ── The families ───────────────────────────────────────────────────────
//
// A trade belongs to a family because a person looking for a mason and a
// person looking for a mechanic are not browsing the same list, and until
// today they were: every trade here was automotive, so "Services" meant
// "services for your car" and a tailor had nowhere to be published.
//
// The vehicle trades keep their own family so the Voitures screens, which
// each read one trade key, are untouched by this.
export const serviceFamilies = [
  { key: "vehicle", icon: "car-outline", labelKey: "sellFamilyVehicle" },
  { key: "building", icon: "hammer-outline", labelKey: "sellFamilyBuilding" },
  { key: "home", icon: "home-outline", labelKey: "sellFamilyHome" },
  { key: "sewing", icon: "cut-outline", labelKey: "sellFamilySewing" },
  { key: "beauty", icon: "sparkles-outline", labelKey: "sellFamilyBeauty" },
  { key: "events", icon: "balloon-outline", labelKey: "sellFamilyEvents" },
  { key: "digital", icon: "phone-portrait-outline", labelKey: "sellFamilyDigital" },
  { key: "lessons", icon: "school-outline", labelKey: "sellFamilyLessons" },
  { key: "health", icon: "medkit-outline", labelKey: "sellFamilyHealth" },
  { key: "paperwork", icon: "document-text-outline", labelKey: "sellFamilyPaperwork" },
];

export const serviceTrades = [
  { key: "garage", family: "vehicle", icon: "construct-outline", labelKey: "sellTradeGarage" },
  {
    key: "bodywork",
    family: "vehicle",
    icon: "color-fill-outline",
    labelKey: "sellTradeBodywork",
  },
  { key: "driver", family: "vehicle", icon: "person-outline", labelKey: "sellTradeDriver" },
  { key: "parts", family: "vehicle", icon: "cog-outline", labelKey: "sellTradeParts" },
  { key: "wash", family: "vehicle", icon: "water-outline", labelKey: "sellTradeWash" },
  { key: "electric", family: "vehicle", icon: "flash-outline", labelKey: "sellTradeElectric" },
  { key: "tyres", family: "vehicle", icon: "disc-outline", labelKey: "sellTradeTyres" },
  {
    key: "battery",
    family: "vehicle",
    icon: "battery-charging-outline",
    labelKey: "sellTradeBattery",
  },
  {
    key: "insurance",
    family: "vehicle",
    icon: "shield-checkmark-outline",
    labelKey: "sellTradeInsurance",
  },
  { key: "clim", family: "vehicle", icon: "snow-outline", labelKey: "sellTradeAircon" },
  { key: "keys", family: "vehicle", icon: "key-outline", labelKey: "sellTradeKeys" },
  { key: "gps", family: "vehicle", icon: "navigate-circle-outline", labelKey: "sellTradeGps" },
  {
    key: "drivingSchool",
    family: "vehicle",
    icon: "school-outline",
    labelKey: "sellTradeDrivingSchool",
  },
  // Carrying goods for other people. Distinct from "driver", which is a
  // person driving passengers in a car: this one owns a load bed and is
  // found from the Camions screen's third tab.
  { key: "haulier", family: "vehicle", icon: "cube-outline", labelKey: "sellTradeHaulier" },
  // Clearing somebody else's cargo through the port. Not a haulier, who
  // owns a load bed and moves goods that are already in the country: this
  // one files the declaration, and the two are found from opposite ends of
  // the same journey.
  { key: "transitaire", family: "vehicle", icon: "boat-outline", labelKey: "sellTradeTransitaire" },
  // The other end of the same journey: somebody abroad who buys the vehicle
  // or the goods and ships them here, either as their own stock to sell or
  // on order for a buyer in Bénin. Distinct from "transitaire" on purpose —
  // the two are found from the same screen and asked different questions,
  // and half the transitaire listings say "importation" too.
  { key: "importateur", family: "vehicle", icon: "airplane-outline", labelKey: "sellTradeImportateur" },

  // ── Everything that is not a car ─────────────────────────────────────
  // building
  { key: "mason", family: "building", icon: "hammer-outline", labelKey: "sellTradeMason" },
  { key: "tiler", family: "building", icon: "grid-outline", labelKey: "sellTradeTiler" },
  { key: "painter", family: "building", icon: "brush-outline", labelKey: "sellTradePainter" },
  { key: "plumber", family: "building", icon: "water-outline", labelKey: "sellTradePlumber" },
  { key: "electrician", family: "building", icon: "flash-outline", labelKey: "sellTradeElectrician" },
  { key: "welder", family: "building", icon: "flame-outline", labelKey: "sellTradeWelder" },
  { key: "carpenter", family: "building", icon: "hammer-outline", labelKey: "sellTradeCarpenter" },
  { key: "wellDigger", family: "building", icon: "ellipse-outline", labelKey: "sellTradeWellDigger" },
  // home
  { key: "cleaning", family: "home", icon: "sparkles-outline", labelKey: "sellTradeCleaning" },
  { key: "cook", family: "home", icon: "restaurant-outline", labelKey: "sellTradeCook" },
  { key: "guard", family: "home", icon: "shield-outline", labelKey: "sellTradeGuard" },
  { key: "gardener", family: "home", icon: "leaf-outline", labelKey: "sellTradeGardener" },
  { key: "septic", family: "home", icon: "trash-outline", labelKey: "sellTradeSeptic" },
  { key: "pestControl", family: "home", icon: "bug-outline", labelKey: "sellTradePestControl" },
  // sewing
  { key: "tailor", family: "sewing", icon: "cut-outline", labelKey: "sellTradeTailor" },
  { key: "embroiderer", family: "sewing", icon: "color-wand-outline", labelKey: "sellTradeEmbroiderer" },
  { key: "dyer", family: "sewing", icon: "color-palette-outline", labelKey: "sellTradeDyer" },
  { key: "cobbler", family: "sewing", icon: "footsteps-outline", labelKey: "sellTradeCobbler" },
  // beauty
  { key: "hairdresser", family: "beauty", icon: "cut-outline", labelKey: "sellTradeHairdresser" },
  { key: "braiding", family: "beauty", icon: "git-branch-outline", labelKey: "sellTradeBraiding" },
  { key: "beautician", family: "beauty", icon: "sparkles-outline", labelKey: "sellTradeBeautician" },
  { key: "barber", family: "beauty", icon: "cut-outline", labelKey: "sellTradeBarber" },
  { key: "makeup", family: "beauty", icon: "brush-outline", labelKey: "sellTradeMakeup" },
  // events
  { key: "caterer", family: "events", icon: "restaurant-outline", labelKey: "sellTradeCaterer" },
  { key: "marquee", family: "events", icon: "umbrella-outline", labelKey: "sellTradeMarquee" },
  { key: "sound", family: "events", icon: "musical-notes-outline", labelKey: "sellTradeSound" },
  { key: "decoration", family: "events", icon: "flower-outline", labelKey: "sellTradeDecoration" },
  { key: "photographer", family: "events", icon: "camera-outline", labelKey: "sellTradePhotographer" },
  { key: "pastry", family: "events", icon: "ice-cream-outline", labelKey: "sellTradePastry" },
  // digital
  { key: "phoneRepair", family: "digital", icon: "phone-portrait-outline", labelKey: "sellTradePhoneRepair" },
  { key: "graphics", family: "digital", icon: "color-palette-outline", labelKey: "sellTradeGraphics" },
  { key: "developer", family: "digital", icon: "code-slash-outline", labelKey: "sellTradeDeveloper" },
  { key: "cctv", family: "digital", icon: "videocam-outline", labelKey: "sellTradeCctv" },
  { key: "communityManager", family: "digital", icon: "megaphone-outline", labelKey: "sellTradeCommunityManager" },
  // lessons
  { key: "tutor", family: "lessons", icon: "school-outline", labelKey: "sellTradeTutor" },
  { key: "languages", family: "lessons", icon: "language-outline", labelKey: "sellTradeLanguages" },
  { key: "computing", family: "lessons", icon: "laptop-outline", labelKey: "sellTradeComputing" },
  { key: "music", family: "lessons", icon: "musical-note-outline", labelKey: "sellTradeMusic" },
  // health
  { key: "homeNurse", family: "health", icon: "medkit-outline", labelKey: "sellTradeHomeNurse" },
  { key: "carer", family: "health", icon: "heart-outline", labelKey: "sellTradeCarer" },
  { key: "physio", family: "health", icon: "body-outline", labelKey: "sellTradePhysio" },
  { key: "massage", family: "health", icon: "hand-left-outline", labelKey: "sellTradeMassage" },
  // paperwork
  { key: "publicWriter", family: "paperwork", icon: "create-outline", labelKey: "sellTradePublicWriter" },
  { key: "accountant", family: "paperwork", icon: "calculator-outline", labelKey: "sellTradeAccountant" },
  { key: "translator", family: "paperwork", icon: "language-outline", labelKey: "sellTradeTranslator" },
  { key: "lawyer", family: "paperwork", icon: "briefcase-outline", labelKey: "sellTradeLawyer" },
];

export function getServiceTradeLabelKey(key) {
  return serviceTrades.find((trade) => trade.key === key)?.labelKey ?? null;
}

// The trades of one family, in the order they are declared.
export function serviceTradesInFamily(family) {
  return serviceTrades.filter((trade) => trade.family === family);
}

export function getServiceFamilyLabelKey(key) {
  return serviceFamilies.find((family) => family.key === key)?.labelKey ?? null;
}
