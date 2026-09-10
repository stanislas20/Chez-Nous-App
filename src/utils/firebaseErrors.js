// What actually went wrong, in words the person reading can act on.
//
// Nearly every catch block in this app collapsed to one sentence — "Upload
// failed. Please try again." — for a rules refusal, a dropped connection, an
// exhausted quota and a bug alike. Two things follow from that, and the
// second is the expensive one:
//
//   the reader cannot tell whether trying again is worth doing, so they
//   either give up on something that would have worked or repeat something
//   that cannot;
//
//   and neither can we. The `error` object was bound and never read, so the
//   only record of a systematic failure was the shape of the complaints.
//
// Five buckets, because five is what a reader can be told apart usefully:
// they are refused, they are offline, the service is busy, they cancelled,
// or something we did not expect went wrong.

export const ERROR_KIND = {
  PERMISSION: "permission",
  OFFLINE: "offline",
  BUSY: "busy",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown",
};

// Firestore and Storage use different code namespaces for the same
// conditions, which is why this is a lookup rather than a switch on one.
const BY_CODE = {
  // Refused by the rules. Retrying changes nothing until something else does.
  "permission-denied": ERROR_KIND.PERMISSION,
  "storage/unauthorized": ERROR_KIND.PERMISSION,
  "functions/permission-denied": ERROR_KIND.PERMISSION,
  unauthenticated: ERROR_KIND.PERMISSION,

  // The network, in its various disguises. Retrying is exactly right.
  unavailable: ERROR_KIND.OFFLINE,
  "deadline-exceeded": ERROR_KIND.OFFLINE,
  "storage/retry-limit-exceeded": ERROR_KIND.OFFLINE,
  "functions/unavailable": ERROR_KIND.OFFLINE,
  "functions/deadline-exceeded": ERROR_KIND.OFFLINE,

  // A limit somebody else's, or ours. Retrying later is right; retrying now
  // is not.
  "resource-exhausted": ERROR_KIND.BUSY,
  "storage/quota-exceeded": ERROR_KIND.BUSY,

  // The reader pressed cancel, or left. Not a failure and not worth an alert.
  "storage/canceled": ERROR_KIND.CANCELLED,
  cancelled: ERROR_KIND.CANCELLED,
};

export function classifyError(error) {
  const code = error?.code;
  if (typeof code === "string" && BY_CODE[code]) return BY_CODE[code];
  // Firestore sometimes reports a lost connection without a code, as a
  // message. Checked after the code table so a real code always wins.
  const message = String(error?.message ?? "").toLowerCase();
  if (/network|offline|unreachable|timed out|timeout/.test(message)) {
    return ERROR_KIND.OFFLINE;
  }
  return ERROR_KIND.UNKNOWN;
}

// The i18n key for a failed publish or upload.
const UPLOAD_KEYS = {
  [ERROR_KIND.PERMISSION]: "errorPermissionDenied",
  [ERROR_KIND.OFFLINE]: "errorUploadOffline",
  [ERROR_KIND.BUSY]: "errorServiceBusy",
  [ERROR_KIND.CANCELLED]: "errorUploadCancelled",
  [ERROR_KIND.UNKNOWN]: "errorUploadFailed",
};

export function uploadErrorKey(error) {
  return UPLOAD_KEYS[classifyError(error)] ?? "errorUploadFailed";
}
