// Nothing a listing owns may outlive it.
//
// The audit found three separate leaks, and all three came from the same
// thing: the code that deleted files knew a subset of the fields that hold
// them. A listing's media has four homes — `mediaPath` for the cover,
// `thumbPath` for the cover's small copy, and a `mediaPath`/`thumbPath` pair
// on every entry of `media` — and the client delete knew two of them, so
// every thumbnail ever generated survived its listing. Unreferenced, so
// unfindable: there is no document left to join them back to.
//
// There are now two implementations of "every path this listing owns", in
// two languages, on two sides of the network — src/utils/uploadCleanup.js for
// the edit path and functions/index.js for the delete trigger. Two copies of
// a rule drift, and a drift here is silent: files simply accumulate.
//
// So both are exercised against the same fixtures here, and required to
// agree.
//
// Run: node scripts/check-storage-cleanup.js
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const failures = [];

function loadClient() {
  const file = path.join(root, "src", "utils", "uploadCleanup.js");
  const { code } = babel.transformFileSync(file, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  });
  const module = { exports: {} };
  // The module imports firebase/storage at the top; stub it, since only the
  // pure path helpers are under test here.
  const require_ = (id) => {
    if (id === "firebase/storage") return { deleteObject: () => {}, ref: () => {} };
    if (id === "../config/firebase") return { storage: null };
    // Phase E: cleanUpAbandonedUploads now reports the objects it could not
    // remove, because an orphan is paid for monthly and appears on no screen.
    if (id === "./reportError") return { reportNonFatal: () => {} };
    return require(id);
  };
  new Function("module", "exports", "require", code)(
    module,
    module.exports,
    require_,
  );
  return module.exports;
}

// The server copy lives inside a file that calls initializeApp at import
// time, so it is extracted as source rather than required.
function loadServerPathFn() {
  const source = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
  const match = source.match(
    /function listingStoragePaths\(listing\) \{[\s\S]*?\n\}/,
  );
  if (!match) return null;
  // eslint-disable-next-line no-new-func
  return new Function(`${match[0]}; return listingStoragePaths;`)();
}

const client = loadClient();
const serverPaths = loadServerPathFn();

if (!serverPaths) {
  failures.push(
    "functions/index.js has no listingStoragePaths — the delete trigger " +
      "cannot know what to remove, and every deleted listing leaks its files",
  );
}

// Fixtures shaped like real listings, including the ones that caused the bug.
const FIXTURES = [
  {
    name: "a listing with a cover, a thumbnail and three photos",
    listing: {
      mediaPath: "listings/u1/1.jpg",
      thumbPath: "listings/u1/1-thumb.jpg",
      media: [
        { mediaPath: "listings/u1/1.jpg", thumbPath: "listings/u1/1-thumb.jpg" },
        { mediaPath: "listings/u1/2.jpg", thumbPath: "listings/u1/2-thumb.jpg" },
        { mediaPath: "listings/u1/3.jpg", thumbPath: "listings/u1/3-thumb.jpg" },
      ],
    },
    // Six: three photos and three thumbnails. The cover is named twice and
    // must be counted once.
    expected: 6,
  },
  {
    name: "a video listing, which has no thumbnail",
    listing: {
      mediaPath: "listings/u1/clip.mp4",
      media: [{ mediaPath: "listings/u1/clip.mp4", thumbPath: null }],
    },
    expected: 1,
  },
  {
    name: "a listing published before thumbnails existed",
    listing: {
      mediaPath: "listings/u1/old.jpg",
      media: [{ mediaPath: "listings/u1/old.jpg" }],
    },
    expected: 1,
  },
  {
    name: "a job post with no media at all",
    listing: { media: [] },
    expected: 0,
  },
  { name: "a malformed document", listing: null, expected: 0 },
];

for (const { name, listing, expected } of FIXTURES) {
  const fromClient = client.listingStoragePaths(listing);
  if (fromClient.length !== expected) {
    failures.push(
      `${name}: the client found ${fromClient.length} path(s), expected ` +
        `${expected} — [${fromClient.join(", ")}]`,
    );
  }
  if (serverPaths) {
    const fromServer = serverPaths(listing);
    const a = [...fromClient].sort().join("|");
    const b = [...fromServer].sort().join("|");
    if (a !== b) {
      failures.push(
        `${name}: the client and the delete trigger disagree about which ` +
          `files this listing owns.\n      client: ${a}\n      server: ${b}`,
      );
    }
  }
}

// The specific regression: a thumbnail must never be missed.
{
  const withThumb = {
    mediaPath: "listings/u1/a.jpg",
    media: [{ mediaPath: "listings/u1/a.jpg", thumbPath: "listings/u1/a-thumb.jpg" }],
  };
  if (!client.listingStoragePaths(withThumb).includes("listings/u1/a-thumb.jpg")) {
    failures.push(
      "thumbPath is not collected. This is the exact leak the audit found: " +
        "every thumbnail ever generated outliving its listing.",
    );
  }
}

// An edit that swaps one photograph drops exactly that photograph's files,
// and never touches the ones it kept.
{
  const before = {
    mediaPath: "listings/u1/a.jpg",
    thumbPath: "listings/u1/a-thumb.jpg",
    media: [
      { mediaPath: "listings/u1/a.jpg", thumbPath: "listings/u1/a-thumb.jpg" },
      { mediaPath: "listings/u1/b.jpg", thumbPath: "listings/u1/b-thumb.jpg" },
    ],
  };
  const after = [
    { mediaPath: "listings/u1/a.jpg", thumbPath: "listings/u1/a-thumb.jpg" },
    { mediaPath: "listings/u1/c.jpg", thumbPath: "listings/u1/c-thumb.jpg" },
  ];
  const dropped = client.pathsDroppedByEdit(before, after).sort();
  const want = ["listings/u1/b-thumb.jpg", "listings/u1/b.jpg"];
  if (dropped.join("|") !== want.join("|")) {
    failures.push(
      `an edit that replaces one photo should drop exactly that photo and ` +
        `its thumbnail, got [${dropped.join(", ")}]`,
    );
  }
}

// And an edit that changes no media drops nothing — the case where getting
// it wrong deletes the photographs of the listing being edited.
{
  const before = {
    mediaPath: "listings/u1/a.jpg",
    thumbPath: "listings/u1/a-thumb.jpg",
    media: [{ mediaPath: "listings/u1/a.jpg", thumbPath: "listings/u1/a-thumb.jpg" }],
  };
  const dropped = client.pathsDroppedByEdit(before, before.media);
  if (dropped.length !== 0) {
    failures.push(
      `an edit that touches no photograph must drop nothing, got ` +
        `[${dropped.join(", ")}] — this would delete the listing's own images`,
    );
  }
}

// The client no longer deletes files before the document.
{
  const screen = stripComments(
    fs.readFileSync(path.join(root, "src/screens/MyListingsScreen.js"), "utf8"),
  );
  if (/deleteObject/.test(screen)) {
    failures.push(
      "MyListingsScreen deletes Storage objects again. Cleanup belongs to " +
        "the onDocumentDeleted trigger, which also covers deletions from the " +
        "console and from scripts — and deleting files before the document " +
        "is what leaves a live listing with broken images.",
    );
  }
}

// The publish path compensates for its own partial uploads.
{
  const form = stripComments(
    fs.readFileSync(path.join(root, "src/screens/CreateListingScreen.js"), "utf8"),
  );
  if (!/uploadedThisAttempt\.push\(mediaPath\)/.test(form)) {
    failures.push(
      "the publish form no longer records the paths it uploads, so a failed " +
        "publish leaves them in the bucket referenced by nothing",
    );
  }
  if (!/cleanUpAbandonedUploads\(\s*uploadedThisAttempt/.test(form)) {
    failures.push(
      "the publish form no longer removes its own uploads when the write " +
        "fails — every retry on a bad connection leaves another full set",
    );
  }
  // The other half, added with the retry behaviour: an upload that SUCCEEDED
  // is kept for the retry rather than deleted, so pressing Publier again
  // resumes instead of re-sending photographs the seller has already paid to
  // send once. That only stays safe while something sweeps them when the
  // screen is abandoned — otherwise "keep for the retry" is just a leak with
  // a better name.
  if (!/uploadedByAssetRef/.test(form)) {
    failures.push(
      "the publish form no longer remembers uploads across a retry, so a " +
        "failure at photo five re-sends the first four",
    );
  }
  if (!/activeUploadRef\.current\?\.cancel\?\.\(\)/.test(form)) {
    failures.push(
      "leaving the publish screen no longer cancels the transfer in flight",
    );
  }
  if (!/if \(stranded\.length\) cleanUpAbandonedUploads\(stranded\)/.test(form)) {
    failures.push(
      "leaving the publish screen no longer sweeps the uploads it kept for " +
        "a retry that never came — those are orphans nothing can find again",
    );
  }
}

if (failures.length) {
  console.error("check-storage-cleanup: FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `clean: ${FIXTURES.length} listing shapes, client and delete trigger agree ` +
    `on every file — thumbnails included`,
);
