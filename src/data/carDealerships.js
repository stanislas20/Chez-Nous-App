import { canonicalBrand } from "./vehicles";

// The official brand distributors in Bénin.
//
// These differ from the parks in one important way: a concession is a company
// with a public identity, so it can be listed before anyone signs up. But only
// the facts that are actually published go in here — which marques the company
// distributes, where its showroom is, and its own site.
//
// Deliberately absent: phone numbers. Bénin moved to ten-digit numbering in
// 2020 and a great many of the numbers still printed online are the old
// eight-digit ones. A number that rings nowhere is worse than no number, so
// the app sends people to the distributor's own site instead.
//
// `brands` is what each distributor publishes about itself. Several claim
// overlapping marques, which is why the screen says "marques distribuées"
// rather than presenting any of this as an exclusive franchise.
//
// IMPORTANT: this list is NOT a census of Bénin. It is what has been checked
// against a published source, and the trade directories (goafricaonline,
// Pages Jaunes Afrique, aCotonou) carry more names than are here. Anything
// counting it must therefore say "listed", never imply a national total —
// the hero stat used to read "4 concessions", which read as a claim that
// the country has four.
// When this list was last edited, which is the most this file can honestly
// claim. It is not a per-row verification date: nobody re-checks six
// franchise agreements every morning, and a field saying "vérifié le" beside
// each company would assert exactly that.
//
// It is here because brand representation is the thing that actually changes
// — a marque moves to another importer and the entry silently becomes wrong
// while looking as confident as the day it was right. A visible date decays
// where a confident row does not, and it is the one honest answer to "how
// old is this?".
//
// Bump it when the list is next reviewed. check-dealerships refuses a date
// in the future and refuses a missing one.
// Only two of the six publish a line about themselves, and only those two
// carry one. The rest have `tagline` absent rather than a sentence written
// on their behalf: a distributor's own words are the one thing on these
// cards that cannot be derived from the marques and the city, so inventing
// them would be inventing the only part that sounds like the company.
// CFAO and SOCAR publish none; MIG and ALST publish no site at all.
export const dealershipsReviewedOn = "2026-08-21";

// Marques here that are deliberately not in vehicleBrands, and what they are.
//
// vehicleBrands is the list a private seller picks from when advertising a
// car, so it holds car makes. These are real marques these companies really
// distribute, and they belong on a dealership card — they simply are not
// things somebody sells second-hand as "my car" on this app.
//
// Written down rather than left as a discrepancy, so the check can tell the
// difference between a marque that is legitimately not a car and a marque
// somebody spelled wrong.
export const nonCarMarques = {
  Yamaha: "moto",
  Fuso: "camion",
  Sinotruk: "camion",
  XCMG: "engin de chantier",
  BYD: "voiture — pas encore au catalogue des annonces",
  Chery: "voiture — pas encore au catalogue des annonces",
  Fiat: "voiture — pas encore au catalogue des annonces",
  MG: "voiture — pas encore au catalogue des annonces",
};

export const carDealerships = [
  {
    key: "cfao",
    name: "CFAO Mobility Bénin",
    brands: ["Toyota", "Suzuki", "Mitsubishi", "Citroën", "Yamaha"],
    city: "Cotonou",
    area: "Carrefour Vèdoko, route de Lomé",
    alsoIn: ["Parakou"],
    website: "https://www.toyota.bj",
  },
  {
    key: "sonaec",
    name: "SONAEC Automobiles",
    // What the acronym stands for, printed across the top of their own
    // site. Not a slogan they wrote for us — the expansion of the name,
    // which is the most a firm that publishes no tagline actually says.
    tagline: "Société Nouvelle d'Automobiles, d'Équipements et de Commerce",
    brands: ["Nissan", "Hyundai", "Renault"],
    city: "Cotonou",
    area: "Akpakpa, route de Porto-Novo",
    alsoIn: [],
    website: "https://sonaec.com",
  },
  {
    key: "socar",
    name: "SOCAR Bénin",
    group: "Groupe Fadoul",
    brands: ["Peugeot", "Isuzu", "Suzuki", "Changan"],
    city: "Cotonou",
    alsoIn: [],
    website: "https://www.socar-benin.com",
  },
  {
    key: "mig",
    name: "MIG Motors",
    brands: ["Mercedes-Benz", "Kia", "Jeep", "Fiat", "Fuso"],
    city: "Cotonou",
    alsoIn: [],
    website: null,
  },
  {
    key: "chinadrive",
    name: "ChinaDrive",
    // Their own headline, verbatim. Sentence case rather than the shouted
    // capitals it is set in on the site, because here it sits in running
    // text and the caps would read as our emphasis rather than theirs.
    tagline: "Le futur de l'automobile",
    brands: ["BYD", "Geely", "Chery", "MG"],
    city: "Cotonou",
    area: "Carrefour des 3 banques",
    alsoIn: [],
    website: "https://www.chinadrivebj.com",
  },
  {
    key: "alst",
    name: "ALST Bénin",
    group: "Groupe African Lease",
    // Light vehicles alongside trucks and plant, which is why the marque
    // list mixes cars with Sinotruk and XCMG.
    brands: ["Toyota", "Ford", "Mitsubishi", "Geely", "Sinotruk", "XCMG"],
    city: "Cotonou",
    alsoIn: [],
    website: null,
  },
];

export function getCarDealership(key) {
  return carDealerships.find((item) => item.key === key) ?? null;
}

// Used by the brand rail to tell a marque with an official local dealership
// from one that only ever turns up second-hand — the difference decides
// whether parts and warranty work exist locally.
export function dealershipsForBrand(brand) {
  if (!brand) return [];
  return carDealerships.filter((item) =>
    item.brands.some(
      (name) => name.toLowerCase() === String(brand).toLowerCase(),
    ),
  );
}

// Card identity for each distributor.
//
// These are NOT the companies' own logos or brand colours — we do not have
// those files, and inventing a firm's identity is worse than not showing
// one. What each card carries instead is true of the company: its own name
// as the emblem, and the real manufacturer marks of the marques it
// actually distributes, which is also the thing a buyer is looking for.
//
// The accent is a deterministic tint drawn from a fixed palette so the six
// cards are told apart at a glance and never change between renders. It
// carries no claim about the company's colours. Drop a real logo into
// assets/dealers/ and this can be replaced without touching the screen.
const DEALER_ACCENTS = [
  "#0B6E4F",
  "#1E5F8C",
  "#8C4A2F",
  "#5B4B8A",
  "#0E6E6E",
  "#8A6D1F",
];

// By position, not by hash. A hash over six keys collided immediately —
// CFAO and MIG came out the same blue — which defeats the only job the
// accent has. Position guarantees the listed distributors are all
// distinct; anything added beyond the palette wraps, which is fine because
// by then the cards differ by their marque rows anyway.
export function dealerAccent(key) {
  const index = carDealerships.findIndex((item) => item.key === key);
  return DEALER_ACCENTS[(index < 0 ? 0 : index) % DEALER_ACCENTS.length];
}

// The marque names distributors publish do not always match the keys the
// logo table uses — "Mercedes-Benz" on a dealer page is "Mercedes" in
// vehicles.js. Normalising here keeps that mismatch out of the screen.
const BRAND_ALIASES = {
  "Mercedes-Benz": "Mercedes",
  "Land-Rover": "Land Rover",
};

export function dealerBrandKey(brand) {
  return BRAND_ALIASES[brand] ?? brand;
}

// The first word of the trading name, which for every distributor here is
// the part people actually say — CFAO, SONAEC, SOCAR, MIG. Long ones are
// clipped by the layout rather than abbreviated into something nobody uses.
export function dealerEmblem(name) {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

// The rules a row has to satisfy, wherever it comes from.
//
// This exists because the check script guards the array in this file, and
// the app reads the `dealerships` collection in Firestore — so every rule
// enforced here was bypassed entirely by anything added from the console.
// A hand-typed row could carry a phone number, an http:// site or a marque
// spelled a new way, and the guard would still report clean.
//
// Now the check and the admin script call the same function, so a row added
// from a terminal is held to the rules the seed is held to.
export function validateDealership(firm) {
  const problems = [];
  if (!firm || typeof firm !== "object") return ["not an object"];
  if (!firm.name) problems.push("no name");
  if (!firm.city) problems.push("no city");
  if (!Array.isArray(firm.brands) || firm.brands.length === 0) {
    problems.push("distributes nothing");
  }
  // Firestore's orderBy silently omits documents that lack the field, so a
  // row without `order` is not last — it is invisible.
  if (typeof firm.order !== "number") {
    problems.push("no numeric `order` (a row without it never appears)");
  }
  if (firm.website && !String(firm.website).startsWith("https://")) {
    problems.push(`website is not https: ${firm.website}`);
  }
  // No phone numbers, for the reason at the top of this file.
  const text = JSON.stringify(firm);
  if (/\d[\d\s]{7,}/.test(text)) {
    problems.push("looks like it contains a phone number");
  }
  (firm.brands ?? []).forEach((brand) => {
    const known = canonicalBrand(brand);
    const declared = Object.prototype.hasOwnProperty.call(nonCarMarques, brand);
    if (!known && !declared) {
      problems.push(
        `"${brand}" is neither a known make nor declared in nonCarMarques`,
      );
    }
  });
  return problems;
}
