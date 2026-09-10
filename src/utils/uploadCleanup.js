import { deleteObject, ref } from "firebase/storage";
import { storage } from "../config/firebase";

// Take back the files an abandoned attempt left in the bucket.
//
// The upload loop runs before the Firestore write, so every failure after the
// first file lands leaves objects nothing references — and unreferenced means
// unfindable, because there is no document to join them back to. They could
// not be cleaned up later even deliberately, only by walking the whole
// bucket. A seller retrying a failed publish on a bad connection left another
// full set each time.
//
// Idempotent and quiet, on purpose. A path that is already gone, or one whose
// upload never actually created an object, resolves the same way as a
// successful delete: the caller is on a failure path already and a cleanup
// that throws would replace one bad message with a worse one.
//
// Never call this with paths carried over from a previous save. The publish
// form tracks only what THIS attempt uploaded, so a failed edit cannot delete
// the photographs of the listing being edited.
export async function cleanUpAbandonedUploads(paths) {
  const unique = [...new Set((paths ?? []).filter(Boolean))];
  if (unique.length === 0) return { attempted: 0, removed: 0 };

  const results = await Promise.allSettled(
    unique.map((path) => deleteObject(ref(storage, path))),
  );
  return {
    attempted: unique.length,
    removed: results.filter((r) => r.status === "fulfilled").length,
  };
}

// Every stored path a listing document owns.
//
// Mirrors listingStoragePaths in functions/index.js, and has to stay in step
// with it: the cover is `mediaPath`, its small copy is `thumbPath`, and every
// entry of `media` carries its own pair. The client delete used to know two
// of the four, which is why every thumbnail ever generated outlived its
// listing.
export function listingStoragePaths(listing) {
  const paths = [listing?.mediaPath, listing?.thumbPath];
  for (const item of Array.isArray(listing?.media) ? listing.media : []) {
    paths.push(item?.mediaPath, item?.thumbPath);
  }
  return [...new Set(paths.filter((path) => typeof path === "string" && path))];
}

// The files an edit has just stopped referencing.
//
// Replacing a photograph uploaded the new one and left the old one in the
// bucket forever — the delete path only ever ran when a whole listing was
// deleted, and the server-side trigger only fires on that same event. So the
// edit has to say so itself: whatever the listing owned before, minus
// whatever it owns now.
//
// Computed from the two documents rather than from what the picker did,
// because the picker's state does not survive the screen and a carried-over
// asset and a re-uploaded one look identical from there.
export function pathsDroppedByEdit(previousListing, nextMedia) {
  const before = new Set(listingStoragePaths(previousListing));
  const after = new Set(
    listingStoragePaths({ media: nextMedia, mediaPath: null, thumbPath: null }),
  );
  return [...before].filter((path) => !after.has(path));
}
