import { useContext } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";

// A SafeAreaView that knows whether the tab bar is underneath it.
//
// The bottom inset can only be spent once, and the floating tab bar already
// spends it — it is the thing actually sitting against the system navigation,
// and it pads itself by insets.bottom (see FloatingTabBar's Wrap). A screen
// above the bar that also claims "bottom" reserves the same strip twice: on a
// device with a 126px navigation bar that left a dead band of exactly that
// height between the content and the bar, and the last row of cards was cut
// off by it with no way to scroll them clear.
//
// The obvious fix — drop "bottom" from the tab screens — is wrong for half of
// them. AccountType, Login, SignUp and ForgotPassword are each registered
// TWICE: once inside SellStack, under the tab bar, and once in RootNavigator
// as a full-screen auth flow with nothing beneath them. The same component
// needs the inset in one place and must not take it in the other, so it
// cannot be decided when the file is written. It has to be asked at render.
//
// BottomTabBarHeightContext answers exactly that, and its two falsy cases are
// both the ones that mean "nothing is between me and the system navigation":
//
//   undefined — not inside a tab navigator at all (the root auth copies)
//   0         — inside one, but the bar is hidden for this route. SellStack
//               does this for ForgotPassword, where the keypad needs the
//               height the bar would otherwise take.
//
// A component rather than a hook on purpose. Several of these screens render
// one of two Containers depending on what they are showing, and a hook called
// from inside JSX would run a different number of times between those two
// paths — the "rendered fewer hooks than expected" crash. Here the context is
// read at the top of a component that renders whenever a Container does, so
// the order is fixed however the screen branches.
//
// Screens pass the edges they genuinely own — usually ["left", "right"], plus
// "top" when there is no header above them. Never "bottom": that is this
// component's decision to make.
export function TabSafeAreaView({ edges = ["left", "right"], ...rest }) {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  return (
    <SafeAreaView edges={tabBarHeight ? edges : [...edges, "bottom"]} {...rest} />
  );
}
