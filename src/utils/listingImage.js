// Which copy of a picture a card should draw.
//
// Since the upload started writing a small copy beside the full one, every
// listing carries two URLs, and the difference between them is the whole
// point: about 45 KB against about 250 KB, multiplied by every card on
// every screen for every reader on a connection they pay for by the
// megabyte.
//
// The fallback chain is what makes this safe to use everywhere. Listings
// published before the thumbnail existed have no `thumbUrl` and never will,
// so they fall through to the full picture and look exactly as they did.
// `image` at the end is the seeded/demo shape, which predates both.
export function smallImageUri(source) {
  return source?.thumbUrl ?? source?.mediaUrl ?? source?.image ?? null;
}

// A photograph this app can actually put on screen.
//
// React Native's image pipeline has no HEIF decoder on Android, and an
// iPhone stores its photographs as .heic. Measured, not assumed: the hero
// on a listing whose cover is a .heic is 98% one flat colour — the empty
// placeholder — while the next slide, a .jpg from the same listing, draws
// normally. Nothing errors. There is no broken-image icon. The card simply
// looks like a photo that has not finished loading, forever.
//
// Uploads have been re-encoded to JPEG since the downscale went in, so this
// only concerns what was published before that. Those files are skipped
// rather than drawn, so a listing shows its first photograph that works
// instead of a grey rectangle — and if a listing has nothing else, the
// category placeholder says what it is instead of showing nothing at all.
//
// Deleting this means restoring blank cards. The way to stop needing it is
// to convert what is already in Storage, not to draw HEIC anyway.
const UNDRAWABLE = /\.(heic|heif)$/i;

export function canDraw(url) {
  if (!url) return false;
  // Storage URLs carry the file name in the path and a token in the query.
  const withoutQuery = String(url).split("?")[0];
  return !UNDRAWABLE.test(withoutQuery);
}

// The media a listing can actually show, in the seller's own order. Videos
// keep their place: they are played, not decoded as stills.
export function drawableMedia(media) {
  return (Array.isArray(media) ? media : []).filter(
    (item) =>
      item?.mediaType === "video" || canDraw(item?.thumbUrl ?? item?.mediaUrl),
  );
}
