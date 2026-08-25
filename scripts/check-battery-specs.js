// The capacity is the whole search on the Batterie screen, exactly as the
// size is on Pneus: get it wrong and a buyer is shown a battery that will
// not turn their engine, or shown nothing while the stock exists. Both look
// the same on screen — an empty list — so both need a test.
//
// Run: node scripts/check-battery-specs.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs
  .readFileSync(
    path.join(__dirname, "..", "src", "data", "batteries.js"),
    "utf8",
  )
  .replace(/^export /gm, "");

// `function` declarations land on the context; a top-level `const` does not,
// so the tables and constants are handed over explicitly.
const exposed = `${source}
this.BATTERY_SUSPECT_YEARS = BATTERY_SUSPECT_YEARS;
this.BATTERY_LIMITS = BATTERY_LIMITS;
this.batteryVehicleSpecs = batteryVehicleSpecs;
this.batteryCategories = batteryCategories;
this.batteryServices = batteryServices;`;

const context = {};
vm.createContext(context);
vm.runInContext(exposed, context);

const {
  isValidBatteryCapacity,
  isValidCrankingAmps,
  batteryNeedsCrankingAmps,
  formatBatterySpec,
  batteryAgeYears,
  isAgeingBattery,
  tradeInLabel,
  batteryVehicleModels,
  batteryVehicleSpecsFor,
  batteryVehicleSpecs,
  BATTERY_SUSPECT_YEARS,
  BATTERY_LIMITS,
} = context;

const failures = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

// The form hands numbers over as strings.
check("capacity from string", isValidBatteryCapacity("60"), true);
check("capacity zero", isValidBatteryCapacity(0), false);
check("capacity absurd", isValidBatteryCapacity(9000), false);
check("capacity blank", isValidBatteryCapacity(""), false);

// Amps are optional, so blank must pass — but a wrong number must not.
check("amps blank passes", isValidCrankingAmps(""), true);
check("amps null passes", isValidCrankingAmps(null), true);
check("amps in range", isValidCrankingAmps("540"), true);
check("amps absurd", isValidCrankingAmps(9999), false);

// A solar cell has no starter to crank.
check("car needs amps", batteryNeedsCrankingAmps("car"), true);
check("solar needs no amps", batteryNeedsCrankingAmps("solar"), false);

check("spec both", formatBatterySpec(60, 540, "fr"), "60 Ah · 540 A");
check("spec capacity only", formatBatterySpec(60, null, "fr"), "60 Ah");
check("spec none", formatBatterySpec(null, 540, "fr"), null);

// Built from local parts: an ISO string parses as UTC and is still the
// previous year in any negative offset, while the code reads the LOCAL year.
const at2026 = new Date(2026, 0, 1);
check(
  "ageing at threshold",
  isAgeingBattery(2026 - BATTERY_SUSPECT_YEARS, at2026),
  true,
);
check(
  "not ageing below",
  isAgeingBattery(2026 - BATTERY_SUSPECT_YEARS + 1, at2026),
  false,
);
check("no year", isAgeingBattery(null, at2026), false);
// A year in the future is a typo, not a battery from the future.
check("future year", batteryAgeYears(2030, at2026), null);

check("trade-in absent", tradeInLabel(0, "fr"), null);
// Built with toLocaleString rather than typed out: French groups thousands
// with a NARROW NO-BREAK SPACE (U+202F), not the space on your keyboard.
// Typing the expectation by hand produces two strings that look identical
// and are not equal — which is exactly what this line caught the first time.
check(
  "trade-in shown",
  tradeInLabel(8000, "fr"),
  `\u2212 ${(8000).toLocaleString("fr-FR")} FCFA avec reprise`,
);

check("vehicle miss", batteryVehicleSpecsFor("Toyota", "Unknown"), []);
check(
  "vehicle hit is a list",
  Array.isArray(batteryVehicleSpecsFor("Toyota", "Corolla")),
  true,
);

// Every capacity in the table has to survive the same validation the form
// applies, or the finder can hand the search a value it would have rejected.
let rows = 0;
batteryVehicleSpecs.forEach((entry) => {
  if (!entry.specs || !entry.specs.length) {
    failures.push(`${entry.make} ${entry.model}: no capacity`);
    return;
  }
  entry.specs.forEach((spec) => {
    rows += 1;
    if (!isValidBatteryCapacity(spec.ah)) {
      failures.push(`${entry.make} ${entry.model}: ${spec.ah} Ah out of range`);
    }
    if (!isValidCrankingAmps(spec.a)) {
      failures.push(`${entry.make} ${entry.model}: ${spec.a} A out of range`);
    }
  });
});

// Duplicate model names under one make would make the picker ambiguous.
new Set(batteryVehicleSpecs.map((entry) => entry.make)).forEach((make) => {
  const models = batteryVehicleModels(make);
  if (new Set(models).size !== models.length) {
    failures.push(`${make}: duplicate model`);
  }
});

// The two vehicle tables must offer the same makes.
//
// This is the failure that shipped: tyres knew 55 makes and batteries knew
// 21, so somebody on a Mazda opened the battery finder and was told the app
// did not know their car — while the tyre screen, two taps away, did. The
// lists are written by hand and will be extended by hand, so nothing but a
// test keeps them level.
const tyreSource = fs
  .readFileSync(path.join(__dirname, "..", "src", "data", "tyres.js"), "utf8")
  .replace(/^export /gm, "");
const tyreContext = { console };
vm.runInNewContext(
  `${tyreSource}\nthis.tyreVehicleSizes = tyreVehicleSizes;`,
  tyreContext,
);
const tyreMakes = Array.from(
  new Set(tyreContext.tyreVehicleSizes.map((entry) => entry.make)),
);
const batteryMakes = new Set(batteryVehicleSpecs.map((entry) => entry.make));
tyreMakes.forEach((make) => {
  if (!batteryMakes.has(make)) {
    failures.push(`${make}: in the tyre table but not the battery table`);
  }
});

// Every entry must land in a segment the capacity table actually defines,
// or the picker offers a model and then has nothing to say about it.
batteryVehicleSpecs.forEach((entry) => {
  if (!entry.specs?.length) {
    failures.push(`${entry.make} ${entry.model}: no capacity for its segment`);
  }
});

if (failures.length) {
  failures.forEach((line) => console.error(line));
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(
  `clean: 19 battery cases + ${rows} capacities across ${batteryVehicleSpecs.length} models, ${batteryMakes.size} makes covering all ${tyreMakes.length} tyre makes`,
);
