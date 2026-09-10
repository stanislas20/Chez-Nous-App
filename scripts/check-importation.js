// Importation says no number, and has to keep saying it.
//
// The screen exists because the app had been asserting a cost and then
// refusing to help with it: vehicles.js calls customs status the single most
// consequential fact about a used car here, and every listing carries "Non
// dédouané — droits restant à payer par l'acheteur, en plus du prix". A large
// unknown sum, stated, and then nothing.
//
// The answer chosen was a person, not a figure. Duty runs off the valeur
// mercuriale, the age bracket and the displacement, with DD, TVA, RS and PCS
// over that, and every one of those moves. A number written into this feature
// is right until it is not, nothing in the app would notice, and the reader
// would have budgeted against it — which is worse than the silence it
// replaced, because silence does not get believed.
//
// That decision is one edit away from being undone by somebody adding a
// helpful estimate, so it is pinned here rather than left to memory. The
// other four checks cover the plumbing that makes the screen honest: a list
// built from real listings, a tile that routes, both doors, and a warning
// that appears only where it is true.
//
// Run: node scripts/check-importation.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const raw = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const read = (rel) => stripComments(raw(rel));

const failures = [];

// Data modules, run rather than read, with imports followed.
//
// The box gets a `require` because importation.js reads countries.js for its
// country names, and a sandbox that cannot follow an import fails the moment
// a data file grows a dependency — which is what happened: this harness
// threw "require is not defined" the day `import { countries }` was added,
// and a check that crashes is a check that stopped testing anything.
//
// Extensionless, like Metro resolves it and like the app writes its imports.
const babel = require("@babel/core");
const vm = require("vm");
const loadModule = (rel) => {
  const code = babel.transformFileSync(path.join(root, rel), {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
    babelrc: false,
    configFile: false,
  }).code;
  const box = {
    module: { exports: {} },
    exports: {},
    require: (spec) => loadModule(`${path.join(path.dirname(rel), spec)}.js`),
  };
  box.module.exports = box.exports;
  vm.createContext(box);
  vm.runInContext(code, box);
  return box.module.exports;
};
const importation = loadModule("src/data/importation.js");

// 1. No money, anywhere in what the reader is shown.
{
  const translations = raw("src/i18n/translations.js");
  // Only the import strings — the rest of the file is full of prices and
  // should be. Captured whole rather than line by line: prettier wraps a
  // long value onto its own line, and the first version of this check
  // filtered on lines STARTING with the key, so every continuation line went
  // unscanned. It passed against a copy reading "gratuit pendant 11 jours",
  // which is exactly the figure it exists to catch.
  const lines = [
    ...translations.matchAll(
      /\b(?:import[A-Z]\w*|menuImportRow):((?:\s*"(?:[^"\\]|\\.)*")+)/g,
    ),
  ].map((match) => match[1]);
  if (lines.length < 10) {
    failures.push(
      "the Importation strings have gone missing from translations.js",
    );
  }
  for (const line of lines) {
    // A percentage, a franc amount, or a bare number of days — the three
    // shapes an "estimate" arrives in.
    if (/\d+\s*%/.test(line)) {
      failures.push(`a percentage appeared in an Importation string: ${line.trim().slice(0, 70)}`);
    }
    if (/\d[\d\s.,]*\s*(FCFA|CFA|XOF|francs?)/i.test(line)) {
      failures.push(`a franc amount appeared in an Importation string: ${line.trim().slice(0, 70)}`);
    }
    if (/\b\d+\s*(jours?|days?)\b/i.test(line)) {
      failures.push(
        `a number of days appeared in an Importation string — the franchise ` +
          `length is exactly the figure this feature refuses to carry: ` +
          `${line.trim().slice(0, 70)}`,
      );
    }
  }
  const data = read("src/data/importation.js");
  if (/\d[\d\s.,]*\s*(FCFA|CFA|XOF)/i.test(data)) {
    failures.push("data/importation.js carries a franc amount");
  }
  // The age cap, which was here and was wrong.
  //
  // vehicles.js used to export MAX_IMPORT_AGE_YEARS = 7 and call it "the one
  // import figure worth stating". Bénin does not refuse a vehicle on its
  // age — the port's used-car trade is built on the stock that constant
  // declared unimportable — and it was not inert: a seller listing an
  // eight-year-old car was told it could no longer be imported, and buyers
  // were shown a warning triangle beside it. An invented legal obstacle,
  // with advice attached.
  //
  // Pinned because it is the kind of confident, plausible, load-bearing
  // falsehood that gets re-added by somebody who half-remembers reading it.
  const wholeApp = [
    read("src/data/vehicles.js"),
    read("src/screens/ImportationScreen.js"),
    read("src/screens/CarsScreen.js"),
    read("src/screens/CreateListingScreen.js"),
  ].join("\n");
  if (/MAX_IMPORT_AGE_YEARS|isBeyondImportAge/.test(wholeApp)) {
    failures.push(
      "the vehicle import age cap is back — Bénin does not refuse a vehicle " +
        "on its age, and the app must not tell a seller that it does",
    );
  }
  // The screen must say, in its own words, that it will not give a figure.
  // Without that the absence reads as an omission rather than a decision.
  if (!/importNoFigureTitle/.test(read("src/screens/ImportationScreen.js"))) {
    failures.push(
      "the screen no longer explains why it gives no duty figure, so the " +
        "missing number reads as a gap rather than a choice",
    );
  }
}

// 2. Both kinds of helper, kept apart and both from real listings.
//
//    The screen shows two different people at opposite ends of one journey:
//    somebody abroad who buys and ships, and somebody here who clears. The
//    word "importation" appears in most transitaire listings too, because
//    clearing imports is what they do — so without the declared trade
//    deciding it, the two lists collapse into one and every reader is shown
//    the wrong half.
{
  const data = read("src/data/importation.js");
  if (!/declaredTrade === "importateur"/.test(data)) {
    failures.push(
      "a declared importateur no longer routes to the overseas-buyer list",
    );
  }
  if (!/if \(declaredTrade === "transitaire"\) return false;/.test(data)) {
    failures.push(
      "a declared transitaire is no longer excluded from the overseas-buyer " +
        "list — they say \"importation\" too, so both lists become one list",
    );
  }
  const screen0 = read("src/screens/ImportationScreen.js");
  if (!/rolesForStage\(/.test(screen0)) {
    failures.push(
      "the two lists are no longer ordered by the reader's stage, so " +
        "somebody who has bought nothing leads with a customs broker",
    );
  }
  // A sourcer is not somewhere you go. A distance beside them describes the
  // wrong place entirely.
  const hook0 = read("src/hooks/useImportHelpers.js");
  if (/sourcers[\s\S]{0,400}distanceKm/.test(hook0)) {
    failures.push(
      "the overseas buyers carry a distance, which measures from Cotonou to " +
        "a listing whose whole point is being abroad",
    );
  }
  // Phase B moved this from an unbounded subscription to a bounded,
  // category-scoped read. The assertion is unchanged in substance: the list
  // has to come from live approved listings rather than from a hand-kept
  // array in the bundle.
  const hook = read("src/hooks/useImportHelpers.js");
  if (!/useCategoryListings\("services"\)/.test(hook)) {
    failures.push(
      "the helper lists are no longer built from approved listings — a " +
        "hand-kept directory rots, and a rotted one sends somebody to a " +
        "number that stopped working a year ago",
    );
  }
  if (!/categoryKey === "services"/.test(hook)) {
    failures.push("the transitaire list no longer restricts itself to Services");
  }
  if (!/declaredTrade === "transitaire"/.test(data)) {
    failures.push(
      "a declared trade no longer outranks the prose, so membership is " +
        "decided by whoever happens to use the word transit",
    );
  }
}

// 3. The Voitures tile routes to the screen instead of searching for it.
{
  const grid = read("src/data/carServiceCategories.js");
  const tile = grid.match(/\{[^{}]*key: "importation"[^{}]*\}/);
  if (!tile) {
    failures.push("the Importation tile has gone from the Voitures grid");
  } else if (!/route: "Importation"/.test(tile[0])) {
    failures.push(
      "the Importation tile is a text search again — it can only return " +
        "whoever wrote those words, and answers none of the three questions " +
        "the screen exists for",
    );
  }
}

// 4. Both doors. The screen covers vehicles and general goods, and somebody
//    importing a container will never look under Voitures for it.
{
  if (!/navigate\("Importation"\)/.test(read("src/screens/MoreScreen.js"))) {
    failures.push(
      "the menu no longer reaches Importation, leaving the Voitures grid as " +
        "the only door to a screen that is half about containers",
    );
  }
  if (!/name="Importation"/.test(read("src/navigation/RootNavigator.js"))) {
    failures.push("the Importation route is not registered");
  }
}

// 5. The storage warning appears only where the meter is running. On every
//    stage it is wallpaper, and wallpaper is not a warning.
{
  const screen = read("src/screens/ImportationScreen.js");
  if (!/storageClockRuns\(/.test(screen)) {
    failures.push(
      "the storage-clock note is no longer gated on the stage, so it shows " +
        "against a shipment that has not sailed",
    );
  }
  const data = read("src/data/importation.js");
  const stages = data.match(/STORAGE_CLOCK_STAGES = \[([^\]]*)\]/);
  if (!stages || !/atPort/.test(stages[1])) {
    failures.push(
      "the storage clock no longer covers the stage where the cargo is " +
        "actually sitting at the port accruing charges",
    );
  }
}

// 6. And the split, run rather than read. This is the part that decides
//    whether a reader sees the right half of the screen, and a keyword race
//    is exactly the kind of thing that looks correct in the source.
{
  const { isOverseasBuyerListing, isTransitaireListing } = importation;

  // Undeclared, and carrying both vocabularies at once — which is the
  // ordinary case, not a contrived one: a transitaire writes "importation"
  // because clearing imports is the job. The first version of this check
  // used the listing that actually broke on the phone, but dropping
  // "roulier" from the sourcer terms fixed that one on its own, so the test
  // passed without ever exercising the precedence rule it was written for.
  const both = "Transitaire — dédouanement et importation de véhicules.";
  if (isOverseasBuyerListing(both, undefined) && isTransitaireListing(both, undefined)) {
    failures.push(
      "a listing with no declared trade lands in BOTH helper lists again — " +
        "the two vocabularies overlap and the broker terms have to win",
    );
  }
  const cases = [
    ["Transitaire agréé, conteneurs.", "transitaire", "broker"],
    ["Arrivage mensuel, revente parc auto.", "importateur", "sourcer"],
    ["Achat sur commande depuis la Belgique, expedition vers le Benin", undefined, "sourcer"],
    ["Commissionnaire en douane, declaration.", undefined, "broker"],
  ];
  for (const [text, trade, expected] of cases) {
    const broker = isTransitaireListing(text, trade);
    const sourcer = isOverseasBuyerListing(text, trade);
    const got = broker && sourcer ? "both" : broker ? "broker" : sourcer ? "sourcer" : "neither";
    if (got !== expected) {
      failures.push(
        `"${text.slice(0, 40)}" reads as ${got}, expected ${expected}`,
      );
    }
  }
}

// 7. And the form asks them their own questions.
//
//    check-post-trades.js says plainly what it cannot catch: a screen that
//    passes a VALID trade belonging to somebody else. This is the other
//    half of that, for the two trades this feature added — both were being
//    shown the roadside block, so a customs broker at the port and an
//    importer in Brussels were asked how fast they usually arrive and
//    whether they bring a flatbed and a winch. Found on a device, like the
//    tracker fitter before them, because nothing mechanical can see it.
{
  const form = read("src/screens/CreateListingScreen.js");
  const gate = form.match(/const showRoadsideFields =[\s\S]{0,400}?;/);
  if (!gate) {
    failures.push("showRoadsideFields has moved and this guard cannot find it");
  } else if (!/!isImportTrade/.test(gate[0])) {
    failures.push(
      "the roadside block is shown to the import trades again — a " +
        "transitaire is asked their response time and offered a winch",
    );
  }
  if (!/trade === "transitaire" \|\| trade === "importateur"/.test(form)) {
    failures.push(
      "isImportTrade no longer covers both import trades, so one of them " +
        "still gets the dépannage questions",
    );
  }
}

// 8. The form writes what the screen reads.
//
//    This is the failure the whole feature existed to fix, so it is the one
//    pinned hardest. `buysFrom` was read by ImportationScreen and sorted on
//    by useImportHelpers, under a comment promising it was "declared on the
//    posting form, never inferred" — and no form wrote it. The read side
//    was complete, the write side did not exist, and every sourcer fell
//    through to the alphabetical fallback with the country line rendering
//    for nobody. A comment cannot notice that; this can.
{
  const form = read("src/screens/CreateListingScreen.js");
  for (const field of ["buysFrom", "sourcingChannels"]) {
    if (!new RegExp(`\\b${field}\\b`).test(form)) {
      failures.push(
        `CreateListingScreen no longer writes ${field}, so ImportationScreen ` +
          `is reading a field nothing sets — the exact state this feature ` +
          `was built to end`,
      );
    }
  }
  // Asked of the importer and nobody else. A transitaire buys nothing: they
  // file a declaration at Cotonou for cargo somebody else bought, so "where
  // do you buy from" is the winch question one trade over — the same
  // mistake check 7 above exists for.
  if (!/const isImporter =\s*isServices && trade === "importateur";/.test(form)) {
    failures.push(
      "isImporter has moved or widened — if the transitaire is asked where " +
        "they buy cars, the port broker is being asked a question that has " +
        "no answer",
    );
  }
}

// 9. Channels belong to their country, run rather than read.
//
//    A sourcer in Japan offering a Copart account is worse than one who
//    said nothing: the buyer wires money against a market the seller has no
//    access to. Two places have to agree about that — the list the form
//    offers, and the pruning that runs when somebody changes their country
//    after ticking boxes.
{
  const {
    sourcingChannelsFor,
    retainSourcingChannels,
    sourcingCountries,
    sourcingChannels,
    getSourcingCountryLabel,
  } = importation;

  const jp = sourcingChannelsFor("JP").map((channel) => channel.key);
  if (jp.includes("copart") || jp.includes("iaai")) {
    failures.push(
      "the American salvage auctions are offered to a sourcer in Japan",
    );
  }
  if (!sourcingChannelsFor("US").map((c) => c.key).includes("copart")) {
    failures.push(
      "Copart is no longer offered in the United States, which is the " +
        "single channel most Beninese importers there would name first",
    );
  }
  // No country chosen yet must not mean "everything": offering Copart before
  // anybody has said where they are invites a tick that then survives.
  const none = sourcingChannelsFor(null).map((channel) => channel.key);
  if (none.includes("copart") || none.includes("uss")) {
    failures.push(
      "named auction houses are offered before a country is chosen",
    );
  }
  if (!none.length) {
    failures.push(
      "no generic channels survive without a country, so a sourcer outside " +
        "the curated twelve can describe a market and then nothing about it",
    );
  }
  // The pruning, which is what stops a stale tick reaching a card.
  const pruned = retainSourcingChannels(["copart", "dealership"], "JP");
  if (pruned.includes("copart")) {
    failures.push(
      "switching country keeps a channel the new country does not offer — " +
        "the pill disappears from the form while the value stays in the doc",
    );
  }
  if (!pruned.includes("dealership")) {
    failures.push("pruning dropped a channel that is offered everywhere");
  }
  if (retainSourcingChannels(undefined, "US").length) {
    failures.push("retainSourcingChannels mishandles a listing with no channels");
  }

  // Codes, not names. countries.js is generated; a hand-written second copy
  // of "États-Unis" here is how the two come to disagree.
  for (const code of sourcingCountries) {
    if (!getSourcingCountryLabel(code, "fr")) {
      failures.push(`sourcingCountries has ${code}, which countries.js does not`);
    }
  }
  for (const channel of sourcingChannels) {
    if (channel.countries === null) continue;
    for (const code of channel.countries) {
      if (!sourcingCountries.includes(code)) {
        failures.push(
          `channel ${channel.key} is scoped to ${code}, which is not offered ` +
            `on the form — so it can never be picked`,
        );
      }
    }
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  "clean: Importation — no figure quoted, brokers from real listings, one " +
    "screen behind two doors, and the clock warned about only where it runs",
);
