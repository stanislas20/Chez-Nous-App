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
  // The group's site, and labelled as the group's site on screen.
  //
  // BGFIBank Bénin's own address could not be confirmed from here.
  // benin.groupebgfibank.com does not resolve at all — nor do the Côte
  // d'Ivoire or Gabon equivalents, so those country sites look retired
  // rather than merely unreachable — and bgfibankbenin.bgfi.com resolves
  // but refuses connections on 443 and 80. What is verified is
  // groupebgfibank.com, opened and read: "Groupe BGFIBank – Votre
  // partenaire pour l'avenir", with BGFIBank Bénin on its contacts page.
  //
  // So urlScope says what it is. A customer sent to the group's home page
  // has been sent somewhere real and told so; a group page dressed as the
  // Bénin bank's own would be the small lie this file exists to avoid.
  // If the subsidiary's site is reachable from Bénin, this becomes a plain
  // url and the scope goes away.
  {
    key: "bgfi",
    url: "https://groupebgfibank.com/",
    urlScope: "group",
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

// `url` is present only where a site was opened and its <title> confirmed
// whose it is. `urlScope: "group"` marks the one case where what could be
// confirmed was the parent group's site rather than the Bénin bank's own,
// and the screen labels that link differently — the same rule companyLogos
// follows when a local site is unreachable and the group publishes the mark. The rest have none rather than a guess: several are
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
