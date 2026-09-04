// The banks licensed to operate in Bénin.
//
// Replaces a hand-written list that named eight banks "well-known" without a
// source. Two of its entries were the same institution: Diamond Bank and NSIA
// Banque. NSIA bought Diamond Bank SA in November 2017 and renamed the Bénin
// operation, which NSIA says itself — "DIAMOND Bank devient NSIA Banque" — so
// the app was sending people to a bank that had not existed for eight years,
// and placing it in Parakou, which nothing supported either.
//
// What a bank is doing on this list is now a matter of record rather than
// recollection: BCEAO licenses every credit institution in the union and
// publishes the register. Being on it is the whole claim this file makes.
//
// It does NOT claim branches, opening hours, addresses or which town each one
// is in. The old list assigned cities and there was no source for them; a
// branch list changes faster than an app ships, and sending somebody to a
// closed branch is worse than sending them to search. BanksScreen opens a map
// search for the name instead, which finds whichever branch is nearest to the
// person holding the phone.
export const banksSource =
  "https://www.bceao.int/fr/content/paysage-bancaire";
export const banksReviewedOn = "2026-08-28";

// Alphabetical. Any other order — size, age, preference — would be a ranking
// this app has no standing to make between licensed banks.
export const beninBanks = [
  { key: "boa", url: "https://boabenin.com/", name: "Bank of Africa Bénin", shortName: "BOA" },
  { key: "atlantique", url: "https://www.banqueatlantique.net/", name: "Banque Atlantique Bénin", shortName: "Atlantique" },
  {
    key: "biic",
    url: "https://www.biic-bank.com/fr/",
    name: "Banque Internationale pour l'Industrie et le Commerce",
    shortName: "BIIC",
  },
  {
    key: "bsic",
    name: "Banque Sahélo-Saharienne pour l'Investissement et le Commerce",
    shortName: "BSIC",
  },
  // Confirmed from the search index rather than by opening it here, which
  // is worth saying because it is a weaker instrument than the rest of
  // this file used.
  //
  // benin.groupebgfibank.com does not resolve from this machine — not on
  // the local resolver and not via 8.8.8.8, 1.1.1.1 or 9.9.9.9 — and
  // neither do the Côte d'Ivoire or Gabon equivalents, so a dev machine
  // reading this file will find the host dead and should not conclude the
  // site is. What confirms it: six distinct pages on that host are indexed
  // with titles ending "- BGFIBank Bénin" (mentions légales, réseau
  // d'agences, réseau de GAB among them), it is a subdomain of
  // groupebgfibank.com which was opened and read directly here, and it
  // loads for the person who asked for it.
  {
    key: "bgfi",
    url: "https://benin.groupebgfibank.com/",
    name: "BGFIBank Bénin",
    shortName: "BGFI",
  },
  { key: "ccei", name: "CCEI Bank Bénin", shortName: "CCEI" },
  { key: "coris", name: "Coris Bank International Bénin", shortName: "Coris" },
  { key: "ecobank", url: "https://ecobank.com/bj/personal-banking", name: "Ecobank Bénin", shortName: "Ecobank" },
  // Formerly Diamond Bank SA. Kept as an alias below rather than as a second
  // entry, so somebody searching the old name still finds the bank that holds
  // their account.
  { key: "nsia", name: "NSIA Banque Bénin", shortName: "NSIA" },
  { key: "orabank", name: "Orabank Bénin", shortName: "Orabank" },
  { key: "sgb", url: "https://societegenerale.bj/", name: "Société Générale Bénin", shortName: "Société Générale" },
  { key: "uba", url: "https://ubabenin.com/", name: "United Bank for Africa Bénin", shortName: "UBA" },
];

// `url` is present only where the site was confirmed to be that bank's own,
// by reading a <title> that says so. All but one were opened directly from
// here; BGFI's is noted above, where the host does not resolve from this
// machine and the confirmation came from the indexed titles of its own
// pages instead. The instrument is recorded with the entry rather than
// left for somebody to assume. The rest have none rather than a guess: several are
// behind Cloudflare (Orabank, NSIA Banque answer a script with 403) and a
// plausible-looking domain that turns out to be a parked page or somebody
// else's is the one mistake a banking directory cannot make.

// Names a bank used to trade under, so a search for the old one still lands.
//
// This is the half a rename usually loses. Somebody whose passbook says
// Diamond Bank does not know it was bought, and a directory that only knows
// the new name simply tells them the bank does not exist.
const FORMER_NAMES = {
  nsia: ["Diamond Bank"],
};

export function formerNames(key) {
  return FORMER_NAMES[key] ?? [];
}

// Everything a search should match against for one bank.
export function bankSearchTerms(bank) {
  return [bank.name, bank.shortName, ...formerNames(bank.key)];
}
