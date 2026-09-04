import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// The chevron in a header, in one place.
//
// It lived inside RootNavigator, where five stack screens used it. The
// Messages tab needs the same one — a bottom tab draws no back control of
// its own, so somebody who reached Messages from the Vendre dashboard had
// the system back button and nothing on screen — and two chevrons defined
// in two files drift in size and colour without anybody deciding to.
//
// hideWhenRoot is for the tab. A stack screen pushed onto another always
// has somewhere to return to, so its chevron is unconditional; a tab may
// be the first thing the app ever showed, and a back button that leads
// nowhere is worse than no back button. Asked of the navigator rather than
// assumed, so the control appears exactly when it can do something.
export function renderHeaderBackButton(navigation, color, { hideWhenRoot = false } = {}) {
  return () => {
    if (hideWhenRoot && !navigation.canGoBack()) return null;
    return (
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={backButtonStyle}
      >
        <Ionicons name="chevron-back" size={26} color={color} />
      </Pressable>
    );
  };
}

const backButtonStyle = { paddingRight: 12, paddingVertical: 4 };
