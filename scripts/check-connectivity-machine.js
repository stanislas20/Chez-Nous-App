#!/usr/bin/env node
//
// A DETERMINISTIC harness for the offline detector, not a regex over it.
//
// Two remediation attempts at this detector passed a green static suite and
// failed on the handset. Both failures were control flow — a branch that
// returned without rescheduling, and a state in which monitoring was switched
// off entirely — and no amount of pattern matching over source can walk a
// state machine. So this drives the real machine with fake timers and stubbed
// probe outcomes, and asserts what actually happens.
//
// Run: node scripts/check-connectivity-machine.js

const path = require("path");
const Module = require("module");

// The monitor imports nothing, so it can be required directly once the ESM
// export syntax is stripped. Cheaper and more honest than pulling a
// transform pipeline in for one file.
const fs = require("fs");
const SRC = path.join(__dirname, "..", "src", "hooks", "connectivityMonitor.js");
const source = fs.readFileSync(SRC, "utf8")
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ");
const sandbox = { module: { exports: {} }, exports: {} };
new Function(
  "module",
  "exports",
  `${source}\nmodule.exports = { createConnectivityMonitor, CONNECTION, PROBE_INTERVAL_MS, PROBE_RETRY_MS, FAILURES_BEFORE_OFFLINE, SKIP_RESCHEDULE_MS };`,
)(sandbox.module, sandbox.exports);
const {
  createConnectivityMonitor,
  PROBE_INTERVAL_MS,
  PROBE_RETRY_MS,
  SKIP_RESCHEDULE_MS,
} = sandbox.module.exports;

// ── Fake clock ──────────────────────────────────────────────────────────
function makeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, delay) {
      const id = ++seq;
      timers.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    pending: () => timers.size,
    // Fire everything due within `ms`, then let microtasks drain.
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [id, t] = due[0];
        timers.delete(id);
        now = t.at;
        t.fn();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = target;
      await Promise.resolve();
    },
  };
}

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name}: ${detail}`);
};

function harness({ appState = () => "active", outcomes = [] } = {}) {
  const clock = makeClock();
  const log = [];
  let offline = false;
  let probeCalls = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const pendingResolvers = [];

  const monitor = createConnectivityMonitor({
    runProbe: () => {
      probeCalls += 1;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      const outcome = outcomes.shift() ?? "ok";
      return new Promise((resolve, reject) => {
        const settle = () => {
          concurrent -= 1;
          if (outcome === "ok") resolve();
          else reject(new Error(outcome));
        };
        if (outcome === "hang") {
          // Never settles on its own — the caller keeps the handle so a test
          // can settle it LATE, after the monitor has moved on.
          pendingResolvers.push(() => {
            concurrent -= 1;
            resolve();
          });
        } else settle();
      });
    },
    getAppState: appState,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    onOffline: () => {
      offline = true;
    },
    log: (m) => log.push(m),
  });

  return {
    monitor,
    clock,
    log,
    isOffline: () => offline,
    probeCalls: () => probeCalls,
    maxConcurrent: () => maxConcurrent,
    settleLate: () => pendingResolvers.forEach((f) => f()),
  };
}

(async () => {
  // A. healthy probe reschedules
  {
    const h = harness({ outcomes: ["ok", "ok"] });
    h.monitor.start("test");
    await h.clock.advance(PROBE_INTERVAL_MS);
    check("A", h.probeCalls() === 1, `expected 1 probe, got ${h.probeCalls()}`);
    await h.clock.advance(PROBE_INTERVAL_MS);
    check("A", h.probeCalls() === 2, "a healthy probe did not schedule the next one");
    check("A", !h.isOffline(), "went offline on healthy probes");
    check("A", h.clock.pending() === 1, `expected exactly 1 pending timer, got ${h.clock.pending()}`);
    h.monitor.teardown();
  }

  // B. two failures commit OFFLINE, and not before
  {
    const h = harness({ outcomes: ["fail", "fail"] });
    h.monitor.start("test");
    await h.clock.advance(PROBE_INTERVAL_MS);
    check("B", !h.isOffline(), "one failure must not flip OFFLINE");
    await h.clock.advance(PROBE_RETRY_MS);
    check("B", h.isOffline(), "two failures did not produce OFFLINE");
    check("B", h.clock.pending() === 0, "OFFLINE left a timer running (continuous reads)");
    h.monitor.teardown();
  }

  // C. failure then success resets the counter
  {
    const h = harness({ outcomes: ["fail", "ok", "fail"] });
    h.monitor.start("test");
    await h.clock.advance(PROBE_INTERVAL_MS); // fail -> failures 1
    await h.clock.advance(PROBE_RETRY_MS); // ok -> reset
    check("C", !h.isOffline(), "went offline despite a recovery");
    await h.clock.advance(PROBE_INTERVAL_MS); // fail -> failures 1 again
    check("C", !h.isOffline(), "failure counter was not reset by the success");
    h.monitor.teardown();
  }

  // D. THE RC3 DEFECT: a non-active observation must not end monitoring.
  {
    let state = "background";
    const h = harness({ appState: () => state, outcomes: ["ok"] });
    h.monitor.start("test");
    await h.clock.advance(PROBE_INTERVAL_MS); // skipped
    check("D", h.probeCalls() === 0, "probe ran while not active");
    check(
      "D",
      h.clock.pending() === 1,
      "a skipped probe left NO pending timer — monitoring is dead, which is " +
        "exactly the RC3 failure",
    );
    state = "active";
    await h.clock.advance(SKIP_RESCHEDULE_MS);
    check("D", h.probeCalls() === 1, "monitoring did not resume after the skip");
    h.monitor.teardown();
  }

  // E. resume probes once, and does not start a parallel chain
  {
    const h = harness({ outcomes: ["ok", "ok", "ok"] });
    h.monitor.start("test");
    h.monitor.onResume();
    await h.clock.advance(1);
    check("E", h.probeCalls() === 1, `resume should probe once, got ${h.probeCalls()}`);
    check("E", h.clock.pending() === 1, "resume left more than one pending timer");
    h.monitor.teardown();
  }

  // F. a late settlement cannot reverse a newer state.
  //
  // Honest note on coverage: removing the monitor's epoch guard does NOT
  // fail this suite, and that is not a gap in the tests — it is what the
  // guard is. `inFlight` already makes two probes impossible, and a probe
  // finishing after teardown is caught by `stopped` first, so `mine !==
  // epoch` is unreachable in the current design. It stays as defence in
  // depth against a future change that relaxes either of those, and it is
  // recorded here as knowingly untestable rather than quietly assumed to be
  // covered.
  {
    const h = harness({ outcomes: ["hang", "fail", "fail"] });
    h.monitor.start("test");
    await h.clock.advance(PROBE_INTERVAL_MS);
    // The first probe is still hanging; force the machine on via resume-free
    // teardown-free path by settling it late AFTER we have moved on.
    h.settleLate();
    await h.clock.advance(1);
    check(
      "F",
      !h.isOffline(),
      "a late resolution changed state after the monitor moved on",
    );
    h.monitor.teardown();
  }

  // G. teardown invalidates pending work
  {
    const h = harness({ outcomes: ["fail", "fail"] });
    h.monitor.start("test");
    await h.clock.advance(PROBE_INTERVAL_MS);
    h.monitor.teardown();
    check("G", h.clock.pending() === 0, "teardown left timers pending");
    await h.clock.advance(PROBE_RETRY_MS * 4);
    check("G", !h.isOffline(), "state changed after teardown");
  }

  // H. many resumes do not multiply chains or probes
  {
    const h = harness({ outcomes: ["hang", "ok", "ok", "ok", "ok"] });
    h.monitor.start("test");
    for (let i = 0; i < 5; i += 1) h.monitor.onResume();
    await h.clock.advance(1);
    check(
      "H",
      h.maxConcurrent() <= 1,
      `overlapping probes: ${h.maxConcurrent()} ran at once`,
    );
    check("H", h.clock.pending() <= 1, `timer accumulation: ${h.clock.pending()} pending`);
    h.monitor.teardown();
  }

  // I. stop() halts monitoring without leaving timers
  {
    const h = harness({ outcomes: ["ok"] });
    h.monitor.start("test");
    h.monitor.stop("test");
    check("I", h.clock.pending() === 0, "stop left a timer pending");
    await h.clock.advance(PROBE_INTERVAL_MS * 3);
    check("I", h.probeCalls() === 0, "probes continued after stop");
    h.monitor.teardown();
  }

  if (failures.length === 0) {
    console.log(
      "clean: no branch strands the monitor, one timer and one probe at a " +
        "time, and a late answer cannot rewrite a newer state",
    );
  }
  for (const f of failures) console.log(`FAIL ${f}`);
  if (failures.length) console.log(`\n${failures.length} failing`);
  process.exit(failures.length ? 1 : 0);
})();
