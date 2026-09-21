// The page a shared profile points at.
//
// The companion of listingPage.js, and it exists for the same reason: a
// share travels to somebody who is not holding the app, and a sentence
// naming a person carries nothing they can act on. It is rendered on the
// server rather than in the browser because WhatsApp, Messenger and iMessage
// build their preview cards by fetching the URL and reading the meta tags —
// they do not run JavaScript, so a page that loaded its own data would look
// right when opened and paste into a chat as a bare grey link.
//
// WHAT IT READS DECIDES WHAT IT CAN LEAK. `sellers/{uid}` is the private
// document: it holds the phone number, the email, the verification
// documents. `sellerStats/{uid}` is the projection the app already shows to
// everybody — display name, photo, rating, counts — written by
// syncSellerPublicProfile. This page reads ONLY the projection. Not as a
// convenience: reading the private document here would publish, on an open
// URL with no sign-in, the phone number that the app deliberately keeps
// behind one.
//
// A uid that has no projection and a uid that does not exist return the
// same 404, so the page cannot be used to test whether an account exists.
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Kept in step with src/utils/profileLink.js by scripts/check-profile-link.js.
const SITE_ORIGIN = "https://benin-marketplace-3eb04.web.app";
const SITE_NAME = "Chez-Nous";

// `cheznous://s/<uid>` lands on ProfileLinkScreen, which opens the profile.
// Without the uid the app opens on its home screen with the person nowhere
// in sight, which reads exactly like a link that does not work.
const APP_SCHEME = "cheznous://s/";

// Null while the app is on neither store, exactly as listingPage.js has it:
// a button promising a download that lands on an error page is worse than a
// page that never mentioned one.
const APP_DOWNLOAD_URL = null;

const UID_RE = /^[A-Za-z0-9]{20,128}$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function notFoundPage() {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${SITE_NAME}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center;
    justify-content:center; background:#F6F7F5; color:#1B1B1B;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  p { max-width:28rem; padding:0 1.5rem; text-align:center; line-height:1.6; }
</style>
</head><body>
<p>Ce profil n'est plus en ligne.</p>
</body></html>`;
}

function profileHtml(uid, stats) {
  const name = escapeHtml(stats.displayName || "Profil");
  const photo = typeof stats.photoUrl === "string" ? stats.photoUrl : null;
  const rating = Number(stats.rating) || 0;
  const ratingCount = Number(stats.ratingCount) || 0;

  // Only what the app already shows on a profile card, and only when it is
  // real: a "0.0 ★ from 0 reviews" line reads as a bad review rather than as
  // an account nobody has rated yet.
  const ratingLine =
    ratingCount > 0
      ? `<p class="meta">${rating.toFixed(1)} ★ · ${ratingCount} avis</p>`
      : "";

  const description = ratingCount
    ? `${rating.toFixed(1)} ★ sur ${ratingCount} avis · ${SITE_NAME}`
    : `Voir ce profil sur ${SITE_NAME}`;

  const url = `${SITE_ORIGIN}/s/${encodeURIComponent(uid)}`;
  const ogImage = photo
    ? `<meta property="og:image" content="${escapeHtml(photo)}">
<meta name="twitter:card" content="summary_large_image">`
    : `<meta name="twitter:card" content="summary">`;

  const avatar = photo
    ? `<img class="avatar" src="${escapeHtml(photo)}" alt="">`
    : `<div class="avatar fallback">${escapeHtml(
        (stats.displayName || "?").trim().charAt(0).toUpperCase() || "?",
      )}</div>`;

  const install = APP_DOWNLOAD_URL
    ? `<a class="secondary" href="${escapeHtml(
        APP_DOWNLOAD_URL,
      )}">Installer l'application</a>`
    : "";

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} · ${SITE_NAME}</title>
<meta property="og:type" content="profile">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${name}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
${ogImage}
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center;
    justify-content:center; background:#F6F7F5; color:#1B1B1B;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .card { width:min(28rem,100%); margin:1.5rem; padding:2rem 1.5rem;
    background:#FFF; border-radius:1rem; text-align:center;
    box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06); }
  .avatar { width:112px; height:112px; border-radius:50%; object-fit:cover;
    display:block; margin:0 auto 1rem; background:#E7E9E6; }
  .fallback { display:flex; align-items:center; justify-content:center;
    background:#0B6E4F; color:#FFF; font-size:2.5rem; font-weight:700; }
  h1 { margin:0 0 .25rem; font-size:1.5rem; }
  .meta { margin:0 0 1.5rem; color:#5B615C; }
  a { display:block; padding:.85rem 1rem; border-radius:999px;
    text-decoration:none; font-weight:600; }
  .primary { background:#0B6E4F; color:#FFF; }
  .secondary { margin-top:.6rem; color:#0B6E4F; }
  @media (prefers-color-scheme: dark) {
    body { background:#121413; color:#F2F3F1; }
    .card { background:#1C1F1D; box-shadow:none; }
    .meta { color:#A0A6A1; }
    .secondary { color:#7FC3A8; }
  }
</style>
</head><body>
<div class="card">
  ${avatar}
  <h1>${name}</h1>
  ${ratingLine}
  <a class="primary" href="${APP_SCHEME}${encodeURIComponent(
    uid,
  )}">Ouvrir dans l'application</a>
  ${install}
</div>
</body></html>`;
}

exports.profilePage = onRequest(
  { region: "us-central1", invoker: "public" },
  async (req, res) => {
    // "/s/<uid>", and the rewrite guarantees the prefix.
    const id = String(req.path || "")
      .split("/")
      .filter(Boolean)
      .pop();

    if (!id || !UID_RE.test(id)) {
      res.status(404).set("Cache-Control", "public, max-age=300");
      res.send(notFoundPage());
      return;
    }

    let snapshot;
    try {
      snapshot = await admin.firestore().collection("sellerStats").doc(id).get();
    } catch {
      // A read that failed is not a profile that is missing, and saying so
      // would have this page answer a question about which uids exist.
      res.status(503).set("Cache-Control", "no-store");
      res.send(notFoundPage());
      return;
    }

    if (!snapshot.exists) {
      res.status(404).set("Cache-Control", "public, max-age=300");
      res.send(notFoundPage());
      return;
    }

    res.status(200).set("Cache-Control", "public, max-age=300");
    res.send(profileHtml(id, snapshot.data() ?? {}));
  },
);
