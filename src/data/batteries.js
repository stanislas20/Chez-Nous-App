// Batteries, which fail without warning and always at the wrong moment.
//
// The screen's whole argument is that a battery is a wear part with a life
// of three to five years, and that a five-minute test beats a tow. So the
// data here is about matching one to a vehicle and about what a seller has
// actually committed to — capacity, cold-cranking amps, warranty, whether
// they fit it and whether they take the old one back.
//
// As everywhere else: nothing here invents a seller, a price or a stock
// level. Those are declared by whoever publishes.

// What the battery is for. A 200 Ah solar cell and a 7 Ah motorcycle
// battery have nothing in common except chemistry, and mixing them in one
// list makes both unfindable.
export const batteryCategories = [
  { key: "car", icon: "car-outline", labelEn: "Cars", labelFr: "Voitures" },
  {
    key: "moto",
    icon: "bicycle-outline",
    labelEn: "Motorbikes",
    labelFr: "Motos",
  },
  {
    key: "van",
    icon: "bus-outline",
    labelEn: "Vans & trucks",
    labelFr: "Utilitaires",
  },
  { key: "solar", icon: "sunny-outline", labelEn: "Solar", labelFr: "Solaire" },
];

// Ampere-hours: how much charge it holds. Cold-cranking amps: how hard it
// can turn a starter on the worst morning of the year. A buyer needs both,
// and they are printed on the label the seller is holding.
export const BATTERY_LIMITS = {
  capacityAh: { min: 3, max: 300 },
  crankingA: { min: 30, max: 1400 },
};

export function isValidBatteryCapacity(ah) {
  const value = Number(ah);
  return (
    Number.isFinite(value) &&
    value >= BATTERY_LIMITS.capacityAh.min &&
    value <= BATTERY_LIMITS.capacityAh.max
  );
}

export function isValidCrankingAmps(amps) {
  if (amps === "" || amps === null || amps === undefined) return true;
  const value = Number(amps);
  return (
    Number.isFinite(value) &&
    value >= BATTERY_LIMITS.crankingA.min &&
    value <= BATTERY_LIMITS.crankingA.max
  );
}

// A solar battery has no starter to crank, so amps are meaningless there —
// asking for them would produce a number invented to fill a box.
export function batteryNeedsCrankingAmps(category) {
  return category !== "solar";
}

export function formatBatterySpec(ah, amps, language) {
  if (!ah) return null;
  const capacity = `${ah} Ah`;
  if (!amps) return capacity;
  return language === "en"
    ? `${capacity} · ${amps} A cranking`
    : `${capacity} · ${amps} A`;
}

// Which side the positive terminal sits on. Get it wrong and the cables do
// not reach — the single most common reason a battery goes back to the shop
// the same afternoon.
export const batteryTerminals = [
  {
    key: "right",
    labelEn: "Positive on the right",
    labelFr: "Borne + à droite",
  },
  { key: "left", labelEn: "Positive on the left", labelFr: "Borne + à gauche" },
];

export function getBatteryTerminalLabel(key, language) {
  const item = batteryTerminals.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

export const batteryTechnologies = [
  { key: "lead", labelEn: "Lead-acid", labelFr: "Plomb-acide" },
  { key: "agm", labelEn: "AGM", labelFr: "AGM" },
  { key: "gel", labelEn: "Gel", labelFr: "Gel" },
  { key: "lithium", labelEn: "Lithium", labelFr: "Lithium" },
];

export function getBatteryTechLabel(key, language) {
  const item = batteryTechnologies.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// Whether fitting it is included. Same trap as tyres: the cheapest battery
// in the list is not the cheapest battery on the car.
export const batteryFittingModes = [
  { key: "included", labelEn: "Fitting included", labelFr: "Pose incluse" },
  { key: "extra", labelEn: "Fitting extra", labelFr: "Pose en supplément" },
  { key: "none", labelEn: "Battery only", labelFr: "Batterie seule" },
];

export function getBatteryFittingLabel(key, language) {
  const item = batteryFittingModes.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

export const batteryWarranties = [
  { key: "none", months: 0, labelEn: "No warranty", labelFr: "Sans garantie" },
  { key: "6", months: 6, labelEn: "6 months", labelFr: "6 mois" },
  { key: "12", months: 12, labelEn: "12 months", labelFr: "12 mois" },
  { key: "18", months: 18, labelEn: "18 months", labelFr: "18 mois" },
  { key: "24", months: 24, labelEn: "24 months", labelFr: "24 mois" },
  { key: "36", months: 36, labelEn: "36 months", labelFr: "36 mois" },
];

export function getBatteryWarrantyLabel(key, language) {
  const item = batteryWarranties.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// A battery is lead and acid, and it is worth money as scrap. Nearly every
// seller takes the old one back and knocks the value off — which is both
// the cheapest way to buy and the only responsible way to dispose of one.
// Declared as an amount, because "reprise possible" tells a buyer nothing.
export function tradeInLabel(amount, language) {
  if (!amount || amount <= 0) return null;
  const value = amount.toLocaleString("fr-FR");
  return language === "en"
    ? `− ${value} FCFA with trade-in`
    : `− ${value} FCFA avec reprise`;
}

// What a battery professional does, as they declare it.
export const batteryServices = [
  { key: "test", labelEn: "Testing", labelFr: "Test" },
  { key: "boost", labelEn: "Jump start", labelFr: "Démarrage / booster" },
  { key: "install", labelEn: "Replacement", labelFr: "Remplacement" },
  { key: "recycle", labelEn: "Takes the old one", labelFr: "Reprise" },
  { key: "charge", labelEn: "Recharging", labelFr: "Recharge" },
  { key: "mobile", labelEn: "Comes to you", labelFr: "Se déplace" },
];

export function getBatteryServiceLabel(key, language) {
  const item = batteryServices.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// How long a battery lasts before it should be under suspicion. Not a
// deadline — plenty run longer — but the point past which a hard morning
// start is the battery and not the weather.
export const BATTERY_SUSPECT_YEARS = 4;

export function batteryAgeYears(installedYear, now) {
  if (!installedYear) return null;
  const currentYear = (now ?? new Date()).getFullYear();
  const age = currentYear - Number(installedYear);
  if (!Number.isFinite(age) || age < 0) return null;
  return age;
}

export function isAgeingBattery(installedYear, now) {
  const age = batteryAgeYears(installedYear, now);
  return age != null && age >= BATTERY_SUSPECT_YEARS;
}

// The capacity a model is commonly fitted with.
//
// Same honesty as the tyre table, and the same limits: a list per model, not
// one answer, because engines within a nameplate differ — a diesel needs
// more cranking amps than the petrol beside it on the forecourt. The screen
// uses this to fill a search box the reader can correct, never to decide.
//
// Built from the segment the vehicle belongs to, with the common local cars
// written out. Replacing this with real per-engine data is a drop-in.
const CAP = {
  small: [
    { ah: 40, a: 330 },
    { ah: 45, a: 400 },
  ],
  compact: [
    { ah: 50, a: 450 },
    { ah: 60, a: 540 },
  ],
  mid: [
    { ah: 60, a: 540 },
    { ah: 70, a: 640 },
  ],
  large: [
    { ah: 70, a: 640 },
    { ah: 74, a: 680 },
  ],
  suv: [
    { ah: 70, a: 640 },
    { ah: 80, a: 740 },
  ],
  diesel4x4: [
    { ah: 90, a: 800 },
    { ah: 100, a: 850 },
  ],
  van: [
    { ah: 100, a: 850 },
    { ah: 120, a: 950 },
  ],
  moto: [
    { ah: 7, a: 100 },
    { ah: 12, a: 150 },
  ],
};

const BATTERY_VEHICLES = [
  ["Toyota", "Corolla", "compact"],
  ["Toyota", "Yaris", "small"],
  ["Toyota", "RAV4", "suv"],
  ["Toyota", "Hilux", "diesel4x4"],
  ["Toyota", "Hiace", "van"],
  ["Toyota", "Land Cruiser", "diesel4x4"],
  ["Toyota", "Prado", "diesel4x4"],
  ["Toyota", "Camry", "mid"],
  ["Toyota", "Avensis", "mid"],
  ["Toyota", "Probox", "compact"],
  ["Peugeot", "206", "small"],
  ["Peugeot", "207", "small"],
  ["Peugeot", "306", "compact"],
  ["Peugeot", "307", "compact"],
  ["Peugeot", "308", "compact"],
  ["Peugeot", "405", "mid"],
  ["Peugeot", "406", "mid"],
  ["Peugeot", "Partner", "van"],
  ["Peugeot", "Boxer", "van"],
  ["Hyundai", "i10", "small"],
  ["Hyundai", "Accent", "compact"],
  ["Hyundai", "Elantra", "compact"],
  ["Hyundai", "Tucson", "suv"],
  ["Hyundai", "Santa Fe", "suv"],
  ["Hyundai", "H1", "van"],
  ["Kia", "Picanto", "small"],
  ["Kia", "Rio", "compact"],
  ["Kia", "Cerato", "compact"],
  ["Kia", "Sportage", "suv"],
  ["Kia", "Sorento", "suv"],
  ["Nissan", "Micra", "small"],
  ["Nissan", "Almera", "compact"],
  ["Nissan", "Qashqai", "suv"],
  ["Nissan", "X-Trail", "suv"],
  ["Nissan", "Navara", "diesel4x4"],
  ["Nissan", "Patrol", "diesel4x4"],
  ["Honda", "Civic", "compact"],
  ["Honda", "Accord", "mid"],
  ["Honda", "CR-V", "suv"],
  ["Mercedes", "Classe C", "mid"],
  ["Mercedes", "Classe E", "large"],
  ["Mercedes", "Sprinter", "van"],
  ["Renault", "Clio", "small"],
  ["Renault", "Logan", "compact"],
  ["Renault", "Kangoo", "van"],
  ["Renault", "Master", "van"],
  ["Volkswagen", "Golf", "compact"],
  ["Volkswagen", "Passat", "mid"],
  ["Ford", "Fiesta", "small"],
  ["Ford", "Focus", "compact"],
  ["Ford", "Ranger", "diesel4x4"],
  ["Ford", "Transit", "van"],
  ["Suzuki", "Alto", "small"],
  ["Suzuki", "Swift", "small"],
  ["Suzuki", "Jimny", "compact"],
  ["Mitsubishi", "Lancer", "compact"],
  ["Mitsubishi", "Pajero", "diesel4x4"],
  ["Mitsubishi", "L200", "diesel4x4"],
  ["Isuzu", "D-Max", "diesel4x4"],
  ["BMW", "Série 3", "mid"],
  ["BMW", "X5", "large"],
  ["Audi", "A4", "mid"],
  ["Land Rover", "Discovery", "diesel4x4"],
  ["Lexus", "RX", "suv"],
  ["Yamaha", "Moto 125", "moto"],
  ["Haojue", "Moto 125", "moto"],
  ["Sanili", "Moto 125", "moto"],
  ["Bajaj", "Boxer", "moto"],
];

export const batteryVehicleSpecs = BATTERY_VEHICLES.map(
  ([make, model, segment]) => ({ make, model, specs: CAP[segment] }),
);

export function batteryVehicleMakes() {
  return Array.from(new Set(batteryVehicleSpecs.map((entry) => entry.make)));
}

export function batteryVehicleModels(make) {
  return batteryVehicleSpecs
    .filter((entry) => entry.make === make)
    .map((entry) => entry.model);
}

export function batteryVehicleSpecsFor(make, model) {
  return (
    batteryVehicleSpecs.find(
      (entry) => entry.make === make && entry.model === model,
    )?.specs ?? []
  );
}
