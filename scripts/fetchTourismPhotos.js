// The photographs on the tourism cards, with the licence that lets us show
// them and the name of whoever took them.
//
// The cards drew a coloured gradient with a word on it. A real picture of
// the place is better in every way except one: a photograph belongs to
// somebody. Commons files are almost all CC BY-SA, which permits this app
// to show them and requires the photographer to be credited — the same
// shape as the OpenStreetMap tier on the hotels screen, where the data is
// free to use and the attribution is not optional.
//
// So this records, per site: the image URL, its size, the licence, and the
// author, and the screen shows the credit. A file whose licence cannot be
// read is dropped rather than shown — "probably fine" is not a licence.
//
// NOT bundled into the app. 85 photographs at card size is roughly 7 MB,
// on a build where AGENTS.md documents trimming a 16 MB ABI slice nobody
// could run. They are fetched at 800px from Commons instead, which is what
// the thumbnailer is for, and a card without a connection falls back to
// the gradient it has now.
//
//   node scripts/fetchTourismPhotos.js           # report
//   node scripts/fetchTourismPhotos.js --write   # write it back
const fs = require("fs");
const path = require("path");

const WRITE = process.argv.includes("--write");
const UA = "ChezNous/1.0 (Bénin marketplace; tourism photographs)";
const FILE = path.join(__dirname, "..", "src/data/tourismSites.json");
const WIDTH = 800;
const BATCH = 40;

const strip = (html) =>
  String(html ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Free licences only, named rather than pattern-matched: "CC BY-NC" reads
// as a Creative Commons licence and forbids exactly what this app is.
const FREE = /^(cc[- ]by(-sa)?(-\d(\.\d)?)?|cc0|public domain|pd-)/i;

async function infoFor(titles) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json" +
    `&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=${WIDTH}` +
    `&titles=${encodeURIComponent(titles.join("|"))}`;
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`Commons answered ${response.status}`);
  const json = await response.json();
  const out = new Map();
  for (const page of Object.values(json.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    // Commons appends utm_* to the thumbnail URL it hands back. Storing
    // them would put campaign tracking in a data file and change the URL
    // on every refetch for no reason.
    // Commons hands back thumb.wikimedia.org for most files and
    // upload.wikimedia.org for the rest. Both serve the same bytes from a
    // laptop; upload is the canonical, documented host and the one every
    // Wikimedia client uses, so the data file holds one host rather than
    // two — a URL that works in a script and not on a phone is the worst
    // kind, because the card just stays empty.
    const clean = (value) =>
      value
        ? String(value)
            .split("?")[0]
            .replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/")
        : value;
    out.set(page.title, {
      url: clean(info.thumburl ?? info.url),
      width: info.thumbwidth ?? info.width ?? null,
      height: info.thumbheight ?? info.height ?? null,
      licence: strip(meta.LicenseShortName?.value) || null,
      licenceId: meta.License?.value ?? null,
      author: strip(meta.Artist?.value) || null,
      descriptionUrl: info.descriptionurl ?? null,
    });
  }
  return out;
}

const titleOf = (url) =>
  `File:${decodeURIComponent(url.split("Special:FilePath/")[1] ?? "").replace(/_/g, " ")}`;

async function main() {
  const sites = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const withImage = sites.filter((site) => site.image);
  console.log(`${withImage.length} site(s) name a Commons file.\n`);

  const found = new Map();
  for (let index = 0; index < withImage.length; index += BATCH) {
    const slice = withImage.slice(index, index + BATCH);
    const info = await infoFor(slice.map((site) => titleOf(site.image)));
    info.forEach((value, key) => found.set(key, value));
    console.log(`  read ${Math.min(index + BATCH, withImage.length)}/${withImage.length}`);
  }

  let kept = 0;
  const dropped = [];
  for (const site of sites) {
    if (!site.image) continue;
    const info = found.get(titleOf(site.image));
    if (!info?.url) {
      dropped.push(`${site.name} — Commons returned nothing`);
      continue;
    }
    if (!info.licence || !FREE.test(info.licence)) {
      dropped.push(`${site.name} — licence "${info.licence ?? "unknown"}"`);
      continue;
    }
    if (!info.author) {
      dropped.push(`${site.name} — no author recorded`);
      continue;
    }
    site.photo = {
      url: info.url,
      width: info.width,
      height: info.height,
      licence: info.licence,
      author: info.author,
      descriptionUrl: info.descriptionUrl,
    };
    kept += 1;
  }
  // The raw Commons path is not what the app draws, and leaving it would
  // let a screen use the full-size original by accident.
  sites.forEach((site) => delete site.image);

  console.log(`\n${kept} photograph(s) usable.`);
  if (dropped.length) {
    console.log(`${dropped.length} dropped:`);
    dropped.forEach((line) => console.log(`  ${line}`));
  }
  const licences = new Map();
  sites
    .filter((site) => site.photo)
    .forEach((site) =>
      licences.set(site.photo.licence, (licences.get(site.photo.licence) ?? 0) + 1),
    );
  console.log(`\nLicences: ${[...licences].map(([k, v]) => `${k} ×${v}`).join(", ")}`);

  if (WRITE) {
    fs.writeFileSync(FILE, `${JSON.stringify(sites, null, 2)}\n`);
    console.log(`\nWrote ${path.relative(process.cwd(), FILE)}`);
  } else {
    console.log("\nNothing written. Re-run with --write.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
