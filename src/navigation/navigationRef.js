import { createNavigationContainerRef } from "@react-navigation/native";

// A handle on the navigator for code that has no component to hang off.
//
// A push notification is tapped outside React's tree — sometimes before the
// tree exists at all, when the tap is what launched the app — so the usual
// `navigation` prop is not available. This is the supported way to reach the
// navigator from there.
export const navigationRef = createNavigationContainerRef();

// Taps can arrive before the navigator has mounted (cold start), so a
// destination that cannot be delivered yet is held rather than dropped.
//
// ── Why this is more than a held value and a replay ────────────────────
//
// Tapping a message notification from a TERMINATED app cold launched it,
// restored the session, and landed on the Sell dashboard. From the
// background the same tap opened the right conversation. Same payload, same
// openNotification, same route name — only the timing differed, which is
// what named the cause.
//
// NavigationContainer is mounted unconditionally in App.js, but its child
// RootNavigator returns a bare spinner while i18n loads, so for the first
// moments there is no Stack.Navigator inside the container and isReady() is
// false. getInitialNotification() resolves independently, off an async
// Firebase call. The two orders interleave differently on every launch:
//
//   navigator ready first  → the old code navigated immediately, into a
//                            container whose initial state had been
//                            committed in the same tick, and React
//                            Navigation dropped the action
//   payload first          → the destination was held, and replayed by
//                            onReady — which fires exactly once, so a
//                            payload arriving a millisecond after it was
//                            held forever and replayed never
//
// Neither path told anybody it had failed. The app was simply already on
// its initial route, which is indistinguishable from a notification that
// was never tapped.
//
// So: hold the destination ALWAYS, deliver on a deferred tick so the
// navigator's own initial state is committed first, and confirm arrival
// rather than assuming the dispatch took. A destination is cleared the
// moment it is dispatched, so it can never be delivered twice, and a newer
// destination supersedes an older one instead of queueing behind it.
let pending = null;
let retryTimer = null;

// Long enough to outlast the navigator committing its initial state, short
// enough that a reader who tapped a notification is not left looking at the
// wrong screen. Bounded, because a destination that cannot be reached after
// this many tries is a broken route name, and retrying a broken route name
// forever is a navigation loop rather than a fix.
const DELIVERY_RETRY_MS = 250;
const DELIVERY_MAX_ATTEMPTS = 6;

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function deliver() {
  clearRetry();
  if (!pending) return;
  if (!navigationRef.isReady()) {
    // onNavigationReady will call back in. Nothing to retry against yet.
    return;
  }

  const target = pending;

  // Arrived already — either this dispatch took, or the reader got there
  // first. Either way the destination is satisfied and must not be sent
  // again, which is what turns one tap into two navigations.
  if (navigationRef.getCurrentRoute()?.name === target.name) {
    pending = null;
    return;
  }

  if (target.attempts >= DELIVERY_MAX_ATTEMPTS) {
    // Give up rather than spin. The reader is left where they are, which is
    // the same place the old code left them — but without a timer running
    // for the rest of the session.
    pending = null;
    return;
  }

  target.attempts += 1;
  navigationRef.navigate(target.name, target.params);

  // Confirm on the next pass rather than trusting the dispatch. If the route
  // is now the target, the branch above clears `pending` and stops.
  retryTimer = setTimeout(deliver, DELIVERY_RETRY_MS);
}

export function navigateWhenReady(name, params) {
  // Always queued, never dispatched inline: dispatching in the same tick the
  // container reports ready is the case that was being dropped.
  pending = { name, params, attempts: 0 };
  clearRetry();
  retryTimer = setTimeout(deliver, 0);
}

export function onNavigationReady() {
  deliver();
}

// Which conversation is on screen right now, so a push about the thread the
// reader is already looking at does not interrupt them with an alert about
// a message they can see arriving.
export function currentRoute() {
  if (!navigationRef.isReady()) return null;
  return navigationRef.getCurrentRoute() ?? null;
}
