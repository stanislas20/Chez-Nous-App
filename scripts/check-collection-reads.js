// Every Firestore collection read has to be bounded — not only `listings`.
//
// check-bounded-reads.js guards the listings collection and does it well. The
// independent audit's finding was that it guards nothing else, and that
// "Phase B bounded every read" was therefore true of one collection out of
// eighteen. Three unbounded realtime listeners sat on the home screen:
// useVerifiedCompanies read the entire verifiedCompanies collection on every
// launch for every visitor, signed in or not, and useEventReactions read
// every reaction anybody had ever left on any event.
//
// This is the general form of that check. It walks src/, finds every query()
// and every bare onSnapshot(collection(...)), and requires a limit() in the
// same expression. A hook that genuinely cannot be bounded has to say so
// here, by name, with a reason — which makes the exception a decision
// somebody made rather than a line nobody noticed.
//
// Run: node scripts/check-collection-reads.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SRC = path.join(root, "src");

// Reads that are bounded by construction rather than by limit(), each with
// the reason. Anything not on this list needs a limit().
const ALLOWED_UNBOUNDED = {
  "src/hooks/useListingsByIds.js":
    "reads the caller's own list of ids, chunked at Firestore's cap of 30",
  "src/hooks/useSellerRatings.js":
    "where(documentId(), 'in', chunk) — bounded by the chunk it was given",
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}

// Comments mention collections constantly in this codebase; stripping them
// first is what keeps this check about code.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

// Returns the text of every balanced call to `name(` in the source.
function callBodies(source, name) {
  const bodies = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  let m;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === "(") depth += 1;
      else if (c === ")") depth -= 1;
      i += 1;
    }
    bodies.push({
      body: source.slice(start, i - 1),
      line: source.slice(0, m.index).split("\n").length,
    });
  }
  return bodies;
}

const failures = [];
const bounded = [];

for (const file of walk(SRC)) {
  const rel = path.relative(root, file);
  const source = stripComments(fs.readFileSync(file, "utf8"));
  if (!/firebase\/firestore/.test(source)) continue;

  const exempt = ALLOWED_UNBOUNDED[rel];

  // 1. query(collection(...), …) must carry limit().
  for (const { body, line } of callBodies(source, "query")) {
    if (!/\bcollection\s*\(/.test(body)) continue;
    const target =
      (body.match(/collection\(\s*[A-Za-z_$.]+\s*,\s*["'`]([^"'`]+)/) || [])[1] ||
      (body.match(/collection\(\s*[A-Za-z_$.]+\s*,\s*([A-Za-z_$.]+)/) || [])[1] ||
      "unknown";
    // A query built from a spread constraints array is bounded when the
    // builder that produced the array carries the limit. Checked in the same
    // file rather than assumed, so a builder that loses its limit still fails.
    const spread = body.match(/\.\.\.([A-Za-z_$][\w$]*)/);
    const boundedBySpread =
      spread && new RegExp(`${spread[1]}[\\s\\S]{0,4000}?limit\\s*\\(`).test(source);

    if (/\blimit\s*\(/.test(body) || boundedBySpread) {
      bounded.push(
        `${rel}:${line} ${target}${boundedBySpread && !/\blimit\s*\(/.test(body) ? " (via constraints)" : ""}`,
      );
      continue;
    }
    if (exempt) continue;
    failures.push(
      `${rel}:${line} — query over "${target}" has no limit(). An unbounded ` +
        `read costs the size of the collection every time the screen opens.`,
    );
  }

  // 2. onSnapshot(collection(...)) with no query() wrapper at all — the shape
  //    that read every eventReaction in the database.
  for (const { body, line } of callBodies(source, "onSnapshot")) {
    const first = body.split(",")[0];
    if (!/^\s*collection\s*\(/.test(first)) continue;
    if (exempt) continue;
    failures.push(
      `${rel}:${line} — onSnapshot straight onto a collection with no query() ` +
        `and no limit(). This is a live listener over the whole collection.`,
    );
  }
}

console.log(`${bounded.length} bounded collection reads:`);
for (const b of bounded) console.log(`  ${b}`);
for (const [rel, why] of Object.entries(ALLOWED_UNBOUNDED)) {
  console.log(`  ${rel} — exempt: ${why}`);
}

if (failures.length) {
  console.error(`\ncheck-collection-reads FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nevery collection read in src/ is bounded");
