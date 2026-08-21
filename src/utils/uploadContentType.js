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
