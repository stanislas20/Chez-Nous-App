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
