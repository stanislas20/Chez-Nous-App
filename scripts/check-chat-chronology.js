#!/usr/bin/env node
//
// A conversation with no time in it anywhere.
//
// The thread list showed "3:27 AM". Inside the conversation, a thread running
// across four days was one undifferentiated column of bubbles: no times, no
// day boundaries, no way to tell a reply sent a minute ago from one sent last
// Tuesday. Confirmed on both an Android handset and an iPhone, so it was not
// a rendering accident on one platform — it had never been built.
//
// What this file defends, and why each part can break silently:
//
// THE INVERTED LIST. Messages are held newest-first and the FlatList is
// `inverted`, so index + 1 is the message visually ABOVE and index - 1 the
// one below. Reverse those and every separator introduces the wrong day
// while still looking entirely plausible — a bug nobody reports because the
// screen looks finished.
//
// RESTRAINT. A timestamp welded to every bubble turns a fast exchange into a
// column of repeated numbers. One time per run of messages, on the run's
// last line, and the day announced once by a separator.
//
// LOCALE. Times and weekday names follow the reader's language. A French
// month inside an English sentence is the defect this project already fixed
// once on the pharmacy screen; it must not reappear here.
//
// LAYOUT. The time and the read tick sit BESIDE the bubble. Inside would mean
// threading them through three unrelated bubble bodies — text, a full-bleed
// image with no padding, and the voice player's fixed-width scrub track —
// and for the image there is no position that is not on top of the
// photograph.
//
// Run: node scripts/check-chat-chronology.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const CHAT = "src/screens/ChatScreen.js";
const TRANSLATIONS = "src/i18n/translations.js";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const rel of [CHAT, TRANSLATIONS]) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel} is missing — this check reads it`);
  }
}
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

const chat = stripComments(read(CHAT));

// 1. The list is still inverted, because every neighbour index below depends
//    on it. If this ever changes, the separators silently invert with it.
if (!/\binverted\b/.test(chat)) {
  failures.push(
    "the message list is no longer `inverted` — every older/newer neighbour " +
      "in the chronology logic is indexed on that assumption, so separators " +
      "would now introduce the wrong day",
  );
}

// 2. Neighbours are read in the inverted sense.
if (!/const older = dateOf\(messages\?\.\[index \+ 1\]\)/.test(chat)) {
  failures.push(
    "the OLDER neighbour is not messages[index + 1]; in an inverted list " +
      "that is the message rendered above, and getting it backwards dates " +
      "every separator wrongly while still looking correct",
  );
}
if (!/const newer = dateOf\(messages\?\.\[index - 1\]\)/.test(chat)) {
  failures.push(
    "the NEWER neighbour is not messages[index - 1], so the end of a run of " +
      "messages is computed against the wrong message",
  );
}

// 3. A separator marks a day CHANGE, and the oldest loaded message always
//    gets one — otherwise the top of a paginated thread has no date at all.
if (!/own && \(!older \|\| dayKeyOf\(own\) !== dayKeyOf\(older\)\)/.test(chat)) {
  failures.push(
    "the day separator does not fire on a day CHANGE plus the oldest loaded " +
      "message — either every message gets one, or the first page of a " +
      "paginated conversation opens with no date anywhere",
  );
}

// 3b. WHERE the separator is rendered, not just whether it exists.
//
//     This is the assertion the previous version of this file lacked, and
//     the gap let a visibly wrong screen pass a green suite. Every index
//     calculation above was already correct; the separator was simply drawn
//     on the wrong side of its own message.
//
//     `inverted` flips the list AND each cell, so within a cell the children
//     are laid out bottom-up. A separator written BEFORE the bubble
//     therefore appears BELOW it — on the device, "Today" sat between 03:27
//     and 03:30, two messages from the same day, appearing to introduce the
//     wrong one. Written AFTER the bubble, it lands above, which is where a
//     day label belongs in reading order.
//
//     So: in this file, "after" is correct and "before" is the bug. Any
//     change that moves the separator back above <BubbleRow> in the JSX is
//     the regression, and it fails here.
const renderItemBody = chat.slice(
  chat.search(/renderItem=\{\(\{ item, index \}\) =>/),
  chat.search(/ListEmptyComponent|\/>\s*\n\s*\{isBlocked/),
);
if (!renderItemBody.trim()) {
  failures.push(
    `${CHAT} renderItem could not be located — this check reads its JSX order`,
  );
} else {
  const bubbleClose = renderItemBody.search(/<\/BubbleRow>/);
  const separator = renderItemBody.search(/<DaySeparatorRow>/);
  if (separator === -1) {
    failures.push(
      "the day separator is no longer rendered inside renderItem",
    );
  } else if (bubbleClose === -1) {
    failures.push("BubbleRow could not be located inside renderItem");
  } else if (separator < bubbleClose) {
    failures.push(
      "the day separator is rendered BEFORE </BubbleRow>. In an inverted " +
        "list that draws it BELOW its own message, which is the exact defect " +
        "found on the device: the label appeared to introduce the following " +
        "message instead of the day it belongs to",
    );
  }
}

// 4. Restraint: one time per run, not one per bubble.
if (!/const endsRun =/.test(chat)) {
  failures.push(
    "there is no run-end calculation, which means either every bubble now " +
      "carries a timestamp or none does",
  );
}
if (!/GROUP_WINDOW_MS/.test(chat)) {
  failures.push(
    "the grouping window is gone — consecutive messages from one sender " +
      "hours apart would be treated as a single run and share one time",
  );
}
if (!/const showTime = Boolean\(own && endsRun\)/.test(chat)) {
  failures.push(
    "the timestamp is not gated on the run ending, so the restraint this " +
      "was designed around is lost",
  );
}

// 5. A message whose serverTimestamp has not resolved has no time to show.
if (!/const dateOf = \(message\) => message\?\.createdAt\?\.toDate\?\.\(\) \?\? null/.test(chat)) {
  failures.push(
    "dateOf no longer returns null for an unresolved createdAt — a pending " +
      "message would render Invalid Date where its time should be",
  );
}

// 6. Locale follows the reader.
if (!/const messageLocale = language === "en" \? "en-GB" : "fr-FR"/.test(chat)) {
  failures.push(
    "chat times and dates are not chosen from the reader's language — a " +
      "hard-coded locale is how 'As of 6 septembre' reached an English " +
      "screen on the pharmacy detail",
  );
}
for (const formatter of ["timeFormatter", "dayFormatter"]) {
  if (!new RegExp(`const ${formatter} = useMemo\\(`).test(chat)) {
    failures.push(
      `${formatter} is not memoised; Intl.DateTimeFormat construction is the ` +
        `expensive half of formatting and this renders once per row`,
    );
  }
}
if (/new Intl\.DateTimeFormat\((["'])(fr-FR|en-GB|en-US)\1/.test(chat)) {
  failures.push(
    "a chat formatter is constructed against a literal locale rather than " +
      "messageLocale — that formatter cannot follow the reader",
  );
}

// 7. Today and Yesterday are named, in both languages.
const translations = read(TRANSLATIONS);
for (const key of ["chatDateToday", "chatDateYesterday"]) {
  const count = [...translations.matchAll(new RegExp(`\\b${key}:`, "g"))].length;
  if (count < 2) {
    failures.push(
      `${key} is defined ${count} time(s) in translations.js; en and fr each ` +
        `need it or a separator reads as a raw key`,
    );
  }
  if (!new RegExp(`t\\("${key}"\\)`).test(chat)) {
    failures.push(`${key} is never used — the named-day branch is dead`);
  }
}

// 8. Bubble bodies were not disturbed. The time lives beside them.
if (!/const MetaColumn = styled\.View/.test(chat)) {
  failures.push(
    "MetaColumn is gone — the timestamp has moved inside the bubble, where " +
      "an image message has no room for it that is not on the photograph",
  );
}

if (failures.length === 0) {
  console.log(
    "clean: days are announced once, a run of messages carries one time, and " +
      "both follow the reader's language",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
