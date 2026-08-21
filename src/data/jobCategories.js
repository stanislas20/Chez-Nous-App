// Job fields, distinct from the marketplace listing categories
// (categories.js) — Ionicons instead of emoji to stay visually consistent
// with the rest of the app's category chips (MoreScreen,
// CategoryListingsScreen, etc.).
//
// Colours follow the same reasoning as companySectors.js: mid-luminance
// hexes that stay legible both as a solid icon on a pale tint in light mode
// and against a dark surface, so one value works in both themes.
//
// The list covers the fields people actually hire for here, not an abridged
// sample — a job that has no honest home in this list gets filed under a
// wrong one, which quietly breaks browsing by field for everyone.
export const jobCategories = [
  { key: 'commerce', icon: 'storefront-outline', color: '#12876A', labelEn: 'Retail', labelFr: 'Commerce' },
  { key: 'food', icon: 'restaurant-outline', color: '#D2603A', labelEn: 'Food Service', labelFr: 'Restauration' },
  { key: 'transport', icon: 'car-outline', color: '#3D93BF', labelEn: 'Transport', labelFr: 'Transport' },
  { key: 'trades', icon: 'construct-outline', color: '#B98A2A', labelEn: 'Trades', labelFr: 'Métiers' },
  { key: 'construction', icon: 'hammer-outline', color: '#A0703F', labelEn: 'Construction', labelFr: 'BTP & Construction' },
  { key: 'agriculture', icon: 'leaf-outline', color: '#8FA030', labelEn: 'Agriculture', labelFr: 'Agriculture' },
  { key: 'health', icon: 'medkit-outline', color: '#D6455A', labelEn: 'Health', labelFr: 'Santé' },
  { key: 'education', icon: 'school-outline', color: '#4374C9', labelEn: 'Education', labelFr: 'Éducation' },
  { key: 'tech', icon: 'laptop-outline', color: '#1A9AAC', labelEn: 'Technology', labelFr: 'Technologie' },
  { key: 'admin', icon: 'document-text-outline', color: '#6B7A94', labelEn: 'Admin & Office', labelFr: 'Administration' },
  { key: 'finance', icon: 'cash-outline', color: '#2F6BB5', labelEn: 'Finance', labelFr: 'Finance & Comptabilité' },
  { key: 'beauty', icon: 'cut-outline', color: '#A15AC4', labelEn: 'Beauty & Wellness', labelFr: 'Beauté & bien-être' },
  { key: 'security', icon: 'shield-checkmark-outline', color: '#5A6B7D', labelEn: 'Security', labelFr: 'Sécurité' },
  { key: 'domestic', icon: 'home-outline', color: '#C4788A', labelEn: 'Domestic Work', labelFr: 'Services à domicile' },
  { key: 'logistics', icon: 'cube-outline', color: '#7A6BC4', labelEn: 'Logistics', labelFr: 'Logistique' },
  { key: 'hospitality', icon: 'bed-outline', color: '#C4478A', labelEn: 'Hospitality', labelFr: 'Hôtellerie' },
  { key: 'media', icon: 'camera-outline', color: '#E08A2B', labelEn: 'Media & Creative', labelFr: 'Médias & Création' },
  // Last and never removed — a field that isn't listed is better filed
  // honestly than forced into the nearest wrong one.
  { key: 'other', icon: 'ellipsis-horizontal-outline', color: '#8A929E', labelEn: 'Other', labelFr: 'Autre' },
];

export function getJobCategory(key) {
  return jobCategories.find((item) => item.key === key) ?? null;
}

export function getJobCategoryLabel(key, language) {
  const category = getJobCategory(key);
  if (!category) return null;
  return language === 'en' ? category.labelEn : category.labelFr;
}
