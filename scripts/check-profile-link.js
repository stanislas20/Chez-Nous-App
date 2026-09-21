#!/usr/bin/env node
//
// A shared profile link is built in the app and served by a function, and
// the two halves name the host, the path and the app scheme independently.
// If they drift, the share still looks fine and every link it produces is a
// 404 for the person who receives it — the failure lands entirely on the
// stranger the share was meant to reach, so nothing in testing shows it.
//
// The same reasoning as scripts/check-listing-link.js, one route over.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const appLink = read("src/utils/profileLink.js");
const listingLink = read("src/utils/listingLink.js");
const page = read("functions/profilePage.js");
const firebaseJson = JSON.parse(read("firebase.json"));
const appJs = read("App.js");

let failures = 0;
const fail = (message) => {
  console.error(`FAIL ${message}`);
  failures += 1;
};

// The app must not hard-code an origin of its own: it imports the one the
// listing link already proved against functions/listingPage.js.
if (!/import \{ LISTING_SITE_ORIGIN \} from "\.\/listingLink"/.test(appLink))
  fail("profileLink.js does not import LISTING_SITE_ORIGIN from listingLink.js");
if (/https?:\/\//.test(appLink))
  fail("profileLink.js hard-codes a URL instead of importing the origin");

const originMatch = listingLink.match(
  /LISTING_SITE_ORIGIN\s*=\s*"([^"]+)"/,
);
const pageOrigin = page.match(/SITE_ORIGIN\s*=\s*"([^"]+)"/);
if (!originMatch) fail("could not read LISTING_SITE_ORIGIN");
if (!pageOrigin) fail("could not read SITE_ORIGIN from profilePage.js");
if (originMatch && pageOrigin && originMatch[1] !== pageOrigin[1])
  fail(
    `origin drift: app shares ${originMatch[1]}, page serves ${pageOrigin[1]}`,
  );

// The path the app builds has to be the path hosting rewrites.
const appPath = appLink.match(/\$\{LISTING_SITE_ORIGIN\}\/([A-Za-z0-9]+)\//);
if (!appPath) fail("profileShareUrl does not build a /<segment>/<id> path");
const rewrite = (firebaseJson.hosting?.rewrites ?? []).find(
  (r) => r.function === "profilePage",
);
if (!rewrite) fail("firebase.json has no rewrite to profilePage");
if (appPath && rewrite && rewrite.source !== `/${appPath[1]}/**`)
  fail(
    `path drift: app shares /${appPath[1]}/<uid>, hosting rewrites ${rewrite.source}`,
  );

// The page's "open in app" button has to be a route the app actually claims,
// or it opens on the home screen with the profile nowhere in sight.
const scheme = page.match(/APP_SCHEME\s*=\s*"cheznous:\/\/([A-Za-z0-9]+)\/"/);
if (!scheme) fail("profilePage.js does not declare a cheznous:// app scheme");
const linkingRoute = appJs.match(/ProfileLink:\s*"([A-Za-z0-9]+)\/:id"/);
if (!linkingRoute) fail("App.js linking config has no ProfileLink route");
if (scheme && linkingRoute && scheme[1] !== linkingRoute[1])
  fail(
    `scheme drift: page opens cheznous://${scheme[1]}/, app claims ${linkingRoute[1]}/:id`,
  );
if (appPath && linkingRoute && appPath[1] !== linkingRoute[1])
  fail(
    `web and app paths differ: ${appPath[1]} shared, ${linkingRoute[1]} claimed`,
  );

// The page must read the public projection. sellers/{uid} carries the phone
// number the app keeps behind a sign-in.
if (/collection\("sellers"\)/.test(page))
  fail("profilePage.js reads sellers/{uid} — that document is private");
if (!/collection\("sellerStats"\)/.test(page))
  fail("profilePage.js does not read the public sellerStats projection");

if (failures) process.exit(1);
console.log(
  "clean: the shared profile link, the hosting rewrite and the app's deep " +
    "link all name the same address, and the page reads only public data",
);
