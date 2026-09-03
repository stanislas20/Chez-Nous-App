// A hotel price that is not the price of a night.
//
// The Hôtels screen exists for one reason: a quoted room rate is not what a
// guest pays. The taxe de séjour is added at the desk, so three hotels
// quoting "25 000" quote three different nights, and the guest learns which
// after the bags are upstairs. Every figure on that screen is the rate plus
// the tax.
//
// Three ways that quietly breaks, none of which crashes or logs:
//
//   - the card shows `price` instead of the all-in. It looks right, it is
//     lower than the truth, and it is lower by exactly the amount the guest
//     will be surprised by.
//   - the budget bands filter on the rate. A hotel then appears in a band
//     below the one it actually costs — the same deception, moved into the
//     filter where nobody thinks to look.
//   - the list sorts on the rate. "Du moins cher" then names a hotel that
//     is not the cheapest, which is the one promise the sort makes.
//
// And two the screen would be dishonest without:
//
//   - the star count shown without the word "declared". Nobody audits it,
//     so presenting it bare is the app vouching for a claim it never saw.
//   - the recommendation without its reason. A card that says "our pick"
//     and nothing else is an advertisement.
//
// Run: node scripts/check-hotel-pricing.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// Comments stripped before anything is counted. The note at the top of
// sampleHotels.js explains the isSample rule in prose, and the first run of
// this check counted the explanation as a fourth sample — the same way
// check-import-paths once reported a path quoted inside a comment.
const readCode = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
const failures = [];
const check = (label, ok) => {
  if (!ok) failures.push(label);
};

const terms = read("src/data/hotelTerms.js");
const screen = read("src/screens/HotelsScreen.js");
const form = read("src/screens/CreateListingScreen.js");

// ── the all-in is the rate plus the tax, in one place ──────────────────
check(
  "allInNightly adds the tourist tax to the rate",
  /touristTax/.test(terms) && /rate \+ tax/.test(terms),
);
check(
  "the screen shows the all-in, not the room rate",
  /fcfa\(item\.allIn\)/.test(screen),
);
check(
  "the screen never prints item.price as the nightly figure",
  !/fcfa\(item\.price\)[\s\S]{0,80}PerNight/.test(screen),
);

// ── the bands and the sort read the same number ────────────────────────
check(
  "the budget bands filter on the all-in",
  /hotelBudgetMatches\(budget, item\.allIn\)/.test(screen),
);
check(
  "the sleeping list sorts by the all-in",
  /byAllInNightly/.test(screen) && /byAllInNightly/.test(terms),
);
// A hall is chosen on how many people fit, so it sorts on that instead.
check(
  "the halls list sorts by capacity",
  /byCapacityDesc/.test(screen),
);

// ── what the form must ask, or the screen is reading fiction ───────────
//
// The read/write rule check-real-estate-fields enforces in general; these
// are the specific five this screen cannot work without.
["touristTax", "generator", "breakfastIncluded", "hotWater24h", "declaredStars"].forEach(
  (field) => {
    check(`the publish form writes ${field}`, new RegExp(`${field}:`).test(form));
    check(
      `the publish form asks for ${field}`,
      new RegExp(`set${field[0].toUpperCase()}${field.slice(1)}`).test(form),
    );
  },
);

// ── the two claims the app must not make on someone's behalf ───────────
check(
  "the star count is labelled as declared",
  /hotelsDeclaredStars/.test(screen),
);
const fr = read("src/i18n/translations.js");
check(
  "the French star label says déclarée",
  /hotelsDeclaredStars: "\{count\} \\u00e9toile\(s\) d\\u00e9clar/.test(fr) ||
    /hotelsDeclaredStars:[^\n]*clar\\u00e9e/.test(fr),
);
check(
  "the recommendation always carries its reason",
  /reasonKey/.test(screen) && /reasonKey/.test(terms),
);
check(
  "there is no recommendation when nothing confirms its power",
  /hotel: null, reasonKey: null/.test(terms),
);

// ── and nothing invented stands in for a listing ───────────────────────
//
// There were two sample cards here, on the rule sampleGarages set: an
// empty directory teaches nobody anything. That held while the screen was
// empty and stopped holding when the OpenStreetMap tier landed — against
// 737 real places, an invented card at the top badged "notre
// recommandation" was the app recommending a fiction. The priced tier now
// shows what has been listed, and says plainly when that is nothing.
check(
  "no sample listing stands in for a priced one",
  !/sampleHotels|sampleHalls/.test(screen),
);
check(
  "an unlisted priced tier says so, rather than blaming the filters",
  /t\("hotelsNoneListed"\)/.test(screen),
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  "clean: hotel pricing — the night is the rate plus the tax everywhere it " +
    "is shown, filtered and sorted; stars are labelled declared and the " +
    "recommendation names its rule",
);
