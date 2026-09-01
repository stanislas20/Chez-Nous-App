// Converts the HEIC photographs already in Storage to JPEG.
//
// An iPhone stores its photographs as .heic, uploads carried the file
// through untouched until the downscale went in, and React Native's image
// pipeline on Android has no HEIF decoder. Measured on a real listing: the
// hero showing the .heic slide was 98% one flat colour — the empty
// placeholder — while the next slide, a .jpg from the same listing, drew
// normally. No error, no broken-image icon. Every photograph shot on an
// iPhone before today is invisible in the app, and the seller cannot tell
// because it looks like a picture that has not finished loading.
//
// The app now skips what it cannot decode, so those listings show their
// next photograph instead of a grey rectangle. That hides the problem; it
// does not fix it. This does: it rewrites the file as JPEG, at the same
// 1600px cap new uploads get, adds the 600px thumbnail they get too, and
// repoints the listing at the new file.
//
// What it does NOT do:
//
//   - delete the original .heic. Storage is cheap and an irreversible
//     delete on a first run is not worth it. Remove them by hand once the
//     listings look right, or pass --delete-originals on a later run.
//   - touch anything but `listings`. Avatars and logos can be re-picked by
//     their owner in seconds; a listing's photographs cannot.
//   - run without being asked twice. It prints what it would change and
//     changes nothing unless --apply is passed.
//
// It needs admin credentials, like every other script here:
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/convertHeicPhotos.js                 # dry run
//   GOOGLE_APPLICATION_CREDENTIALS=... \
//     node scripts/convertHeicPhotos.js --apply
//
// Conversion is done by `sips`, which ships with macOS and reads HEIC
// natively. That makes this a script you run from your Mac, not something
// that could be a Cloud Function without adding a HEIF-capable encoder to
// the functions image.
const admin = require("../functions/node_modules/firebase-admin");
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const DELETE_ORIGINALS = process.argv.includes("--delete-originals");

// Kept in step with src/utils/downscalePhoto.js. If those change, a photo
// converted here would differ from one uploaded by the app, which is the
// kind of inconsistency nobody looks for later.
const MAX_UPLOAD_EDGE = 1600;
const THUMBNAIL_EDGE = 600;
const PUBLIC_UPLOAD_CACHE = "public, max-age=31536000, immutable";

const HEIC = /\.(heic|heif)$/i;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "GOOGLE_APPLICATION_CREDENTIALS is not set — see the usage note at the top of this file.",
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: "benin-marketplace-3eb04.firebasestorage.app",
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// The storage path inside a Firebase download URL, which is the whole path
// percent-encoded between /o/ and the query string.
function pathFromUrl(url) {
  const match = /\/o\/([^?]+)/.exec(String(url ?? ""));
  return match ? decodeURIComponent(match[1]) : null;
}

// Firebase builds its download URLs from the bucket, the encoded path and
// the token it keeps in object metadata. Writing the token ourselves is
// what lets the new file have a URL the app can use without a round trip.
function downloadUrl(objectPath, token) {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(objectPath)}?alt=media&token=${token}`
  );
}

async function convertOne(sourcePath, workDir, label) {
  const local = path.join(workDir, `${label}-src.heic`);
  await bucket.file(sourcePath).download({ destination: local });

  const full = path.join(workDir, `${label}.jpg`);
  const thumb = path.join(workDir, `${label}-thumb.jpg`);
  // -Z resizes the longest edge and leaves anything already smaller alone,
  // which is exactly the rule downscalePhoto follows.
  execFileSync("sips", ["-s", "format", "jpeg", "-Z", String(MAX_UPLOAD_EDGE), local, "--out", full]);
  execFileSync("sips", ["-s", "format", "jpeg", "-Z", String(THUMBNAIL_EDGE), local, "--out", thumb]);
  return { full, thumb };
}

async function uploadOne(localFile, objectPath) {
  const token = crypto.randomUUID();
  await bucket.upload(localFile, {
    destination: objectPath,
    metadata: {
      contentType: "image/jpeg",
      cacheControl: PUBLIC_UPLOAD_CACHE,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return downloadUrl(objectPath, token);
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "heic-"));
  const snapshot = await db.collection("listings").get();
  let listingsTouched = 0;
  let filesConverted = 0;
  const problems = [];

  for (const doc of snapshot.docs) {
    const listing = doc.data();
    const media = Array.isArray(listing.media) ? listing.media : [];
    const heicIndexes = media
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item?.mediaType !== "video" && HEIC.test(pathFromUrl(item?.mediaUrl) ?? ""));

    if (!heicIndexes.length) continue;

    const title = listing.titleFr || listing.titleEn || doc.id;
    console.log(`\n${title} (${doc.id}) — ${heicIndexes.length} HEIC photo(s)`);
    listingsTouched += 1;

    if (!APPLY) {
      heicIndexes.forEach(({ item, index }) =>
        console.log(`  [${index}] ${pathFromUrl(item.mediaUrl)}`),
      );
      filesConverted += heicIndexes.length;
      continue;
    }

    const nextMedia = [...media];
    for (const { item, index } of heicIndexes) {
      const sourcePath = pathFromUrl(item.mediaUrl);
      try {
        const label = `${doc.id}-${index}`;
        const { full, thumb } = await convertOne(sourcePath, workDir, label);
        const base = sourcePath.replace(HEIC, "");
        const fullPath = `${base}.jpg`;
        const thumbPath = `${base}-thumb.jpg`;
        const mediaUrl = await uploadOne(full, fullPath);
        const thumbUrl = await uploadOne(thumb, thumbPath);
        nextMedia[index] = {
          ...item,
          mediaUrl,
          mediaPath: fullPath,
          thumbUrl,
          thumbPath,
        };
        if (DELETE_ORIGINALS) await bucket.file(sourcePath).delete();
        filesConverted += 1;
        console.log(`  [${index}] ${sourcePath} → ${fullPath}`);
      } catch (error) {
        // One bad file must not stop the rest: the listing keeps whatever
        // it had, and the failure is printed rather than swallowed.
        problems.push(`${title} [${index}]: ${error.message}`);
      }
    }

    // The cover is denormalised onto the listing, so it has to follow.
    const cover = nextMedia[0] ?? null;
    await doc.ref.update({
      media: nextMedia,
      mediaUrl: cover?.mediaUrl ?? null,
      mediaPath: cover?.mediaPath ?? null,
      thumbUrl: cover?.thumbUrl ?? null,
      mediaType: cover?.mediaType ?? null,
    });
  }

  console.log(
    `\n${APPLY ? "Converted" : "Would convert"} ${filesConverted} file(s) ` +
      `across ${listingsTouched} listing(s).`,
  );
  if (!APPLY) console.log("Nothing was changed. Re-run with --apply to write.");
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    problems.forEach((line) => console.log(`  ${line}`));
  }
  if (!DELETE_ORIGINALS && APPLY) {
    console.log(
      "\nThe original .heic files are still in Storage. Once the listings " +
        "look right, re-run with --delete-originals to remove them.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
