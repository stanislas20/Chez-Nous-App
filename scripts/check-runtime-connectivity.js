#!/usr/bin/env node
//
// The offline banner told the truth on a cold start and said nothing the rest
// of the time.
//
// Verified on a physical device, twice, in the two different states:
//
//   launched with no network   → "No connection — showing what was already
//                                 loaded." Correct, and immediate.
//   network dropped while the
//   app was already open       → nothing. The feed went on serving cached
//                                 listings, the verified-business carousel
//                                 even rotated, and a pull-to-refresh
//                                 changed nothing. Silence, for over a
//                                 minute, which is the one behaviour the
//                                 banner exists to prevent.
//
// The cause is not a bug in the listener. Watching a probe document with
// includeMetadataChanges reports `fromCache` correctly, and on a cold start
// the first snapshot resolves from cache immediately — which is why that case
// always worked. But an ESTABLISHED WebChannel stream has to time out before
// the SDK concedes it is offline, and that timeout is far longer than the few
// seconds a reader waits before deciding the app is broken.
//
// So the listener stays — it is free, and it is what flips the state back the
// instant the network returns — and a probe supplies the answer it is slow to
// give. What this file defends is that the probe stays BOUNDED, because an
// unbounded one is a Firestore read on a timer for every user forever:
//
//   * foreground only        — nobody is looking at a backgrounded banner
//   * only while ONLINE      — once offline the listener handles recovery
//   * two failures to commit — one blip on a mobile connection is not an
//                              outage, and a banner that flickers teaches
//                              people to ignore it
//
// It also defends the banner's own top inset. The bar is the first thing
// inside NavigationContainer, so it starts at y=0 — underneath the clock and
// the battery. On the test handset the sentence ran straight through the
// status bar and the half behind the icons was unreadable, which is a poor
// showing for the one line whose whole job is to be read.
//
// Run: node scripts/check-runtime-connectivity.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const HOOK = "src/hooks/useConnectionState.js";
const MONITOR = "src/hooks/connectivityMonitor.js";
const BANNER = "src/components/OfflineBanner.js";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const rel of [HOOK, MONITOR, BANNER]) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel} is missing — this check reads it`);
  }
}
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

const hook = stripComments(read(HOOK));
const monitor = stripComments(read(MONITOR));

// 1. The listener is still there. It is the free signal and the fast
//    recovery path; the probe was added beside it, not instead of it.
if (!/includeMetadataChanges: true/.test(hook)) {
  failures.push(
    "the probe listener no longer asks for metadata changes — fromCache is " +
      "then never re-reported and the cold-start offline case, the one that " +
      "always worked, breaks",
  );
}
if (
  !/snapshot\.metadata\.fromCache[\s\S]{0,80}CONNECTION\.OFFLINE[\s\S]{0,40}CONNECTION\.ONLINE/.test(
    hook,
  )
) {
  failures.push(
    "the listener no longer derives the connection state from fromCache",
  );
}

// 2. The probe exists and uses a server-only read. getDoc would fall back to
//    cache and resolve happily while offline, which answers a different
//    question.
if (!/getDocFromServer\(/.test(hook)) {
  failures.push(
    "nothing performs a server-only read, so runtime connection loss is " +
      "still only noticed whenever the SDK's own stream happens to time out " +
      "— the defect this file is named after",
  );
}
if (/[^m]\bgetDoc\(/.test(hook)) {
  failures.push(
    "the probe uses getDoc, which falls back to the local cache and " +
      "therefore succeeds while offline — it cannot detect what it is for",
  );
}

// 2b. THE BOUND, in the hook that owns the Firestore call.
//
//     getDocFromServer does not reject promptly with no network: the SDK
//     retries internally and the promise can stay pending indefinitely. RC2
//     awaited it and counted rejections, so the counter never left zero and
//     the banner never appeared — 200 seconds, verified on a handset.
if (!/function withTimeout\(/.test(hook) || !/Promise\.race\(/.test(hook)) {
  failures.push(
    "the hook no longer races the Firestore read against a timer of its own " +
      "— an unbounded read is the RC2 defect, and it cannot be seen in a " +
      "static check of the probe alone",
  );
}
if (!/withTimeout\(getDocFromServer\(/.test(hook)) {
  failures.push(
    "getDocFromServer is not wrapped in withTimeout when handed to the monitor",
  );
}
const timeoutMatch = monitor.match(/const PROBE_TIMEOUT_MS = (\d+)/);
if (!timeoutMatch) {
  failures.push("PROBE_TIMEOUT_MS is gone — the probe has no upper bound");
} else if (Number(timeoutMatch[1]) > 15000) {
  failures.push(
    `PROBE_TIMEOUT_MS is ${timeoutMatch[1]}ms; a bound that generous stops ` +
      `being a bound`,
  );
}

// 2c. THE RC3 DEFECT. Every branch that declines to probe must leave the
//     chain able to run again. A skipped probe that schedules nothing ends
//     monitoring for the life of the screen — that is what failed on the
//     device at T+60s with the app foregrounded the whole time.
if (!/schedule\(SKIP_RESCHEDULE_MS/.test(monitor)) {
  failures.push(
    "a skipped probe does not reschedule — this is the exact RC3 failure: " +
      "one non-active observation ends monitoring permanently, and only a " +
      "resume event that may never come can restart it",
  );
}

// 2d. Monitoring must cover UNKNOWN, not only ONLINE.
//
//     The listener's error handler sets UNKNOWN; UNKNOWN hides the banner
//     because it is not OFFLINE. Gating the probe on ONLINE alone therefore
//     switched the detector off in the one state that means "we do not
//     know", leaving the app looking connected and no longer checking.
if (/state !== CONNECTION\.ONLINE\) return undefined;/.test(hook)) {
  failures.push(
    "the probe is gated on ONLINE alone, so a listener error into UNKNOWN " +
      "silently disables monitoring while the banner stays hidden",
  );
}
if (!/state === CONNECTION\.OFFLINE/.test(hook)) {
  failures.push(
    "the hook no longer idles the monitor when already OFFLINE — probing " +
      "from there costs reads and the listener owns recovery",
  );
}

// 2e. One scheduling owner, one pending timer, one probe.
if (!/if \(inFlight\)/.test(monitor)) {
  failures.push("nothing prevents overlapping probes");
}
if (!/clearPending\("superseded"\)/.test(monitor)) {
  failures.push(
    "schedule() does not replace the pending timer, so timers accumulate",
  );
}
if (!/AppState\.currentState/.test(hook)) {
  failures.push(
    "the hook no longer supplies the app state, so the monitor cannot tell " +
      "whether anybody is looking at the banner",
  );
}

// 2f. Deterministic coverage exists. This file is regex over source; the
//     control-flow defects that reached a device twice are only catchable
//     by driving the machine.
if (!fs.existsSync(path.join(root, "scripts/check-connectivity-machine.js"))) {
  failures.push(
    "the deterministic state-machine harness is gone — static assertions " +
      "alone have already let two control-flow defects through to a handset",
  );
}

// 3. Bounded cadence and debounce.
const intervalMatch = monitor.match(/const PROBE_INTERVAL_MS = (\d+)/);
if (!intervalMatch) {
  failures.push("PROBE_INTERVAL_MS is gone — the probe cadence is unbounded");
} else if (Number(intervalMatch[1]) < 15000) {
  failures.push(
    `PROBE_INTERVAL_MS is ${intervalMatch[1]}ms; under 15s this becomes a ` +
      `meaningful share of the read quota for every active user`,
  );
}
if (!/failures >= FAILURES_BEFORE_OFFLINE/.test(monitor)) {
  failures.push("a single failed probe flips the banner on");
}

// 3b. Cleanup.
if (!/monitor\.teardown\(\)/.test(hook)) {
  failures.push(
    "the effect does not tear the monitor down, so its timer keeps firing " +
      "— and reading — after the component is gone",
  );
}
if (!/appStateSubscription\.remove\(\)/.test(hook)) {
  failures.push("the AppState listener is not removed on teardown");
}

// 3c. Recovery stays the LISTENER's job.
if (!/fromCache[\s\S]{0,80}CONNECTION\.ONLINE/.test(hook)) {
  failures.push(
    "the snapshot listener no longer restores ONLINE from fromCache — " +
      "recovery would then wait on a poll",
  );
}

// 4. The banner clears the status bar.
const banner = stripComments(read(BANNER));
if (!/useSafeAreaInsets\(\)/.test(banner)) {
  failures.push(
    "OfflineBanner does not read the safe-area insets, so it renders under " +
      "the status bar and half its sentence sits behind the clock",
  );
}
if (!/paddingTop: insets\.top/.test(banner)) {
  failures.push(
    "OfflineBanner does not apply insets.top as padding — reading the inset " +
      "and not using it leaves the text exactly where it was",
  );
}
if (/SafeAreaView/.test(banner)) {
  failures.push(
    "OfflineBanner wraps itself in a SafeAreaView — that claims the BOTTOM " +
      "edge too and pushes the navigator up by the home-indicator height on " +
      "every screen, which is a global spacing change for a one-line banner",
  );
}
// UNKNOWN is not offline, or the banner flashes on every cold start.
if (!/connection !== CONNECTION\.OFFLINE/.test(banner)) {
  failures.push(
    "the banner no longer renders only on OFFLINE — showing it for UNKNOWN " +
      "flashes 'no connection' during every launch",
  );
}

if (failures.length === 0) {
  console.log(
    "clean: connection loss is noticed while the app is open, the probe stays " +
      "bounded, and the banner clears the status bar",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
