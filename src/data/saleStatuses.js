// What a listing's status is called, which is not the same sentence for
// everything the app carries.
//
// The four states — available, pending, negotiating, sold — were written for
// goods, and their labels say so: "À vendre", "Vente en attente", "Vendu".
// That is right for a fridge and wrong for a plumber. Someone offering a
// service is not for sale, and being told their own listing says "À vendre"
// is the app misdescribing what they published.
//
// Same states underneath, so nothing in Firestore or the dashboard changes —
// only the words shown to a human.
const GOODS_LABEL_KEYS = {
  available: "saleStatusAvailable",
  pending: "saleStatusPending",
  negotiating: "saleStatusNegotiating",
  sold: "saleStatusSold",
};

const OFFER_LABEL_KEYS = {
  available: "offerStatusAvailable",
  pending: "offerStatusPending",
  negotiating: "offerStatusNegotiating",
  sold: "offerStatusEnded",
};

// Categories where nothing changes hands for money in the way "sold" means.
// A service is offered, a job is open, a community post is an announcement —
// none of them is stock.
const OFFER_CATEGORIES = new Set([
  "services",
  "jobs",
  "community",
  "restaurants",
  "pharmacyOnDuty",
]);

export function saleStatusLabelKey(categoryKey, saleStatus) {
  const table = OFFER_CATEGORIES.has(categoryKey)
    ? OFFER_LABEL_KEYS
    : GOODS_LABEL_KEYS;
  return table[saleStatus] ?? table.available;
}

// What the person behind a listing is called.
//
// "Vendeur" is right above a fridge and wrong above a mechanic: nothing is
// being sold, a service is being offered. Same card, same person, different
// noun — and getting it wrong tells a provider the app has misunderstood
// what they published.
const SELLER_ROLE_KEYS = {
  services: "roleProvider",
  jobs: "roleEmployer",
  restaurants: "roleVenue",
  community: "roleAuthor",
  pharmacyOnDuty: "roleVenue",
};

export function sellerRoleLabelKey(categoryKey) {
  return SELLER_ROLE_KEYS[categoryKey] ?? "productDetailSellerTitle";
}

const CONTACT_BUTTON_KEYS = {
  services: "contactProviderButton",
  jobs: "contactEmployerButton",
  restaurants: "contactVenueButton",
  community: "contactAuthorButton",
  pharmacyOnDuty: "contactVenueButton",
};

export function contactButtonLabelKey(categoryKey) {
  return CONTACT_BUTTON_KEYS[categoryKey] ?? "productDetailContactButton";
}

export function isOfferCategory(categoryKey) {
  return OFFER_CATEGORIES.has(categoryKey);
}
