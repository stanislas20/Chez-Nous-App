// The bottom inset is spent exactly once.
//
// The floating tab bar sits between the tab screens and the system
// navigation, and it pads itself by insets.bottom. Every tab screen ALSO
// listed "bottom" in its SafeAreaView edges, so the same strip was reserved
// twice: on a device with a 126px navigation bar that left a dead band of
// exactly that height above the bar, and the last row of cards was cut off by
// it with no way to scroll them clear.
//
// It is a bug that hides well. Nothing crashes, no check fails, and on a
// phone with gesture navigation — where the inset is a few pixels — it is
// invisible. It only shows on hardware with a tall navigation bar, which is
// most Android phones in Bénin and none of the simulators.
//
// So the rule is asserted instead of remembered: a screen that renders under
// the tab bar goes through TabSafeAreaView, which decides the bottom edge
// from BottomTabBarHeightContext at render, and never asks for "bottom"
// itself.
//
// Run: node scripts/check-safe-area.js
const fs = require("fs");
const path = require("path");

const read = (relative) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// Every screen reachable under the floating tab bar: the five tab roots, and
// everything SellStack pushes, since that whole stack renders inside the Sell
// tab. The four auth screens are in this list AND registered again in
// RootNavigator with nothing beneath them — which is the entire reason the
// decision is made at render rather than written into the file.
const UNDER_TAB_BAR = [
  "src/screens/ForYouScreen.js",
  "src/screens/LocalScreen.js",
  "src/screens/NotificationsScreen.js",
  "src/screens/ChatListScreen.js",
  "src/screens/SellGateScreen.js",
  "src/screens/SellerDashboardScreen.js",
  "src/screens/CreateListingScreen.js",
  "src/screens/MyListingsScreen.js",
  "src/screens/SellerInsightsScreen.js",
  "src/screens/CompanyProfileEditScreen.js",
  "src/screens/AccountTypeScreen.js",
  "src/screens/LoginScreen.js",
  "src/screens/SignUpScreen.js",
  "src/screens/ForgotPasswordScreen.js",
];

UNDER_TAB_BAR.forEach((file) => {
  const source = read(file);

  // Its root container must be the tab-aware one.
  check(
    `${file} uses TabSafeAreaView for its container`,
    /const Container = styled\(TabSafeAreaView\)/.test(source),
    true,
  );

  // And must not claim the bottom edge itself. Matches any edges list
  // containing "bottom", however it is spelled or ordered.
  const claims = source.match(/edges=\{\[[^\]]*"bottom"[^\]]*\]\}/g) ?? [];
  check(
    `${file} does not claim the bottom inset (${claims.join(", ")})`,
    claims.length,
    0,
  );
});

// The bar keeps its half of the bargain: it is the one thing that pads by the
// bottom inset. If this ever moves, every screen above it loses the padding
// with nothing to say so.
const bar = read("src/navigation/FloatingTabBar.js");
check(
  "the tab bar still pads itself by the bottom inset",
  /paddingBottom: \(insets\.bottom \|\| spacing\.sm\)/.test(bar),
  true,
);

// The decision has to be read from the navigator, not guessed. A
// TabSafeAreaView that stopped consulting the context would silently drop the
// inset on the root auth screens, which have no bar beneath them.
const view = read("src/components/TabSafeAreaView.js");
check(
  "the edge is decided from the tab bar's own height",
  /useContext\(BottomTabBarHeightContext\)/.test(view),
  true,
);
// Falsy, not undefined: 0 means the bar is hidden for this route (SellStack
// does it for ForgotPassword), which needs the inset just as much as being
// outside a tab navigator does.
check(
  "a hidden bar counts as no bar",
  /tabBarHeight \? edges : \[\.\.\.edges, "bottom"\]/.test(view),
  true,
);

// Screens NOT under the bar must still take the inset — they are against the
// system navigation themselves. A blanket find-and-replace across the app
// would have broken exactly these.
//
// There are two honest ways to take it and this accepts both: the edge on the
// SafeAreaView, or insets.bottom added to the scroll content's padding. The
// second is what a screen does when it wants its content to scroll *under*
// the inset rather than stop above it, and asserting only the first called a
// working screen broken.
const STANDALONE = [
  "src/screens/RestaurantsScreen.js",
  "src/screens/CarDealershipsScreen.js",
];
STANDALONE.forEach((file) => {
  const source = read(file);
  check(
    `${file} still accounts for the bottom inset (nothing is under it)`,
    /edges=\{\[[^\]]*"bottom"[^\]]*\]\}/.test(source) ||
      /insets\.bottom/.test(source),
    true,
  );
});

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: safe area — ${UNDER_TAB_BAR.length} screen(s) under the tab bar ` +
    `leave the bottom inset to it, and the bar still takes it`,
);
