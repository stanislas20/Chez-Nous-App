#!/usr/bin/env node
//
// What a deleted message is allowed to take with it.
//
// Two things outlive a deleted message unless something removes them: its
// photograph in the bucket, and the COPY of its text sitting inside any
// reply that quoted it. The trigger handles both, and the risk it carries is
// larger than the bugs it fixes: the function
// recovers a Storage path from a URL that was written by a client, and a
// cleanup job driven by attacker-controlled input is a delete-anything
// primitive unless every step is proven.
//
// chatMediaPath() is that proof, so it is driven here with the URLs an
// attacker would actually try: another conversation's attachment, another
// person's file, a listing photo, a profile photo, a traversal, a foreign
// host, a foreign bucket. Every one must come back null, because the
// function's contract is that anything it cannot vouch for is not deleted.
//
// Run: node scripts/check-chat-media-cleanup.js

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const FUNCTIONS = path.join(root, "functions", "index.js");
const source = fs.readFileSync(FUNCTIONS, "utf8");

// Lift the validator out and run it against a stubbed admin.storage().
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} is gone from functions/index.js`);
  let depth = 0;
  let i = source.indexOf("{", start);
  for (; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(start, i + 1);
}

const prefix = source.match(/^const STORAGE_URL_PREFIX = "[^"]+";$/m);
if (!prefix) {
  console.log("FAIL STORAGE_URL_PREFIX is gone from functions/index.js");
  process.exit(1);
}

const BUCKET = "benin-marketplace-3eb04.firebasestorage.app";
const sandbox = { module: { exports: {} } };
new Function(
  "module",
  "admin",
  `${prefix[0]}
${extract("chatMediaPath")}
module.exports = { chatMediaPath };`,
)(sandbox.module, { storage: () => ({ bucket: () => ({ name: BUCKET }) }) });

const { chatMediaPath } = sandbox.module.exports;

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name}: ${detail}`);
};

const CID = "listing123_buyer-uid";
const SENDER = "buyer-uid";
const url = (objectPath, bucket = BUCKET) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    objectPath,
  )}?alt=media&token=abc-123`;

// ── The one shape it must accept ───────────────────────────────────────
{
  const good = `conversations/${CID}/${SENDER}-1737000000.jpg`;
  check(
    "A",
    chatMediaPath(url(good), CID, SENDER) === good,
    `the genuine attachment URL was not accepted — cleanup would never run ` +
      `and the orphan bug this function exists to fix would remain`,
  );
  // Audio too, since both fields are passed through the same validator.
  const goodAudio = `conversations/${CID}/${SENDER}-1737000001.m4a`;
  check("A", chatMediaPath(url(goodAudio), CID, SENDER) === goodAudio, "audio path rejected");
}

// ── Everything it must refuse ──────────────────────────────────────────
const REFUSALS = [
  [
    "B",
    "another conversation's attachment",
    url(`conversations/other-thread/${SENDER}-1.jpg`),
    CID,
    SENDER,
    "a sender could delete a photo from a thread they are not in by " +
      "tombstoning their own message",
  ],
  [
    "B",
    "the other participant's file in this thread",
    url(`conversations/${CID}/seller-uid-1.jpg`),
    CID,
    SENDER,
    "either participant could delete the other's attachments — Storage " +
      "itself enforces the same uid- prefix on upload",
  ],
  ["C", "a listing photo", url("listings/seller-uid/cover.jpg"), CID, SENDER, "listing media is not chat media"],
  ["C", "a profile photo", url(`sellers/${SENDER}/avatar.jpg`), CID, SENDER, "profile media is not chat media"],
  ["C", "a verification document", url(`sellerVerificationDocs/${SENDER}/rccm.pdf`), CID, SENDER, "company papers are not chat media"],
  ["C", "a job application CV", url(`jobApplicationCvs/${SENDER}/cv.pdf`), CID, SENDER, "a CV is not chat media"],
  ["D", "a path traversal", url(`conversations/${CID}/../../listings/x/cover.jpg`), CID, SENDER, "traversal must not escape the namespace"],
  ["D", "a deeper path than the upload shape", url(`conversations/${CID}/sub/${SENDER}-1.jpg`), CID, SENDER, "only the two-segment upload shape exists"],
  ["D", "a shallower path", url("conversations/orphan.jpg"), CID, SENDER, "not a conversation attachment"],
  ["E", "a different bucket", url(`conversations/${CID}/${SENDER}-1.jpg`, "someone-elses-bucket.appspot.com"), CID, SENDER, "another project's bucket"],
  ["E", "a non-Storage host", `https://evil.example/conversations/${CID}/${SENDER}-1.jpg`, CID, SENDER, "arbitrary host"],
  ["E", "a plain string", "not-a-url", CID, SENDER, "garbage input"],
  ["E", "an empty filename prefix", url(`conversations/${CID}/-1.jpg`), CID, SENDER, "empty uid prefix"],
  ["F", "a filename merely CONTAINING the uid", url(`conversations/${CID}/seller-uid-${SENDER}-1.jpg`), CID, SENDER, "the uid must PREFIX the name, not appear in it"],
  // The three below exist to hold one guard each to account. Each is shaped
  // so that EVERY other check passes and only the named one can refuse it —
  // without that, a mutation run shows the guard removed and the suite still
  // green, because a neighbouring check happened to cover the same input.
  [
    "D",
    "the right shape under the wrong root",
    url(`sellers/${CID}/${SENDER}-1.jpg`),
    CID,
    SENDER,
    "thread id and sender prefix both match here, so only the " +
      "`conversations` root check can refuse it",
  ],
  [
    "D",
    "a dot-segment inside an otherwise valid name",
    url(`conversations/${CID}/${SENDER}-..`),
    CID,
    SENDER,
    "root, thread and sender prefix all match, so only the traversal check " +
      "can refuse it",
  ],
  [
    "D",
    "a valid-looking name with an extra segment after it",
    url(`conversations/${CID}/${SENDER}-1.jpg/extra`),
    CID,
    SENDER,
    "root, thread id and sender prefix all match on the first three " +
      "segments, so only the segment-count check can refuse the trailing one",
  ],
  [
    "D",
    "a two-segment path where the file name is missing entirely",
    url("conversations/orphan-only"),
    CID,
    SENDER,
    "without the segment-count check this destructures to an undefined file " +
      "name and throws rather than returning null",
  ],
];

for (const [group, label, value, cid, sender, why] of REFUSALS) {
  const got = chatMediaPath(value, cid, sender);
  check(group, got === null, `${label} resolved to "${got}" — ${why}`);
}

// ── Bad inputs must not throw ──────────────────────────────────────────
{
  for (const bad of [null, undefined, 42, {}, [], "", `${"x".repeat(5000)}`]) {
    let threw = false;
    try {
      chatMediaPath(bad, CID, SENDER);
    } catch {
      threw = true;
    }
    check("G", !threw, `chatMediaPath threw on ${JSON.stringify(bad)?.slice(0, 20)}`);
  }
  // A malformed percent-escape is the realistic version of this: decodeURIComponent
  // throws on "%E0%A4%A" and a throwing cleanup function retries forever.
  let threw = false;
  try {
    chatMediaPath(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/%E0%A4%A?alt=media`,
      CID,
      SENDER,
    );
  } catch {
    threw = true;
  }
  check("G", !threw, "a malformed percent-escape threw instead of returning null");
  // Missing sender must refuse rather than match everything.
  check(
    "G",
    chatMediaPath(url(`conversations/${CID}/${SENDER}-1.jpg`), CID, null) === null,
    "a missing senderId was treated as permission to delete",
  );
}

// ── The trigger's own guards, read from source ─────────────────────────
{
  const { stripComments } = require("./lib/stripComments");
  const bare = stripComments(source);
  const start = bare.indexOf("exports.cleanupDeletedMessageMedia");
  if (start === -1) {
    failures.push("H: cleanupDeletedMessageMedia is gone");
  } else {
    const body = bare.slice(start, start + 6000);

    // The trigger type is the whole design. onDocumentUpdated was the
    // tombstone version and had to gate on a false->true transition; a
    // deletion trigger gets the document itself and needs no gate.
    if (!/onDocumentDeleted\(/.test(bare.slice(start, start + 200))) {
      failures.push(
        "H: cleanup is no longer a deletion trigger. An update trigger on " +
          "messages would also mean the sanitization write below re-enters " +
          "it, which is the recursion this design avoids by not existing",
      );
    }
    // Nothing may watch messages for updates, or sanitization loops.
    const updateTriggers = (bare.match(/onDocumentUpdated\(\s*\n?\s*"conversations\/\{conversationId\}\/messages/g) ?? []).length;
    if (updateTriggers > 0) {
      failures.push(
        `H: ${updateTriggers} onDocumentUpdated trigger(s) still watch ` +
          `messages — the quote sanitization writes to a message, so this is ` +
          `an invocation loop`,
      );
    }
    if (!/event\.data\?\.data\(\)/.test(body)) {
      failures.push(
        "H: the trigger no longer reads the deleted document snapshot, which " +
          "is the only remaining source of the attachment URL once the " +
          "document is gone",
      );
    }
    if (!/ignoreNotFound: true/.test(body)) {
      failures.push(
        "H: the delete is no longer idempotent — a retried event on a file " +
          "already gone would fail the function forever",
      );
    }
    if (!/ORPHANED ATTACHMENT/.test(body)) {
      failures.push(
        "H: a failed or unresolvable attachment is no longer logged as an " +
          "orphan. A physical delete leaves no document to find the file " +
          "from later, so this log line is the only record it exists",
      );
    }

    // ── Quote sanitization ─────────────────────────────────────────────
    if (!/where\("replyTo\.messageId", "==", messageId\)/.test(body)) {
      failures.push(
        "I: the trigger no longer finds replies quoting the deleted message. " +
          "A reply stores a COPY of the text, so deleting the original alone " +
          "leaves its words inside somebody else's document",
      );
    }
    if (!/type: "unavailable"/.test(body)) {
      failures.push("I: the sanitized quote no longer uses the server-only type");
    }
    // The whole map is rewritten. A merge would leave textPreview in place,
    // which is the one field the operation exists to remove.
    if (!/batch\.update\(docSnap\.ref, \{\s*replyTo: \{/.test(body)) {
      failures.push(
        "I: the sanitized quote is no longer written as a whole replyTo map. " +
          "Merging into it leaves textPreview untouched — the deleted text " +
          "would survive the sanitization meant to remove it",
      );
    }
    if (/textPreview/.test(body.slice(body.indexOf("batch.update")))) {
      failures.push(
        "I: the sanitized quote still names textPreview. It must be DROPPED " +
          "from the document, not blanked or copied",
      );
    }
    if (!/batch\.commit\(\)/.test(body)) {
      failures.push("I: sanitization is never committed");
    }
    if (!/quoting\.empty/.test(body)) {
      failures.push(
        "I: the zero-matching-replies case is not handled, so an ordinary " +
          "delete commits an empty batch",
      );
    }
    if (!/limit\(SANITIZE_BATCH_LIMIT\)/.test(body)) {
      failures.push(
        "I: the sanitization query is unbounded — Firestore caps a batch at " +
          "500 writes, so an unbounded match set throws rather than sanitizing",
      );
    }
  }
}

// ── Push cannot fire from any of this ──────────────────────────────────
{
  const { stripComments } = require("./lib/stripComments");
  const bare = stripComments(source);
  const push = bare.slice(bare.indexOf("exports.sendMessagePush"), bare.indexOf("exports.sendMessagePush") + 120);
  if (!/onDocumentCreated\(/.test(push)) {
    failures.push(
      "J: sendMessagePush is no longer create-only. Deleting a message, " +
        "repairing the preview and sanitizing a quote are all deletes and " +
        "updates — none of which may notify anybody",
    );
  }
}

if (failures.length === 0) {
  console.log(
    "clean: a deleted message takes its own attachment and every copy of " +
      "its text with it, and can reach nothing else",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
