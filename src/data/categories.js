// Colours follow companySectors.js / jobCategories.js: one mid-luminance
// hex per category, legible both as a solid icon on a pale tint in light
// mode and against a dark surface. They're what makes a long picker
// scannable — you find "Mode & Vêtements" by its pink long before you
// finish reading the labels.
// Each carries a one-line hint of what actually belongs in it. Two of
// these are easy to confuse — "Maison" reads as both "house" and
// "household", which put it next to Immobilier in people's heads and
// overlapping Meubles at the same time. Rather than merge (which would
// strand every listing already filed under the old key), the labels name
// what is inside and the hints settle the boundary: big things you need a
// truck for go in Meubles, everything else for the home goes in Déco.
export const categories = [
  { key: 'pharmacyOnDuty', hintEn: 'Official ONPB duty roster', hintFr: 'Tour de garde officiel ONPB', icon: 'medkit-outline', labelEn: 'Pharmacy On Duty', labelFr: 'Pharmacie de Garde', color: '#D6455A' },
  { key: 'vehicles', hintEn: 'Cars, motorbikes, parts', hintFr: 'Voitures, motos, pièces', icon: 'car-sport-outline', labelEn: 'Vehicles', labelFr: 'Véhicules', color: '#2F6BB5' },
  { key: 'realEstate', hintEn: 'Rent, buy, land', hintFr: 'Louer, acheter, terrains', icon: 'home-outline', labelEn: 'Real Estate & Rentals', labelFr: 'Immobilier & Locations', color: '#12908C' },
  { key: 'electronics', hintEn: 'Phones, computers, TVs', hintFr: 'Téléphones, ordinateurs, TV', icon: 'phone-portrait-outline', labelEn: 'Electronics', labelFr: 'Électronique', color: '#6A5AE0' },
  { key: 'fashion', hintEn: 'Clothes, shoes, fabric', hintFr: 'Vêtements, chaussures, pagnes', icon: 'shirt-outline', labelEn: 'Fashion & Apparel', labelFr: 'Mode & Vêtements', color: '#C4478A' },
  { key: 'homeGarden', hintEn: 'Kitchen, appliances, decor, plants', hintFr: 'Cuisine, électroménager, déco, plantes', icon: 'flower-outline', labelEn: 'Decor & Garden', labelFr: 'Déco & Jardin', color: '#5BA83A' },
  { key: 'furniture', hintEn: 'Beds, sofas, wardrobes, mattresses', hintFr: 'Lits, canapés, armoires, matelas', icon: 'bed-outline', labelEn: 'Furniture & Bedding', labelFr: 'Meubles & Literie', color: '#A0703F' },
  { key: 'babyKids', hintEn: 'Prams, clothes, toys', hintFr: 'Poussettes, vêtements, jouets', icon: 'balloon-outline', labelEn: 'Baby & Kids', labelFr: 'Bébé & Enfants', color: '#E8768F' },
  { key: 'sports', hintEn: 'Bikes, gear, outdoors', hintFr: 'Vélos, équipements, plein air', icon: 'football-outline', labelEn: 'Sports & Outdoors', labelFr: 'Sport & Plein air', color: '#EC8B2B' },
  { key: 'agriculture', hintEn: 'Seeds, tools, livestock', hintFr: 'Semences, outils, bétail', icon: 'leaf-outline', labelEn: 'Agriculture', labelFr: 'Agriculture', color: '#8FA030' },
  { key: 'restaurants', hintEn: 'Your restaurant or maquis', hintFr: 'Votre restaurant ou maquis', icon: 'restaurant-outline', labelEn: 'Restaurants', labelFr: 'Restaurants', color: '#D2603A' },
  { key: 'services', hintEn: 'Plumbing, hairdressing, transport', hintFr: 'Plomberie, coiffure, transport', icon: 'construct-outline', labelEn: 'Services', labelFr: 'Services', color: '#6B7A94' },
  // Its own aisle rather than a corner of Communauté, whose hint used to
  // claim events and now does not. An event is the one listing with an
  // expiry the app can reason about: it names a date, and after that date
  // it is not a thing you can still go to. Nothing else here works that way.
  { key: 'events', hintEn: 'Concerts, parties, matches, ceremonies', hintFr: 'Concerts, soirées, matchs, cérémonies', icon: 'ticket-outline', labelEn: 'Events & Outings', labelFr: 'Événements & Sorties', color: '#6D2C55' },
  { key: 'community', hintEn: 'Notices, mutual help, lost and found', hintFr: 'Annonces, entraide, objets trouvés', icon: 'people-outline', labelEn: 'Community', labelFr: 'Communauté', color: '#1A9AAC' },
  { key: 'jobs', hintEn: 'Job offers and gigs', hintFr: 'Offres d’emploi et missions', icon: 'briefcase-outline', labelEn: 'Jobs', labelFr: 'Emplois', color: '#12876A' },
  // Last on purpose, and grey: it is where you go when none of the above
  // fits, not a fifteenth aisle competing with them.
  //
  // Picking it asks what the thing actually is, and that answer is stored
  // on the listing as a label and offered to the next seller who gets here.
  // The key stays 'other' — a categoryKey is what routes a listing to its
  // detail screen and what every browse screen filters on, so it cannot be
  // a word somebody typed. See src/data/customCategories.js.
  { key: 'other', hintEn: 'Anything the list above misses', hintFr: 'Tout ce que la liste ci-dessus oublie', icon: 'ellipsis-horizontal-circle-outline', labelEn: 'Other', labelFr: 'Autre', color: '#7C8794' },
];

// Looked up rather than re-derived. Four screens were about to build their
// own key→icon map to draw a placeholder for a listing with no photo, and
// four copies of that map is four chances for a category to lose its icon
// on one screen only.
export function getCategoryIcon(key) {
  return (
    categories.find((category) => category.key === key)?.icon ??
    "pricetag-outline"
  );
}

export function getCategoryLabel(key, language) {
  const category = categories.find((item) => item.key === key);
  if (!category) return null;
  return language === "en" ? category.labelEn : category.labelFr;
}

// The three categories that are directories rather than a market.
//
// Each has its own screen, its own card and its own detail route, and none
// of them carries a price. Rendered by the generic ListingCard they are
// wrong in different ways: a job navigates to ProductDetail and silently
// loses the apply flow, a restaurant asks "0 FCFA", and a pharmacy duty
// roster is not for sale at all.
export const DIRECTORY_CATEGORIES = ["pharmacyOnDuty", "jobs", "restaurants"];

// What the marketplace feed asks Firestore for, derived rather than typed.
//
// This exists because filtering the directories out AFTER the page came back
// is what emptied both browse screens in production. The pharmacy roster
// holds 200 of 209 approved listings and is rewritten weekly with a fresh
// createdAt, so a page of the 60 newest was 60 pharmacies, every one of them
// discarded by the client-side filter, and the feed rendered "no listings"
// over a catalogue that was there the whole time.
//
// The query now names what the screens actually want, so a page is never
// spent on rows that will be thrown away. Derived from `categories` so a new
// category joins the feed by existing rather than by being remembered here —
// the hand-maintained copy is exactly what would rot.
//
// Firestore allows up to 30 values in an `in` filter; this is 13, and
// scripts/check-feed-categories.js fails if that stops being true.
export const MARKETPLACE_FEED_CATEGORIES = categories
  .map((item) => item.key)
  .filter((key) => !DIRECTORY_CATEGORIES.includes(key));

// Which categories ask for Bénin's administrative hierarchy below the
// commune: commune -> arrondissement -> quartier/village.
//
// Property had it first, because a flat in Godomey and a flat in Calavi
// centre are the same commune, an hour apart, and half the price. But the
// argument was never about property: it is about anything a buyer has to
// travel to and collect by hand. A pushchair, a fridge, a wardrobe — the
// question "is this on my side of Cotonou?" decides the sale, and
// "Cotonou" cannot answer it.
//
// So this is the list of categories where a seller is OFFERED the two
// extra levels. It is not a list of categories that require them: both
// levels are optional everywhere, property included.
//
// Deliberately absent, and each for its own reason rather than by
// oversight:
//
//   restaurants, services, events — these already ask where they are, in
//     their own free-text fields (`area` for the first two, `eventQuartier`
//     for the third). Offering the hierarchy as well would put two "where
//     exactly?" questions on one form, and the answer would land in
//     whichever field the seller happened to fill. Reconciling those three
//     fields is a decision of its own, not a side-effect of this list.
//   vehicles, agriculture, community — plausible, but nobody has asked,
//     and a vehicle is driven to the buyer rather than collected from a
//     quartier. Adding a key here is all it would take.
//   jobs — a job is advertised by commune. A quartier names the employer's
//     actual premises, which is more than a job ad should disclose.
//   pharmacyOnDuty — the roster is written by the ONPB importer, not by a
//     seller filling in this form. There is nobody to ask.
//
// scripts/check-listing-location.js pins this membership, in both
// directions, so a category joins or leaves by decision rather than by
// somebody editing an array in passing.
export const PRECISE_LOCALITY_CATEGORIES = new Set([
  "realEstate",
  "fashion",
  "babyKids",
  "electronics",
  "homeGarden",
  "furniture",
  "sports",
  "other",
]);
