#!/usr/bin/env node
//
// Reconciling the historical pages of a conversation, driven.
//
// The live window looks after itself. Older pages are read once with getDocs
// and never watched again, so a message the other person deletes while you
// are scrolled back stays on your screen — and for a delete feature whose
// whole promise is that the content is gone, "until you reopen it" is not
// good enough. Reconciliation on focus closes that.
//
// Both defects this file exists for are TIMING, and timing cannot be asserted
// by reading source:
//
//   * a result computed for one window, applied after another page has been
//     loaded, deleted the page the user had just pulled in — because a
//     message outside the checked range is absent from `alive` through no
//     fault of its own. It looked exactly like losing data.
//   * two independent signals (AppState and navigation focus) flip in
//     separate commits for one real transition, so one resume issued two
//     count queries and two racing filters.
//
// So the real functions are lifted out and run against stubs with a
// controllable clock.
//
// Run: node scripts/check-history-reconcile.js

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SCREEN = path.join(root, "src", "screens", "ChatScreen.js");
const source = fs.readFileSync(SCREEN, "utf8");

function extract(name) {
  const start = source.search(new RegExp(`^(async )?function ${name}\\(`, "m"));
  if (start === -1) throw new Error(`${name} is gone from ChatScreen`);

  // Walk the PARAMETER list to its closing paren first. Taking the next "{"
  // after the name grabs a destructured parameter instead of the body, which
  // truncates the extraction at the parameter's closing brace and produces
  // source that parses as nonsense.
  let i = source.indexOf("(", start);
  let parens = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === "(") parens += 1;
    else if (source[i] === ")") {
      parens -= 1;
      if (parens === 0) break;
    }
  }

  let depth = 0;
  i = source.indexOf("{", i);
  for (; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(start, i + 1);
}

// `module.exports = …` inside new Function is a syntax error in this context,
// so the lifted functions are handed back through a returned object instead.
const { reconcileWindow, survivesReconcile, reconcileLoadedHistory } =
  new Function(
    `${extract("reconcileWindow")}
${extract("survivesReconcile")}
${extract("reconcileLoadedHistory")}
return { reconcileWindow, survivesReconcile, reconcileLoadedHistory };`,
  )();

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name}: ${detail}`);
};

// A Firestore Timestamp is only ever asked for toMillis() here.
const ts = (ms) => ({ toMillis: () => ms });
const msg = (id, ms) => ({ id, createdAt: ms === null ? null : ts(ms) });

// A stubbed Firestore whose two awaits can be held open, so "while the
// request is in flight" is a state the test can actually be in.
function makeApi({ count, aliveIds, failOn = null }) {
  const calls = { count: 0, docs: 0 };
  const countWaiters = [];
  const docWaiters = [];
  const api = {
    query: (...args) => args,
    where: (...args) => args,
    orderBy: (...args) => args,
    getCountFromServer: async () => {
      calls.count += 1;
      if (failOn === "count") throw new Error("count failed");
      await new Promise((r) => countWaiters.push(r));
      return { data: () => ({ count }) };
    },
    getDocs: async () => {
      calls.docs += 1;
      if (failOn === "docs") throw new Error("docs failed");
      await new Promise((r) => docWaiters.push(r));
      return { docs: aliveIds.map((id) => ({ id })) };
    },
  };
  return {
    api,
    calls,
    // Releases EVERY waiting request, so an extra cycle that should never
    // have started cannot hide behind the one that should.
    releaseCount: () => countWaiters.splice(0).forEach((r) => r()),
    releaseDocs: () => docWaiters.splice(0).forEach((r) => r()),
  };
}

const flush = () => new Promise((r) => setImmediate(r));

// A watchdog, because the obvious failure of a suite built on held promises
// is not a failed assertion — it is a HANG. Remove the in-flight guard and
// the second cycle blocks on a promise nothing will resolve; the event loop
// then empties, node exits 0 with most of this file never executed, and a
// mutation run reads that as a pass. This turns silence into a failure.
const watchdog = setTimeout(() => {
  console.log(
    "FAIL the suite did not finish. Something is awaiting a request that was " +
      "never released — most likely a cycle that should have been refused by " +
      "the in-flight guard, or a short-circuit that no longer stops early.",
  );
  process.exit(1);
}, 10000);

function makeRun({ loaded, count, aliveIds, failOn = null }) {
  const state = { messages: [...loaded] };
  const inFlightRef = { current: false };
  const errors = [];
  const stub = makeApi({ count, aliveIds, failOn });
  const start = (override) =>
    reconcileLoadedHistory({
      loaded: override ?? state.messages,
      inFlightRef,
      collectionRef: "messages",
      api: stub.api,
      applySurvivors: (lo, hi, alive) => {
        state.messages = state.messages.filter((m) =>
          survivesReconcile(m, lo, hi, alive),
        );
      },
      onError: (e) => errors.push(e),
    });
  return { state, inFlightRef, errors, start, ...stub };
}

(async () => {
  // ── B ────────────────────────────────────────────────────────────────
  {
    const loaded = [msg("a", 300), msg("b", 200), msg("c", 100)];
    const run = makeRun({ loaded, count: 2, aliveIds: ["a", "c"] });
    const p = run.start();
    await flush();
    run.releaseCount();
    await flush();
    run.releaseDocs();
    const outcome = await p;
    check("B", outcome === "reconciled", `outcome was ${outcome}`);
    check(
      "B",
      run.state.messages.map((m) => m.id).join(",") === "a,c",
      `a message deleted inside the checked range was not removed: ` +
        `${run.state.messages.map((m) => m.id).join(",")}`,
    );
  }

  // ── A. THE DEFECT: a page loaded WHILE reconciliation is in flight ────
  //
  // The reconcile is started over [100..300]. Mid-flight the user loads an
  // older page — 50 and 40, both below the window. The result speaks only
  // for [100..300] and cannot say anything about them.
  {
    const loaded = [msg("a", 300), msg("b", 200), msg("c", 100)];
    const run = makeRun({ loaded, count: 2, aliveIds: ["a", "c"] });
    const p = run.start();
    await flush();
    run.releaseCount();
    // The page arrives between the two awaits.
    run.state.messages.push(msg("older1", 50), msg("older2", 40));
    await flush();
    run.releaseDocs();
    await p;
    const ids = run.state.messages.map((m) => m.id).join(",");
    check(
      "A",
      ids.includes("older1") && ids.includes("older2"),
      `a page loaded while reconciliation was in flight was deleted from the ` +
        `screen (${ids}). Those messages are older than the window that was ` +
        `checked, so their absence from the result says nothing about them — ` +
        `filtering on the id list alone wipes the page the user just pulled in`,
    );
    check("A", !ids.includes("b"), `the genuinely deleted message survived (${ids})`);
  }

  // ── C / D. Outside the window in either direction, survive ────────────
  {
    const loaded = [msg("a", 300), msg("b", 200), msg("c", 100)];
    const run = makeRun({ loaded, count: 2, aliveIds: ["a", "c"] });
    const p = run.start();
    await flush();
    run.releaseCount();
    run.state.messages.push(msg("older", 10), msg("newer", 9000));
    await flush();
    run.releaseDocs();
    await p;
    const ids = run.state.messages.map((m) => m.id);
    check("C", ids.includes("older"), "a message older than the window was removed");
    check("D", ids.includes("newer"), "a message newer than the window was removed");
  }

  // ── E. Unresolved serverTimestamp survives ───────────────────────────
  {
    const loaded = [msg("a", 300), msg("b", 200), msg("c", 100)];
    const run = makeRun({ loaded, count: 2, aliveIds: ["a", "c"] });
    const p = run.start();
    await flush();
    run.releaseCount();
    run.state.messages.push(msg("pending", null));
    await flush();
    run.releaseDocs();
    await p;
    check(
      "E",
      run.state.messages.some((m) => m.id === "pending"),
      "a message whose serverTimestamp has not resolved was removed — it " +
        "cannot be placed in any window, so no window may judge it",
    );
  }
  // And the window itself refuses to be computed from an unresolved page.
  check(
    "E",
    reconcileWindow([msg("a", 300), msg("pending", null)]) === null,
    "a range was computed across an unresolved timestamp",
  );

  // ── F. A second invocation while one is running issues no request ─────
  {
    const loaded = [msg("a", 300), msg("b", 200), msg("c", 100)];
    const run = makeRun({ loaded, count: 2, aliveIds: ["a", "c"] });
    const first = run.start();
    await flush();
    const second = await run.start();
    check("F", second === "busy", `the overlapping cycle returned ${second}`);
    check(
      "F",
      run.calls.count === 1,
      `${run.calls.count} count requests were issued for one transition — ` +
        `AppState and navigation focus flip separately for a single resume`,
    );
    run.releaseCount();
    await flush();
    run.releaseDocs();
    await first;
  }

  // ── G. The guard resets after success ────────────────────────────────
  {
    const loaded = [msg("a", 300), msg("b", 200)];
    const run = makeRun({ loaded, count: 2, aliveIds: ["a", "b"] });
    const p = run.start();
    await flush();
    run.releaseCount();
    const outcome = await p;
    check("G", outcome === "unchanged", `outcome was ${outcome}`);
    check("G", run.inFlightRef.current === false, "the guard stayed set after success");
  }

  // ── H / I. The guard resets after failure, and a retry can run ───────
  {
    const loaded = [msg("a", 300), msg("b", 200)];
    const run = makeRun({ loaded, count: 2, aliveIds: [], failOn: "count" });
    const outcome = await run.start();
    check("H", outcome === "failed", `outcome was ${outcome}`);
    check(
      "H",
      run.inFlightRef.current === false,
      "the guard stayed set after a thrown request — the screen could never " +
        "reconcile again for the rest of its life",
    );
    check("H", run.errors.length === 1, "the failure was not reported");
    // I. A later legitimate focus still works.
    const run2 = makeRun({ loaded, count: 1, aliveIds: ["a"] });
    const p = run2.start();
    await flush();
    run2.releaseCount();
    await flush();
    run2.releaseDocs();
    check("I", (await p) === "reconciled", "a retry after a failure could not run");
  }
  // The same, for a failure in the second request rather than the first.
  {
    const loaded = [msg("a", 300), msg("b", 200)];
    const run = makeRun({ loaded, count: 1, aliveIds: [], failOn: "docs" });
    const p = run.start();
    await flush();
    run.releaseCount();
    const outcome = await p;
    check("H", outcome === "failed", `docs failure returned ${outcome}`);
    check("H", run.inFlightRef.current === false, "the guard stayed set after a docs failure");
    check(
      "H",
      run.state.messages.length === 2,
      "a failed reconcile removed messages — it must leave the stale copy on " +
        "screen rather than clearing the thread",
    );
  }

  // ── L. No historical messages: no request at all ─────────────────────
  {
    const run = makeRun({ loaded: [], count: 0, aliveIds: [] });
    const outcome = await run.start([]);
    check("L", outcome === "nothing-to-do", `outcome was ${outcome}`);
    check(
      "L",
      run.calls.count === 0 && run.calls.docs === 0,
      `${run.calls.count} count / ${run.calls.docs} doc requests were issued ` +
        `with nothing loaded — opening a conversation must cost nothing here`,
    );
  }

  // ── The cheap path: an unchanged count never re-reads the range ───────
  {
    const loaded = [msg("a", 300), msg("b", 200), msg("c", 100)];
    const run = makeRun({ loaded, count: 3, aliveIds: ["a", "b", "c"] });
    const p = run.start();
    await flush();
    run.releaseCount();
    check("M", (await p) === "unchanged", "an unchanged count did not stop early");
    check(
      "M",
      run.calls.docs === 0,
      "the range was re-read although the count was unchanged — that is a " +
        "read per loaded message on every focus, for the common case where " +
        "nothing was deleted",
    );
    check("M", run.state.messages.length === 3, "an unchanged count altered the list");
  }

  // ── J / K. Only focus and foreground may start a cycle ───────────────
  //
  // Source-level, because "a rerender does not do this" is a statement about
  // the dependency list rather than about a value.
  {
    const { stripComments } = require("./lib/stripComments");
    const bare = stripComments(source);
    // The dependency list of the reconciler's useCallback, read by slicing
    // from its declaration to the first "[...]" that follows the closing of
    // the call — whitespace-insensitive, because formatting is not the rule.
    const declared = bare.slice(bare.indexOf("const reconcileOlderMessages = useCallback("));
    const deps = declared.slice(0, declared.indexOf(");") + 2).match(/\[([^\]]*)\],\s*\)/);
    check(
      "J",
      deps && deps[1].trim() === "conversationId",
      `the reconciler's dependencies are [${deps ? deps[1].trim() : "?"}] ` +
        `rather than [conversationId]. Taking olderMessages rebuilds the ` +
        `callback on every page load and re-fires the effect that uses it, ` +
        `turning one load into a reconcile cycle`,
    );
    check(
      "K",
      /\}, \[isFocused, appActive, reconcileOlderMessages\]\);/.test(bare),
      "the reconcile effect's dependencies changed. Sending, editing and " +
        "loading a page must not start a cycle; only focus and foreground may",
    );
    check(
      "K",
      /const reconcileInFlightRef = useRef\(false\);/.test(bare),
      "the in-flight guard is no longer a ref — state would re-render and " +
        "re-enter the effect it guards",
    );
  }

  clearTimeout(watchdog);
  if (failures.length === 0) {
    console.log(
      "clean: a reconcile speaks only for the window it checked, one " +
        "transition costs one cycle, and a failure leaves the screen able to " +
        "try again",
    );
  }
  for (const f of failures) console.log(`FAIL ${f}`);
  if (failures.length) console.log(`\n${failures.length} failing`);
  process.exit(failures.length ? 1 : 0);
})();
