import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  POSTING_DIAL,
  findCountryByCode,
  findCountryByPhone,
} from "../data/countries";

// Who may publish a listing.
//
// Chez-Nous exists to show Bénin's businesses to people who cannot walk past
// them. Reading is therefore open to the whole world — browse, search, save,
// message, call — and writing is not: a listing may only be published from a
// Bénin number.
//
// The reason is verification rather than nationality. A +229 number is one
// the app can put an SMS through to, and a seller who can be reached is a
// seller who can be held to what they wrote. Numbers we cannot verify are
// where a marketplace's scams come from.
//
// The account's phone is derived from its sign-in identity, not from a
// profile field: sign-up creates the Firebase user with a pseudo-email built
// out of the verified number ("22901xxxxxxx@chez-nous.app"), so this reads
// something the account holder cannot edit. The same rule is enforced again
// in Firestore, where it actually binds — everything here is only so the app
// can explain itself before somebody fills in a form for nothing.

export function accountPhone(user) {
  if (!user?.email) return null;
  const [local] = user.email.split("@");
  if (!local || !/^\d+$/.test(local)) return null;
  return `+${local}`;
}

// Named for the reader, so parsed properly rather than matched on a prefix.
// Twenty-odd countries share +1, so a prefix match told a New Yorker their
// number was registered in Anguilla — true of the dial code, absurd on the
// screen. libphonenumber reads the area code and gets it right; the prefix
// match stays as the fallback for anything it cannot parse.
export function accountCountry(user) {
  const phone = accountPhone(user);
  if (!phone) return null;
  const parsed = parsePhoneNumberFromString(phone);
  const byParse = parsed?.country ? findCountryByCode(parsed.country) : null;
  return byParse ?? findCountryByPhone(phone);
}

export function canPublish(user) {
  const phone = accountPhone(user);
  return Boolean(phone && phone.startsWith(POSTING_DIAL));
}

// Signed out is not the same as barred: somebody with no account has a door
// in front of them, and the app should open it rather than explain a rule
// that may not even apply to them. Every posting entry point asks this to
// decide between the account gate and the country notice.
export function publishBlockReason(user) {
  if (!user) return "signedOut";
  return canPublish(user) ? null : "country";
}
