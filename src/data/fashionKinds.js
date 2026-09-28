// What kind of Fashion item this is, and whether it has a size at all.
//
// Fashion was the last large category with no branch of its own: a dress, a
// pair of shoes and a wax pagne all went through the generic goods form, and
// the only Fashion-aware line in the whole app told the seller to put the
// size in the TITLE — sellTitleHint_fashion read "e.g. Wax dress, size M".
// That is a workaround, and it costs on both sides: the size is unsearchable,
// unfilterable, invisible on the detail screen, and gone the moment a seller
// words the title differently.
//
// Same shape as babyKinds and sportsKinds, which already solved the smaller
// version of this: a kind that names its own extra field, so a bag is never
// asked for a size and a shoe always is.
//
// WHERE THIS DELIBERATELY STOPS.
//
// Children's and baby clothing is NOT here. babyKids is a top-level category
// with its own branch and its own size prompt, and babyKinds.js already warns
// what happens when two categories are plausible homes for one item: the
// seller picks either, and the buyer searching the other never sees it.
//
// Traditional wear and pagne have no body size. Fabric sells by the yard or
// by the pagne, which is a QUANTITY, not a size, and forcing it into a size
// field would produce "sizes: 6" meaning six yards. It is listed as a kind so
// it can be found, and asked nothing further until quantity is designed.
export const fashionKinds = [
  {
    key: 'clothing',
    icon: 'shirt-outline',
    color: '#C4478A',
    labelEn: 'Clothing',
    labelFr: 'Vêtements',
    sizeSystem: 'letter',
  },
  {
    key: 'shoes',
    icon: 'footsteps-outline',
    color: '#A0703F',
    labelEn: 'Shoes',
    labelFr: 'Chaussures',
    sizeSystem: 'eu',
  },
  {
    key: 'bags',
    icon: 'bag-handle-outline',
    color: '#6A5AE0',
    labelEn: 'Bags',
    labelFr: 'Sacs',
    sizeSystem: null,
  },
  {
    key: 'jewelry',
    icon: 'diamond-outline',
    color: '#D9A441',
    labelEn: 'Jewelry',
    labelFr: 'Bijoux',
    sizeSystem: null,
  },
  {
    key: 'traditional',
    icon: 'color-palette-outline',
    color: '#12908C',
    labelEn: 'Traditional & Pagne',
    labelFr: 'Tenues traditionnelles & Pagne',
    sizeSystem: null,
  },
  {
    key: 'accessories',
    icon: 'glasses-outline',
    color: '#2F6BB5',
    labelEn: 'Accessories',
    labelFr: 'Accessoires',
    sizeSystem: null,
  },
  {
    key: 'other',
    icon: 'ellipsis-horizontal-circle-outline',
    color: '#7C8794',
    labelEn: 'Other',
    labelFr: 'Autre',
    sizeSystem: null,
  },
];

// Letter sizes, the scale almost every garment sold here is labelled with.
//
// Numeric clothing sizes (FR 36–52) are deliberately NOT offered yet: a
// seller who has one would reach for "Other", and adding a second system
// means asking every clothing seller which scale they mean before they can
// answer the question they came to answer.
export const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Adult EU shoe sizes.
//
// NOT AN AUTHORITATIVE BÉNIN STANDARD, and nothing in this repository
// establishes one — unlike the commune and locality data, which come from
// INStaD. This is a conservative adult range chosen so that the common case
// needs no typing: 35 at the bottom covers smaller women's sizes, 48 at the
// top covers larger men's, and everything outside it — children's sizes, a
// 49, a US or UK label — goes through "Other" as free text rather than being
// guessed at here. Men's and women's are one list on purpose: the ranges
// overlap heavily and splitting them would double the taxonomy to remove
// nothing.
//
// If a sourced Béninese or West African convention is ever established, this
// is the one constant to change.
export const SHOE_SIZES_EU = Array.from({ length: 14 }, (_, i) => String(35 + i));

export function getFashionKind(key) {
  return fashionKinds.find((item) => item.key === key) ?? null;
}

export function getFashionKindLabel(key, language) {
  const kind = getFashionKind(key);
  if (!kind) return null;
  return language === 'en' ? kind.labelEn : kind.labelFr;
}

/** 'letter' | 'eu' | null — null means this kind is not sized and is asked nothing. */
export function getFashionSizeSystem(key) {
  return getFashionKind(key)?.sizeSystem ?? null;
}

/** The canonical sizes offered for a kind, or [] when it has none. */
export function fashionSizeOptions(key) {
  const system = getFashionSizeSystem(key);
  if (system === 'letter') return CLOTHING_SIZES;
  if (system === 'eu') return SHOE_SIZES_EU;
  return [];
}

/** How a stored size reads to a person: "M" stays "M", "40" becomes "EU 40". */
export function formatFashionSize(value, system) {
  return system === 'eu' ? `EU ${value}` : String(value);
}
