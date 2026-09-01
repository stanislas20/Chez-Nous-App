// The MIME type to declare when uploading to Firebase Storage.
//
// Every write rule in storage.rules gates on `request.resource.contentType`
// matching image/* or video/*. A blob built the way React Native builds
// them — `await (await fetch(fileUri)).blob()` — carries no type at all, so
// an upload that omits this is rejected by the rules and surfaces to the
// user as nothing more informative than "Upload failed". It has cost this
// project a company signup and a listing publish already.
//
// So: always pass a contentType, and derive it from the file rather than
// hardcoding image/jpeg, or a video upload gets declared as a photo.
const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
};

// `mediaType` is the picker's own image/video classification, used when the
// URI has no usable extension — a cache path can be extensionless, and
// guessing wrong there is what the fallback exists to avoid.
export function guessContentType(uri, mediaType = "image") {
  const extension = String(uri ?? "")
    .split("?")[0]
    .split(".")
    .pop()
    .toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? (mediaType === "video" ? "video/mp4" : "image/jpeg");
}

// How long an uploaded file may be cached, and by whom.
//
// Firebase Storage sets no cache-control of its own, so everything it holds
// is served `private, max-age=0` — measured, not assumed:
//
//   $ curl -sI ".../listings/…/1787242522838-1.jpg?alt=media&token=…"
//   cache-control: private, max-age=0
//
// which means nothing keeps a copy. Every time a screen re-mounted after
// the phone dropped its in-memory copy, the same listing photo came down
// the wire again, on a connection the reader is paying for by the megabyte.
//
// `immutable` is the strong claim here and it is true: no path is ever
// written twice. Every upload names its file with Date.now(), so a file's
// bytes can never change under a URL somebody already has — the listing
// points at a new path instead.
//
// Public for anything shown to everyone: listing photos, ads, avatars,
// logos. Private for what belongs to one conversation or one recipient —
// a chat attachment, a voice note, a CV. `private` still lets the phone
// keep its copy; it stops shared caches from keeping one.
export const PUBLIC_UPLOAD_CACHE = "public, max-age=31536000, immutable";
export const PRIVATE_UPLOAD_CACHE = "private, max-age=31536000, immutable";
