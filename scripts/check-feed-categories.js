#!/usr/bin/env node
//
// The browse screens must exclude the directory categories in the QUERY, not
// after the page comes back.
//
// This exists because the alternative emptied both of them in production, and
// nothing failed while it happened. The pharmacy roster writes into the same
// `listings` collection as the market, it holds 200 of 209 approved listings,
// and it is rewritten weekly with a fresh createdAt. So a page of the 60
// newest listings was 60 pharmacies, the client-side filter discarded every
// one, and ForYou rendered "No listings in Cotonou yet" over a catalogue that
// was there the whole time. LocalScreen did the same on "All cities" and
// looked fine the moment a city was picked, because a narrower query let a
// few real listings onto the page.
//
// What makes it worth a check rather than a test is that the code was never
// wrong. The read was bounded, the filter was correct, every assertion held.
// It was the DISTRIBUTION that broke it — one category growing to 96% of the
// collection — and no fixture has that shape unless somebody thinks to build
// it.
//
// Three things are checked:
//
//   the two category lists between them account for every category, so a new
//   one cannot fall through and be invisible to both the feed and the
//   directories;
//
//   the feed list fits inside Firestore's `in` limit of 30, because the
//   thirty-first category would not fail loudly — the query would be
//   rejected and the screen would go empty again;
//
//   both browse screens actually pass the filter to useListingsQuery, since
//   reverting to a client-side-only filter restores the original bug exactly
//   and leaves every other test green.
//
// Run: node scripts/check-feed-categories.js

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const root = path.join(__dirname, "..");
const failures = [];

// Firestore's documented ceiling for the number of values in an `in` filter.
const FIRESTORE_IN_LIMIT = 30;

const SCREENS = ["src/screens/ForYouScreen.js", "src/screens/LocalScreen.js"];

function loadCategories() {
  const file = path.join(root, "src", "data", "categories.js");
  const { code } = babel.transformFileSync(file, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(
    module,
    module.exports,
    require,
  );
  return module.exports;
}

const { categories, DIRECTORY_CATEGORIES, MARKETPLACE_FEED_CATEGORIES } =
  loadCategories();

if (!Array.isArray(MARKETPLACE_FEED_CATEGORIES) || !MARKETPLACE_FEED_CATEGORIES.length) {
  failures.push(
    "MARKETPLACE_FEED_CATEGORIES is missing or empty — the feed query would " +
      "ask for nothing and both browse screens would be blank",
  );
} else {
  // 1. Every category is accounted for by exactly one of the two lists.
  const all = categories.map((c) => c.key);
  const covered = new Set([
    ...MARKETPLACE_FEED_CATEGORIES,
    ...DIRECTORY_CATEGORIES,
  ]);
  for (const key of all) {
    if (!covered.has(key)) {
      failures.push(
        `category "${key}" is in neither MARKETPLACE_FEED_CATEGORIES nor ` +
          `DIRECTORY_CATEGORIES — a listing filed under it would never appear ` +
          `in the feed and has no directory of its own either`,
      );
    }
  }

  // 2. The feed list fits in an `in` filter.
  if (MARKETPLACE_FEED_CATEGORIES.length > FIRESTORE_IN_LIMIT) {
    failures.push(
      `MARKETPLACE_FEED_CATEGORIES has ${MARKETPLACE_FEED_CATEGORIES.length} ` +
        `entries and Firestore allows ${FIRESTORE_IN_LIMIT} in an \`in\` ` +
        `filter — the browse query would be rejected outright and both ` +
        `screens would go empty`,
    );
  }
}

// 3. Both browse screens push the filter into the query.
for (const rel of SCREENS) {
  const file = path.join(root, rel);
  const ast = babel.parseSync(fs.readFileSync(file, "utf8"), {
    filename: file,
    presets: [require.resolve("babel-preset-expo")],
    babelrc: false,
    configFile: false,
  });

  let passesFilter = false;

  const walk = (node) => {
    if (!node || typeof node !== "object" || passesFilter) return;
    if (Array.isArray(node)) return node.forEach(walk);

    // { field: "categoryKey", op: "in", value: MARKETPLACE_FEED_CATEGORIES }
    if (node.type === "ObjectExpression") {
      const props = {};
      for (const p of node.properties) {
        if (p.type !== "ObjectProperty" || p.computed) continue;
        props[p.key.name ?? p.key.value] = p.value;
      }
      if (
        props.field?.value === "categoryKey" &&
        props.op?.value === "in" &&
        props.value?.type === "Identifier" &&
        props.value.name === "MARKETPLACE_FEED_CATEGORIES"
      ) {
        passesFilter = true;
        return;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      walk(node[key]);
    }
  };

  walk(ast);

  if (!passesFilter) {
    failures.push(
      `${rel} does not pass { field: "categoryKey", op: "in", value: ` +
        `MARKETPLACE_FEED_CATEGORIES } to useListingsQuery — the directories ` +
        `would be filtered out of a page they had already filled, which is ` +
        `the bug that emptied this screen in production`,
    );
  }
}

if (failures.length === 0) {
  console.log(
    `clean: ${MARKETPLACE_FEED_CATEGORIES.length} feed categor(ies) and ` +
      `${DIRECTORY_CATEGORIES.length} director(ies) cover all ` +
      `${categories.length}; both browse screens exclude directories in the query`,
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
