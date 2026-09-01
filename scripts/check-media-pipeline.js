// What the app does with a picture or a video between the picker and the
// reader's phone.
//
// Four separate things, each of which fails silently and none of which the
// app itself ever notices:
//
//   - a photo uploaded at camera resolution (see check-photo-downscale.js)
//   - a file uploaded with no cache-control, so it is fetched again every
//     time the phone drops its copy
//   - a video with no ceiling, sent at 300 MB over a metered connection to
//     a Storage rule that refuses anything over 50 MB — the seller sees
//     "Upload failed" and is told nothing
//   - a 600px thumbnail that exists in Storage and that no card reads
//
// Run: node scripts/check-media-pipeline.js
const fs = require("fs");
const path = require("path");

const failures = [];
function check(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
}

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const walk = (dir) =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(`${dir}/${entry.name}`)
        : entry.name.endsWith(".js")
          ? [`${dir}/${entry.name}`]
          : [],
    );

// ── Every upload declares how long it may be cached ────────────────────
//
// Firebase Storage serves `private, max-age=0` when nothing says otherwise,
// which means no copy is ever kept, anywhere.
const sources = walk("src");
const uploaders = sources.filter((file) =>
  /uploadBytesResumable\(/.test(read(file)),
);
check("eight files upload something", uploaders.length, 8);

let uploadCalls = 0;
uploaders.forEach((file) => {
  const source = read(file);
  const calls = (source.match(/uploadBytesResumable\(/g) ?? []).length;
  const cached = (source.match(/cacheControl:/g) ?? []).length;
  uploadCalls += calls;
  check(`${file} sets cache-control on all ${calls} upload(s)`, cached >= calls, true);
});
check("eleven uploads in total", uploadCalls, 11);

// The two policies differ on purpose and must not be collapsed into one.
const cacheHelper = read("src/utils/uploadContentType.js");
check(
  "public and private cache policies both exist",
  /PUBLIC_UPLOAD_CACHE = "public,/.test(cacheHelper) &&
    /PRIVATE_UPLOAD_CACHE = "private,/.test(cacheHelper),
  true,
);
check(
  "immutable is claimed (every path is timestamped and written once)",
  (cacheHelper.match(/immutable/g) ?? []).length >= 2,
  true,
);
// A chat attachment and a CV belong to one recipient. If either of these
// ever reads PUBLIC, somebody's job application became cacheable by every
// proxy between here and them.
check(
  "chat attachments stay private",
  /PRIVATE_UPLOAD_CACHE/.test(read("src/screens/ChatScreen.js")),
  true,
);
check(
  "a CV stays private",
  /PRIVATE_UPLOAD_CACHE/.test(read("src/screens/JobDetailScreen.js")),
  true,
);

// ── The video ceiling agrees with the Storage rule ─────────────────────
//
// storage.rules refuses anything over 50 MB on the listings path. A client
// that lets somebody pick 300 MB is not being generous — it is spending
// their data and then showing them "Upload failed".
const limits = read("src/utils/videoLimits.js");
const maxBytes = /MAX_VIDEO_BYTES = (\d+) \* 1024 \* 1024/.exec(limits)?.[1];
const rules = read("storage.rules");
const ruleMb = /request\.resource\.size < (\d+) \* 1024 \* 1024/.exec(rules)?.[1];
check("the client caps video size", Boolean(maxBytes), true);
check("storage.rules caps upload size", Boolean(ruleMb), true);
check(
  "the client's ceiling is not above the server's",
  Number(maxBytes) <= Number(ruleMb),
  true,
);
check(
  "the refusal names the limit and the actual figure",
  /max:/.test(limits) && /actual:/.test(limits),
  true,
);
// A picker that reports neither duration nor size must not have its videos
// refused — that would block uploads on the phones that describe least.
check(
  "an undescribed video is allowed, not refused",
  /duration != null/.test(limits) && /fileSize \?\? null/.test(limits),
  true,
);

// Both screens that accept a video enforce it.
["src/screens/CreateListingScreen.js", "src/screens/AdSubmitScreen.js"].forEach(
  (file) => {
    const source = read(file);
    check(`${file} accepts videos`, /"videos"/.test(source), true);
    check(
      `${file} enforces the video limits`,
      /partitionByVideoLimits\(/.test(source),
      true,
    );
  },
);

// ── The thumbnail is made, uploaded, and read ──────────────────────────
const helper = read("src/utils/downscalePhoto.js");
const thumbEdge = Number(/THUMBNAIL_EDGE = (\d+)/.exec(helper)?.[1]);
const maxEdge = Number(/MAX_UPLOAD_EDGE = (\d+)/.exec(helper)?.[1]);
check("a thumbnail size is set", Number.isFinite(thumbEdge), true);
// Half of a 1080-wide phone is 540 real pixels; a thumbnail smaller than
// that is stretched on the Local grid.
check("the thumbnail is at least 540px", thumbEdge >= 540, true);
check("the thumbnail is smaller than the full copy", thumbEdge < maxEdge, true);

const createListing = read("src/screens/CreateListingScreen.js");
check(
  "the sell form uploads a thumbnail beside the photo",
  /makeThumbnail\(/.test(createListing) && /thumbPath/.test(createListing),
  true,
);
check(
  "the cover's thumbnail is denormalised onto the listing",
  /thumbUrl: cover\?\.thumbUrl/.test(createListing),
  true,
);
// Best-effort: a thumbnail that cannot be made must never stop a listing
// being published.
check(
  "a failed thumbnail does not fail the publish",
  /catch \{[\s\S]{0,120}thumbUrl = null;/.test(createListing),
  true,
);

// Nothing may read `.thumbUrl` without a fallback, or every listing
// published before today loses its picture.
const imageHelper = read("src/utils/listingImage.js");
check(
  "the small copy falls back to the full one, then to the seeded shape",
  /thumbUrl \?\? source\?\.mediaUrl \?\? source\?\.image/.test(imageHelper),
  true,
);

// One component picks the copy, and it is the one every card goes through.
check(
  "ListingMedia draws the small copy",
  /smallImageUri\(/.test(read("src/components/ListingMedia.js")),
  true,
);

// The detail hero and the lightbox must NOT: they are the two places
// somebody is actually looking at the photograph.
["src/screens/ProductDetailScreen.js", "src/components/ImageLightbox.js"].forEach(
  (file) => {
    check(
      `${file} still shows the full picture`,
      /smallImageUri\(/.test(read(file)),
      false,
    );
  },
);

// ── A card that shows a video, plays it ────────────────────────────────
//
// Two components owned a private video player that set it up and never
// called play(): ListingCard and AdCard. Both drew the clip's first frame
// and, in ListingCard's case, laid a play badge over it — so the Local grid
// showed a still with a button on it that did nothing when tapped, while
// the same listing on the Events screen played, because that screen went
// through ListingMedia. A frozen frame is indistinguishable from a photo
// that loaded, which is why nobody catches this by looking.
//
// Every player in the app is listed here with what it is for, so a new one
// has to be thought about rather than copied from whichever file was open.
const players = sources.filter((file) => /useVideoPlayer\(/.test(read(file)));
check(
  "seven components own a video player",
  players.sort(),
  [
    "src/components/AdBanner.js",
    "src/components/AdCard.js",
    "src/components/ImageLightbox.js",
    "src/components/ListingMedia.js",
    "src/screens/AdSubmitScreen.js",
    "src/screens/CreateListingScreen.js",
    "src/screens/ProductDetailScreen.js",
  ],
);

// The four that face a reader must play. The two upload previews may sit
// still — somebody is looking at a file they just picked, not browsing.
[
  "src/components/AdBanner.js",
  "src/components/AdCard.js",
  "src/components/ListingMedia.js",
  "src/components/ImageLightbox.js",
  "src/screens/ProductDetailScreen.js",
].forEach((file) => {
  check(`${file} actually plays what it shows`, /\.play\(\)/.test(read(file)), true);
});

// And a card must not draw a listing's picture by hand: ListingMedia is
// what knows that a cover can be a video, that <Image> renders an .mp4 as
// nothing, and which of the two copies to fetch.
[
  "src/components/ListingCard.js",
  "src/screens/ForYouScreen.js",
  "src/screens/MyListingsScreen.js",
].forEach((file) => {
  const source = read(file);
  check(`${file} draws cards through ListingMedia`, /<ListingMedia/.test(source), true);
  check(
    `${file} owns no private video player`,
    /useVideoPlayer\(/.test(source),
    false,
  );
});

// ── Nothing undecodable is drawn ───────────────────────────────────────
//
// An iPhone stores photographs as .heic and Android's React Native image
// pipeline has no HEIF decoder, so those files draw as nothing: not an
// error, not a broken-image icon, just the empty placeholder colour where a
// photograph should be. Uploads are re-encoded now, but everything
// published before that is still in Storage, and a card that skips to the
// next photograph is the difference between a listing that looks broken
// and one that looks fine.
const drawHelper = read("src/utils/listingImage.js");
check(
  "the undecodable formats are named",
  /heic\|heif/.test(drawHelper),
  true,
);
check(
  "the extension is tested against the path, not the query string",
  /split\("\?"\)\[0\]/.test(drawHelper),
  true,
);
// A video is played, never decoded as a still, so it must survive the filter.
check(
  "videos are not filtered out as undrawable",
  /mediaType === "video" \|\|/.test(drawHelper),
  true,
);
["src/components/ListingMedia.js", "src/screens/ProductDetailScreen.js"].forEach(
  (file) => {
    check(
      `${file} skips what it cannot decode`,
      /drawableMedia\(/.test(read(file)),
      true,
    );
  },
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: media pipeline — ${uploadCalls} uploads all cached, video capped at ` +
    `${maxBytes} MB against a ${ruleMb} MB server rule, ${thumbEdge}px thumbnails, ` +
    `${players.length} video players and every card through ListingMedia`,
);
