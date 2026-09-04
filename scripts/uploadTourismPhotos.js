// Puts the tourism photographs somewhere the phone can actually fetch them.
//
// The cards linked straight to upload.wikimedia.org and drew nothing on
// Android. The cause, measured rather than guessed: Wikimedia answers
// "okhttp/4.9.2" — React Native's Android HTTP client — with 403, while
// the same URL with a browser user-agent returns 200. Setting a
// user-agent on the Image source did not settle it, and chasing Fresco's
// header handling is a lot of work for a picture.
//
// So the files are fetched here, where a user-agent demonstrably works,
// and copied into the app's own Storage bucket — the place every listing
// photograph already comes from and which the app fetches without
// argument. No APK growth either, which matters on a build where
// AGENTS.md documents trimming a 16 MB slice nobody could run.
//
// The licence travels with the file. These are CC BY-SA and CC BY images:
// redistributing them is exactly what the licence allows, and crediting
// the photographer is exactly what it requires, so the author, the licence
// name and the Commons page stay in the data and the card shows them.
// Storage metadata carries the same three, so a file found later in the
// bucket still says whose it is.
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/uploadTourismPhotos.js            # dry run
//   GOOGLE_APPLICATION_CREDENTIALS=... \
//     node scripts/uploadTourismPhotos.js --apply
const admin = require("../functions/node_modules/firebase-admin");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const FILE = path.join(__dirname, "..", "src/data/tourismSites.json");
const BUCKET = "benin-marketplace-3eb04.firebasestorage.app";
const PUBLIC_CACHE = "public, max-age=31536000, immutable";
// The user-agent Wikimedia's policy asks for. It is why this script can
// download what the phone could not.
const UA =
  "ChezNous/1.0 (https://benin-marketplace-3eb04.web.app; Bénin marketplace) node-fetch";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "GOOGLE_APPLICATION_CREDENTIALS is not set — see the usage note at the top of this file.",
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: BUCKET,
});
const bucket = admin.storage().bucket();

function downloadUrl(objectPath, token) {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(objectPath)}?alt=media&token=${token}`
  );
}

async function main() {
  const sites = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const todo = sites.filter(
    (site) => site.photo?.url && !site.photo.url.includes("firebasestorage"),
  );
  console.log(
    `${todo.length} photograph(s) to copy; ` +
      `${sites.filter((s) => s.photo).length - todo.length} already hosted.\n`,
  );
  if (!APPLY) {
    todo.slice(0, 5).forEach((site) => console.log(`  ${site.name}\n    ${site.photo.url}`));
    console.log("\nNothing uploaded. Re-run with --apply.");
    return;
  }

  // Commons rate-limits, and it does it after about thirty files: the
  // first run copied 34 and then took 429 for every one of the remaining
  // 51. So: a pause between files, and a backoff that waits rather than
  // giving up, because a half-copied set means half the cards fall back to
  // a gradient for no reason anybody can see.
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function fetchWithRetry(url, attempt = 0) {
    const response = await fetch(url, { headers: { "User-Agent": UA } });
    if (response.status === 429 && attempt < 5) {
      const wait = 5000 * 2 ** attempt;
      console.log(`      429 — waiting ${wait / 1000}s`);
      await sleep(wait);
      return fetchWithRetry(url, attempt + 1);
    }
    return response;
  }

  let done = 0;
  const problems = [];
  for (const site of todo) {
    try {
      await sleep(400);
      const response = await fetchWithRetry(site.photo.url);
      if (!response.ok) throw new Error(`Commons answered ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = /\.(jpe?g|png)$/i.exec(site.photo.url)?.[1] ?? "jpg";
      const objectPath = `tourism/${site.id}.${extension.toLowerCase()}`;
      const token = crypto.randomUUID();
      await bucket.file(objectPath).save(buffer, {
        metadata: {
          contentType: extension.toLowerCase() === "png" ? "image/png" : "image/jpeg",
          cacheControl: PUBLIC_CACHE,
          metadata: {
            firebaseStorageDownloadTokens: token,
            // The licence follows the file, not just the data file.
            sourceUrl: site.photo.descriptionUrl ?? "",
            author: site.photo.author ?? "",
            licence: site.photo.licence ?? "",
          },
        },
      });
      site.photo.commonsUrl = site.photo.url;
      site.photo.url = downloadUrl(objectPath, token);
      done += 1;
      console.log(`  ${done}/${todo.length}  ${site.name}`);
    } catch (error) {
      // One bad file must not stop the rest; the site keeps its Commons
      // URL and the card falls back to its gradient.
      problems.push(`${site.name}: ${error.message}`);
    }
  }

  fs.writeFileSync(FILE, `${JSON.stringify(sites, null, 2)}\n`);
  console.log(`\nCopied ${done}. Wrote ${path.relative(process.cwd(), FILE)}`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    problems.forEach((line) => console.log(`  ${line}`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
