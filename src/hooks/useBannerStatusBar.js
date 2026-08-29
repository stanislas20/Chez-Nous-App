import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { setStatusBarStyle } from "expo-status-bar";
import { useTheme } from "../theme/ThemeContext";

// White status bar icons, for the screens whose banner runs underneath them.
//
// A screen that paints its emerald gradient behind the status bar also owns
// the clock and the battery sitting on top of it. App.js sets one style for
// the whole app — dark icons in light mode — and dark icons on #07362A are
// not low contrast, they are gone.
//
// Imperative rather than a second <StatusBar> inside the screen. Tab screens
// stay mounted once visited, and mounted StatusBar components merge in mount
// order, so the style would be decided by whichever tab was opened last
// rather than by the one being looked at. useFocusEffect asks the only
// question that matters — is this screen the one on screen — and the cleanup
// hands the app default back on the way out, since the <StatusBar> in App.js
// does not re-apply itself when something else has changed the style.
export function useBannerStatusBar() {
  const { scheme } = useTheme();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle(scheme === "dark" ? "light" : "dark");
    }, [scheme]),
  );
}
