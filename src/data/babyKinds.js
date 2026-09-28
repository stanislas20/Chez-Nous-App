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

// ── Structured sizes for the clothing kind ────────────────────────────
//
// babyDetail was one free-text box for everything: "6 mois", "T. 24" and
// "2 ans" all went into the same string, so nothing could be counted,
// compared or eventually filtered. Worse, the kind is called "Clothing &
// shoes" and those two do not share a scale at all — an age band and a shoe
// number were being asked for with one prompt.
//
// So the kind gains a SUBTYPE. The kind key itself is untouched: thousands
// of listings carry babyKind "clothing", and renaming it would orphan every
// one of them from its own category. The subtype sits underneath it.
export const babyItemSubtypes = [
  {
    key: 'clothing',
    icon: 'shirt-outline',
    labelEn: 'Clothing',
    labelFr: 'Vêtements',
    sizeSystem: 'age',
  },
  {
    key: 'shoes',
    icon: 'footsteps-outline',
    labelEn: 'Shoes',
    labelFr: 'Chaussures',
    sizeSystem: 'eu',
  },
];

// Age bands, stored as a STABLE KEY rather than a label.
//
// "0–3 months" and "0–3 mois" are the same size, and a listing published in
// French has to read correctly to an English buyer. Storing the rendered
// label would freeze the seller's language into the document; storing '0-3m'
// does not. Same reason the commune hierarchy stores p-codes.
export const BABY_AGE_SIZES = [
  { key: '0-3m', labelEn: '0–3 months', labelFr: '0–3 mois' },
  { key: '3-6m', labelEn: '3–6 months', labelFr: '3–6 mois' },
  { key: '6-9m', labelEn: '6–9 months', labelFr: '6–9 mois' },
  { key: '9-12m', labelEn: '9–12 months', labelFr: '9–12 mois' },
  { key: '12-18m', labelEn: '12–18 months', labelFr: '12–18 mois' },
  { key: '18-24m', labelEn: '18–24 months', labelFr: '18–24 mois' },
  { key: '2-3y', labelEn: '2–3 years', labelFr: '2–3 ans' },
  { key: '3-4y', labelEn: '3–4 years', labelFr: '3–4 ans' },
  { key: '4-5y', labelEn: '4–5 years', labelFr: '4–5 ans' },
  { key: '5-6y', labelEn: '5–6 years', labelFr: '5–6 ans' },
  { key: '6-8y', labelEn: '6–8 years', labelFr: '6–8 ans' },
  { key: '8-10y', labelEn: '8–10 years', labelFr: '8–10 ans' },
  { key: '10-12y', labelEn: '10–12 years', labelFr: '10–12 ans' },
];

// Children's EU shoe sizes.
//
// AN APP-SUPPORTED RANGE, NOT A SOURCED STANDARD. Nothing in this repository
// establishes a Béninese or West African children's convention, and the only
// prior art here is a placeholder that read "EU 24". 16 is about the
// smallest infant shoe sold; 34 is one below where the adult list in
// fashionKinds.js begins, so the two meet without overlapping and without a
// gap. Anything outside it — a 35 on a older child, a US label — goes through
// "Other" as free text rather than being guessed at here.
export const BABY_SHOE_SIZES_EU = Array.from({ length: 19 }, (_, i) =>
  String(16 + i),
);

export function getBabyItemSubtype(key) {
  return babyItemSubtypes.find((item) => item.key === key) ?? null;
}

export function getBabyItemSubtypeLabel(key, language) {
  const subtype = getBabyItemSubtype(key);
  if (!subtype) return null;
  return language === 'en' ? subtype.labelEn : subtype.labelFr;
}

/** 'age' | 'eu' | null — the scale this subtype is measured on. */
export function getBabySizeSystem(key) {
  return getBabyItemSubtype(key)?.sizeSystem ?? null;
}

/** Canonical size keys for a subtype, or [] when there is no subtype yet. */
export function babySizeOptions(key) {
  const system = getBabySizeSystem(key);
  if (system === 'age') return BABY_AGE_SIZES.map((item) => item.key);
  if (system === 'eu') return BABY_SHOE_SIZES_EU;
  return [];
}

/** How a stored size reads to a person, in their language. */
export function formatBabySize(value, system, language) {
  if (system === 'eu') return `EU ${value}`;
  const band = BABY_AGE_SIZES.find((item) => item.key === value);
  if (!band) return String(value);
  return language === 'en' ? band.labelEn : band.labelFr;
}
