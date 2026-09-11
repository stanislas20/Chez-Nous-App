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
const fs = require("fs");
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
    reports: [],
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
    // Phase E: the bridge now reports attestation failures instead of
    // returning quietly, so the reporting seam has to exist here too. Every
    // call is recorded, which is what the failure-path cases assert on.
    "../utils/reportError": {
      reportNonFatal: (where, error, context) => {
        recorded.reports.push({ where, message: error?.message, context });
      },
      reportFatal: () => {},
    },
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
    // This assertion changed in Phase E, and the change is the fix rather
    // than a relaxation.
    //
    // It used to require an expiry 30-60 minutes ahead, which passed because
    // the bridge INVENTED `Date.now() + 3600000`. RNFirebase's getToken
    // returns a cached token that may have minutes left, so the SDK was being
    // told it held a fresh hour of something already close to dead — harmless
    // while enforcement is off, and every request refused once it is on.
    //
    // The bridge now reads the token's own `exp` claim. A non-JWT stub token,
    // which is what this harness mints, therefore takes the deliberately
    // SHORT fallback. The real-JWT cases below assert the claim is honoured.
    const { bridge, recorded } = loadBridge({ dev: false });
    await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    const token = await recorded.jsInit.provider.options.getToken();
    assert.strictEqual(typeof token.expireTimeMillis, "number");
    const minutesAhead = (token.expireTimeMillis - Date.now()) / 60000;
    assert.ok(minutesAhead > 0, `${minutesAhead} minutes ahead — expiry is in the past`);
    assert.ok(
      minutesAhead <= 5,
      `${minutesAhead} minutes ahead — an unreadable token must not be ` +
        `granted a long life`,
    );
  });

  await check(
    "a JWT token is given its own expiry rather than the fallback",
    async () => {
      const exp = Math.floor(Date.now() / 1000) + 45 * 60;
      const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
      const { bridge, recorded } = loadBridge({
        dev: false,
        nativeToken: `h.${payload}.s`,
      });
      await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
      const token = await recorded.jsInit.provider.options.getToken();
      assert.strictEqual(token.expireTimeMillis, exp * 1000);
    },
  );

  await check("a binary with no native module is reported, not just skipped", async () => {
    const { bridge, recorded } = loadBridge({ dev: false, nativeAvailable: false });
    const result = await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.strictEqual(result.active, false);
    assert.ok(
      recorded.reports.some((r) => r.where === "appCheckNativeUnavailable"),
      "attestation was unavailable and nothing was reported — once enforcement " +
        "is on this is an app that cannot read anything, and it would be invisible",
    );
  });

  await check("a JS bridge failure is reported too", async () => {
    const { bridge, recorded } = loadBridge({ dev: false, jsThrows: true });
    const result = await bridge.initializeAppCheckBridge({ name: "[DEFAULT]" });
    assert.strictEqual(result.active, false);
    assert.ok(recorded.reports.some((r) => r.where === "appCheckBridgeFailed"));
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

  // ── E11: the expiry the SDK is told is the token's own ───────────────
  await check("a real JWT expiry is read from the token, not invented", async () => {
    const { bridge } = loadBridge({ dev: false });
    const exp = Math.floor(Date.now() / 1000) + 600; // ten minutes
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    const token = `header.${payload}.signature`;
    const got = bridge.tokenExpiryMillis(token, Date.now());
    assert.strictEqual(
      got,
      exp * 1000,
      "the SDK was told something other than the token's own exp claim",
    );
  });

  await check(
    "a cached token near the end of its life is not reported as fresh",
    async () => {
      const { bridge } = loadBridge({ dev: false });
      const now = Date.now();
      const exp = Math.floor(now / 1000) + 30; // thirty seconds left
      const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
      const got = bridge.tokenExpiryMillis(`h.${payload}.s`, now);
      assert.ok(
        got - now < 60 * 1000,
        `told the SDK it had ${(got - now) / 1000}s on a 30s token`,
      );
    },
  );

  await check("an unparseable token gets a short window, not an hour", async () => {
    const { bridge } = loadBridge({ dev: false });
    const now = Date.now();
    const got = bridge.tokenExpiryMillis("not-a-jwt", now);
    assert.ok(got > now, "expiry is in the past");
    assert.ok(
      got - now <= 5 * 60 * 1000,
      `fallback was ${(got - now) / 1000}s; short is the safe direction`,
    );
  });

  await check("an already-expired token is not handed on as valid", async () => {
    const { bridge } = loadBridge({ dev: false });
    const now = Date.now();
    const exp = Math.floor(now / 1000) - 600;
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    const got = bridge.tokenExpiryMillis(`h.${payload}.s`, now);
    assert.ok(got > now, "an expired token was passed through with a past expiry");
  });

  // ── F4: the decoder must work where the app actually runs ────────────
  //
  // The Phase E version used atob with a Buffer fallback. Neither exists in
  // React Native, so on device it always threw and always took the 5-minute
  // fallback — while the cases above passed, because this file runs in Node
  // and Node has Buffer. The test proved a behaviour the target could not
  // reach.
  //
  // So this one evaluates the real source with both globals shadowed away.
  await check("the expiry decoder works with no atob and no Buffer", async () => {
    const source = fs.readFileSync(SOURCE, "utf8");
    const pieces = [
      source.match(/const B64 = [\s\S]*?\n}\n/),
      source.match(/function decodeExpiry\(token\)[\s\S]*?\n}\n/),
      source.match(/export function tokenExpiryMillis[\s\S]*?\n}\n/),
    ];
    assert.ok(pieces.every(Boolean), "appCheck.js no longer has the decoder");
    const body =
      "const FALLBACK_TTL_MS = 5 * 60 * 1000;" +
      pieces[0][0] +
      pieces[1][0] +
      pieces[2][0].replace("export ", "") +
      "return { decodeExpiry, tokenExpiryMillis };";
    // atob and Buffer are parameters, so they shadow anything Node provides.
    const sandbox = new Function("atob", "Buffer", body)(undefined, undefined);

    const now = Date.now();
    const jwt = (payload) => {
      const b64 = Buffer.from(JSON.stringify(payload))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      return `header.${b64}.signature`;
    };

    const exp = Math.floor(now / 1000) + 45 * 60;
    assert.strictEqual(
      sandbox.decodeExpiry(jwt({ exp })),
      exp * 1000,
      "a valid token's exp was not decoded without Node globals",
    );
    assert.strictEqual(sandbox.tokenExpiryMillis(jwt({ exp }), now), exp * 1000);

    // Malformed, expired, near-expiry and non-string all land somewhere safe.
    assert.strictEqual(sandbox.decodeExpiry("not-a-jwt"), null);
    assert.strictEqual(sandbox.tokenExpiryMillis("not-a-jwt", now), now + 5 * 60 * 1000);
    assert.strictEqual(sandbox.decodeExpiry(null), null);
    assert.strictEqual(sandbox.decodeExpiry("h.!!!!!!.s"), null, "invalid base64 accepted");

    const expired = sandbox.tokenExpiryMillis(jwt({ exp: Math.floor(now / 1000) - 600 }), now);
    assert.ok(expired > now, "an expired token was passed through with a past expiry");

    const near = sandbox.tokenExpiryMillis(jwt({ exp: Math.floor(now / 1000) + 30 }), now);
    assert.ok(near - now < 60 * 1000, "a 30-second token was granted a long life");
  });

  report("App Check bridge cases");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
