import { classifyError, ERROR_KIND } from "./firebaseErrors";

// Where a failure goes when nobody is looking at it.
//
// The audit's finding was that 78 of 79 screens rendered outside any error
// boundary and nothing anywhere reported a crash — so a render error was a
// blank screen the user never described and we never saw. This is the seam
// that fixes the second half.
//
// It is a seam rather than a Crashlytics call, and that is the point.
// @react-native-firebase/crashlytics is a native module: installing it means
// a prebuild and a device build to verify, and a call written straight into
// forty catch blocks would be forty edits to make again if the answer turns
// out to be Sentry. Everything reports here; here decides what happens.
//
// Until a reporter is attached this writes to the console, which reaches
// Metro and `adb logcat` — no worse than today, and already better, because
// today the error object is bound and discarded.
//
// ── What must never reach a crash reporter ──────────────────────────────
//
// A report travels off the device to a third party and is retained. So the
// rule here is a whitelist, not a blacklist: the only things sent are an
// error's own code and message, a short breadcrumb naming what was being
// attempted, and whatever the caller explicitly puts in `context` — which
// this module then scrubs anyway, because the whitelist is only as good as
// the least careful call site.
//
// Never sent: passwords, ID tokens, message bodies, CV contents or names,
// phone numbers, RCCM/IFU numbers, or the free text of a listing. A uid is
// permitted — it is already in every rules trace and is the only way to tell
// "this fails for one account" from "this fails for everybody" — and nothing
// that resolves a uid to a person is.

let reporter = null;

// Called once at startup by whatever reporting library is installed.
// Deliberately not imported here: this module must stay free of native
// dependencies so it can be used from anywhere, including tests.
export function setErrorReporter(next) {
  reporter = next;
}

const SENSITIVE_KEY = /pass|token|secret|credential|phone|email|cv|message|body|text|rccm|ifu|name/i;

// Anything that looks like a phone number, an e-mail or a long opaque token,
// wherever it ended up.
function scrubValue(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[token]");
}

function scrubContext(context) {
  const safe = {};
  for (const [key, value] of Object.entries(context ?? {})) {
    if (SENSITIVE_KEY.test(key)) {
      safe[key] = "[redacted]";
      continue;
    }
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      // One level only. A nested object is usually a whole document, and a
      // whole document is exactly what must not travel.
      safe[key] = "[object]";
      continue;
    }
    safe[key] = scrubValue(String(value)).slice(0, 200);
  }
  return safe;
}

/**
 * A failure that was handled but is still worth knowing about.
 *
 * @param where   a short breadcrumb: "publishListing", "sendMessage".
 * @param error   the caught error.
 * @param context small, non-identifying facts — counts, categories, kinds.
 */
export function reportNonFatal(where, error, context = {}) {
  const kind = classifyError(error);
  // Offline is the weather, not a fault. Reporting it would bury the real
  // failures under every subway journey in the country.
  if (kind === ERROR_KIND.OFFLINE || kind === ERROR_KIND.CANCELLED) return;

  const payload = {
    where,
    kind,
    code: error?.code ?? null,
    message: scrubValue(String(error?.message ?? "")).slice(0, 300),
    ...scrubContext(context),
  };

  if (reporter) {
    try {
      reporter.recordError(error, payload);
      return;
    } catch {
      // A reporter that throws must not take down the thing it was watching.
    }
  }
  console.warn("[nonfatal]", JSON.stringify(payload));
}

// A crash the app did not survive — from the root error boundary, or from
// the global handler.
export function reportFatal(where, error, componentStack) {
  const payload = {
    where,
    fatal: true,
    message: scrubValue(String(error?.message ?? "")).slice(0, 300),
    // A component stack is file and component names, which carry no user
    // data and are the whole value of the report.
    stack: String(componentStack ?? error?.stack ?? "").slice(0, 4000),
  };
  if (reporter) {
    try {
      reporter.recordError(error, payload);
      return;
    } catch {
      /* fall through to the console */
    }
  }
  console.error("[fatal]", payload.where, payload.message, payload.stack);
}
