// Everything lives in app.json except the one value that must differ between
// a build you install yourself and a build you send to Apple.
//
// `aps-environment` decides which APNs gateway the device's push token is
// issued against. Ship a store build carrying "development" and the token is
// a sandbox token, the live gateway does not recognise it, and every
// notification silently fails for every real user. Nothing in the build
// output says so — you find out from the reviews.
//
// So it is read from the environment, with the safe default. A local
// `expo run:ios` needs "development" and gets it without anyone thinking
// about it; a release build has to say so out loud:
//
//   APS_ENVIRONMENT=production npx expo prebuild -p ios --clean
//
// Expo reads app.json first and hands the normalised result here as
// `config`; what this returns is the configuration actually used.
const APS = process.env.APS_ENVIRONMENT ?? "development";

if (!["development", "production"].includes(APS)) {
  throw new Error(
    `APS_ENVIRONMENT must be "development" or "production", got "${APS}". ` +
      `A typo here becomes an entitlement no device honours.`,
  );
}

// A production build must not carry the emulator switch.
//
// This runs during prebuild and export, which is the last moment anything in
// this repository can see the configuration before it becomes a binary.
// APS_ENVIRONMENT=production is the documented signal for an iOS build headed
// for TestFlight or the App Store; the Android release path calls the same
// check from `npm run build:android`. See scripts/check-release-config.js for
// why a comment saying "empty in every ordinary build" was not enough.
if (APS === "production") {
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (host && host.trim()) {
    throw new Error(
      `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST is set to "${host.trim()}" while ` +
        `building with APS_ENVIRONMENT=production. That value is inlined into ` +
        `the bundle, so the shipped app would talk to a development machine ` +
        `instead of Firebase. Unset it in your shell and remove it from .env.`,
    );
  }
}

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    entitlements: {
      ...config.ios?.entitlements,
      "aps-environment": APS,
    },
  },
});
