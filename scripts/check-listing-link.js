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
//
// Rerun quiet: loading the app's ES modules below makes Node warn that the
// package declares no type, which is neither this check's business nor
// something a reader should have to tell apart from a failure.
if (!process.env.NODE_NO_WARNINGS) {
  const { spawnSync } = require("child_process");
  const again = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  process.exit(again.status ?? 1);
}

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
  "src/screens/PharmacyDetailScreen.js",
];
sharers.forEach((file) => {
  const source = read(file);
  check(`${file} shares a link`, source.includes("withListingLink("), true);
});

// ── A pharmacy shares its own listing, not its seller ─────────────────
//
// PharmacyDetailScreen shared a sentence and no link for as long as the
// link existed: it builds its message inline, and the pass that added
// withListingLink to the other six screens never reached it. The loop above
// now names it, but "the file mentions the helper" is a weak thing to rest
// on — it stays true if the call loses its second argument, or reaches for
// the PROFILE helper, either of which sends a stranger somewhere that is
// not the pharmacy.
//
// So the screen's own share function is lifted out and RUN, against the
// real listingLink module and a pharmacy shaped the way openListing hands
// one over. What Share receives is then read back.
//
// withProfileLink and profileShareUrl are deliberately in scope. A mutation
// that swaps one in must fail on what it produced, not on a ReferenceError
// that would fire just as loudly if the check were testing nothing at all.
(async () => {
  // The app's modules are ES modules resolved by Metro, which fills in the
  // .js these imports leave off; Node does not, and refuses the file. So
  // each is loaded as itself with its relative imports spelled out — not
  // reimplemented, and the rewrite is checked rather than trusted, because
  // a silent miss here would import nothing and assert on undefined.
  const esm = async (rel) => {
    const dir = path.posix.dirname(rel);
    const source = read(rel).replace(
      /from "\.\/([A-Za-z0-9_.-]+)"/g,
      (_, name) =>
        `from "${require("url").pathToFileURL(
          path.join(__dirname, "..", dir, name.endsWith(".js") ? name : `${name}.js`),
        ).href}"`,
    );
    if (/from "\.{1,2}\//.test(source))
      throw new Error(`${rel}: an import was left unresolved for Node`);
    return import(
      `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`
    );
  };

  const { withListingLink, listingShareUrl, LISTING_SITE_ORIGIN } = await esm(
    "src/utils/listingLink.js",
  );
  const { withProfileLink, profileShareUrl } = await esm("src/utils/profileLink.js");

  const pharmacy = read("src/screens/PharmacyDetailScreen.js");

  if (!/import \{ withListingLink \} from "\.\.\/utils\/listingLink"/.test(pharmacy))
    failures.push("PharmacyDetailScreen does not import withListingLink");
  if (/utils\/profileLink/.test(pharmacy))
    failures.push("PharmacyDetailScreen imports the profile-link helper");
  // The screen legitimately builds a Google Maps directions URL, so the ban
  // is narrow: it must not spell out the share address. A second copy of the
  // origin, or a hand-built /l/ or /s/ path, stops being the canonical one
  // the moment listingLink.js moves — and nothing in the app would say so.
  const code = pharmacy.replace(/^\s*\/\/.*$/gm, "");
  if (code.includes(new URL(appOrigin).host))
    failures.push("PharmacyDetailScreen repeats the share origin instead of importing it");
  if (/["`]\/[ls]\//.test(code) || /\/[ls]\/\$\{/.test(code))
    failures.push("PharmacyDetailScreen hand-builds a share path instead of using a helper");

  const ID = "AbCdEf1234567890xyzQ";
  const body = /\n  const share = \(\) => \{\n([\s\S]*?)\n  \};\n/.exec(pharmacy);
  if (!body) {
    failures.push("could not find PharmacyDetailScreen's share function to run");
  } else {
    const run = (listing) => {
      const sent = [];
      const Share = { share: (payload) => sent.push(payload) };
      // eslint-disable-next-line no-new-func
      new Function(
        "title", "duty", "listing", "numbers",
        "Share", "withListingLink", "withProfileLink", "profileShareUrl", "listingShareUrl",
        body[1],
      )(
        "Pharmacie Zogbo",
        { text: "De garde", isStale: false },
        listing,
        ["+229 01 02 03 04", "+229 05 06 07 08"],
        Share, withListingLink, withProfileLink, profileShareUrl, listingShareUrl,
      );
      return sent;
    };

    const sent = run({ id: ID, status: "approved", city: "Cotonou" });
    check("the pharmacy share opens the share sheet once", sent.length, 1);
    const message = String(sent[0]?.message ?? "");

    // The information the screen already gave is still there. A "fix" that
    // replaced the message with a bare URL would pass every link assertion.
    ["Pharmacie Zogbo", "De garde", "Cotonou", "+229 01 02 03 04"].forEach((fragment) => {
      check(`the pharmacy share still says ${JSON.stringify(fragment)}`, message.includes(fragment), true);
    });

    check(
      "the pharmacy share carries its own listing URL",
      message.includes(`${LISTING_SITE_ORIGIN}/l/${ID}`),
      true,
    );
    // /s/<uid> is the profile page. A pharmacy sent there lands on the ONPB
    // importer's account rather than on the pharmacy.
    check("the pharmacy share links no profile", /\/s\//.test(message), false);
    // Two ways the id can go missing while a URL is still produced: the
    // helper called without the listing, or called with the wrong one.
    check(
      "the pharmacy share names exactly one address",
      (message.match(/https?:\/\//g) ?? []).length,
      1,
    );
    // The page says nothing true about installing the app, so neither does
    // the share.
    check(
      "the pharmacy share invents no store link",
      /apps\.apple\.com|play\.google\.com|itunes|APP_DOWNLOAD_URL/.test(message),
      false,
    );

    // An id that could not be Firestore's, and an entry that is not
    // approved: the helper withholds the link and the sentence still sends.
    [
      { id: "bad id", status: "approved", city: "Cotonou" },
      { id: ID, status: "pending", city: "Cotonou" },
      { status: "approved", city: "Cotonou" },
    ].forEach((listing, index) => {
      const only = run(listing);
      check(`unlinkable pharmacy ${index} still shares`, only.length, 1);
      check(
        `unlinkable pharmacy ${index} carries no URL`,
        /https?:\/\//.test(String(only[0]?.message ?? "")),
        false,
      );
      check(
        `unlinkable pharmacy ${index} still says what it is`,
        String(only[0]?.message ?? "").includes("Pharmacie Zogbo"),
        true,
      );
    });
  }

  // ── The two routes stay apart ───────────────────────────────────
  //
  // One origin, two paths. Pointing either helper at the other's path is a
  // single-character edit that produces a page for the wrong thing.
  check("a listing id resolves to /l/", listingShareUrl(ID), `${LISTING_SITE_ORIGIN}/l/${ID}`);
  const UID = "A1b2C3d4E5f6G7h8I9j0";
  check("a uid resolves to /s/", profileShareUrl(UID), `${LISTING_SITE_ORIGIN}/s/${UID}`);
  check("the profile helper appends /s/", withProfileLink("x", UID).includes(`/s/${UID}`), true);

  // The two screens that share a PERSON keep doing so. They are the
  // counterweight to everything above: a sweep that "unified" sharing on
  // withListingLink would otherwise look like progress.
  [
    "src/screens/SellerDashboardScreen.js",
    "src/screens/SellerProfileScreen.js",
  ].forEach((file) => {
    const source = read(file);
    check(`${file} shares a profile link`, source.includes("withProfileLink("), true);
  });

  if (failures.length) {
    failures.forEach((line) => console.error(`FAIL ${line}`));
    console.error(`\n${failures.length} failing`);
    process.exit(1);
  }
  console.log(
    `clean: listing links — ${appOrigin}/l/<id>, rewritten to listingPage, ` +
      `${sharers.length} screens sharing it (pharmacy run, not just read), ` +
      `approved listings only, profiles still /s/<uid>`,
  );
})();
