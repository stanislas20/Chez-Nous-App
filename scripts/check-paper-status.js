// Guards the only arithmetic on the Papiers screen.
//
// The screen has no providers and no prices, so nothing here can be wrong
// about the world — but it can be wrong about a date, and a date is what the
// reader is trusting. Telling somebody their insurance is valid on the day it
// lapsed is the failure that matters, and it lives entirely at the
// boundaries: the day of expiry, and the edge of the warning window.
//
// Run: node scripts/check-paper-status.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");

function loadEsm(relative) {
  const shim = { exports: {} };
  vm.runInNewContext(
    babel.transformFileSync(path.join(__dirname, "..", relative), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    }).code,
    { module: shim, exports: shim.exports, require: () => ({}), console },
  );
  return shim.exports;
}

const {
  paperKinds,
  paperStatus,
  sortPapers,
  countNeedingAttention,
  EXPIRY_WARNING_DAYS,
} = loadEsm("src/data/vehiclePapers.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

const TODAY = new Date(2026, 7, 25); // 25 August 2026, local midnight
const plusDays = (n) => new Date(2026, 7, 25 + n).toISOString();

const renewable = paperKinds.find((k) => k.renewable);
const permanent = paperKinds.find((k) => !k.renewable);
const stateOn = (offset) =>
  paperStatus(renewable, plusDays(offset), TODAY).state;

// ── The two boundaries ──────────────────────────────────────────────────
// A document that expires today is still valid today. Off-by-one here reads
// as "expired" to somebody whose paper is good until midnight.
check("expires today is not expired", stateOn(0), "soon");
check("expired yesterday", stateOn(-1), "expired");
check("expired long ago", stateOn(-400), "expired");

// The warning window is inclusive at its far edge and silent one day beyond.
check(
  `${EXPIRY_WARNING_DAYS} days out still warns`,
  stateOn(EXPIRY_WARNING_DAYS),
  "soon",
);
check(
  `${EXPIRY_WARNING_DAYS + 1} days out is quiet`,
  stateOn(EXPIRY_WARNING_DAYS + 1),
  "valid",
);
check("a year out is quiet", stateOn(365), "valid");

// ── The counts the days report ──────────────────────────────────────────
check("days remaining", paperStatus(renewable, plusDays(30), TODAY).days, 30);
check("days overdue", paperStatus(renewable, plusDays(-12), TODAY).days, -12);

// ── Nothing entered is never mistaken for good news ─────────────────────
check(
  "no date is unknown",
  paperStatus(renewable, null, TODAY).state,
  "unknown",
);
check(
  "no date has no day count",
  paperStatus(renewable, null, TODAY).days,
  null,
);

// ── A carte grise has no deadline to invent ─────────────────────────────
check("held", paperStatus(permanent, true, TODAY).state, "held");
check("not held", paperStatus(permanent, null, TODAY).state, "missing");
check(
  "permanent papers never count days",
  paperStatus(permanent, true, TODAY).days,
  null,
);

// ── Order: what needs doing comes first ─────────────────────────────────
const entries = [
  { key: "valid", status: paperStatus(renewable, plusDays(300), TODAY) },
  { key: "expired", status: paperStatus(renewable, plusDays(-3), TODAY) },
  { key: "unknown", status: paperStatus(renewable, null, TODAY) },
  { key: "soonLater", status: paperStatus(renewable, plusDays(40), TODAY) },
  { key: "soonSooner", status: paperStatus(renewable, plusDays(5), TODAY) },
];
const order = sortPapers(entries).map((e) => e.key);
check(
  "expired first, then nearest expiry, then the rest",
  order.join(","),
  "expired,soonSooner,soonLater,unknown,valid",
);

// The headline count must mean "needs doing" and nothing else — an unknown
// date is not a problem the reader has, it is one the app has.
check("count of things to deal with", countNeedingAttention(entries), 3);

// ── Every kind must be renderable ───────────────────────────────────────
paperKinds.forEach((kind) => {
  check(
    `${kind.key} has both labels`,
    Boolean(kind.labelEn && kind.labelFr),
    true,
  );
  check(`${kind.key} has an icon`, Boolean(kind.icon), true);
});

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: paper status — ${paperKinds.length} kinds, boundaries at 0 and ${EXPIRY_WARNING_DAYS} days`,
);
