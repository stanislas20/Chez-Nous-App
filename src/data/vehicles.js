// The vehicle vertical, shaped like the real-estate one: an intent that
// changes which fields and which price unit apply, a declared seller kind,
// and filters that come from the data rather than from hardcoded lists.

const EMERALD = "#0B6E4F";
const BLUE = "#2F6BB5";
const GOLD = "#D9A441";
const TERRACOTTA = "#C1512D";
const VIOLET = "#A15AC4";

// Buy and rent are browse intents; selling opens the publish flow instead of
// filtering a list, which is why it carries no deals of its own.
export const vehicleIntents = [
  { key: "buy", glyph: "🚘", labelEn: "Buy", labelFr: "Acheter" },
  { key: "rent", glyph: "🔑", labelEn: "Rent", labelFr: "Louer" },
  { key: "sell", glyph: "💰", labelEn: "Sell", labelFr: "Vendre" },
];

// What a listing actually is. `pricePer` decides the unit shown on the card,
// the same mechanism the commercial property types use.
export const vehicleDeals = [
  {
    key: "used",
    intent: "buy",
    color: EMERALD,
    icon: "car-outline",
    labelEn: "Used",
    labelFr: "Occasion",
    pricePer: "total",
    hasMileage: true,
  },
  {
    key: "new",
    intent: "buy",
    color: BLUE,
    icon: "sparkles-outline",
    labelEn: "New",
    labelFr: "Neuf",
    pricePer: "total",
    hasMileage: false,
  },
  {
    key: "rentalSelf",
    intent: "rent",
    color: GOLD,
    icon: "key-outline",
    labelEn: "Self-drive",
    labelFr: "Sans chauffeur",
    pricePer: "day",
    hasMileage: false,
  },
  {
    key: "rentalDriver",
    intent: "rent",
    color: VIOLET,
    icon: "person-outline",
    labelEn: "With driver",
    labelFr: "Avec chauffeur",
    pricePer: "day",
    hasMileage: false,
  },
  {
    key: "rentalLong",
    intent: "rent",
    color: TERRACOTTA,
    icon: "calendar-outline",
    labelEn: "Long term",
    labelFr: "Longue durée",
    pricePer: "month",
    hasMileage: false,
  },
];

// Who is selling, as the seller describes themselves. None of these is a
// verification — the app checks phone numbers and company registrations, and
// those badges are earned separately. Conflating the two is what turns a
// helpful label into a false guarantee.
export const vehicleSellerKinds = [
  {
    key: "owner",
    color: "#4d4d4f",
    labelEn: "Private seller",
    labelFr: "Particulier",
  },
  { key: "reseller", color: GOLD, labelEn: "Reseller", labelFr: "Revendeur" },
  {
    key: "carPark",
    color: EMERALD,
    labelEn: "Car park",
    labelFr: "Parc automobile",
  },
  {
    key: "dealership",
    color: BLUE,
    labelEn: "Dealership",
    labelFr: "Concessionnaire",
  },
  {
    key: "importer",
    color: TERRACOTTA,
    labelEn: "Importer",
    labelFr: "Importateur",
  },
];

// Ordered by what actually circulates in the parks along the Sèkandji–Ekpè
// corridor, then the marques with an official local dealership. Kept as data
// so a marque can be added without touching a screen.
export const vehicleBrands = [
  "Toyota",
  "Hyundai",
  "Suzuki",
  "Mercedes",
  "Ford",
  "Honda",
  "Nissan",
  "Kia",
  "Peugeot",
  "Mazda",
  "Mitsubishi",
  "Acura",
  "Citroën",
  "Lexus",
  "Isuzu",
  "BMW",
  "Land Rover",
  "Renault",
  "Volkswagen",
  "Chevrolet",
  "Audi",
  "Jeep",
  "Changan",
  "Geely",
];

export const vehicleBodyTypes = [
  { key: "sedan", labelEn: "Sedan", labelFr: "Berline" },
  { key: "suv", labelEn: "SUV", labelFr: "SUV" },
  { key: "4x4", labelEn: "4x4", labelFr: "4x4" },
  { key: "pickup", labelEn: "Pick-up", labelFr: "Pick-up" },
  { key: "cityCar", labelEn: "City car", labelFr: "Citadine" },
  { key: "coupe", labelEn: "Coupé", labelFr: "Coupé" },
  { key: "van", labelEn: "Van", labelFr: "Fourgon" },
  { key: "minibus", labelEn: "Minibus", labelFr: "Minibus" },
  { key: "truck", labelEn: "Truck", labelFr: "Camion" },
];

// Electric is listed from the start even though adoption is early: a car
// posted today outlives the data model, and retrofitting an energy type onto
// existing listings is worse than carrying one unused option.
export const vehicleFuels = [
  { key: "petrol", labelEn: "Petrol", labelFr: "Essence" },
  { key: "diesel", labelEn: "Diesel", labelFr: "Diesel" },
  { key: "hybrid", labelEn: "Hybrid", labelFr: "Hybride" },
  { key: "electric", labelEn: "Electric", labelFr: "Électrique" },
  { key: "lpg", labelEn: "LPG", labelFr: "GPL" },
];

export const vehicleTransmissions = [
  { key: "automatic", labelEn: "Automatic", labelFr: "Automatique" },
  { key: "manual", labelEn: "Manual", labelFr: "Manuelle" },
];

// Wide bands rather than a slider: they match how prices are quoted here and
// they survive a list that is still small.
export const VEHICLE_BUDGET_BANDS = {
  buy: [
    { key: "a", max: 3000000, labelEn: "≤ 3M", labelFr: "≤ 3M" },
    { key: "b", min: 3000000, max: 5000000, labelEn: "3–5M", labelFr: "3–5M" },
    {
      key: "c",
      min: 5000000,
      max: 10000000,
      labelEn: "5–10M",
      labelFr: "5–10M",
    },
    {
      key: "d",
      min: 10000000,
      max: 20000000,
      labelEn: "10–20M",
      labelFr: "10–20M",
    },
    { key: "e", min: 20000000, labelEn: "20M+", labelFr: "20M+" },
  ],
  rent: [
    { key: "a", max: 25000, labelEn: "≤ 25k", labelFr: "≤ 25k" },
    { key: "b", min: 25000, max: 50000, labelEn: "25–50k", labelFr: "25–50k" },
    { key: "c", min: 50000, labelEn: "> 50k", labelFr: "> 50k" },
  ],
};

// Since 2025 a light vehicle over seven years old cannot be imported. This is
// the single most useful fact for anyone buying from an importer, and unlike
// the duty rates it does not move with a tariff schedule — so it is the one
// import figure worth stating in the app.
export const MAX_IMPORT_AGE_YEARS = 7;

export function isBeyondImportAge(year) {
  const value = Number(year);
  if (!Number.isFinite(value) || value <= 0) return false;
  return new Date().getFullYear() - value > MAX_IMPORT_AGE_YEARS;
}

export function getVehicleDeal(key) {
  return vehicleDeals.find((item) => item.key === key) ?? null;
}

export function vehiclePricePer(dealKey) {
  return getVehicleDeal(dealKey)?.pricePer ?? "total";
}

export function dealsForIntent(intentKey) {
  return vehicleDeals.filter((item) => item.intent === intentKey);
}

function label(entry, language) {
  if (!entry) return "";
  return language === "fr" ? entry.labelFr : entry.labelEn;
}

export function getVehicleDealLabel(key, language) {
  return label(getVehicleDeal(key), language);
}

export function getVehicleIntentLabel(key, language) {
  return label(
    vehicleIntents.find((item) => item.key === key),
    language,
  );
}

export function getVehicleSellerKind(key) {
  return vehicleSellerKinds.find((item) => item.key === key) ?? null;
}

export function getVehicleSellerKindLabel(key, language) {
  return label(getVehicleSellerKind(key), language);
}

export function getVehicleFuelLabel(key, language) {
  return label(
    vehicleFuels.find((item) => item.key === key),
    language,
  );
}

export function getVehicleTransmissionLabel(key, language) {
  return label(
    vehicleTransmissions.find((item) => item.key === key),
    language,
  );
}

export function getVehicleBodyTypeLabel(key, language) {
  return label(
    vehicleBodyTypes.find((item) => item.key === key),
    language,
  );
}

// The fallback when a listing has no photo: the marque's first letters over
// its own colour. Deliberately not a stock car image — a picture that isn't
// the car being sold is worse than an honest placeholder.
export function vehicleMonogram(brand) {
  return String(brand ?? "")
    .replace(/[^A-Za-zÀ-ÿ]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

// A colour per marque for the browse tiles and the photo fallback. These are
// picked to be distinguishable from each other in a grid, not to reproduce
// any brand's official palette — using a company's real brand colour on a
// tile it did not design implies an endorsement it never gave.
const BRAND_TINTS = [
  "#0B6E4F",
  "#2F6BB5",
  "#C1512D",
  "#A15AC4",
  "#B08421",
  "#1F7A8C",
  "#8B4A6B",
  "#4C6B2F",
];

export function vehicleBrandTint(brand) {
  const name = String(brand ?? "");
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return BRAND_TINTS[sum % BRAND_TINTS.length];
}

// Body colour. Kept to the shades that actually circulate here rather than a
// paint catalogue — a buyer filters on "grey", not on "moondust metallic".
export const vehicleColors = [
  { key: "white", swatch: "#F2F2F0", labelEn: "White", labelFr: "Blanc" },
  { key: "black", swatch: "#1A1A1A", labelEn: "Black", labelFr: "Noir" },
  { key: "grey", swatch: "#8A8D91", labelEn: "Grey", labelFr: "Gris" },
  { key: "silver", swatch: "#C7CBD1", labelEn: "Silver", labelFr: "Argent" },
  { key: "blue", swatch: "#2F6BB5", labelEn: "Blue", labelFr: "Bleu" },
  { key: "red", swatch: "#C1352D", labelEn: "Red", labelFr: "Rouge" },
  { key: "green", swatch: "#2F7A4F", labelEn: "Green", labelFr: "Vert" },
  { key: "beige", swatch: "#D8C9A8", labelEn: "Beige", labelFr: "Beige" },
  { key: "brown", swatch: "#6B4A2F", labelEn: "Brown", labelFr: "Marron" },
  { key: "gold", swatch: "#C9A227", labelEn: "Gold", labelFr: "Doré" },
];

// Equipment a buyer here actually asks about on the phone. Every one is
// declared by the seller and none is verified by the app — the same rule the
// seller kinds follow, and the browse screens label them the same way.
export const vehicleFeatures = [
  {
    key: "alloyWheels",
    icon: "disc-outline",
    labelEn: "Alloy wheels",
    labelFr: "Jantes alu",
  },
  {
    key: "leatherSeats",
    icon: "car-sport-outline",
    labelEn: "Leather seats",
    labelFr: "Sièges cuir",
  },
  {
    key: "airConditioning",
    icon: "snow-outline",
    labelEn: "Air conditioning",
    labelFr: "Climatisation",
  },
  {
    key: "reverseCamera",
    icon: "videocam-outline",
    labelEn: "Reverse camera",
    labelFr: "Caméra de recul",
  },
  {
    key: "sunroof",
    icon: "sunny-outline",
    labelEn: "Sunroof",
    labelFr: "Toit ouvrant",
  },
  {
    key: "touchscreen",
    icon: "tablet-landscape-outline",
    labelEn: "Touchscreen",
    labelFr: "Écran tactile",
  },
];

export function getVehicleColor(key) {
  return vehicleColors.find((item) => item.key === key) ?? null;
}

export function getVehicleColorLabel(key, language) {
  return label(getVehicleColor(key), language);
}

export function getVehicleFeatureLabel(key, language) {
  return label(
    vehicleFeatures.find((item) => item.key === key),
    language,
  );
}

// The oldest model year the browse filters offer. Cars older than this do
// circulate, but the "from year" list has to stop somewhere and this already
// covers the 1990s imports the parks are full of.
export const VEHICLE_YEAR_FLOOR = 1995;

// ---------------------------------------------------------------------------
// The rest of what a buyer here actually asks on the phone.
// ---------------------------------------------------------------------------

export const vehicleDrivetrains = [
  { key: "fwd", labelEn: "Front-wheel drive", labelFr: "Traction avant" },
  { key: "rwd", labelEn: "Rear-wheel drive", labelFr: "Propulsion" },
  { key: "awd", labelEn: "All-wheel drive", labelFr: "4 roues motrices" },
];

// Customs status is the single most consequential fact about a used car in
// Bénin and appears on no generic car-listing template. A vehicle sitting in
// a park "non dédouané" is cheaper precisely because the buyer inherits the
// duty, which can be a large fraction of the price. Publishing a price
// without saying which side of that line it falls on is close to meaningless.
// The carte grise, asked the same way customs is: three states, one of
// which must be chosen.
//
// This replaced a single "I have the carte grise" checkbox that defaulted
// to unticked. Nothing required an answer, so a seller who scrolled past it
// published carrying the same warning as a seller with genuinely no papers
// — a badge that appears by default is not a warning, it is noise, and it
// quietly accuses honest sellers. Silence is never rendered as a red flag
// now: only an explicit "non" is.
export const vehicleDocuments = [
  {
    key: "yes",
    color: "#0B6E4F",
    labelEn: "Carte grise available",
    labelFr: "Carte grise disponible",
    hintEn: "The registration document is in the seller's name and to hand",
    hintFr: "La carte grise est au nom du vendeur et disponible",
  },
  {
    key: "pending",
    color: "#D9A441",
    labelEn: "Duplicate in progress",
    labelFr: "Duplicata en cours",
    hintEn: "Requested and not yet issued — ask for the timeline",
    hintFr: "Demandé et pas encore délivré — demandez le délai",
  },
  {
    key: "no",
    color: "#C1512D",
    labelEn: "No carte grise",
    labelFr: "Sans carte grise",
    hintEn: "Nothing to transfer the vehicle with — check before paying",
    hintFr: "Rien pour transférer le véhicule — vérifiez avant de payer",
  },
];

export const vehicleCustoms = [
  {
    key: "cleared",
    color: "#0B6E4F",
    labelEn: "Customs cleared",
    labelFr: "Dédouané",
    hintEn: "Duty already paid — the price is what you pay",
    hintFr: "Droits déjà payés — le prix affiché est ce que vous payez",
  },
  {
    key: "notCleared",
    color: "#C1512D",
    labelEn: "Not cleared",
    labelFr: "Non dédouané",
    hintEn: "Duty still to be paid by the buyer, on top of the price",
    hintFr: "Droits restant à payer par l’acheteur, en plus du prix",
  },
  {
    key: "inProgress",
    color: "#D9A441",
    labelEn: "Clearing in progress",
    labelFr: "Dédouanement en cours",
    hintEn: "At the port or in process — ask for the timeline",
    hintFr: "Au port ou en cours — demandez le délai",
  },
];

// Whether the car carries Beninese plates decides whether the buyer can
// simply drive it away.
export const vehiclePlates = [
  {
    key: "benin",
    labelEn: "Registered in Bénin",
    labelFr: "Immatriculé Bénin",
  },
  { key: "foreign", labelEn: "Foreign plates", labelFr: "Plaque étrangère" },
  { key: "none", labelEn: "Not registered", labelFr: "Non immatriculé" },
];

// Stated by the seller. A market fed by salvage auctions abroad makes this
// worth asking plainly rather than leaving it to be discovered on the road.
export const vehicleHistories = [
  {
    key: "clean",
    labelEn: "No known accident",
    labelFr: "Aucun accident connu",
  },
  {
    key: "repaired",
    labelEn: "Repaired accident",
    labelFr: "Accidenté réparé",
  },
  { key: "toRepair", labelEn: "Needs repair", labelFr: "À réparer" },
];

export const VEHICLE_DOOR_OPTIONS = [2, 3, 4, 5];
export const VEHICLE_SEAT_OPTIONS = [2, 4, 5, 7, 8, 9, 15];

export function getVehicleDrivetrainLabel(key, language) {
  return label(
    vehicleDrivetrains.find((item) => item.key === key),
    language,
  );
}

export function getVehicleDocuments(key) {
  return vehicleDocuments.find((item) => item.key === key) ?? null;
}

export function getVehicleDocumentsLabel(key, language) {
  return label(getVehicleDocuments(key), language);
}

export function getVehicleDocumentsHint(key, language) {
  const item = getVehicleDocuments(key);
  if (!item) return "";
  return language === "fr" ? item.hintFr : item.hintEn;
}

// Listings published before this field existed carry only the old boolean.
// A true maps cleanly to "yes"; a false does not map to "no", because it
// far more often meant "never answered" — so it stays unknown and shows
// nothing rather than retroactively branding those sellers.
export function resolveVehicleDocuments(listing) {
  if (listing?.documents) return listing.documents;
  return listing?.hasDocuments ? "yes" : null;
}

export function getVehicleCustoms(key) {
  return vehicleCustoms.find((item) => item.key === key) ?? null;
}

export function getVehicleCustomsLabel(key, language) {
  return label(getVehicleCustoms(key), language);
}

export function getVehicleCustomsHint(key, language) {
  const item = getVehicleCustoms(key);
  if (!item) return "";
  return language === "fr" ? item.hintFr : item.hintEn;
}

export function getVehiclePlateLabel(key, language) {
  return label(
    vehiclePlates.find((item) => item.key === key),
    language,
  );
}

export function getVehicleHistoryLabel(key, language) {
  return label(
    vehicleHistories.find((item) => item.key === key),
    language,
  );
}
