#!/usr/bin/env node
//
// A read receipt is a claim about another person's attention, so the only
// interesting question about this feature is whether it can ever lie.
//
// Three ways it could, and this file exists to stop each one.
//
// 1. DISAGREEING WITH THE BADGE.
//
//    Opening a conversation clears `unreadCount.{me}` and stamps
//    `lastReadAt.{me}`. Those are two facts about one event — "I have seen
//    this" — and if they are written separately, a failure between them
//    leaves the reader's badge cleared while the sender still sees one tick,
//    or the reverse. They go in ONE updateDoc, so there is no interval in
//    which they can disagree.
//
// 2. TICKING SOMEBODY ELSE'S MESSAGE.
//
//    A receipt belongs beside an outgoing bubble. Drawn on an incoming one
//    it tells the reader what they already know, and worse, implies the
//    message they are reading has been read by them — a statement about the
//    wrong person entirely.
//
// 3. CLAIMING DELIVERY THAT WAS NEVER OBSERVED.
//
//    `createdAt` is a serverTimestamp: on the sender's own screen it is null
//    between the optimistic write and the server acknowledging it. If that
//    null is compared numerically it coerces to 0, which is <= any
//    lastReadAt, and every in-flight message renders as ALREADY READ — the
//    exact inversion of the truth, shown at the one moment the sender is
//    watching. The pending state has to be decided before any comparison.
//
//    The same section forbids a "delivered" state. Nothing in this app
//    reports that a message reached the other handset; there is no delivery
//    acknowledgement anywhere. Two grey ticks would be an assertion about
//    something never measured, and the fact that another app draws them is
//    not evidence that ours may.
//
// Run: node scripts/check-read-receipts.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const CHAT = "src/screens/ChatScreen.js";
const TRANSLATIONS = "src/i18n/translations.js";
const THEME = "src/theme/colors.js";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const rel of [CHAT, TRANSLATIONS, THEME]) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel} is missing — this check reads it`);
  }
}
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

const chat = stripComments(read(CHAT));

// 1. One write, not two.
//
// Asserted on the OBJECT LITERAL, not on the file: mutation testing moved
// lastReadAt into a second updateDoc a few lines below and a whole-file
// match for both strings still passed, because both strings were still in
// the file. Presence is not atomicity.
// Every conversation update in the file, then the one that zeroes the
// reader's badge — not simply the first, which is the block/unblock write
// and sits earlier in the file. An earlier draft of this check anchored on
// "the first updateDoc" and passed while asserting nothing about the code it
// claimed to be guarding.
const conversationWrites = [
  ...chat.matchAll(
    /updateDoc\(\s*doc\(firestore,\s*"conversations",\s*conversationId\),\s*\{([\s\S]*?)\}\s*\)/g,
  ),
].map((m) => m[1]);
const resetCall = conversationWrites
  .map((payload) => ({ 1: payload }))
  .find((candidate) => /unreadCount\.\$\{user\.uid\}`?\]/.test(candidate[1]));
if (!resetCall) {
  failures.push(
    "could not find the updateDoc that resets the unread count — either it " +
      "was renamed or the read state is no longer written where the badge is",
  );
} else {
  const payload = resetCall[1];
  const clearsBadge = /unreadCount\.\$\{user\.uid\}`?\]:\s*0/.test(payload);
  const stampsRead = /lastReadAt\.\$\{user\.uid\}`?\]:\s*serverTimestamp\(\)/.test(
    payload,
  );
  if (!clearsBadge) {
    failures.push(
      "the first conversation update no longer zeroes unreadCount for the " +
        "reader — the badge and the receipt have been separated",
    );
  }
  if (!stampsRead) {
    failures.push(
      "lastReadAt.{uid} is not stamped in the SAME updateDoc that clears the " +
        "unread badge; a second write can fail on its own and leave the " +
        "sender looking at one tick on a message that has been read",
    );
  }
}

// 1b. The stamp is the reader's own, never the other participant's.
if (/lastReadAt\.\$\{otherUid\}`?\]:/.test(chat)) {
  failures.push(
    "the client writes lastReadAt for the OTHER participant — that is not a " +
      "receipt, it is forging one person's attention on another's behalf",
  );
}

// 2. Receipts are for outgoing messages only.
if (!/\{isMine \? <ReadReceipt/.test(chat)) {
  failures.push(
    "ReadReceipt is not guarded by isMine — a tick on a message somebody " +
      "sent TO the reader states that the wrong person has read it",
  );
}

// 3. Pending is decided BEFORE any timestamp comparison.
const stateFn = chat.slice(
  chat.search(/const readStateFor = /),
  chat.search(/const iBlocked = /),
);
if (!stateFn.trim()) {
  failures.push(
    "readStateFor is gone — the three message states are being decided " +
      "somewhere this check cannot see",
  );
} else {
  const pendingIdx = stateFn.search(/return "pending"/);
  const compareIdx = stateFn.search(/<=\s*otherLastReadMillis/);
  if (pendingIdx === -1) {
    failures.push(
      "readStateFor never returns 'pending'; an unresolved serverTimestamp " +
        "then falls through to the comparison, coerces to 0, and every " +
        "in-flight message renders as already read",
    );
  } else if (compareIdx !== -1 && pendingIdx > compareIdx) {
    failures.push(
      "readStateFor compares timestamps BEFORE handling the unresolved " +
        "createdAt — the null-coerces-to-zero inversion is back",
    );
  }
  if (!/createdMillis === null/.test(stateFn)) {
    failures.push(
      "the unresolved createdAt is not tested with an explicit null check — " +
        "a truthiness test also swallows a legitimate epoch-zero timestamp " +
        "and, more importantly, reads as if 0 were an acceptable time",
    );
  }
}

// 3b. No invented delivery state.
if (/"delivered"|'delivered'/.test(chat)) {
  failures.push(
    "a 'delivered' state has appeared in ChatScreen — nothing in this app " +
      "observes delivery to a handset, so that tick asserts something that " +
      "was never measured",
  );
}

// 4. The read tick is a theme token, not a literal, and exists in BOTH
//    palettes. A colour defined in one is a tick that vanishes in the other.
if (!/colors\.readReceipt/.test(chat)) {
  failures.push(
    "the read tick does not take its colour from colors.readReceipt — a " +
      "hard-coded value cannot follow the reader's theme",
  );
}
const theme = read(THEME);
const tokenCount = [...theme.matchAll(/^\s*readReceipt:/gm)].length;
if (tokenCount < 2) {
  failures.push(
    `readReceipt is defined ${tokenCount} time(s) in colors.js; the light ` +
      `and dark palettes each need it or the tick is invisible in one theme`,
  );
}

// 4b. Shape carries the meaning too, not colour alone.
if (!/checkmark-done/.test(chat) || !/"checkmark"/.test(chat)) {
  failures.push(
    "read and sent no longer use two different glyphs — colour alone is the " +
      "distinction, which is no distinction at all for a colour-blind reader",
  );
}

// 5. Both locales, no inlined copy.
const translations = read(TRANSLATIONS);
for (const key of [
  "chatReceiptPending",
  "chatReceiptSent",
  "chatReceiptRead",
]) {
  const count = [...translations.matchAll(new RegExp(`\\b${key}:`, "g"))].length;
  if (count < 2) {
    failures.push(
      `${key} is defined ${count} time(s) in translations.js; en and fr each ` +
        `need it or a screen reader announces a key name`,
    );
  }
}
if (/accessibilityLabel=\{?"(Sent|Read|Sending)"/.test(chat)) {
  failures.push(
    "a receipt label is hard-coded in the component — this project routes " +
      "user-facing copy through t() so both languages stay in step",
  );
}

if (failures.length === 0) {
  console.log(
    "clean: the receipt is written with the badge, drawn only on outgoing " +
      "messages, and never claims more than was observed",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
