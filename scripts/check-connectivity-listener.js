#!/usr/bin/env node
//
// A DETERMINISTIC harness for the connectivity detector, driving the REAL
// hook rather than matching strings in it.
//
// The history is why this exists. Three release candidates shipped a
// detector that had never worked, and each time the static suite was green:
// the defects were control flow and a bad document id, and regex over source
// can see neither. So this one loads useConnectionState.js, stubs React and
// Firestore underneath it, and drives the snapshot and error callbacks by
// hand — which is the only way to assert what the thing actually does.
//
// Run: node scripts/check-connectivity-listener.js

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const HOOK = path.join(root, "src", "hooks", "useConnectionState.js");

// Strip the ESM imports and re-export, then run the module body with our own
// React and Firestore in scope.
const source = fs
  .readFileSync(HOOK, "utf8")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "")
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ");

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name}: ${detail}`);
};

// ── Stubs ───────────────────────────────────────────────────────────────
function makeRuntime() {
  const listeners = [];
  let stateValue;
  let effectCleanup = null;
  let effectRuns = 0;
  let setStateAfterCleanup = 0;
  let cleanedUp = false;

  const useState = (initial) => {
    if (stateValue === undefined) stateValue = initial;
    return [
      stateValue,
      (next) => {
        if (cleanedUp) setStateAfterCleanup += 1;
        stateValue = next;
      },
    ];
  };
  const useEffect = (fn) => {
    effectRuns += 1;
    effectCleanup = fn() ?? null;
  };
  const onSnapshot = (ref, opts, onNext, onError) => {
    const entry = { ref, opts, onNext, onError, active: true };
    listeners.push(entry);
    return () => {
      entry.active = false;
    };
  };
  const doc = (_db, ...segments) => ({ segments });

  const sandbox = { module: { exports: {} } };
  new Function(
    "module",
    "useState",
    "useEffect",
    "onSnapshot",
    "doc",
    "firestore",
    "isFirebaseConfigured",
    `${source}\nmodule.exports = { useConnectionState, CONNECTION };`,
  )(sandbox.module, useState, useEffect, onSnapshot, doc, {}, true);

  const { useConnectionState, CONNECTION } = sandbox.module.exports;
  const render = () => useConnectionState();

  return {
    CONNECTION,
    render,
    state: () => stateValue,
    listeners,
    live: () => listeners.filter((l) => l.active).length,
    effectRuns: () => effectRuns,
    snapshot: (fromCache, exists = false) =>
      listeners
        .filter((l) => l.active)
        .forEach((l) => l.onNext({ metadata: { fromCache }, exists: () => exists })),
    error: (code) =>
      listeners.filter((l) => l.active).forEach((l) => l.onError({ code })),
    cleanup: () => {
      cleanedUp = true;
      if (typeof effectCleanup === "function") effectCleanup();
    },
    setStateAfterCleanup: () => setStateAfterCleanup,
  };
}

// ── K/L/M. The simplification actually happened ─────────────────────────
//
// These read the source, because "the polling is gone" is a claim about
// absence and absence cannot be driven.
{
  const raw = fs.readFileSync(HOOK, "utf8");
  const { stripComments } = require("./lib/stripComments");
  const bare = stripComments(raw);

  for (const [label, needle] of [
    ["K", "getDocFromServer"],
    ["L", "setTimeout"],
    ["L", "inFlight"],
    ["L", "epoch"],
    ["M", "ConnectivityProbe"],
    ["M", "console.log"],
  ]) {
    check(
      label,
      !bare.includes(needle),
      `"${needle}" is still present in live code — the listener-only ` +
        `simplification is incomplete, or the temporary diagnostics came back`,
    );
  }
  check(
    "K",
    !fs.existsSync(path.join(root, "src", "hooks", "connectivityMonitor.js")),
    "connectivityMonitor.js still exists — the probe state machine was not removed",
  );

  // G. The sentinel id, which is the defect that cost three candidates.
  const sentinel = bare.match(/const SENTINEL_PATH = \[([^\]]+)\]/);
  check("G", Boolean(sentinel), "SENTINEL_PATH is gone");
  if (sentinel) {
    const parts = [...sentinel[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (const segment of parts) {
      check(
        "G",
        !/^__.*__$/.test(segment),
        `sentinel segment "${segment}" matches Firestore's reserved __...__ ` +
          `pattern; Firestore rejects it with invalid-argument and the ` +
          `listener never works again`,
      );
    }
  }

  // E. Existence must never be consulted.
  check(
    "E",
    !/\.exists\(\)/.test(bare),
    "the hook reads snapshot.exists() — the sentinel is deliberately absent, " +
      "so existence would report offline permanently",
  );
  check(
    "E",
    /metadata\.fromCache/.test(bare),
    "the hook no longer reads metadata.fromCache, which is the only real " +
      "connectivity signal here",
  );
}

// ── A–D, F, H–J. Behaviour, driven. ─────────────────────────────────────

// A. cached then server-backed -> ONLINE
{
  const rt = makeRuntime();
  rt.render();
  check("A", rt.state() === rt.CONNECTION.UNKNOWN, "initial state must be UNKNOWN, not OFFLINE");
  // Without includeMetadataChanges, Firestore delivers no snapshot when only
  // the metadata changed — so cache->server never arrives and the banner
  // sticks. Silent, and invisible in any source-level reading of the hook.
  check(
    "A",
    rt.listeners[0]?.opts?.includeMetadataChanges === true,
    "the listener does not pass includeMetadataChanges — fromCache transitions " +
      "are never delivered and the detector freezes at its first value",
  );
  check(
    "A",
    rt.listeners[0]?.ref?.segments?.join("/") === "sellerStats/connection-probe",
    `the listener watches ${rt.listeners[0]?.ref?.segments?.join("/")}`,
  );
  rt.snapshot(true);
  check("A", rt.state() === rt.CONNECTION.OFFLINE, "a cached snapshot must read as OFFLINE");
  rt.snapshot(false);
  check("A", rt.state() === rt.CONNECTION.ONLINE, "a server-backed snapshot must read as ONLINE");
}

// B. server-backed then cached -> OFFLINE (runtime loss)
{
  const rt = makeRuntime();
  rt.render();
  rt.snapshot(false);
  rt.snapshot(true);
  check("B", rt.state() === rt.CONNECTION.OFFLINE, "runtime loss did not produce OFFLINE");
}

// C + D. two full cycles in one mount
{
  const rt = makeRuntime();
  rt.render();
  rt.snapshot(false);
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    rt.snapshot(true);
    check("D", rt.state() === rt.CONNECTION.OFFLINE, `cycle ${cycle}: did not go OFFLINE`);
    rt.snapshot(false);
    check("D", rt.state() === rt.CONNECTION.ONLINE, `cycle ${cycle}: did not recover to ONLINE`);
  }
  check("D", rt.live() === 1, `two cycles left ${rt.live()} live listeners`);
}

// E. a nonexistent sentinel must not itself mean offline
{
  const rt = makeRuntime();
  rt.render();
  rt.snapshot(false, false); // server-backed, document absent
  check(
    "E",
    rt.state() === rt.CONNECTION.ONLINE,
    "a server-backed snapshot of a MISSING document read as something other " +
      "than ONLINE — existence is being consulted somewhere",
  );
}

// F. a deterministic listener error must not fake an outage
{
  for (const code of ["invalid-argument", "permission-denied", "failed-precondition", "unauthenticated"]) {
    const rt = makeRuntime();
    rt.render();
    rt.snapshot(false);
    rt.error(code);
    check(
      "F",
      rt.state() === rt.CONNECTION.UNKNOWN,
      `a listener error (${code}) produced ${rt.state()} instead of UNKNOWN — ` +
        `a local configuration fault would be reported to the reader as "no ` +
        `connection", which is what the RC4 build did`,
    );
    check("F", rt.state() !== rt.CONNECTION.OFFLINE, `${code} became a false OFFLINE`);
  }
}

// H. teardown stops late updates
//
// The mechanism is the unsubscribe and nothing else. There is no `active`
// flag in the hook, deliberately: unsubscribe() is synchronous and the SDK
// does not deliver afterwards, so a guard flag would be dead code defending
// against a contract violation. What IS worth asserting is that the effect
// returns the unsubscribe at all — drop that one line and the listener
// outlives every screen that ever mounted it, silently, forever.
{
  const rt = makeRuntime();
  rt.render();
  rt.snapshot(false);
  rt.cleanup();
  check(
    "H",
    rt.live() === 0,
    "teardown left the listener subscribed — the effect is not returning " +
      "unsubscribe, so every mount leaks a permanent Firestore stream",
  );
  rt.snapshot(true); // fires only at listeners that are still subscribed
  check(
    "H",
    rt.setStateAfterCleanup() === 0,
    "a snapshot still reached setState after teardown",
  );
  check(
    "H",
    rt.state() === rt.CONNECTION.ONLINE,
    "state changed after teardown — it should hold its last value",
  );
}

// I + J. one mount, one listener, and no lifecycle machinery to duplicate it
{
  const rt = makeRuntime();
  rt.render();
  check("I", rt.live() === 1, `a single mount created ${rt.live()} listeners`);
  check("I", rt.effectRuns() === 1, `a single mount ran ${rt.effectRuns()} effects`);
  rt.snapshot(false);
  rt.snapshot(false);
  rt.snapshot(false);
  check("J", rt.live() === 1, "repeated snapshots multiplied listeners");
}

if (failures.length === 0) {
  console.log(
    "clean: the listener alone decides, from fromCache and never from " +
      "existence, and an error says UNKNOWN rather than lying about the network",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
