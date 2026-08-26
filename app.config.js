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
