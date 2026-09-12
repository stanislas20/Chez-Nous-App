#!/usr/bin/env node
//
// The unread reset in ChatScreen has to re-run when a message ARRIVES, and
// only while the reader is actually looking at the conversation.
//
// It was written with `[conversationId, user]` as its dependency list, which
// means it fired once on mount and never again. Two physical devices on
// production found what that costs: Agossou sent a message, Android rendered
// it in front of the reader with the thread open, and unreadCount for that
// reader stayed at 1. The badge sat on the one conversation they were
// demonstrably reading, and cleared only if they left and came back.
//
// Nothing failed. No rule refused anything, no write errored, every test
// passed — the write simply was never issued, because a dependency list is a
// silent contract. That is why this is a check: the defect is the ABSENCE of
// a dependency, and absence is what tests are worst at noticing.
//
// Three things are asserted:
//
//   the effect that zeroes the caller's own unreadCount still exists;
//
//   its dependency list contains the identifier tracking the newest INCOMING
//   message, so an arriving message re-runs it — and not the message list
//   itself, which would also re-run on the reader's own sends and on every
//   unrelated conversation write, writing unreadCount=0 over and over;
//
//   it is guarded by navigation focus AND app foreground state, so a message
//   arriving while the screen is merely mounted — a backgrounded app keeps
//   its listener running — is not marked read before anybody sees it.
//
// Run: node scripts/check-chat-unread-reset.js

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const root = path.join(__dirname, "..");
const FILE = path.join(root, "src", "screens", "ChatScreen.js");

const failures = [];

const ast = babel.parseSync(fs.readFileSync(FILE, "utf8"), {
  filename: FILE,
  presets: [require.resolve("babel-preset-expo")],
  babelrc: false,
  configFile: false,
});

// The effect is identified by what it writes, not by its position: a
// computed key `unreadCount.${user.uid}` set to 0.
const RESET_KEY = /unreadCount\.\$\{[^}]*\}/;

let found = null;

const walk = (node, ancestors = []) => {
  if (!node || typeof node !== "object" || found) return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, ancestors));

  if (
    node.type === "CallExpression" &&
    node.callee?.name === "useEffect" &&
    node.arguments.length === 2
  ) {
    const source = babel.transformFromAstSync(
      babel.types.file(babel.types.program([babel.types.expressionStatement(node)])),
      null,
      { code: true, comments: false, configFile: false, babelrc: false },
    ).code;

    if (RESET_KEY.test(source) && /:\s*0/.test(source)) {
      const deps = node.arguments[1];
      found = {
        deps:
          deps?.type === "ArrayExpression"
            ? deps.elements.map((e) => e?.name ?? "(expression)")
            : null,
        source,
      };
      return;
    }
  }

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    walk(node[key], ancestors);
  }
};

walk(ast);

if (!found) {
  failures.push(
    "could not find the useEffect that resets unreadCount.<uid> to 0 in " +
      "ChatScreen — either it was removed, in which case opening a " +
      "conversation no longer clears its badge, or this check has gone blind " +
      "and would pass on anything",
  );
} else {
  if (!found.deps) {
    failures.push(
      "the unread reset effect has no dependency array, so it now writes " +
        "unreadCount=0 on every render of the chat screen",
    );
  } else {
    // An arriving message must re-run it.
    const tracksIncoming = found.deps.some((d) =>
      /latestIncoming|lastIncoming|newestIncoming|incomingMessageId/i.test(d),
    );
    if (!tracksIncoming) {
      failures.push(
        "the unread reset effect's dependencies are [" +
          found.deps.join(", ") +
          "] — none of them tracks the newest INCOMING message, so a message " +
          "that arrives while the conversation is open is rendered in front " +
          "of the reader and never marked read, exactly the defect two " +
          "physical devices found on production",
      );
    }
    // Depending on the whole list would re-fire on the reader's own sends.
    if (found.deps.includes("messages")) {
      failures.push(
        "the unread reset effect depends on the whole `messages` list, which " +
          "re-fires on the reader's OWN outgoing messages and on every " +
          "unrelated conversation write — a redundant unreadCount=0 write " +
          "each time",
      );
    }
    // Focus and foreground must both gate it.
    for (const guard of ["isFocused", "appActive"]) {
      if (!found.deps.includes(guard)) {
        failures.push(
          `the unread reset effect does not depend on \`${guard}\`, so it ` +
            `cannot tell whether the reader is actually viewing this ` +
            `conversation`,
        );
      }
      if (!new RegExp(`!\\s*${guard}`).test(found.source)) {
        failures.push(
          `the unread reset effect does not bail out on \`!${guard}\` — a ` +
            `message arriving while the screen is merely mounted would be ` +
            `marked read before anybody saw it`,
        );
      }
    }
  }
}

if (failures.length === 0) {
  console.log(
    "clean: the chat unread reset re-runs on an incoming message and only " +
      "while the conversation is focused and the app is in the foreground",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
