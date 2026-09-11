import { LogBox } from "react-native";

// One warning, silenced by name — and silenced EARLY.
//
// This lived in App.js's module body at first, which never ran in time: ES
// imports are evaluated before the importing module's statements, and App
// Check initialises during the `src/config/firebase` import. The warning was
// already emitted before the filter installed. So it lives here, in a module
// index.js imports before App, which is the only place early enough.
//
// What it hides and why: initializeAppCheckBridge has to call appCheck() to
// reach newReactNativeFirebaseAppCheckProvider and initializeAppCheck. In
// @react-native-firebase/app-check@25.1.0 those exist ONLY on the namespaced
// API — modular.js exports just getToken, getLimitedUseToken,
// setTokenAutoRefreshEnabled and onTokenChanged — so the deprecation notice
// is the price of the call working at all. Calling it the "modular" way is
// what left App Check uninitialised on every build before this.
//
// Matched on its exact text so everything else still reaches the screen. A
// blanket ignoreAllLogs() would hide the next real warning, and three of the
// defects found in this app were found by reading a warning on a device.
//
// Remove when @react-native-firebase gains a modular provider factory — a
// dependency upgrade, not a change here. LogBox does not run in a release
// build, so this is development-only either way.
LogBox.ignoreLogs([
  "This method is deprecated (as well as all React Native Firebase namespaced API)",
]);
