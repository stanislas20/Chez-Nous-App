#!/usr/bin/env node
//
// Choosing an image in a conversation must not send it.
//
// It did. `handlePickFromLibrary` and `handleTakePhoto` called
// uploadAndSendImage on the asset the moment the picker returned, so one tap
// in the gallery uploaded to Storage, wrote a Firestore message, bumped the
// conversation and pushed a notification. The first time the sender saw what
// they had actually chosen was after the other person could already see it,
// and there was no cancel — the only remedy was to delete a message the
// recipient had been notified about.
//
// The corrected flow keeps the asset local until the sender says so:
//
//   pick    -> setPendingImage(asset)      nothing leaves the phone
//   change  -> setPendingImage(other)      the first was never uploaded
//   discard -> setPendingImage(null)       no Storage object, no message
//   SEND    -> uploadAndSendImage(asset)   the only path to the network
//
// So this asserts the pickers stage rather than send, and that there is
// exactly one route from a chosen image to Storage. Without the first the
// preview is decorative; without the second a second route could reappear
// and bypass it.
//
// Run: node scripts/check-chat-image-preview.js

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const FILE = path.join(root, "src", "screens", "ChatScreen.js");
const source = fs.readFileSync(FILE, "utf8");

const failures = [];

// Body of `const <name> = ... {` up to its matching brace. Brace counting
// rather than a regex, because these bodies contain braces of their own and
// a lazy match stops at the first one.
function bodyOf(name) {
  const start = source.search(new RegExp(`const\\s+${name}\\s*=`));
  if (start < 0) return null;
  const open = source.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

const PICKERS = ["handlePickFromLibrary", "handleTakePhoto"];

for (const name of PICKERS) {
  const body = bodyOf(name);
  if (!body) {
    failures.push(
      `could not find ${name} in ChatScreen — this check is reading nothing ` +
        `and would pass on anything`,
    );
    continue;
  }
  if (/uploadAndSendImage\s*\(/.test(body)) {
    failures.push(
      `${name} calls uploadAndSendImage directly, so choosing an image ` +
        `uploads and posts it with no preview and no way to cancel — the ` +
        `defect this flow exists to prevent`,
    );
  }
  if (!/setPendingImage\s*\(/.test(body)) {
    failures.push(
      `${name} does not stage the asset with setPendingImage, so the ` +
        `preview step cannot appear`,
    );
  }
}

// Exactly one route to the network, and it is the explicit send.
const sendBody = bodyOf("handleSendPendingImage");
if (!sendBody) {
  failures.push(
    "handleSendPendingImage is missing — there is no explicit send step " +
      "between choosing an image and uploading it",
  );
} else if (!/uploadAndSendImage\s*\(/.test(sendBody)) {
  failures.push(
    "handleSendPendingImage does not call uploadAndSendImage, so the Send " +
      "button does not actually send",
  );
}

// Count invocations. The declaration reads `const uploadAndSendImage =
// async (asset) => {`, so the name is followed by ` =` and not by `(` —
// it does not match this pattern and must not be subtracted. Subtracting it
// was a bug in this check, which reported 0 invocations on correct code and
// was caught by mutation testing rather than by reading it.
const invocations = [...source.matchAll(/uploadAndSendImage\s*\(/g)].length;
if (invocations !== 1) {
  failures.push(
    `uploadAndSendImage is invoked ${invocations} time(s); exactly one is ` +
      `expected (the explicit Send). More than one means a second path to ` +
      `Storage exists that does not pass through the preview`,
  );
}

// The composer has to branch on the staged image, or the state is never seen.
if (!/\{pendingImage \?/.test(source)) {
  failures.push(
    "the composer does not branch on pendingImage, so a chosen image is " +
      "held in state and never shown",
  );
}

if (failures.length === 0) {
  console.log(
    "clean: choosing a chat image stages it locally; the only route to " +
      "Storage is the explicit Send",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
