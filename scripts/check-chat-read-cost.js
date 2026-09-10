// What it costs to read a long conversation.
//
// The independent audit measured the old ChatScreen: one listener whose
// limit() grew by fifty on every "load earlier". A changed limit is a
// different query, so each tap was a new listener and a fresh server-side
// read of the whole window — 50 + 100 + … + N, not 50 each time. The comment
// in the file claimed the re-read was served from cache and therefore free.
// It was not.
//
// This computes both shapes from the constants the screen actually uses, so
// the figure in the Phase E report is derived from the code rather than
// asserted next to it.
//
// Run: node scripts/check-chat-read-cost.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "screens", "ChatScreen.js"), "utf8");

const pageMatch = source.match(/const MESSAGE_PAGE = (\d+);/);
if (!pageMatch) {
  console.error("ChatScreen.js no longer defines MESSAGE_PAGE");
  process.exit(1);
}
const PAGE = Number(pageMatch[1]);

const failures = [];

// The shape has to be the new one. A growing limit is the defect, and it is
// recognisable: a limit() whose argument is state rather than a constant, and
// an effect that re-subscribes when that state changes.
if (/limit\(messageWindow\)/.test(source)) {
  failures.push(
    "ChatScreen still calls limit(messageWindow) — the live listener grows " +
      "again, and every 'load earlier' re-reads the whole window.",
  );
}
if (!/limit\(MESSAGE_PAGE\)/.test(source)) {
  failures.push("the live listener no longer uses a fixed MESSAGE_PAGE limit");
}
if (!/startAfter\(/.test(source)) {
  failures.push("older messages are not read with a cursor");
}
// The live listener must not depend on anything that grows.
const effectDeps = source.match(/\}, \[conversationId[^\]]*\]\);/g) ?? [];
if (effectDeps.some((d) => /messageWindow/.test(d))) {
  failures.push("an effect still re-subscribes when the window grows");
}

const growing = (n) => {
  const pages = Math.ceil(n / PAGE);
  let total = 0;
  for (let i = 1; i <= pages; i += 1) total += i * PAGE;
  return total;
};
const cursored = (n) => Math.ceil(n / PAGE) * PAGE;

console.log(`MESSAGE_PAGE = ${PAGE}\n`);
console.log("  messages    before (growing limit)   after (cursor)   saving");
console.log("  --------    ---------------------   --------------   ------");
for (const n of [50, 500, 2000, 10000]) {
  const before = growing(n);
  const after = cursored(n);
  const saving = before === after ? "—" : `${(before / after).toFixed(0)}x`;
  console.log(
    `  ${String(n).padStart(8)}    ${String(before).padStart(21)}   ${String(
      after,
    ).padStart(14)}   ${saving.padStart(6)}`,
  );
}
console.log(
  `\n  live listener holds ${PAGE} documents at every depth, ` +
    `where the old one ended up holding all of them.`,
);

if (failures.length) {
  console.error(`\ncheck-chat-read-cost FAILED:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nthe live window is fixed and older pages are cursored");
