// Bénin companies that a register vouches for.
//
// The "Entreprises vérifiées" row held six car distributors and nothing else,
// because the distributors were the only ones anybody had gone and checked.
// That made a row about verification look like a row about cars.
//
// These are the sectors where somebody official keeps a list, which is the
// only kind of company this app can add without a person approving an account:
//
//   banks      BCEAO licenses every credit institution in the union
//   telecoms   ARCEP authorises the mobile operators
//   insurers   ASA Bénin publishes its membership
//
// Being on one of those lists is the entire claim. Not that they are good,
// not that they are partners, not that they are on Chez-Nous — only that the
// body that regulates the sector names them. Anything without a register
// behind it stays out, however well known: "verified" has to keep meaning
// something narrow enough to be true.
//
// The banks live in beninBanks.js, which came first and is read by its own
// screen. This file adds the other two sectors and the sector metadata all
// three share.
export const companiesReviewedOn = "2026-08-28";

export const companySectors = [
  {
    key: "bank",
    icon: "business-outline",
    accent: "#1E5F8C",
    labelEn: "Banks",
    labelFr: "Banques",
    // Who says so, shown on the screen under each group.
    authorityEn: "Licensed by BCEAO",
    authorityFr: "Agréées par la BCEAO",
    source: "https://www.bceao.int/fr/content/paysage-bancaire",
  },
  {
    key: "telecom",
    icon: "cellular-outline",
    accent: "#8A6D1F",
    labelEn: "Mobile operators",
    labelFr: "Opérateurs mobiles",
    authorityEn: "Authorised by ARCEP",
    authorityFr: "Autorisés par l'ARCEP",
    source: "https://arcep.bj/",
  },
  {
    key: "insurer",
    icon: "shield-checkmark-outline",
    accent: "#0E6E6E",
    labelEn: "Insurers",
    labelFr: "Assurances",
    authorityEn: "Members of ASA Bénin",
    authorityFr: "Membres de l'ASA Bénin",
    source: "https://www.asabenin.org/nos-membres",
  },
];

export function getSector(key) {
  return companySectors.find((item) => item.key === key) ?? null;
}

// The three mobile operators ARCEP names. Celtiis is the trading name of
// SBIN, which is why both appear — somebody reading a bill sees one and
// somebody reading an advert sees the other.
export const beninTelecoms = [
  { key: "mtn", url: "https://www.mtn.bj/", sector: "telecom", name: "MTN Bénin", emblem: "MTN" },
  {
    key: "moov",
    sector: "telecom",
    name: "Moov Africa Bénin",
    emblem: "Moov",
  },
  {
    key: "celtiis",
    url: "https://celtiis.bj/",
    sector: "telecom",
    name: "Celtiis",
    fullName: "SBIN",
    emblem: "Celtiis",
  },
];

// ASA Bénin's own membership list, kept in its two halves.
//
// The split is not decoration: in the CIMA zone life and non-life are
// separately licensed companies, which is why several names appear twice with
// "Vie" on one of them. Flattening them would make it look like the app had
// listed the same insurer twice by mistake.
export const beninInsurers = [
  { key: "africaine", emblem: "AFRIC", sector: "insurer", name: "L'Africaine des Assurances", branch: "iard" },
  { key: "afg", url: "https://afgassurances.bj/", emblem: "AFG", sector: "insurer", name: "AFG Assurances Bénin IARDT", branch: "iard" },
  { key: "gab", emblem: "GAB", sector: "insurer", name: "La Générale des Assurances du Bénin", branch: "iard" },
  { key: "nobila", url: "https://nobilaassurances.com/", emblem: "NOBILA", sector: "insurer", name: "NOBILA Assurances", branch: "iard" },
  { key: "nsia-iard", url: "https://www.nsiaassurancesbenin.com/", emblem: "NSIA", sector: "insurer", name: "NSIA Assurances Bénin", branch: "iard" },
  { key: "sanlam", emblem: "SANLAM", sector: "insurer", name: "SanlamAllianz", branch: "iard" },
  { key: "sunu", url: "https://www.sunu-group.com/", emblem: "SUNU", sector: "insurer", name: "SUNU Assurances Bénin", branch: "iard" },
  { key: "africaine-vie", emblem: "AFRIC", sector: "insurer", name: "L'Africaine Vie Bénin", branch: "vie" },
  { key: "afg-vie", url: "https://afgassurances.bj/", emblem: "AFG", sector: "insurer", name: "AFG Assurances Bénin Vie", branch: "vie" },
  { key: "cif-vie", emblem: "CIF", sector: "insurer", name: "CIF Assurances Vie Bénin", branch: "vie" },
  { key: "nsia-vie", url: "https://site.nsiaviebenin.com/", emblem: "NSIA", sector: "insurer", name: "NSIA Vie Assurances Bénin", branch: "vie" },
  { key: "sanlam-vie", emblem: "SANLAM", sector: "insurer", name: "SanlamAllianz Vie", branch: "vie" },
  { key: "sunu-vie", url: "https://www.sunu-group.com/", emblem: "SUNU", sector: "insurer", name: "SUNU Assurances Vie Bénin", branch: "vie" },
];

export const insuranceBranches = [
  { key: "iard", labelEn: "Non-life", labelFr: "IARD" },
  { key: "vie", labelEn: "Life", labelFr: "Vie" },
];

// The plate, since we hold no logo for any of these.
//
// Every entry states its own, because deriving initials from an insurer's
// legal name produces something nobody has ever seen: "L'Africaine des
// Assurances" reduces to AA, "NOBILA Assurances" to NA, "SanlamAllianz" to
// Sanla. What a customer recognises is the brand inside the name, so that is
// what the plate carries — and the life and non-life arms of the same group
// share it, since the grouping already says which is which.
//
// The derivation below is kept for anything added later without one, but it
// is the fallback and not the rule.
const SKIP = /^(de|du|des|la|le|les|l'|d')$/i;

export function companyEmblem(company) {
  if (company.emblem) return company.emblem;
  const words = company.name
    .replace(/['’]/g, "' ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !SKIP.test(word));
  if (words.length === 1) return words[0].slice(0, 5);
  return words
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);
}

export function companiesIn(sector) {
  if (sector === "telecom") return beninTelecoms;
  if (sector === "insurer") return beninInsurers;
  return [];
}
