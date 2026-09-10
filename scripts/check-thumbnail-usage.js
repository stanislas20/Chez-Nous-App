// A card draws the small copy. A detail screen draws the big one.
//
// Every listing carries two files: the 1600px photograph and a 600px
// thumbnail uploaded beside it. The difference is roughly 250 KB against
// 45 KB, and it is multiplied by every card on every screen for every reader
// on a connection they pay for by the megabyte — so a single card reaching
// for `mediaUrl` instead of `smallImageUri` costs more than it looks.
//
// It is also invisible: the picture is correct, the layout is correct, and
// the only symptom is bandwidth. One had already slipped through — the
// promoted banner on the Restaurants screen — which is why this exists rather
// than a note asking people to remember.
//
// The rule is not "never use mediaUrl". A detail hero, a full-screen gallery
// and the seller's own preview of what they just picked all legitimately want
// the full file; a thumbnail stretched to full width looks worse than the
// bytes it saves. So the list below names the contexts where the big file is
// the right answer, and anything outside them has to explain itself.
//
// Run: node scripts/check-thumbnail-usage.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const failures = [];

// Screens whose whole job is showing one listing at full size.
const DETAIL_CONTEXTS = new Set([
  "src/screens/ProductDetailScreen.js",
  "src/screens/RealEstateDetailScreen.js",
  // The posting form previews the seller's own picked assets, which are local
  // file:// URIs with no thumbnail to reach for.
  "src/screens/CreateListingScreen.js",
  // The fullscreen viewer is the one place the full file is the point.
  "src/components/ImageLightbox.js",
]);

// Ads carry no generated thumbnail — AdSubmitScreen uploads one file and
// makes no small copy — so the banner has nothing else to draw. Recorded here
// as a known gap rather than passed over: if ads ever get thumbnails, these
// two are the call sites to change.
const NO_THUMBNAIL_AVAILABLE = new Set([
  "src/components/AdCard.js",
  "src/components/AdBanner.js",
]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

let checked = 0;
for (const file of [
  ...walk(path.join(root, "src", "screens")),
  ...walk(path.join(root, "src", "components")),
]) {
  const rel = path.relative(root, file);
  if (DETAIL_CONTEXTS.has(rel) || NO_THUMBNAIL_AVAILABLE.has(rel)) continue;
  const source = stripComments(fs.readFileSync(file, "utf8"));
  checked += 1;

  // `uri: <something>.mediaUrl` inside a source={{ }} is an image being drawn
  // at full resolution.
  for (const [, expr] of source.matchAll(/uri:\s*([A-Za-z_$][\w$.?]*\.mediaUrl)\b/g)) {
    failures.push(
      `${rel} draws ${expr} directly. Outside a detail or gallery screen a ` +
        `card should use smallImageUri(...), which falls back to mediaUrl on ` +
        `its own for listings published before thumbnails existed.`,
    );
  }
}

// And the helper still has to have the fallback, or fixing the above would
// blank every listing published before thumbnails existed.
{
  const helper = stripComments(
    fs.readFileSync(path.join(root, "src/utils/listingImage.js"), "utf8"),
  );
  if (!/thumbUrl\s*\?\?\s*source\?\.mediaUrl/.test(helper)) {
    failures.push(
      "smallImageUri no longer falls back to mediaUrl, so every listing " +
        "published before thumbnails existed would render blank",
    );
  }
}

// The upload still has to produce the small copy in the first place.
{
  const form = stripComments(
    fs.readFileSync(path.join(root, "src/screens/CreateListingScreen.js"), "utf8"),
  );
  if (!/makeThumbnail\(/.test(form)) {
    failures.push(
      "the publish form no longer generates a thumbnail, so every new " +
        "listing falls back to its full-size photograph on every card",
    );
  }
}

if (failures.length) {
  console.error("check-thumbnail-usage: FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `clean: ${checked} screens and components draw cards from the 600px copy; ` +
    `full-resolution media stays in detail and gallery contexts`,
);
