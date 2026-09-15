// How the sync decides a roster has changed, checked against the ways it can
// be lied to.
//
// The whole detection rests on one comparison — is this post URL the one we
// processed last time — and that comparison answers a different question from
// the one that matters. "A post we have not seen" is not "a newer roster",
// and "a post we have seen" is not "the roster we transcribed". Two guards
// close that gap, and both fail silently if they are wrong: the sync would go
// on logging "no new post since last check" in a reassuring tone while
// serving a rota from a period that ended weeks ago.
//
// Run: node scripts/check-roster-detection.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "functions/pharmacyRosterSync.js"),
  "utf8",
);

// Lift the pure helpers — and parseWeekEndDate, which one of them calls —
// out of a module that would otherwise pull in firebase-admin and the
// network. The slice runs from the month table to the marker comment that
// closes the block, so adding a helper inside it needs no change here.
const start = source.indexOf("const FRENCH_MONTHS");
const end = source.indexOf("// ─── end of the pure detection helpers");
if (start === -1 || end === -1) {
  console.error(
    "could not locate the detection helpers in pharmacyRosterSync.js",
  );
  process.exit(1);
}
const context = {};
vm.createContext(context);
vm.runInContext(
  source.slice(start, end) +
    "\nthis.isRosterSuperseded = isRosterSuperseded;" +
    "\nthis.imageSetChanged = imageSetChanged;" +
    "\nthis.parseWeekEndDate = parseWeekEndDate;",
  context,
);
const { isRosterSuperseded, imageSetChanged, parseWeekEndDate } = context;

const failures = [];
const expect = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
};

// Real titles, copied from the archive rather than invented, because the
// guard is a regex against ONPB's own wording and a fixture in a tidier
// format would prove nothing about the strings it actually meets.
const HELD = parseWeekEndDate(
  "Programme de garde Littoral du 03 au 09 AOUT 2026",
);
const OLDER = "Programme de garde Littoral du 27 JUILLET au 02 AOUT 2026";
const SAME = "Programme de garde Littoral du 03 au 09 AOUT 2026";
const NEWER = "Programme de garde Littoral du 10 au 16 AOUT 2026";

// --- the archive handing back the past
expect("an older window is superseded", isRosterSuperseded(OLDER, HELD), true);
expect("a newer window is not", isRosterSuperseded(NEWER, HELD), false);

// The one that matters most. ONPB republishes a corrected roster for the
// CURRENT week under a fresh URL — the archive shows the same slug with a
// "-2" suffix — and it carries the same end date as the one we hold. A
// before-or-equal test would discard precisely the correction this exists to
// let through, and would do it silently.
expect(
  "a correction for the same week is NOT superseded",
  isRosterSuperseded(SAME, HELD),
  false,
);

// The skew that broke the first version of this guard, kept as a fixture
// because it is not hypothetical: this is the live Littoral post's real
// title, and the table photographed inside it is headed "DU 03 AOUT AU 09
// AOUT 2026". The held date comes from the image, the incoming one from the
// title, and they are a day apart. A strict before-test refused the
// correction it was written to admit.
const REAL_TITLE_SKEW = "PROGRAMME DE GARDE (LITTORAL) DU 03 AU 08 Aout 2026";
expect(
  "a same-week repost survives the title/image date skew",
  isRosterSuperseded(REAL_TITLE_SKEW, HELD),
  false,
);
// The margin must not be so generous that last week's roster slips in. Seven
// days behind is a real supersession, whatever the skew.
expect(
  "last week's roster is still refused",
  isRosterSuperseded(OLDER, HELD),
  true,
);

// --- no opinion beats a wrong opinion
expect(
  "an unparseable title is let through to the reviewer",
  isRosterSuperseded("Programme de garde — Littoral", HELD),
  false,
);
expect("an empty title is let through", isRosterSuperseded("", HELD), false);
expect("a null title is let through", isRosterSuperseded(null, HELD), false);
// A region that has never synced holds nothing, so nothing can be older.
expect(
  "no held roster means nothing is superseded",
  isRosterSuperseded(OLDER, null),
  false,
);
expect(
  "an undefined held roster likewise",
  isRosterSuperseded(OLDER, undefined),
  false,
);

// --- a re-photographed table at a URL we have already read
const A = "https://onpb.bj/wp-content/uploads/2026/08/a.jpeg";
const B = "https://onpb.bj/wp-content/uploads/2026/08/b.jpeg";
const C = "https://onpb.bj/wp-content/uploads/2026/08/c.jpeg";

expect("the same images are unchanged", imageSetChanged([A, B], [A, B]), false);
expect("a replaced image is a change", imageSetChanged([A, B], [A, C]), true);
expect("an added page is a change", imageSetChanged([A, B], [A, B, C]), true);
expect("a removed page is a change", imageSetChanged([A, B, C], [A, B]), true);
// Order is a layout detail. WordPress can reorder a gallery without anybody
// touching the roster, and treating that as a correction would spend a vision
// call and put a false "REVISION" alarm in front of the reviewer.
expect(
  "a reshuffle is not a change",
  imageSetChanged([A, B, C], [C, A, B]),
  false,
);
// Duplicates likewise — the same asset appearing twice in the markup.
expect(
  "a duplicated url is not a change",
  imageSetChanged([A, B], [A, B, B]),
  false,
);

// --- no baseline means no claim
//
// State documents written before lastImageUrls existed carry nothing. The
// honest answer there is "unchanged" — announcing a revision on the first run
// after deploy would fire a false alarm for every region at once, which is
// the fastest way to teach a reviewer to ignore the alert.
expect("a missing baseline is not a change", imageSetChanged(undefined, [A]), false);
expect("a null baseline is not a change", imageSetChanged(null, [A]), false);
expect("an empty baseline is not a change", imageSetChanged([], [A]), false);

// --- and the guards must actually be wired in, not merely defined
const wiring = [
  ["the superseded guard runs in the sync loop", /isRosterSuperseded\(latest\.title/],
  ["the image comparison runs in the sync loop", /imageSetChanged\(state\.lastImageUrls/],
  ["the baseline is recorded on the state doc", /lastImageUrls: imageUrls/],
  ["a revision is flagged on the draft", /revisionOfProcessedPost: isRevision/],
  // Not anchored on the closing paren: the call grew a third argument (the
  // regions that drafted, so the notification can name their departments)
  // and the property this protects is that revisionCount still reaches the
  // reviewer, not how many arguments follow it.
  ["and the reviewer is told it is a revision", /notifyReviewer\(newDraftCount, revisionCount/],
];
wiring.forEach(([label, pattern]) => {
  if (!pattern.test(source)) failures.push(`${label}: not found`);
});

// A revision must still cost a transcription — it is a different table.
if (!/isRevision = true/.test(source)) {
  failures.push("a changed image set must fall through to transcription");
}

// --- the field both guards hang off must actually get written
//
// Every region held a null lastDutyUntil in production, because it was
// written only from the vision model's weekRangeText and that never parsed.
// A null there disables rosterStaleness's precise test AND isRosterSuperseded
// entirely, silently, with nothing in the logs. The post title parses fine
// and is already computed, so it is the fallback.
if (!/const freshnessDate = weekEndDate \?\? titleWeekEndDate/.test(source)) {
  failures.push(
    "the state's duty date must fall back to the title when the image's fails",
  );
}
if (!/lastDutyUntil: freshnessDate/.test(source)) {
  failures.push("the state doc must store the fallback, not the image date alone");
}
// The DRAFT must not take the fallback. That date is reviewed against the
// photograph and becomes listing data; a date inferred from a headline has no
// business there, and noWeekRangeParsed exists to make its absence loud.
// Anchored forward from the draft write, not to the first stateRef.set in
// the file — there is an earlier one now (the baseline backfill on the
// unchanged path), and slicing to that gives an empty block that passes
// every test in it by matching nothing.
const draftStart = source.indexOf('collection("pharmacyRosterDrafts")');
const draftBlock = source.slice(
  draftStart,
  source.indexOf("\n      });", draftStart),
);
if (draftStart === -1 || draftBlock.length < 200) {
  failures.push("could not isolate the draft write — this check proves nothing");
}
if (/freshnessDate/.test(draftBlock)) {
  failures.push("the draft must keep the image-derived date, not the fallback");
}
if (!/dutyUntil: weekEndDate/.test(draftBlock)) {
  failures.push("the draft's dutyUntil must come from the transcribed image");
}

if (failures.length) {
  failures.forEach((line) => console.error(line));
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(
  "clean: roster detection — 25 cases; an older post is refused, a " +
    "same-week correction is not, and a re-photographed post is re-read",
);
