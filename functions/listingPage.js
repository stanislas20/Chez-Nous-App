// The page a shared listing points at.
//
// Sharing used to send a sentence — "Toyota RAV4 2013 — 3 500 000 FCFA" —
// and nothing else. Whoever received it could read the price and had no way
// to see the thing: no photo, nothing to tap, no way to reach the seller.
// A share is meant to travel to someone who is not holding the app, and
// that message could not carry a listing to them.
//
// So a listing gets an address. It is served here rather than as a static
// page because WhatsApp, Messenger and iMessage build their preview cards
// by fetching the URL and reading the meta tags out of the HTML — they do
// not run JavaScript. A page that fetched the listing in the browser would
// look right when opened and paste into a chat as a bare grey link, which
// is the same failure in a nicer suit.
//
// What it will not do is show anything the app would not:
//
//   - Only `status: "approved"` renders. A listing waiting on a moderator,
//     or refused by one, is not public, and a link to it must not be the
//     way somebody discovers otherwise.
//   - A missing listing and a private one return the same 404 page. Telling
//     the difference would confirm that a given id exists.
//   - The seller's phone number is not on the page. In the app it sits
//     behind a sign-in; publishing it on an open URL would put every
//     seller's number in front of every scraper that follows a link.
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Where this is served from. Kept in step with src/utils/listingLink.js by
// scripts/check-listing-link.js — a share that names a different host than
// the one hosting rewrites to is a link that 404s for everybody.
const SITE_ORIGIN = "https://benin-marketplace-3eb04.web.app";
const SITE_NAME = "Chez-Nous";

// The scheme declared in app.json, and the path the app's linking config
// resolves — `cheznous://l/<id>` lands on ListingLinkScreen, which reads
// the listing and opens its detail screen.
//
// The id matters. Without it the button opened the app on its home screen
// with the listing nowhere in sight, which reads exactly like a link that
// does not work.
const APP_SCHEME = "cheznous://l/";

// Where somebody without the app is sent to get it.
//
// Null, and the page says nothing about installing — because today there is
// nothing true to say. The app is on neither store: Google Play answers 404
// for com.stanislas20.cheznous and the App Store lookup returns no result.
// A button promising a download that lands on an error page is worse than a
// page that never mentioned one. Set this to a real URL and the button
// appears on every listing at once.
const APP_DOWNLOAD_URL = null;

// Firestore ids are 20 characters of [A-Za-z0-9]; the bound is deliberately
// loose and the character class is not, so nothing reaches Firestore with a
// slash or a dot in it.
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

const priceFormatter = new Intl.NumberFormat("fr-FR");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A photograph taken on an iPhone arrives here as .heic, because that is
// what the phone stores and nothing in the upload converts it. The app
// renders it — Android and iOS both decode HEIC natively — and the web does
// not: Chrome, Firefox and every preview crawler WhatsApp and Facebook run
// show nothing at all for one. An og:image they cannot decode is worse than
// no og:image, which at least falls back to a text preview, so these are
// not offered to the page.
const WEB_SAFE_IMAGE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

// Only https, and only a host we put the file on. An image URL is written
// straight into the page and into og:image, so a listing carrying
// `javascript:` or a data URI would be writing markup on our domain.
function safeImageUrl(value) {
  const text = String(value ?? "").trim();
  if (!/^https:\/\//i.test(text)) return null;
  // Storage URLs carry the name in the path and a token in the query, so
  // the extension is tested before the `?`.
  if (!WEB_SAFE_IMAGE.test(new URL(text, "https://x").pathname)) return null;
  try {
    const { hostname } = new URL(text);
    return hostname.endsWith("googleapis.com") ||
      hostname.endsWith("firebasestorage.app") ||
      hostname.endsWith("gstatic.com")
      ? text
      : null;
  } catch {
    return null;
  }
}

// The cover, and never a video: a share card cannot play one, and a video
// URL in og:image renders as a broken image rather than as nothing.
function coverImage(listing) {
  if (listing.mediaType !== "video") {
    const cover = safeImageUrl(listing.mediaUrl);
    if (cover) return cover;
  }
  const items = Array.isArray(listing.media) ? listing.media : [];
  for (const item of items) {
    if (item?.mediaType === "video") continue;
    const url = safeImageUrl(item?.mediaUrl);
    if (url) return url;
  }
  return null;
}

function priceText(listing) {
  const value = Number(listing.price);
  // Mirrors src/utils/listingPrice.js: a price is a positive number or it is
  // absent, and absent is left unsaid. "0 FCFA" reads as free.
  if (Number.isFinite(value) && value > 0) {
    return `${priceFormatter.format(value)} FCFA`;
  }
  return listing.serviceRateType === "quote" ? "Sur devis" : null;
}

function shell({ title, description, image, canonical, body }) {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
  ]
    .filter(Boolean)
    .join("\n    ");

  // No external stylesheet, font or script: the page has to render on a
  // slow connection in Cotonou, and every extra host is another round trip
  // that can fail.
  return `<!doctype html>
<html lang="fr">
  <head>
    ${head}
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px 16px 48px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #f4f6f5;
        color: #14201b;
        display: flex;
        justify-content: center;
      }
      .card {
        width: 100%;
        max-width: 520px;
        background: #ffffff;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 12px 32px rgba(0, 60, 40, 0.12);
      }
      .cover { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #e6ebe8; }
      .body { padding: 20px; }
      .price { font-size: 26px; font-weight: 700; color: #00553a; margin: 0 0 6px; }
      h1 { font-size: 20px; line-height: 1.3; margin: 0 0 8px; }
      .meta { margin: 0 0 16px; color: #5c6b65; font-size: 15px; }
      .desc { margin: 0 0 20px; white-space: pre-wrap; line-height: 1.5; }
      .brand { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #00553a; margin: 0 0 16px; }
      .actions { display: flex; flex-direction: column; gap: 10px; margin: 22px 0 0; }
      .btn {
        display: block; text-align: center; text-decoration: none;
        padding: 14px 18px; border-radius: 999px; font-size: 16px; font-weight: 600;
        background: #00553a; color: #ffffff;
      }
      .btn.secondary { background: rgba(0, 85, 58, 0.08); color: #00553a; }
      /* Bénin: a green band on the hoist, yellow over red beside it. Drawn
         left-to-right in thirds it is Mali's flag, which is what this was. */
      .flag {
        width: 22px; height: 15px; border-radius: 3px; display: inline-block;
        background:
          linear-gradient(90deg, #008751 0 40%, transparent 40%),
          linear-gradient(180deg, #fcd116 0 50%, #e8112d 50%);
      }
      .note { margin: 20px auto 0; max-width: 520px; text-align: center; color: #5c6b65; font-size: 14px; }
      @media (prefers-color-scheme: dark) {
        body { background: #0e1512; color: #e8efeb; }
        .card { background: #16211d; box-shadow: none; }
        h1 { color: #e8efeb; }
        .price { color: #5fd0a3; }
        .meta, .note { color: #9bb0a7; }
        .btn { background: #1c7f5b; color: #ffffff; }
        .btn.secondary { background: rgba(95, 208, 163, 0.14); color: #5fd0a3; }
      }
    </style>
  </head>
  <body>
    <main class="card">${body}</main>
  </body>
</html>
`;
}

function notFoundPage(canonical) {
  return shell({
    title: `Annonce introuvable · ${SITE_NAME}`,
    description: "Cette annonce n’est plus en ligne.",
    image: null,
    canonical,
    body: `
      <div class="body">
        <p class="brand"><span class="flag"></span>${SITE_NAME}</p>
        <h1>Cette annonce n’est plus en ligne</h1>
        <p class="meta">Elle a peut-être été vendue, retirée par son auteur,
        ou elle n’a pas encore été publiée.</p>
      </div>`,
  });
}

// Whether one instance is kept warm.
//
// Measured on the deployed function: 39 seconds for the first request after
// an idle period, 75 milliseconds once warm. Nobody who taps a link in
// WhatsApp waits 39 seconds — they decide the link is broken, and they are
// not wrong. Hosting's CDN covers the second reader of any given listing
// for ten minutes (see the Cache-Control below); it is the first one, the
// person the sender actually meant to reach, who pays the cold start.
//
// Turning this on raises the floor of the monthly bill, because an instance
// that is always alive is always billed — Firebase refuses the deploy
// without --force for exactly that reason. It is a money decision, not a
// technical one, which is why it is a flag rather than a fait accompli:
//
//   const KEEP_WARM = true;
//   firebase deploy --only functions:listingPage --force
const KEEP_WARM = false;

exports.listingPage = onRequest(
  { maxInstances: 10, minInstances: KEEP_WARM ? 1 : 0 },
  async (req, res) => {
  // A page, and only a page. It answered POST and DELETE exactly as it
  // answered GET — harmless, since it changes nothing, and still an
  // invocation billed for a request that was never a reader.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).set("Allow", "GET, HEAD").end();
    return;
  }

  const id = decodeURIComponent(req.path.split("/").filter(Boolean).pop() ?? "");
  const canonical = `${SITE_ORIGIN}/l/${encodeURIComponent(id)}`;

  if (!ID_RE.test(id)) {
    res.status(404).set("Cache-Control", "public, max-age=300");
    res.send(notFoundPage(canonical));
    return;
  }

  let snapshot;
  try {
    snapshot = await admin.firestore().collection("listings").doc(id).get();
  } catch {
    // A read that failed is not a listing that does not exist — say so with
    // the status code, and do not cache it.
    res.status(503).set("Cache-Control", "no-store");
    res.send(notFoundPage(canonical));
    return;
  }

  const listing = snapshot.exists ? snapshot.data() : null;
  if (!listing || listing.status !== "approved") {
    res.status(404).set("Cache-Control", "public, max-age=300");
    res.send(notFoundPage(canonical));
    return;
  }

  const title = String(listing.titleFr || listing.titleEn || "").trim();
  const description = String(
    listing.descriptionFr || listing.descriptionEn || "",
  ).trim();
  const price = priceText(listing);
  const image = coverImage(listing);
  const where = [listing.quartier, listing.arrondissement, listing.city]
    .filter(Boolean)
    .join(" · ");

  // The preview card gets the price and the place, because that is what
  // decides whether somebody opens the link at all. The description follows
  // only if there is room for it.
  const summary = [price, where, description]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);

  const body = `
      ${image ? `<img class="cover" src="${escapeHtml(image)}" alt="${escapeHtml(title)}">` : ""}
      <div class="body">
        <p class="brand"><span class="flag"></span>${SITE_NAME}</p>
        ${price ? `<p class="price">${escapeHtml(price)}</p>` : ""}
        <h1>${escapeHtml(title)}</h1>
        ${where ? `<p class="meta">${escapeHtml(where)}</p>` : ""}
        ${description ? `<p class="desc">${escapeHtml(description.slice(0, 1200))}</p>` : ""}
        <p class="meta">Publiée sur ${SITE_NAME}, la petite annonce béninoise.</p>
        <div class="actions">
          <a class="btn" href="${APP_SCHEME}${encodeURIComponent(id)}">Ouvrir dans l’application</a>
          ${
            APP_DOWNLOAD_URL
              ? `<a class="btn secondary" href="${escapeHtml(APP_DOWNLOAD_URL)}">Installer ${SITE_NAME}</a>`
              : ""
          }
        </div>
      </div>`;

    res
      .status(200)
      .set("Cache-Control", "public, max-age=300, s-maxage=600")
      .set("Content-Type", "text/html; charset=utf-8");
    res.send(
      shell({
        // Joined rather than interpolated: nothing listing-shaped is
        // written into a template string in this file without escapeHtml
        // around it, and scripts/check-listing-link.js enforces that.
        title: [title, SITE_NAME].join(" · "),
        description: summary || title,
        image,
        canonical,
        body,
      }),
    );
  },
);
