// Every collection that can hold a uid must have a deletion decision.
//
// deleteAccount had 24 passing tests and still left the departing person's
// identifier in four collections. The tests were not weak — they asserted
// carefully what deletion does. The gap was that nothing asserted what it
// OMITS, and a list of collections maintained by hand drifts the moment
// somebody adds a feature.
//
// So this check inverts the question. It reads the collections the app
// actually writes to, out of src/ and functions/, and requires that each one
// appears in this file with a decision:
//
//   DELETE    — the row belongs to that person and goes with them
//   ANONYMISE — the row is public or shared; it survives without their id
//   PRESERVE  — the row holds no uid, or holds somebody else's
//
// A new collection fails this check until somebody decides which it is. That
// decision is the point; the list below is just where it is written down.
//
// Run: node scripts/check-deletion-inventory.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const DECISIONS = {
  // ── Deleted with the account ──────────────────────────────────────────
  listings: ["DELETE", "sellerId — and the trigger removes their media"],
  favorites: ["DELETE", "userId"],
  jobFavorites: ["DELETE", "userId"],
  eventLikes: ["DELETE", "userId"],
  eventReactions: ["DELETE", "userId"],
  ratings: ["DELETE", "raterId — ratings they wrote"],
  jobApplications: ["DELETE", "applicantUid"],
  follows: ["DELETE", "followerId and sellerId, both directions"],
  profileLikes: ["DELETE", "likerId and sellerId, both directions"],
  ads: ["DELETE", "advertiserId"],
  sellers: ["DELETE", "the document id is the uid"],
  advertisers: ["DELETE", "the document id is the uid"],
  sellerStats: ["DELETE", "the document id is the uid"],
  verifiedCompanies: ["DELETE", "the document id is the uid"],
  reports: ["DELETE", "reporterId; the uid is also in the document id"],
  dealershipSuggestions: ["DELETE", "submittedBy; pending and unreviewed"],
  contacts: ["DELETE", "participantIds; a pair that no longer describes two accounts"],
  counterMarkers: ["DELETE", "uid; one row per person per listing per day"],
  // A subcollection, sellers/{uid}/notifications, not a top-level
  // collection — and that is the whole reason it needs its own line.
  // Deleting sellers/{uid} leaves it behind intact, so "the document id is
  // the uid" does NOT cover it; deleteAccount removes it explicitly through
  // OWNED_SUBCOLLECTIONS.
  notifications: ["DELETE", "sellers/{uid}/notifications — what the server told them"],

  // ── Survive without the person ────────────────────────────────────────
  carParks: ["ANONYMISE", "submittedBy cleared; the directory entry is public"],
  conversations: ["ANONYMISE", "the thread and the other party's history stay"],

  // ── Hold no uid of their own ──────────────────────────────────────────
  dealerships: ["PRESERVE", "curated directory, written by the Admin SDK only"],
  recoveryLookups: ["PRESERVE", "keyed by hashed IP and hashed number; TTL'd"],
  placesQuota: ["DELETE", "the u_{uid} document; the IP ones carry no uid and TTL out"],
  pharmacyRosterDrafts: ["PRESERVE", "scheduled roster sync; no uid, server only"],
  pharmacyRosterState: ["PRESERVE", "scheduled roster sync cursor; no uid"],
};

// Collections referenced anywhere the app or the functions write.
function collectionsInUse() {
  const found = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      const text = fs
        .readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((l) => l.replace(/^\s*\/\/.*$/, ""))
        .join("\n");

      const patterns = [
        /collection\(\s*[A-Za-z_$.]+\s*,\s*["'`]([a-zA-Z]+)["'`]/g, // JS SDK
        /doc\(\s*[A-Za-z_$.]+\s*,\s*["'`]([a-zA-Z]+)["'`]/g, // JS SDK
        /\.collection\(\s*["'`]([a-zA-Z]+)["'`]/g, // admin SDK
        /\.doc\(\s*`([a-zA-Z]+)\//g, // admin SDK template path
      ];
      for (const re of patterns) {
        let m;
        while ((m = re.exec(text))) {
          if (!found.has(m[1])) found.set(m[1], new Set());
          found.get(m[1]).add(path.relative(root, p));
        }
      }
    }
  };
  walk(path.join(root, "src"));
  walk(path.join(root, "functions"));
  return found;
}

// Sub-collections and paths that are not top-level collections.
const NOT_A_COLLECTION = new Set(["messages", "databases", "documents"]);

const failures = [];
const inUse = collectionsInUse();

for (const [name, files] of [...inUse].sort()) {
  if (NOT_A_COLLECTION.has(name)) continue;
  if (!DECISIONS[name]) {
    failures.push(
      `"${name}" is written by ${[...files].slice(0, 3).join(", ")} but has no ` +
        `deletion decision. Add it to scripts/check-deletion-inventory.js as ` +
        `DELETE, ANONYMISE or PRESERVE, and make deleteAccount.js agree.`,
    );
  }
}

// The decisions have to match what deleteAccount actually does, or this file
// becomes a second thing to keep in step rather than a check on the first.
const source = fs.readFileSync(path.join(root, "functions", "deleteAccount.js"), "utf8");
for (const [name, [decision]] of Object.entries(DECISIONS)) {
  const mentioned = new RegExp(`["'\`]${name}["'\`]`).test(source);
  if (decision === "DELETE" && !mentioned) {
    failures.push(`"${name}" is marked DELETE but deleteAccount.js never names it`);
  }
  if (decision === "ANONYMISE" && !mentioned) {
    failures.push(`"${name}" is marked ANONYMISE but deleteAccount.js never names it`);
  }
  if (decision === "PRESERVE" && mentioned) {
    failures.push(
      `"${name}" is marked PRESERVE but deleteAccount.js names it — one of the two is wrong`,
    );
  }
}

const counts = Object.values(DECISIONS).reduce((acc, [d]) => {
  acc[d] = (acc[d] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `${Object.keys(DECISIONS).length} collections inventoried: ` +
    Object.entries(counts)
      .map(([d, n]) => `${n} ${d}`)
      .join(", "),
);
for (const [name, [decision, why]] of Object.entries(DECISIONS)) {
  console.log(`  ${decision.padEnd(9)} ${name.padEnd(22)} ${why}`);
}

if (failures.length) {
  console.error(`\ncheck-deletion-inventory FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nevery collection in use has a deletion decision, and deleteAccount agrees");
