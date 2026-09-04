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
  // No url, because nothing here could open one.
  //
  // The site exists: six pages on benin.groupebgfibank.com are indexed
  // with titles ending "- BGFIBank Bénin", and it is a subdomain of
  // groupebgfibank.com, which does answer. But the host resolves nowhere
  // this was tried — local resolver, 8.8.8.8, 1.1.1.1, 9.9.9.9 — and
  // bgfibankbenin.bgfi.com resolves and then refuses 443 and 80. A button
  // that opens a browser on an error is worse than no button, and this one
  // was reported failing from a phone as well.
  //
  // It goes back the moment it answers: run scripts/verifyBankSites.js
  // from a connection that can reach it, and if the title names the bank,
  // add the url back here.
  { key: "bgfi", name: "BGFIBank Bénin", shortName: "BGFI" },
  { key: "ccei", name: "CCEI Bank Bénin", shortName: "CCEI" },
  { key: "coris", name: "Coris Bank International Bénin", shortName: "Coris" },
  // No url: the one we carried is dead.
  //
  // https://ecobank.com/bj/personal-banking answers with a redirect loop —
  // more than ten hops, twice, from a host that responds — so the button
  // opened a browser on an error. ecobank.com/bj does load, but its title
  // is "Ecobank - The Pan African Bank": the group, not the Bénin bank,
  // and this file does not file a parent's page as a subsidiary's own.
  { key: "ecobank", name: "Ecobank Bénin", shortName: "Ecobank" },
  // Formerly Diamond Bank SA. Kept as an alias below rather than as a second
  // entry, so somebody searching the old name still finds the bank that holds
  // their account.
  { key: "nsia", name: "NSIA Banque Bénin", shortName: "NSIA" },
  { key: "orabank", name: "Orabank Bénin", shortName: "Orabank" },
  { key: "sgb", url: "https://societegenerale.bj/", name: "Société Générale Bénin", shortName: "Société Générale" },
  { key: "uba", url: "https://ubabenin.com/", name: "United Bank for Africa Bénin", shortName: "UBA" },
];

// `url` is present only where the site was opened, answered, and its
// <title> said it was that bank's own. Every one of the five was fetched
// and read; scripts/verifyBankSites.js repeats that on demand and prints
// what it saw. A site nobody could open does not get a button — see
// Ecobank and BGFI above, each with the reason it has none. The rest have none rather than a guess: several are
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
