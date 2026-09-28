#!/usr/bin/env node
//
// Sizes, for the two categories that sell things people wear.
//
// Fashion had no branch at all. A dress, a pair of shoes and a wax pagne all
// went through the generic goods form, and the only Fashion-aware line in the
// app was a title hint that read "e.g. Wax dress, size M" — the form telling
// the seller to type the size into the title, because there was nowhere else
// to put it. A size in a title cannot be counted, compared, or filtered, and
// it disappears the moment somebody words the title differently.
//
// Baby & Kids had half of one: babyKind "clothing" is labelled "Clothing &
// shoes" and asked for a size in a single free-text box, so an age band and a
// shoe number arrived in the same string on the same scale.
//
// THE THREE THINGS THAT GO WRONG HERE, each guarded below:
//
//   a sentinel reaching a document — "Other" is a picker state; what belongs
//     on the listing is the text the seller typed;
//   a stale size surviving a change of kind — the chips for it stop being
//     rendered, so a bag that was briefly a shirt still carries M/L/XL and
//     nothing on screen says so;
//   an old listing losing its size — babyDetail holds the size of every Baby
//     listing published before this, and no reader may drop it.
//
// Run: node scripts/check-fashion-sizes.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const form = stripComments(read("src/screens/CreateListingScreen.js"));
const detail = stripComments(read("src/screens/ProductDetailScreen.js"));

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };

const load = (file, names) => {
  const body = read(file).replace(/^export\s+/gm, "");
  return new Function(`${body}; return { ${names.join(", ")} };`)();
};
const F = load("src/data/fashionKinds.js", [
  "fashionKinds", "CLOTHING_SIZES", "SHOE_SIZES_EU",
  "getFashionSizeSystem", "fashionSizeOptions", "formatFashionSize",
]);
const B = load("src/data/babyKinds.js", [
  "babyKinds", "babyItemSubtypes", "BABY_AGE_SIZES", "BABY_SHOE_SIZES_EU",
  "getBabySizeSystem", "babySizeOptions", "formatBabySize", "getBabyDetailKind",
]);

// ── 1. Fashion has a branch of its own ─────────────────────────────────
if (!/const isFashion = selectedCategory === "fashion"/.test(form))
  fail("Fashion has no branch — it falls back to the generic goods form, which is the defect");
if (!/<Label>\{t\("sellFieldFashionKind"\)\}<\/Label>/.test(read("src/screens/CreateListingScreen.js")))
  fail("the Fashion item-type picker is not rendered");

// ── 2. Which kinds are sized, and on what scale ────────────────────────
const SIZED = { clothing: "letter", shoes: "eu" };
const UNSIZED = ["bags", "jewelry", "traditional", "accessories", "other"];
for (const [key, system] of Object.entries(SIZED)) {
  if (F.getFashionSizeSystem(key) !== system)
    fail(`fashion "${key}" should size on "${system}", got "${F.getFashionSizeSystem(key)}"`);
  if (F.fashionSizeOptions(key).length < 5)
    fail(`fashion "${key}" offers ${F.fashionSizeOptions(key).length} sizes; that is not a usable list`);
}
for (const key of UNSIZED) {
  if (F.getFashionSizeSystem(key) !== null)
    fail(`fashion "${key}" has a size system; it should have none`);
  if (F.fashionSizeOptions(key).length !== 0)
    fail(`fashion "${key}" offers sizes; it should offer none`);
}
// Pagne is fabric. It sells by the yard, which is a quantity, and forcing it
// into a size field would publish "sizes: 6" meaning six yards.
if (F.getFashionSizeSystem("traditional") !== null)
  fail("Traditional & Pagne is being treated as a body size");
if (!F.fashionKinds.some((k) => k.key === "traditional"))
  fail("Traditional & Pagne is missing from the taxonomy");

// Letter sizes, not numeric — numeric clothing is explicitly a later phase.
if (F.CLOTHING_SIZES.join() !== "XS,S,M,L,XL,XXL,XXXL")
  fail(`clothing sizes are ${F.CLOTHING_SIZES.join(",")}; expected the letter scale`);
if (F.SHOE_SIZES_EU[0] !== "35" || F.SHOE_SIZES_EU[F.SHOE_SIZES_EU.length - 1] !== "48")
  fail(`adult EU shoes run ${F.SHOE_SIZES_EU[0]}–${F.SHOE_SIZES_EU.at(-1)}; expected 35–48`);
if (F.formatFashionSize("40", "eu") !== "EU 40" || F.formatFashionSize("M", "letter") !== "M")
  fail("formatFashionSize does not label the scale it is on");

// ── 3. Baby & Kids: the existing kind survives, the subtype is new ─────
if (!B.babyKinds.some((k) => k.key === "clothing" && k.detail === "size"))
  fail('babyKind "clothing" was renamed or lost its size detail — old listings carry that key');
if (B.babyKinds.some((k) => k.key === "fashion") || F.fashionKinds.some((k) => k.key === "babyKids"))
  fail("Fashion and Baby & Kids have started absorbing each other; they are separate categories");
if (!/data\/babyKinds/.test(read("src/screens/CreateListingScreen.js")))
  fail("the form no longer reads babyKinds");
for (const [key, system] of Object.entries({ clothing: "age", shoes: "eu" })) {
  if (B.getBabySizeSystem(key) !== system)
    fail(`baby subtype "${key}" should size on "${system}", got "${B.getBabySizeSystem(key)}"`);
}
if (B.getBabySizeSystem("clothing") === B.getBabySizeSystem("shoes"))
  fail("baby clothing and shoes share a size system; that is the bug the subtype exists to fix");
// Age bands are keys, not labels: a listing published in French has to read
// correctly to an English buyer.
if (B.BABY_AGE_SIZES.some((b) => !b.key || !b.labelEn || !b.labelFr))
  fail("an age band is missing its key or one of its labels");
if (B.formatBabySize("2-3y", "age", "en") === B.formatBabySize("2-3y", "age", "fr"))
  fail("age bands render identically in both languages — they are storing a label, not a key");
if (B.formatBabySize("24", "eu", "fr") !== "EU 24")
  fail("baby shoe sizes do not label their scale");
// The two EU ranges must meet without overlapping or leaving a gap.
if (Number(B.BABY_SHOE_SIZES_EU.at(-1)) + 1 !== Number(F.SHOE_SIZES_EU[0]))
  fail(`children's EU ends at ${B.BABY_SHOE_SIZES_EU.at(-1)} and adult starts at ${F.SHOE_SIZES_EU[0]} — they must meet`);

// ── 4. Multiple sizes, and the sentinel never reaching a document ──────
for (const state of ["fashionSizes", "babySizes"]) {
  if (!new RegExp(`const \\[${state}, set`).test(form))
    fail(`${state} is not held as state`);
  if (!new RegExp(`Array.isArray\\(stored\\) \\? stored : \\[\\]`).test(form))
    fail("a stored size list is not restored as an array");
}
if (!/const toggleInList = /.test(form))
  fail("there is no multi-select toggle — a boutique would need one listing per size");
if (!/const SIZE_OTHER = "__sizeOther__"/.test(form))
  fail("the size sentinel is gone");
// The payload may only ever write the resolved lists.
const payload = form.slice(form.indexOf("const listingDoc"), form.indexOf("const previewListing"));
for (const bad of [/fashionSizes: \[\.\.\..*SIZE_OTHER/, /babySizes: \[\.\.\..*SIZE_OTHER/, /SIZE_OTHER,\s*$/m]) {
  if (bad.test(payload)) fail(`the SIZE_OTHER sentinel reaches the payload: ${bad}`);
}
for (const field of [
  "fashionSizes: fashionHasSizes \\? fashionSizes : \\[\\]",
  "fashionCustomSizes: fashionHasSizes \\? fashionCustomSizeList : \\[\\]",
  "babySizes: babyItemSubtype \\? babySizes : \\[\\]",
  "babyCustomSizes: babyItemSubtype \\? babyCustomSizeList : \\[\\]",
]) {
  if (!new RegExp(field).test(form))
    fail(`the payload does not write ${field.split(":")[0]} correctly`);
}
// Canonical and custom stay in separate arrays, or the distinction is lost.
if (/fashionSizes: \[\.\.\.fashionSizes, \.\.\.fashionCustomSizeList\]/.test(form))
  fail("canonical and custom sizes are being merged into one array");

// ── 5. An unsized kind carries nothing ─────────────────────────────────
if (!/fashionSizeSystem: fashionHasSizes \? fashionSizeSystem : null/.test(form))
  fail("an unsized Fashion kind still writes a size system");
// The EFFECT BODY, not just the identifier: a reset that exists but sets
// nothing is the same bug wearing the right name.
const resetBody = (ref, dep) => {
  const at = form.indexOf(`${ref}.current === `);
  if (at === -1) return null;
  const end = form.indexOf(`}, [${dep}]);`, at);
  return end === -1 ? null : form.slice(at, end);
};
const fashionReset = resetBody("previousFashionKind", "fashionKind");
if (!fashionReset) fail("changing the Fashion kind does not clear the sizes under it");
else
  for (const setter of ["setFashionSizes([])", 'setFashionCustomSizes("")', "setFashionSizeOtherPicked(false)"])
    if (!fashionReset.includes(setter))
      fail(`changing the Fashion kind does not run ${setter} — a stale size would publish unseen`);
const babyReset = resetBody("previousBabySubtype", "babyItemSubtype");
if (!babyReset) fail("changing the Baby subtype does not clear the sizes under it");
else
  for (const setter of ["setBabySizes([])", 'setBabyCustomSizes("")', "setBabySizeOtherPicked(false)"])
    if (!babyReset.includes(setter))
      fail(`changing the Baby subtype does not run ${setter}`);
// And guarded on the previous value, or editing a listing wipes what seeding
// just restored.
if (!/previousFashionKind\.current === fashionKind\) return;/.test(form))
  fail("the Fashion reset is not guarded against firing on mount");
if (!/previousBabySubtype\.current === babyItemSubtype\) return;/.test(form))
  fail("the Baby reset is not guarded against firing on mount");

// ── 6. Old listings keep working ───────────────────────────────────────
if (!/babyDetail: babyDetail.trim\(\) \|\| null/.test(form))
  fail("babyDetail is no longer written — every Baby listing before this has its size in it");
// Both halves: the row has to be SHOWN for an old listing, and it has to
// print the old value once shown.
if (!/sizeLine \|\| listing\.sportsSize \|\| listing\.babyDetail/.test(detail))
  fail("the spec row is no longer shown for a listing whose only size is the old babyDetail");
if (!/sizeLine \?\? \(listing\.sportsSize \|\| listing\.babyDetail\)/.test(detail))
  fail(
    "the spec row no longer falls back to sportsSize/babyDetail — an older " +
      "listing would show the row and print nothing in it",
  );
if (!/listing\.sportsSize/.test(detail))
  fail("the detail screen no longer reads sportsSize");
// The flag must be WIRED to the render, not merely declared.
if (!/const babyUsesLegacyDetail = !babyItemSubtype;/.test(form))
  fail("babyUsesLegacyDetail is gone — nothing decides when the old free-text box shows");
if (!/=== "age" \|\| babyUsesLegacyDetail/.test(form))
  fail(
    "the old free-text box is not gated on babyUsesLegacyDetail — an older " +
      "Baby listing could not be reopened without losing the size its seller typed",
  );
if (!/sizeLine/.test(detail))
  fail("the detail screen does not render the structured sizes");

// Nothing is mandatory: a Fashion or Baby listing must still publish with no
// size at all, exactly as it could before.
const missing = form.slice(form.indexOf("const missing = []"), form.indexOf('refuse(missing, "errorRequiredFields")'));
for (const word of ["fashionSizes", "babySizes", "fashionKind", "babyItemSubtype"]) {
  if (missing.includes(word)) fail(`${word} was added to the required fields; sizes are optional`);
}

// ── 7. Sizes are chips, not category cards ─────────────────────────────
//
// PickerCard is an icon, a two-line label and a fixed share of the row. Put
// the EU scale through it and fifteen two-digit numbers become eight rows of
// half-width cards — taller than the rest of the form, with price and
// location pushed off the screen. Measured on the emulator before this was
// changed; the guard exists so it cannot come back by reuse.
const grid = form.slice(
  form.indexOf("const renderSizeGrid = ({"),
  form.indexOf("const toggleInList = "),
);
if (!grid) fail("renderSizeGrid is gone");
if (/<PickerCard/.test(grid))
  fail("the size grid renders PickerCard again — that is the eight-row wall this replaced");
if (!/<SizeChip\b/.test(grid) || !/<SizeChipWrap>/.test(grid))
  fail("the size grid no longer uses the compact size chips");
// A fixed share per row, so the cells line up — but a share chosen by what
// the cell holds. One width for everything either clips "12–18 months" or
// spends two thirds of a row on "42".
if (/width=\{getPickerCardWidth/.test(grid))
  fail("size chips use the category-card width again — that is the oversized grid");
// Both chips — the sizes and the "Other" that closes the grid. Miss one and
// that cell alone is content-sized, which is exactly the ragged edge this
// replaced.
const widthed = (grid.match(/width=\{width\}/g) ?? []).length;
if (widthed !== 2)
  fail(
    `${widthed} of the 2 size chips carry a cell width; the other would be ` +
      `content-sized and break the row`,
  );
const cells = form.slice(form.indexOf("const SIZE_CELL = {"), form.indexOf("const SIZE_CELL = {") + 260);
for (const variant of ["numeric", "compact", "wide"]) {
  if (!new RegExp(`${variant}: "[0-9.]+%"`).test(cells))
    fail(`SIZE_CELL has no ${variant} width`);
}
// Every variant plus its gaps must still fit a row on the narrowest phone
// this ships to: a 6px gap is ~1.7% of a 360dp row.
const pct = (v) => Number(cells.match(new RegExp(`${v}: "([0-9.]+)%"`))[1]);
for (const [variant, cols] of [["numeric", 5], ["compact", 4], ["wide", 3]]) {
  const used = pct(variant) * cols + 1.7 * (cols - 1);
  if (used > 100)
    fail(`${variant} cells come to ${used.toFixed(1)}% of a narrow row — a column would wrap away`);
}
// Both variants are actually chosen somewhere, or one of them is dead.
for (const variant of ["numeric", "compact", "wide"]) {
  if (!new RegExp(`"${variant}"`).test(form.slice(form.indexOf("renderSizeGrid({"))))
    fail(`no size grid asks for the ${variant} layout`);
}
if (!/align-items: center/.test(chipStyleFor()) || !/text-align: center/.test(form))
  fail("size labels are not centred in their cell");
function chipStyleFor() {
  return form.slice(form.indexOf("const SizeChip = styled("), form.indexOf("const SizeChipLabel"));
}
const chipStyle = form.slice(form.indexOf("const SizeChip = styled("), form.indexOf("const SizeChipLabel"));
if (!/flex-wrap: wrap/.test(form.slice(form.indexOf("const SizeChipWrap"), form.indexOf("const SizeChip = styled("))))
  fail("the chip row does not wrap");
if (!/min-height: 44px/.test(chipStyle))
  fail("the size chip is under a 44px tap target");
// One renderer, both categories — the whole point of sharing it.
if ((form.match(/renderSizeGrid\(\{/g) ?? []).length !== 2)
  fail("renderSizeGrid is not used by exactly the two size grids (Fashion and Baby)");

// The scale is named once above the chips. Presentation only: the stored
// value stays the bare number, which is what the payload and Product Detail
// already depend on.
// Both grids, not one: Fashion shoes and Baby shoes each show bare numbers
// and each needs the scale named above them.
const captions = (form.match(/sellFieldSizeSystemEu/g) ?? []).length;
if (captions !== 2)
  fail(
    `the EU caption appears ${captions} time(s); both shoe grids need it, or a ` +
      `bare number has nothing naming its scale`,
  );
if (/labelOf: \(value\) =>\s*formatFashionSize/.test(form.replace(/\s+/g, " ")))
  fail('the chips stamp "EU" on every size again');
if (F.SHOE_SIZES_EU.some((v) => /[^0-9]/.test(v)))
  fail("a stored shoe size is no longer a bare number — presentation has leaked into the data");

// ── 8. The title no longer carries the size ────────────────────────────
const en = read("src/i18n/translations.js");
if (/sellTitleHint_fashion: "[^"]*size M/i.test(en) || /sellTitleHint_fashion: "[^"]*taille M/i.test(en))
  fail("the Fashion title hint still tells sellers to type the size into the title");

if (failures) process.exit(1);
console.log(
  `clean: fashion — ${F.fashionKinds.length} kinds (${Object.keys(SIZED).length} sized), ` +
    `${F.CLOTHING_SIZES.length} letter sizes, EU ${F.SHOE_SIZES_EU[0]}–${F.SHOE_SIZES_EU.at(-1)}; ` +
    `baby — ${B.babyItemSubtypes.length} subtypes, ${B.BABY_AGE_SIZES.length} age bands, ` +
    `EU ${B.BABY_SHOE_SIZES_EU[0]}–${B.BABY_SHOE_SIZES_EU.at(-1)}; babyDetail still read`,
);
