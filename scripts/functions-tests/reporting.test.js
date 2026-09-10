// What actually leaves the device when something goes wrong.
//
// A crash reporter is a pipe to a third party that retains what it is given.
// The scrubbing in reportError.js is the only thing between a caught error and
// somebody's phone number sitting in a Crashlytics console — and it is the
// kind of code that is never exercised, because it only runs on the failure
// path.
//
// So this drives the real reporter with a fake sink and reads what came out.
// It covers all three entry points C6 asks about: a handled non-fatal, a React
// render error (via the boundary's reportFatal call), and an unhandled JS
// error (via the global handler's).
//
// Run: node scripts/functions-tests/reporting.test.js
const path = require("path");
const babel = require("@babel/core");
const { check, report, assert } = require("./harness");

// The real module, compiled from source so this cannot drift from the app.
function loadModule(relative, stubs = {}) {
  const file = path.join(__dirname, "..", "..", relative);
  const { code } = babel.transformFileSync(file, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  const require_ = (id) => (id in stubs ? stubs[id] : require(id));
  new Function("module", "exports", "require", code)(module, module.exports, require_);
  return module.exports;
}

const firebaseErrors = loadModule("src/utils/firebaseErrors.js");
const reportError = loadModule("src/utils/reportError.js", {
  "./firebaseErrors": firebaseErrors,
});

// The sink. Everything the app would have sent to Crashlytics lands here.
const sent = [];
reportError.setErrorReporter({
  recordError: (error, payload) => sent.push({ error, payload }),
});

// Things that must never appear in a report, whatever a call site passes.
const SECRETS = [
  "+22997123456",
  "0197123456",
  "buyer@example.com",
  "hunter2",
  "eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OQ",
  "Bonjour, je vends ma voiture pour 3 500 000",
  "RB/COT/2019/A/1234",
];

function lastPayloadText() {
  return JSON.stringify(sent[sent.length - 1]?.payload ?? {});
}

function assertNoSecrets(where) {
  const text = lastPayloadText();
  for (const secret of SECRETS) {
    assert.ok(!text.includes(secret), `${where} leaked "${secret}"`);
  }
}

async function main() {
  // ── 1. A handled non-fatal ────────────────────────────────────────────
  await check("a handled non-fatal reaches the reporter", () => {
    sent.length = 0;
    const error = new Error("Missing or insufficient permissions.");
    error.code = "permission-denied";
    reportError.reportNonFatal("publishListing", error, {
      assetCount: 3,
      category: "vehicles",
      editing: false,
    });
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].payload.where, "publishListing");
    assert.strictEqual(sent[0].payload.code, "permission-denied");
    assert.strictEqual(sent[0].payload.kind, "permission");
    // Non-identifying context survives, because it is what makes a report
    // useful: three photos and a category is a reproducible case.
    assert.strictEqual(sent[0].payload.assetCount, "3");
    assert.strictEqual(sent[0].payload.category, "vehicles");
  });

  // ── 2. A React render error, as AppErrorBoundary files it ─────────────
  await check("a render error is filed as fatal, with its component stack", () => {
    sent.length = 0;
    const error = new TypeError("Cannot read property 'toMillis' of undefined");
    const componentStack =
      "\n    in ProductDetailScreen\n    in RCTView\n    in RootNavigator";
    reportError.reportFatal("root", error, componentStack);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].payload.fatal, true);
    assert.ok(sent[0].payload.stack.includes("ProductDetailScreen"));
  });

  // ── 3. An unhandled JS error, as the global handler files it ──────────
  await check("an uncaught error is filed as fatal", () => {
    sent.length = 0;
    reportError.reportFatal("uncaught", new Error("boom"));
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].payload.where, "uncaught");
    assert.strictEqual(sent[0].payload.fatal, true);
  });

  await check("an unhandled rejection is filed as a non-fatal", () => {
    sent.length = 0;
    const error = new Error("rejected");
    error.code = "internal";
    reportError.reportNonFatal("unhandledRejection", error);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].payload.where, "unhandledRejection");
  });

  // ── The part that matters: nothing personal gets out ──────────────────
  await check("keys that name personal data are redacted outright", () => {
    sent.length = 0;
    reportError.reportNonFatal("sendMessage", new Error("failed"), {
      phone: "+22997123456",
      email: "buyer@example.com",
      password: "hunter2",
      messageText: "Bonjour, je vends ma voiture pour 3 500 000",
      cvFileName: "Kossi-CV.pdf",
      idToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OQ",
      rccm: "RB/COT/2019/A/1234",
    });
    const payload = sent[0].payload;
    for (const key of ["phone", "email", "password", "messageText", "cvFileName", "idToken", "rccm"]) {
      assert.strictEqual(payload[key], "[redacted]", `${key} was not redacted`);
    }
    assertNoSecrets("redaction");
  });

  await check("personal data hidden under an innocent key is still scrubbed", () => {
    // The whitelist is only as good as the least careful call site, which is
    // why the values are scrubbed as well as the keys.
    sent.length = 0;
    reportError.reportNonFatal("contactSeller", new Error("failed"), {
      note: "call +22997123456 or write to buyer@example.com",
      reference: "eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OQ",
    });
    assertNoSecrets("value scrubbing");
    assert.ok(sent[0].payload.note.includes("[number]"), sent[0].payload.note);
    assert.ok(sent[0].payload.note.includes("[email]"), sent[0].payload.note);
    assert.ok(sent[0].payload.reference.includes("[token]"), sent[0].payload.reference);
  });

  await check("an error MESSAGE carrying personal data is scrubbed too", () => {
    sent.length = 0;
    reportError.reportNonFatal(
      "signUp",
      new Error("Could not create account for +22997123456 (buyer@example.com)"),
      {},
    );
    assertNoSecrets("error message");
  });

  await check("a whole document passed as context does not travel", () => {
    sent.length = 0;
    reportError.reportNonFatal("publishListing", new Error("failed"), {
      listing: {
        titleFr: "Bonjour, je vends ma voiture pour 3 500 000",
        phone: "+22997123456",
      },
    });
    assert.strictEqual(sent[0].payload.listing, "[object]");
    assertNoSecrets("nested object");
  });

  await check("a fatal report's message is scrubbed as well", () => {
    sent.length = 0;
    reportError.reportFatal(
      "root",
      new Error("render failed for buyer@example.com"),
      "\n    in Screen",
    );
    assertNoSecrets("fatal message");
  });

  // ── Noise control ─────────────────────────────────────────────────────
  await check("being offline is not reported", () => {
    sent.length = 0;
    const error = new Error("Failed to get document because the client is offline.");
    error.code = "unavailable";
    reportError.reportNonFatal("loadFeed", error);
    assert.strictEqual(
      sent.length,
      0,
      "offline errors would bury every real failure under every subway journey",
    );
  });

  await check("a cancelled upload is not reported", () => {
    sent.length = 0;
    const error = new Error("User canceled the upload.");
    error.code = "storage/canceled";
    reportError.reportNonFatal("publishListing", error);
    assert.strictEqual(sent.length, 0);
  });

  await check("a reporter that throws does not take the app down with it", () => {
    reportError.setErrorReporter({
      recordError: () => {
        throw new Error("Crashlytics is having a bad day");
      },
    });
    // Must not throw.
    reportError.reportNonFatal("publishListing", new Error("failed"));
    reportError.reportFatal("root", new Error("failed"), "");
    reportError.setErrorReporter({
      recordError: (error, payload) => sent.push({ error, payload }),
    });
  });

  // ── The classifier the error messages depend on ───────────────────────
  await check("errors are classified into the five buckets", () => {
    const cases = [
      ["permission-denied", "permission"],
      ["storage/unauthorized", "permission"],
      ["unavailable", "offline"],
      ["storage/retry-limit-exceeded", "offline"],
      ["resource-exhausted", "busy"],
      ["storage/quota-exceeded", "busy"],
      ["storage/canceled", "cancelled"],
      ["something/unheard-of", "unknown"],
    ];
    for (const [code, expected] of cases) {
      const error = new Error("x");
      error.code = code;
      assert.strictEqual(
        firebaseErrors.classifyError(error),
        expected,
        `${code} classified wrongly`,
      );
    }
    // A codeless network failure is still recognised from its message.
    assert.strictEqual(
      firebaseErrors.classifyError(new Error("Network request timed out")),
      "offline",
    );
  });

  await check("every bucket maps to a real translation key", () => {
    const translations = (() => {
      const file = path.join(__dirname, "..", "..", "src", "i18n", "translations.js");
      const { code } = babel.transformFileSync(file, {
        presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      });
      const module = { exports: {} };
      new Function("module", "exports", "require", code)(module, module.exports, require);
      return module.exports.translations;
    })();
    for (const code of [
      "permission-denied",
      "unavailable",
      "resource-exhausted",
      "storage/canceled",
      "nope/unknown",
    ]) {
      const error = new Error("x");
      error.code = code;
      const key = firebaseErrors.uploadErrorKey(error);
      assert.ok(translations.en[key], `${key} missing from en`);
      assert.ok(translations.fr[key], `${key} missing from fr`);
    }
  });

  report("error-reporting cases");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
