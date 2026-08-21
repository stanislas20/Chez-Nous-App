// Property listings, which the generic goods form served worse than any
// other category: a flat at 150 000 per month and a house at 45 000 000
// were both "a price", stored identically, with no way for a browser to
// tell a rental from a sale. It also asked what condition a house is in
// ("Comme neuf") while capturing none of what people actually filter on —
// rooms, surface, furnishing.
//
// The deal type is the root of it: it decides the price unit and which of
// the remaining fields make sense at all.
export const realEstateDeals = [
  {
    key: "rent",
    feather: "key",
    glyph: "🔑",
    icon: "key-outline",
    color: "#2F6BB5",
    labelEn: "For rent",
    labelFr: "À louer",
    priceSuffixKey: "sellPriceSuffix_perMonth",
    hasRooms: true,
    hasFurnished: true,
    // "Caution" (deposit, counted in months of rent) is how rentals are
    // quoted here — leaving it out means every enquiry starts by asking.
    hasDeposit: true,
  },
  {
    key: "sale",
    feather: "home",
    glyph: "🏡",
    icon: "home-outline",
    color: "#12876A",
    labelEn: "For sale",
    labelFr: "À vendre",
    priceSuffixKey: "sellPriceSuffix_total",
    hasRooms: true,
    hasFurnished: false,
    hasDeposit: false,
  },
  {
    key: "land",
    feather: "map",
    glyph: "📐",
    icon: "map-outline",
    color: "#8FA030",
    labelEn: "Land",
    labelFr: "Terrain",
    priceSuffixKey: "sellPriceSuffix_total",
    // Land has no rooms to count and nothing to furnish — those fields are
    // hidden rather than shown empty.
    hasRooms: false,
    hasFurnished: false,
    hasDeposit: false,
  },
  {
    key: "shortStay",
    feather: "moon",
    glyph: "🛏️",
    icon: "moon-outline",
    color: "#A15AC4",
    labelEn: "Short stay",
    labelFr: "Courte durée",
    priceSuffixKey: "sellPriceSuffix_perNight",
    hasRooms: true,
    hasFurnished: true,
    hasDeposit: false,
  },
  {
    // Shops, offices, storerooms and party halls. Kept as one deal rather
    // than several because that is how the market itself files them — the
    // classifieds here list a salle de fête under "Bureaux et commerces"
    // alongside a boutique — and because five tabs is the most this track
    // can hold before the labels start truncating.
    key: "commercial",
    feather: "shopping-bag",
    glyph: "🏬",
    icon: "storefront-outline",
    color: "#C1512D",
    labelEn: "Commercial",
    labelFr: "Commerce",
    priceSuffixKey: "sellPriceSuffix_perMonth",
    // Rooms and furnishing are residential questions; a shop is described by
    // its surface and its frontage.
    hasRooms: false,
    hasFurnished: false,
    hasDeposit: true,
  },
];

// What kind of commercial space, asked once the Commerce deal is chosen.
//
// The split matters because the money works differently: a boutique or an
// office is quoted per month with avance and caution like any lease, while a
// salle de fête is quoted per day and chosen on how many guests it seats.
// Putting them under one deal but pricing them per type is what lets both
// sit in the same list without either being described wrongly.
export const commercialTypes = [
  {
    key: "shop",
    color: "#C1512D",
    glyph: "🛍️",
    icon: "storefront-outline",
    labelEn: "Shop",
    labelFr: "Boutique",
    pricePer: "month",
  },
  {
    key: "store",
    color: "#D9A441",
    glyph: "📦",
    icon: "cube-outline",
    labelEn: "Storeroom",
    labelFr: "Magasin",
    pricePer: "month",
  },
  {
    key: "office",
    color: "#2F6BB5",
    glyph: "💼",
    icon: "briefcase-outline",
    labelEn: "Office",
    labelFr: "Bureau",
    pricePer: "month",
  },
  {
    key: "warehouse",
    color: "#8FA030",
    glyph: "🏭",
    icon: "business-outline",
    labelEn: "Warehouse",
    labelFr: "Entrepôt",
    pricePer: "month",
  },
  {
    key: "eventHall",
    color: "#A15AC4",
    glyph: "🎉",
    icon: "sparkles-outline",
    labelEn: "Event hall",
    labelFr: "Salle de fête",
    // Priced by the day and booked on capacity: the halls advertised here
    // run from about 80 000 FCFA for fifty guests to several million for a
    // few hundred, so the guest count is the first thing anyone asks.
    pricePer: "day",
    hasCapacity: true,
  },
];

export function getCommercialType(key) {
  return commercialTypes.find((item) => item.key === key) ?? null;
}

export function getCommercialTypeLabel(key, language) {
  const type = getCommercialType(key);
  if (!type) return "";
  return language === "fr" ? type.labelFr : type.labelEn;
}

// Per day for a hall, per month for everything else.
export function commercialPricePer(typeKey) {
  return getCommercialType(typeKey)?.pricePer ?? "month";
}

export function realEstateHasCapacity(dealKey, commercialType) {
  return dealKey === "commercial" && !!getCommercialType(commercialType)?.hasCapacity;
}

// Only asked for when the deal isn't land, which is its own property type
// by definition.
export const propertyTypes = [
  { key: "apartment", icon: "business-outline", labelEn: "Apartment", labelFr: "Appartement" },
  { key: "house", icon: "home-outline", labelEn: "House / Villa", labelFr: "Maison / Villa" },
  { key: "studio", icon: "square-outline", labelEn: "Studio", labelFr: "Studio" },
  { key: "room", icon: "bed-outline", labelEn: "Room", labelFr: "Chambre" },
  {
    key: "commercial",
    icon: "storefront-outline",
    labelEn: "Office / Shop",
    labelFr: "Bureau / Commerce",
  },
];

// Multi-select. Chosen for what genuinely varies between properties here —
// a working borehole or a generator is a real differentiator when the grid
// is unreliable, in a way "has walls" is not.
// Colour groups the list without needing headings: water is blue, energy
// gold, comfort violet, security emerald, access terracotta. Twenty chips
// in one flat grey block gets skimmed; the same twenty in five colour
// families can be scanned for the one thing you care about.
const WATER = '#2F6BB5';
const ENERGY = '#D9A441';
const COMFORT = '#A15AC4';
const SECURITY = '#0B6E4F';
const ACCESS = '#C1512D';

export const propertyAmenities = [
  // Ordered by what people here actually ask on the phone before visiting.
  { key: 'water', color: WATER, icon: 'water-outline', labelEn: 'Running water (SONEB)', labelFr: 'Eau courante (SONEB)' },
  { key: 'electricity', color: ENERGY, icon: 'flash-outline', labelEn: 'Electricity (SBEE)', labelFr: 'Électricité (SBEE)' },
  {
    // The single most-asked rental question after the rent itself. A shared
    // meter means splitting a bill with neighbours you did not choose and
    // arguing about it monthly; a card meter means you pay only your own.
    key: 'prepaidMeter',
    color: ENERGY,
    icon: 'card-outline',
    labelEn: 'Prepaid card meter',
    labelFr: 'Compteur à carte',
  },
  {
    // Mains water is intermittent in much of Cotonou and Calavi, so a
    // borehole is a differentiator rather than a luxury.
    key: 'borehole',
    color: WATER,
    icon: 'arrow-down-circle-outline',
    labelEn: 'Borehole / well',
    labelFr: 'Forage / puits',
  },
  { key: 'waterTank', color: WATER, icon: 'cube-outline', labelEn: 'Water tank', labelFr: 'Château d’eau' },
  { key: 'generator', color: ENERGY, icon: 'battery-charging-outline', labelEn: 'Generator', labelFr: 'Groupe électrogène' },
  {
    // For a chambre-salon this decides everything: a private toilet or one
    // shared with the whole compound.
    key: 'privateBathroom',
    color: COMFORT,
    icon: 'lock-closed-outline',
    labelEn: 'Private bathroom',
    labelFr: 'Douche/WC privés',
  },
  { key: 'kitchen', color: COMFORT, icon: 'restaurant-outline', labelEn: 'Fitted kitchen', labelFr: 'Cuisine équipée' },
  { key: 'ac', color: COMFORT, icon: 'snow-outline', labelEn: 'Air conditioning', labelFr: 'Climatisation' },
  { key: 'waterHeater', color: COMFORT, icon: 'thermometer-outline', labelEn: 'Water heater', labelFr: 'Chauffe-eau' },
  { key: 'tiled', color: COMFORT, icon: 'grid-outline', labelEn: 'Tiled floors', labelFr: 'Carrelage' },
  { key: 'balcony', color: COMFORT, icon: 'sunny-outline', labelEn: 'Balcony / terrace', labelFr: 'Balcon / terrasse' },
  { key: 'internet', color: COMFORT, icon: 'wifi-outline', labelEn: 'Internet / fibre', labelFr: 'Internet / fibre' },
  { key: 'fenced', color: SECURITY, icon: 'shield-outline', labelEn: 'Fenced / walled', labelFr: 'Clôturé' },
  {
    key: 'guard',
    color: SECURITY,
    icon: 'shield-checkmark-outline',
    labelEn: 'Caretaker / guard',
    labelFr: 'Gardien',
  },
  { key: 'parking', color: ACCESS, icon: 'car-outline', labelEn: 'Parking', labelFr: 'Parking' },
  { key: 'garage', color: ACCESS, icon: 'car-sport-outline', labelEn: 'Garage / gate', labelFr: 'Garage / portail' },
  {
    // Sandy, unpaved lanes turn to mud in the rains and some are impassable
    // by taxi — "is it on the tarmac" is a real question here.
    key: 'pavedAccess',
    color: ACCESS,
    icon: 'trail-sign-outline',
    labelEn: 'Paved road access',
    labelFr: 'Accès goudronné',
  },
  {
    // Flooding is seasonal and neighbourhood-specific in Cotonou; saying so
    // up front saves a wasted visit.
    key: 'floodFree',
    color: ACCESS,
    icon: 'umbrella-outline',
    labelEn: 'Not flood-prone',
    labelFr: 'Zone non inondable',
  },
  { key: 'pool', color: COMFORT, icon: 'boat-outline', labelEn: 'Pool', labelFr: 'Piscine' },
  // Event halls only. What the listings here advertise once the room itself
  // is settled — a hall without sound or chairs means hiring both
  // separately, which changes the real price of the day.
  {
    key: 'soundSystem',
    color: COMFORT,
    icon: 'volume-high-outline',
    eventOnly: true,
    labelEn: 'Sound system',
    labelFr: 'Sonorisation',
  },
  {
    key: 'tablesChairs',
    color: COMFORT,
    icon: 'grid-outline',
    eventOnly: true,
    labelEn: 'Tables & chairs',
    labelFr: 'Tables & chaises',
  },
  {
    key: 'catering',
    color: ACCESS,
    icon: 'restaurant-outline',
    eventOnly: true,
    labelEn: 'Catering available',
    labelFr: 'Traiteur disponible',
  },
];

// The amenity list for a given listing. Sonorisation and a caterer are
// meaningless on a house, and a fitted kitchen or a bedroom is meaningless
// on a hall, so each side only ever sees its own.
export function amenitiesFor(dealKey, commercialType) {
  const isHall = realEstateHasCapacity(dealKey, commercialType);
  return propertyAmenities.filter((item) => (isHall ? true : !item.eventOnly));
}

export const ROOM_COUNTS = ["1", "2", "3", "4", "5+"];
export const BATH_COUNTS = ["1", "2", "3+"];

export function getRealEstateDealGlyph(key) {
  return getRealEstateDeal(key)?.glyph ?? "🏠";
}

export function getRealEstateDeal(key) {
  return realEstateDeals.find((item) => item.key === key) ?? null;
}

export function getRealEstateDealLabel(key, language) {
  const deal = getRealEstateDeal(key);
  if (!deal) return null;
  return language === "en" ? deal.labelEn : deal.labelFr;
}

export function getPropertyTypeLabel(key, language) {
  const type = propertyTypes.find((item) => item.key === key);
  if (!type) return null;
  return language === "en" ? type.labelEn : type.labelFr;
}

export function getAmenityLabel(key, language) {
  const amenity = propertyAmenities.find((item) => item.key === key);
  if (!amenity) return null;
  return language === "en" ? amenity.labelEn : amenity.labelFr;
}

export function realEstatePriceSuffixKey(dealKey) {
  return getRealEstateDeal(dealKey)?.priceSuffixKey ?? "sellPriceSuffix_total";
}

export function realEstateHasRooms(dealKey) {
  return !!getRealEstateDeal(dealKey)?.hasRooms;
}

export function realEstateHasFurnished(dealKey) {
  return !!getRealEstateDeal(dealKey)?.hasFurnished;
}

export function realEstateHasDeposit(dealKey, commercialType) {
  if (!getRealEstateDeal(dealKey)?.hasDeposit) return false;
  // A hall is paid for the day; there is no caution held against months of
  // occupancy, so asking for one would invent a cost.
  if (dealKey === "commercial") return commercialPricePer(commercialType) === "month";
  return true;
}

// Which deals describe a built space worth listing features for. Land is
// left out here as it always has been — its own document and lotissement
// fields carry what matters about a plot.
export function realEstateShowsAmenities(dealKey) {
  return realEstateHasRooms(dealKey) || dealKey === "commercial";
}

// Months of rent demanded up front, separate from the caution (deposit).
//
// This is the number that decides whether someone can take a place at all.
// A flat at 60 000/month with 12 months' avance is a 780 000 FCFA decision,
// and a card showing "60 000 FCFA / mois" hides that entirely. Caution was
// already captured; avance is the larger half of the same barrier and was
// missing.
export const AVANCE_MONTHS = ["0", "1", "2", "3", "6", "12"];

export function realEstateHasAvance(dealKey, commercialType) {
  // Long lets only. A short stay is paid per night, a hall by the day, and
  // neither a sale nor a plot of land has rent to pay in advance. Shops and
  // offices are leased on the same avance-plus-caution terms as homes.
  if (dealKey === "rent") return true;
  return dealKey === "commercial" && commercialPricePer(commercialType) === "month";
}

// What someone must actually produce to enter a rental: the months paid up
// front plus the deposit, in money rather than in months. Returns null when
// the poster left either out, so the UI can stay quiet instead of implying
// a total it doesn't know.
export function getMoveInCost(listing) {
  const rent = Number(listing?.price) || 0;
  if (!rent || listing?.realEstateDeal !== "rent") return null;
  const avance = Number(listing?.avanceMonths);
  const deposit = Number(listing?.depositMonths);
  if (!Number.isFinite(avance) && !Number.isFinite(deposit)) return null;
  const months = (Number.isFinite(avance) ? avance : 0) + (Number.isFinite(deposit) ? deposit : 0);
  if (months <= 0) return null;
  return rent * months;
}

// Paperwork behind a plot of land, ranked by what it actually confers.
//
// Land fraud is the defining risk in this market, and the reason is that
// "having papers" covers instruments that are not remotely equivalent.
// Under the Code Foncier et Domanial only the Titre Foncier confers full
// ownership opposable to third parties; the coutumier/recasement/rural
// certificates establish a presumption of rights; a convention de vente
// proves a transaction happened and confirms no right at all.
//
// So the tier is the point, not the label. A buyer comparing two plots is
// really comparing these three tiers, and flattening them into one "has
// documents" badge would hide exactly what they need to see.
export const landDocumentTiers = {
  full: { key: "full", color: "#0B6E4F", labelEn: "Full ownership", labelFr: "Propriété pleine" },
  presumed: {
    key: "presumed",
    color: "#8A6415",
    labelEn: "Presumed rights",
    labelFr: "Droits présumés",
  },
  weak: {
    key: "weak",
    color: "#B0463C",
    labelEn: "No right confirmed",
    labelFr: "Aucun droit confirmé",
  },
};

export const landDocuments = [
  {
    key: "titreFoncier",
    tier: "full",
    feather: "award",
    icon: "ribbon-outline",
    labelEn: "Land title (Titre Foncier)",
    labelFr: "Titre foncier",
    shortEn: "Land title",
    shortFr: "Titre foncier",
    noteEn: "Full ownership, opposable to third parties",
    noteFr: "Propriété pleine, opposable aux tiers",
  },
  {
    key: "adc",
    tier: "presumed",
    feather: "file-text",
    icon: "document-text-outline",
    labelEn: "Customary holding attestation (ADC)",
    labelFr: "Attestation de détention coutumière (ADC)",
    shortEn: "ADC",
    shortFr: "ADC",
    noteEn: "Customary holding — presumption of rights",
    noteFr: "Détention coutumière — présomption de droits",
  },
  {
    key: "recasement",
    tier: "presumed",
    feather: "file-text",
    icon: "document-text-outline",
    labelEn: "Resettlement attestation",
    labelFr: "Attestation de recasement",
    shortEn: "Recasement",
    shortFr: "Att. de recasement",
    noteEn: "Subdivided area — presumption of rights",
    noteFr: "Zone lotie — présomption de droits",
  },
  {
    key: "cfr",
    tier: "presumed",
    feather: "file-text",
    icon: "document-text-outline",
    labelEn: "Rural land certificate",
    labelFr: "Certificat foncier rural",
    shortEn: "Rural cert.",
    shortFr: "Certificat rural",
    noteEn: "Rural area — presumption of rights",
    noteFr: "Zone rurale — présomption de droits",
  },
  {
    key: "convention",
    tier: "weak",
    feather: "edit-3",
    icon: "create-outline",
    labelEn: "Sale agreement (convention de vente)",
    labelFr: "Convention de vente",
    shortEn: "Convention",
    shortFr: "Convention de vente",
    noteEn: "Proof of transaction only — no right confirmed",
    noteFr: "Preuve de transaction seule — aucun droit confirmé",
  },
];

export function getLandDocument(key) {
  return landDocuments.find((item) => item.key === key) ?? null;
}

export function getLandDocumentLabel(key, language) {
  const doc = getLandDocument(key);
  if (!doc) return null;
  return language === "en" ? doc.labelEn : doc.labelFr;
}

export function getLandDocumentBadge(key, language) {
  const doc = getLandDocument(key);
  if (!doc) return null;
  return language === "en" ? doc.shortEn : doc.shortFr;
}

export function getLandDocumentNote(key, language) {
  const doc = getLandDocument(key);
  if (!doc) return null;
  return language === "en" ? doc.noteEn : doc.noteFr;
}

export function getLandDocumentTier(key) {
  const doc = getLandDocument(key);
  if (!doc) return null;
  return landDocumentTiers[doc.tier] ?? null;
}

// Who is behind the listing.
//
// The same house appears repeatedly here because intermediaries re-post
// what they don't hold, at prices that don't match. Naming the poster
// doesn't stop that on its own, but it lets a browser weigh two identical
// listings, and it is the field any later de-duplication would key on.
export const listerKinds = [
  { key: "owner", icon: "person-outline", labelEn: "Owner", labelFr: "Propriétaire" },
  { key: "agency", icon: "business-outline", labelEn: "Agency", labelFr: "Agence" },
  { key: "broker", icon: "people-outline", labelEn: "Agent", labelFr: "Démarcheur" },
];

export function getListerKindLabel(key, language) {
  const kind = listerKinds.find((item) => item.key === key);
  if (!kind) return null;
  return language === "en" ? kind.labelEn : kind.labelFr;
}
