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
const BANNER = "src/components/OfflineBanner.js";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const rel of [HOOK, BANNER]) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel} is missing — this check reads it`);
  }
}
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

const hook = stripComments(read(HOOK));

// 1. The listener is still there. It is the free signal and the fast
//    recovery path; the probe was added beside it, not instead of it.
if (!/includeMetadataChanges: true/.test(hook)) {
  failures.push(
    "the probe listener no longer asks for metadata changes — fromCache is " +
      "then never re-reported and the cold-start offline case, the one that " +
      "always worked, breaks",
  );
}
if (!/snapshot\.metadata\.fromCache \? CONNECTION\.OFFLINE : CONNECTION\.ONLINE/.test(hook)) {
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

// 2b. THE BOUND. This is the assertion the first version of this file did
//     not make, and the reason a fix that looked right failed on a device.
//
//     getDocFromServer does not reject promptly with no network: the SDK
//     retries internally and the promise can stay pending indefinitely. The
//     old probe awaited it and counted rejections, so the failure counter
//     never advanced and the banner never appeared — 200 seconds, verified
//     on a handset. The timeout has to be OURS.
if (!/function withTimeout\(/.test(hook)) {
  failures.push(
    "there is no withTimeout helper — the probe is once again relying on " +
      "Firestore to reject in a timely way, which it does not do when the " +
      "network is gone, and the banner never appears",
  );
}
if (!/Promise\.race\(/.test(hook)) {
  failures.push(
    "nothing races the probe against a timer, so a probe that never settles " +
      "stalls the whole detection chain",
  );
}
if (!/withTimeout\(\s*getDocFromServer\(/.test(hook)) {
  failures.push(
    "getDocFromServer is not wrapped in withTimeout — an unbounded read is " +
      "exactly the defect this file exists to prevent recurring",
  );
}
const timeoutMatch = hook.match(/const PROBE_TIMEOUT_MS = (\d+)/);
if (!timeoutMatch) {
  failures.push("PROBE_TIMEOUT_MS is gone — the probe has no upper bound");
} else if (Number(timeoutMatch[1]) > 15000) {
  failures.push(
    `PROBE_TIMEOUT_MS is ${timeoutMatch[1]}ms; a bound that generous stops ` +
      `being a bound — the reader has decided the app is broken long before`,
  );
}

// 2c. A late answer must not be able to change a state that has moved on.
if (!/mine !== epoch/.test(hook)) {
  failures.push(
    "there is no epoch guard, so a Firestore promise settling after its " +
      "timeout — possibly after the network returned — can still write a " +
      "stale verdict over the current one",
  );
}

// 2d. One probe at a time. A resume during an in-flight probe must not
//     start a second chain; that doubles timers and reads on every cycle.
if (!/if \(inFlight\) return;/.test(hook)) {
  failures.push(
    "nothing prevents overlapping probes — a foreground event during an " +
      "in-flight probe starts a second chain and the timers multiply",
  );
}

// 3. Bounded: foreground only, online only, and not on a single failure.
if (!/AppState\.currentState !== "active"/.test(hook)) {
  failures.push(
    "the probe runs regardless of whether the app is in the foreground — " +
      "that is a Firestore read on a timer for every backgrounded install",
  );
}
if (!/if \(state !== CONNECTION\.ONLINE\) return undefined;/.test(hook)) {
  failures.push(
    "the probe is not gated on being ONLINE; once offline the listener " +
      "already handles recovery, so probing from there costs reads for " +
      "nothing",
  );
}
if (!/FAILURES_BEFORE_OFFLINE/.test(hook) || !/failures >= FAILURES_BEFORE_OFFLINE/.test(hook)) {
  failures.push(
    "a single failed probe flips the banner on — one bad second on a mobile " +
      "connection is not an outage, and a flickering banner is one people " +
      "learn to ignore",
  );
}
const intervalMatch = hook.match(/const PROBE_INTERVAL_MS = (\d+)/);
if (!intervalMatch) {
  failures.push("PROBE_INTERVAL_MS is gone — the probe cadence is unbounded");
} else if (Number(intervalMatch[1]) < 15000) {
  failures.push(
    `PROBE_INTERVAL_MS is ${intervalMatch[1]}ms; anything under 15s turns ` +
      `connection detection into a meaningful share of the project's read ` +
      `quota for every active user`,
  );
}

// 3b. Cleanup. A timer that outlives the screen keeps reading Firestore
//     for an unmounted component.
// Asserted on the TEARDOWN BLOCK, not the file. A mutation deleted the
// teardown's clearTimeout and this still passed, because `schedule` calls
// clearTimeout too — the string was present, the cleanup was not.
const teardown = hook.slice(hook.search(/return \(\) => \{\s*cancelled = true;/));
if (!teardown.trim()) {
  failures.push(
    "the probe effect has no teardown that marks itself cancelled — the " +
      "chain keeps running, and reading, after the component is gone",
  );
} else {
  const block = teardown.slice(0, teardown.indexOf("};") + 2);
  if (!/clearTimeout\(timer\)/.test(block)) {
    failures.push(
      "the teardown does not clear the pending probe timer, so one more " +
        "probe fires — and reads — after the screen is gone",
    );
  }
  if (!/epoch \+= 1;/.test(block)) {
    failures.push(
      "the teardown does not bump the epoch, so a probe already in flight " +
        "can still write its verdict into a torn-down effect",
    );
  }
}
if (!/appStateSubscription\.remove\(\)/.test(hook)) {
  failures.push(
    "the AppState listener is not removed on teardown, so listeners " +
      "accumulate one per mount",
  );
}

// 3c. Recovery stays the LISTENER's job. If somebody ever makes the probe
//     responsible for returning to ONLINE, the app can sit offline until
//     the next poll even though the stream is already back.
if (!/setState\(\s*snapshot\.metadata\.fromCache \? CONNECTION\.OFFLINE : CONNECTION\.ONLINE,?\s*\)/.test(hook)) {
  failures.push(
    "the snapshot listener no longer restores ONLINE directly from " +
      "fromCache — recovery would then wait on a poll instead of happening " +
      "the instant the stream re-establishes",
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
