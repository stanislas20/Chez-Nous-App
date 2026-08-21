import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";

// Camera access, asked for in a way that survives a "Deny".
//
// The bug this replaces: every call site treated `granted === false` as one
// case and showed "something went wrong". But iOS answers every request()
// after the first denial with denied and WITHOUT showing the dialog again,
// so one accidental Deny meant that button could never work again — a user
// who changed their mind had no way back, and the app blamed itself for a
// permission problem it never named.
//
// Three outcomes, so three branches:
//   granted                  → go
//   we can still ask         → ask; if they deny, stay quiet (they just made
//                              that choice in a dialog they saw, so an alert
//                              would only restate it)
//   the dialog is unusable   → say so plainly and offer Settings, which is
//                              the only place the decision can be undone
//
// Only the camera needs this. The versioned docs for this SDK are explicit
// that "no permissions request is necessary for launching the image
// library", so the library pickers call launchImageLibraryAsync directly —
// asking there added a second permanent lockout for no access at all.
export async function ensureCameraAccess({ t, title }) {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;

  if (current.canAskAgain) {
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    return asked.granted;
  }

  Alert.alert(title, t("permissionCameraBlocked"), [
    { text: t("cancel"), style: "cancel" },
    { text: t("permissionOpenSettings"), onPress: () => Linking.openSettings() },
  ]);
  return false;
}
