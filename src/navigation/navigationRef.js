import { createNavigationContainerRef } from "@react-navigation/native";

// A handle on the navigator for code that has no component to hang off.
//
// A push notification is tapped outside React's tree — sometimes before the
// tree exists at all, when the tap is what launched the app — so the usual
// `navigation` prop is not available. This is the supported way to reach the
// navigator from there.
export const navigationRef = createNavigationContainerRef();

// Taps can arrive before the navigator has mounted (cold start), so a
// destination that cannot be delivered yet is held rather than dropped, and
// replayed by onNavigationReady below.
let pending = null;

export function navigateWhenReady(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
    return;
  }
  pending = { name, params };
}

export function onNavigationReady() {
  if (!pending) return;
  const { name, params } = pending;
  pending = null;
  navigationRef.navigate(name, params);
}

// Which conversation is on screen right now, so a push about the thread the
// reader is already looking at does not interrupt them with an alert about
// a message they can see arriving.
export function currentRoute() {
  if (!navigationRef.isReady()) return null;
  return navigationRef.getCurrentRoute() ?? null;
}
