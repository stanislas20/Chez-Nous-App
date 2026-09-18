#!/usr/bin/env node
//
// One listing is one size, on every screen that shows a grid of them.
//
// ListingCard has two size knobs and they are easy to get out of step:
//
//   flush   49.6% wide, square thumbnail, no radius, 2px gutter
//   (none)  47% wide, 4:3 thumbnail, rounded, spacing.lg gutter
//   full    the whole row, 16:9 — a banner, not a grid cell
//
// Every grid screen already passed `flush`. What differed was `full`:
// Local gave the whole row to any category holding exactly one listing,
// and ForYou did the same when the entire feed came to one card. The
// seller profile never did. Measured on the handset:
//
//   seller profile   531px   49.2%
//   ForYou           531px   49.2%
//   Local           1070px   99.1%    <- one-listing section
//
// So the same listing was a square on a profile and a banner on Local, and
// the grid changed size as you scrolled. The empty half-row that `full`
// existed to avoid is the smaller price, and it is one the seller profile
// had been paying all along without looking broken.
//
// CategoryListingsScreen is deliberately NOT in this list. Drilling into a
// category is a different context — the reader asked for that one thing —
// and it keeps its own rule until somebody decides otherwise.
//
// Run: node scripts/check-listing-card-size.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");

// The grid screens that must agree with one another.
const GRID_SCREENS = [
  "src/screens/LocalScreen.js",
  "src/screens/ForYouScreen.js",
  "src/screens/SellerProfileScreen.js",
  "src/screens/SavedListingsScreen.js",
  "src/screens/RecentlyViewedScreen.js",
];

const failures = [];

for (const rel of GRID_SCREENS) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel} is missing — this check reads it`);
    continue;
  }
  const source = stripComments(fs.readFileSync(abs, "utf8"));

  // Find every <ListingCard ...> element and read its props. Regex over JSX
  // is crude, but the thing being asserted is the presence of one word
  // inside one tag, which is exactly what it can see.
  const tags = source.match(/<ListingCard[\s\S]*?\/>/g) ?? [];
  if (tags.length === 0) {
    failures.push(
      `${rel} renders no ListingCard — either the grid was rewritten, or ` +
        `this check is now pointed at the wrong file and is asserting ` +
        `nothing at all`,
    );
    continue;
  }

  for (const tag of tags) {
    const oneLine = tag.replace(/\s+/g, " ").slice(0, 70);

    if (!/\bflush\b/.test(tag)) {
      failures.push(
        `${rel}: a ListingCard is missing \`flush\`, so it renders 47% wide ` +
          `with a 4:3 thumbnail and rounded corners while its neighbours are ` +
          `49.6% squares — "${oneLine}"`,
      );
    }
    if (/\bfull\b/.test(tag)) {
      failures.push(
        `${rel}: a ListingCard passes \`full\`, which gives it the whole row ` +
          `as a 16:9 banner. That is the inconsistency this file exists to ` +
          `prevent: the same listing then renders at 99% here and 49.2% on ` +
          `a seller's profile — "${oneLine}"`,
      );
    }
  }
}

// An ad shares the grid with listings, so it has to move with them.
{
  const rel = "src/screens/ForYouScreen.js";
  const source = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));
  const ads = source.match(/<AdCard[\s\S]*?\/>/g) ?? [];
  for (const tag of ads) {
    if (!/\bflush\b/.test(tag)) {
      failures.push(
        `${rel}: an AdCard in the feed grid is missing \`flush\` — a paid ` +
          `slot that is a different size from the listings around it reads ` +
          `as a broken row rather than as an advert`,
      );
    }
  }
}

// The knobs themselves still have to mean what the comments above claim.
{
  const card = stripComments(
    fs.readFileSync(path.join(root, "src/components/ListingCard.js"), "utf8"),
  );
  const ratio = card.match(/FLUSH_CARD_WIDTH_RATIO = ([\d.]+)/);
  if (!ratio) {
    failures.push(
      "FLUSH_CARD_WIDTH_RATIO is gone from ListingCard — that constant is " +
        "what keeps the grid and the Pour vous rails at one width",
    );
  } else if (Math.abs(Number(ratio[1]) - 0.496) > 0.001) {
    failures.push(
      `FLUSH_CARD_WIDTH_RATIO is ${ratio[1]}; two cards plus the 2px gutter ` +
        `no longer fill the row, so the grid has either a gap down the ` +
        `middle or an overlap`,
    );
  }
  if (!/\$\{FLUSH_CARD_WIDTH_RATIO \* 100\}%/.test(card)) {
    failures.push(
      "the flush card's width is no longer derived from " +
        "FLUSH_CARD_WIDTH_RATIO — a hard-coded percentage here is exactly " +
        "how the grid and the rails drifted apart the first time",
    );
  }
}

// The Pour vous rails are horizontal, so they cannot use a percentage —
// they multiply the shared ratio by the window width. What must not come
// back is a magic number.
{
  const rel = "src/screens/ForYouScreen.js";
  const source = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));
  const rail = source.match(/const RAIL_CARD_WIDTH = ([^;]+);/s);
  if (!rail) {
    failures.push(`${rel}: RAIL_CARD_WIDTH is gone`);
  } else if (!/FLUSH_CARD_WIDTH_RATIO/.test(rail[1])) {
    failures.push(
      `${rel}: RAIL_CARD_WIDTH is a literal again (${rail[1].trim().slice(0, 40)}) ` +
        `rather than the grid card's width. That is the original defect: a ` +
        `listing was 168px in "Deals ending soon" and ~190px for the same ` +
        `listing on a seller's profile`,
    );
  }
  // The verified-businesses carousel is deliberately its own size and is
  // NOT part of this rule — its marquee scrolls by exactly one card plus
  // gap, so tying it to the grid would desync the loop.
  if (!/const BUSINESS_CARD_WIDTH = 220;/.test(source)) {
    failures.push(
      `${rel}: BUSINESS_CARD_WIDTH changed. The businesses carousel is ` +
        `intentionally separate from the listing grid — its width is set by ` +
        `legal company names needing two lines, and BUSINESS_ITEM_WIDTH ` +
        `derives the marquee's scroll step from it`,
    );
  }
}

if (failures.length === 0) {
  console.log(
    "clean: every grid screen renders the same 49.6% square card, and no " +
      "screen promotes a lone listing to a full-width banner",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
