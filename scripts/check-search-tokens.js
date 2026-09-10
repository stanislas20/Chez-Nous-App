// The two tokenisers have to agree, exactly.
//
// Search works only if the words written INTO a listing and the words a query
// is folded into come out of the same rules. The document side runs in
// functions/searchTokens.js (a Cloud Function trigger, and the backfill); the
// query side and the tests use src/utils/searchTokens.js; and the matcher
// that AND-combines the results is the `fold` inside src/utils/search.js,
// which predates both.
//
// That is three copies of one normalisation, in two packages, because
// `functions/` is deployed alone and cannot import from `src/`. A drift
// between any two of them is not a wrong result — it is a listing that can
// never be found by anybody, silently, forever.
//
// So: run all three against the same fixtures and require identical answers.
// The same device this project already uses for POSTING_DIAL, listingLimits
// and listingStoragePaths.
//
// Run: node scripts/check-search-tokens.js
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const root = path.join(__dirname, "..");
const failures = [];

function loadEsm(relative) {
  const { code } = babel.transformFileSync(path.join(root, relative), {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(module, module.exports, require);
  return module.exports;
}

const client = loadEsm("src/utils/searchTokens.js");
const server = require(path.join(root, "functions", "searchTokens.js"));
const matcher = loadEsm("src/utils/search.js");

// Real listing shapes, including the ones that break naive tokenisers:
// accents, hyphens, mixed case, an empty document, a job with no title in one
// language, and a description long enough to test the cap.
const FIXTURES = [
  {
    name: "a vehicle with accents and a hyphenated city",
    listing: {
      titleFr: "Toyota Corolla 2013 — très bon état",
      titleEn: "Toyota Corolla 2013 — very good condition",
      brand: "Toyota",
      model: "Corolla",
      categoryKey: "vehicles",
      city: "Porto-Novo",
      quartier: "Ouando",
      descriptionFr: "Voiture bien entretenue, climatisation, boîte automatique.",
    },
  },
  {
    name: "a service with a custom trade",
    listing: {
      titleFr: "Réparation de climatiseurs à domicile",
      trade: "other",
      customTrade: "Froid & climatisation",
      categoryKey: "services",
      city: "Cotonou",
      area: "Fidjrossè",
    },
  },
  {
    name: "an appliance, the Phase C target",
    listing: {
      titleFr: "Congélateur Hisense 300L très bon état",
      titleEn: "Congélateur Hisense 300L très bon état",
      categoryKey: "other",
      customCategory: "Électroménager",
      city: "Parakou",
      descriptionFr: "Congélateur en très bon état.",
    },
  },
  {
    name: "a job post",
    listing: {
      titleFr: "Chauffeur poids lourd",
      company: "Sobebra",
      categoryKey: "jobs",
      city: "Cotonou",
    },
  },
  {
    name: "a restaurant",
    listing: {
      titleFr: "Chez Maman Bénin",
      cuisine: "beninese",
      categoryKey: "restaurants",
      city: "Cotonou",
      quartier: "Haie Vive",
    },
  },
  {
    name: "a description long enough to overflow the cap",
    listing: {
      titleFr: "Terrain à vendre",
      categoryKey: "realEstate",
      city: "Abomey-Calavi",
      descriptionFr: Array.from({ length: 200 }, (_, i) => `motclef${i}`).join(" "),
    },
  },
  { name: "an empty document", listing: {} },
  { name: "a null document", listing: null },
  {
    name: "a listing whose fields are the wrong types",
    listing: { titleFr: 42, city: null, brand: [], descriptionFr: undefined },
  },
];

// 1. The two token generators produce identical arrays.
for (const { name, listing } of FIXTURES) {
  const a = client.searchTokensFor(listing);
  const b = server.searchTokensFor(listing);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    failures.push(
      `${name}: the client and server tokenisers disagree.\n` +
        `      src/:       ${JSON.stringify(a)}\n` +
        `      functions/: ${JSON.stringify(b)}`,
    );
  }
  if (a.length > client.SEARCH_TOKEN_MAX) {
    failures.push(`${name}: produced ${a.length} tokens, over the cap`);
  }
  for (const token of a) {
    if (token.length < client.SEARCH_TOKEN_MIN_LENGTH) {
      failures.push(`${name}: token "${token}" is shorter than the minimum`);
    }
    if (token.length > client.SEARCH_TOKEN_MAX_LENGTH) {
      failures.push(`${name}: token "${token}" is longer than the maximum`);
    }
    if (token !== token.toLowerCase() || /[^a-z0-9]/.test(token)) {
      failures.push(`${name}: token "${token}" is not folded`);
    }
  }
}

// 2. The constants agree.
for (const key of ["SEARCH_TOKEN_MAX", "SEARCH_TOKEN_MIN_LENGTH", "SEARCH_TOKEN_MAX_LENGTH"]) {
  if (client[key] !== server[key]) {
    failures.push(`${key} differs: src ${client[key]} vs functions ${server[key]}`);
  }
}

// 3. The rules enforce the same cap the writers apply. A ceiling that only
//    lives in the writer is not a ceiling.
{
  const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
  const match = rules.match(/searchTokens\.size\(\)\s*<=\s*(\d+)/);
  if (!match) {
    failures.push(
      "firestore.rules does not bound searchTokens.size(), so nothing stops a " +
        "document carrying a thousand of them",
    );
  } else if (Number(match[1]) !== client.SEARCH_TOKEN_MAX) {
    failures.push(
      `firestore.rules caps searchTokens at ${match[1]} but the tokenisers ` +
        `produce up to ${client.SEARCH_TOKEN_MAX}`,
    );
  }
}

// 4. The fold used to write a document and the fold used to match a query are
//    the same fold. This is the one that would silently break everything:
//    queryMatches is what filters the results that come back, so if it folded
//    differently from the tokeniser, a remote hit would be discarded locally.
{
  const pairs = [
    ["Congélateur", "congelateur"],
    ["CONGÉLATEUR", "congelateur"],
    ["Toyota Corolla", "TOYOTA COROLLA"],
    ["Porto-Novo", "porto novo"],
    ["Ouémé", "oueme"],
    ["Réfrigérateur", "refrigerateur"],
    ["Abomey-Calavi", "abomey  calavi"],
    ["Fidjrossè", "fidjrosse"],
  ];
  for (const [written, typed] of pairs) {
    const tokens = client.searchTokensFor({ titleFr: written });
    const primary = client.primarySearchToken(typed);
    if (!primary) {
      failures.push(`"${typed}" produced no query token at all`);
      continue;
    }
    if (!tokens.includes(primary)) {
      failures.push(
        `searching "${typed}" would not find a listing titled "${written}": ` +
          `query token "${primary}" is not in ${JSON.stringify(tokens)}`,
      );
    }
    // And the local matcher, which filters what comes back, must agree.
    if (!matcher.queryMatches(typed, written)) {
      failures.push(
        `queryMatches disagrees with the tokeniser: "${typed}" does not match ` +
          `"${written}", so a correct remote hit would be discarded locally`,
      );
    }
  }
}

// 5. The primary token is the most selective one available, because it is the
//    one the query is actually sent as.
{
  const cases = [
    ["toyota corolla", "corolla"],
    ["congelateur hisense", "congelateur"],
    ["je cherche une voiture", "voiture"],
    ["le la les de du", null],
    ["", null],
    ["   ", null],
  ];
  for (const [query, expected] of cases) {
    const actual = client.primarySearchToken(query);
    if (actual !== expected) {
      failures.push(
        `primarySearchToken("${query}") gave ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      );
    }
  }
}

if (failures.length) {
  console.error("check-search-tokens: FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `clean: ${FIXTURES.length} listing shapes tokenise identically in src/ and ` +
    `functions/, the rules cap matches, and the query fold matches the ` +
    `document fold`,
);
