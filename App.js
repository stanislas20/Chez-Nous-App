import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import {
  navigationRef,
  onNavigationReady,
} from "./src/navigation/navigationRef";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from "expo-screen-orientation";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { I18nProvider } from "./src/i18n/I18nContext";
import { AuthProvider } from "./src/auth/AuthContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { BrandSplash } from "./src/components/BrandSplash";
import { useI18n } from "./src/i18n/I18nContext";

SplashScreen.preventAutoHideAsync();

// app.json declares "default" so the native binary is *allowed* to rotate —
// without that, nothing at runtime can unlock it. Every screen is still laid
// out for portrait, so the app locks itself back the moment it starts and
// only the fullscreen media viewer lifts the lock.
ScreenOrientation.lockAsync(
  ScreenOrientation.OrientationLock.PORTRAIT_UP,
).catch(() => {});

// React Navigation ships its own light-only theme by default, independent
// of our app theme — leave NavigationContainer's `theme` prop unset and it
// silently paints every native nav surface it owns (notably the safe-area
// strip beneath the floating tab bar, which our own styled components don't
// reach) white regardless of dark mode. This mirrors our resolved scheme
// into React Navigation's own theme shape so that strip matches instead of
// showing through as a stray white bar.
function AppNavigationContainer() {
  const { scheme, colors } = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <NavigationContainer
      theme={navigationTheme}
      ref={navigationRef}
      // A notification tapped from a cold start arrives before the navigator
      // exists, so its destination is held and replayed here.
      onReady={onNavigationReady}
    >
      <RootNavigator />
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </NavigationContainer>
  );
}

// GestureHandlerRootView is the true outermost view — above even
// NavigationContainer — and gets no background color by default, so it
// falls back to the native window's white. That shows through as a stray
// white strip at the top (status bar/notch area) in dark mode, same family
// of bug as the NavigationContainer one above, just one layer further out.
function ThemedRoot({ children }) {
  const { colors } = useTheme();
  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {children}
    </GestureHandlerRootView>
  );
}

// The animated opening, over the app rather than before it.
//
// It sits inside I18nProvider because its two lines live in the string table
// with everything else, and above the navigator so the app can mount, fetch
// and settle underneath while it plays — the alternative is a splash that
// ends and hands over to a screen still assembling itself.
//
// The native splash is a separate thing and stays until the fonts are ready:
// the wordmark is set in Plus Jakarta Sans, and starting this one before the
// font loads would swap the letters under the reader mid-animation.
function SplashOverlay({ onDone }) {
  const { t } = useI18n();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <BrandSplash
        onDone={onDone}
        tagline={t("splashTagline")}
        place={t("splashPlace")}
      />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const [openingDone, setOpeningDone] = useState(false);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <ThemedRoot>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <I18nProvider>
            <AuthProvider>
              <AppNavigationContainer />
            </AuthProvider>
            {openingDone ? null : (
              <SplashOverlay onDone={() => setOpeningDone(true)} />
            )}
          </I18nProvider>
        </SafeAreaProvider>
      </ThemedRoot>
    </ThemeProvider>
  );
}
