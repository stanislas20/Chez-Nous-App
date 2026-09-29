// A company's public contact details, ready to fill a listing form with.
//
// PURELY AN AUTHORING CONVENIENCE. Nothing here is read when a listing is
// displayed: the listing's own flat fields are the public values, and they
// stay that way. This exists so a garage that has already written its
// WhatsApp and its Instagram on its profile does not write them again on
// every tyre listing.
//
// ── The one field this must never touch ──────────────────────────────────
//
// sellerProfile.phone is the number the account was created with, and it IS
// the login: phoneToPseudoEmail turns it into the Firebase Auth identity.
// Copying it into a listing would publish a private credential, which is
// the whole defect the publicPhone separation exists to remove. So the only
// phone this reads is publicPhone — the number a company typed on purpose,
// knowing customers would see it.
//
// The function takes the profile rather than a phone, so the choice of
// which field to read lives in one place and can be asserted once.
// scripts/check-profile-contact.js proves `phone` is never reached.
// With the extension, so the regression check can import this directly as
// well as Metro. Metro resolves both spellings; Node only this one.
import { restaurantLinkKinds } from "../data/restaurantLinks.js";

// Driven off the shared taxonomy rather than a second list of channels, so
// a channel added there cannot be offered on the profile and silently
// missing from the defaults.
const LINK_KEYS = restaurantLinkKinds.map((kind) => kind.key);

// Anything that is not a non-empty string is not a contact detail. Same
// rule the link builder uses, for the same reason: a blank copied into a
// form reads as an answer the seller gave.
function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The profile's public channels, in the shape the publish form holds them:
 * a phone string and a map of link values.
 *
 * `phone` comes from publicPhone and from nowhere else. Channels the
 * company has not configured come back empty rather than absent, so
 * applying these to the form never leaves an input uncontrolled.
 */
export function profileContactDefaults(sellerProfile) {
  const source = sellerProfile ?? {};
  return {
    phone: clean(source.publicPhone),
    links: Object.fromEntries(LINK_KEYS.map((key) => [key, clean(source[key])])),
  };
}

/**
 * Whether there is anything worth offering.
 *
 * A company that has configured nothing must not be shown a control that
 * would fill the form with blanks — it reads as broken, and it invites a
 * tap that does nothing.
 */
export function hasProfileContact(sellerProfile) {
  const { phone, links } = profileContactDefaults(sellerProfile);
  return Boolean(phone) || Object.values(links).some(Boolean);
}
