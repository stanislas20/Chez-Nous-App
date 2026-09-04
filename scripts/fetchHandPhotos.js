// Photographs for the places written by hand.
//
// Fourteen stretches of coast and the Route des Pêches are hand-entered,
// because Wikidata types almost nothing in Bénin as a beach and
// OpenStreetMap has one named beach in the whole country. Being
// hand-entered, they arrived with no photograph, so the Plages tab was a
// row of coloured rectangles — reported as "plages don't show pictures of
// plages in the hero".
//
// Commons has them, under the obvious French names. Same rules as
// everywhere else here: free licences only, the photographer named on the
// card, the file named in this script rather than searched at run time,
// and a place with no photograph keeps its gradient rather than borrowing
// a picture of a different beach. Seven of the fifteen have one.
//
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/fetchHandPhotos.js
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/fetchHandPhotos.js --apply
const admin = require("../functions/node_modules/firebase-admin");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const OUT = path.join(__dirname, "..", "src/data/handPhotos.json");
const BUCKET = "benin-marketplace-3eb04.firebasestorage.app";
const UA =
  "ChezNous/1.0 (https://benin-marketplace-3eb04.web.app; Bénin marketplace) node-fetch";

// hand-entered site id -> the Commons file, and what it actually shows.
const FILES = {
  "hand-route-des-peches": {
    file: "File:Route des pêches au Bénin au matin.jpg",
    shows: "the Route des Pêches at dawn",
  },
  "hand-beach-fidjrosse": {
    file: "File:Fidjrossè Plage (Cotonou).jpg",
    shows: "the beach at Fidjrossè, Cotonou",
  },
  "hand-beach-grandpopo": {
    file: "File:Plage de Grand-Popo (1).jpg",
    shows: "the beach at Grand-Popo",
  },
  "hand-beach-ouidah": {
    file: "File:Plage de Ouidah Benin.jpg",
    shows: "the beach at Ouidah",
  },
  "hand-beach-obama": {
    file: "File:Passage a obama beach.jpg",
    shows: "Obama Beach, Cotonou",
  },
  "hand-beach-avlekete": {
    file: "File:Crépuscule avlékété.jpg",
    shows: "dusk at Avlékété",
  },
  "hand-beach-seme": {
    file: "File:Couché de soleil à la plage de Sèmè (Bénin).jpg",
    shows: "sunset on the beach at Sèmè",
  },
};

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: BUCKET,
});
const bucket = admin.storage().bucket();

const strip = (html) =>
  String(html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const FREE = /^(cc[- ]by(-sa)?(-\d(\.\d)?)?|cc0|public domain|pd-)/i;

async function main() {
  const titles = Object.values(FILES).map((entry) => entry.file);
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json" +
    "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&titles=" +
    encodeURIComponent(titles.join("|"));
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  const json = await response.json();
  const byTitle = new Map();
  for (const page of Object.values(json.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    byTitle.set(page.title, {
      url: (info.thumburl ?? info.url).split("?")[0],
      licence: strip(meta.LicenseShortName?.value) || null,
      author: strip(meta.Artist?.value) || null,
      descriptionUrl: info.descriptionurl ?? null,
    });
  }

  const out = {};
  for (const [key, entry] of Object.entries(FILES)) {
    const info = byTitle.get(entry.file);
    if (!info) {
      console.log(`  skipped ${key} — Commons returned nothing`);
      continue;
    }
    if (!info.licence || !FREE.test(info.licence) || !info.author) {
      console.log(`  skipped ${key} — licence "${info.licence}" author "${info.author}"`);
      continue;
    }
    if (!APPLY) {
      console.log(`  ${key}: ${info.licence} — ${info.author}`);
      continue;
    }
    const buffer = Buffer.from(
      await (await fetch(info.url, { headers: { "User-Agent": UA } })).arrayBuffer(),
    );
    const objectPath = `hand/${key}.jpg`;
    const token = crypto.randomUUID();
    await bucket.file(objectPath).save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {
          firebaseStorageDownloadTokens: token,
          sourceUrl: info.descriptionUrl ?? "",
          author: info.author,
          licence: info.licence,
        },
      },
    });
    out[key] = {
      url:
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
        `${encodeURIComponent(objectPath)}?alt=media&token=${token}`,
      licence: info.licence,
      author: info.author,
      descriptionUrl: info.descriptionUrl,
      shows: entry.shows,
    };
    console.log(`  ${key} -> ${objectPath}`);
  }

  if (APPLY) {
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nWrote ${Object.keys(out).length} to ${path.relative(process.cwd(), OUT)}`);
  } else {
    console.log("\nNothing written. Re-run with --apply.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
