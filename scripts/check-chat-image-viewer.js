#!/usr/bin/env node
//
// Tapping an image in a conversation has to open it, and that has to stay
// separate from the long-press that deletes it.
//
// The bubble carried one prop for both: `disabled={!isMine}`, there so the
// recipient could not long-press somebody else's message into the delete
// prompt. It also swallowed every tap — and since no onPress existed at all,
// an image could not be opened by either party. A photograph arrived in the
// conversation and could only ever be looked at as a thumbnail, on both
// platforms, with no error and nothing in any log. Two physical devices found
// it by tapping.
//
// The two permissions are different questions with different answers:
//
//   VIEW  — either participant, for any image
//   DELETE — the sender only, for their own message
//
// collapsing them into one `disabled` is what produced a feature that looked
// present and was not. So this asserts they stay apart:
//
//   the image bubble has an onPress that opens the viewer;
//   the viewer is the shared ImageLightbox, not a second implementation
//     (check-one-image-viewer.js guards the app-wide version of that rule);
//   onLongPress is still gated on the message being the reader's own;
//   `disabled` does not suppress taps on an image somebody else sent.
//
// Run: node scripts/check-chat-image-viewer.js

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const root = path.join(__dirname, "..");
const FILE = path.join(root, "src", "screens", "ChatScreen.js");
const source = fs.readFileSync(FILE, "utf8");

const failures = [];

const ast = babel.parseSync(source, {
  filename: FILE,
  presets: [require.resolve("babel-preset-expo")],
  babelrc: false,
  configFile: false,
});

// Find the JSX element that renders a message bubble: the one carrying
// noPadding={Boolean(item.imageUrl)}. Identified by a prop rather than by
// component name so renaming the styled component does not blind this.
let bubble = null;

const walk = (node) => {
  if (!node || typeof node !== "object" || bubble) return;
  if (Array.isArray(node)) return node.forEach(walk);

  if (node.type === "JSXOpeningElement") {
    const props = {};
    for (const attr of node.attributes) {
      if (attr.type !== "JSXAttribute") continue;
      props[attr.name.name] = attr;
    }
    if (props.noPadding && props.delayLongPress) {
      bubble = { props, node };
      return;
    }
  }

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    walk(node[key]);
  }
};

walk(ast);

const codeOf = (attr) =>
  attr ? source.slice(attr.value.start, attr.value.end) : "";

if (!bubble) {
  failures.push(
    "could not find the chat message bubble (the element with both " +
      "noPadding and delayLongPress) — this check is reading nothing and " +
      "would pass on anything",
  );
} else {
  const onPress = codeOf(bubble.props.onPress);
  const onLongPress = codeOf(bubble.props.onLongPress);
  const disabled = codeOf(bubble.props.disabled);

  // 1. Tapping an image opens something.
  if (!bubble.props.onPress) {
    failures.push(
      "the chat message bubble has no onPress — tapping an image message " +
        "does nothing, which is the defect two devices found: the photo is " +
        "visible as a thumbnail and cannot be opened by anybody",
    );
  } else if (!/imageUrl/.test(onPress)) {
    failures.push(
      "the chat bubble's onPress does not reference imageUrl, so it is not " +
        "opening the image message",
    );
  }

  // 2. Through the shared viewer.
  if (!/ImageLightbox/.test(source)) {
    failures.push(
      "ChatScreen does not use ImageLightbox — chat images must open in the " +
        "same viewer as listing photos rather than a second implementation",
    );
  }

  // 3. Delete stays the sender's alone — but the MECHANISM moved, so this
  //    check moved with it.
  //
  //    Long press used to mean "delete", so gating the gesture on isMine was
  //    the whole control and this file asserted exactly that. Long press now
  //    opens an action sheet carrying Reply, Copy and Share, which a
  //    recipient is entitled to use, so gating the GESTURE on isMine would
  //    put those out of reach on every message somebody sends you — the same
  //    over-broad suppression this file was written about.
  //
  //    Eligibility therefore moved inside: actionsFor() decides which rows a
  //    message offers, and Firestore's update rule refuses an edit or a
  //    tombstone from anyone but the sender whatever the sheet shows. The
  //    property is unchanged and is asserted in two better places —
  //    check-message-actions.js drives actionsFor directly, and rules.test.js
  //    runs the refusal against the real engine. What belongs here is that
  //    the sheet is what the gesture opens, and that the delete handler still
  //    refuses a message the reader did not send.
  if (!bubble.props.onLongPress) {
    failures.push(
      "the chat message bubble has no onLongPress — the action sheet cannot " +
        "be opened, so Reply, Copy, Share, Edit and Delete are unreachable",
    );
  } else if (!/openActions/.test(onLongPress)) {
    failures.push(
      "the chat bubble's onLongPress does not open the action sheet — long " +
        "press is the only way into these actions",
    );
  }
  if (!/message\.senderId !== user\?\.uid/.test(source)) {
    failures.push(
      "handleDeleteMessage no longer refuses a message the reader did not " +
        "send — the sheet already hides Delete there, but a guard that " +
        "depends only on what was rendered is not a guard",
    );
  }

  // 4. And `disabled` must not take the tap away again.
  //
  //    `!isMine` on its own is what suppressed it before, and the fix is no
  //    longer "also consider imageUrl" but "do not consider who sent it at
  //    all": every live bubble is pressable so a received message can be
  //    long-pressed, and only a tombstone is inert.
  if (bubble.props.disabled && /isMine/.test(disabled)) {
    failures.push(
      "the chat bubble's disabled consults isMine — a disabled Pressable " +
        "swallows the long press as well as the tap, so this takes the image " +
        "viewer away from the recipient AND puts Reply, Copy and Share out " +
        "of reach on every received message",
    );
  }
}

if (failures.length === 0) {
  console.log(
    "clean: chat images open in ImageLightbox for either participant, and " +
      "deleting stays the sender's own",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
