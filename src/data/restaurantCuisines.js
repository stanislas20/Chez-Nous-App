// Cuisine filters for the Restaurants screen. Icons and colours follow the
// same convention as the listing-category pickers so the two read as one
// design language rather than two.
//
// 'all' is deliberately part of the list rather than a separate control:
// it's the default state, and having it sit as the first chip means
// clearing a filter is the same gesture as setting one.
// `deep` is the far end of the card's thumbnail gradient. The mockup renders
// every image placeholder as a two-stop gradient rather than a flat block,
// and a photo-less directory needs that depth more than a photo-rich one
// does — a flat tinted square reads as a missing image.
export const restaurantCuisines = [
  { key: 'all', icon: 'sparkles-outline', color: '#0B6E4F', deep: '#063d2c', labelEn: 'All', labelFr: 'Tous' },
  { key: 'beninese', icon: 'restaurant-outline', color: '#12876A', deep: '#0a4a3a', labelEn: 'Beninese', labelFr: 'Béninoise' },
  { key: 'grill', icon: 'flame-outline', color: '#D2603A', deep: '#7a2f1a', labelEn: 'Grills', labelFr: 'Grillades' },
  { key: 'fish', icon: 'fish-outline', color: '#2F6BB5', deep: '#1d3a52', labelEn: 'Fish', labelFr: 'Poissons' },
  { key: 'lebanese', icon: 'nutrition-outline', color: '#B98A2A', deep: '#6b4f14', labelEn: 'Lebanese', labelFr: 'Libanaise' },
  { key: 'pizza', icon: 'pizza-outline', color: '#EC8B2B', deep: '#8a4c12', labelEn: 'Pizza', labelFr: 'Pizza' },
  { key: 'fastFood', icon: 'fast-food-outline', color: '#A15AC4', deep: '#5c2e75', labelEn: 'Fast food', labelFr: 'Fast-food' },
];

// Falls back to the emerald pair so a cuisine added later without a `deep`
// still renders a gradient rather than an invisible one.
export function getCuisineGradient(key) {
  const cuisine = restaurantCuisines.find((item) => item.key === key);
  return [cuisine?.color ?? '#0B6E4F', cuisine?.deep ?? '#063d2c'];
}

export function getCuisineLabel(key, language) {
  const cuisine = restaurantCuisines.find((item) => item.key === key);
  if (!cuisine) return null;
  return language === 'en' ? cuisine.labelEn : cuisine.labelFr;
}

export function getCuisine(key) {
  return restaurantCuisines.find((item) => item.key === key) ?? null;
}

// Price bands rather than an exact range: "3 000 – 6 000 FCFA" reads as a
// verified menu price, which is not something we have. A band is an honest
// summary a diner can still filter on.
// `hint` is guidance for the person posting, shown only in the form. It is
// never published on a card: the amounts are a rule of thumb to help an
// owner pick the right band, not a menu price the app would be asserting to
// diners. What gets published stays the band alone.
export const priceBands = [
  {
    key: 'budget',
    symbol: '₣',
    labelEn: 'Budget',
    labelFr: 'Économique',
    hintEn: 'under 2 000 F a head',
    hintFr: 'moins de 2 000 F par personne',
  },
  {
    key: 'mid',
    symbol: '₣₣',
    labelEn: 'Mid-range',
    labelFr: 'Intermédiaire',
    hintEn: '2 000 – 6 000 F a head',
    hintFr: '2 000 à 6 000 F par personne',
  },
  {
    key: 'high',
    symbol: '₣₣₣',
    labelEn: 'Upscale',
    labelFr: 'Haut de gamme',
    hintEn: 'over 6 000 F a head',
    hintFr: 'plus de 6 000 F par personne',
  },
];

export function getPriceBandHint(key, language) {
  const band = priceBands.find((item) => item.key === key);
  if (!band) return null;
  return language === 'en' ? band.hintEn : band.hintFr;
}

export function getPriceBandSymbol(key) {
  return priceBands.find((item) => item.key === key)?.symbol ?? '';
}

export function getPriceBandLabel(key, language) {
  const band = priceBands.find((item) => item.key === key);
  if (!band) return null;
  return language === 'en' ? band.labelEn : band.labelFr;
}

export const RESTAURANT_SORTS = ['distance', 'name', 'price'];
