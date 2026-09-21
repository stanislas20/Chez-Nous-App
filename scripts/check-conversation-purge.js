#!/usr/bin/env node
//
// purgeFullyDeletedConversation decides whether a conversation is reachable
// by anyone. Getting it wrong deletes a live thread, so the decision is
// driven here rather than read.
//
// The case that matters is REVIVAL: deletedBy is a tombstone that both
// participants can carry while the thread is visible to both of them again,
// because the inbox compares lastMessageAt against each viewer's cutoff. A
// purge gated on "deletedBy covers everyone" destroys that thread the next
// time anything writes to the document.
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "functions", "index.js");
const src = fs.readFileSync(SOURCE, "utf8");

const start = src.indexOf("function everyoneDeleted(");
if (start === -1) {
  console.error("everyoneDeleted() not found in functions/index.js");
  process.exit(1);
}
const end = src.indexOf("\n}", start);
const everyoneDeleted = new Function(
  `${src.slice(start, end + 2)}; return everyoneDeleted;`,
)();

const ts = (ms) => ({ toMillis: () => ms });
const A = "uidA";
const B = "uidB";
let failures = 0;
const check = (name, actual, expected) => {
  if (actual !== expected) {
    console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
    failures += 1;
  }
};

check(
  "both deleted after the last message -> purge",
  everyoneDeleted({
    participantIds: [A, B],
    lastMessageAt: ts(1000),
    deletedBy: { [A]: ts(2000), [B]: ts(3000) },
  }),
  true,
);

check(
  "only one side deleted -> keep",
  everyoneDeleted({
    participantIds: [A, B],
    lastMessageAt: ts(1000),
    deletedBy: { [A]: ts(2000) },
  }),
  false,
);

// THE REVIVAL. Both tombstones are present and neither was removed, but a
// message arrived after them, so the thread is back on both screens.
check(
  "a message newer than both cutoffs -> keep",
  everyoneDeleted({
    participantIds: [A, B],
    lastMessageAt: ts(5000),
    deletedBy: { [A]: ts(2000), [B]: ts(3000) },
  }),
  false,
);

// Newer than one cutoff only: visible to that participant, so not reclaimable.
check(
  "a message newer than one cutoff -> keep",
  everyoneDeleted({
    participantIds: [A, B],
    lastMessageAt: ts(2500),
    deletedBy: { [A]: ts(2000), [B]: ts(3000) },
  }),
  false,
);

check(
  "equal timestamps count as deleted (inbox hides on <=)",
  everyoneDeleted({
    participantIds: [A, B],
    lastMessageAt: ts(3000),
    deletedBy: { [A]: ts(3000), [B]: ts(3000) },
  }),
  true,
);

check(
  "an unresolved serverTimestamp cutoff -> keep",
  everyoneDeleted({
    participantIds: [A, B],
    lastMessageAt: ts(1000),
    deletedBy: { [A]: ts(2000), [B]: {} },
  }),
  false,
);

check(
  "no messages yet -> both cutoffs win",
  everyoneDeleted({
    participantIds: [A, B],
    lastMessageAt: null,
    deletedBy: { [A]: ts(2000), [B]: ts(2000) },
  }),
  true,
);

check("missing participantIds -> keep", everyoneDeleted({}), false);
check(
  "empty participantIds -> keep",
  everyoneDeleted({ participantIds: [], deletedBy: {} }),
  false,
);
check(
  "no deletedBy at all -> keep",
  everyoneDeleted({ participantIds: [A, B], lastMessageAt: ts(1) }),
  false,
);

if (failures) process.exit(1);
console.log(
  "clean: a conversation is purged only when it is hidden for every " +
    "participant, and a revived thread survives its own tombstones",
);
