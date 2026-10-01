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

// 4. The SEARCH path obeys the same exclusion — run, not read.
//
// The query filter above only governs the paged read. LocalScreen has a
// second source: in search mode the rows come from useListingsSearch, which
// applies no category filter at all. Searching "pharmacie" on a physical
// device returned 60 of the ~204 duty entries and rendered them as ordinary
// marketplace cards under a raw `pharmacyOnDuty` heading.
//
// Both the search source and the orphan-section predicate are lifted out of
// LocalScreen and EXECUTED against a mixed set, because "the file mentions
// DIRECTORY_CATEGORIES" stays true for an exclusion applied to the wrong
// branch.
{
  const rel = "src/screens/LocalScreen.js";
  const source = fs.readFileSync(path.join(root, rel), "utf8");

  const MIXED = [
    { id: "m1", categoryKey: "vehicles" },
    { id: "m2", categoryKey: "realEstate" },
    ...DIRECTORY_CATEGORIES.map((key, i) => ({ id: `d${i}`, categoryKey: key })),
    { id: "m3", categoryKey: "brandNewCategory" },
  ];
  const marketplaceIds = MIXED.filter(
    (l) => !DIRECTORY_CATEGORIES.includes(l.categoryKey),
  ).map((l) => l.id);

  const searchSrc = /let result = isSearchMode([\s\S]*?);\n/.exec(source);
  if (!searchSrc) {
    failures.push(`${rel}: could not find the search/browse source selection to run`);
  } else {
    // eslint-disable-next-line no-new-func
    const pick = new Function(
      "isSearchMode", "searchResults", "listings", "DIRECTORY_CATEGORIES",
      `let result = isSearchMode${searchSrc[1]};\nreturn result;`,
    );

    const searched = pick(true, MIXED, [], DIRECTORY_CATEGORIES);
    const searchedKeys = searched.map((l) => l.categoryKey);
    for (const key of DIRECTORY_CATEGORIES) {
      if (searchedKeys.includes(key)) {
        failures.push(
          `${rel}: searching returns "${key}" into the marketplace sections — a ` +
            `directory listing has no price and its own screen, and this is the ` +
            `path that put 60 pharmacy cards at the bottom of Local`,
        );
      }
    }
    // The exclusion must not be a blanket "drop everything on search".
    if (JSON.stringify(searched.map((l) => l.id)) !== JSON.stringify(marketplaceIds)) {
      failures.push(
        `${rel}: search dropped ordinary marketplace rows too — got ` +
          `${JSON.stringify(searched.map((l) => l.id))}, expected ${JSON.stringify(marketplaceIds)}`,
      );
    }
    // Browsing still uses the already-filtered page, untouched.
    const browsed = pick(false, MIXED, [{ id: "page1", categoryKey: "vehicles" }], DIRECTORY_CATEGORIES);
    if (JSON.stringify(browsed.map((l) => l.id)) !== JSON.stringify(["page1"])) {
      failures.push(
        `${rel}: browsing no longer reads the paged listings — got ` +
          `${JSON.stringify(browsed.map((l) => l.id))}`,
      );
    }
  }

  // 5. The orphan fallback cannot re-admit a directory category.
  const orphanSrc =
    /const orphans = \[\.\.\.byCategory\.keys\(\)\]\s*\.filter\(\s*([\s\S]*?),?\s*\)\s*\.map\(/.exec(
      source,
    );
  if (!orphanSrc) {
    failures.push(`${rel}: could not find the orphan-section filter to run`);
  } else {
    // eslint-disable-next-line no-new-func
    const keep = new Function(
      "accountedFor", "DIRECTORY_CATEGORIES",
      `return (${orphanSrc[1]});`,
    )(new Set(["vehicles"]), DIRECTORY_CATEGORIES);

    for (const key of DIRECTORY_CATEGORIES) {
      if (keep(key)) {
        failures.push(
          `${rel}: the orphan fallback still admits "${key}". LOCAL_CATEGORIES ` +
            `drops it on purpose, which is precisely what made it an "unknown" ` +
            `key here — it came back last, under its raw name`,
        );
      }
    }
    // A genuinely new marketplace category must still be reachable.
    if (!keep("brandNewCategory")) {
      failures.push(
        `${rel}: the orphan fallback no longer admits an unknown marketplace ` +
          `category — listings filed under a new key would be unreachable here ` +
          `with nothing saying so`,
      );
    }
    if (keep("vehicles")) {
      failures.push(`${rel}: the orphan fallback duplicates an already-built section`);
    }
  }

  // 6. The duty shortcut reads a source that can actually hold pharmacies.
  //
  // It used to scan the marketplace page, which the query above excludes
  // directories from — so it could never populate and nothing said so.
  if (/for \(const listing of (allForDirectories|listings|listingSource)\b/.test(source)) {
    failures.push(
      `${rel}: the duty shortcut scans the marketplace listings again. That ` +
        `source excludes pharmacyOnDuty server-side, so the shortcut can never ` +
        `find one and simply never appears`,
    );
  }
  // Scoped to the duty query's own call, not to the file. The marketplace
  // query a few lines above carries a byte-identical city filter, so a
  // file-wide search for one is satisfied by the wrong query and proves
  // nothing about this one.
  const dutyQuery =
    /const \{ listings: dutyRoster \} = useListingsQuery\(\{([\s\S]*?)\n  \}\);/.exec(
      source,
    );
  if (!dutyQuery) {
    failures.push(
      `${rel}: no dutyRoster query — the duty shortcut has no source capable ` +
        `of containing a duty entry`,
    );
  } else {
    const q = dutyQuery[1];
    if (!/field: "categoryKey", value: "pharmacyOnDuty"/.test(q)) {
      failures.push(
        `${rel}: the duty query does not ask for pharmacyOnDuty, so it cannot ` +
          `return one`,
      );
    }
    if (!/field: "city", value: selectedCity/.test(q)) {
      failures.push(
        `${rel}: the duty query is not scoped to a city — it would read the ` +
          `whole ~200-row roster, which is what the marketplace query excludes ` +
          `directories to avoid`,
      );
    }
    // buildConstraints SKIPS a null-valued filter, so an enabled query with
    // no city silently drops the city clause and fetches everything.
    if (!/enabled: Boolean\(selectedCity\)/.test(q)) {
      failures.push(
        `${rel}: the duty query is not gated on a resolved city — a null city ` +
          `is dropped from the constraints and the whole roster comes back`,
      );
    }
    if (!/pageSize: [A-Z_]+|pageSize: \d+/.test(q)) {
      failures.push(`${rel}: the duty query is unbounded`);
    }
  }

  // 7. The dedicated pharmacy route still exists.
  const openListing = fs.readFileSync(
    path.join(root, "src/utils/openListing.js"),
    "utf8",
  );
  if (
    !/categoryKey === "pharmacyOnDuty"/.test(openListing) ||
    !/navigate\("PharmacyDetail"/.test(openListing)
  ) {
    failures.push(
      "openListing no longer routes pharmacyOnDuty to PharmacyDetail — " +
        "excluding the roster from Local is only safe while it still has a " +
        "screen of its own",
    );
  }
}

// 8. An expired duty window is never presented as current.
//
// Every roster entry in production is past its dutyUntil, so this is the
// state the shortcut actually renders, not an edge case.
{
  const file = path.join(root, "src", "utils", "pharmacyDuty.js");
  const { code } = babel.transformFileSync(file, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, require);
  const { getDutyLabel } = mod.exports;

  const t = (key, vars) => `${key}:${JSON.stringify(vars ?? {})}`;
  const at = (iso) => ({ toDate: () => new Date(iso) });

  const expired = getDutyLabel({ dutyUntil: at("2020-01-01T23:59:59Z") }, "fr", t);
  if (expired.isStale !== true) {
    failures.push(
      "getDutyLabel does not mark an elapsed duty window stale — the shortcut " +
        "would present a roster weeks out of date as current coverage",
    );
  }
  if (!String(expired.text).startsWith("pharmacyLastKnownSchedule")) {
    failures.push(
      `an elapsed duty window renders ${JSON.stringify(expired.text)} rather than ` +
        `the last-known-schedule copy`,
    );
  }

  const live = getDutyLabel({ dutyUntil: at("2099-01-01T23:59:59Z") }, "fr", t);
  if (live.isStale !== false || !String(live.text).startsWith("pharmacyOpenUntil")) {
    failures.push(
      `a still-valid duty window no longer reads as current: ${JSON.stringify(live)}`,
    );
  }

  // The shortcut must render that label rather than a fixed "on duty" string.
  const localSource = fs.readFileSync(
    path.join(root, "src/screens/LocalScreen.js"),
    "utf8",
  );
  if (!/getDutyLabel\(nearestPharmacy\.listing/.test(localSource)) {
    failures.push(
      "the Local duty shortcut no longer renders getDutyLabel — without it the " +
        "card cannot say that a roster is out of date",
    );
  }
}

if (failures.length === 0) {
  console.log(
    `clean: ${MARKETPLACE_FEED_CATEGORIES.length} feed categor(ies) and ` +
      `${DIRECTORY_CATEGORIES.length} director(ies) cover all ` +
      `${categories.length}; both browse screens exclude directories in the ` +
      `query, Local's search and orphan paths exclude them too, and the duty ` +
      `shortcut reads a city-scoped roster that labels an elapsed window`,
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
