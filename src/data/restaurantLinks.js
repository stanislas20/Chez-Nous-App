// Where a restaurant lives online.
//
// Most places here have a Facebook or Instagram page long before they have
// a website, and a menu posted to a story is the menu. Asking only for a
// website would exclude the majority, so each channel is its own optional
// field and any one of them is enough.
export const restaurantLinkKinds = [
  {
    // A number, not a handle — and deliberately offered to businesses only.
    // A wa.me link embeds the phone number in plain sight, which is fine for
    // a business publishing a contact point and wrong for a private seller,
    // whose personal number would then be public and unrevocable. Individuals
    // keep the in-app chat.
    key: 'whatsapp',
    icon: 'logo-whatsapp',
    color: '#25D366',
    labelEn: 'WhatsApp',
    labelFr: 'WhatsApp',
    placeholder: '01 23 45 67 89',
  },
  {
    key: 'website',
    icon: 'globe-outline',
    color: '#0B6E4F',
    labelEn: 'Website',
    labelFr: 'Site web',
    placeholder: 'exemple.bj',
  },
  {
    key: 'facebook',
    icon: 'logo-facebook',
    // Each channel wears its own brand colour rather than four identical
    // grey glyphs — it's what makes the row identifiable before the label
    // is read.
    color: '#1877F2',
    labelEn: 'Facebook',
    labelFr: 'Facebook',
    placeholder: 'MonRestaurant',
  },
  {
    key: 'instagram',
    icon: 'logo-instagram',
    color: '#E1306C',
    labelEn: 'Instagram',
    labelFr: 'Instagram',
    placeholder: '@monrestaurant',
  },
  {
    key: 'tiktok',
    icon: 'logo-tiktok',
    color: '#EE1D52',
    labelEn: 'TikTok',
    labelFr: 'TikTok',
    placeholder: '@monrestaurant',
  },
];

export function getLinkKindLabel(key, language) {
  const kind = restaurantLinkKinds.find((item) => item.key === key);
  if (!kind) return null;
  return language === 'en' ? kind.labelEn : kind.labelFr;
}

// People type "@resto", "resto", "instagram.com/resto" or the full URL, and
// all four mean the same page. Stored as typed; turned into a real URL only
// when something is about to open it, so nothing is lost or guessed at
// write time.
export function buildLinkUrl(kind, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) return value;

  const handle = value.replace(/^@/, '').replace(/\/+$/, '');
  if (!handle) return null;

  // WhatsApp wants digits only, in international form. Benin numbers are
  // written locally ("01 23 45 67 89"), so the country code is added when
  // it's missing rather than making people know the format.
  if (kind === 'whatsapp') {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 8) return null;
    const international = digits.startsWith('229') ? digits : `229${digits}`;
    return `https://wa.me/${international}`;
  }

  if (kind === 'website') {
    // A bare domain needs a scheme; anything else here isn't openable.
    return /\./.test(handle) ? `https://${handle}` : null;
  }
  // Already a path on the right host, e.g. "instagram.com/resto".
  if (/\.[a-z]{2,}\//i.test(handle)) return `https://${handle}`;

  if (kind === 'facebook') return `https://facebook.com/${handle}`;
  if (kind === 'instagram') return `https://instagram.com/${handle}`;
  if (kind === 'tiktok') return `https://tiktok.com/@${handle}`;
  return null;
}
