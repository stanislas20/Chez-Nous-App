// What a listing video is allowed to weigh.
//
// Photographs are capped by resizing them — see downscalePhoto. A video
// cannot be handled that way: shrinking one means transcoding it, which
// needs a native encoder this app does not carry, so the only honest
// answers are to accept it or to refuse it and say why.
//
// Refusing matters more than it sounds. Nothing capped video before this:
// the picker offered `mediaTypes: ["images", "videos"]` with no limit, so a
// minute of 4K off a modern phone — 300 MB and up — went straight at
// Firebase Storage over whatever connection the seller had. Three things
// follow from that, and the seller pays for all three: an upload that eats
// their data bundle, an upload that very often never finishes at all on a
// weak connection, and a clip every buyer then streams.
//
// So: a minute, and 50 MB. A minute is longer than any listing clip needs —
// a walk around a car, a room, a machine running. 50 MB is roughly what a
// minute of 1080p costs, so the two limits agree for a normally-shot video
// and the size limit only bites on 4K, which is where the real damage is.
//
// The numbers are stated to the seller in the refusal, because "too large"
// with no number tells somebody nothing about what to do next.
export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const MEGABYTE = 1024 * 1024;

// Splits a picker result into what may be uploaded and what may not.
//
// A missing duration or size is treated as acceptable rather than refused:
// both fields are optional in expo-image-picker's result, and refusing a
// video because the picker declined to describe it would block uploads that
// are perfectly fine on the phones that report the least.
export function partitionByVideoLimits(assets) {
  const allowed = [];
  const refused = [];
  (assets ?? []).forEach((asset) => {
    if (asset?.type !== "video") {
      allowed.push(asset);
      return;
    }
    // expo-image-picker reports duration in milliseconds.
    const seconds = asset.duration != null ? asset.duration / 1000 : null;
    const bytes = asset.fileSize ?? null;
    const tooLong = seconds != null && seconds > MAX_VIDEO_SECONDS;
    const tooBig = bytes != null && bytes > MAX_VIDEO_BYTES;
    if (tooLong || tooBig) refused.push({ asset, seconds, bytes, tooLong, tooBig });
    else allowed.push(asset);
  });
  return { allowed, refused };
}

// The sentence a seller reads. Names the limit and the actual figure, so
// "trim it" is an instruction they can act on rather than a guess.
export function videoRefusalMessage(refused, t) {
  const first = refused[0];
  if (!first) return "";
  if (first.tooLong) {
    return t("sellVideoTooLong", {
      max: MAX_VIDEO_SECONDS,
      actual: Math.round(first.seconds),
    });
  }
  return t("sellVideoTooLarge", {
    max: Math.round(MAX_VIDEO_BYTES / MEGABYTE),
    actual: Math.round(first.bytes / MEGABYTE),
  });
}
