// Tyres, which are bought by a number nobody remembers.
//
// A tyre only fits one size, so a size is the whole search: showing somebody
// every tyre in Cotonou when only three of them fit their car is worse than
// showing nothing. Everything here exists to get that number right and then
// match on it exactly.
//
// Nothing in this file invents a seller, a price or a stock level. Those are
// declared by whoever publishes, the same rule the roadside fields follow.

// 195/65 R15 — width in mm, sidewall as a percentage of the width, rim in
// inches. Stored as three numbers so the form can validate each one, and as
// a normalised string so matching is a plain equality test rather than three
// comparisons that could each drift.
export function formatTyreSize(width, ratio, diameter) {
  if (!width || !ratio || !diameter) return null;
  return `${width}/${ratio} R${diameter}`;
}

export function parseTyreSize(text) {
  if (!text) return null;
  const match = String(text)
    .trim()
    .match(/^(\d{3})\s*\/\s*(\d{2})\s*R?\s*(\d{2})$/i);
  if (!match) return null;
  return {
    width: Number(match[1]),
    ratio: Number(match[2]),
    diameter: Number(match[3]),
  };
}

// The plausible range for a passenger car or light van. Outside it the reader
// has almost certainly mistyped, and a typo that silently returns "no offers"
// looks identical to a market with no stock — so the form says so instead.
const TYRE_LIMITS = {
  width: { min: 125, max: 355 },
  ratio: { min: 25, max: 85 },
  diameter: { min: 12, max: 22 },
};

export function isValidTyreSize(width, ratio, diameter) {
  const inRange = (value, bounds) =>
    Number.isFinite(value) && value >= bounds.min && value <= bounds.max;
  return (
    inRange(Number(width), TYRE_LIMITS.width) &&
    inRange(Number(ratio), TYRE_LIMITS.ratio) &&
    inRange(Number(diameter), TYRE_LIMITS.diameter)
  );
}

export const tyreConditions = [
  { key: "new", labelEn: "New", labelFr: "Neuf" },
  { key: "used", labelEn: "Used", labelFr: "Occasion" },
];

export function getTyreConditionLabel(key, language) {
  const item = tyreConditions.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// What a tyre professional does, as they declare it. "Se déplace" is kept
// separate from the rest because it answers a different question — not what
// they can do, but whether it can happen where the car is stuck.
export const tyreServices = [
  { key: "fitting", labelEn: "Fitting", labelFr: "Montage" },
  { key: "balancing", labelEn: "Balancing", labelFr: "Équilibrage" },
  { key: "alignment", labelEn: "Alignment", labelFr: "Géométrie" },
  { key: "repair", labelEn: "Puncture repair", labelFr: "Réparation" },
  { key: "inflation", labelEn: "Inflation", labelFr: "Gonflage" },
  { key: "mobile", labelEn: "Mobile fitting", labelFr: "Montage mobile" },
];

export function getTyreServiceLabel(key, language) {
  const item = tyreServices.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// Whether the price already includes putting the tyre on the car. It is the
// difference people actually get caught by: the cheapest tyre in the list is
// not the cheapest tyre on the car.
export const tyreFittingModes = [
  { key: "included", labelEn: "Fitting included", labelFr: "Montage inclus" },
  { key: "extra", labelEn: "Fitting extra", labelFr: "Montage en supplément" },
  { key: "none", labelEn: "Tyre only", labelFr: "Pneu seul" },
];

export function getTyreFittingLabel(key, language) {
  const item = tyreFittingModes.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// A used tyre with plenty of tread can still be too old to trust: the rubber
// hardens with age whether or not it has been driven on. The DOT year is
// stamped on the sidewall, so it is a fact the seller can read off rather
// than an opinion, and past this many years the card says so plainly.
export const TYRE_AGE_WARN_YEARS = 6;

export function tyreAgeYears(dotYear, now) {
  if (!dotYear) return null;
  const currentYear = (now ?? new Date()).getFullYear();
  const age = currentYear - Number(dotYear);
  if (!Number.isFinite(age) || age < 0) return null;
  return age;
}

export function isAgedTyre(dotYear, now) {
  const age = tyreAgeYears(dotYear, now);
  return age != null && age >= TYRE_AGE_WARN_YEARS;
}

// The years a seller can pick from. A tyre older than this is not something
// anyone should be fitting, so the list stops rather than letting someone
// declare a fifteen-year-old casing as stock.
export function tyreDotYears(now) {
  const currentYear = (now ?? new Date()).getFullYear();
  return Array.from({ length: 12 }, (_, index) => currentYear - index);
}

// How long ago a seller said they had this many.
//
// A stock count is a claim that ages: "3 en stock" is useful the week it was
// written and quietly wrong six months later, and there is no way for the
// app to know which. Rather than hide it or trust it, the card shows it with
// its age once the listing is no longer recent — the same bargain the
// roadside availability badge makes, and it lets the reader decide.
const STOCK_FRESH_DAYS = 14;

export function stockAgeLabel(createdAt, language, now = Date.now()) {
  const at =
    createdAt?.toMillis?.() ??
    (createdAt?.seconds ? createdAt.seconds * 1000 : null);
  if (!at) return null;
  const days = Math.floor((now - at) / 86400000);
  if (days < STOCK_FRESH_DAYS) return null;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return language === "en"
      ? `${weeks} weeks ago`
      : `il y a ${weeks} semaines`;
  }
  const months = Math.round(days / 30);
  return language === "en" ? `${months} months ago` : `il y a ${months} mois`;
}

// The sizes a model is commonly found on.
//
// Deliberately a list per model, not one answer. The same nameplate runs for
// fifteen years across three generations and half a dozen trims, and its
// wheels change with them — a Corolla left the factory on anything from
// 175/70 R14 to 205/55 R16. Printing a single size per model would be a
// confident answer that is wrong for most of the cars carrying that badge.
//
// HOW THESE WERE BUILT, so nobody mistakes this for a fitment database:
// the cars most often seen here — Corolla, Hilux, 206, Picanto, Micra, i10,
// Classe C, Jimny and the rest — carry their real spread, written out one by
// one. Everything else carries the range typical of its segment: a compact
// hatch gets 195/65 R15 · 205/55 R16 · 225/45 R17, a one-tonne pickup gets
// 245/70 R16 · 255/65 R17 · 265/65 R17. That is right often enough to be a
// useful shortlist and wrong often enough that it must never be treated as
// this car's size.
//
// Which is exactly how the screen uses it: a shortlist to check against,
// never a lookup that decides. The reader picks the one matching their car,
// the caveat sits above the button, and the size lands in the search box
// where it can be corrected. Nothing here ever filters silently on
// somebody's behalf. Replacing this with real per-generation OE data is a
// drop-in — same shape, better numbers.
export const tyreVehicleSizes = [
  {
    make: "Acura",
    model: "ILX",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Acura",
    model: "MDX",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Acura",
    model: "RDX",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Acura",
    model: "RL",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Acura",
    model: "TL",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Acura",
    model: "TLX",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Acura",
    model: "TSX",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Acura",
    model: "ZDX",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Alfa Romeo",
    model: "145",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "146",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "147",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "155",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "156",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "159",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "164",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Alfa Romeo",
    model: "166",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Alfa Romeo",
    model: "4C",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Alfa Romeo",
    model: "Brera",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Alfa Romeo",
    model: "Giulia",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "Giulietta",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "GT",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Alfa Romeo",
    model: "GTV",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Alfa Romeo",
    model: "MiTo",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Alfa Romeo",
    model: "Spider",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Alfa Romeo",
    model: "Stelvio",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Alfa Romeo",
    model: "Tonale",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Audi",
    model: "A1",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Audi",
    model: "A2",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Audi",
    model: "A3",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Audi",
    model: "A4",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Audi",
    model: "A5",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Audi",
    model: "A6",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  { make: "Audi", model: "A7", sizes: ["245/45 R18", "255/40 R19"] },
  { make: "Audi", model: "A8", sizes: ["245/45 R18", "255/40 R19"] },
  {
    make: "Audi",
    model: "Q2",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Audi",
    model: "Q3",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Audi",
    model: "Q5",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Audi",
    model: "Q7",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Audi",
    model: "Q8",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Audi",
    model: "TT",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "BMW",
    model: "Série 1",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "BMW",
    model: "Série 2",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "BMW",
    model: "Série 3",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "BMW",
    model: "Série 4",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "BMW",
    model: "Série 5",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  { make: "BMW", model: "Série 6", sizes: ["245/45 R18", "255/40 R19"] },
  { make: "BMW", model: "Série 7", sizes: ["245/45 R18", "255/40 R19"] },
  { make: "BMW", model: "Série 8", sizes: ["245/45 R18", "255/40 R19"] },
  {
    make: "BMW",
    model: "i3",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "BMW",
    model: "X1",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "BMW",
    model: "X2",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "BMW",
    model: "X3",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "BMW",
    model: "X4",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "BMW",
    model: "X5",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "BMW",
    model: "X6",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "BMW",
    model: "X7",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "BMW",
    model: "Z3",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "BMW",
    model: "Z4",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "BYD",
    model: "Atto 3",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "BYD",
    model: "Dolphin",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "BYD",
    model: "F0",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "BYD",
    model: "F3",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "BYD",
    model: "Han",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "BYD",
    model: "Song",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "BYD",
    model: "Tang",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "BYD",
    model: "Yuan",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Cadillac",
    model: "ATS",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Cadillac",
    model: "CTS",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Cadillac",
    model: "Escalade",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Cadillac",
    model: "SRX",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Cadillac",
    model: "STS",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Cadillac",
    model: "XT5",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Changan",
    model: "Alsvin",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Changan",
    model: "CS15",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Changan",
    model: "CS35",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Changan",
    model: "CS55",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Changan",
    model: "CS75",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Changan",
    model: "Eado",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Changan",
    model: "Hunter",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Chery",
    model: "Arrizo",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Chery",
    model: "QQ",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Chery",
    model: "Tiggo",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Chery",
    model: "Tiggo 2",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Chery",
    model: "Tiggo 3",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Chery",
    model: "Tiggo 4",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Chery",
    model: "Tiggo 7",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Chery",
    model: "Tiggo 8",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Chevrolet",
    model: "Aveo",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Chevrolet",
    model: "Blazer",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Chevrolet",
    model: "Camaro",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Chevrolet",
    model: "Captiva",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Chevrolet",
    model: "Colorado",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Chevrolet",
    model: "Cruze",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Chevrolet",
    model: "Epica",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Chevrolet",
    model: "Equinox",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Chevrolet",
    model: "Impala",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Chevrolet",
    model: "Kalos",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Chevrolet",
    model: "Lacetti",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Chevrolet",
    model: "Malibu",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Chevrolet",
    model: "Matiz",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Chevrolet",
    model: "Optra",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Chevrolet",
    model: "Orlando",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Chevrolet",
    model: "Silverado",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Chevrolet",
    model: "Sonic",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Chevrolet",
    model: "Spark",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Chevrolet",
    model: "Suburban",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Chevrolet",
    model: "Tahoe",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Chevrolet",
    model: "Trailblazer",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Chevrolet",
    model: "Traverse",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Chevrolet",
    model: "Trax",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Chrysler",
    model: "200",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Chrysler",
    model: "300C",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Chrysler",
    model: "Pacifica",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Chrysler",
    model: "PT Cruiser",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Chrysler",
    model: "Sebring",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Chrysler",
    model: "Town & Country",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Chrysler",
    model: "Voyager",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Citroën",
    model: "AX",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Citroën",
    model: "Berlingo",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Citroën",
    model: "C1",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Citroën",
    model: "C2",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Citroën",
    model: "C3",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Citroën",
    model: "C3 Aircross",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Citroën",
    model: "C4",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Citroën",
    model: "C4 Cactus",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Citroën",
    model: "C5",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Citroën",
    model: "C5 Aircross",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Citroën",
    model: "C6",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Citroën",
    model: "C8",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Citroën",
    model: "C-Elysée",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Citroën",
    model: "DS3",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Citroën",
    model: "DS4",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Citroën",
    model: "DS5",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Citroën",
    model: "Jumper",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Citroën",
    model: "Jumpy",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Citroën",
    model: "Nemo",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Citroën",
    model: "Saxo",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Citroën",
    model: "Xantia",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Citroën",
    model: "Xsara",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Citroën",
    model: "ZX",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Dacia",
    model: "Dokker",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Dacia",
    model: "Duster",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Dacia",
    model: "Lodgy",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Dacia",
    model: "Logan",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Dacia",
    model: "Sandero",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Dacia",
    model: "Spring",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Daihatsu",
    model: "Charade",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Daihatsu",
    model: "Copen",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Daihatsu",
    model: "Materia",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Daihatsu",
    model: "Sirion",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Daihatsu",
    model: "Terios",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Daihatsu",
    model: "YRV",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Dodge",
    model: "Avenger",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Dodge",
    model: "Caliber",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Dodge",
    model: "Caravan",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Dodge",
    model: "Challenger",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Dodge",
    model: "Charger",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Dodge",
    model: "Durango",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Dodge",
    model: "Journey",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Dodge",
    model: "Nitro",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Dodge",
    model: "RAM",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Fiat",
    model: "500",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Fiat",
    model: "500L",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Fiat",
    model: "500X",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Fiat",
    model: "Bravo",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Fiat",
    model: "Doblo",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Fiat",
    model: "Ducato",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Fiat",
    model: "Fiorino",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Fiat",
    model: "Freemont",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Fiat",
    model: "Grande Punto",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Fiat",
    model: "Linea",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Fiat",
    model: "Palio",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Fiat",
    model: "Panda",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Fiat",
    model: "Punto",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Fiat",
    model: "Qubo",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Fiat",
    model: "Scudo",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Fiat",
    model: "Seicento",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Fiat",
    model: "Stilo",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Fiat",
    model: "Tipo",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Fiat",
    model: "Uno",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Ford",
    model: "B-Max",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Ford",
    model: "Bronco",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Ford",
    model: "C-Max",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Ford",
    model: "EcoSport",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Ford",
    model: "Edge",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Ford",
    model: "Escape",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Ford",
    model: "Escort",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Ford",
    model: "Everest",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Ford",
    model: "Expedition",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Ford",
    model: "Explorer",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Ford",
    model: "F-150",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  { make: "Ford", model: "Fiesta", sizes: ["175/65 R14", "195/60 R15"] },
  {
    make: "Ford",
    model: "Figo",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  { make: "Ford", model: "Focus", sizes: ["195/65 R15", "205/55 R16"] },
  {
    make: "Ford",
    model: "Fusion",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Ford",
    model: "Galaxy",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Ford",
    model: "Kuga",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Ford",
    model: "Mondeo",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Ford",
    model: "Mustang",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  { make: "Ford", model: "Ranger", sizes: ["245/70 R16", "265/65 R17"] },
  {
    make: "Ford",
    model: "S-Max",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Ford",
    model: "Territory",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Ford",
    model: "Tourneo",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Ford",
    model: "Transit",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Foton",
    model: "Aumark",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Foton",
    model: "Sauvana",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Foton",
    model: "Tunland",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Foton",
    model: "View",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Geely",
    model: "Atlas",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Geely",
    model: "Coolray",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Geely",
    model: "Emgrand",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Geely",
    model: "GX3",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Geely",
    model: "Okavango",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Geely",
    model: "Tugella",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "GMC",
    model: "Acadia",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "GMC",
    model: "Canyon",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "GMC",
    model: "Envoy",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "GMC",
    model: "Sierra",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "GMC",
    model: "Terrain",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "GMC",
    model: "Yukon",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Great Wall",
    model: "Haval H2",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Great Wall",
    model: "Haval H6",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Great Wall",
    model: "Haval H9",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Great Wall",
    model: "Jolion",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Great Wall",
    model: "Poer",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Great Wall",
    model: "Steed",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Great Wall",
    model: "Wingle",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Honda",
    model: "Accord",
    sizes: ["195/65 R15", "205/60 R16", "225/50 R17"],
  },
  {
    make: "Honda",
    model: "City",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Honda",
    model: "Civic",
    sizes: ["185/65 R15", "195/65 R15", "205/55 R16"],
  },
  {
    make: "Honda",
    model: "CR-V",
    sizes: ["205/70 R15", "215/65 R16", "225/65 R17"],
  },
  {
    make: "Honda",
    model: "CR-Z",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Honda",
    model: "Element",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Honda",
    model: "Fit",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Honda",
    model: "HR-V",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Honda",
    model: "Insight",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Honda",
    model: "Jazz",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Honda",
    model: "Legend",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Honda",
    model: "Odyssey",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Honda",
    model: "Passport",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Honda",
    model: "Pilot",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Honda",
    model: "Prelude",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Honda",
    model: "Ridgeline",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Honda",
    model: "Stream",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Honda",
    model: "Vezel",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Hummer",
    model: "H2",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Hummer",
    model: "H3",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Hyundai",
    model: "Accent",
    sizes: ["175/70 R14", "185/65 R15", "195/50 R16"],
  },
  {
    make: "Hyundai",
    model: "Atos",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Hyundai",
    model: "Azera",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Hyundai",
    model: "Creta",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Hyundai",
    model: "Elantra",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Hyundai",
    model: "Galloper",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  { make: "Hyundai", model: "Getz", sizes: ["175/65 R14"] },
  {
    make: "Hyundai",
    model: "Grand i10",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Hyundai",
    model: "H1",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Hyundai",
    model: "H100",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  { make: "Hyundai", model: "i10", sizes: ["155/80 R13", "165/60 R14"] },
  {
    make: "Hyundai",
    model: "i20",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Hyundai",
    model: "i30",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Hyundai",
    model: "i40",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Hyundai",
    model: "Ioniq",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Hyundai",
    model: "ix35",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Hyundai",
    model: "Kona",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Hyundai",
    model: "Matrix",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Hyundai",
    model: "Palisade",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  { make: "Hyundai", model: "Santa Fe", sizes: ["235/65 R17", "235/60 R18"] },
  {
    make: "Hyundai",
    model: "Sonata",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Hyundai",
    model: "Starex",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Hyundai",
    model: "Terracan",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  { make: "Hyundai", model: "Tucson", sizes: ["215/65 R16", "225/60 R17"] },
  {
    make: "Hyundai",
    model: "Veloster",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Hyundai",
    model: "Venue",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Hyundai",
    model: "Verna",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Infiniti",
    model: "EX",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Infiniti",
    model: "FX",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Infiniti",
    model: "G35",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Infiniti",
    model: "M",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Infiniti",
    model: "Q50",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Infiniti",
    model: "QX50",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Infiniti",
    model: "QX56",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Infiniti",
    model: "QX60",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Infiniti",
    model: "QX80",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  { make: "Isuzu", model: "D-Max", sizes: ["245/70 R16", "255/65 R17"] },
  {
    make: "Isuzu",
    model: "KB",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Isuzu",
    model: "MU-X",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Isuzu",
    model: "Rodeo",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Isuzu",
    model: "Trooper",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  { make: "Iveco", model: "Daily", sizes: ["225/75 R16"] },
  {
    make: "JAC",
    model: "J3",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "JAC",
    model: "J5",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "JAC",
    model: "S2",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "JAC",
    model: "S3",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "JAC",
    model: "T6",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "JAC",
    model: "T8",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Jaguar",
    model: "E-Pace",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Jaguar",
    model: "F-Pace",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Jaguar",
    model: "F-Type",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Jaguar",
    model: "S-Type",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Jaguar",
    model: "X-Type",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Jaguar",
    model: "XE",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Jaguar",
    model: "XF",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  { make: "Jaguar", model: "XJ", sizes: ["245/45 R18", "255/40 R19"] },
  {
    make: "Jaguar",
    model: "XK",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Jeep",
    model: "Cherokee",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Jeep",
    model: "Commander",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Jeep",
    model: "Compass",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Jeep",
    model: "Gladiator",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Jeep",
    model: "Grand Cherokee",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Jeep",
    model: "Liberty",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Jeep",
    model: "Patriot",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Jeep",
    model: "Renegade",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Jeep",
    model: "Wrangler",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Kia",
    model: "Carens",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Kia",
    model: "Carnival",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Kia",
    model: "Ceed",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Kia",
    model: "Cerato",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Kia",
    model: "Forte",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Kia",
    model: "K5",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Kia",
    model: "Mohave",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Kia",
    model: "Morning",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Kia",
    model: "Niro",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Kia",
    model: "Opirus",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Kia",
    model: "Optima",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Kia",
    model: "Picanto",
    sizes: ["155/70 R13", "165/60 R14", "175/50 R15"],
  },
  {
    make: "Kia",
    model: "Pride",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Kia",
    model: "Rio",
    sizes: ["175/70 R14", "185/65 R15", "195/55 R16"],
  },
  {
    make: "Kia",
    model: "Sedona",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Kia",
    model: "Seltos",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Kia",
    model: "Sorento",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Kia",
    model: "Soul",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Kia",
    model: "Spectra",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  { make: "Kia", model: "Sportage", sizes: ["215/70 R16", "225/60 R17"] },
  {
    make: "Kia",
    model: "Stonic",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Kia",
    model: "Telluride",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Lada",
    model: "Granta",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Lada",
    model: "Niva",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Lada",
    model: "Vesta",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Land Rover",
    model: "Defender",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Land Rover",
    model: "Discovery",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Land Rover",
    model: "Discovery Sport",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Land Rover",
    model: "Freelander",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Land Rover",
    model: "Range Rover",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Land Rover",
    model: "Range Rover Evoque",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Land Rover",
    model: "Range Rover Sport",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Land Rover",
    model: "Range Rover Velar",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Lexus",
    model: "CT",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Lexus",
    model: "ES",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Lexus",
    model: "GS",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Lexus",
    model: "GX",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Lexus",
    model: "IS",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  { make: "Lexus", model: "LS", sizes: ["245/45 R18", "255/40 R19"] },
  {
    make: "Lexus",
    model: "LX",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Lexus",
    model: "NX",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Lexus",
    model: "RC",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Lexus",
    model: "RX",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Lexus",
    model: "UX",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mahindra",
    model: "Bolero",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Mahindra",
    model: "KUV100",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mahindra",
    model: "Pik Up",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Mahindra",
    model: "Scorpio",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Mahindra",
    model: "Thar",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Mahindra",
    model: "XUV500",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Mazda",
    model: "2",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Mazda",
    model: "3",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Mazda",
    model: "5",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Mazda",
    model: "6",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Mazda",
    model: "121",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Mazda",
    model: "323",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Mazda",
    model: "626",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Mazda",
    model: "BT-50",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Mazda",
    model: "CX-3",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mazda",
    model: "CX-30",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mazda",
    model: "CX-5",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Mazda",
    model: "CX-7",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Mazda",
    model: "CX-9",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Mazda",
    model: "Demio",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Mazda",
    model: "MX-5",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Mazda",
    model: "Premacy",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Mazda",
    model: "Tribute",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  { make: "Mercedes", model: "190 (W201)", sizes: ["185/65 R15"] },
  {
    make: "Mercedes",
    model: "Classe A",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Mercedes",
    model: "Classe B",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Mercedes",
    model: "Classe C",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Mercedes",
    model: "Classe E",
    sizes: ["195/65 R15", "215/55 R16", "225/55 R16"],
  },
  { make: "Mercedes", model: "Classe G", sizes: ["265/60 R18"] },
  { make: "Mercedes", model: "Classe S", sizes: ["245/45 R18", "255/40 R19"] },
  {
    make: "Mercedes",
    model: "CLA",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Mercedes",
    model: "CLK",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  { make: "Mercedes", model: "CLS", sizes: ["245/45 R18", "255/40 R19"] },
  {
    make: "Mercedes",
    model: "GL",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Mercedes",
    model: "GLA",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mercedes",
    model: "GLB",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mercedes",
    model: "GLC",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Mercedes",
    model: "GLE",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Mercedes",
    model: "GLK",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Mercedes",
    model: "GLS",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Mercedes",
    model: "ML",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Mercedes",
    model: "SLK",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  { make: "Mercedes", model: "Sprinter", sizes: ["195/75 R16", "235/65 R16"] },
  {
    make: "Mercedes",
    model: "Viano",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Mercedes",
    model: "Vito",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "MG",
    model: "MG3",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "MG",
    model: "MG5",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "MG",
    model: "MG6",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "MG",
    model: "MG HS",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "MG",
    model: "MG ZS",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mini",
    model: "Clubman",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Mini",
    model: "Cooper",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Mini",
    model: "Countryman",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mini",
    model: "Paceman",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mitsubishi",
    model: "ASX",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Mitsubishi",
    model: "Attrage",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Mitsubishi",
    model: "Colt",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Mitsubishi",
    model: "Eclipse",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Mitsubishi",
    model: "Galant",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Mitsubishi",
    model: "Grandis",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  { make: "Mitsubishi", model: "L200", sizes: ["205/80 R16", "245/70 R16"] },
  {
    make: "Mitsubishi",
    model: "Lancer",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Mitsubishi",
    model: "Mirage",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Mitsubishi",
    model: "Montero",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Mitsubishi",
    model: "Outlander",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  { make: "Mitsubishi", model: "Pajero", sizes: ["265/70 R16", "265/60 R18"] },
  {
    make: "Mitsubishi",
    model: "Pajero Sport",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Mitsubishi",
    model: "Space Star",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Mitsubishi",
    model: "Triton",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Mitsubishi",
    model: "Xpander",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  { make: "Nissan", model: "Almera", sizes: ["175/70 R14", "185/65 R15"] },
  {
    make: "Nissan",
    model: "Altima",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Nissan",
    model: "Armada",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Nissan",
    model: "Cube",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Nissan",
    model: "Frontier",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Nissan",
    model: "Juke",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Nissan",
    model: "Kicks",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Nissan",
    model: "Leaf",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Nissan",
    model: "Maxima",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Nissan",
    model: "Micra",
    sizes: ["155/80 R13", "165/70 R14", "175/60 R15"],
  },
  {
    make: "Nissan",
    model: "Murano",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Nissan",
    model: "Navara",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Nissan",
    model: "Note",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Nissan",
    model: "NV200",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Nissan",
    model: "Pathfinder",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  { make: "Nissan", model: "Patrol", sizes: ["265/70 R16"] },
  {
    make: "Nissan",
    model: "Primera",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  { make: "Nissan", model: "Qashqai", sizes: ["215/65 R16", "215/60 R17"] },
  {
    make: "Nissan",
    model: "Rogue",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Nissan",
    model: "Sentra",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Nissan",
    model: "Sunny",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Nissan",
    model: "Sylphy",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Nissan",
    model: "Teana",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Nissan",
    model: "Terrano",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Nissan",
    model: "Tiida",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Nissan",
    model: "Titan",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Nissan",
    model: "Versa",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Nissan",
    model: "X-Trail",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Nissan",
    model: "Xterra",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Opel",
    model: "Adam",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Opel",
    model: "Agila",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Opel",
    model: "Antara",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Opel",
    model: "Astra",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Opel",
    model: "Combo",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Opel",
    model: "Corsa",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Opel",
    model: "Crossland",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Opel",
    model: "Frontera",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Opel",
    model: "Grandland",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Opel",
    model: "Insignia",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Opel",
    model: "Meriva",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Opel",
    model: "Mokka",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Opel",
    model: "Movano",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Opel",
    model: "Omega",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Opel",
    model: "Vectra",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Opel",
    model: "Vivaro",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Opel",
    model: "Zafira",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Peugeot",
    model: "106",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Peugeot",
    model: "107",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Peugeot",
    model: "108",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  { make: "Peugeot", model: "205", sizes: ["155/70 R13", "165/70 R13"] },
  { make: "Peugeot", model: "206", sizes: ["165/70 R14", "185/60 R15"] },
  {
    make: "Peugeot",
    model: "207",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Peugeot",
    model: "208",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Peugeot",
    model: "301",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Peugeot",
    model: "305",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  { make: "Peugeot", model: "306", sizes: ["185/65 R15"] },
  { make: "Peugeot", model: "307", sizes: ["195/65 R15", "205/55 R16"] },
  {
    make: "Peugeot",
    model: "308",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Peugeot",
    model: "309",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  { make: "Peugeot", model: "405", sizes: ["175/70 R14", "185/65 R14"] },
  { make: "Peugeot", model: "406", sizes: ["195/65 R15", "205/60 R15"] },
  {
    make: "Peugeot",
    model: "407",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Peugeot",
    model: "408",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Peugeot",
    model: "508",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Peugeot",
    model: "605",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Peugeot",
    model: "607",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Peugeot",
    model: "1007",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Peugeot",
    model: "2008",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Peugeot",
    model: "3008",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Peugeot",
    model: "5008",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Peugeot",
    model: "Bipper",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Peugeot",
    model: "Boxer",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Peugeot",
    model: "Expert",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  { make: "Peugeot", model: "Partner", sizes: ["175/65 R14", "195/65 R15"] },
  {
    make: "Peugeot",
    model: "RCZ",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Peugeot",
    model: "Rifter",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Peugeot",
    model: "Traveller",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Porsche",
    model: "718",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Porsche",
    model: "911",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Porsche",
    model: "Boxster",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Porsche",
    model: "Cayenne",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Porsche",
    model: "Cayman",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Porsche",
    model: "Macan",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  { make: "Porsche", model: "Panamera", sizes: ["245/45 R18", "255/40 R19"] },
  { make: "Porsche", model: "Taycan", sizes: ["245/45 R18", "255/40 R19"] },
  {
    make: "Proton",
    model: "Persona",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Proton",
    model: "Saga",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Proton",
    model: "X70",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Renault",
    model: "Captur",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  { make: "Renault", model: "Clio", sizes: ["165/70 R14", "185/60 R15"] },
  {
    make: "Renault",
    model: "Duster",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Renault",
    model: "Espace",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Renault",
    model: "Fluence",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Renault",
    model: "Kadjar",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  { make: "Renault", model: "Kangoo", sizes: ["175/65 R14", "195/65 R15"] },
  {
    make: "Renault",
    model: "Koleos",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Renault",
    model: "Laguna",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  { make: "Renault", model: "Logan", sizes: ["185/70 R14", "185/65 R15"] },
  {
    make: "Renault",
    model: "Master",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Renault",
    model: "Mégane",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Renault",
    model: "Modus",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Renault",
    model: "R19",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Renault",
    model: "R21",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Renault",
    model: "Sandero",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Renault",
    model: "Scénic",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Renault",
    model: "Symbol",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Renault",
    model: "Talisman",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Renault",
    model: "Trafic",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Renault",
    model: "Twingo",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Renault",
    model: "Zoe",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Seat",
    model: "Alhambra",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Seat",
    model: "Altea",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Seat",
    model: "Arona",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Seat",
    model: "Ateca",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Seat",
    model: "Cordoba",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Seat",
    model: "Ibiza",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Seat",
    model: "Leon",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Seat",
    model: "Toledo",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Skoda",
    model: "Fabia",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Skoda",
    model: "Kamiq",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Skoda",
    model: "Karoq",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Skoda",
    model: "Kodiaq",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Skoda",
    model: "Octavia",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Skoda",
    model: "Rapid",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Skoda",
    model: "Roomster",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Skoda",
    model: "Scala",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Skoda",
    model: "Superb",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Skoda",
    model: "Yeti",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Smart",
    model: "Forfour",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Smart",
    model: "Fortwo",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "SsangYong",
    model: "Actyon",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "SsangYong",
    model: "Korando",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "SsangYong",
    model: "Kyron",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "SsangYong",
    model: "Musso",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "SsangYong",
    model: "Rexton",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "SsangYong",
    model: "Rodius",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "SsangYong",
    model: "Tivoli",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Subaru",
    model: "Ascent",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Subaru",
    model: "BRZ",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Subaru",
    model: "Crosstrek",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Subaru",
    model: "Forester",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Subaru",
    model: "Impreza",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Subaru",
    model: "Legacy",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Subaru",
    model: "Outback",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Subaru",
    model: "Tribeca",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Subaru",
    model: "WRX",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Subaru",
    model: "XV",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  { make: "Suzuki", model: "Alto", sizes: ["145/80 R13", "155/65 R14"] },
  {
    make: "Suzuki",
    model: "Baleno",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Suzuki",
    model: "Celerio",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Suzuki",
    model: "Ciaz",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Suzuki",
    model: "Dzire",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Suzuki",
    model: "Ertiga",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Suzuki",
    model: "Grand Vitara",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Suzuki",
    model: "Ignis",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  { make: "Suzuki", model: "Jimny", sizes: ["195/80 R15", "205/70 R15"] },
  {
    make: "Suzuki",
    model: "Liana",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Suzuki",
    model: "S-Cross",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Suzuki",
    model: "Splash",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Suzuki",
    model: "Swift",
    sizes: ["165/70 R14", "185/60 R15", "195/50 R16"],
  },
  {
    make: "Suzuki",
    model: "SX4",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Suzuki",
    model: "Vitara",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Suzuki",
    model: "Wagon R",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Suzuki",
    model: "XL7",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Tata",
    model: "Indica",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Tata",
    model: "Indigo",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Tata",
    model: "Nexon",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Tata",
    model: "Safari",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Tata",
    model: "Sumo",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  {
    make: "Tata",
    model: "Xenon",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Toyota",
    model: "4Runner",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Toyota",
    model: "Auris",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Toyota",
    model: "Avalon",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Toyota",
    model: "Avensis",
    sizes: ["195/65 R15", "205/55 R16", "215/50 R17"],
  },
  {
    make: "Toyota",
    model: "Aygo",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Toyota",
    model: "C-HR",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Toyota",
    model: "Camry",
    sizes: ["205/65 R15", "215/60 R16", "215/55 R17"],
  },
  {
    make: "Toyota",
    model: "Carina",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Toyota",
    model: "Celica",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Toyota",
    model: "Corolla",
    sizes: ["175/70 R14", "185/65 R15", "195/65 R15", "205/55 R16"],
  },
  {
    make: "Toyota",
    model: "Corolla Cross",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Toyota",
    model: "Corolla Verso",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Toyota",
    model: "FJ Cruiser",
    sizes: ["255/70 R16", "265/70 R16", "265/65 R17"],
  },
  { make: "Toyota", model: "Fortuner", sizes: ["265/65 R17"] },
  { make: "Toyota", model: "Hiace", sizes: ["195/70 R15", "195/80 R15"] },
  {
    make: "Toyota",
    model: "Highlander",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Toyota",
    model: "Hilux",
    sizes: ["205/70 R15", "225/70 R17", "265/65 R17"],
  },
  {
    make: "Toyota",
    model: "Land Cruiser",
    sizes: ["275/70 R16", "285/60 R18"],
  },
  {
    make: "Toyota",
    model: "Land Cruiser Prado",
    sizes: ["265/70 R16", "265/65 R17"],
  },
  {
    make: "Toyota",
    model: "Matrix",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Toyota",
    model: "Previa",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Toyota",
    model: "Prius",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  { make: "Toyota", model: "Probox", sizes: ["155/80 R14"] },
  {
    make: "Toyota",
    model: "RAV4",
    sizes: ["215/70 R16", "225/65 R17", "235/55 R18"],
  },
  {
    make: "Toyota",
    model: "Rush",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Toyota",
    model: "Sequoia",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Toyota",
    model: "Sienna",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Toyota",
    model: "Solara",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Toyota",
    model: "Tacoma",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Toyota",
    model: "Tundra",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Toyota",
    model: "Urban Cruiser",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Toyota",
    model: "Venza",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Toyota",
    model: "Verso",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Toyota",
    model: "Vios",
    sizes: ["175/65 R14", "185/60 R15", "195/55 R16"],
  },
  {
    make: "Toyota",
    model: "Yaris",
    sizes: ["165/70 R14", "175/65 R14", "185/60 R15"],
  },
  {
    make: "Volkswagen",
    model: "Amarok",
    sizes: ["245/70 R16", "255/65 R17", "265/65 R17"],
  },
  {
    make: "Volkswagen",
    model: "Arteon",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Volkswagen",
    model: "Beetle",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Volkswagen",
    model: "Bora",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Volkswagen",
    model: "Caddy",
    sizes: ["185/65 R15", "195/65 R15", "205/65 R15"],
  },
  {
    make: "Volkswagen",
    model: "Crafter",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  { make: "Volkswagen", model: "Golf", sizes: ["195/65 R15", "205/55 R16"] },
  {
    make: "Volkswagen",
    model: "Jetta",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  { make: "Volkswagen", model: "Passat", sizes: ["195/65 R15", "215/55 R16"] },
  { make: "Volkswagen", model: "Polo", sizes: ["175/70 R14", "185/60 R15"] },
  {
    make: "Volkswagen",
    model: "Scirocco",
    sizes: ["225/45 R17", "235/40 R18", "245/40 R19"],
  },
  {
    make: "Volkswagen",
    model: "Sharan",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Volkswagen",
    model: "T-Cross",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Volkswagen",
    model: "T-Roc",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Volkswagen",
    model: "Tiguan",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Volkswagen",
    model: "Touareg",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
  {
    make: "Volkswagen",
    model: "Touran",
    sizes: ["205/60 R16", "215/60 R16", "225/55 R17"],
  },
  {
    make: "Volkswagen",
    model: "Transporter",
    sizes: ["215/65 R16", "225/65 R16", "235/65 R16"],
  },
  {
    make: "Volkswagen",
    model: "Up",
    sizes: ["155/70 R13", "165/65 R14", "175/65 R14"],
  },
  {
    make: "Volkswagen",
    model: "Vento",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Volvo",
    model: "C30",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Volvo",
    model: "S40",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Volvo",
    model: "S60",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Volvo",
    model: "S80",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Volvo",
    model: "S90",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Volvo",
    model: "V40",
    sizes: ["195/65 R15", "205/55 R16", "225/45 R17"],
  },
  {
    make: "Volvo",
    model: "V60",
    sizes: ["205/60 R16", "215/55 R17", "225/50 R17"],
  },
  {
    make: "Volvo",
    model: "V70",
    sizes: ["225/55 R16", "235/50 R17", "245/45 R18"],
  },
  {
    make: "Volvo",
    model: "XC40",
    sizes: ["215/65 R16", "215/60 R17", "225/55 R18"],
  },
  {
    make: "Volvo",
    model: "XC60",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Volvo",
    model: "XC70",
    sizes: ["225/65 R17", "235/60 R18", "235/55 R19"],
  },
  {
    make: "Volvo",
    model: "XC90",
    sizes: ["255/55 R18", "265/60 R18", "275/45 R20"],
  },
];

export function tyreVehicleMakes() {
  return Array.from(new Set(tyreVehicleSizes.map((entry) => entry.make)));
}

export function tyreVehicleModels(make) {
  return tyreVehicleSizes
    .filter((entry) => entry.make === make)
    .map((entry) => entry.model);
}

// Every size this model is commonly found on, in ascending rim order so the
// list reads the way a wheel grows.
export function tyreVehicleSizesFor(make, model) {
  return (
    tyreVehicleSizes.find(
      (entry) => entry.make === make && entry.model === model,
    )?.sizes ?? []
  );
}

// What the reader is trying to do. Three genuinely different jobs — buying a
// tyre, booking a job on the car, and being stuck by the road — which is why
// they are a switch rather than one long screen.
export const tyreModes = [
  {
    key: "buy",
    labelEn: "Buy",
    labelFr: "Acheter",
    hintEn: "New & used",
    hintFr: "Neufs & occasion",
  },
  {
    key: "services",
    labelEn: "Services",
    labelFr: "Services",
    hintEn: "Fitting, alignment",
    hintFr: "Montage, géométrie",
  },
  {
    key: "sos",
    labelEn: "Urgent",
    labelFr: "Urgence",
    hintEn: "Puncture, flat",
    hintFr: "Crevaison, à plat",
  },
];

// The four ways a tyre problem ends at the roadside, and where each one
// actually leads. Two of them need somebody to come out, so they hand over
// to Dépannage with the problem already chosen rather than making a stranded
// person answer the same question twice.
export const tyreSosNeeds = [
  {
    key: "repair",
    labelEn: "Repair on the spot",
    labelFr: "Réparation sur place",
    hintEn: "Puncture that can be plugged",
    hintFr: "Crevaison réparable",
    breakdownProblem: "puncture",
  },
  {
    key: "swap",
    labelEn: "Wheel change",
    labelFr: "Changement de roue",
    hintEn: "You have the spare",
    hintFr: "Vous avez la roue de secours",
    breakdownProblem: "puncture",
  },
  {
    key: "replace",
    labelEn: "Tyre replacement",
    labelFr: "Remplacement du pneu",
    hintEn: "The tyre has to be replaced",
    hintFr: "Pneu à remplacer",
    breakdownProblem: "puncture",
  },
  {
    key: "tow",
    labelEn: "Towing",
    labelFr: "Remorquage",
    hintEn: "Two tyres down, or a damaged rim",
    hintFr: "Deux pneus ou jante abîmée",
    breakdownProblem: "towing",
  },
];

export function getTyreSosNeed(key) {
  return tyreSosNeeds.find((entry) => entry.key === key) ?? null;
}
