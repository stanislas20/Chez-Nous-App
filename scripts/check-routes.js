// Every route somebody navigates to is a route that exists.
//
// A navigate() to an unregistered name does not throw and does not warn in a
// release build. The tap simply does nothing. From the outside that is
// indistinguishable from a dead button, and it is the exact failure mode of
// adding a screen and forgetting the navigator — or renaming one and missing
// a caller.
//
// It also reads the tiles that carry a route in data rather than in markup:
// carServiceCategories entries hand a `route` to a dispatcher, so a typo
// there never appears in any navigate() call and would be invisible to a
// scan of the screens alone. That is how the Clés tile was wired.
//
// Run: node scripts/check-routes.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = walk(path.join(root, "src"));

// ── What the navigators register ────────────────────────────────────────
const registered = new Set();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(
    /<(?:Stack|Tab|Drawer|\w+)\.Screen[\s\S]{0,200}?name=["'`]([\w-]+)["'`]/g,
  )) {
    registered.add(match[1]);
  }
}

if (registered.size === 0) {
  console.error("FAIL found no registered screens at all — did the navigator move?");
  process.exit(1);
}

// Names the navigator resolves without a <Screen> of its own: a parent
// navigator's own name, and the tabs reached through it.
const IMPLICIT = new Set(["Main", "Root", "Tabs", "MainTabs"]);

const failures = [];
let calls = 0;

// ── Everywhere a name is navigated to ───────────────────────────────────
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);

  for (const match of source.matchAll(
    /\bnavigat(?:e|ion\.navigate|ion\.replace|ion\.push)\s*\(\s*["'`]([\w-]+)["'`]/g,
  )) {
    calls += 1;
    const name = match[1];
    if (!registered.has(name) && !IMPLICIT.has(name)) {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${rel}:${line} navigates to "${name}", which no navigator registers`);
    }
  }

  // Tiles that carry their destination in data.
  if (rel.startsWith("src/data/")) {
    for (const match of source.matchAll(/\broute:\s*["'`]([\w-]+)["'`]/g)) {
      calls += 1;
      const name = match[1];
      if (!registered.has(name) && !IMPLICIT.has(name)) {
        const line = source.slice(0, match.index).split("\n").length;
        failures.push(`${rel}:${line} points a tile at "${name}", which no navigator registers`);
      }
    }
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: ${calls} navigation target(s) across ${registered.size} registered screen(s)`,
);
