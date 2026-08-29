// A banner that runs under the status bar owns the whole strip.
//
// The top inset can only be spent once. A screen leading with the emerald
// gradient has two ways to pay it, and doing both is the bug: the
// SafeAreaView pays it in theme.background, which draws a white band above
// the banner, and the banner pays it again below. That white band is what
// "the statusbar is white and the banners are green" described — the two
// read as separate bars with a seam between them.
//
// The other half is the glyphs. Once the gradient is under them, the clock
// and the battery are sitting on #07362A, and App.js's app-wide dark style
// makes them invisible rather than merely dim. Whoever takes the strip has
// to claim the icons too.
//
// Neither failure crashes or logs. Both are only visible on a device, at
// the top of the screen, which is why they are checked here.
//
// Run: node scripts/check-banner-top-inset.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const screensDir = path.join(root, "src/screens");
const read = (file) => stripComments(fs.readFileSync(file, "utf8"));

const failures = [];

// The tab screens this was reported against. Named so the check says what
// to restore rather than only that something drifted.
const MUST_CLAIM = [
  "ForYouScreen.js",
  "LocalScreen.js",
  "SellerDashboardScreen.js",
];

for (const name of MUST_CLAIM) {
  const source = read(path.join(screensDir, name));
  if (!/useBannerStatusBar\(\)/.test(source)) {
    failures.push(
      `${name} no longer calls useBannerStatusBar — its banner is under the ` +
        `status bar, so the clock and battery would be dark on dark green`,
    );
  }
}

// Every screen that claims the strip must have let go of the safe-area
// edge, and must actually pay the inset it took on.
for (const file of fs.readdirSync(screensDir).filter((f) => f.endsWith(".js"))) {
  const source = read(path.join(screensDir, file));
  if (!/useBannerStatusBar\(\)/.test(source)) continue;

  const edges = source.match(/edges=\{\[[^\]]*\]\}/g) ?? [];
  if (edges.some((clause) => /"top"/.test(clause))) {
    failures.push(
      `${file} claims the status bar for its banner but still passes "top" ` +
        `to its SafeAreaView — the inset gets paid twice and the second one ` +
        `is a white strip above the banner`,
    );
  }
  if (!/insets\.top/.test(source)) {
    failures.push(
      `${file} dropped the "top" edge without paying insets.top anywhere — ` +
        `its banner content now sits under the clock`,
    );
  }
}

// And the seller dashboard specifically: the banner only reaches the top of
// the screen because there is no navigation header above it. Turning the
// header back on puts a white bar between the status bar and the banner,
// which is the original complaint restored.
{
  const stack = read(path.join(root, "src/navigation/SellStack.js"));
  const block = stack.slice(
    stack.indexOf('name="SellerDashboard"'),
    stack.indexOf("</Stack.Screen>", stack.indexOf('name="SellerDashboard"')) + 1 ||
      stack.indexOf('name="CompanyProfileEdit"'),
  );
  if (!/headerShown: false/.test(block)) {
    failures.push(
      "SellStack shows a navigation header on SellerDashboard — that is the " +
        "white bar above the emerald banner",
    );
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: banner top inset — ${MUST_CLAIM.length} screens run their banner ` +
    `under the status bar and own its glyphs`,
);
