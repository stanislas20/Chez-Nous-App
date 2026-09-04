// A photograph for each festival card, and the reason it is not a poster.
//
// The obvious banner for the Vodun Days is the Vodun Days poster. It is
// also somebody's copyrighted artwork, and an app that re-hosts a
// festival's promotional material is republishing work it has no licence
// to. So these are photographs OF the festival, from Wikimedia Commons,
// under CC BY-SA — free to show, and the photographer is named on the
// card, which is what the licence asks in return.
//
// Each file is named here rather than searched at run time. A search for
// "Vodun Days" returns whatever was uploaded last week, and a card that
// silently changes its picture — or picks up something unrelated — is not
// something anybody would notice until a stranger did.
//
// The Fête de l'igname has no free photograph on Commons. It keeps its
// gradient rather than borrowing a picture of some other harvest.
//
// WeLove EYA went through both mistakes. It first carried a photograph of
// the Place de l'Amazone, on the reasoning that the card names the venue
// so a picture of the venue is honest — it is not, and an empty monument
// square on an afrobeat card was reported as exactly that. Then it
// carried nothing, because I had searched Commons for "WeLove EYA" and
// concluded there was none.
//
// The files are filed under WeLoveEya, one word. There are several, from
// the 2025 edition, including artists on stage. A search that finds
// nothing is not the same as nothing existing, and the difference here
// was a space.
//
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/fetchFestivalPhotos.js
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/fetchFestivalPhotos.js --apply
const admin = require("../functions/node_modules/firebase-admin");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const OUT = path.join(__dirname, "..", "src/data/festivalPhotos.json");
const BUCKET = "benin-marketplace-3eb04.firebasestorage.app";
const UA =
  "ChezNous/1.0 (https://benin-marketplace-3eb04.web.app; Bénin marketplace) node-fetch";

// festival key -> the Commons file, and what it actually shows.
const FILES = {
  "vodun-days": {
    file: "File:10 Janvier 2023, Fête de vodoun à Ouidah 11.jpg",
    shows: "the 10 January festival at Ouidah",
  },
  gaani: {
    file: "File:Bariba Ganni performers, Nikki, Bemin.jpg",
    shows: "Bariba performers at the Gaani in Nikki",
  },
  "welove-eya": {
    file: "File:Joé Dwet sur scène à WeLoveEya 2025 à Cotonou.jpg",
    shows: "Joé Dwet on stage at WeLoveEya 2025 in Cotonou",
  },
  nonvitcha: {
    file: "File:Nonvitcha Grand Popo Benin 2017.jpg",
    shows: "the Nonvitcha gathering at Grand-Popo",
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
    const objectPath = `festivals/${key}.jpg`;
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
