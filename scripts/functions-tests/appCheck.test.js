// The App Check bridge, exercised without a device.
//
// What a device is genuinely needed for: Play Integrity and App Attest
// producing a real token. That is step one of the checklist in
// docs/APP-CHECK.md and cannot be faked here.
//
// What does NOT need a device, and is where the mistakes actually live:
// which provider is chosen in which build, whether the token from React
// Native Firebase reaches the JS SDK at all, what shape it arrives in, and
// whether a binary without the native module keeps working. The last one
// matters most — enforcement is off, so a bridge that throws would be a
// self-inflicted outage in exchange for a protection not yet applied.
//
// Both SDKs are stubbed, so this measures the wiring rather than Google.
//
// Run: node scripts/functions-tests/appCheck.test.js
const path = require("path");
const babel = require("@babel/core");
const { check, report, assert } = require("./harness");

const SOURCE = path.join(__dirname, "..", "..", "src", "config", "appCheck.js");

// Loads a fresh copy of the module with both SDKs stubbed, so each case gets
// its own `started` flag and its own recording of what happened.
function loadBridge({ dev, nativeAvailable = true, nativeToken = "native-token", jsThrows = false }) {
  const { code } = babel.transformFileSync(SOURCE, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });

  const recorded = {
    providerConfig: null,
    nativeInit: null,
    jsInit: null,
    tokenRequests: 0,
  };

  const rnAppCheck = {
    newReactNativeFirebaseAppCheckProvider: () => ({
      configure: (options) => {
        recorded.providerConfig = options;
      },
    }),
    initializeAppCheck: (app, options) => {
      recorded.nativeInit = options;
      return { native: true };
    },
    getToken: async () => {
      recorded.tokenRequests += 1;
      return { token: nativeToken };
    },
  };

  const stubs = {
    "firebase/app-check": {
      initializeAppCheck: (app, options) => {
        if (jsThrows) throw new Error("JS SDK App Check refused");
        recorded.jsInit = options;
      },
      CustomProvider: class CustomProvider {
        constructor(options) {
          this.options = options;
        }
      },
    },
    "@react-native-firebase/app-check": nativeAvailable
      ? rnAppCheck
      : (() => {
          throw new Error("Cannot find module '@react-native-firebase/app-check'");
        }),
    "@react-native-firebase/app": { getApp: () => ({ name: "[DEFAULT]" }) },
  };

  const module = { exports: {} };
  const require_ = (id) => {
    const stub = stubs[id];
    if (typeof stub === "function" && !stub.prototype) return stub();
    if (stub) return stub;
    return require(id);
  };
  global.__DEV__ = dev;
  new Function("module", "exports", "require", code)(module, module.exports, require_);
  return { bridge: module.exports, recorded };
}

async function main() {
  // ── Provider selection ────────────────────────────────────────────────
  await check("a release build asks for the real attestation providers", async () => {
    const { bridge, recorded } = loadBridge({ dev: false });
    const result = await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.strictEqual(result.active, true, result.reason);
    assert.strictEqual(recorded.providerConfig.android.provider, "playIntegrity");
    assert.strictEqual(
      recorded.providerConfig.apple.provider,
      "appAttestWithDeviceCheckFallback",
    );
  });

  await check("a development build asks for the debug providers", async () => {
    const { bridge, recorded } = loadBridge({ dev: true });
    await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.strictEqual(recorded.providerConfig.android.provider, "debug");
    assert.strictEqual(recorded.providerConfig.apple.provider, "debug");
  });

  await check("the debug provider can never be chosen by a release build", async () => {
    // The one that would matter: a debug token accepted in production is a
    // bypass anybody can register. It is selected by __DEV__ alone, so the
    // assertion is that nothing else can reach it.
    const source = require("fs").readFileSync(SOURCE, "utf8");
    const debugMentions = source.match(/"debug"/g) ?? [];
    assert.strictEqual(debugMentions.length, 2, "unexpected debug provider references");
    assert.ok(
      /__DEV__ \? "debug"/.test(source.replace(/\s+/g, " ")),
      "the debug provider is not gated on __DEV__",
    );
  });

  // ── The bridge itself: the trap this whole file exists for ────────────
  await check("the native token is handed to the JS SDK, not just minted", async () => {
    const { bridge, recorded } = loadBridge({ dev: false, nativeToken: "tok-abc" });
    await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.ok(recorded.jsInit, "the JS SDK was never given a provider at all");
    const provider = recorded.jsInit.provider;
    assert.ok(provider?.options?.getToken, "the CustomProvider has no getToken");
    const token = await provider.options.getToken();
    assert.strictEqual(token.token, "tok-abc");
    assert.strictEqual(
      recorded.tokenRequests,
      1,
      "the JS SDK did not actually ask React Native Firebase for a token",
    );
  });

  await check("the token carries an expiry the JS SDK can use", async () => {
    // RNFirebase does not report one and the JS SDK requires it. A missing or
    // past expiry makes every request re-attest, which on Play Integrity is a
    // round trip to Google per call.
    const { bridge, recorded } = loadBridge({ dev: false });
    await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    const token = await recorded.jsInit.provider.options.getToken();
    assert.strictEqual(typeof token.expireTimeMillis, "number");
    const minutesAhead = (token.expireTimeMillis - Date.now()) / 60000;
    assert.ok(minutesAhead > 30 && minutesAhead <= 60, `${minutesAhead} minutes ahead`);
  });

  await check("auto-refresh is on for both SDKs", async () => {
    const { bridge, recorded } = loadBridge({ dev: false });
    await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.strictEqual(recorded.nativeInit.isTokenAutoRefreshEnabled, true);
    assert.strictEqual(recorded.jsInit.isTokenAutoRefreshEnabled, true);
  });

  // ── Failure behaviour ─────────────────────────────────────────────────
  await check("a binary with no native module keeps working", async () => {
    const { bridge } = loadBridge({ dev: false, nativeAvailable: false });
    const result = await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.strictEqual(result.active, false);
    assert.strictEqual(result.reason, "native-unavailable");
  });

  await check("a JS SDK failure does not throw either", async () => {
    const { bridge } = loadBridge({ dev: false, jsThrows: true });
    const result = await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.strictEqual(result.active, false);
    assert.strictEqual(result.reason, "bridge-failed");
  });

  await check("initialising twice does not open two bridges", async () => {
    const { bridge, recorded } = loadBridge({ dev: false });
    await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    const second = await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.strictEqual(second.active, false);
    assert.strictEqual(second.reason, "already-started");
    assert.ok(recorded.jsInit, "the first call still did its work");
  });

  await check("a missing app is refused rather than crashing", async () => {
    const { bridge } = loadBridge({ dev: false });
    const result = await bridge.initializeAppCheckBridge(null);
    assert.strictEqual(result.active, false);
  });

  // ── Configuration that has to be in the build ─────────────────────────
  await check("app.json carries the App Check plugin and static linking", async () => {
    const config = JSON.parse(
      require("fs").readFileSync(path.join(__dirname, "..", "..", "app.json"), "utf8"),
    );
    const plugins = config.expo.plugins;
    assert.ok(
      plugins.includes("@react-native-firebase/app-check"),
      "the config plugin is missing, so prebuild will not link the module",
    );
    const buildProps = plugins.find(
      (p) => Array.isArray(p) && p[0] === "expo-build-properties",
    );
    assert.ok(
      buildProps[1].ios.forceStaticLinking.includes("RNFBAppCheck"),
      "RNFBAppCheck is not force-static-linked; this project uses static " +
        "frameworks on iOS and the pod will not resolve without it",
    );
  });

  await check("the bridge is started before Firestore, Storage and Functions", async () => {
    // App Check attaches its token to requests made AFTER it initialises, so
    // a listener opened first goes out unattested. This is why it lives in
    // config/firebase.js rather than in App.js.
    const config = require("fs").readFileSync(
      path.join(__dirname, "..", "..", "src", "config", "firebase.js"),
      "utf8",
    );
    const bridgeAt = config.indexOf("initializeAppCheckBridge");
    const firestoreAt = config.indexOf("getFirestore(app)");
    const storageAt = config.indexOf("getStorage(app)");
    const functionsAt = config.indexOf("getFunctions(app)");
    assert.ok(bridgeAt > 0, "the bridge is never started");
    assert.ok(bridgeAt < firestoreAt, "Firestore is created before App Check");
    assert.ok(bridgeAt < storageAt, "Storage is created before App Check");
    assert.ok(bridgeAt < functionsAt, "Functions is created before App Check");
  });

  await check("nothing in the app enables enforcement", async () => {
    // Enforcement is a console switch, not a code one — but a stray
    // `enforceAppCheck` in a callable would enforce for that function alone
    // and lock out every already-installed copy of the app.
    const fs = require("fs");
    const functionsDir = path.join(__dirname, "..", "..", "functions");
    for (const file of fs.readdirSync(functionsDir)) {
      if (!file.endsWith(".js")) continue;
      const source = fs.readFileSync(path.join(functionsDir, file), "utf8");
      assert.ok(
        !/enforceAppCheck:\s*true/.test(source),
        `${file} enables App Check enforcement — that is a console decision`,
      );
    }
  });

  report("App Check bridge cases");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
