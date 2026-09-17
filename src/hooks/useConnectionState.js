import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Whether the app can currently reach Firestore, asked of Firestore itself.
//
// Two things had to be settled before writing this, and the first one decides
// the second.
//
// ── Disk persistence is not available here ──────────────────────────────
//
// The obvious move is initializeFirestore(app, { localCache:
// persistentLocalCache() }), which is what every web example shows. It does
// not work in React Native, and it fails quietly rather than loudly.
// `persistentLocalCache` IS exported from the SDK's React Native build — so
// importing it compiles, and the call returns an object — but the storage
// layer underneath is IndexedDB, gated on isIndexedDBAvailable() from
// @firebase/util, which reads an `indexedDB` global that React Native does
// not have. Checked rather than assumed: that function returns false in any
// environment without the global, and SimpleDb.isAvailable() is what every
// persistence path consults first.
//
// So Firestore in this app runs on the default memory cache. It survives
// backgrounding, and it does not survive a cold start. That is a real limit
// and it is the reason B1's bounded reads matter as much as they do: every
// app open pays for its first page again.
//
// (React Native Firebase's own Firestore module does have native persistence.
// Moving Firestore onto it is a migration of every query in the app and a
// second SDK's worth of behaviour to re-verify, which is not a reliability
// fix — it is a rewrite wearing one.)
//
// ── So connectivity is read from a listener, not from a network API ─────
//
// No NetInfo, and deliberately: it is another native module to install,
// prebuild and verify, and it answers a question next to the one that
// matters. A phone can hold a perfectly good wifi association to a router
// with no route to the internet — captive portals do exactly this — and
// NetInfo calls that connected.
//
// Firestore already knows the true answer and publishes it. With
// includeMetadataChanges, every snapshot carries `fromCache`, which is false
// only when the document came from the server. Watching one small document
// the rules let anybody read therefore costs one listener and reports
// reachability of the thing the app actually needs to reach.
//
// The document does not have to exist. A listener on a missing document still
// resolves — with exists() false and fromCache telling the truth — so this
// needs no seeding and no write.
const PROBE_PATH = ["sellerStats", "__connection_probe__"];

export const CONNECTION = {
  ONLINE: "online",
  OFFLINE: "offline",
  // Before the first snapshot lands. Distinct from offline on purpose: a
  // banner that flashes "no connection" for 300ms on every cold start
  // teaches people to ignore it.
  UNKNOWN: "unknown",
};

// ── Why the listener alone was not enough ───────────────────────────────
//
// It is correct, and on a cold start it is immediate: with no network, the
// first snapshot resolves from cache, fromCache is true, and the banner is
// up before the feed has finished drawing. That case was verified on a
// physical device and it works.
//
// What it does not do is notice a connection that dies UNDER it. An
// established WebChannel stream has to time out before the SDK concedes it
// is offline, and that timeout is far longer than the few seconds a reader
// waits before deciding the app is broken. On the device the banner never
// appeared at all: the feed simply went on showing cached listings, silently,
// which is the one behaviour the banner exists to prevent.
//
// So the listener stays as the fast, free signal — it is what flips the
// state back the instant the network returns — and a probe supplies the
// answer it is slow to give.
//
// Bounded on purpose:
//   * foreground only — a backgrounded app has nobody to show a banner to
//   * only while ONLINE — once offline, the listener handles recovery, so
//     probing from that state would buy nothing and cost reads
//   * two consecutive failures before declaring offline, so a single blip
//     on a Bénin mobile connection does not raise a banner about a
//     connection that is merely having a bad second
// ── The bound that was missing ──────────────────────────────────────────
//
// The first version of this probe awaited getDocFromServer and counted a
// rejection as a failure. On a physical device, foregrounded, with the
// network switched off, the banner never appeared — 200 seconds, stale
// listings still on screen, exactly the defect the probe was added to fix.
//
// getDocFromServer does not reject promptly when there is no network. The
// SDK retries internally and the promise simply stays pending, so the
// failure counter never advanced past zero and OFFLINE was never reached.
// Nothing in a static check could have caught that: the code asserted the
// right shape and made a wrong assumption about a library's timing.
//
// So the timeout is now OURS. A probe is raced against a timer we control,
// and a probe that has not answered within PROBE_TIMEOUT_MS is a failure
// regardless of what Firestore intends to do about it later.
//
// ── Timing, and why these numbers ───────────────────────────────────────
//
//   PROBE_INTERVAL_MS   30s   steady state while ONLINE and foregrounded.
//                             Two reads a minute is the ongoing cost of
//                             knowing; shorter would detect faster and bill
//                             more for every user who never goes offline.
//   PROBE_TIMEOUT_MS     8s   generous for a round trip to Firestore on a
//                             Bénin mobile connection, short enough that a
//                             dead link is not mistaken for a slow one for
//                             long.
//   PROBE_RETRY_MS       5s   after a FAILED probe only. The expensive part
//                             is asking often when everything is fine; once
//                             something looks wrong, confirming quickly is
//                             cheap and makes the banner appear sooner.
//   FAILURES_BEFORE_OFFLINE 2 one slow request on a bad connection is not
//                             an outage, and a banner that flickers is one
//                             people learn to ignore.
//
// Worst case from the instant the network dies to the banner:
//   30 (waiting for the next probe) + 8 (that probe times out)
//    + 5 (fast retry)              + 8 (retry times out)   =  51s
// Typical, when the loss lands mid-interval: roughly 20-35s.
//
// Recovery is not this probe's job. The snapshot listener re-emits with
// fromCache false the moment the stream re-establishes, which is faster
// than any poll and costs nothing.
const PROBE_INTERVAL_MS = 30000;
const PROBE_RETRY_MS = 5000;
const PROBE_TIMEOUT_MS = 8000;
const FAILURES_BEFORE_OFFLINE = 2;

// Rejects rather than hangs. The Firestore promise is left to settle
// whenever it likes — nobody is listening to it after this resolves, and
// the epoch guard in the effect below makes sure a late answer cannot
// change a state that has moved on.
function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("probe-timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function useConnectionState() {
  const [state, setState] = useState(CONNECTION.UNKNOWN);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const unsubscribe = onSnapshot(
      doc(firestore, ...PROBE_PATH),
      { includeMetadataChanges: true },
      (snapshot) => {
        setState(
          snapshot.metadata.fromCache ? CONNECTION.OFFLINE : CONNECTION.ONLINE,
        );
      },
      () => {
        // A refused or failed listener is not evidence of being offline —
        // the request reached the server to be refused. Saying nothing is
        // more honest than showing a banner about the wrong problem.
        setState(CONNECTION.UNKNOWN);
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    // Nothing to detect from a state that is already offline, and nothing to
    // show while the app is not in front of anybody.
    if (state !== CONNECTION.ONLINE) return undefined;

    let cancelled = false;
    let failures = 0;
    let timer = null;
    let inFlight = false;
    // Bumped on teardown and on every probe. A probe compares the epoch it
    // started under against the current one before touching anything, so a
    // Firestore promise that settles minutes late — after the network came
    // back, after the effect was torn down, after the reader signed out —
    // cannot resurrect a stale verdict.
    let epoch = 0;

    const schedule = (delay) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(probe, delay);
    };

    async function probe() {
      if (cancelled) return;
      // One probe at a time. Without this, a resume during a probe that is
      // still racing its timeout starts a second chain, and from then on
      // every interval doubles the number of timers and reads.
      if (inFlight) return;
      if (AppState.currentState !== "active") {
        // Nobody to show a banner to. Do not probe, but do not abandon the
        // chain either — the resume listener restarts it.
        return;
      }

      const mine = ++epoch;
      inFlight = true;
      let failed = false;
      try {
        await withTimeout(
          getDocFromServer(doc(firestore, ...PROBE_PATH)),
          PROBE_TIMEOUT_MS,
        );
      } catch {
        // Either the server said no, or it said nothing for eight seconds.
        // Both answer the question the same way.
        failed = true;
      } finally {
        inFlight = false;
      }

      if (cancelled || mine !== epoch) return;

      if (!failed) {
        failures = 0;
        schedule(PROBE_INTERVAL_MS);
        return;
      }

      failures += 1;
      if (failures >= FAILURES_BEFORE_OFFLINE) {
        setState(CONNECTION.OFFLINE);
        // No reschedule: this effect is about to be torn down by the state
        // change, and the snapshot listener owns recovery from here.
        return;
      }
      schedule(PROBE_RETRY_MS);
    }

    schedule(PROBE_INTERVAL_MS);

    // Coming back to the foreground is the likeliest moment for the answer
    // to have changed — the reader may have been in aeroplane mode, or
    // walked out of range, while the app was away.
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && !cancelled) probe();
    });

    return () => {
      cancelled = true;
      epoch += 1;
      if (timer) clearTimeout(timer);
      timer = null;
      appStateSubscription.remove();
    };
  }, [state]);

  return state;
}
