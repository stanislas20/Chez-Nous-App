// The form's ceilings and the database's ceilings have to be the same number.
//
// firestore.rules is the copy that binds — a maxLength on a TextInput stops
// somebody typing and stops nobody holding the SDK. But a form that accepts
// more than the rules do is its own bug, and a nasty one on this screen: the
// photos upload first, so a description over the limit is refused only after
// the seller has spent their data allowance, and the refusal arrives as the
// generic "upload failed" with nothing naming the real problem.
//
// So the two are declared once in src/data/listingLimits.js and asserted
// here, the same way check-posting-gate.js keeps POSTING_DIAL and the rules
// agreeing about which country may publish.
//
// Run: node scripts/check-text-limits.js
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const failures = [];

function loadLimits() {
  const file = path.join(root, "src", "data", "listingLimits.js");
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

const limits = loadLimits();
const rules = stripComments(
  fs.readFileSync(path.join(root, "firestore.rules"), "utf8"),
);

// Each entry: the constant, and the shape it must take in the rules file.
// The rules spell the number literally — a rules file cannot import — so the
// assertion is that the literal is present in the right clause.
const MIRRORED = [
  {
    name: "LISTING_TITLE_MAX",
    // textOk(data, 'titleFr', 120) and its two siblings.
    fields: ["titleFr", "titleEn", "title"],
  },
  {
    name: "LISTING_DESCRIPTION_MAX",
    fields: ["descriptionFr", "descriptionEn", "description"],
  },
  { name: "APPLICATION_MESSAGE_MAX", fields: ["applicantMessage"] },
];

for (const { name, fields } of MIRRORED) {
  const value = limits[name];
  if (typeof value !== "number") {
    failures.push(`listingLimits.js does not export ${name} as a number`);
    continue;
  }
  for (const field of fields) {
    const clause = new RegExp(
      `textOk\\(\\s*(?:request\\.resource\\.)?data\\s*,\\s*'${field}'\\s*,\\s*(\\d+)\\s*\\)`,
    );
    const match = rules.match(clause);
    if (!match) {
      failures.push(
        `firestore.rules has no textOk(..., '${field}', N) clause, so the ` +
          `${name} ceiling the form applies is not enforced anywhere`,
      );
      continue;
    }
    if (Number(match[1]) !== value) {
      failures.push(
        `firestore.rules bounds '${field}' at ${match[1]} but ` +
          `listingLimits.js says ${name} = ${value}. The form would accept ` +
          `what the database refuses (or refuse what it would accept).`,
      );
    }
  }
}

// The chat composer's ceiling, which lives in the messages create rule
// rather than in textOk.
{
  const value = limits.CHAT_MESSAGE_MAX;
  const match = rules.match(
    /request\.resource\.data\.text\.size\(\)\s*<=\s*(\d+)/,
  );
  if (!match) {
    failures.push(
      "firestore.rules does not bound message text size, so CHAT_MESSAGE_MAX " +
        "is a courtesy in the composer and nothing in the database",
    );
  } else if (Number(match[1]) !== value) {
    failures.push(
      `firestore.rules bounds message text at ${match[1]} but ` +
        `listingLimits.js says CHAT_MESSAGE_MAX = ${value}`,
    );
  }
}

// The price ceiling.
{
  const value = limits.LISTING_PRICE_MAX;
  const match = rules.match(
    /data\.get\('price',\s*0\)\s*<=\s*(\d+)/,
  );
  if (!match) {
    failures.push("firestore.rules does not bound price");
  } else if (Number(match[1]) !== value) {
    failures.push(
      `firestore.rules bounds price at ${match[1]} but listingLimits.js ` +
        `says LISTING_PRICE_MAX = ${value}`,
    );
  }
}

// And the forms actually apply them, rather than declaring a constant
// nothing reads.
const USES = [
  ["src/screens/CreateListingScreen.js", "LISTING_TITLE_MAX"],
  ["src/screens/CreateListingScreen.js", "LISTING_DESCRIPTION_MAX"],
  ["src/screens/ChatScreen.js", "CHAT_MESSAGE_MAX"],
  ["src/screens/JobDetailScreen.js", "APPLICATION_MESSAGE_MAX"],
];
for (const [rel, name] of USES) {
  const source = stripComments(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );
  if (!new RegExp(`maxLength=\\{${name}\\}`).test(source)) {
    failures.push(
      `${rel} does not pass ${name} as a maxLength, so the limit is only ` +
        `enforced after the write is refused`,
    );
  }
}

if (failures.length) {
  console.error("check-text-limits: FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `clean: ${MIRRORED.length + 2} text/number ceilings agree between ` +
    `listingLimits.js and firestore.rules, and all four forms apply them`,
);
