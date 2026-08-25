// The Électricité screen's data, checked against the screens it hands over
// to.
//
// Almost every failure this file can catch is silent in the app: a symptom
// whose service nobody can declare shows an empty list that looks like
// "nobody does this yet"; a roadside key that Dépannage does not know lands
// on its front door with the question unasked; a service offered for a
// motorbike that no bike has produces a tile that can never match.
//
// Run: node scripts/check-electrics.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// The shared word matcher, inlined ahead of any module that imports it. The
// vm has no module loader, and stripping the import without supplying the
// functions turns a refactor into a syntax error here instead of a failure
// in the thing under test.
const WORD_MATCH = fs
  .readFileSync(path.join(__dirname, "..", "src/utils/wordMatch.js"), "utf8")
  .replace(/^export /gm, "");

function load(relative, expose) {
  const raw = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  const needsMatcher = /from "\.\.\/utils\/wordMatch"/.test(raw);
  const source =
    (needsMatcher ? WORD_MATCH + "\n" : "") +
    raw
      .replace(/import[\s\S]*?from\s*["'][^"']+["'];\n/g, "")
      .replace(/^export /gm, "");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${source}\n${expose.map((n) => `this.${n} = ${n};`).join("\n")}`,
    context,
  );
  return context;
}

const E = load("src/data/carElectrics.js", [
  "electricScopes",
  "electricServices",
  "electricProblems",
  "electricDiagnostics",
  "electricLighting",
  "electricAccessories",
  "electricSolar",
  "electricServicesFor",
  "electricProblemsFor",
  "getElectricServiceLabel",
]);
const B = load("src/data/breakdownProblems.js", ["breakdownProblems"]);
const G = load("src/data/garageSpecialties.js", [
  "garageSpecialties",
  "isGarageListing",
  "garageSpecialtiesFor",
]);

const failures = [];
const fail = (line) => failures.push(line);

const scopes = E.electricScopes.map((item) => item.key);
const serviceKeys = new Set(E.electricServices.map((item) => item.key));
const breakdownKeys = new Set(B.breakdownProblems.map((item) => item.key));

// --- every list is bilingual, or a language silently shows "undefined"
const bilingual = (list, name, fields) =>
  list.forEach((item, index) => {
    fields.forEach((field) => {
      if (!item[field]) fail(`${name}[${index}]: missing ${field}`);
    });
  });

bilingual(E.electricScopes, "electricScopes", ["labelEn", "labelFr", "icon"]);
bilingual(E.electricServices, "electricServices", [
  "labelEn",
  "labelFr",
  "detailEn",
  "detailFr",
  "icon",
]);
bilingual(E.electricProblems, "electricProblems", [
  "labelEn",
  "labelFr",
  "hintEn",
  "hintFr",
  "icon",
]);
bilingual(E.electricDiagnostics, "electricDiagnostics", ["labelEn", "labelFr"]);
bilingual(E.electricLighting, "electricLighting", ["labelEn", "labelFr"]);
bilingual(E.electricAccessories, "electricAccessories", ["labelEn", "labelFr"]);
bilingual(E.electricSolar, "electricSolar", ["labelEn", "labelFr"]);

// --- keys must be unique, or the wrong tile lights up when one is tapped
const unique = (list, name) => {
  const seen = new Set();
  list.forEach((item) => {
    const key = item.key ?? item.labelEn;
    if (seen.has(key)) fail(`${name}: duplicate key ${key}`);
    seen.add(key);
  });
};
unique(E.electricServices, "electricServices");
unique(E.electricProblems, "electricProblems");
unique(E.electricLighting, "electricLighting");
unique(E.electricAccessories, "electricAccessories");
unique(E.electricSolar, "electricSolar");

// --- scopes must be real, or a tile belongs to no toggle position
[...E.electricServices, ...E.electricProblems].forEach((item) => {
  if (!item.scopes?.length) {
    fail(`${item.key}: no scopes, so it appears nowhere`);
  }
  item.scopes?.forEach((scope) => {
    if (!scopes.includes(scope)) fail(`${item.key}: unknown scope ${scope}`);
  });
});

// --- THE contract: a symptom's service must be one a provider can declare,
// and it must be offered in the same scope, or tapping it filters the list
// to a service that cannot exist there.
E.electricProblems.forEach((problem) => {
  if (!problem.service) {
    fail(`problem ${problem.key}: no service to filter on`);
    return;
  }
  if (!serviceKeys.has(problem.service)) {
    fail(
      `problem ${problem.key}: service ${problem.service} is not declarable`,
    );
    return;
  }
  const service = E.electricServices.find((s) => s.key === problem.service);
  problem.scopes.forEach((scope) => {
    if (!service.scopes.includes(scope)) {
      fail(
        `problem ${problem.key} is offered for ${scope} but its service ${service.key} is not`,
      );
    }
  });
});

// --- a roadside hand-off must name a problem Dépannage actually knows,
// otherwise the triage opens with nothing selected.
E.electricProblems.forEach((problem) => {
  if (problem.roadside && !breakdownKeys.has(problem.roadside)) {
    fail(`problem ${problem.key}: unknown breakdown key ${problem.roadside}`);
  }
});

// The fallback used when no symptom is chosen has to exist too.
if (!breakdownKeys.has("electrical")) {
  fail("breakdownProblems has no 'electrical' entry for the fallback");
}

// --- the diagnostics button filters Garages by a real specialty
if (!G.garageSpecialties.some((item) => item.key === "diag")) {
  fail("garageSpecialties has no 'diag' trade for the diagnostics button");
}
if (!G.garageSpecialties.some((item) => item.key === "elec")) {
  fail("garageSpecialties has no 'elec' trade");
}

// --- every chip that runs a search must have something to search for
[...E.electricLighting, ...E.electricAccessories].forEach((item) => {
  if (!item.query?.trim()) fail(`${item.key}: no search query`);
});
E.electricSolar.forEach((item) => {
  if (!item.query?.trim() && !item.route) {
    fail(`${item.key}: neither a query nor a route, so the chip does nothing`);
  }
});

// --- both scopes must be usable on their own. A toggle position with two
// symptoms in it is a toggle position nobody will press twice.
scopes.forEach((scope) => {
  const problems = E.electricProblemsFor(scope);
  const services = E.electricServicesFor(scope);
  if (problems.length < 4) {
    fail(`scope ${scope}: only ${problems.length} symptom(s)`);
  }
  if (services.length < 4) {
    fail(`scope ${scope}: only ${services.length} service(s)`);
  }
});

// --- labels resolve in both languages, which is what the cards print
E.electricServices.forEach((item) => {
  ["en", "fr"].forEach((language) => {
    if (!E.getElectricServiceLabel(item.key, language)) {
      fail(`${item.key}: no ${language} label`);
    }
  });
});
if (E.getElectricServiceLabel("nope", "fr") !== null) {
  fail("getElectricServiceLabel should return null for an unknown key");
}

// --- and a listing that reads like an auto electrician must actually match
// the trade, since that is the only thing putting it on the screen.
const shouldMatch = [
  "Électricien auto — alternateur, démarreur, faisceau",
  "Diagnostic électronique valise OBD voiture",
  "Réparation alternateur et démarreur véhicule",
];
shouldMatch.forEach((text) => {
  const specialties = G.garageSpecialtiesFor(text);
  if (!specialties.includes("elec") && !specialties.includes("diag")) {
    fail(`"${text}" reaches neither elec nor diag`);
  }
});

// The lookalikes that must NOT: a house electrician is not an auto
// electrician, and this is the exact confusion garageSpecialties was
// written to prevent.
const shouldNotMatch = [
  "Électricien bâtiment installation maison",
  "Dépannage informatique et réseau",
];
shouldNotMatch.forEach((text) => {
  if (G.isGarageListing(text)) fail(`"${text}" wrongly reads as a garage`);
});

// --- Carrosserie, checked the same way and against the same hand-offs.
const C = load("src/data/bodywork.js", [
  "bodyworkProblems",
  "bodyworkServices",
  "bodyworkPhotoTips",
  "bodyworkParts",
  "getBodyworkServiceLabel",
]);

const bodyServiceKeys = new Set(C.bodyworkServices.map((item) => item.key));

bilingual(C.bodyworkProblems, "bodyworkProblems", [
  "labelEn",
  "labelFr",
  "hintEn",
  "hintFr",
  "icon",
]);
bilingual(C.bodyworkServices, "bodyworkServices", [
  "labelEn",
  "labelFr",
  "detailEn",
  "detailFr",
  "icon",
]);
bilingual(C.bodyworkPhotoTips, "bodyworkPhotoTips", [
  "labelEn",
  "labelFr",
  "icon",
]);
bilingual(C.bodyworkParts, "bodyworkParts", ["labelEn", "labelFr"]);
unique(C.bodyworkProblems, "bodyworkProblems");
unique(C.bodyworkServices, "bodyworkServices");
unique(C.bodyworkParts, "bodyworkParts");

C.bodyworkProblems.forEach((problem) => {
  if (!bodyServiceKeys.has(problem.service)) {
    fail(
      `body problem ${problem.key}: service ${problem.service} is not declarable`,
    );
  }
  if (problem.roadside && !breakdownKeys.has(problem.roadside)) {
    fail(
      `body problem ${problem.key}: unknown breakdown key ${problem.roadside}`,
    );
  }
});

// Exactly one tile is the full-width urgent one. Two would break the grid;
// none would bury a collision among paint finishes.
const primaries = C.bodyworkProblems.filter((item) => item.primary);
if (primaries.length !== 1) {
  fail(`bodyworkProblems: ${primaries.length} primary tiles, expected 1`);
}
if (primaries[0] && primaries[0].roadside !== "accident") {
  fail("the primary bodywork tile should hand over to the accident triage");
}

C.bodyworkParts.forEach((item) => {
  if (!item.query?.trim()) fail(`body part ${item.key}: no search query`);
});

// The two services the screen reads as facts on a card, rather than as
// filters, have to exist or the pills can never appear.
["estimate", "mobile"].forEach((key) => {
  if (!bodyServiceKeys.has(key)) {
    fail(`bodyworkServices is missing "${key}", which the cards read directly`);
  }
});

C.bodyworkServices.forEach((item) => {
  ["en", "fr"].forEach((language) => {
    if (!C.getBodyworkServiceLabel(item.key, language)) {
      fail(`body service ${item.key}: no ${language} label`);
    }
  });
});

// Glass had no terms at all before this screen, so a windscreen search
// reached no trade anywhere in the app.
[
  "Carrosserie Akpakpa — tôlerie et peinture",
  "Remplacement pare-brise voiture",
  "Débosselage sans peinture auto",
].forEach((text) => {
  if (!G.garageSpecialtiesFor(text).includes("carro")) {
    fail(`"${text}" does not reach the carrosserie trade`);
  }
});
// And a glazier is still not a carrossier.
["Vitrerie bâtiment pose de vitres maison", "Peintre en bâtiment"].forEach(
  (text) => {
    if (G.isGarageListing(text)) fail(`"${text}" wrongly reads as a garage`);
  },
);

// --- Chauffeurs. The matcher here has no garageSpecialties to lean on, so
// its own false positives are the whole risk: a driving school, a site
// manager ("conducteur de travaux") and a plumber fitting a chauffe-eau all
// sit one careless term away from this screen.
const D = load("src/data/drivers.js", [
  "driverNeeds",
  "permitCategories",
  "driverAvailability",
  "driverVehicleModes",
  "driverLanguages",
  "driverExperience",
  "driverSafetyChecks",
  "isDriverListing",
  "getPermitLabel",
  "getAvailabilityLabel",
  "getLanguageLabel",
  "getVehicleModeLabel",
  "getExperienceLabel",
]);

[
  [
    "driverNeeds",
    D.driverNeeds,
    ["labelEn", "labelFr", "hintEn", "hintFr", "icon"],
  ],
  ["permitCategories", D.permitCategories, ["labelEn", "labelFr", "icon"]],
  ["driverAvailability", D.driverAvailability, ["labelEn", "labelFr", "icon"]],
  ["driverVehicleModes", D.driverVehicleModes, ["labelEn", "labelFr", "icon"]],
  ["driverLanguages", D.driverLanguages, ["labelEn", "labelFr"]],
  ["driverExperience", D.driverExperience, ["labelEn", "labelFr"]],
  ["driverSafetyChecks", D.driverSafetyChecks, ["labelEn", "labelFr", "icon"]],
].forEach(([name, list, fields]) => {
  bilingual(list, name, fields);
  unique(list, name);
});

// Every need must select an availability a driver can actually declare, or
// the tile filters the list to something nobody can ever match.
const availabilityKeys = new Set(D.driverAvailability.map((item) => item.key));
D.driverNeeds.forEach((item) => {
  if (!availabilityKeys.has(item.availability)) {
    fail(`driver need ${item.key}: unknown availability ${item.availability}`);
  }
});

// Labels resolve, since the cards print them.
[
  [D.permitCategories, D.getPermitLabel, "permit"],
  [D.driverAvailability, D.getAvailabilityLabel, "availability"],
  [D.driverLanguages, D.getLanguageLabel, "language"],
  [D.driverVehicleModes, D.getVehicleModeLabel, "vehicle mode"],
  [D.driverExperience, D.getExperienceLabel, "experience"],
].forEach(([list, getter, what]) => {
  list.forEach((item) => {
    ["en", "fr"].forEach((language) => {
      if (!getter(item.key, language)) {
        fail(`${what} ${item.key}: no ${language} label`);
      }
    });
  });
  if (getter("nope", "fr") !== null) {
    fail(`${what} getter should return null for an unknown key`);
  }
});

// The matcher, both ways round.
[
  "Chauffeur privé disponible, permis B, 8 ans d’expérience",
  "Chauffeur-livreur avec sa propre moto",
  "Je suis conducteur avec permis B et mon véhicule",
  "Chauffeuse expérimentée, longue distance",
  "Zem disponible pour vos courses en ville, moto",
].forEach((text) => {
  if (!D.isDriverListing(text)) fail(`"${text}" does not reach Chauffeurs`);
});

[
  "Installation et réparation de chauffe-eau",
  "Plomberie : fuite, robinet, chauffe-eau",
  "Conducteur de travaux BTP, chantier et gros oeuvre",
  "Auto-école : cours de code et permis",
  "Auto école, leçons de conduite et permis B",
  "Moniteur auto-école expérimenté",
  "Transport de marchandises par conteneur maritime",
  "Livreur de repas à vélo",
  "Mécanicien auto toutes marques",
].forEach((text) => {
  if (D.isDriverListing(text)) fail(`"${text}" wrongly reads as a driver`);
});

// --- Pièces. The matcher here has the nastiest false positive in the app:
// in French a flat is "un trois pièces", so the bare noun would place every
// rental advert in the country on a car-parts screen.
const P = load("src/data/vehicleParts.js", [
  "partScopes",
  "partCategories",
  "partConditions",
  "partBuyingTips",
  "partCategoriesFor",
  "getPartCategoryLabel",
  "getPartConditionLabel",
  "isPartsSellerListing",
]);

[
  ["partScopes", P.partScopes, ["labelEn", "labelFr", "icon"]],
  [
    "partCategories",
    P.partCategories,
    ["labelEn", "labelFr", "detailEn", "detailFr", "icon"],
  ],
  [
    "partConditions",
    P.partConditions,
    ["labelEn", "labelFr", "detailEn", "detailFr", "icon"],
  ],
  ["partBuyingTips", P.partBuyingTips, ["labelEn", "labelFr", "icon"]],
].forEach(([name, list, fields]) => {
  bilingual(list, name, fields);
  unique(list, name);
});

const partScopeKeys = P.partScopes.map((item) => item.key);
P.partCategories.forEach((item) => {
  if (!item.scopes?.length) fail(`part ${item.key}: no scopes`);
  item.scopes?.forEach((scope) => {
    if (!partScopeKeys.includes(scope)) {
      fail(`part ${item.key}: unknown scope ${scope}`);
    }
  });
});

// Both scopes must stand on their own, or a toggle position is a dead end.
partScopeKeys.forEach((scope) => {
  const list = P.partCategoriesFor(scope);
  if (list.length < 4) fail(`scope ${scope}: only ${list.length} categories`);
});

[
  [P.partCategories, P.getPartCategoryLabel, "part category"],
  [P.partConditions, P.getPartConditionLabel, "part condition"],
].forEach(([list, getter, what]) => {
  list.forEach((item) => {
    ["en", "fr"].forEach((language) => {
      if (!getter(item.key, language))
        fail(`${what} ${item.key}: no ${language}`);
    });
  });
  if (getter("nope", "fr") !== null) {
    fail(`${what} getter should return null for an unknown key`);
  }
});

[
  "Vente de pièces détachées auto toutes marques",
  "Casse auto — pièces d occasion",
  "Pièces moto et accessoires scooter",
  "Magasin de pièces de rechange pour voiture",
  "Pièces auto neuves et adaptables",
  "Accessoires et pièces pour scooter",
].forEach((text) => {
  if (!P.isPartsSellerListing(text)) fail(`"${text}" does not reach Pièces`);
});

// The ones that must never appear there. The first four are flats.
[
  "Appartement 3 pièces à louer à Cotonou",
  "Maison 4 pièces avec cour, location",
  "Terrain 2 pièces viabilisé",
  "Chambre salon meublé Fidjrossè",
  "Quincaillerie : pièces de rechange pour pompe",
  "Plomberie et pièces de rechange sanitaires",
].forEach((text) => {
  if (P.isPartsSellerListing(text))
    fail(`"${text}" wrongly reads as a parts seller`);
});

if (failures.length) {
  failures.forEach((line) => console.error(line));
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(
  `clean: electrics — ${E.electricProblems.length} symptoms, ${E.electricServices.length} services, ` +
    `${E.electricLighting.length + E.electricAccessories.length + E.electricSolar.length} search chips ` +
    `across ${scopes.length} scopes; bodywork — ${C.bodyworkProblems.length} damages, ` +
    `${C.bodyworkServices.length} services, ${C.bodyworkParts.length} parts; ` +
    `drivers — ${D.driverNeeds.length} needs, ${D.permitCategories.length} permits, ` +
    `${D.driverLanguages.length} languages, 14 matcher cases; ` +
    `parts — ${P.partCategories.length} systems, ${P.partConditions.length} conditions, 12 matcher cases`,
);
