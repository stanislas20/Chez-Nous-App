// A shared listing has to land on a page that exists.
//
// The share message and the page that answers it are written in three
// different places — the app builds the URL, firebase.json decides which
// paths reach the function, and the function builds the canonical URL it
// puts in the preview card. Any two of them can agree while the third
// drifts, and the failure is invisible from inside the app: the share sheet
// opens, the message sends, and the person on the other end gets a 404.
// Nothing in the app ever finds out.
//
// So the three are read and compared here.
//
// Run: node scripts/check-listing-link.js
const fs = require("fs");
const path = require("path");

const failures = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

const read = (relative) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const app = read("src/utils/listingLink.js");
const fn = read("functions/listingPage.js");
const hosting = JSON.parse(read("firebase.json")).hosting;

// ── The two halves name the same host ─────────────────────────────────
const appOrigin = /LISTING_SITE_ORIGIN = "([^"]+)"/.exec(app)?.[1];
const fnOrigin = /SITE_ORIGIN = "([^"]+)"/.exec(fn)?.[1];
check("the app names an origin", Boolean(appOrigin), true);
check("the page and the app agree on the origin", fnOrigin, appOrigin);
check("the origin is https", /^https:\/\//.test(appOrigin ?? ""), true);
check("the origin carries no trailing slash", /\/$/.test(appOrigin ?? ""), false);

// ── Hosting routes the path the app shares ────────────────────────────
//
// The app shares `/l/<id>`. If the rewrite were `/listing/**`, every link
// already sent would keep 404ing forever — the messages are out of our
// hands the moment they are sent, so this pair is not free to change.
const pathInApp = /\$\{LISTING_SITE_ORIGIN\}(\/[a-z]+)\//.exec(app)?.[1];
check("the app shares /l/<id>", pathInApp, "/l");
check("hosting exists", Boolean(hosting), true);
const rewrite = (hosting?.rewrites ?? []).find((r) => r.function === "listingPage");
check("a rewrite points at listingPage", Boolean(rewrite), true);
check("the rewrite covers the shared path", rewrite?.source, `${pathInApp}/**`);
check(
  "hosting serves the public directory that exists",
  fs.existsSync(path.join(__dirname, "..", hosting?.public ?? "")),
  true,
);

// ── The function is exported under the name the rewrite calls ─────────
const index = read("functions/index.js");
check(
  "index.js exports listingPage",
  /exports\.listingPage\s*=/.test(index),
  true,
);

// ── Nothing private is published ──────────────────────────────────────
//
// The page renders one status and no phone number. Both of these are the
// kind of thing a later edit adds without noticing what it opens up: a
// listing awaiting moderation is not public, and a seller's number sits
// behind a sign-in in the app.
check(
  "only approved listings render",
  /listing\.status !== "approved"/.test(fn),
  true,
);
check(
  "the page never prints a phone number",
  /listing\.phone|\.phone\b/.test(fn),
  false,
);
// A missing listing and an unapproved one must be indistinguishable.
check(
  "both refusals return 404",
  (fn.match(/res\.status\(404\)/g) ?? []).length >= 2,
  true,
);
// Nothing that came out of a listing document is written into a template
// string bare. Firestore holds whatever a seller typed, including a `<`,
// and one unescaped title is a script tag running on our own domain.
["title", "description", "price", "image", "where", "summary", "id"].forEach(
  (field) => {
    check(
      `${field} is never interpolated without escapeHtml`,
      new RegExp("\\$\\{" + field + "\\}").test(fn),
      false,
    );
  },
);
check("the file escapes at all", /function escapeHtml/.test(fn), true);

// ── The app only links to ids that could exist ────────────────────────
check(
  "a non-Firestore id gets no link",
  /ID_RE\.test/.test(app),
  true,
);
check(
  "an unapproved listing gets no link",
  /listing\?\.status && listing\.status !== "approved"/.test(app),
  true,
);

// ── Every listing share carries the link ──────────────────────────────
//
// Six screens can share a listing and each built its own message. A screen
// added later that forgets the link is a share that silently goes back to
// being a sentence.
const sharers = [
  "src/components/ListingCard.js",
  "src/screens/ProductDetailScreen.js",
  "src/screens/MyListingsScreen.js",
  "src/screens/ForYouScreen.js",
  "src/screens/EventsScreen.js",
  "src/screens/JobDetailScreen.js",
];
sharers.forEach((file) => {
  const source = read(file);
  check(`${file} shares a link`, source.includes("withListingLink("), true);
});

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: listing links — ${appOrigin}/l/<id>, rewritten to listingPage, ` +
    `${sharers.length} screens sharing it, approved listings only`,
);
