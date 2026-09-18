#!/usr/bin/env node
//
// Whose face is on screen, and what happens when it will not load.
//
// Three places show a small circle — the conversation header, each inbox
// row, each review — and each got it wrong in a different way: the header
// and the rows only ever drew an initial, and the review card drew an empty
// circle when a photoUrl was present but dead.
//
// Two rules, and both are easy to break invisibly:
//
//   * the face is the OTHER participant's, never the reader's. Getting this
//     wrong shows you your own photograph in every conversation, which looks
//     like a rendering quirk and is actually a privacy-shaped bug — you
//     cannot tell who you are talking to.
//   * a photo is preferred, an initial is the fallback, and "fails to load"
//     is a fallback case rather than an unhandled one. An <Image> whose
//     source 404s renders NOTHING — no glyph, no error, no log.
//
// Run: node scripts/check-profile-avatars.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const AVATAR = "src/components/PublicAvatar.js";
const CHAT = "src/screens/ChatScreen.js";
const LIST = "src/screens/ChatListScreen.js";
const PROFILE = "src/screens/SellerProfileScreen.js";
const HOOK = "src/hooks/usePublicProfiles.js";

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name}: ${detail}`);
};

// ── Drive PublicAvatar ─────────────────────────────────────────────────
//
// Stubbed React, so the component's own decision is exercised rather than
// described. What comes back is which branch it took.
function renderAvatar({ photoUrl, name }) {
  const babel = require("@babel/core");
  // JSX cannot go through new Function raw, so it is compiled with the
  // CLASSIC runtime and React.createElement is stubbed — the returned tree is
  // then a plain object and the branch the component took is readable from it.
  const compiled = babel.transformSync(
    read(AVATAR)
      .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "")
      .replace(/export function /g, "function "),
    {
      filename: "PublicAvatar.js",
      presets: [[require.resolve("@babel/preset-react"), { runtime: "classic" }]],
      babelrc: false,
      configFile: false,
    },
  ).code;

  let failed = false;
  const useState = () => [failed, (next) => { failed = next; }];
  let effectDeps = null;
  const useEffect = (fn, deps) => { effectDeps = deps; };
  // Every styled.X becomes a marker object; what matters is which one was
  // rendered and with what props, not how it is styled.
  const styled = new Proxy({}, {
    get: (_t, tag) => () => ({ __tag: String(tag) }),
  });
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props ?? {}), children: children.length === 1 ? children[0] : children },
    }),
  };

  const sandbox = { module: { exports: {} } };
  new Function(
    "module", "React", "useState", "useEffect", "styled", "fontFamily",
    `${compiled}\nmodule.exports = { PublicAvatar };`,
  )(sandbox.module, React, useState, useEffect, styled, { bold: "b" });

  const { PublicAvatar } = sandbox.module.exports;
  const render = (extra = {}) => {
    const out = PublicAvatar({ photoUrl, name, ...extra });
    const isPhoto = Boolean(out?.props?.source);
    return {
      isPhoto,
      initial: isPhoto ? null : out?.props?.children?.props?.children,
      onError: out?.props?.onError,
      // Shape and letter size, as actually handed to the styled components.
      corner: out?.props?.corner,
      letter: isPhoto ? null : out?.props?.children?.props?.letter,
    };
  };
  const first = render();
  return {
    ...first,
    fail: () => first.onError?.(),
    rerender: render,
    effectDeps: () => effectDeps,
  };
}

// A. photo present -> photo
{
  const r = renderAvatar({ photoUrl: "https://x/a.jpg", name: "Agossou" });
  check("A", r.isPhoto, "a present photoUrl did not render the photo");
}

// B. photo absent -> initial, and the initial is right
{
  const r = renderAvatar({ photoUrl: null, name: "Agossou" });
  check("B", !r.isPhoto, "a missing photoUrl still rendered an image");
  check("B", r.initial === "A", `initial was ${JSON.stringify(r.initial)}`);
}

// C. no name at all -> "?" rather than blank or "undefined"
for (const name of [null, undefined, "", "   "]) {
  const r = renderAvatar({ photoUrl: null, name });
  check(
    "C",
    r.initial === "?",
    `name ${JSON.stringify(name)} produced ${JSON.stringify(r.initial)} ` +
      `instead of "?" — a blank circle reads as a broken avatar`,
  );
}
// A leading space must not blank the circle.
check(
  "C",
  renderAvatar({ photoUrl: null, name: "  Agossou" }).initial === "A",
  "a name with a leading space produced the wrong initial",
);

// D. THE ONE THIS COMPONENT EXISTS FOR: a url that fails to load.
{
  const r = renderAvatar({ photoUrl: "https://x/dead.jpg", name: "Agossou" });
  check("D", r.isPhoto, "precondition: should start as a photo");
  r.fail(); // what onError does
  const after = r.rerender();
  check(
    "D",
    !after.isPhoto,
    "after the image failed to load the component still rendered the Image — " +
      "an <Image> whose source 404s draws nothing at all, so this is the " +
      "empty circle that stays empty forever",
  );
}

// E. The failure must be per-instance, and must reset when the url changes.
{
  const source = stripComments(read(AVATAR));
  check(
    "E",
    /useEffect\(\s*\(\)\s*=>\s*\{\s*setFailed\(false\);\s*\}\s*,\s*\[photoUrl\]\)/.test(
      source.replace(/\s+/g, " ").replace(/ /g, "\\s*") ? source : source,
    ) || /setFailed\(false\)/.test(source),
    "nothing resets the failed flag when photoUrl changes — a recycled " +
      "FlatList row would inherit the previous person's failure",
  );
  check(
    "E",
    /\[photoUrl\]/.test(source),
    "the reset is not keyed on photoUrl, so a new person in a recycled row " +
      "keeps the old one's failed state",
  );
  // Nothing may be written back to the shared cache on failure.
  check(
    "E",
    !/profileCache|usePublicProfiles/.test(source),
    "PublicAvatar touches the shared profile cache — one flaky load would " +
      "then mark that person pictureless on every other screen",
  );
}

// K. Shape and letter default to a circle scaled to the box, and BOTH are
//    overridable. The defaults are what the inbox, the chat header and the
//    review rows render; the overrides are what keeps the 156px profile
//    header a rounded square with a small letter. Breaking either default
//    squares off every small avatar in the app, which is why it is driven
//    here rather than left to the one caller that passes them.
{
  const circle = renderAvatar({ photoUrl: null, name: "Agossou" });
  check(
    "K",
    circle.corner === 34 / 2,
    `default corner was ${circle.corner}; with no radius passed every avatar ` +
      `must stay a circle (size / 2)`,
  );
  check(
    "K",
    circle.letter === Math.round(34 * 0.42),
    `default letter was ${circle.letter}; it must stay scaled to the box`,
  );
  const square = renderAvatar({ photoUrl: null, name: "Agossou" }).rerender({
    size: 156,
    radius: 22,
    initialSize: 24,
  });
  check("K", square.corner === 22, `an explicit radius was ignored (${square.corner})`);
  check("K", square.letter === 24, `an explicit initialSize was ignored (${square.letter})`);
}

// ── Receiver selection ─────────────────────────────────────────────────
//
// The predicate itself, driven. Both screens use the same shape, so this is
// the rule they share stated once.
{
  const otherOf = (participantIds, me) =>
    participantIds.find((id) => id !== me) ?? null;
  check("F", otherOf(["A", "B"], "A") === "B", "viewed by A, receiver should be B");
  check("F", otherOf(["A", "B"], "B") === "A", "viewed by B, receiver should be A");
  check("F", otherOf(["B", "A"], "A") === "B", "order must not matter");
  // A thread with yourself has no other party; it must not resolve to you.
  check("F", otherOf(["A"], "A") === null, "a single-participant thread must resolve to null, not to self");
}

// And that both screens actually use it.
{
  const chat = stripComments(read(CHAT));
  const list = stripComments(read(LIST));
  check(
    "G",
    /participantIds\?\.find\(\(id\) => id !== user\?\.uid\)/.test(chat),
    "ChatScreen no longer derives otherUid by excluding the reader",
  );
  check(
    "G",
    /participantIds\?\.find\(\(id\) => id !== user\?\.uid\)/.test(list),
    "ChatListScreen no longer derives the counterpart by excluding the reader",
  );
  // The header must read the OTHER participant's projection, not the reader's.
  check(
    "G",
    /photoUrl=\{otherStats\?\.photoUrl\}/.test(chat),
    "the chat header's avatar is not sourced from otherStats — sourcing it " +
      "from the reader's own stats shows you your own face in every thread",
  );
  check(
    "G",
    !/photoUrl=\{(myStats|userStats|stats)\?\.photoUrl\}/.test(chat),
    "the chat header appears to use the reader's own stats for the avatar",
  );
}

// ── The seller profile HEADER ──────────────────────────────────────────
//
// This one shipped broken and nothing caught it, which is the argument for
// the block. openOtherProfile navigates with sellerId and sellerName only, so
// a header that reads its photo from the route alone falls to an initial for
// every profile opened from a conversation — and on a profile with no
// reviews that initial is the only avatar on screen, so the whole screen
// reads as "pictures are not working" while the review cards are correct.
{
  const profile = stripComments(read(PROFILE));

  check(
    "N",
    /photoUrl=\{sellerPhotoUrl \?\? stats\?\.photoUrl\}/.test(profile),
    "the profile header no longer falls back to the live public projection. " +
      "The route parameter is optional and usually absent, so a header that " +
      "depends on it alone shows an initial for somebody whose photograph " +
      "the screen is already subscribed to",
  );
  // The fallback must come from the subscription the screen ALREADY has.
  check(
    "N",
    (profile.match(/useSellerStats\(/g) ?? []).length === 1,
    "SellerProfileScreen holds more than one sellerStats subscription — the " +
      "header must reuse the one the rating line already opened, not add a read",
  );
  check(
    "N",
    /<PublicAvatar/.test(profile.slice(profile.indexOf("<Header>"), profile.indexOf("<SellerName"))),
    "the header avatar is not PublicAvatar, so it has no image-error " +
      "fallback and a dead photoUrl leaves an empty square",
  );
  // The header is NOT the small circle used by the inbox and the reviews.
  const header = profile.slice(profile.indexOf("<HeaderAvatar>"), profile.indexOf("</HeaderAvatar>"));
  check("N", /size=\{PHOTO_SIZE\}/.test(header), "the header avatar lost its large size");
  check(
    "N",
    /radius=\{radius\.xl\}/.test(header) && /initialSize=\{24\}/.test(header),
    "the header lost its rounded-square shape or its small initial and now " +
      "renders as the inbox/review circle — a visual change, not a fix",
  );
}

// ── No N+1, anywhere ───────────────────────────────────────────────────
{
  const chat = stripComments(read(CHAT));
  const list = stripComments(read(LIST));

  // A profile lookup inside renderItem is a read per row per recycle.
  const listRender = list.slice(list.indexOf("renderItem"));
  check(
    "H",
    !/usePublicProfiles\(/.test(listRender),
    "ChatListScreen resolves profiles inside renderItem — FlatList recycles " +
      "rows, so that is a read per scroll rather than a read per person",
  );
  check(
    "H",
    /const counterpartProfiles = usePublicProfiles\(/.test(list),
    "ChatListScreen no longer resolves counterparts once for the whole list",
  );
  // ChatScreen must not look a profile up per message.
  check(
    "H",
    !/usePublicProfiles\(/.test(chat),
    "ChatScreen calls usePublicProfiles — the header already has the other " +
      "participant's projection from useSellerStats, and anything per-message " +
      "would be a lookup per bubble",
  );
  check(
    "H",
    (chat.match(/useSellerStats\(/g) ?? []).length === 1,
    "ChatScreen holds more than one sellerStats listener",
  );
}

// ── Privacy ────────────────────────────────────────────────────────────
{
  for (const rel of [AVATAR, CHAT, LIST, PROFILE, HOOK]) {
    const bare = stripComments(read(rel));
    if (/doc\(\s*firestore,\s*"sellers"/.test(bare)) {
      failures.push(
        `I: ${rel} reads sellers/{uid} directly. That document is private — ` +
          `it holds push tokens and, for company accounts, RCCM and IFU ` +
          `papers — and the rules allow it only to its owner, so an avatar ` +
          `sourced there fails for every visitor and would need the rules ` +
          `weakened to work`,
      );
    }
  }
  const hook = stripComments(read(HOOK));
  check(
    "I",
    /"sellerStats", uid/.test(hook),
    "the profile hook no longer reads the public sellerStats projection",
  );
}

// ── The shared cache ───────────────────────────────────────────────────
{
  const hook = stripComments(read(HOOK));
  check(
    "J",
    /^const profileCache = new Map\(\);$/m.test(hook),
    "the profile cache is no longer module-level — a per-instance cache " +
      "re-reads the same uid for the inbox row, the thread header and the " +
      "review, and again on every navigation back",
  );
  check(
    "J",
    /useRef\(profileCache\)/.test(hook),
    "the hook no longer uses the shared cache",
  );
  // The bug a module cache introduces, and its fix.
  check(
    "J",
    /if \(Object\.keys\(known\)\.length\) setProfiles\(known\)/.test(hook),
    "the hook does not publish already-cached profiles before its early " +
      "return — with a module-level cache a screen where every uid is " +
      "already known finds nothing missing, never calls setProfiles, and " +
      "renders initials for faces it is holding",
  );
  const cap = Number(hook.match(/const MAX_LOOKUPS = (\d+)/)?.[1] ?? 0);
  check(
    "J",
    cap >= 50 && cap <= 60,
    `MAX_LOOKUPS is ${cap}; the inbox is capped at 50 conversations, so a ` +
      `lower bound silently drops avatars off the end of the list`,
  );
}

if (failures.length === 0) {
  console.log(
    "clean: the face is the other participant's, a photo beats an initial, " +
      "a dead url falls back instead of leaving a hole, and one uid is read once",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
