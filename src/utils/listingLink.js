// The address a shared listing points at.
//
// A share used to be a sentence and nothing else — "Toyota RAV4 2013 —
// 3 500 000 FCFA" — which told the person receiving it what something cost
// and gave them no way to see it, no photo, and nothing to tap. Whoever it
// reached had to already have the app, know where to look, and search for
// the title by hand.
//
// The page on the other end is served by functions/listingPage.js. The two
// halves have to name the same host, so scripts/check-listing-link.js reads
// both and fails if they drift: a share naming a host that hosting does not
// rewrite is a link that 404s for everybody who receives it.
export const LISTING_SITE_ORIGIN = "https://benin-marketplace-3eb04.web.app";

// Firestore ids only. A screen can hold listings that never came from
// Firestore — the preview card in the sell form, a job normalised out of
// seeded data — and a link to one of those is a link to a page that cannot
// exist.
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function listingShareUrl(id) {
  return ID_RE.test(String(id ?? "")) ? `${LISTING_SITE_ORIGIN}/l/${id}` : null;
}

// The share message with its link, or the message alone when there is no
// honest link to give.
//
// A listing that a moderator has not approved yet is not on the web — the
// page returns "no longer online" for it, deliberately, so that a link
// cannot be used to find out whether a pending id exists. Mes annonces is
// the one screen that shows those, so it is the one place this matters, and
// the rule lives here rather than there: only a status that is known and is
// not "approved" suppresses the link, so screens that carry no status field
// at all (an event decorated out of a listing, say) still get one.
export function withListingLink(message, listing) {
  if (listing?.status && listing.status !== "approved") return message;
  const url = listingShareUrl(listing?.id);
  return url ? `${message}\n\n${url}` : message;
}
