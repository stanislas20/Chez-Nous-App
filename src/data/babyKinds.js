// What kind of baby or children's item this is.
//
// Like sports, this is genuinely second-hand goods, so condition and a
// single price are right and are kept. What the generic form missed is the
// attribute that decides whether a listing is even relevant to a buyer:
// age. A babygro is useless to someone with a two-year-old, and a toy rated
// 3+ is not something you hand a six-month-old.
//
// Which label that field carries depends on the kind — clothing is sized,
// toys carry a recommended age — so each kind names its own rather than
// forcing one vague "taille/âge" prompt on everything.
export const babyKinds = [
  {
    key: 'clothing',
    icon: 'shirt-outline',
    color: '#C4478A',
    labelEn: 'Clothing & shoes',
    labelFr: 'Vêtements & chaussures',
    detail: 'size',
  },
  {
    key: 'strollers',
    icon: 'walk-outline',
    color: '#2F6BB5',
    labelEn: 'Strollers & car seats',
    labelFr: 'Poussettes & sièges auto',
    detail: null,
  },
  {
    key: 'toys',
    icon: 'balloon-outline',
    color: '#EC8B2B',
    labelEn: 'Toys & learning',
    labelFr: 'Jouets & éveil',
    detail: 'age',
  },
  {
    // Deliberately NOT "furniture": that's a top-level category of its own,
    // and a kind by that name here would give a seller two plausible homes
    // for the same item. This covers only what is specific to a baby — a
    // cot, a changing table, a high chair. A child's wardrobe is just
    // furniture and belongs in that category.
    key: 'nursery',
    icon: 'bed-outline',
    color: '#A0703F',
    labelEn: 'Cots & nursery',
    labelFr: 'Lits bébé & chambre',
    detail: null,
  },
  {
    key: 'care',
    icon: 'nutrition-outline',
    color: '#12876A',
    labelEn: 'Feeding & care',
    labelFr: 'Repas & puériculture',
    detail: null,
  },
];

export function getBabyKind(key) {
  return babyKinds.find((item) => item.key === key) ?? null;
}

export function getBabyKindLabel(key, language) {
  const kind = getBabyKind(key);
  if (!kind) return null;
  return language === 'en' ? kind.labelEn : kind.labelFr;
}

// 'size' | 'age' | null — null means the kind needs no extra detail, and
// the field is hidden rather than shown empty and ignorable.
export function getBabyDetailKind(key) {
  return getBabyKind(key)?.detail ?? null;
}
