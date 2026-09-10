// Every read of the listings collection has to be bounded.
//
// The audit's largest finding was one hook: useApprovedListings opened a
// realtime listener over `status == 'approved'` with no limit and no cursor,
// and twenty-seven call sites filtered the resulting array in JavaScript. The
// cost of opening any screen was therefore the size of the catalogue, paid
// again on every cold start because the JS SDK has no disk cache in React
// Native. It is the kind of line that is one word long and comes back the
// first time somebody needs "all the listings" for something.
//
// So: a query against `listings` must carry a limit() — directly, or through
// one of the three hooks that own the bounded reads. The hooks themselves are
// where the limits live and are checked for them by name.
//
// Run: node scripts/check-bounded-reads.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const failures = [];

// The three places allowed to build a listings query, and the bound each
// must carry.
const BOUNDED_HOOKS = [
  ["src/hooks/useListingsQuery.js", /limit\(pageSize\)/],
  ["src/hooks/useCategoryListings.js", /limit\(CATEGORY_CAP\)/],
  // Bounded by construction rather than by limit(): it reads a caller's own
  // list of ids, chunked at Firestore's cap of 30 per `in` filter.
  ["src/hooks/useListingsByIds.js", /CHUNK = 30/],
];

for (const [rel, pattern] of BOUNDED_HOOKS) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} is missing — it owns one of the bounded reads`);
    continue;
  }
  if (!pattern.test(stripComments(fs.readFileSync(full, "utf8")))) {
    failures.push(
      `${rel} no longer carries its bound (${pattern}), which is the only ` +
        `thing keeping the read proportional to the screen rather than to ` +
        `the catalogue`,
    );
  }
}

// Everything else: a listings query anywhere in src/ must be limited.
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

const OWNERS = new Set(BOUNDED_HOOKS.map(([rel]) => path.join(root, rel)));

for (const file of walk(path.join(root, "src"))) {
  if (OWNERS.has(file)) continue;
  const source = stripComments(fs.readFileSync(file, "utf8"));
  const rel = path.relative(root, file);

  // Find each query(...) call that names the listings collection, and check
  // the same call for a limit. Deliberately crude: this is a tripwire, not a
  // parser, and it errs toward complaining.
  const calls = source.matchAll(
    /(?:onSnapshot|getDocs)\(\s*query\(([\s\S]{0,600}?)\)\s*,/g,
  );
  for (const [, body] of calls) {
    if (!/collection\(\s*firestore\s*,\s*"listings"\s*\)/.test(body)) continue;
    if (/\blimit\(/.test(body)) continue;
    failures.push(
      `${rel} builds a listings query with no limit(). Every screen's read ` +
        `has to be proportional to what it shows — see ` +
        `src/hooks/useListingsQuery.js for the bounded form.`,
    );
  }

  // The moderation queue is the one listener that is deliberately not
  // paginated (a queue that is long is itself the signal), so it is bounded
  // by a cap instead and checked here rather than exempted silently.
  if (rel === "src/hooks/useModerationQueue.js") {
    if (!/limit\(/.test(source)) {
      failures.push(
        "src/hooks/useModerationQueue.js has no limit(). A backlog is " +
          "exactly the state a growing marketplace produces, and it loads " +
          "in full every time the screen opens.",
      );
    }
  }
}

if (failures.length) {
  console.error("check-bounded-reads: FAIL");
  for (const failure of [...new Set(failures)]) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  "clean: every listings read is bounded — by page, by category cap, or by " +
    "an explicit set of ids",
);
