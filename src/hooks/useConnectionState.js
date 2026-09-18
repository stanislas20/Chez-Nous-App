import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Whether the app can currently reach Firestore, asked of Firestore itself.
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
// not have.
//
// So Firestore in this app runs on the default memory cache. It survives
// backgrounding, and it does not survive a cold start.
//
// ── Connectivity is read from a listener, and ONLY from a listener ──────
//
// No NetInfo, and deliberately: it is another native module to install,
// prebuild and verify, and it answers a question next to the one that
// matters. A phone can hold a perfectly good wifi association to a router
// with no route to the internet — captive portals do exactly this — and
// NetInfo calls that connected.
//
// Firestore already knows the true answer and publishes it. With
// includeMetadataChanges, every snapshot carries `fromCache`, which is false
// only when the document came from the server.
//
// ── Why there is no longer a polling probe beside it ────────────────────
//
// There was one, for three release candidates. It existed on the theory that
// the listener was too slow to notice a connection dying underneath it, and
// it grew a timeout, a retry, a failure counter, an epoch guard, an
// in-flight guard and an error classifier to make that theory safe.
//
// The theory was wrong, and the instrumented build said so plainly. On the
// handset, across two full cycles in one process:
//
//   network lost -> listener reported offline in 34s, then 22s
//   network back -> listener reported online  in 17s, then 12s
//   explicit probes that FAILED:               zero
//   OFFLINE transitions caused by the probe:   zero
//
// Both outages were detected by the listener, inside the 60s budget, while
// every probe in the same window still resolved. The listener had never been
// slow. It had been BROKEN — pointed at a reserved document id Firestore
// rejects outright — and the polling machinery was an elaborate workaround
// for a one-word mistake.
//
// So the probe is gone, along with everything that existed only to make it
// trustworthy. What remains is the part that was doing the work.
//
// ── The sentinel ────────────────────────────────────────────────────────
//
// The id is not decoration and it is not free to choose. It was
// `__connection_probe__`, and Firestore rejects any identifier matching the
// reserved __...__ pattern outright:
//
//   Resource id "__connection_probe__" is invalid because it is reserved.
//
// That error poisoned the listener on every launch, in every build, online
// or offline — so connectivity detection had never once worked, and it took
// an instrumented build on a device to see it. check-runtime-connectivity.js
// now fails on a reserved id so the same word cannot come back.
//
// The document does NOT exist, and must not be created. Verified against
// production, unauthenticated, exactly as the app reads it:
//
//   onSnapshot("connection-probe") -> fromCache=true, then fromCache=false
//
// A valid reference to a missing document resolves normally and carries the
// metadata this is built on. Which is also why existence is never consulted:
// exists() is false here by design and says nothing about the network.
const SENTINEL_PATH = ["sellerStats", "connection-probe"];

export const CONNECTION = {
  ONLINE: "online",
  OFFLINE: "offline",
  // Before the first snapshot lands, and after a listener error. Distinct
  // from OFFLINE on purpose: a banner that flashes "no connection" for
  // 300ms on every cold start teaches people to ignore it.
  UNKNOWN: "unknown",
};

export function useConnectionState() {
  const [state, setState] = useState(CONNECTION.UNKNOWN);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;

    // Attached once, for the life of the app, with no dependencies.
    //
    // Firestore owns its own reconnection: the stream re-establishes after a
    // background, a network change or a captive portal, and the next snapshot
    // says so — which is what the two physical recovery cycles measured at
    // 17s and 12s with nothing else running. There is nothing an AppState
    // listener could do here that the SDK is not already doing, so there
    // isn't one.
    const unsubscribe = onSnapshot(
      doc(firestore, ...SENTINEL_PATH),
      { includeMetadataChanges: true },
      (snapshot) => {
        // metadata.fromCache, never snapshot.exists(). The sentinel is
        // deliberately absent; reading absence as a verdict about the network
        // would report offline permanently and everywhere.
        setState(
          snapshot.metadata.fromCache ? CONNECTION.OFFLINE : CONNECTION.ONLINE,
        );
      },
      () => {
        // A refused or failed listener is not evidence of being offline. The
        // request reached the server to be refused, and the causes are
        // deterministic and local — a bad path, a rules change, a missing
        // sign-in. Telling somebody "no connection" for those sends them to
        // check their wifi over a fault in the app, which is precisely what
        // the RC4 build did for a whole test cycle. UNKNOWN hides the banner
        // and says nothing, which is the honest answer.
        setState(CONNECTION.UNKNOWN);
      },
    );

    return unsubscribe;
  }, []);

  return state;
}
