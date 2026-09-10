import { setErrorReporter } from "./reportError";

// Crashlytics, attached to the seam Phase B built.
//
// Everything in the app already reports through reportNonFatal/reportFatal,
// which scrub before they hand anything on. This is the one place that knows
// Crashlytics exists, so swapping it for Sentry later is this file and
// nothing else.
//
// ── Why the native module is required lazily ────────────────────────────
//
// It is a native module. An import at module scope is evaluated as the bundle
// loads, and a binary built before the package was added throws there — which
// the dev client reports, very unhelpfully, as "App entry not found". The
// notification channels and the App Check bridge both carry the same comment
// and the same shape, for the same reason.
//
// ── What is deliberately NOT sent ───────────────────────────────────────
//
// reportError.js redacts on a key whitelist and scrubs phone numbers, e-mail
// addresses and long opaque tokens out of every string. This file adds no new
// data of its own: no uid is set as a Crashlytics user id, no e-mail, no
// listing text. A uid IS permitted inside a report's context — it is the only
// way to tell "this fails for one account" from "this fails for everybody" —
// and setUserId is still not called, because that attaches the identifier to
// every future event in the session rather than to the one failure being
// described.
//
// Crashlytics attribute values must be strings, and a value over 1024
// characters is dropped by the SDK rather than truncated, so they are
// truncated here.
const MAX_ATTRIBUTE = 1000;

export function attachCrashReporter() {
  let crashlytics;
  try {
    // eslint-disable-next-line global-require
    const module = require("@react-native-firebase/crashlytics");
    crashlytics = module.default ?? module;
  } catch (error) {
    // Not in this binary — Expo Go, or a build made before the package was
    // added. Reports keep going to the console, which is what they did
    // before, and the app is unaffected.
    return { attached: false, reason: "native-unavailable" };
  }

  try {
    const instance = crashlytics();
    setErrorReporter({
      recordError: (error, payload) => {
        const attributes = {};
        for (const [key, value] of Object.entries(payload ?? {})) {
          if (value === null || value === undefined) continue;
          attributes[key] = String(value).slice(0, MAX_ATTRIBUTE);
        }
        // Attributes first: Crashlytics attaches whatever is set at the
        // moment recordError is called, so setting them afterwards would
        // file them against the NEXT error instead of this one.
        instance.setAttributes(attributes).catch(() => {});
        // A breadcrumb as well as the record, because the Crashlytics console
        // shows the log inline with the stack and the `where` is the first
        // thing anybody reading it wants.
        instance.log(`${payload?.where ?? "unknown"}: ${payload?.kind ?? ""}`);
        instance.recordError(error);
      },
    });
    return { attached: true, reason: null };
  } catch (error) {
    return { attached: false, reason: "init-failed" };
  }
}

// A deliberate, harmless non-fatal, for confirming the pipeline works on a
// real device without crashing anything. Wired to nothing: call it from a dev
// build's console or a temporary button. See docs/CRASH-REPORTING.md.
export function sendTestNonFatal() {
  const error = new Error("Chez-Nous test non-fatal — ignore");
  error.code = "test/non-fatal";
  // Routed through the ordinary path on purpose, so what arrives in the
  // console is shaped exactly like a real report, scrubbing included.
  // eslint-disable-next-line global-require
  require("./reportError").reportNonFatal("selfTest", error, {
    deliberate: true,
  });
}
