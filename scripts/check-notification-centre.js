#!/usr/bin/env node
//
// A notification somebody was shown has to be a notification they can find.
//
// The notification centre was built entirely out of DERIVED rows: unread
// conversations, listings that had just cleared moderation, applications to
// your own postings. Each one infers a notification from a document that
// exists for some other reason. That works for exactly those three and fails
// silently for everything else.
//
// A pharmacy roster push has no listing and no conversation behind it. It was
// sent with `data: { type: "pharmacyRosterDraft" }`, openNotification had no
// case for it, its default branch routed to the notification centre — and the
// centre had never heard of it. The reviewer was told three drafts were
// waiting, tapped Voir, and was shown "no notifications yet". Nothing errored.
// Every screen worked. The push was a delivery attempt with no memory, and the
// place it pointed at could only see things that were already in Firestore for
// another purpose.
//
// So the rule is: EVERY type the server sends must either deep link to a
// screen of its own, or be written down where the centre can read it back.
// Sending one that does neither is how you get a notification that announces
// something and then denies it happened.
//
// Asserted here:
//
//   every push type in functions/ — including both branches of a ternary —
//     is either a case in openNotification, or recorded by the exported
//     handler that sends it;
//   sendReviewerPush records before it pushes, so a stale token, a missing
//     token or a messaging outage still leaves the notification behind;
//   the centre actually reads the recorded rows, and the screen renders them;
//   notificationTarget and openNotification agree on which types have a
//     destination — a row that deep links must be pressable and a row that
//     does not must not be, and those two live in different functions;
//   the rows are readable by their owner and writable by nobody.
//
// Run: node scripts/check-notification-centre.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const code = (rel) => stripComments(read(rel));

const failures = [];

const OPEN = "src/notifications/openNotification.js";
const CENTRE = "src/hooks/useNotificationCenter.js";
const STORE = "src/hooks/useStoredNotifications.js";
const SCREEN = "src/screens/NotificationsScreen.js";
const SENDER = "functions/pharmacyRosterSync.js";
const RULES = "firestore.rules";

for (const rel of [OPEN, CENTRE, STORE, SCREEN, SENDER, RULES]) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(
      `${rel} is missing — this check reads it and would otherwise pass on ` +
        `nothing`,
    );
  }
}
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(`\n${failures.length} failing`);
  process.exit(1);
}

const openSource = code(OPEN);

// ── 1. Which types deep link ────────────────────────────────────────────
//
// Read out of the switch rather than listed here, so adding a case is all it
// takes for a type to count as handled.
const handledTypes = new Set(
  [...openSource.matchAll(/case\s+"([A-Za-z]+)"/g)].map((m) => m[1]),
);
if (handledTypes.size === 0) {
  failures.push(
    `no \`case "..."\` found in ${OPEN} — the switch this check reads has ` +
      `gone, so every type below would look unhandled or handled at random`,
  );
}

// ── 2. Which types the server sends ─────────────────────────────────────
//
// Two shapes carry a push type, and the first version of this check only
// read one of them:
//
//   sendReviewerPush(title, body, { type: "pharmacyRosterDraft" })
//   admin.messaging().send({ ..., data: { type: "paperExpiring", ... } })
//
// and inside the second, a type is as often a ternary as a literal:
//
//   data: { type: shortlisted ? "applicationShortlisted" : "applicationDeclined" }
//
// Reading only single-key objects found three types and missed four —
// applicationShortlisted, applicationDeclined, companyVerified and
// companyRejected — every one of which had the exact bug this file is about.
// A check that passes while the defect it describes is live is worse than no
// check, so both branches of a ternary are collected and the payload is
// matched wherever it sits.
//
// `{ type: "text", ... }` and `{ type: "base64", ... }` in the transcription
// prompt are not push payloads; they are excluded by only reading `data:`
// objects and bare single-key objects, never every object with a type key.
function typeLiteralsIn(expression) {
  return [...expression.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
}

function pushTypes(source) {
  const types = [];

  // A payload built by a named helper: rosterData("pharmacyRosterStale", …).
  // Introduced when the roster notifications started carrying the departments
  // they concern, which took their type literals out of the object-literal
  // forms below — and the blindness guard caught it, reporting 11 types where
  // there had been 13. That is the check working: a scanner that silently
  // stops seeing two of the types it exists to police is worse than none.
  for (const m of source.matchAll(/\brosterData\(\s*("[A-Za-z]+")/g)) {
    types.push(...typeLiteralsIn(m[1]));
  }

  // Bare single-key payload, the sendReviewerPush form. A trailing comma is
  // permitted: `{ type: "x" }` and `{ type: "x", }` are the same object and
  // only one of them used to be seen.
  for (const m of source.matchAll(/\{\s*type:\s*([^,{}]+?)\s*,?\s*\}/g)) {
    types.push(...typeLiteralsIn(m[1]));
  }

  // The payload as a named object, in either form it is written:
  //
  //   data: { type: ... }        inline in the send
  //   const data = { type: ... } hoisted, then passed by shorthand
  //
  // Anchoring on `data:` alone was a real hole and mutation testing found
  // it the hard way — by NOT finding it. Hoisting the shortlisting payload
  // into `const data = {` (so it could be recorded and pushed from one
  // object) took those two types out of this scanner's sight, and deleting
  // their record call then left the check green. The check was reading the
  // shape I happened to have written rather than the shape the codebase
  // uses.
  for (const m of source.matchAll(/\bdata\s*[:=]\s*\{/g)) {
    const body = source.slice(m.index + m[0].length);
    const end = body.indexOf("}");
    if (end < 0) continue;
    // Only up to the end of the type's own value, so a sibling key's string
    // is never mistaken for a type. A ternary carries no comma, so both
    // branches survive this cut.
    const typeMatch = body.slice(0, end).match(/\btype:\s*([^,\n]+)/);
    if (typeMatch) types.push(...typeLiteralsIn(typeMatch[1]));
  }

  return types;
}

// Per exported function, not per file.
//
// Checking the file was the first attempt and mutation testing killed it:
// deleting the record call from the shortlisting notification left index.js
// still passing, because the company-verification handler further down the
// same file also calls recordNotification and one call anywhere satisfied
// all seven of that file's push types. The unit has to be the function that
// sends the push, so `exports.` is the boundary — every push in this
// codebase sits inside one.
function chunksOf(source) {
  const bounds = [...source.matchAll(/^exports\./gm)].map((m) => m.index);
  if (bounds.length === 0) return [source];
  // The preamble holds the shared helpers, which is where
  // pharmacyRosterSync's sendReviewerPush and all four of its callers live.
  return [source.slice(0, bounds[0])].concat(
    bounds.map((start, i) => source.slice(start, bounds[i + 1])),
  );
}

const sentTypes = new Map();
const functionsDir = path.join(root, "functions");
for (const name of fs.readdirSync(functionsDir)) {
  if (!name.endsWith(".js")) continue;
  const rel = `functions/${name}`;
  for (const chunk of chunksOf(code(rel))) {
    for (const type of pushTypes(chunk)) {
      if (!sentTypes.has(type)) sentTypes.set(type, { rel, chunk });
    }
  }
}
if (sentTypes.size < 13) {
  failures.push(
    `only ${sentTypes.size} push type(s) found across functions/ — there ` +
      `were thirteen when this check was written, so it has gone blind and ` +
      `would pass on almost anything`,
  );
}

// A sender records if it writes the subcollection the centre reads, directly
// or through the shared helper.
const recordsNotifications = (source) =>
  /\.collection\(\s*"notifications"\s*\)/.test(source) ||
  /\brecordNotification\s*\(/.test(source);

for (const [type, { rel, chunk }] of sentTypes) {
  if (handledTypes.has(type)) continue;
  if (recordsNotifications(chunk)) continue;
  failures.push(
    `${rel} sends a "${type}" push, openNotification has no case for it, and ` +
      `the handler that sends it records nothing — so it falls to the ` +
      `default branch, lands on the notification centre, and the centre has ` +
      `no row for it. That is a notification that announces something and ` +
      `then shows "no notifications yet"`,
  );
}

// ── 3. The record is written before the push, not instead of it ─────────
const senderSource = code(SENDER);
const helper = senderSource.slice(
  senderSource.search(/async function sendReviewerPush\b/),
);
const helperBody = helper.slice(0, helper.indexOf("\n}\n") + 1);

if (!/async function sendReviewerPush\b/.test(senderSource)) {
  failures.push(
    `sendReviewerPush is gone from ${SENDER} — every roster notification ` +
      `went through it, and this check can no longer tell whether they are ` +
      `recorded`,
  );
} else {
  const recordAt = helperBody.search(
    /\brecordNotification\s*\(|\.collection\(\s*"notifications"\s*\)/,
  );
  const pushAt = helperBody.search(/\.messaging\(\)/);
  if (recordAt < 0) {
    failures.push(
      "sendReviewerPush does not write a notifications row — the push is " +
        "the whole notification again, and it survives only as long as the " +
        "banner is on screen",
    );
  } else if (pushAt >= 0 && recordAt > pushAt) {
    failures.push(
      "sendReviewerPush pushes before it records. The order matters: a " +
        "throw from messaging() would skip the durable row and leave the " +
        "reviewer with a banner and nothing behind it",
    );
  }
  if (/if\s*\(\s*!\s*reviewer\.pushToken\s*\)\s*return/.test(helperBody)) {
    // Correct — but only if that bail-out sits AFTER the record.
    const bailAt = helperBody.search(
      /if\s*\(\s*!\s*reviewer\.pushToken\s*\)\s*return/,
    );
    if (recordAt >= 0 && bailAt < recordAt) {
      failures.push(
        "sendReviewerPush gives up on a reviewer with no push token before " +
          "recording anything, so the one person who cannot receive a push " +
          "is also the one who gets no durable notification",
      );
    }
  }
}

// ── 4. The centre reads them and the screen renders them ────────────────
if (!/useStoredNotifications/.test(code(CENTRE))) {
  failures.push(
    `${CENTRE} does not use useStoredNotifications — the recorded rows are ` +
      `written and never read, which looks exactly like the original bug`,
  );
}
// Both halves, because they are two literals in two places and renaming one
// leaves the rows falling through to the message renderer — which draws them
// with a listing thumbnail and an unread count they do not have. Mutation
// testing found this: changing only the producer left the check green.
const screenSource = code(SCREEN);
if (!/kind:\s*"stored"/.test(screenSource)) {
  failures.push(
    `${SCREEN} never tags a feed entry \`kind: "stored"\` — the recorded ` +
      `rows are read and then dropped before they reach the list`,
  );
}
if (!/kind\s*===\s*"stored"/.test(screenSource)) {
  failures.push(
    `${SCREEN} has no \`kind === "stored"\` branch in renderItem — the rows ` +
      `reach the list and fall through to another kind's renderer`,
  );
}
const storeSource = code(STORE);
for (const [pattern, why] of [
  [/limit\(/, "unbounded listener on a collection that only grows"],
  [/orderBy\(\s*"createdAt"\s*,\s*"desc"\s*\)/, "newest-first ordering"],
  [/"sellers"[\s\S]{0,40}"notifications"/, "the subcollection the server writes"],
]) {
  if (!pattern.test(storeSource)) {
    failures.push(`${STORE} no longer carries ${why} (${pattern})`);
  }
}

// ── 5. notificationTarget must agree with openNotification ──────────────
//
// They are two switches over the same thing in the same file, and they drift
// silently: a case added to one and not the other makes a row inert that
// should deep link, or pressable into a screen that just re-opens this one.
const targetStart = openSource.search(/export function notificationTarget\b/);
const openStart = openSource.search(/export async function openNotification\b/);
if (targetStart < 0) {
  failures.push(
    `notificationTarget is missing from ${OPEN} — the screen needs it to ` +
      `know which rows are worth making pressable`,
  );
} else {
  const targetCases = new Set(
    [
      ...openSource
        .slice(targetStart, openStart > targetStart ? openStart : undefined)
        .matchAll(/case\s+"([A-Za-z]+)"/g),
    ].map((m) => m[1]),
  );
  const openCases = new Set(
    [...openSource.slice(openStart).matchAll(/case\s+"([A-Za-z]+)"/g)].map(
      (m) => m[1],
    ),
  );
  // A case label is not a destination. Mutation testing turned
  // `case "pharmacyRosterStale": return "CategoryListings"` into
  // `return null` and this check still passed, because both switches still
  // LISTED the type. That is precisely the bug this file was written about —
  // openNotification navigates, notificationTarget says there is nowhere to
  // go, and the row renders inert while the push deep links. So the returned
  // value is read, not just the label.
  const targetBody = openSource.slice(
    targetStart,
    openStart > targetStart ? openStart : undefined,
  );
  for (const m of targetBody.matchAll(
    /case\s+"([A-Za-z]+)":\s*(?:case\s+"[A-Za-z]+":\s*)*\n?\s*return\s+null\s*;/g,
  )) {
    if (openCases.has(m[1])) {
      failures.push(
        `notificationTarget returns null for "${m[1]}" while ` +
          `openNotification navigates for it — the row is drawn un-pressable ` +
          `and the same notification tapped from the system tray goes ` +
          `somewhere. Those two must not disagree`,
      );
    }
  }

  for (const type of openCases) {
    if (!targetCases.has(type)) {
      failures.push(
        `openNotification handles "${type}" but notificationTarget does not, ` +
          `so a stored row of that type is drawn as un-pressable while a ` +
          `real screen for it exists`,
      );
    }
  }
  for (const type of targetCases) {
    if (!openCases.has(type)) {
      failures.push(
        `notificationTarget claims "${type}" has a destination but ` +
          `openNotification has no case for it, so pressing the row falls ` +
          `through to the notification centre it is already on`,
      );
    }
  }
}

// ── 6. Owner reads, nobody writes ───────────────────────────────────────
const rules = read(RULES);
const block = rules.match(
  /match \/notifications\/\{[A-Za-z]+\} \{[\s\S]*?\n {6}\}/,
);
if (!block) {
  failures.push(
    "firestore.rules has no match block for the notifications subcollection " +
      "— rules do not cascade into subcollections, so the centre reads " +
      "nothing and is empty for a second, quieter reason",
  );
} else {
  if (!/allow read: if request\.auth != null && request\.auth\.uid == userId/.test(block[0])) {
    failures.push(
      "the notifications rule does not restrict reads to the owner — these " +
        "rows carry what the server told one particular person",
    );
  }
  if (!/allow write: if false/.test(block[0])) {
    failures.push(
      "the notifications rule permits a client write. Every row is a " +
        "statement the SERVER is making; a client that can write them can " +
        "manufacture one, and a client that can delete them can quietly " +
        "clear the record of a roster it never applied",
    );
  }
}

if (failures.length === 0) {
  console.log(
    `clean: ${sentTypes.size} push type(s) — each deep links or is recorded ` +
      `where the notification centre reads it back`,
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
