// Services was a directory for cars only, and nothing said so.
//
// Every one of the sixteen trades in serviceTrades.js was automotive —
// garage, tyres, battery, transitaire — so a tailor, a mason or a caterer
// choosing "Services" in the sell form found no trade that described them
// and published into a category that could not group them. The category
// existed, the vocabulary did not, and the two look identical from outside:
// the listing publishes, nothing errors, and it simply never appears
// anywhere a buyer would look.
//
// The other half of this is the fields a directory ranks on. A screen that
// sorts providers by the advance they ask for is worth building only if the
// form asks for the advance; otherwise it sorts every provider by the same
// empty value and calls it an order. That is the read-side/write-side
// asymmetry this codebase keeps finding in itself, and it is cheap to
// prevent and expensive to notice late.
//
// Run: node scripts/check-service-trades.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
};

// ── Every trade belongs to a family, and every family has trades ───────
const tradeSource = read("src/data/serviceTrades.js");
const trades = [
  ...tradeSource.matchAll(
    /\{\s*key: "([a-zA-Z]+)",\s*(?:\n\s*)?family: "([a-zA-Z]+)"/g,
  ),
].map(([, key, family]) => ({ key, family }));
const families = [
  ...tradeSource
    .slice(
      tradeSource.indexOf("export const serviceFamilies"),
      tradeSource.indexOf("export const serviceTrades"),
    )
    .matchAll(/key: "([a-zA-Z]+)"/g),
].map(([, key]) => key);

check("every trade declares a family", trades.length >= 60, true);
check("the families are declared", families.length >= 10, true);

const declared = new Set(families);
trades.forEach(({ key, family }) => {
  if (!declared.has(family)) {
    failures.push(`the "${key}" trade is in family "${family}", which is not declared`);
  }
});
families.forEach((family) => {
  if (!trades.some((trade) => trade.family === family)) {
    failures.push(`the "${family}" family has no trades, so it is a heading over nothing`);
  }
});

// A duplicate key silently overwrites: two trades, one findable.
const seen = new Set();
trades.forEach(({ key }) => {
  if (seen.has(key)) failures.push(`the trade key "${key}" is used twice`);
  seen.add(key);
});

// The vehicle trades each drive a screen of their own; losing one takes
// that screen's listings with it.
["garage", "tyres", "battery", "clim", "keys", "gps", "driver", "wash"].forEach(
  (key) => {
    check(
      `the "${key}" trade still exists (a screen reads it)`,
      trades.some((trade) => trade.key === key),
      true,
    );
  },
);

// And the directory is no longer only cars.
check(
  "there are more non-vehicle trades than vehicle ones",
  trades.filter((t) => t.family !== "vehicle").length >
    trades.filter((t) => t.family === "vehicle").length,
  true,
);

// ── Labels exist in both languages ─────────────────────────────────────
const strings = read("src/i18n/translations.js");
const half = strings.indexOf("  fr: {");
const [enHalf, frHalf] = [strings.slice(0, half), strings.slice(half)];
[...tradeSource.matchAll(/labelKey: "([a-zA-Z]+)"/g)].forEach(([, key]) => {
  if (!enHalf.includes(`${key}:`)) failures.push(`${key} has no English label`);
  if (!frHalf.includes(`${key}:`)) failures.push(`${key} has no French label`);
});

// ── The form asks what the directory ranks on ──────────────────────────
const form = read("src/screens/CreateListingScreen.js");
[
  ["serviceDeposit", "the advance the provider asks for"],
  ["serviceWorkPlace", "whether they come to you or you go to them"],
  ["serviceWarranty", "what they guarantee afterwards"],
].forEach(([field, what]) => {
  check(`the sell form has a state for ${what}`, new RegExp(`\\[${field},`).test(form), true);
  check(
    `the sell form writes ${field} onto the listing`,
    new RegExp(`${field}[,:]`).test(form.slice(form.indexOf("...(isServices"))),
    true,
  );
});

// The ordering rule lives with the data, not inside a screen, so a second
// screen showing services cannot quietly order them differently.
const terms = read("src/data/serviceTerms.js");
check(
  "the lowest advance ranks first",
  /byDepositThenRating/.test(terms) && /POSITIVE_INFINITY/.test(terms),
  true,
);
// Not the comment saying so — the branch that does it. A provider who left
// the question blank must rank last, not alongside the ones who answered
// "no advance", which is what `?? 0` would quietly do.
check(
  "an undeclared advance ranks last rather than as none",
  /band \? band\.percent : Number\.POSITIVE_INFINITY/.test(terms),
  true,
);
check("a heavy advance is defined once", /HEAVY_DEPOSIT_PERCENT = 50/.test(terms), true);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: service trades — ${trades.length} trades across ${families.length} ` +
    `families, all labelled in both languages, and the sell form asks for the ` +
    `advance, the place and the guarantee the directory ranks on`,
);
