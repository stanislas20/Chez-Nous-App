#!/usr/bin/env node
//
// Events are found by when they happen, and the screen asks again.
//
// Three defects, and only the first was reported:
//
//   THE SCREEN NEVER ASKED AGAIN. useCategoryListings is a one-shot read
//   behind a module-level cache, and the Events screen had no focus
//   refresh, no pull, nothing. An event approved while the app was open did
//   not appear until the app was restarted. Nothing was stale in Firestore.
//
//   THE WRONG CLOCK. That hook orders by createdAt. A concert announced in
//   January and happening in June is older than every listing posted since,
//   so a busy spring pushes a real upcoming event out of the window — and
//   the screen cannot show what it never fetched.
//
//   THE PAST IN THE WINDOW. Every event that had already happened still
//   occupied a slot, was paid for, and was thrown away client-side.
//
// The query is CONSTRUCTED here against a stubbed Firestore and the
// constraints are read back, so "ordered by event date" is asserted against
// what the hook actually builds rather than against the words near it.
//
// Run: node scripts/check-events-freshness.js
if (!process.env.NODE_NO_WARNINGS) {
  const { spawnSync } = require("child_process");
  const again = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  process.exit(again.status ?? 1);
}

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };
const eq = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

(async () => {
  const url = (rel) => require("url").pathToFileURL(path.join(root, rel)).href;
  const { eventWindowsFor, startOfDayMs } = await import(url("src/data/events.js"));

  // ── 1. Day boundaries ────────────────────────────────────────────────
  //
  // The mistake this guards is `eventDateMs >= Date.now()`, which drops a
  // concert that starts at eight the moment the clock passes eight.
  const NOW = new Date("2026-06-15T20:30:00").getTime();
  const at = (iso) => new Date(iso).getTime();
  const DAY = 86400000;

  eq("startOfDayMs is midnight this morning, not now",
    startOfDayMs(NOW), at("2026-06-15T00:00:00"));
  if (startOfDayMs(NOW) > NOW - 1000)
    fail("startOfDayMs returned something at or after 'now' — an event earlier today would be excluded");

  const cases = [
    ["yesterday evening", at("2026-06-14T21:00:00"), false],
    ["yesterday one minute to midnight", at("2026-06-14T23:59:00"), false],
    ["today, already started", at("2026-06-15T08:00:00"), true],
    ["today, later tonight", at("2026-06-15T22:00:00"), true],
    ["today at midnight exactly", at("2026-06-15T00:00:00"), true],
    ["tomorrow", at("2026-06-16T19:00:00"), true],
    ["next week", at("2026-06-24T19:00:00"), true],
    ["next year", at("2027-01-10T19:00:00"), true],
  ];
  for (const [label, ms, eligible] of cases) {
    const windows = eventWindowsFor(ms, NOW);
    const shown = windows.length > 0;
    if (shown !== eligible)
      fail(`${label}: ${shown ? "shown" : "hidden"}, expected ${eligible ? "shown" : "hidden"}`);
    // And the query filter must agree with the classifier, or one of them
    // fetches what the other throws away.
    const passesQuery = ms >= startOfDayMs(NOW);
    if (passesQuery !== eligible)
      fail(`${label}: the query filter and eventWindowsFor disagree (query ${passesQuery}, windows ${eligible})`);
  }
  // The classification the screen groups by still works.
  if (!eventWindowsFor(at("2026-06-15T22:00:00"), NOW).includes("week"))
    fail("an event tonight is no longer in the week window");
  if (!eventWindowsFor(at("2026-06-24T19:00:00"), NOW).includes("later"))
    fail("an event beyond six days is no longer in the later window");
  // 2026-06-20 is a Saturday.
  if (!eventWindowsFor(at("2026-06-20T19:00:00"), NOW).includes("weekend"))
    fail("a Saturday event is no longer in the weekend window");

  // ── 2. The query, as the hook actually builds it ─────────────────────
  const built = [];
  const stub = {
    collection: (_db, name) => ({ __collection: name }),
    where: (field, op, value) => ({ __t: "where", field, op, value }),
    orderBy: (field, dir) => ({ __t: "orderBy", field, dir }),
    limit: (n) => ({ __t: "limit", n }),
    query: (base, ...parts) => { built.push({ base, parts }); return { __query: true }; },
    getDocs: async () => ({ docs: [] }),
  };
  const file = path.join(root, "src/hooks/useUpcomingEvents.js");
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const table = {
    "firebase/firestore": stub,
    "../config/firebase": { firestore: {}, isFirebaseConfigured: true },
    react: { useCallback: (fn) => fn, useEffect: () => {}, useState: () => [0, () => {}] },
  };
  m.require = (id) => (id in table ? table[id] : Module.prototype.require.call(m, id));
  const babel = require("@babel/core");
  m._compile(
    babel.transformFileSync(file, {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
    }).code,
    file,
  );
  const hook = m.exports;
  await hook.useUpcomingEvents().refresh();

  if (built.length !== 1) fail(`the hook built ${built.length} queries; expected 1`);
  else {
    const { base, parts } = built[0];
    eq("the query reads listings", base.__collection, "listings");
    const wheres = parts.filter((p) => p.__t === "where");
    const orders = parts.filter((p) => p.__t === "orderBy");
    const limits = parts.filter((p) => p.__t === "limit");

    const byField = Object.fromEntries(wheres.map((w) => [w.field, w]));
    eq("approved only", byField.status && [byField.status.op, byField.status.value], ["==", "approved"]);
    eq("the events category only", byField.categoryKey && [byField.categoryKey.op, byField.categoryKey.value], ["==", "events"]);
    if (!byField.eventDateMs)
      fail("the query does not filter on eventDateMs — past events would fill the window");
    else {
      eq("upcoming only, inclusive", byField.eventDateMs.op, ">=");
      // Must be midnight, not now.
      const boundary = byField.eventDateMs.value;
      const d = new Date(boundary);
      if (d.getHours() || d.getMinutes() || d.getSeconds())
        fail(`the date boundary is ${d.toISOString()}, not midnight — an event earlier today would be dropped`);
    }
    if (byField.createdAt)
      fail("the query still filters on createdAt — event chronology must not depend on when a listing was posted");

    eq("ordered by when the event happens", orders.map((o) => [o.field, o.dir]), [["eventDateMs", "asc"]]);
    if (orders.some((o) => o.field === "createdAt"))
      fail("the query still ORDERS by createdAt — an old listing for a future event would fall out of the window");
    if (limits.length !== 1) fail("the query is unbounded");
  }

  // ── 3. The screen asks again ─────────────────────────────────────────
  const screen = stripComments(read("src/screens/EventsScreen.js"));
  if (!/useFocusEffect\(/.test(screen))
    fail("the Events screen does not refresh on focus — an event approved while the app is open would need a restart to appear");
  if (!/refresh\(\)/.test(screen))
    fail("the Events screen never calls refresh");
  // The PROP, not the import. Deleting the refreshControl={...} attribute
  // leaves `import { RefreshControl }` behind, so testing for the name
  // alone passed on a list that no longer has a pull.
  if (!/refreshControl=\{/.test(screen))
    fail("the Events list has no pull-to-refresh — the gesture people already try does nothing");
  if (!/<RefreshControl/.test(screen))
    fail("the refreshControl prop is not a RefreshControl");
  if (!/onRefresh=\{onRefresh\}/.test(screen))
    fail("the pull is not wired to the same refresh the focus effect uses");
  // One way to re-read, not two.
  const ownQuery = /getDocs\(|onSnapshot\(/.test(screen);
  if (ownQuery)
    fail("the Events screen queries Firestore directly — the hook owns the query");

  const events = stripComments(read("src/hooks/useEvents.js"));
  if (!/useUpcomingEvents\(\)/.test(events))
    fail("useEvents no longer reads the events-specific hook");
  if (/useCategoryListings/.test(events))
    fail("useEvents is back on the generic category hook, which orders by createdAt");
  if (!/return \{ events, refresh \}/.test(events))
    fail("useEvents no longer hands back a refresh, so the screen cannot ask again");

  // ── 4. The generic hook is untouched ─────────────────────────────────
  //
  // It serves a dozen other categories. Making it realtime to fix Events
  // would change read behaviour for all of them.
  const generic = stripComments(read("src/hooks/useCategoryListings.js"));
  if (/onSnapshot/.test(generic))
    fail("useCategoryListings has become a realtime listener — that changes bounded-read behaviour for every other category");
  if (/eventDateMs/.test(generic))
    fail("useCategoryListings has grown event-specific logic");
  // And the events hook must not be a listener either.
  const upcoming = stripComments(read("src/hooks/useUpcomingEvents.js"));
  if (/onSnapshot/.test(upcoming))
    fail("the events hook holds an open subscription for everybody on the tab — it is a one-shot read that re-asks on focus");

  // ── 5. Still no invented events ──────────────────────────────────────
  if (/beninFestivals|festivalsFromNow/.test(events) || /beninFestivals/.test(upcoming))
    fail("the curated festivals have leaked into the posted-events data path — they are not user-posted events");
  for (const rel of ["src/hooks/useEvents.js", "src/hooks/useUpcomingEvents.js"]) {
    if (/SAMPLE|sampleEvents|MOCK_|demoEvents/i.test(stripComments(read(rel))))
      fail(`${rel} ships sample events`);
  }
  // The festivals stay, and stay separate.
  if (!fs.existsSync(path.join(root, "src/data/beninFestivals.js")))
    fail("beninFestivals.js was deleted — the curated calendar is deliberate content");
  if (!/festivalsTitle|festivalsIntro/.test(screen))
    fail("the festivals section lost its heading and introduction, which are what mark it as not user-posted");
  if (!/ListFooterComponent/.test(screen))
    fail("the festivals are no longer below the posted events");

  // ── 6. The index the query needs is declared ─────────────────────────
  const indexes = JSON.parse(read("firestore.indexes.json"));
  const wanted = ["status:ASCENDING", "categoryKey:ASCENDING", "eventDateMs:ASCENDING"].join(",");
  const has = indexes.indexes.some(
    (i) =>
      i.collectionGroup === "listings" &&
      i.fields.map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(",") === wanted,
  );
  if (!has)
    fail("firestore.indexes.json does not declare (status, categoryKey, eventDateMs) — the query fails at runtime and the screen goes empty");

  if (failures) process.exit(1);
  console.log(
    "clean: events freshness — the query asks for approved events dated from " +
      "midnight today, ordered by when they happen and never by createdAt; " +
      "the screen re-asks on focus and on a pull; the generic category hook " +
      "is untouched; and the curated festivals stay separate",
  );
})().catch((error) => {
  console.error(`FAIL the checker itself threw: ${error.stack}`);
  process.exit(1);
});
