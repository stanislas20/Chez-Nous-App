// Google's restaurants stay Google's.
//
// The Restaurants screen now shows two different kinds of thing. One is a
// listing: an owner wrote it, agreed to be here, and can be held to it. The
// other is a Places record we fetched because the reader asked what is
// around them — nobody here has checked it, the owner does not know we are
// showing it, and "open now" is Google reading their published hours, not
// the restaurant saying so.
//
// Those two must not blur. The failure is quiet and total: merge them into
// one list, or put the verified badge on a Google card, and the app is
// vouching for two hundred businesses it has never contacted. It would look
// fine. That is the point of checking it mechanically.
//
// Run: node scripts/check-nearby-restaurants.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
// Comments are stripped before anything is matched. Two earlier guards read
// their own explanatory prose as the offence they were looking for.
const read = (rel) =>
  stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

const screen = read("src/screens/RestaurantsScreen.js");
const hook = read("src/hooks/useNearbyRestaurants.js");
const photo = read("src/utils/placePhoto.js");

const failures = [];

// 1. Separate lists, not one blended one.
if (/\.concat\(\s*nearby|\[\s*\.\.\.\s*(restaurants|source)\s*,\s*\.\.\.\s*nearby/.test(screen)) {
  failures.push(
    "RestaurantsScreen merges Google places into the listed restaurants — " +
      "they must stay on their own tab",
  );
}
if (!/withoutListed\(/.test(screen)) {
  failures.push(
    "RestaurantsScreen does not call withoutListed, so a restaurant that " +
      "published here also appears as a Google card beside its own listing",
  );
}

// 2. No verified badge on a Google card. The nearby branch is the block
//    between the nearby tab test and the listed branch that follows it.
const branchStart = screen.indexOf('tab === "nearby" ? (');
if (branchStart === -1) {
  failures.push("RestaurantsScreen has no nearby branch to check");
} else {
  const branch = screen.slice(branchStart, screen.indexOf("ordinary.map("));
  if (/VerifiedBadge|restoVerified|sellerVerified/.test(branch)) {
    failures.push(
      "the nearby branch renders a verified badge — nobody here has " +
        "verified a Google record",
    );
  }
  // 3. Attribution travels with the photo, always. Google requires it, and
  //    the card is the only place it can appear.
  if (/buildPlacePhotoUrl/.test(branch) && !/<PhotoCredit\b/.test(branch)) {
    failures.push(
      "the nearby branch shows a Places photo with no contributor credit",
    );
  }
  // 4. The opening state is Google's reading, and is said to be.
  if (/isOpenNow/.test(branch) && !/t\("restoNearbyNote"\)/.test(branch)) {
    failures.push(
      "the nearby branch shows an open/closed state without saying it is " +
        "Google's reading of the hours",
    );
  }
}

// 5. An uncredited photo is not shown at all — enforced once, upstream.
if (!/authorAttributions/.test(photo) || !/return \{ photoName: null/.test(photo)) {
  failures.push(
    "extractPlacePhoto no longer drops photos that arrive without a " +
      "contributor to credit",
  );
}
if (!/extractPlacePhoto\(place\)/.test(hook)) {
  failures.push(
    "useNearbyRestaurants builds its photo fields by hand instead of going " +
      "through extractPlacePhoto, so an uncredited photo can reach a card",
  );
}

// 6. Nothing from Places gets written down. The terms forbid caching it, and
//    a photo URL carries the API key.
if (/setDoc|addDoc|updateDoc|AsyncStorage/.test(hook)) {
  failures.push(
    "useNearbyRestaurants persists Places results — Google's terms do not " +
      "allow caching them, and photo URLs carry the API key",
  );
}

// 7. Google's price band stays Google's. Converting 1-4 into FCFA would be
//    inventing a price range for a restaurant that never gave us one.
if (/priceLevel/.test(screen) && /FCFA|formatPrice/.test(screen.slice(branchStart > -1 ? branchStart : 0, screen.indexOf("ordinary.map(")))) {
  failures.push(
    "the nearby branch renders Google's priceLevel as money — it is a 1-4 " +
      "band, not a price this restaurant quoted",
  );
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  "clean: nearby restaurants — Google's records stay separate, credited " +
    "and unverified",
);
