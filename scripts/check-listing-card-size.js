#!/usr/bin/env node
//
// One listing is one size, on every screen that shows a grid of them —
// with one deliberate exception.
//
// ListingCard has two size knobs and they are easy to get out of step:
//
//   flush   49.6% wide, square thumbnail, no radius, 2px gutter
//   (none)  47% wide, 4:3 thumbnail, rounded, spacing.lg gutter
//   full    the whole row, 4:3 — a banner, not a grid cell
//
// Every grid screen passes `flush`. What differs is `full`. It used to be
// banned outright, because Local gave the whole row to any category holding
// exactly one listing while the seller profile never did, and the same
// listing was a square in one place and a banner in the other. Measured on
// the handset:
//
//   seller profile   531px   49.2%
//   ForYou           531px   49.2%
//   Local           1070px   99.1%    <- one-listing section
//
// Local now takes that trade back, on purpose and on its own: a category
// holding one listing (Vehicles, today) left most of a row empty, which
// reads as a layout that failed rather than as a category with one thing in
// it. The banner shape is the accepted cost, and it is the same rule
// CategoryListingsScreen has always applied when an aisle holds one thing.
//
// So the ban stands everywhere else, and on Local the rule is narrower and
// harder to hold: EXACTLY ONE listing in the section, never a trailing odd
// card that happens to be alone on the last row. Those two are one character
// apart in the source and look identical until a category has three
// listings, so the predicate is not read here — it is pulled out of the JSX
// and RUN against rows the screen's own chunkIntoRows built.
//
// Run: node scripts/check-listing-card-size.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");

// The grid screens that must agree with one another. Every one of them
// renders the 49.6% square and nothing else — Local is held to its own,
// stricter rule further down rather than being exempt from having one.
const GRID_SCREENS = [
  "src/screens/ForYouScreen.js",
  "src/screens/SellerProfileScreen.js",
  "src/screens/SavedListingsScreen.js",
  "src/screens/RecentlyViewedScreen.js",
];

const LOCAL = "src/screens/LocalScreen.js";

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
          `as a 4:3 banner. That is the inconsistency this file exists to ` +
          `prevent: the same listing then renders at 99% here and 49.2% on ` +
          `a seller's profile — "${oneLine}"`,
      );
    }
  }
}

// ── Local's lone-card rule, executed ───────────────────────────────
//
// `full={section.total === 1}` and `full={row.length === 1}` read the same
// at a glance and differ for every category with an odd number of listings:
// the second turns the third card of three into a banner because it happens
// to be alone on the last row. So the screen's grouping and its predicate
// are both lifted out and run over 1, 2, 3 and 7 listings.
{
  const source = stripComments(fs.readFileSync(path.join(root, LOCAL), "utf8"));

  const tags = source.match(/<ListingCard[\s\S]*?\/>/g) ?? [];
  if (tags.length === 0) {
    failures.push(`${LOCAL} renders no ListingCard — this check is asserting nothing`);
  } else {
    tags.forEach((tag) => {
      if (!/\bflush\b/.test(tag))
        failures.push(`${LOCAL}: a ListingCard is missing \`flush\``);
      // `full` on its own is every card in every category, not the lone
      // one. It has to be a condition, and the cases below decide which.
      if (/\bfull\b(?!\s*=)/.test(tag))
        failures.push(
          `${LOCAL}: a ListingCard passes \`full\` unconditionally, which makes ` +
            `every card in every category a full-width banner`,
        );
    });

    const columns = /const GRID_COLUMNS = (\d+);/.exec(source);
    const chunkSrc = /function chunkIntoRows\(items\) \{[\s\S]*?\n\}/.exec(source);
    const expr = /full=\{([^}]*)\}/.exec(tags.join("\n"));

    if (!columns) failures.push(`${LOCAL}: GRID_COLUMNS is gone`);
    if (!chunkSrc) failures.push(`${LOCAL}: chunkIntoRows is gone — the grid is built some other way now`);
    if (!expr)
      failures.push(
        `${LOCAL}: no ListingCard passes \`full\`, so a category holding one ` +
          `listing is back to a half-empty row`,
      );

    if (columns && chunkSrc && expr) {
      // eslint-disable-next-line no-new-func
      const chunkIntoRows = new Function(
        "GRID_COLUMNS",
        `${chunkSrc[0]}\nreturn chunkIntoRows;`,
      )(Number(columns[1]));

      // section, row and listing are all bound, so a predicate that reaches
      // for the wrong one fails on what it decided rather than on a
      // ReferenceError — which would fire just as loudly if this were
      // testing nothing.
      // eslint-disable-next-line no-new-func
      const isFull = new Function("section", "row", "listing", `return (${expr[1]});`);

      // How the screen renders a category of n: group, cap at three rows
      // while browsing everything, then ask the predicate per card.
      const widths = (n) => {
        const items = Array.from({ length: n }, (_, i) => ({ id: `l${i}` }));
        const section = { total: items.length };
        const rows = chunkIntoRows(items).slice(0, 3);
        return rows.map((row) =>
          row.map((listing) => {
            try {
              return isFull(section, row, listing) ? "full" : "column";
            } catch (error) {
              return `threw: ${error.message}`;
            }
          }),
        );
      };

      const eq = (what, actual, expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          failures.push(
            `${what} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
          );
      };

      // The grouping itself, so the cases below mean what they say. If
      // three listings ever stopped producing a 2+1 split, the trailing-odd
      // case would be testing nothing.
      eq(
        "three listings are chunked 2 + 1",
        chunkIntoRows([1, 2, 3]).map((r) => r.length),
        [2, 1],
      );

      eq("a category of one is expanded", widths(1), [["full"]]);
      eq("a category of two keeps column width", widths(2), [["column", "column"]]);
      // The whole point: the third card is alone on its row and stays a
      // column anyway.
      eq(
        "a category of three never promotes its trailing card",
        widths(3),
        [["column", "column"], ["column"]],
      );
      // Capped sections show three rows of a larger total; none of them is
      // a lone card either.
      eq(
        "a capped category stays column width throughout",
        widths(7),
        [["column", "column"], ["column", "column"], ["column", "column"]],
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
  // Local's rule is only worth asserting if `full` still expands. Without
  // this, a one-line edit inside ListingCard could quietly make `full` mean
  // column width again and every case above would keep passing.
  if (!/props\.full\s*\?\s*"100%"/.test(card)) {
    failures.push(
      "`full` no longer widens the card to 100% — Local's one-listing " +
        "category is back to a half-empty row and nothing else here would " +
        "have said so",
    );
  }
  // 4:3, and specifically not 16:9. The wide box was tried and it cropped
  // the subject out: `cover` across a square phone photograph keeps the
  // middle band and discards the crown of the cap and the head of the
  // animal, on the one card in the category that had the whole row to
  // itself. Nor 1:1, which at full width is as tall as the screen is wide.
  const fullRatio = /props\.full \? "([^"]+)"/.exec(card);
  if (!fullRatio) {
    failures.push("`full` no longer sets a thumbnail aspect ratio at all");
  } else if (fullRatio[1] !== "4 / 3") {
    failures.push(
      `\`full\` draws its thumbnail ${fullRatio[1]}, not 4 / 3. 16 / 9 is the ` +
        `one this was changed away from — it cut the top off every portrait ` +
        `and square photograph on the widest card in the grid`,
    );
  }
  if (!/props\.flush \? "1 \/ 1"/.test(card)) {
    failures.push(
      "the flush thumbnail is no longer square, which changes every grid " +
        "card on every screen",
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
    "clean: every grid screen renders the same 49.6% square card; only " +
      "Local expands a listing, only when its category holds exactly one, " +
      "and a trailing odd card keeps its column width",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
