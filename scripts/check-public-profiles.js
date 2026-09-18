#!/usr/bin/env node
//
// A review used to be a score and a sentence with nobody attached. Showing
// who wrote it means resolving raterId -> a face, and the ways that goes
// wrong are all read-cost or privacy, so they are worth driving rather than
// grepping for.
//
// The four that matter:
//
//   * reading sellers/{uid} instead of sellerStats/{uid}. The first is
//     private — it holds push tokens and company RCCM/IFU papers — and the
//     rules deny it, so every face would silently fail.
//   * re-reading on every snapshot. The ratings listener re-fires on each
//     new review and each star change; without a cache that is N reads per
//     fire, forever, on a screen people leave open.
//   * retrying a miss. An account with no projection never gets one by
//     being asked again, so an uncached miss is an unbounded loop against
//     the one case guaranteed to fail.
//   * trusting the caller's cap. useRatings bounds the list today; a bound
//     that lives in another file is one refactor from being gone.
//
// Run: node scripts/check-reviewer-profiles.js

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const HOOK = path.join(root, "src", "hooks", "usePublicProfiles.js");

const source = fs
  .readFileSync(HOOK, "utf8")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "")
  .replace(/export function /g, "function ");

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name}: ${detail}`);
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
// Run the queue out. Each stubbed lookup costs one macrotask, so a batch of
// N needs at least N flushes; this is generous rather than exact so that a
// test asserting "the batch finished" is never really asserting "the batch
// was slow". Only the teardown case steps deliberately.
const drain = async (ticks = 400) => {
  for (let i = 0; i < ticks; i += 1) await flush();
};

function makeRuntime({ docs = {}, throwFor = [] } = {}) {
  const reads = [];
  let stateValue;
  let cleanup = null;
  let setStateAfterCleanup = 0;
  let cleanedUp = false;
  const refs = { current: undefined };

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
  // One ref object per hook instance, persisting across re-renders exactly
  // as React's does — the cache lives in it, so a fresh object each render
  // would hide the very re-read this file exists to catch.
  const useRef = (initial) => {
    if (refs.current === undefined) refs.current = { current: initial };
    return refs.current;
  };
  const useEffect = (fn) => {
    if (typeof cleanup === "function") cleanup();
    cleanedUp = false;
    cleanup = fn() ?? null;
  };
  const doc = (_db, ...segments) => ({ segments });
  const getDoc = async (ref) => {
    const p = ref.segments.join("/");
    reads.push(p);
    // One macrotask per lookup, so a single flush() advances roughly one
    // read. With an instantly-resolved stub the whole batch drains in one
    // tick and "torn down mid-flight" is unreachable.
    await new Promise((r) => setImmediate(r));
    const id = ref.segments[ref.segments.length - 1];
    if (throwFor.includes(id)) throw new Error("permission-denied");
    const data = docs[id];
    return { exists: () => Boolean(data), data: () => data };
  };

  const sandbox = { module: { exports: {} } };
  new Function(
    "module",
    "useState",
    "useEffect",
    "useRef",
    "doc",
    "getDoc",
    "firestore",
    "isFirebaseConfigured",
    `${source}\nmodule.exports = { usePublicProfiles };`,
  )(sandbox.module, useState, useEffect, useRef, doc, getDoc, {}, true);

  const { usePublicProfiles } = sandbox.module.exports;

  return {
    render: (ids) => usePublicProfiles(ids),
    profiles: () => stateValue,
    reads,
    readsOf: (collection) =>
      reads.filter((p) => p.startsWith(`${collection}/`)).length,
    teardown: () => {
      cleanedUp = true;
      if (typeof cleanup === "function") cleanup();
    },
    setStateAfterCleanup: () => setStateAfterCleanup,
  };
}

(async () => {
  // G. The collection. This is the privacy one.
  {
    const rt = makeRuntime({ docs: { u1: { displayName: "Ada", photoUrl: "p" } } });
    rt.render(["u1"]);
    await drain();
    check(
      "G",
      rt.readsOf("sellerStats") === 1,
      `expected one sellerStats read, saw ${JSON.stringify(rt.reads)}`,
    );
    check(
      "G",
      rt.readsOf("sellers") === 0,
      `the hook read sellers/{uid} — that document is private (push tokens, ` +
        `RCCM/IFU papers) and the rules deny it to everyone but its owner, ` +
        `so every reviewer face would fail`,
    );
  }

  // A. A resolved profile carries both fields.
  {
    const rt = makeRuntime({
      docs: { u1: { displayName: "Ada Lovelace", photoUrl: "https://x/a.jpg" } },
    });
    rt.render(["u1"]);
    await drain();
    check("A", rt.profiles().u1?.displayName === "Ada Lovelace", "name lost");
    check("A", rt.profiles().u1?.photoUrl === "https://x/a.jpg", "photo lost");
  }

  // B. No projection yet -> a null entry, not a crash and not a gap.
  {
    const rt = makeRuntime({ docs: {} });
    rt.render(["ghost"]);
    await drain();
    check(
      "B",
      Object.prototype.hasOwnProperty.call(rt.profiles(), "ghost"),
      "a rater with no sellerStats document is absent from the map entirely, " +
        "so the card cannot tell 'still loading' from 'has no picture'",
    );
    check("B", rt.profiles().ghost === null, "a miss should resolve to null");
  }

  // C. One failure must not cost the others their faces.
  {
    const rt = makeRuntime({
      docs: { good: { displayName: "Ada", photoUrl: "p" } },
      throwFor: ["bad"],
    });
    rt.render(["bad", "good"]);
    await drain();
    check(
      "C",
      rt.profiles().good?.displayName === "Ada",
      "a failed lookup for one reviewer lost the profile of another — this " +
        "is the all-or-nothing shape that made Saved listings show " +
        "'unavailable' for a screenful of good rows",
    );
    check("C", rt.profiles().bad === null, "the failed one should be null");
  }

  // D + I. The cache. Re-render with the same ids costs nothing, and a miss
  //        is never retried.
  {
    const rt = makeRuntime({ docs: { u1: { displayName: "Ada" } } });
    rt.render(["u1", "ghost"]);
    await drain();
    const first = rt.reads.length;
    for (let i = 0; i < 5; i += 1) {
      rt.render(["u1", "ghost"]);
      await drain();
    }
    check(
      "D",
      rt.reads.length === first,
      `re-rendering re-read profiles: ${first} reads became ${rt.reads.length}. ` +
        `The ratings listener re-fires on every new review, so this is a ` +
        `permanent per-render read cost on an open screen`,
    );
    check(
      "I",
      rt.reads.filter((p) => p.endsWith("/ghost")).length === 1,
      "a rater with no projection was re-read — asking again never creates " +
        "one, so this is an unbounded loop against a guaranteed miss",
    );
  }

  // H. The same person reviewing twice is still one read.
  {
    const rt = makeRuntime({ docs: { u1: { displayName: "Ada" } } });
    rt.render(["u1", "u1", "u1"]);
    await drain();
    check("H", rt.reads.length === 1, `duplicate ids caused ${rt.reads.length} reads`);
  }

  // E. The hook's own cap, independent of the caller's.
  {
    const many = Array.from({ length: 200 }, (_, i) => `u${i}`);
    const rt = makeRuntime({ docs: {} });
    rt.render(many);
    await drain();
    const cap = Number(source.match(/const MAX_LOOKUPS = (\d+)/)?.[1] ?? 0);
    check("E", cap > 0 && cap <= 50, `MAX_LOOKUPS is ${cap}`);
    check(
      "E",
      rt.reads.length <= cap,
      `handed 200 ids the hook performed ${rt.reads.length} reads — it is ` +
        `relying on the caller's bound, which is one refactor from gone`,
    );
  }

  // F. Teardown, torn down MID-FLIGHT.
  //
  // Tearing down before the first lookup resolves proves nothing: the whole
  // batch is still queued and any implementation looks correct. The case
  // that matters is a screen closed with lookups already in progress, which
  // is what closing a busy profile actually does. So this lets a few
  // resolve, then tears down, and asserts the rest were abandoned — the
  // same guard that stops the state update stops the spending.
  {
    const docs = {};
    for (let i = 0; i < 20; i += 1) docs[`u${i}`] = { displayName: `N${i}` };
    const rt = makeRuntime({ docs });
    rt.render(Object.keys(docs));
    for (let i = 0; i < 3; i += 1) await flush();
    const midFlight = rt.reads.length;
    check(
      "F",
      midFlight > 0 && midFlight < 20,
      `harness precondition: expected to be mid-flight, saw ${midFlight}/20 ` +
        `reads done — the guard cannot be tested from a standing start`,
    );
    rt.teardown();
    for (let i = 0; i < 40; i += 1) await flush();
    check(
      "F",
      rt.reads.length === midFlight,
      `${rt.reads.length - midFlight} further profile read(s) were paid for ` +
        `after the screen closed — a profile abandoned with lookups pending ` +
        `goes on spending until the batch drains`,
    );
    check(
      "F",
      rt.setStateAfterCleanup() === 0,
      "a lookup that resolved after the screen closed still called setState",
    );
  }

  // ── The card itself ───────────────────────────────────────────────────
  //
  // The harness above drives the hook; these read the screen, because a
  // perfectly resolved profile still has to reach a pixel.
  {
    const { stripComments } = require("./lib/stripComments");
    const SCREEN = path.join(root, "src", "screens", "SellerProfileScreen.js");
    const screen = stripComments(fs.readFileSync(SCREEN, "utf8"));

    if (!/reviewerProfiles\[item\.raterId\]\?\.photoUrl/.test(screen)) {
      failures.push(
        "J: the review card no longer reads the reviewer's photoUrl — the " +
          "lookup still runs and still costs reads, but no face reaches the " +
          "screen",
      );
    }
    if (!/<PublicAvatar/.test(screen)) {
      failures.push(
        "J: the review card no longer renders PublicAvatar — that component " +
          "is what falls back to an initial when a photoUrl is present but " +
          "fails to load, which otherwise draws an empty circle forever",
      );
    }
    // The name must never render as the literal "undefined", which is what
    // an unresolved lookup produces if the fallback is dropped.
    if (!/\?\.displayName \?\?\s*\n?\s*t\("ratingAnonymous"\)/.test(screen)) {
      failures.push(
        'K: the reviewer name has no translated fallback — an unresolved or ' +
          'missing profile renders as blank or as "undefined" next to a star ' +
          'rating somebody is using to decide whether to trust a stranger',
      );
    }
    // The private collection must not be reached for this, from either side.
    if (/doc\(\s*firestore,\s*"sellers"/.test(screen)) {
      failures.push(
        "L: the profile screen reads sellers/{uid} directly — that document " +
          "is readable only by its owner, so this fails for every visitor",
      );
    }
    if (!/usePublicProfiles\(/.test(screen)) {
      failures.push("M: the screen no longer calls usePublicProfiles");
    }
  }

  if (failures.length === 0) {
    console.log(
      "clean: reviewer faces come from the public projection, are read once " +
        "each, and a miss or a refusal costs one initial rather than the list",
    );
  }
  for (const f of failures) console.log(`FAIL ${f}`);
  if (failures.length) console.log(`\n${failures.length} failing`);
  process.exit(failures.length ? 1 : 0);
})();
