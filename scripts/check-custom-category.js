// "Autre" has to ask what it is, and the answer has to survive.
//
// The category list is the app's own structure — fourteen keys, each with a
// browse screen, an icon and in several cases a bespoke form. A seller with
// something none of them describes used to have two options: file it under
// the nearest wrong aisle, or not post. Both lose the same thing, which is
// any record of what the missing category was.
//
// So "Autre" now asks, and the answer is offered to the next seller who gets
// there. Three things have to hold for that to work, and each fails quietly:
//
//   the answer is a LABEL, never a key. categoryKey is what routes a listing
//   to its detail screen and what every browse screen filters on; a key
//   invented at runtime routes nowhere;
//
//   only approved listings feed the suggestions, because a suggestion is put
//   in front of every future seller and nothing should get there without a
//   moderator having read it;
//
//   and the length is bounded in the rules, not only in the form, or the
//   first person with the Firestore SDK puts a paragraph in everyone's chip
//   row.
//
// Run: node scripts/check-custom-category.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const babel = require("@babel/core");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const raw = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const read = (rel) => stripComments(raw(rel));

const failures = [];

// 1. The category exists to be chosen, and stays a fixed key.
{
  const cats = read("src/data/categories.js");
  if (!/key: 'other'/.test(cats)) {
    failures.push(
      "categories.js has no 'other' entry, so there is no way to say the " +
        "list does not cover it",
    );
  }
  const form = read("src/screens/CreateListingScreen.js");
  if (/categoryKey: customCategory|categoryKey: normalizeCategoryLabel/.test(form)) {
    failures.push(
      "CreateListingScreen writes the seller's text as categoryKey — that " +
        "key routes the listing to a detail screen, and a typed one routes " +
        "nowhere",
    );
  }
  if (!/customCategory: isOther \?/.test(form)) {
    failures.push(
      "CreateListingScreen no longer stores customCategory, so the answer " +
        "to \"what is it\" is thrown away",
    );
  }
  // The question has to be compulsory. An optional one is not asked.
  if (!/isOther && !isUsableCategoryLabel\(customCategory\)/.test(form)) {
    failures.push(
      "CreateListingScreen accepts an \"Autre\" listing with no label — it " +
        "arrives filed under nothing",
    );
  }
  if (!/trade === "other" && !isUsableCategoryLabel\(customTrade\)/.test(form)) {
    failures.push(
      "CreateListingScreen accepts an \"Autre\" service with no trade named",
    );
  }
}

// 2. Suggestions come from approved listings only.
{
  // The hook named here changed in Phase B — the form now reads two bounded
  // categories instead of subscribing to every approved listing in the
  // database — but the property being asserted did not, and it is the one
  // that matters: whatever feeds the chip row must be filtered to
  // status == 'approved', or a pending listing's words reach every future
  // seller before a moderator has read them.
  const form = read("src/screens/CreateListingScreen.js");
  if (
    !/const \{ listings: approvedListings \} = useCategoryListingsMulti\(/.test(
      form,
    )
  ) {
    failures.push(
      "the suggestion list is not built from the approved-listings read — a " +
        "pending or rejected listing's words would be offered to every " +
        "future seller before anyone had read them",
    );
  }
  const hook = read("src/hooks/useCategoryListings.js");
  if (!/where\("status", "==", "approved"\)/.test(hook)) {
    failures.push(
      "useCategoryListings no longer filters on the approved status, which " +
        "is the only thing keeping unmoderated text out of the suggestions",
    );
  }
}

// 3. The buyer's half. Collecting the words and never showing them to
//    anyone but the next seller is half a feature: every "Autre" listing
//    lands in one aisle, and without the filter a saxophone and a welding
//    torch are the same row.
{
  const browse = read("src/screens/CategoryListingsScreen.js");
  if (!/customCategoriesFrom\(categoryListings\)/.test(browse)) {
    failures.push(
      "CategoryListingsScreen does not build sub-aisles from the sellers' " +
        "own words, so everything under Autre is one undifferentiated list",
    );
  }
  if (!/foldCategoryLabel\(listing\.customCategory\)/.test(browse)) {
    failures.push(
      "the Autre filter matches on the raw label rather than the folded " +
        "one, so \"Décoration\" and \"decoration\" filter to different lists " +
        "even though they share a chip",
    );
  }
  // The same function on both sides, or the chip a seller tapped is not the
  // chip a buyer taps.
  const form = read("src/screens/CreateListingScreen.js");
  if (!/customCategoriesFrom/.test(form) || !/customCategoriesFrom/.test(browse)) {
    failures.push(
      "the form and the browse screen no longer share customCategoriesFrom",
    );
  }
  const moderation = read("src/screens/ModerationScreen.js");
  if (!/customCategoriesFrom\(approvedListings\)/.test(moderation)) {
    failures.push(
      "ModerationScreen no longer tallies the custom categories, so which " +
        "word has earned a real category of its own is invisible again",
    );
  }
}

// 4. The word is searchable, everywhere listings are searched.
//
//    The form tells sellers "name it the way a buyer would search for it".
//    Until the label was passed to queryMatches that sentence was false: a
//    buyer typing the exact words a seller had chosen found nothing, which
//    is the flow contradicting its own instructions.
{
  const SEARCHERS = [
    "src/screens/CategoryListingsScreen.js",
    "src/screens/ForYouScreen.js",
    "src/screens/LocalScreen.js",
  ];
  for (const rel of SEARCHERS) {
    const source = read(rel);
    // Only the calls that search listings — the pharmacy one searches Places
    // results, which have no seller-written category.
    const calls = [...source.matchAll(/queryMatches\(([\s\S]{0,220}?)\)/g)]
      .map((match) => match[1])
      .filter((args) => /\blisting\.city\b/.test(args));
    if (calls.length === 0) {
      failures.push(`${rel} no longer searches listings at all`);
      continue;
    }
    for (const args of calls) {
      // No closing paren in the test: the capture above is non-greedy and
      // ends at the FIRST ")", which is the one inside
      // listingSearchParts(listing) itself.
      if (!/listingSearchParts\(/.test(args)) {
        failures.push(
          `${rel} searches listings without their seller-written category, ` +
            `so "name it the way a buyer would search for it" is a lie`,
        );
        break;
      }
    }
  }
}

// 5. And a service's trade is shown, not only collected. It reached the
//    next seller's chips and stopped there — no buyer ever saw it.
{
  const detail = read("src/screens/ProductDetailScreen.js");
  if (!/categoryLabelFor\(/.test(detail)) {
    failures.push(
      "ProductDetailScreen does not use categoryLabelFor, so a listing the " +
        "seller named reads back as \"Autre\"",
    );
  }
}

// 6. The ceiling is in the rules, where it holds against the SDK.
{
  const rules = read("firestore.rules");
  if (!/function customCategoryOk/.test(rules)) {
    failures.push(
      "firestore.rules does not bound customCategory — the form's maxLength " +
        "stops only the people using the form",
    );
  }
  for (const field of ["customCategory", "customTrade"]) {
    if (!new RegExp(`customCategoryOk\\(request\\.resource\\.data, '${field}'\\)`).test(rules)) {
      failures.push(`firestore.rules does not bound ${field}`);
    }
  }
  const max = raw("src/data/customCategories.js").match(
    /CUSTOM_CATEGORY_MAX = (\d+)/,
  );
  // (?!\d) or "40" matches inside "4000" and a raised ceiling reads as
  // agreement.
  if (!max || !new RegExp(`size\\(\\) <= ${max[1]}(?!\\d)`).test(rules)) {
    failures.push(
      "the rules' ceiling and CUSTOM_CATEGORY_MAX disagree — the form would " +
        "accept text the write then rejects, with no way to tell why",
    );
  }
}

// 7. And the folding, run rather than read. This is the part that decides
//    whether the list converges on one word or grows a synonym per seller.
{
  const code = babel.transformSync(raw("src/data/customCategories.js"), {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  }).code;
  // customCategories.js sorts names through utils/collate, so the sandbox
  // needs a require. It loads the real file the same way rather than
  // standing in a lookalike: this block exists to run the shipped folding
  // code, and a substitute collator would make it run something else.
  const loadReal = (specifier) => {
    const file = path.join(
      root,
      "src/data",
      `${specifier.replace(/^\.\//, "")}.js`,
    );
    const inner = babel.transformSync(fs.readFileSync(file, "utf8"), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
    }).code;
    const box = { module: { exports: {} }, exports: {}, Intl, require: loadReal };
    box.module.exports = box.exports;
    vm.createContext(box);
    vm.runInContext(inner, box);
    return box.module.exports;
  };
  const sandbox = {
    module: { exports: {} },
    exports: {},
    Intl,
    require: loadReal,
  };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const {
    foldCategoryLabel,
    normalizeCategoryLabel,
    isUsableCategoryLabel,
    customCategoriesFrom,
    categoryLabelFor,
  } = sandbox.module.exports;

  const same = [
    ["Décoration", "decoration"],
    ["Coiffure & beauté", "coiffure et beaute"],
    ["  Instruments de musique  ", "Instruments musique"],
  ];
  for (const [a, b] of same) {
    if (foldCategoryLabel(a) !== foldCategoryLabel(b)) {
      failures.push(
        `"${a}" and "${b}" fold apart, so they would sit in the list as two ` +
          `categories`,
      );
    }
  }
  if (foldCategoryLabel("Soudure") === foldCategoryLabel("Plomberie")) {
    failures.push("the fold collapses genuinely different trades");
  }

  if (normalizeCategoryLabel("  matériel   de sonorisation ") !==
      "Matériel de sonorisation") {
    failures.push("normalizeCategoryLabel does not tidy whitespace and case");
  }
  // Casing somebody chose on purpose survives.
  if (normalizeCategoryLabel("TV & Hi-Fi") !== "TV & Hi-Fi") {
    failures.push("normalizeCategoryLabel rewrites casing the seller chose");
  }
  if (normalizeCategoryLabel("x".repeat(200)).length !== 40) {
    failures.push("normalizeCategoryLabel does not cap the length");
  }
  for (const junk of ["", " ", "-", "?", "."]) {
    if (isUsableCategoryLabel(junk)) {
      failures.push(`"${junk}" is accepted as a category label`);
    }
  }

  // Commonest first — the whole point is that the next seller reuses a word
  // rather than inventing one, and the word twelve people used belongs above
  // the word one person used.
  const listings = [
    { customCategory: "Décoration" },
    { customCategory: "decoration" },
    { customCategory: "Instruments de musique" },
    { customCategory: "   " },
    { customCategory: "DÉCORATION" },
  ];
  const out = customCategoriesFrom(listings);
  if (out.length !== 2) {
    failures.push(
      `customCategoriesFrom returned ${out.length} entries, expected 2 ` +
        `(three spellings of one word, one usable other, one blank)`,
    );
  } else {
    if (out[0].count !== 3 || out[0].label !== "Décoration") {
      failures.push(
        `the commonest category is ${JSON.stringify(out[0])}, expected ` +
          `Décoration counted 3 and first`,
      );
    }
  }

  const { listingSubLabel, listingSearchParts } = sandbox.module.exports;
  if (listingSubLabel({ customTrade: "Soudure" }) !== "Soudure") {
    failures.push("listingSubLabel misses customTrade");
  }
  if (listingSubLabel({ customCategory: " " , customTrade: "Soudure" }) !== "Soudure") {
    failures.push("listingSubLabel is blocked by an empty customCategory");
  }
  if (listingSubLabel({}) !== null) {
    failures.push("listingSubLabel invents a label");
  }
  if (listingSearchParts({ customTrade: "Soudure" }).join() !== "Soudure") {
    failures.push("listingSearchParts drops customTrade");
  }
  if (listingSearchParts({}).length !== 0) {
    failures.push("listingSearchParts returns blanks, which widen every search");
  }
  // A service keeps its category and adds its trade: "Soudure" alone would
  // lose the fact that it is a service at all.
  if (categoryLabelFor({ customTrade: "Soudure" }, "Services") !== "Services · Soudure") {
    failures.push(
      "a custom trade replaces the category instead of qualifying it",
    );
  }
  if (categoryLabelFor({ customCategory: "Soudure" }, "Autre") !== "Soudure") {
    failures.push("categoryLabelFor shows the generic label over the seller's");
  }
  if (categoryLabelFor({}, "Autre") !== "Autre") {
    failures.push("categoryLabelFor loses the fallback");
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  "clean: custom categories — asked for, bounded, moderated before being " +
    "suggested, and never a routing key",
);
