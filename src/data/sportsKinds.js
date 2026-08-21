// What kind of sports or outdoor item this is.
//
// Unlike services or community posts, this category really is second-hand
// goods, so condition and a single price genuinely apply and are kept. The
// gap was elsewhere: "Sport & Plein air" spans a road bike, a pair of
// running shoes, a tent and a set of weights, and the generic form gave a
// buyer no way to tell those apart beyond reading the title.
//
// The kind also decides whether size is asked for. Listing football boots
// without saying they're a 42 is the single most common reason a sports
// listing gets a message that just says "quelle taille ?" — so the form
// asks once, up front, instead of leaving it to the chat.
export const sportsKinds = [
  {
    key: 'apparel',
    icon: 'shirt-outline',
    color: '#C4478A',
    labelEn: 'Clothing & footwear',
    labelFr: 'Vêtements & chaussures',
    needsSize: true,
  },
  {
    key: 'bikes',
    icon: 'bicycle-outline',
    color: '#2F6BB5',
    labelEn: 'Bikes & scooters',
    labelFr: 'Vélos & trottinettes',
    needsSize: false,
  },
  {
    key: 'fitness',
    icon: 'barbell-outline',
    color: '#12876A',
    labelEn: 'Fitness & weights',
    labelFr: 'Fitness & musculation',
    needsSize: false,
  },
  {
    key: 'camping',
    icon: 'bonfire-outline',
    color: '#EC8B2B',
    labelEn: 'Camping & outdoors',
    labelFr: 'Camping & plein air',
    needsSize: false,
  },
  {
    key: 'gear',
    icon: 'basketball-outline',
    color: '#A15AC4',
    labelEn: 'Equipment & accessories',
    labelFr: 'Équipement & accessoires',
    needsSize: false,
  },
];

export function getSportsKind(key) {
  return sportsKinds.find((item) => item.key === key) ?? null;
}

export function getSportsKindLabel(key, language) {
  const kind = getSportsKind(key);
  if (!kind) return null;
  return language === 'en' ? kind.labelEn : kind.labelFr;
}

// Free text rather than a picker: shoe sizes, clothing sizes and kids'
// sizes don't share one scale, and "42", "M" and "10 ans" are all correct
// answers depending on the item.
export function sportsKindNeedsSize(key) {
  return !!getSportsKind(key)?.needsSize;
}
