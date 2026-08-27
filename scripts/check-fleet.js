// Guards the fleet screen's one original idea: the order of the queue.
//
// Everything else on this screen is borrowed on purpose. The statuses, the
// 45-day window and the reminder days all come from vehiclePapers.js and are
// already guarded by check-paper-status, because a fleet is not a new kind of
// deadline — it is the same deadline on four vehicles. What this file has to
// hold is the judgement that was added on top: which of several late things
// goes first.
//
// Get that wrong and the screen still works. It just puts a four-month-late
// oil change above an insurance that lapsed yesterday, and the person who
// trusted the top of the list drives uninsured.
//
// It also guards the thing that must never appear: an example vehicle. A
// fleet dashboard that ships with rows in it is fabricating somebody's
// business, and this is the one screen where seeded data would look exactly
// like real data.
//
// Run: node scripts/check-fleet.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");
const fs = require("fs");

function loadEsm(relative, extra = {}) {
  const shim = { exports: {} };
  vm.runInNewContext(
    babel.transformFileSync(path.join(__dirname, "..", relative), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    }).code,
    {
      module: shim,
      exports: shim.exports,
      require: (specifier) =>
        specifier.endsWith("vehiclePapers")
          ? loadEsm("src/data/vehiclePapers.js")
          : (extra[specifier] ?? {}),
      console,
    },
  );
  return shim.exports;
}

const {
  fleetDue,
  fleetSummary,
  isUsableVehicle,
  makeVehicle,
  paperUrgency,
  vehicleDue,
  vehicleWorst,
} = loadEsm("src/data/fleet.js");
const { paperKinds, EXPIRY_WARNING_DAYS } = loadEsm("src/data/vehiclePapers.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// A fixed today, because every assertion below is about a boundary and a
// test that reads the clock cannot sit on one.
const TODAY = new Date(2026, 7, 27);
const daysAway = (n) =>
  new Date(TODAY.getTime() + n * 86400000).toISOString();

const RENEWABLE = paperKinds.filter((kind) => kind.renewable).map((k) => k.key);

// ── The order ───────────────────────────────────────────────────────────
check("insurance outranks everything", paperUrgency("insurance"), 0);
check("the roadworthiness test is second", paperUrgency("technical"), 1);
check(
  "a paper with no legal deadline sorts last",
  paperUrgency("registration") > paperUrgency("vignette"),
  true,
);

const twoVehicles = [
  makeVehicle("a", "Hilux", "AB 1234 RB", "Rodrigue"),
  makeVehicle("b", "Corolla", "", ""),
];

// The exact case the ordering exists for: an oil-change-style deadline
// months overdue against an insurance that lapsed yesterday. Sorting purely
// by lateness puts the wrong one first.
const mixed = {
  a: { vignette: daysAway(-120) },
  b: { insurance: daysAway(-1) },
};
const mixedDue = fleetDue(twoVehicles, mixed, TODAY);
check("both are queued", mixedDue.length, 2);
check(
  "the insurance that lapsed yesterday comes before the tax months overdue",
  mixedDue[0].kind.key,
  "insurance",
);

// Within one rank, the furthest gone wins.
const twoInsurances = {
  a: { insurance: daysAway(-3) },
  b: { insurance: daysAway(-40) },
};
const sameKind = fleetDue(twoVehicles, twoInsurances, TODAY);
check("the older lapse is first", sameKind[0].vehicle.id, "b");

// Expired always beats merely due, even across ranks: an expired vignette
// is a fine today, a technical inspection due next month is not.
const expiredVsSoon = {
  a: { vignette: daysAway(-1) },
  b: { technical: daysAway(10) },
};
const across = fleetDue(twoVehicles, expiredVsSoon, TODAY);
check("expired outranks due", across[0].kind.key, "vignette");

// ── What stays out of the queue ─────────────────────────────────────────
//
// A paper with no date is unknown, not overdue. Queuing it would put the
// same unactionable row at the top every day until somebody filled it in,
// which is how a list stops being read.
const nothingKnown = fleetDue(twoVehicles, {}, TODAY);
check("an undated paper is not queued", nothingKnown.length, 0);
check(
  "a paper still valid is not queued",
  fleetDue(twoVehicles, { a: { insurance: daysAway(200) } }, TODAY).length,
  0,
);
// The boundary itself, which is where an off-by-one would live.
check(
  `a paper ${EXPIRY_WARNING_DAYS} days out is queued`,
  fleetDue(twoVehicles, { a: { insurance: daysAway(EXPIRY_WARNING_DAYS) } }, TODAY)
    .length,
  1,
);
check(
  `a paper ${EXPIRY_WARNING_DAYS + 1} days out is not`,
  fleetDue(
    twoVehicles,
    { a: { insurance: daysAway(EXPIRY_WARNING_DAYS + 1) } },
    TODAY,
  ).length,
  0,
);

// ── The card, which does show unknowns ──────────────────────────────────
const worstUnknown = vehicleWorst(twoVehicles[1], {}, TODAY);
check("a vehicle with no dates still says so", worstUnknown.status.state, "unknown");
const worstExpired = vehicleWorst(
  twoVehicles[0],
  { a: { insurance: daysAway(-2), technical: daysAway(-90) } },
  TODAY,
);
check(
  "the card leads with the legal one when both are expired",
  worstExpired.kind.key,
  "insurance",
);

// ── The carte grise ─────────────────────────────────────────────────────
//
// It does not expire, so it can never be an échéance. Including it would
// produce a deadline the document does not have.
const dueKeys = vehicleDue(twoVehicles[0], {}, TODAY).map((e) => e.kind.key);
check("the registration document is not a deadline", dueKeys.includes("registration"), false);
check("every renewable paper is one", dueKeys.length, RENEWABLE.length);

// ── The headline counts ─────────────────────────────────────────────────
const summary = fleetSummary(twoVehicles, mixed, TODAY);
check("vehicles are counted", summary.vehicles, 2);
check("expired are counted", summary.expired, 2);
check("known dates are counted", summary.known, 2);
check("against every slot there is", summary.slots, 2 * RENEWABLE.length);

// ── A vehicle needs a name and nothing else ─────────────────────────────
check("a name is enough", isUsableVehicle(makeVehicle("x", "le taxi", "", "")), true);
check("a blank name is not", isUsableVehicle(makeVehicle("x", "  ", "AB 1", "Sam")), false);

// ── Nothing is seeded ───────────────────────────────────────────────────
//
// This is the one screen where example data would be indistinguishable from
// the reader's own. A plate or a person's name appearing in either file
// means somebody shipped a demo fleet.
for (const file of ["src/data/fleet.js", "src/hooks/useFleet.js"]) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const plates = code.match(/["'][A-Z]{2}\s?\d{3,4}\s?[A-Z]{2}["']/g) ?? [];
  check(`${file} ships no plate (${plates.join(", ")})`, plates.length, 0);
  const seeded = /vehicles:\s*\[\s*\{/.test(code);
  check(`${file} ships no vehicle list`, seeded, false);
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: fleet — ${RENEWABLE.length} renewable papers per vehicle, ` +
    `legal deadlines ranked above maintenance, undated papers stay out of the ` +
    `queue, nothing seeded`,
);
