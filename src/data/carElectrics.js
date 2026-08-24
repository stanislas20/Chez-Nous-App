// Auto electrics, which is the trade people describe by symptom rather than
// by name.
//
// Nobody walks into a workshop asking for "an alternator diagnostic". They
// say the lights went dim, or the car clicks and does nothing, or the window
// stopped halfway. So the screen built on this file opens with the symptom
// and works backwards to the trade, instead of presenting a directory of
// fifteen services and leaving the translation to the person with the
// problem.
//
// Two rules run through the whole file:
//
//   * A symptom goes where it can actually be fixed. Some electrical faults
//     leave a car where it stands and belong in Dépannage; a klaxon that
//     does not sound does not, and sending somebody to a recovery truck for
//     one would waste their money. So a problem carries a roadside key only
//     when it genuinely strands you.
//   * Nothing here invents a provider, a price, or a capability. Services
//     are a vocabulary that professionals declare for themselves, the same
//     way tyre fitters and battery shops already do.

// Cars and motorbikes share a screen but not a fault list. A stator, a
// regulator and a CDI have no car equivalent, and a Zémidjan rider looking
// for them should not have to read past eight car-only services first.
export const electricScopes = [
  { key: "car", icon: "car-outline", labelEn: "Car", labelFr: "Voiture" },
  {
    key: "moto",
    icon: "bicycle-outline",
    labelEn: "Motorbike",
    labelFr: "Moto",
  },
];

// What a provider says they do.
//
// One vocabulary for both scopes, because a listing is written once and an
// auto electrician who rewinds a stator usually also fixes a car alternator.
// `scopes` decides which of them a symptom grid offers, not who may declare
// it.
export const electricServices = [
  {
    key: "batt",
    icon: "battery-charging-outline",
    scopes: ["car", "moto"],
    labelEn: "Battery & starting",
    labelFr: "Batterie & démarrage",
    detailEn: "Testing, cables, jump start, fitting.",
    detailFr: "Test, câbles, booster, installation.",
  },
  {
    key: "alt",
    icon: "flash-outline",
    scopes: ["car"],
    labelEn: "Alternator",
    labelFr: "Alternateur",
    detailEn: "Diagnosis, repair or replacement.",
    detailFr: "Diagnostic, réparation ou remplacement.",
  },
  {
    key: "starter",
    icon: "power-outline",
    scopes: ["car", "moto"],
    labelEn: "Starter motor",
    labelFr: "Démarreur",
    detailEn: "Diagnosis and repair.",
    detailFr: "Diagnostic et réparation.",
  },
  {
    key: "light",
    icon: "bulb-outline",
    scopes: ["car", "moto"],
    labelEn: "Lighting",
    labelFr: "Éclairage",
    detailEn: "Headlights, rear lights, indicators, fog lights.",
    detailFr: "Phares, feux arrière, clignotants, antibrouillards.",
  },
  {
    key: "fuse",
    icon: "git-merge-outline",
    scopes: ["car", "moto"],
    labelEn: "Fuses & relays",
    labelFr: "Fusibles & relais",
    detailEn: "Diagnosis and replacement.",
    detailFr: "Diagnostic et remplacement.",
  },
  {
    key: "window",
    icon: "browsers-outline",
    scopes: ["car"],
    labelEn: "Electric windows",
    labelFr: "Vitres électriques",
    detailEn: "Motor, switch, mechanism.",
    detailFr: "Moteur, bouton, mécanisme.",
  },
  {
    key: "lock",
    icon: "lock-closed-outline",
    scopes: ["car"],
    labelEn: "Locks & central locking",
    labelFr: "Serrure & centralisation",
    detailEn: "Central locking, remote key.",
    detailFr: "Verrouillage électrique, télécommande.",
  },
  {
    key: "horn",
    icon: "megaphone-outline",
    scopes: ["car", "moto"],
    labelEn: "Horn",
    labelFr: "Klaxon",
    detailEn: "Diagnosis and replacement.",
    detailFr: "Diagnostic et remplacement.",
  },
  {
    key: "wiring",
    icon: "git-network-outline",
    scopes: ["car", "moto"],
    labelEn: "Wiring harness",
    labelFr: "Faisceau électrique",
    detailEn: "Tracing a short, repairing a loom.",
    detailFr: "Recherche de court-circuit, réparation du faisceau.",
  },
  {
    key: "diag",
    icon: "hardware-chip-outline",
    scopes: ["car", "moto"],
    labelEn: "Electronic diagnostics",
    labelFr: "Diagnostic électronique",
    detailEn: "OBD reader, warning lights, fault codes.",
    detailFr: "Valise OBD, voyants, codes défaut.",
  },
  {
    key: "install",
    icon: "construct-outline",
    scopes: ["car", "moto"],
    labelEn: "Accessory fitting",
    labelFr: "Installation d’accessoires",
    detailEn: "Radio, camera, alarm, tracker.",
    detailFr: "Autoradio, caméra, alarme, traceur.",
  },
  // Motorbike-only internals. Named the way a rider names them, because
  // "régulateur" is what is asked for at the roadside in Cotonou, not
  // "voltage regulator rectifier".
  {
    key: "stator",
    icon: "sync-outline",
    scopes: ["moto"],
    labelEn: "Stator / charging coil",
    labelFr: "Stator / bobine de charge",
    detailEn: "Rewinding, testing, replacement.",
    detailFr: "Rebobinage, test, remplacement.",
  },
  {
    key: "regulator",
    icon: "options-outline",
    scopes: ["moto"],
    labelEn: "Regulator / rectifier",
    labelFr: "Régulateur / redresseur",
    detailEn: "Diagnosis and replacement.",
    detailFr: "Diagnostic et remplacement.",
  },
  {
    key: "cdi",
    icon: "pulse-outline",
    scopes: ["moto"],
    labelEn: "CDI & ignition coil",
    labelFr: "CDI & bobine d’allumage",
    detailEn: "Diagnosis and replacement.",
    detailFr: "Diagnostic et remplacement.",
  },
  {
    key: "solar",
    icon: "sunny-outline",
    scopes: ["car", "moto"],
    labelEn: "12V & solar",
    labelFr: "12V & solaire",
    detailEn: "Inverter, converter, solar battery, wiring.",
    detailFr: "Onduleur, convertisseur, batterie solaire, installation.",
  },
];

export function electricServicesFor(scope) {
  return electricServices.filter((item) => item.scopes.includes(scope));
}

export function getElectricServiceLabel(key, language) {
  const item = electricServices.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// The symptom grid: what somebody would say out loud.
//
// `service` is the declared service that fixes it, and is what the provider
// list below the grid filters on. `roadside` is a breakdownProblems key, set
// only where the fault can leave a car where it stands — that is the one
// case where handing over to Dépannage is help rather than an upsell.
export const electricProblems = [
  {
    key: "batt",
    icon: "battery-dead-outline",
    scopes: ["car", "moto"],
    service: "batt",
    roadside: "battery",
    labelEn: "Battery",
    labelFr: "Batterie",
    hintEn: "Flat, weak, or dies overnight",
    hintFr: "À plat, faible, ou se décharge la nuit",
  },
  {
    key: "start",
    icon: "power-outline",
    scopes: ["car", "moto"],
    service: "starter",
    roadside: "noStart",
    labelEn: "Starting",
    labelFr: "Démarrage",
    hintEn: "Clicks, or nothing at all",
    hintFr: "Ça clique, ou rien du tout",
  },
  {
    key: "light",
    icon: "bulb-outline",
    scopes: ["car", "moto"],
    service: "light",
    labelEn: "Lighting",
    labelFr: "Éclairage",
    hintEn: "Headlights, indicators, brake lights",
    hintFr: "Phares, clignotants, feux stop",
  },
  {
    key: "diag",
    icon: "hardware-chip-outline",
    scopes: ["car", "moto"],
    service: "diag",
    labelEn: "Warning light",
    labelFr: "Voyant allumé",
    hintEn: "A light on the dash you cannot place",
    hintFr: "Un voyant que vous ne reconnaissez pas",
  },
  {
    key: "alt",
    icon: "flash-outline",
    scopes: ["car"],
    service: "alt",
    // An alternator that has stopped charging strands the car once the
    // battery empties, which is usually minutes away, not days.
    roadside: "electrical",
    labelEn: "Alternator",
    labelFr: "Alternateur",
    hintEn: "Battery light on, lights dimming",
    hintFr: "Voyant batterie, phares qui faiblissent",
  },
  {
    key: "window",
    icon: "browsers-outline",
    scopes: ["car"],
    service: "window",
    labelEn: "Windows",
    labelFr: "Vitres",
    hintEn: "Stuck, slow, or dead",
    hintFr: "Bloquées, lentes, ou mortes",
  },
  {
    key: "lock",
    icon: "lock-closed-outline",
    scopes: ["car"],
    service: "lock",
    labelEn: "Central locking",
    labelFr: "Centralisation",
    hintEn: "Remote or doors not responding",
    hintFr: "Télécommande ou portes sans réaction",
  },
  {
    key: "horn",
    icon: "megaphone-outline",
    scopes: ["car", "moto"],
    service: "horn",
    labelEn: "Horn",
    labelFr: "Klaxon",
    hintEn: "Silent or weak",
    hintFr: "Muet ou faible",
  },
  {
    key: "fuse",
    icon: "git-merge-outline",
    scopes: ["car", "moto"],
    service: "fuse",
    labelEn: "Fuse blown",
    labelFr: "Fusible grillé",
    hintEn: "One thing stopped working at once",
    hintFr: "Quelque chose s’est arrêté d’un coup",
  },
  {
    key: "wiring",
    icon: "git-network-outline",
    scopes: ["car", "moto"],
    service: "wiring",
    // A short that keeps blowing fuses can immobilise a bike or a car
    // outright, and it is the fault most likely to be smelled before seen.
    roadside: "electrical",
    labelEn: "Short circuit",
    labelFr: "Court-circuit",
    hintEn: "Burning smell, fuses keep blowing",
    hintFr: "Odeur de brûlé, fusibles qui sautent",
  },
  {
    key: "stator",
    icon: "sync-outline",
    scopes: ["moto"],
    service: "stator",
    roadside: "electrical",
    labelEn: "Not charging",
    labelFr: "Ne charge pas",
    hintEn: "Stator, regulator, or rectifier",
    hintFr: "Stator, régulateur, ou redresseur",
  },
  {
    key: "cdi",
    icon: "pulse-outline",
    scopes: ["moto"],
    service: "cdi",
    roadside: "noStart",
    labelEn: "No spark",
    labelFr: "Pas d’étincelle",
    hintEn: "CDI or ignition coil",
    hintFr: "CDI ou bobine d’allumage",
  },
];

export function electricProblemsFor(scope) {
  return electricProblems.filter((item) => item.scopes.includes(scope));
}

export function getElectricProblem(key) {
  return electricProblems.find((item) => item.key === key) ?? null;
}

// What an electronic diagnosis covers, in the words printed on a dashboard.
//
// Deliberately not tappable. Each of these would need its own provider
// filter to mean anything, and no provider declares "ABS" separately — so a
// chip here is a description of the trade, and the one real action is the
// button underneath it.
export const electricDiagnostics = [
  { labelEn: "OBD scan", labelFr: "Valise OBD" },
  { labelEn: "Engine light", labelFr: "Voyant moteur" },
  { labelEn: "ABS", labelFr: "ABS" },
  { labelEn: "Airbag", labelFr: "Airbag" },
  { labelEn: "ESP", labelFr: "ESP" },
  { labelEn: "Gearbox", labelFr: "Transmission" },
  { labelEn: "Sensors", labelFr: "Capteurs" },
  { labelEn: "ECU", labelFr: "Calculateur" },
  { labelEn: "Clearing fault codes", labelFr: "Effacement des codes" },
];

// Lighting, which is the most-asked electrical job and the one where the
// part is as often the answer as the labour. Each of these is a real search
// in the marketplace, so the chips here do something the diagnostic ones
// cannot.
export const electricLighting = [
  {
    key: "bulb",
    query: "ampoule voiture",
    labelEn: "Bulbs",
    labelFr: "Ampoules",
  },
  {
    key: "head",
    query: "phare voiture",
    labelEn: "Headlights",
    labelFr: "Phares",
  },
  {
    key: "brake",
    query: "feu stop",
    labelEn: "Brake lights",
    labelFr: "Feux stop",
  },
  {
    key: "indicator",
    query: "clignotant",
    labelEn: "Indicators",
    labelFr: "Clignotants",
  },
  {
    key: "fog",
    query: "antibrouillard",
    labelEn: "Fog lights",
    labelFr: "Antibrouillards",
  },
  {
    key: "led",
    query: "LED voiture",
    labelEn: "LED kits",
    labelFr: "Kits LED",
  },
];

// Accessories: bought, then fitted. Both halves matter — an Android screen
// nobody can install is a screen that goes back in the box, and this is the
// one place in the app where the two sides of that are one tap apart.
export const electricAccessories = [
  {
    key: "radio",
    query: "autoradio",
    labelEn: "Car radio",
    labelFr: "Autoradio",
  },
  {
    key: "speaker",
    query: "haut-parleur voiture",
    labelEn: "Speakers",
    labelFr: "Haut-parleurs",
  },
  {
    key: "camera",
    query: "caméra de recul",
    labelEn: "Reversing camera",
    labelFr: "Caméra de recul",
  },
  {
    key: "screen",
    query: "écran android voiture",
    labelEn: "Android screen",
    labelFr: "Écran Android",
  },
  { key: "gps", query: "GPS voiture", labelEn: "GPS", labelFr: "GPS" },
  {
    key: "charger",
    query: "chargeur voiture USB",
    labelEn: "Charger / USB",
    labelFr: "Chargeur / USB",
  },
  {
    key: "alarm",
    query: "alarme voiture",
    labelEn: "Alarm",
    labelFr: "Alarme",
  },
  {
    key: "tracker",
    query: "traceur GPS",
    labelEn: "GPS tracker",
    labelFr: "Traceur GPS",
  },
  { key: "dashcam", query: "dashcam", labelEn: "Dashcam", labelFr: "Dashcam" },
  {
    key: "parking",
    query: "capteur de stationnement",
    labelEn: "Parking sensors",
    labelFr: "Capteurs de stationnement",
  },
];

// Kept apart from the car-electrical services above on purpose. An inverter
// and a 12V-to-220V converter are the same trade to a Beninese auto
// electrician and a different job entirely to the person buying one, and
// folding them into the symptom grid would make both harder to find.
export const electricSolar = [
  {
    key: "solarBattery",
    // The battery screen already sorts solar cells by capacity, so this
    // hands over to it rather than running a text search past it.
    route: "Battery",
    params: { category: "solar" },
    labelEn: "Solar battery",
    labelFr: "Batterie solaire",
  },
  {
    key: "inverter",
    query: "onduleur",
    labelEn: "Inverter",
    labelFr: "Onduleur",
  },
  {
    key: "converter",
    query: "convertisseur 12V 220V",
    labelEn: "12V → 220V converter",
    labelFr: "Convertisseur 12V → 220V",
  },
  {
    key: "solarCharger",
    query: "chargeur solaire",
    labelEn: "Solar charger",
    labelFr: "Chargeur solaire",
  },
  {
    key: "panel",
    query: "panneau solaire",
    labelEn: "Solar panel",
    labelFr: "Panneau solaire",
  },
];
