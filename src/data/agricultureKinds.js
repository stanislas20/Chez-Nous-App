// Agriculture is the one category that genuinely contains both goods and
// produce, and the item-for-sale form served neither well: it asked what
// condition a sack of maize is in, and priced a herd of goats as a single
// lump sum.
//
// The kind chosen here drives two things the generic form got wrong:
//
//   - Condition only applies to `equipment`. A tractor can be "Comme neuf";
//     a tomato cannot.
//   - The price unit differs per kind. Produce sells by weight or by sack,
//     livestock by head, equipment as one item.
//
// `units` lists what's sensible for each kind rather than offering all of
// them everywhere — "par tête" on a bag of fertiliser is noise, and a
// shorter list of right answers is faster to pick from than a long list of
// mostly-wrong ones.
export const agricultureKinds = [
  {
    key: 'produce',
    icon: 'nutrition-outline',
    color: '#5BA83A',
    labelEn: 'Crops & produce',
    labelFr: 'Récoltes & produits',
    units: ['perKg', 'perBag', 'perUnit', 'total'],
  },
  {
    key: 'livestock',
    icon: 'paw-outline',
    color: '#B98A2A',
    labelEn: 'Livestock & poultry',
    labelFr: 'Bétail & volaille',
    units: ['perHead', 'total'],
  },
  {
    key: 'equipment',
    icon: 'construct-outline',
    color: '#2F6BB5',
    labelEn: 'Equipment & tools',
    labelFr: 'Matériel & outils',
    units: ['total'],
  },
  {
    key: 'inputs',
    icon: 'flask-outline',
    color: '#A15AC4',
    labelEn: 'Seeds & inputs',
    labelFr: 'Semences & intrants',
    units: ['perKg', 'perBag', 'perUnit', 'total'],
  },
];

// Suffix keys live in translations so "kg" and "sac" can differ per
// language; the unit key itself is what gets stored on the listing.
export const agricultureUnits = [
  { key: 'perKg', labelEn: 'Per kilo', labelFr: 'Par kilo' },
  { key: 'perBag', labelEn: 'Per bag', labelFr: 'Par sac' },
  { key: 'perUnit', labelEn: 'Per piece', labelFr: 'Par pièce' },
  { key: 'perHead', labelEn: 'Per head', labelFr: 'Par tête' },
  { key: 'total', labelEn: 'Total price', labelFr: 'Prix total' },
];

export function getAgricultureKind(key) {
  return agricultureKinds.find((item) => item.key === key) ?? null;
}

export function getAgricultureKindLabel(key, language) {
  const kind = getAgricultureKind(key);
  if (!kind) return null;
  return language === 'en' ? kind.labelEn : kind.labelFr;
}

export function getAgricultureUnitsFor(kindKey) {
  const kind = getAgricultureKind(kindKey);
  if (!kind) return [];
  return agricultureUnits.filter((unit) => kind.units.includes(unit.key));
}

export function getAgricultureUnitLabel(key, language) {
  const unit = agricultureUnits.find((item) => item.key === key);
  if (!unit) return null;
  return language === 'en' ? unit.labelEn : unit.labelFr;
}

// Only equipment wears out, so it's the only kind a condition means
// anything for.
export function agricultureKindHasCondition(key) {
  return key === 'equipment';
}
