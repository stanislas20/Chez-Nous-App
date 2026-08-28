// Sends someone who needs an account to the neutral account screens —
// pushed onto the ROOT stack, so whatever they were doing stays underneath.
//
// Two things were wrong with jumping into the Sell tab instead. The tab
// hosts a shopfront pitch ("Turn what you have into opportunity"), which is
// right for someone who tapped Vendre and wrong for a buyer reporting a
// scam. And `navigate('MainTabs', …)` POPS the listing off the root stack,
// so the back arrow had nothing to return to and finishing the original
// task meant finding the listing again.
//
// Pushing instead keeps the listing below, so back returns to it and so
// does finishing signup — see `originName`.

// Callers live at different depths: ProductDetail and JobDetail are root
// screens, while ChatList sits inside the tabs. `navigation.getState()`
// describes whichever navigator the caller belongs to, so reading from it
// gave a nested route for some callers — and a nested route cannot be
// resolved from a root screen, because navigation actions bubble up, never
// down. Walking to the root first means every caller records a route the
// auth screens can actually navigate back to.
function getRootNavigation(navigation) {
  let current = navigation;
  for (let parent = current.getParent(); parent; parent = current.getParent()) {
    current = parent;
  }
  return current;
}

export function openAccountGate(navigation, { accountType } = {}) {
  const root = getRootNavigation(navigation);
  const state = root.getState();
  // The route NAME, not its key.
  //
  // This used to record the key and return with `navigate({ key })`, which
  // React Navigation 6 accepted. Version 7 removed it: CommonActions.navigate
  // throws "You need to specify a name when calling navigate with an object
  // as the argument", and the stack router's NAVIGATE handler only ever looks
  // at payload.name. So signing in threw a render error instead of returning
  // anybody anywhere.
  //
  // Navigating by name lands on the same screen. The router finds the last
  // route with that name already on the stack and unwinds to it, which is
  // what the key was doing — and because it is the existing route, its params
  // come back with it. When the origin is inside the tabs this is MainTabs,
  // which returns with the tab's own history untouched.
  const origin = state?.routes?.[state.index] ?? null;
  const originName = origin?.name ?? null;

  root.navigate("AuthAccountType", {
    accountType,
    originName,
    // The same components are registered in SellStack under different
    // names, so each copy is told which routes to move between rather than
    // hardcoding names that only exist in one stack.
    signUpRoute: "AuthSignUp",
    loginRoute: "AuthLogin",
    forgotRoute: "AuthForgotPassword",
  });
}

// The counterpart, used by the back arrow on all three auth screens.
//
// It exists because each screen had its own fallback and each could dead-end:
// `navigate('SellGate')` is a route that only exists inside the Sell tab, so
// from the root-stack copies it resolved to nothing and the arrow did
// nothing at all. This orders the options so the last one always moves.
export function closeAccountGate(navigation, originName) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  if (originName) {
    navigation.navigate(originName);
    return;
  }
  // Reached only when the auth screen is the very first route — nothing to
  // return to, so send them somewhere real rather than leaving them stuck.
  navigation.navigate("MainTabs");
}
