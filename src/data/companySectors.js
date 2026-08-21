// What line of business a company account is in, chosen at sign-up.
//
// Deliberately its own list rather than a reuse of categories.js: a sector
// is what a business *is*, a category is what a single listing is filed
// under, and the two only partly overlap. Every marketplace category a
// company could trade in appears here (a children's-clothing shop picks
// Baby & Kids, not "Retail" — the old six-item list forced exactly that
// kind of wrong answer), alongside sectors that have no marketplace
// category at all because they're services rather than goods: food,
// transport, trades, health, beauty, education.
//
// Same shape as categories.js / jobCategories.js — key plus Ionicons icon
// plus both labels — because the stored value is the KEY. Storing the
// rendered label instead, as this used to, meant an English sign-up and a
// French one recorded different strings for the same business, and neither
// could ever be re-translated or grouped.
//
// Each sector also carries its own colour, which is what turns a wall of
// nineteen identical grey rows into something scannable — you learn where
// your trade sits in the list by its colour long before you finish reading
// the labels. They're deliberately mid-luminance rather than the app's
// darker emerald/terracotta: the same hex has to stay legible both as a
// solid icon on a pale tint in light mode and on a dark surface, and very
// dark or very pale colours fail one side or the other.
export const companySectors = [
  { key: 'commerce', icon: 'storefront-outline', labelEn: 'Retail & Distribution', labelFr: 'Commerce & distribution', color: '#12876A' },
  { key: 'food', icon: 'restaurant-outline', labelEn: 'Food Service', labelFr: 'Restauration', color: '#D2603A' },
  { key: 'vehicles', icon: 'car-sport-outline', labelEn: 'Vehicles', labelFr: 'Véhicules', color: '#2F6BB5' },
  { key: 'realEstate', icon: 'home-outline', labelEn: 'Real Estate & Rentals', labelFr: 'Immobilier & Locations', color: '#12908C' },
  { key: 'electronics', icon: 'phone-portrait-outline', labelEn: 'Electronics', labelFr: 'Électronique', color: '#6A5AE0' },
  { key: 'fashion', icon: 'shirt-outline', labelEn: 'Fashion & Apparel', labelFr: 'Mode & Vêtements', color: '#C4478A' },
  { key: 'babyKids', icon: 'balloon-outline', labelEn: 'Baby & Kids', labelFr: 'Bébé & Enfants', color: '#E8768F' },
  { key: 'homeGarden', icon: 'flower-outline', labelEn: 'Home & Garden', labelFr: 'Maison & Jardin', color: '#5BA83A' },
  { key: 'furniture', icon: 'bed-outline', labelEn: 'Furniture', labelFr: 'Meubles', color: '#A0703F' },
  { key: 'sports', icon: 'football-outline', labelEn: 'Sports & Outdoors', labelFr: 'Sport & Plein air', color: '#EC8B2B' },
  { key: 'agriculture', icon: 'leaf-outline', labelEn: 'Agriculture', labelFr: 'Agriculture', color: '#8FA030' },
  { key: 'transport', icon: 'car-outline', labelEn: 'Transport & Logistics', labelFr: 'Transport & logistique', color: '#3D93BF' },
  { key: 'trades', icon: 'construct-outline', labelEn: 'Trades & Crafts', labelFr: 'Artisanat', color: '#B98A2A' },
  { key: 'health', icon: 'medkit-outline', labelEn: 'Health & Pharmacy', labelFr: 'Santé & pharmacie', color: '#D6455A' },
  { key: 'beauty', icon: 'cut-outline', labelEn: 'Beauty & Wellness', labelFr: 'Beauté & bien-être', color: '#A15AC4' },
  { key: 'education', icon: 'school-outline', labelEn: 'Education & Training', labelFr: 'Éducation & formation', color: '#4374C9' },
  { key: 'tech', icon: 'laptop-outline', labelEn: 'Technology', labelFr: 'Technologie', color: '#1A9AAC' },
  { key: 'services', icon: 'briefcase-outline', labelEn: 'Services & Consulting', labelFr: 'Services & conseil', color: '#6B7A94' },
  // Last on purpose, and never removed: without it a business whose trade
  // isn't listed has to claim one that's wrong, which is worse for the
  // registry than an honest "other".
  { key: 'other', icon: 'ellipsis-horizontal-outline', labelEn: 'Other', labelFr: 'Autre', color: '#8A929E' },
];

export function getCompanySector(key) {
  return companySectors.find((item) => item.key === key) ?? null;
}

export function getCompanySectorLabel(key, language) {
  const sector = getCompanySector(key);
  if (!sector) return null;
  return language === 'en' ? sector.labelEn : sector.labelFr;
}

// Sector colours are flat hex so they read identically in both themes; the
// soft chip behind each icon is that same hue at low alpha rather than a
// second hardcoded colour, so a palette change only ever needs one edit.
export function sectorTint(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
