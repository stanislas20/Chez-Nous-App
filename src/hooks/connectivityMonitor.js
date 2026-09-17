// The offline detector's state machine, with every dependency injected.
//
// It lives apart from the hook for one reason: the previous two attempts at
// this failed on a physical device and passed every static check, because
// what was wrong was CONTROL FLOW — a branch that returned without
// rescheduling — and no amount of regex over the source can walk a state
// machine. Here it can be driven by a harness with fake timers and stubbed
// probe outcomes, so "a skipped probe must not kill monitoring" becomes a
// test rather than a hope.
//
// Nothing in this file imports React, Firestore or React Native.

export const CONNECTION = {
  ONLINE: "online",
  OFFLINE: "offline",
  // Before the first snapshot lands, and after a listener error. Distinct
  // from OFFLINE on purpose: a banner that flashes "no connection" for
  // 300ms on every cold start teaches people to ignore it.
  UNKNOWN: "unknown",
};

export const PROBE_INTERVAL_MS = 30000;
export const PROBE_RETRY_MS = 5000;
export const PROBE_TIMEOUT_MS = 8000;
export const FAILURES_BEFORE_OFFLINE = 2;

// Not "active", but also not a reason to stop watching. A skipped probe is
// rescheduled at the normal interval so the chain survives regardless of
// whether a resume event ever arrives.
export const SKIP_RESCHEDULE_MS = PROBE_INTERVAL_MS;

export function createConnectivityMonitor({
  runProbe, // () => Promise<void>   rejects or hangs on failure
  getAppState, // () => "active" | "background" | ...
  setTimeoutFn,
  clearTimeoutFn,
  onOffline, // () => void
  log = () => {},
}) {
  let stopped = false;
  let failures = 0;
  // At most ONE pending timer for this monitor, always owned here.
  let timer = null;
  let inFlight = false;
  // Invalidates the result of any probe started before the counter moved.
  let epoch = 0;
  let monitoring = false;

  function clearPending(reason) {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
      log(`timer cancelled (${reason})`);
    }
  }

  // The single scheduling owner. Every path that wants another probe goes
  // through here, and every call replaces the pending timer rather than
  // adding to it — which is what makes "at most one pending probe" a
  // property of the code rather than a claim about it.
  function schedule(delay, reason) {
    if (stopped || !monitoring) {
      log(`schedule refused (${stopped ? "stopped" : "not monitoring"})`);
      return;
    }
    clearPending("superseded");
    log(`probe scheduled in ${delay}ms (${reason})`);
    timer = setTimeoutFn(() => {
      timer = null;
      void probe("timer");
    }, delay);
  }

  async function probe(trigger) {
    if (stopped) {
      log(`probe skipped: stopped (trigger=${trigger})`);
      return;
    }
    if (!monitoring) {
      log(`probe skipped: monitoring off (trigger=${trigger})`);
      return;
    }
    if (inFlight) {
      // The in-flight probe owns the next schedule, so returning here cannot
      // strand the chain. Reachable when a resume lands mid-probe.
      log(`probe skipped: already in flight (trigger=${trigger})`);
      return;
    }

    const appState = getAppState();
    if (appState !== "active") {
      // THE BUG THIS FILE EXISTS FOR.
      //
      // The previous version returned here with nothing scheduled, so a
      // single non-active observation ended monitoring for good — the resume
      // listener was the only way back, and if the app never actually
      // backgrounded, no resume ever came. Now it reschedules: there is no
      // branch left that can silently stop the chain.
      log(`probe skipped: appState=${appState}, rescheduling`);
      schedule(SKIP_RESCHEDULE_MS, "appState not active");
      return;
    }

    const mine = ++epoch;
    inFlight = true;
    log(`probe started (epoch=${mine}, trigger=${trigger}, failures=${failures})`);

    let failed = false;
    try {
      await runProbe();
      log(`probe resolved (epoch=${mine})`);
    } catch (error) {
      failed = true;
      log(`probe failed (epoch=${mine}): ${error?.message ?? "error"}`);
    } finally {
      inFlight = false;
    }

    if (stopped) {
      log(`result discarded: stopped (epoch=${mine})`);
      return;
    }
    if (mine !== epoch) {
      log(`result discarded: stale epoch ${mine} != ${epoch}`);
      // A newer probe owns the schedule; adding one here would double them.
      return;
    }
    if (!monitoring) {
      log(`result discarded: monitoring off (epoch=${mine})`);
      return;
    }

    if (!failed) {
      if (failures !== 0) log(`failures reset ${failures} -> 0`);
      failures = 0;
      schedule(PROBE_INTERVAL_MS, "healthy");
      return;
    }

    const before = failures;
    failures += 1;
    log(`failures ${before} -> ${failures}`);

    if (failures >= FAILURES_BEFORE_OFFLINE) {
      log("ONLINE/UNKNOWN -> OFFLINE");
      monitoring = false;
      clearPending("went offline");
      onOffline();
      return;
    }
    schedule(PROBE_RETRY_MS, "confirming failure");
  }

  return {
    // Monitoring runs while the app might be online — which includes UNKNOWN.
    //
    // Gating it on ONLINE alone was the second half of the defect: a listener
    // error sets UNKNOWN, UNKNOWN hides the banner, and the probe was
    // switched off in the one state that means "we do not know". The app then
    // looked connected and had stopped checking.
    start(reason) {
      if (stopped || monitoring) return;
      monitoring = true;
      failures = 0;
      log(`monitoring started (${reason})`);
      schedule(PROBE_INTERVAL_MS, "initial");
    },
    stop(reason) {
      if (!monitoring) return;
      monitoring = false;
      clearPending(reason);
      log(`monitoring stopped (${reason})`);
    },
    // A resume is a reason to ask now rather than wait out the interval.
    onResume() {
      if (stopped || !monitoring) return;
      log("appState -> active");
      void probe("resume");
    },
    teardown() {
      stopped = true;
      monitoring = false;
      epoch += 1;
      clearPending("teardown");
      log("teardown");
    },
    // Test seams only.
    _state: () => ({ failures, inFlight, monitoring, epoch, pending: timer !== null }),
  };
}
