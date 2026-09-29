// Where a restaurant lives online.
//
// Most places here have a Facebook or Instagram page long before they have
// a website, and a menu posted to a story is the menu. Asking only for a
// website would exclude the majority, so each channel is its own optional
// field and any one of them is enough.
// With the extension, so this module can be imported directly by the
// regression check as well as by Metro. Metro resolves both spellings.
import { POSTING_DIAL } from './countries.js';

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

// A number, and only a Benin one when nothing says otherwise.
//
// Derived from countries.js rather than written out again, so the app has
// one answer to "what country is a bare local number from?".
const BENIN_DIAL_DIGITS = POSTING_DIAL.replace(/\D/g, '');

// Long enough for any real profile URL and far short of what fits in a
// tappable row. A value past this is a paste accident or an attempt to hide
// something after the part a person can read.
const MAX_LINK_LENGTH = 300;

// The only two schemes a contact link may open.
//
// This is the whole point of the allow-list: `javascript:`, `data:`,
// `file:`, `intent:` and `content:` are all things Linking.openURL will
// happily hand to the platform. `http` stays in beside `https` because a
// small Beninese business site that has never had a certificate is a real
// thing and refusing it would break working listings to no security end —
// the risk here is a non-web scheme, not an unencrypted one.
const WEB_SCHEME = /^https?:\/\//i;
// user:pass@host. The visible part of the string says one host and the
// browser goes to another, which is the oldest phishing URL there is.
const HAS_CREDENTIALS = /^https?:\/\/[^/?#]*@/i;
// Anything non-printable, including the RTL override used to disguise an
// extension, plus whitespace that has no business inside a URL.
const UNSAFE_CHARS = /[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\ufeff]/;

// Where each branded channel is allowed to point.
//
// An Instagram glyph that opens somewhere else is not a broken link, it is
// a disguise: the icon is the claim, and the seller chooses the target. The
// alternates are the ones people actually paste from a phone — the mobile
// host, the short domain, the regional subdomain — so matching is on the
// registrable domain and any subdomain of it, never a prefix. That is what
// keeps `instagram.com.evil.example` out while letting `m.instagram.com`
// through.
//
// `website` is deliberately absent: a website may be any host. That is what
// the field means.
const BRAND_HOSTS = {
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  instagram: ['instagram.com', 'instagr.am'],
  tiktok: ['tiktok.com'],
};

function hostOf(url) {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  if (!match) return null;
  return match[1].toLowerCase().replace(/:\d+$/, '');
}

function hostIsAllowed(host, domains) {
  if (!host) return false;
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

// A full URL somebody typed or pasted, checked before it is handed to the
// platform. Returns the URL unchanged when it is safe, or null.
function safeUrl(url, kind) {
  if (url.length > MAX_LINK_LENGTH) return null;
  if (UNSAFE_CHARS.test(url)) return null;
  if (!WEB_SCHEME.test(url)) return null;
  // Subsumed today by the host-shape check below, which rejects the ':'
  // and '@' outright — mutation testing proves removing this line changes
  // no outcome. It stays because the two guard different things: loosen the
  // host pattern to admit a port or punycode and this becomes the only
  // thing standing between a seller and a URL that reads as one host and
  // opens another.
  if (HAS_CREDENTIALS.test(url)) return null;
  // A URL the app cannot name the host of is one it cannot vouch for.
  // "//evil.example/x" typed into the website field reached here as
  // "https:////evil.example/x" — which a browser resolves to evil.example
  // while this function could not see a host at all.
  const host = hostOf(url);
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) return null;
  const domains = BRAND_HOSTS[kind];
  if (domains && !hostIsAllowed(host, domains)) return null;
  return url;
}

// People type "@resto", "resto", "instagram.com/resto" or the full URL, and
// all four mean the same page. Stored as typed; turned into a real URL only
// when something is about to open it, so nothing is lost or guessed at
// write time.
//
// Every path out of here is either null or a http(s) URL this function
// built or checked, because the callers pass the result straight to
// Linking.openURL and the value came from a seller.
export function buildLinkUrl(kind, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value || value.length > MAX_LINK_LENGTH) return null;

  // WhatsApp first: it is a number, not a handle, so none of the URL
  // reasoning below applies to it.
  if (kind === 'whatsapp') {
    // This branch returns before any of the URL checking below, so it
    // states its own rule: a phone number is digits and punctuation. A
    // letter or a colon means something else was pasted. A dialling-scheme
    // prefix in front of the digits resolved to a working wa.me link, which
    // is harmless in itself but is not a shape this app has ever stored,
    // and accepting it means the branch accepts whatever else carries a
    // scheme.
    if (/[a-z:]/i.test(value)) return null;
    const cleaned = value.replace(/[^\d+]/g, '');
    const digits = cleaned.replace(/\D/g, '');
    // The original floor, kept: shorter than this is not a phone number
    // anywhere, and it is the check that caught a half-typed one.
    if (digits.length < 8) return null;
    let international;
    if (cleaned.startsWith('+')) {
      // Already international. It used to get 229 pasted on the front
      // regardless, so a Togolese +228 number became 22922890… and a French
      // +33 one 22933… — a real number, belonging to somebody else.
      international = digits;
    } else if (digits.startsWith(BENIN_DIAL_DIGITS)) {
      // Stored international without the plus. Every value written before
      // this function changed is one of these or a local one, and both must
      // keep resolving to exactly the number they resolved to before.
      international = digits;
    } else {
      // Written the local way, which in this app means Benin.
      international = `${BENIN_DIAL_DIGITS}${digits}`;
    }
    // E.164 allows fifteen digits. More is not a number.
    if (international.length > 15) return null;
    return `https://wa.me/${international}`;
  }

  if (WEB_SCHEME.test(value)) return safeUrl(value, kind);
  // A scheme this app will not open. Caught here rather than falling
  // through to the handle branches, where "mailto:x" would have been
  // turned into a profile path.
  // Also currently redundant: every scheme tried reaches null anyway, via
  // the handle-shape check or the host-shape one. It stays because those
  // two reject it as a side effect of being about something else, and a
  // reader should not have to prove that again.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  const handle = value.replace(/^@/, '').replace(/\/+$/, '');
  if (!handle || UNSAFE_CHARS.test(handle)) return null;

  if (kind === 'website') {
    // A bare domain needs a scheme; anything else here isn't openable.
    return /\./.test(handle) ? safeUrl(`https://${handle}`, kind) : null;
  }
  // Already a path on the right host, e.g. "instagram.com/resto".
  if (/\.[a-z]{2,}\//i.test(handle)) return safeUrl(`https://${handle}`, kind);

  // A bare handle. The host is ours to choose, so it is always the right
  // one — but the handle still has to look like a handle rather than a
  // path, a query or another host smuggled in.
  if (/[/?#@:]/.test(handle)) return null;
  // Through safeUrl like every other path, even though the host is one of
  // ours and cannot fail the host check. It is the length and character
  // checks that matter here: a 294-character handle is under the cap on its
  // own and over it once a host is prepended, and this branch was the one
  // way to build a URL without ever measuring the result.
  if (kind === 'facebook') return safeUrl(`https://facebook.com/${handle}`, kind);
  if (kind === 'instagram') return safeUrl(`https://instagram.com/${handle}`, kind);
  if (kind === 'tiktok') return safeUrl(`https://tiktok.com/@${handle}`, kind);
  return null;
}
