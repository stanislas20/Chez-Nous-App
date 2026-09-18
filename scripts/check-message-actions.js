#!/usr/bin/env node
//
// Which actions a long press offers, and what a reply carries.
//
// Both are decided by two small pure functions in ChatScreen — actionsFor()
// and replySnapshot() — and both are the kind of rule that is easy to state
// and easy to get subtly wrong: Edit offered on a photo, Copy offered on a
// message whose text is gone, a reply quoting a download URL. So they are
// driven here rather than read.
//
// The boundary this file does NOT cross, and must not be mistaken for: it
// tests what is OFFERED. What is PERMITTED is firestore.rules, exercised
// against the real engine in scripts/rules-tests/rules.test.js. A build
// where actionsFor() wrongly offered Delete on somebody else's message would
// fail here; a build where the RULES wrongly allowed it would not, which is
// why both suites exist.
//
// Run: node scripts/check-message-actions.js

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SCREEN = path.join(root, "src", "screens", "ChatScreen.js");

// Pull the module-scope helpers out and run them. They take plain objects and
// return plain objects, so nothing here needs React.
const source = fs.readFileSync(SCREEN, "utf8");
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} is gone from ChatScreen`);
  let depth = 0;
  let i = source.indexOf("{", start);
  const from = i;
  for (; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(start, i + 1);
}

const consts = source.match(/^const MESSAGE_[A-Z]+ = "[a-z]+";$/gm) ?? [];
const previewMax = source.match(/^const REPLY_PREVIEW_MAX = \d+;$/m);
if (consts.length !== 4 || !previewMax) {
  console.log("FAIL the message-kind constants or REPLY_PREVIEW_MAX are gone");
  process.exit(1);
}

const sandbox = { module: { exports: {} } };
new Function(
  "module",
  `${consts.join("\n")}
${previewMax[0]}
${extract("messageKind")}
${extract("replySnapshot")}
${extract("actionsFor")}
module.exports = { messageKind, replySnapshot, actionsFor, REPLY_PREVIEW_MAX };`,
)(sandbox.module);

const { messageKind, replySnapshot, actionsFor, REPLY_PREVIEW_MAX } =
  sandbox.module.exports;

const ME = "me-uid";
const THEM = "them-uid";
const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name}: ${detail}`);
};

const text = (who, extra = {}) => ({
  id: "m1",
  senderId: who,
  text: "bonjour",
  ...extra,
});
const image = (who, extra = {}) => ({
  id: "m2",
  senderId: who,
  imageUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?token=SECRET",
  ...extra,
});
const audio = (who, extra = {}) => ({
  id: "m3",
  senderId: who,
  audioUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/a.m4a?token=SECRET",
  audioDuration: 4,
  ...extra,
});

// ── Visibility, exactly as briefed ─────────────────────────────────────
const EXPECTED = [
  ["own text", text(ME), ME, { reply: 1, copy: 1, share: 1, edit: 1, remove: 1 }],
  ["received text", text(THEM), ME, { reply: 1, copy: 1, share: 1, edit: 0, remove: 0 }],
  ["own image", image(ME), ME, { reply: 1, copy: 0, share: 0, edit: 0, remove: 1 }],
  ["received image", image(THEM), ME, { reply: 1, copy: 0, share: 0, edit: 0, remove: 0 }],
  ["own audio", audio(ME), ME, { reply: 1, copy: 0, share: 0, edit: 0, remove: 1 }],
  ["received audio", audio(THEM), ME, { reply: 1, copy: 0, share: 0, edit: 0, remove: 0 }],
];

for (const [label, message, viewer, want] of EXPECTED) {
  const got = actionsFor(message, viewer);
  for (const key of Object.keys(want)) {
    check(
      "A",
      got[key] === Boolean(want[key]),
      `${label}: ${key} should be ${Boolean(want[key])}, got ${got[key]}`,
    );
  }
}

// Media Share stays off for this release: the only shareable representation
// of a photo is its download URL, which carries a Storage access token.
check(
  "A",
  actionsFor(image(ME), ME).share === false &&
    actionsFor(audio(ME), ME).share === false,
  "Share is offered on media — the only thing available to share is the " +
    "Firebase download URL, which is a credential",
);

// ── Tombstones offer nothing ───────────────────────────────────────────
{
  const dead = { id: "m4", senderId: ME, deleted: true };
  check("B", messageKind(dead) === "deleted", "a tombstone is not recognised");
  const got = actionsFor(dead, ME);
  check(
    "B",
    Object.values(got).every((v) => v === false),
    `a deleted message still offers ${JSON.stringify(got)} — its payload is ` +
      `gone, so Copy, Share and Edit would act on nothing`,
  );
  // deleted wins over a stale payload field, or a half-applied tombstone
  // would still be treated as a photo.
  check(
    "B",
    messageKind({ deleted: true, imageUrl: "x" }) === "deleted",
    "deleted must be decided before the payload fields are consulted",
  );
}

// ── An empty or whitespace message is not copyable ─────────────────────
{
  check("C", actionsFor(text(ME, { text: "" }), ME).copy === false, "empty text offers Copy");
  check("C", actionsFor(text(ME, { text: "   " }), ME).copy === false, "blank text offers Copy");
  check("C", actionsFor(text(ME, { text: "   " }), ME).edit === false, "blank text offers Edit");
}

// ── The reply snapshot ─────────────────────────────────────────────────
{
  const snap = replySnapshot(text(THEM, { text: "x".repeat(400) }));
  check("D", snap.messageId === "m1", "snapshot lost the message id");
  check("D", snap.senderId === THEM, "snapshot lost the sender");
  check("D", snap.type === "text", `type was ${snap.type}`);
  check(
    "D",
    snap.textPreview.length === REPLY_PREVIEW_MAX,
    `preview is ${snap.textPreview.length} chars; the rules cap it at ` +
      `${REPLY_PREVIEW_MAX} and a longer one is refused by the server`,
  );
  check(
    "D",
    Object.keys(snap).sort().join(",") === "messageId,senderId,textPreview,type",
    `snapshot carries unexpected keys: ${Object.keys(snap).join(",")} — ` +
      `firestore.rules accepts exactly four and rejects the write otherwise`,
  );
}

// E. THE ONE THAT MATTERS: no credential in the quote.
for (const [label, message] of [
  ["image", image(THEM)],
  ["audio", audio(THEM)],
]) {
  const snap = replySnapshot(message);
  const serialised = JSON.stringify(snap);
  check(
    "E",
    !serialised.includes("firebasestorage") && !serialised.includes("SECRET"),
    `the ${label} reply snapshot carries the download URL — that URL holds a ` +
      `Storage access token, and a reply is rendered in the other person's ` +
      `thread and kept forever`,
  );
  check("E", snap.textPreview === null, `${label} preview should be null`);
  check("E", snap.type === label, `${label} snapshot typed as ${snap.type}`);
}

// F. A quote of a message that is later deleted still renders. The snapshot
//    is a copy, so this is really a statement about not storing a pointer.
{
  const original = text(THEM, { text: "the original" });
  const snap = replySnapshot(original);
  original.deleted = true;
  delete original.text;
  check(
    "F",
    snap.textPreview === "the original",
    "the quote changed when the original was deleted — it is reading through " +
      "to the message instead of holding a copy",
  );
}

// ── Source-level guards the harness cannot see ─────────────────────────
{
  const { stripComments } = require("./lib/stripComments");
  const bare = stripComments(source);

  // The bubble must not go back to swallowing gestures on received text.
  if (/disabled=\{!isMine/.test(bare)) {
    failures.push(
      "G: the bubble is disabled again for messages that are not mine — a " +
        "disabled Pressable eats the long press too, which is what made " +
        "Reply, Copy and Share unreachable on a received message",
    );
  }
  // Deleting must be a tombstone, not a document removal.
  if (/deleteDoc\(/.test(bare)) {
    failures.push(
      "H: deleteDoc is back in ChatScreen — a removed document leaves a hole " +
        "in the historical pages, which are read once with getDocs and never " +
        "watched again, so it stays on screen until the thread is reopened",
    );
  }
  for (const field of ["deleted: true", "deletedAt", "editedAt"]) {
    if (!bare.includes(field)) {
      failures.push(`H: the tombstone/edit field \`${field}\` is gone`);
    }
  }
  // Preview repair must key on identity, never on a timestamp.
  if (!/conversation\.lastMessageId !== message\.id/.test(bare)) {
    failures.push(
      "I: preview repair no longer compares lastMessageId. Comparing " +
        "createdAt to lastMessageAt looks equivalent and races: the other " +
        "person can send between the read and the write, and the repair then " +
        "overwrites their newer preview",
    );
  }
  if (!/lastMessageId: messageId/.test(bare)) {
    failures.push("I: sends no longer record lastMessageId");
  }
  // Share must never reach a URL.
  const shareBody = bare.slice(bare.indexOf("const handleShare"), bare.indexOf("const handleStartEdit"));
  if (/imageUrl|audioUrl|url/i.test(shareBody)) {
    failures.push(
      "J: handleShare references a URL — for media the only URL available is " +
        "the tokenised download URL, and sharing it hands out a credential",
    );
  }
}

if (failures.length === 0) {
  console.log(
    "clean: each message offers exactly the actions it can honour, a " +
      "tombstone offers none, and a quote carries text rather than a token",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
