#!/usr/bin/env node
//
// The offline banner told the truth on a cold start and said nothing the rest
// of the time — and then, for three release candidates, said nothing ever.
//
// ── What actually happened ──────────────────────────────────────────────
//
// The first reading of the symptom was wrong, and it is worth keeping
// because it cost two builds. The theory was that an ESTABLISHED WebChannel
// stream has to time out before the SDK concedes it is offline, and that
// this timeout is far longer than the few seconds a reader waits before
// deciding the app is broken. So a polling probe was added beside the
// listener, and then a timeout, a retry, a failure counter, an epoch guard,
// an in-flight guard and an error classifier to make the probe safe.
//
// The listener was not slow. It was DEAD. The sentinel document was
// `__connection_probe__`, and Firestore rejects any identifier matching the
// reserved __...__ pattern outright:
//
//   Resource id "__connection_probe__" is invalid because it is reserved.
//
// That error poisoned the listener on every launch, in every build, online
// or offline. Connectivity detection had never once worked. All of the
// machinery was an elaborate workaround for a one-word mistake, and an
// instrumented build on a handset is what finally said so:
//
//   network lost -> listener reported offline in 34s, then 22s
//   network back -> listener reported online  in 17s, then 12s
//   probes that FAILED, across both cycles:    zero
//
// So the probe is gone and the listener does the work alone. What this file
// defends is that the mistake cannot come back and the workaround cannot
// come back with it — plus the banner's own top inset, because the bar is
// the first thing inside NavigationContainer and starts at y=0, underneath
// the clock and the battery.
//
// Behaviour is NOT asserted here. This file is regex over source, and regex
// over source is exactly what was green through all three broken builds:
// the defects were control flow and a document id. The state transitions
// belong to check-connectivity-listener.js, which drives the real hook.
//
// Run: node scripts/check-runtime-connectivity.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const HOOK = "src/hooks/useConnectionState.js";
const BANNER = "src/components/OfflineBanner.js";
const HARNESS = "scripts/check-connectivity-listener.js";

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

// 1. THE SENTINEL ID. The one check that would have caught RC4 before a
//    build, and the reason this file exists in its current form.
const sentinel = hook.match(/const SENTINEL_PATH = \[([^\]]+)\]/);
if (!sentinel) {
  failures.push("SENTINEL_PATH is gone — the connectivity sentinel has no home");
} else {
  const parts = [...sentinel[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (parts.length < 2) {
    failures.push(
      "SENTINEL_PATH is not a literal collection/document pair, so the " +
        "document id cannot be checked for validity here",
    );
  }
  if (parts.length % 2 !== 0) {
    failures.push(
      `SENTINEL_PATH has ${parts.length} segments; a document reference needs ` +
        `an even number and doc() throws on an odd one`,
    );
  }
  for (const segment of parts) {
    if (/^__.*__$/.test(segment)) {
      failures.push(
        `SENTINEL_PATH segment "${segment}" matches Firestore's reserved ` +
          `__...__ pattern. Firestore rejects it with invalid-argument, which ` +
          `kills the listener on every launch — this is the RC1–RC4 defect, ` +
          `and it is invisible until a device runs it`,
      );
    }
    if (/[/]/.test(segment)) {
      failures.push(`SENTINEL_PATH segment "${segment}" contains a slash`);
    }
  }
  // Not business data, whose lifecycle and readability change underneath it.
  if (/listings|sellers\/|pharmac|moderation/i.test(sentinel[1])) {
    failures.push(
      "the connectivity sentinel points at business data — its existence and " +
        "readability would then change as ordinary data changes",
    );
  }
}

// 2. The listener reads metadata, and reads it from the right thing.
if (!/includeMetadataChanges: true/.test(hook)) {
  failures.push(
    "the listener no longer asks for metadata changes — Firestore then " +
      "delivers nothing when only fromCache changed, so the detector freezes " +
      "at whatever its first snapshot said and never moves again",
  );
}
if (
  !/snapshot\.metadata\.fromCache[\s\S]{0,80}CONNECTION\.OFFLINE[\s\S]{0,40}CONNECTION\.ONLINE/.test(
    hook,
  )
) {
  failures.push(
    "the listener no longer derives the connection state from fromCache, or " +
      "derives it backwards",
  );
}
// exists() is false by design here and says nothing about the network.
if (/\.exists\(\)/.test(hook)) {
  failures.push(
    "the hook consults snapshot.exists() — the sentinel document deliberately " +
      "does not exist, so existence would report a permanent outage for " +
      "everybody",
  );
}

// 3. A listener error is not an outage.
//
//    RC4 treated one as if it were and produced a permanent "No connection"
//    banner on a device that was online. The causes are deterministic and
//    local — a bad path, a rules change, a missing sign-in — and the request
//    reached the server in order to be refused.
if (!/CONNECTION\.UNKNOWN\);?\s*\},?\s*\);/.test(hook)) {
  failures.push(
    "the listener's error handler does not settle on UNKNOWN — a local " +
      "configuration fault is reported to the reader as 'no connection', " +
      "sending them to check their wifi over a bug in the app",
  );
}
if (/error[\s\S]{0,120}CONNECTION\.OFFLINE/.test(hook)) {
  failures.push(
    "an error path reaches CONNECTION.OFFLINE — that is the RC4 false-offline",
  );
}

// 4. THE POLLING DOES NOT COME BACK.
//
//    Every item below was real code in RC4 and every one of them existed
//    only to prop up a listener that was broken for an unrelated reason.
//    Re-adding any of them means a Firestore read on a timer for every
//    foregrounded user, forever, to answer a question the stream answers
//    for free.
const banned = [
  ["getDocFromServer", "a polling read against Firestore"],
  ["setTimeout", "a probe timer"],
  ["setInterval", "a probe interval"],
  ["inFlight", "the overlapping-probe guard"],
  ["epoch", "the stale-probe epoch guard"],
  ["FAILURES_BEFORE_OFFLINE", "the failure counter"],
  ["PROBE_INTERVAL_MS", "the probe cadence"],
  ["PROBE_TIMEOUT_MS", "the probe bound"],
  ["isConnectivityFailure", "the probe's error classifier"],
  ["AppState", "the foreground gate, which only the probe needed"],
];
for (const [needle, what] of banned) {
  if (new RegExp(needle).test(hook)) {
    failures.push(
      `${needle} is back in the hook — ${what} returns, and with it ~2 ` +
        `Firestore reads per minute per active user for a signal the ` +
        `listener already delivers free`,
    );
  }
}
if (fs.existsSync(path.join(root, "src/hooks/connectivityMonitor.js"))) {
  failures.push(
    "src/hooks/connectivityMonitor.js exists again — the probe state machine " +
      "was removed because the device proved it never caused a single " +
      "OFFLINE transition",
  );
}
// Temporary diagnostics shipped once. They must not ship twice.
if (/console\.(log|warn|info)/.test(hook)) {
  failures.push(
    "diagnostic logging is back in the hook — the [ConnectivityProbe] traces " +
      "were built to find the reserved-id defect and removed once it was found",
  );
}

// 5. Deterministic coverage exists. This file cannot see control flow, and
//    control-flow defects reached a handset twice.
if (!fs.existsSync(path.join(root, HARNESS))) {
  failures.push(
    `${HARNESS} is gone — static assertions alone have already let three ` +
      `broken builds through, because a regex cannot tell a working state ` +
      `machine from a dead one`,
  );
}

// 6. The banner clears the status bar.
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
      "flashes 'no connection' during every launch, and now also on every " +
      "listener error",
  );
}

if (failures.length === 0) {
  console.log(
    "clean: the sentinel is an id Firestore accepts, the listener reads " +
      "metadata alone, an error says UNKNOWN rather than offline, and the " +
      "polling has not come back",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
