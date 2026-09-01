// A filter that names a category nobody defined shows an empty screen.
//
// This has now happened twice, on the same row of chips, and both times it
// took somebody tapping it to find out:
//
//   - "events" — the Événements chip filtered the marketplace by a key no
//     category had. Tapping it produced a blank page for as long as the
//     chip existed.
//   - "hotels" — the same fault, still live afterwards. Hotels have their
//     own screen and always did; the chip was filtering goods by a word.
//
// Nothing about either failed. There is no error, no warning and no empty
// state that says why — a feed filtered to nothing looks exactly like a
// feed with nothing in it, which in a young marketplace is entirely
// plausible. That is what makes it worth a check rather than a fix.
//
// The rule: every `categoryKey: "x"` written anywhere in src must name a
// real category in src/data/categories.js. Custom categories entered by a
// seller are a different field (`customCategory`) and are not affected —
// see check-custom-category.js.
//
// Run: node scripts/check-category-keys.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

const categorySource = fs.readFileSync(
  path.join(root, "src/data/categories.js"),
  "utf8",
);
const keys = [...categorySource.matchAll(/{ key: '([a-zA-Z]+)'/g)].map(
  (match) => match[1],
);

if (keys.length < 10) {
  failures.push(
    `only ${keys.length} categories were found in src/data/categories.js — ` +
      `the shape it is read with here no longer matches the file`,
  );
}

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith(".js")
          ? [path.join(dir, entry.name)]
          : [],
    );

for (const file of walk(path.join(root, "src"))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/categoryKey:\s*["']([a-zA-Z]+)["']/g)) {
    if (!keys.includes(match[1])) {
      failures.push(
        `${path.relative(root, file)} filters by categoryKey "${match[1]}", ` +
          `which no category defines — that filter can only ever be empty`,
      );
    }
  }
}

// And the chip row itself: a chip has to do one of the two things. One with
// neither is a button that does nothing at all.
const forYou = fs.readFileSync(
  path.join(root, "src/screens/ForYouScreen.js"),
  "utf8",
);
const chipBlock = forYou.slice(
  forYou.indexOf("const CATEGORY_CHIPS"),
  forYou.indexOf("];", forYou.indexOf("const CATEGORY_CHIPS")),
);
if (chipBlock) {
  const chips = chipBlock.split(/\n  \{/).slice(1);
  chips.forEach((chip) => {
    const key = /key: "([a-zA-Z]+)"/.exec(chip)?.[1] ?? "?";
    if (!/screen:/.test(chip) && !/categoryKey:/.test(chip)) {
      failures.push(
        `the "${key}" chip names neither a screen nor a categoryKey, so ` +
          `tapping it does nothing`,
      );
    }
  });
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: category keys — every categoryKey in src names one of the ` +
    `${keys.length} real categories`,
);
