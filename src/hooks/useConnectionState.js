import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import {
  CONNECTION,
  PROBE_TIMEOUT_MS,
  createConnectivityMonitor,
  isConnectivityFailure,
} from "./connectivityMonitor";

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
// The id is NOT decoration, and it is not free to choose.
//
// This was `__connection_probe__`, and Firestore rejects any identifier
// matching the reserved __...__ pattern outright:
//
//   Resource id "__connection_probe__" is invalid because it is reserved.
//
// That poisoned BOTH halves of the detector — the listener errored into
// UNKNOWN on every launch, and the probe threw invalid-argument every time —
// so connection detection had never worked in any build. It survived three
// release candidates because a listener that errors looks exactly like a
// listener with nothing to say, and the probe that would have exposed it was
// not running yet for unrelated reasons.
//
// The replacement was checked against the real backend before being chosen,
// unauthenticated, exactly as the app reads it:
//
//   getDocFromServer("connection-probe") -> RESOLVED exists()=false fromCache=false
//   onSnapshot(...)                      -> fromCache=true, then fromCache=false
//
// So the document does NOT have to exist. A valid reference to a missing
// document resolves normally and carries the fromCache metadata this is all
// built on, which is why no sentinel has been written into production.
const PROBE_PATH = ["sellerStats", "connection-probe"];

export { CONNECTION };

// ── Instrumentation ─────────────────────────────────────────────────────
//
// Two remediation attempts at this detector passed every static check and
// failed on the handset, because what was wrong was control flow and timing
// rather than anything a regex can see. So the next physical run is not
// going to be another guess: the state machine narrates itself to logcat.
//
//   adb logcat | grep ConnectivityProbe
//
// Deliberately narrow — this detector only — and it carries no document
// contents, no tokens, no user data, no credentials. Only the shape of the
// machine: schedules, skips and their reasons, epochs, failure counts and
// transitions. To be gated or removed once the defect is closed.
const LOG_PREFIX = "[ConnectivityProbe]";
const probeLog = (message) => {
  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} ${message}`);
};

// Rejects rather than hangs.
//
// getDocFromServer does NOT reject promptly when there is no network: the
// SDK retries internally and the promise can stay pending indefinitely.
// RC2 awaited it and counted rejections, so the failure counter never left
// zero and the banner never appeared — 200 seconds, verified on a device.
// The bound has to be ours.
//
// The Firestore promise is left to settle whenever it likes; nobody is
// listening after the race, and the monitor's epoch guard makes a late
// answer unable to change a state that has moved on.
function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("probe-timeout");
      // Tagged, because the classifier below must be able to tell OUR
      // timeout — which is real evidence of unreachability — from a
      // Firestore error object, which may be evidence of nothing of the kind.
      error.isProbeTimeout = true;
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function useConnectionState() {
  const [state, setState] = useState(CONNECTION.UNKNOWN);

  // The listener. Free, and the only thing that restores ONLINE — which it
  // does the instant the stream re-establishes, faster than any poll.
  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    probeLog("listener attached");
    const unsubscribe = onSnapshot(
      doc(firestore, ...PROBE_PATH),
      { includeMetadataChanges: true },
      (snapshot) => {
        const next = snapshot.metadata.fromCache
          ? CONNECTION.OFFLINE
          : CONNECTION.ONLINE;
        probeLog(`snapshot fromCache=${snapshot.metadata.fromCache} -> ${next}`);
        setState(next);
      },
      (error) => {
        // A refused or failed listener is not evidence of being offline —
        // the request reached the server to be refused. UNKNOWN says so.
        probeLog(`listener error -> UNKNOWN (${error?.code ?? "unknown"})`);
        setState(CONNECTION.UNKNOWN);
      },
    );
    return () => {
      probeLog("listener detached");
      unsubscribe();
    };
  }, []);

  // The probe. Supplies the answer the listener is slow to give.
  //
  // Runs while the state is ONLINE **or UNKNOWN**. Gating it on ONLINE alone
  // was the second half of the RC3 failure: the listener's error handler
  // sets UNKNOWN, UNKNOWN hides the banner because it is not OFFLINE, and
  // the probe was switched off in the one state that means "we do not know".
  // The app then looked connected and had stopped checking, which is
  // indistinguishable from the defect it was meant to fix.
  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    if (state === CONNECTION.OFFLINE) {
      // Recovery belongs to the listener; probing from here would cost reads
      // and tell us nothing it will not tell us sooner.
      probeLog("monitor idle: state=offline, listener owns recovery");
      return undefined;
    }

    probeLog(`monitor mounting: state=${state}, appState=${AppState.currentState}`);

    const monitor = createConnectivityMonitor({
      runProbe: () =>
        withTimeout(getDocFromServer(doc(firestore, ...PROBE_PATH)), PROBE_TIMEOUT_MS),
      isConnectivityFailure,
      getAppState: () => AppState.currentState,
      setTimeoutFn: setTimeout,
      clearTimeoutFn: clearTimeout,
      onOffline: () => setState(CONNECTION.OFFLINE),
      log: probeLog,
    });

    monitor.start(`state=${state}`);

    const appStateSubscription = AppState.addEventListener("change", (next) => {
      probeLog(`appState change -> ${next}`);
      if (next === "active") monitor.onResume();
    });

    return () => {
      monitor.teardown();
      appStateSubscription.remove();
    };
  }, [state]);

  return state;
}
