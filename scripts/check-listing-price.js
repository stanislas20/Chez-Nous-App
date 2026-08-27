// No listing shows a price its seller never gave.
//
// CreateListingScreen stores `price: 0` for every category that never asks
// for one — a pharmacy on duty, a job, a community notice, a restaurant, a
// trade working sur devis. That is reasonable storage. What it must never
// become is "0 FCFA" on a card, because nobody reads that as "no price
// given": they read it as free, and a restaurant was offering to feed people
// for nothing.
//
// The trap is that the bug is invisible in the code that causes it.
// `priceFormatter.format(listing.price)` is correct-looking, and every one of
// the eight screens that printed a price had written it out by hand. So this
// asserts the two halves: the helper is honest about zero, and no screen goes
// back to formatting the raw field.
//
// Run: node scripts/check-listing-price.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");
const fs = require("fs");

function loadEsm(relative, requires = {}) {
  const shim = { exports: {} };
  vm.runInNewContext(
    babel.transformFileSync(path.join(__dirname, "..", relative), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    }).code,
    {
      module: shim,
      exports: shim.exports,
      require: (specifier) => {
        const hit = Object.keys(requires).find((key) =>
          specifier.endsWith(key),
        );
        return hit ? loadEsm(requires[hit], requires) : {};
      },
      console,
    },
  );
  return shim.exports;
}

const { listingPrice, listingPriceText } = loadEsm("src/utils/listingPrice.js", {
  realEstate: "src/data/realEstate.js",
  serviceRateTypes: "src/data/serviceRateTypes.js",
});

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

// The translator, stubbed to the identity of its key: this file is about
// which branch runs, and check-i18n-keys already proves the keys resolve.
const t = (key) => key;

// ── The whole point ─────────────────────────────────────────────────────
check("no price shows nothing", listingPrice({ price: 0 }, t, "fr"), null);
check("a missing field shows nothing", listingPrice({}, t, "fr"), null);
check("null shows nothing", listingPrice({ price: null }, t, "fr"), null);
// `undefined` through Intl gives "NaN", which is the same bug wearing a
// different hat.
check(
  "undefined shows nothing",
  listingPrice({ price: undefined }, t, "fr"),
  null,
);
check(
  "a string zero shows nothing",
  listingPrice({ price: "0" }, t, "fr"),
  null,
);
check("rubbish shows nothing", listingPrice({ price: "abc" }, t, "fr"), null);
// Negative is not a discount, it is corrupt.
check("a negative price shows nothing", listingPrice({ price: -5 }, t, "fr"), null);
check("and the flat form agrees", listingPriceText({ price: 0 }, t, "fr"), null);

// ── A real price still prints ───────────────────────────────────────────
const real = listingPrice({ price: 150000 }, t, "fr");
check("a real price is an amount", real.kind, "amount");
// fr-FR groups with U+202F, a narrow no-break space — not the ordinary
// space it looks like. Spelled out here so a future edit does not "fix" the
// expectation by typing a normal space and get a passing test for the wrong
// string.
const NNBSP = "\u202f";
check("grouped the way Bénin writes them", real.amount, `150${NNBSP}000`);
check("in francs", real.suffix, " FCFA");
check(
  "flattened",
  listingPriceText({ price: 150000 }, t, "fr"),
  `150${NNBSP}000 FCFA`,
);
// The smallest real price there can be — the boundary the zero test sits on.
check("one franc is a price", listingPriceText({ price: 1 }, t, "fr"), "1 FCFA");

// ── Sur devis is an answer, not a gap ───────────────────────────────────
const quote = listingPrice(
  { price: 0, serviceRateType: "quote" },
  t,
  "fr",
);
check("a quoted service says so", quote.kind, "words");
check("in French", quote.text, "Sur devis");
check(
  "and in English",
  listingPrice({ price: 0, serviceRateType: "quote" }, t, "en").text,
  "On request",
);
// A rate type that DOES carry an amount must not fall through to words when
// the amount is missing — that would invent "sur devis" for a broken row.
check(
  "an hourly rate with no amount stays silent",
  listingPrice({ price: 0, serviceRateType: "hourly" }, t, "fr"),
  null,
);

// ── A rent is not a sale price ──────────────────────────────────────────
check(
  "a monthly rent carries its period",
  listingPrice(
    { price: 150000, categoryKey: "realEstate", realEstateDeal: "rent" },
    t,
    "fr",
  ).suffix.trim(),
  "sellPriceSuffix_perMonth",
);

// ── Nobody formats the raw field any more ───────────────────────────────
//
// This is the half that rots. The helper can be perfect and a new screen can
// still write `priceFormatter.format(listing.price)`, which is exactly how
// eight screens ended up with the same bug.
const screens = [
  "src/components/ListingCard.js",
  "src/screens/ForYouScreen.js",
  "src/screens/MyListingsScreen.js",
  "src/screens/SellerDashboardScreen.js",
  "src/screens/ProductDetailScreen.js",
];
screens.forEach((file) => {
  const source = fs
    .readFileSync(path.join(__dirname, "..", file), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const raw = source.match(
    /(?:priceFormatter|fcfa)\s*\(\s*(?:listing|item)\.price\s*\)/g,
  );
  check(
    `${file} does not format the raw price (${(raw ?? []).join(", ")})`,
    (raw ?? []).length,
    0,
  );
});

// The share sentence has to have a version without a price, or a listing
// with none shares as "Découvrez X à sur Chez-Nous".
const translations = fs.readFileSync(
  path.join(__dirname, "..", "src/i18n/translations.js"),
  "utf8",
);
check(
  "there is a share sentence with no price in it",
  (translations.match(/shareListingMessageNoPrice/g) ?? []).length,
  2,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: listing price — zero, null, undefined and rubbish all print ` +
    `nothing, sur devis prints itself, ${screens.length} screen(s) go ` +
    `through the helper`,
);
