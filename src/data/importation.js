import { countries } from "./countries";

// Importing into Bénin, which is a country with a port and a market fed by it.
//
// The app already takes a position on this and then abandons the reader
// holding it. vehicles.js calls customs status "the single most consequential
// fact about a used car in Bénin", and every listing carries the badge that
// follows from it: "Non dédouané — droits restant à payer par l'acheteur, en
// plus du prix". So the app tells somebody there is a large unknown sum on
// top of the price and offers nothing whatsoever to answer it. This screen is
// the answer, and the answer is a person, not a number.
//
// No figure appears anywhere here, deliberately. Duty runs off the valeur
// mercuriale, the age bracket and the displacement, with DD, TVA, RS and PCS
// stacked over that, and every one of those moves. A number written into this
// file is correct until the day it is not, and nothing in the app would
// notice — the reader would simply budget against a figure the bureau then
// disagrees with. Naming the mechanism costs nothing and never rots; quoting
// the magnitude is the thing that would.
//
// Two axes, and it matters which is asked first.
//
// What is being imported renames the vocabulary of every stage — a
// connaissement and a carte grise are not the same document, a groupage and a
// roulier are not the same shipment. So the cargo is asked once, at the top,
// and remembered.
//
// Where it currently is changes weekly and is what the reader actually came
// to act on. Somebody whose car is still in Antwerp needs a shipper; somebody
// whose container is on the quay at Cotonou needs a transitaire today and is
// paying for every day they do not have one. One screen serves both because
// the journey is shared even though the cargo is not.

// The colours are vehicleCustoms', on purpose and not by coincidence: a
// reader who has learnt that green means cleared on a listing badge should
// not have to learn a second palette here for the same fact.
const GREEN = "#0B6E4F";
const AMBER = "#D9A441";
const TERRACOTTA = "#C1512D";
const SEA = "#2C7FA6";

export const importCargoKinds = [
  {
    key: "vehicle",
    icon: "car-sport-outline",
    labelEn: "A vehicle",
    labelFr: "Un véhicule",
  },
  {
    key: "goods",
    icon: "cube-outline",
    labelEn: "Goods",
    labelFr: "De la marchandise",
  },
];

// The journey, in the four states somebody can actually be in. Not a progress
// bar: nobody moves through these in the app, they arrive already in one of
// them and want to know what to do about it.
export const importStages = [
  {
    key: "notShipped",
    color: SEA,
    icon: "globe-outline",
    labelEn: "Not shipped yet",
    labelFr: "Pas encore expédié",
    hintEn: "Still with the seller abroad, or being bought",
    hintFr: "Encore chez le vendeur à l'étranger, ou en cours d'achat",
  },
  {
    key: "atSea",
    color: SEA,
    icon: "boat-outline",
    labelEn: "At sea",
    labelFr: "En mer",
    hintEn: "Loaded and sailing — the paperwork can be done now",
    hintFr: "Chargé et en route — les papiers peuvent se faire maintenant",
  },
  {
    key: "atPort",
    color: AMBER,
    icon: "business-outline",
    labelEn: "At the port",
    labelFr: "Au port",
    hintEn: "Landed at Cotonou and waiting — storage is running",
    hintFr: "Débarqué à Cotonou et en attente — le magasinage court",
  },
  {
    key: "cleared",
    color: GREEN,
    icon: "checkmark-circle-outline",
    labelEn: "Cleared",
    labelFr: "Dédouané",
    hintEn: "Duty paid and collected — what is left is registration",
    hintFr: "Droits payés et retiré — il reste l'immatriculation",
  },
];

// The one fact on this screen worth more than the rest of it put together,
// and the one a first-time importer does not know exists.
//
// Storage at the port is free for a while and then it is not, and the meter
// runs from the ship's arrival rather than from the day anybody gets round to
// looking. It is the same for a car and for a container, which is the single
// strongest reason these two cargoes belong on one screen.
//
// The franchise length and the daily rate are exactly the numbers this file
// refuses to carry. Saying "the clock exists, find out when yours started" is
// both honest and actionable; saying "you have eleven free days" is a hostage
// to a tariff nobody here will remember to re-read.
export const STORAGE_CLOCK_STAGES = ["atSea", "atPort"];

// Two different people help with an import, at opposite ends of the journey,
// and conflating them is how this screen would fail.
//
// The sourcer is abroad. They are the Beninese in Brussels or Montreal or
// Dubai who knows the auctions where they live, and they do one of two
// things: buy a car on their own account and ship it here to sell — which is
// where half the stock in a parc auto comes from — or buy the one you asked
// for, on your behalf, as a service. Same person, two offers, and the app
// already half knows them: `importer` is a vehicle seller type in
// vehicles.js, coloured and labelled, with nowhere to be found.
//
// The broker is here, at the port. They file the declaration.
//
// Which one a reader needs is decided entirely by the stage they picked,
// which is why that question is asked before either list appears. Somebody
// who has not bought anything yet has no use for a transitaire; somebody
// whose container is on the quay has no use for a man in Antwerp.
export const importHelperRoles = [
  {
    key: "sourcer",
    icon: "airplane-outline",
    labelEn: "Buyers abroad",
    labelFr: "Acheteurs à l'étranger",
    // The stages at which this is the person you actually need.
    stages: ["notShipped"],
  },
  {
    key: "broker",
    icon: "boat-outline",
    labelEn: "Transitaires",
    labelFr: "Transitaires",
    stages: ["atSea", "atPort"],
  },
];

// What a sourcer offers. Declared, because the two are genuinely different
// transactions and somebody wanting one is wasting their time on the other.
export const sourcerOffers = [
  {
    key: "stock",
    labelEn: "Ships stock to sell",
    labelFr: "Expédie pour revendre",
    terms: ["arrivage", "arrive bientot", "en stock", "parc auto", "revente"],
  },
  {
    key: "onRequest",
    labelEn: "Buys to order",
    labelFr: "Achète sur commande",
    terms: ["sur commande", "sur demande", "recherche vehicule", "je cherche pour vous", "mandat"],
  },
];

// The words a diaspora importer writes. Deliberately not just "importateur":
// most of them describe the country they buy from and the fact that they
// ship, because that is what a buyer here is scanning for.
export const sourcerTerms = [
  "importateur",
  "importation",
  "achat a l etranger",
  "achat europe",
  "sur commande de l etranger",
  "expedition vers le benin",
  "arrivage",
  "je suis en europe",
  "depuis la belgique",
  "depuis l allemagne",
  "depuis les etats unis",
  "depuis le canada",
  "depuis dubai",
];

// Where a sourcer buys, which is the first thing a buyer here asks and the
// only thing the form never recorded.
//
// `buysFrom` was already being read — ImportationScreen prints it, and
// useImportHelpers sorts the whole sourcer list on it under a comment
// promising it is "declared on the posting form, never inferred". No form
// wrote it. Every sourcer fell through to the alphabetical fallback and the
// country line rendered for nobody. This is the half that was missing.
//
// Stored as an ISO code, not a name: the names live in countries.js, which
// is generated, and a second hand-written copy of "États-Unis" is exactly
// how the two come to disagree.
//
// Short on purpose. These are the countries that get a real channel list
// below; anywhere else on earth stays pickable through the full country
// sheet and gets the generic channels, which is honest rather than
// pretending we know the auction houses of every market.
export const sourcingCountries = [
  "US",
  "CA",
  "BE",
  "DE",
  "FR",
  "NL",
  "GB",
  "ES",
  "IT",
  "AE",
  "JP",
  "KR",
];

// How they buy, which decides what actually arrives.
//
// A Copart lot is a salvage car with a branded title; a car bought off a
// dealership forecourt is not. Both cross the same ocean and reach a listing
// here looking identical, and somebody wiring money abroad is entitled to
// know which one they are being sold before it sails rather than after it
// lands. That is the whole reason this field exists.
//
// Named houses only where the name is what people actually say. An importer
// in Maryland describes their work as "Copart and IAAI", and folding that
// into "auctions" would throw away the most informative word in the
// sentence. Everywhere else the generic entries carry it — a directory of
// every auction house on earth would rot, and this file has already argued
// once that a list which rots is worse than no list.
//
// `countries: null` means the channel is offered wherever the sourcer is.
export const sourcingChannels = [
  { key: "copart", labelEn: "Copart", labelFr: "Copart", countries: ["US", "CA", "GB"] },
  { key: "iaai", labelEn: "IAAI", labelFr: "IAAI", countries: ["US", "CA"] },
  { key: "manheim", labelEn: "Manheim", labelFr: "Manheim", countries: ["US", "CA", "GB"] },
  {
    key: "bca",
    labelEn: "BCA",
    labelFr: "BCA",
    countries: ["GB", "BE", "NL", "DE", "FR", "ES", "IT"],
  },
  { key: "uss", labelEn: "USS auctions", labelFr: "Enchères USS", countries: ["JP"] },
  {
    key: "emiratesAuction",
    labelEn: "Emirates Auction",
    labelFr: "Emirates Auction",
    countries: ["AE"],
  },
  {
    key: "publicAuction",
    labelEn: "Public auctions",
    labelFr: "Enchères publiques",
    countries: null,
  },
  {
    key: "dealerAuction",
    labelEn: "Trade-only auctions",
    labelFr: "Enchères professionnelles",
    countries: null,
  },
  {
    key: "dealership",
    labelEn: "Dealerships",
    labelFr: "Concessionnaires",
    countries: null,
  },
  {
    key: "privateSeller",
    labelEn: "Private sellers",
    labelFr: "Particuliers",
    countries: null,
  },
  {
    key: "exporter",
    labelEn: "Export companies",
    labelFr: "Sociétés d'exportation",
    countries: null,
  },
];

// The channels on offer once a country is chosen, named ones first so the
// specific answer is the one nearest the thumb.
//
// With no country picked this returns only the generic set rather than
// everything: offering Copart to somebody who has not said they are in
// America invites them to tick it, and a sourcer in Douala claiming IAAI is
// worse than a sourcer who said nothing.
export function sourcingChannelsFor(countryCode) {
  return sourcingChannels.filter((channel) =>
    channel.countries === null
      ? true
      : Boolean(countryCode) && channel.countries.includes(countryCode),
  );
}

export function getSourcingChannelLabel(key, language) {
  const channel = sourcingChannels.find((item) => item.key === key);
  if (!channel) return null;
  return language === "en" ? channel.labelEn : channel.labelFr;
}

// Codes resolve through countries.js, never through a copy kept here.
export function getSourcingCountryLabel(code, language) {
  const country = countries.find((item) => item.code === code);
  if (!country) return null;
  return language === "en" ? country.nameEn : country.nameFr;
}

export function getSourcingCountryFlag(code) {
  return countries.find((item) => item.code === code)?.flag ?? null;
}

// Channels a listing may keep after its country changes. Picking the US,
// ticking Copart, then switching to Japan must not leave Copart declared —
// the pills would vanish from the form while the value stayed in the
// document, and the card would print a channel the sourcer cannot reach.
export function retainSourcingChannels(declared, countryCode) {
  if (!Array.isArray(declared)) return [];
  const allowed = sourcingChannelsFor(countryCode).map((channel) => channel.key);
  return declared.filter((key) => allowed.includes(key));
}

// Who to ask. A transitaire is a commissionnaire en douane: the person
// licensed to file the declaration, and in practice the only realistic way
// through for somebody importing once.
//
// French terms because providers write their listings in French here, the
// same reasoning as carServices — an English term matches nothing real.
export const transitaireTerms = [
  "transitaire",
  "transit",
  "commissionnaire en douane",
  "commissionnaire agree",
  "dedouanement",
  "dedouaner",
  "declaration en douane",
  "declarant en douane",
  "customs broker",
  "freight forwarder",
];

// What a transitaire says they handle. Declared, never inferred from the
// cargo the reader picked: a broker who only does containers must not be
// offered to somebody importing a car merely because both words appear.
export const transitaireScopes = [
  {
    key: "vehicle",
    labelEn: "Vehicles",
    labelFr: "Véhicules",
    terms: ["vehicule", "voiture", "auto", "roulier", "roro"],
  },
  {
    key: "goods",
    labelEn: "General cargo",
    labelFr: "Marchandise générale",
    terms: ["marchandise", "conteneur", "container", "fret", "cargaison"],
  },
  {
    key: "groupage",
    labelEn: "Groupage",
    labelFr: "Groupage",
    terms: ["groupage", "lcl", "colis"],
  },
];

// Accents and case go, so a listing written "Dédouanement" matches a term
// written "dedouanement". The same fold customCategories uses, for the same
// reason.
function fold(text) {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function mentionsAny(text, terms) {
  const haystack = fold(text);
  return terms.some((term) => haystack.includes(fold(term)));
}

// True when this listing's own words place it in the customs trade.
//
// Declared trade outranks the prose, exactly as it does for garages: nobody
// picks "transitaire" on the posting form by accident, whereas "transit"
// turns up in any sentence about moving anything.
export function isTransitaireListing(text, declaredTrade) {
  if (declaredTrade === "transitaire") return true;
  return mentionsAny(text, transitaireTerms);
}

// Which cargoes a transitaire covers. Empty is not "none" — it is a provider
// who did not say, and the screen reads that as "ask them" rather than
// hiding them, because a silent broker is not a broker who refuses the work.
export function transitaireScopesFor(text, declaredScopes) {
  if (Array.isArray(declaredScopes) && declaredScopes.length) {
    return declaredScopes;
  }
  return transitaireScopes
    .filter((scope) => mentionsAny(text, scope.terms))
    .map((scope) => scope.key);
}

// The papers, which are where the two cargoes genuinely diverge and so are
// the one thing on this screen that swaps wholesale.
//
// SHARED sits above both because it is required either way, and because a
// first-time importer who has never heard of the BESC is the person most
// likely to discover it too late.
//
// This list names documents, never the fees or the timescales attached to
// them, for the reason at the top of this file. It should be checked against
// douanes.gouv.bj before anybody relies on it — the same treatment "Où aller"
// gave its procedures, rather than a list written from memory.
export const importDocuments = {
  shared: [
    {
      key: "besc",
      labelEn: "BESC / ECTN",
      labelFr: "BESC / ECTN",
      hintEn: "Cargo tracking note — opened before the ship sails, not after",
      hintFr:
        "Bordereau de suivi — à ouvrir avant le départ du navire, pas après",
    },
    {
      key: "billOfLading",
      labelEn: "Bill of lading",
      labelFr: "Connaissement",
      hintEn: "The shipping line's title document — nothing is released without it",
      hintFr:
        "Le titre remis par la compagnie maritime — rien ne sort sans lui",
    },
    {
      key: "invoice",
      labelEn: "Purchase invoice",
      labelFr: "Facture d'achat",
      hintEn: "What was paid, in the seller's name",
      hintFr: "Ce qui a été payé, au nom du vendeur",
    },
  ],
  vehicle: [
    {
      key: "foreignTitle",
      labelEn: "Foreign registration document",
      labelFr: "Carte grise étrangère",
      hintEn: "The title from the country it left",
      hintFr: "Le titre du pays de départ",
    },
  ],
  goods: [
    {
      key: "packingList",
      labelEn: "Packing list",
      labelFr: "Liste de colisage",
      hintEn: "What is in each package, and its weight",
      hintFr: "Ce que contient chaque colis, et son poids",
    },
    {
      key: "origin",
      labelEn: "Certificate of origin",
      labelFr: "Certificat d'origine",
      hintEn: "Where required — it can change the rate applied",
      hintFr: "Quand il est exigé — il peut changer le taux appliqué",
    },
  ],
};

export function documentsFor(cargoKey) {
  return [...importDocuments.shared, ...(importDocuments[cargoKey] ?? [])];
}

// True when the listing is a diaspora importer rather than a broker.
//
// The declared trade outranks the prose for the same reason it does
// everywhere else here, and it matters more in this direction: "importation"
// appears in half the transitaire listings too, because they clear imports
// for a living. Without the declared trade the two lists would be the same
// list.
export function isOverseasBuyerListing(text, declaredTrade) {
  if (declaredTrade === "importateur") return true;
  if (declaredTrade === "transitaire") return false;
  // Nothing declared, and the vocabularies overlap: a transitaire's listing
  // says "importation" because clearing imports is the job, and both ends of
  // the journey talk about roulier and arrivage because they are describing
  // the same ship. So the broker terms win the tie.
  //
  // Found on the phone, not here. One seeded listing reading "Dédouanement
  // véhicule, roulier, suivi au port" appeared in both lists at once, which
  // is the exact collapse the comment above this function warned about — the
  // declared trade decides it, and a listing that declares nothing was
  // falling through to a keyword race that both sides won. "roulier" has
  // gone from the sourcer terms for the same reason: it is a kind of ship,
  // not a kind of person.
  if (mentionsAny(text, transitaireTerms)) return false;
  return mentionsAny(text, sourcerTerms);
}

// What this sourcer offers — shipping their own stock, buying to order, or
// both. Empty means they did not say, which the screen prints as "ask"
// rather than as neither.
export function sourcerOffersFor(text, declaredOffers) {
  if (Array.isArray(declaredOffers) && declaredOffers.length) {
    return declaredOffers;
  }
  return sourcerOffers
    .filter((offer) => mentionsAny(text, offer.terms))
    .map((offer) => offer.key);
}

export function getSourcerOfferLabel(key, language) {
  const offer = sourcerOffers.find((item) => item.key === key);
  if (!offer) return null;
  return language === "en" ? offer.labelEn : offer.labelFr;
}

// Which helper the reader needs at this stage, and which is merely also
// there. Returned in order, so the screen can lead with the right one
// instead of always printing the same two sections in the same order.
export function rolesForStage(stageKey) {
  if (!stageKey) return importHelperRoles;
  return [...importHelperRoles].sort((a, b) => {
    const aLeads = a.stages.includes(stageKey) ? 0 : 1;
    const bLeads = b.stages.includes(stageKey) ? 0 : 1;
    return aLeads - bLeads;
  });
}

export function roleLeadsAt(roleKey, stageKey) {
  const role = importHelperRoles.find((item) => item.key === roleKey);
  return Boolean(stageKey && role?.stages.includes(stageKey));
}

export function getImportStage(key) {
  return importStages.find((stage) => stage.key === key) ?? null;
}

export function getImportStageLabel(key, language) {
  const stage = getImportStage(key);
  if (!stage) return null;
  return language === "en" ? stage.labelEn : stage.labelFr;
}

export function getCargoKind(key) {
  return importCargoKinds.find((kind) => kind.key === key) ?? null;
}

export function getTransitaireScopeLabel(key, language) {
  const scope = transitaireScopes.find((item) => item.key === key);
  if (!scope) return null;
  return language === "en" ? scope.labelEn : scope.labelFr;
}

// Whether the storage meter is running at this stage. Read by the screen to
// decide whether the clock note appears at all — shown on every stage it
// would be wallpaper, and wallpaper is not a warning.
export function storageClockRuns(stageKey) {
  return STORAGE_CLOCK_STAGES.includes(stageKey);
}
