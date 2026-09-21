// The address a shared profile points at.
//
// Sharing a profile used to send a sentence and nothing else — "Have a look
// at Agossou on Chez-Nous" — which named somebody and gave the reader no way
// to reach them. Listings have had an address since the same complaint was
// made about them; profiles never got the other half, so the share was
// text-only by omission rather than by decision.
//
// The origin is imported rather than repeated. Two copies of a host name
// drift, and a share naming a host that hosting does not rewrite is a link
// that 404s for everybody who receives it.
import { LISTING_SITE_ORIGIN } from "./listingLink";

// Firebase Auth uids, and nothing else. A screen can hold a name without a
// uid behind it — a participant resolved out of a conversation, a seller
// decorated onto seeded data — and a link built from one of those points at
// a page that cannot exist.
//
// Deliberately loose on length and strict on characters, the same way
// listingShareUrl is: what matters is that nothing reaches the page
// function carrying a slash, a dot or a percent sign.
const UID_RE = /^[A-Za-z0-9]{20,128}$/;

export function profileShareUrl(uid) {
  return UID_RE.test(String(uid ?? ""))
    ? `${LISTING_SITE_ORIGIN}/s/${uid}`
    : null;
}

// The share message with its link, or the message alone when there is no
// honest link to give.
//
// Falling back to the bare sentence rather than suppressing the share: a
// profile with no resolvable uid is still worth telling somebody about, and
// that is exactly what the share did for everybody before this existed.
export function withProfileLink(message, uid) {
  const url = profileShareUrl(uid);
  return url ? `${message}\n\n${url}` : message;
}
