// The logos we actually hold, and only those.
//
// Each was downloaded from the company's own homepage by
// scripts/fetch-company-logos.py, from a tag that means "this is our mark" —
// apple-touch-icon or an <img> whose path says logo. og:image is deliberately
// not read: it is a social-preview image, and Société Générale's was a stock
// photograph of two people at a desk, which an earlier version of the script
// duly saved and called a logo.
//
// Everything absent from this map keeps a monogram plate, and that is the
// point. Some sites refuse a script (Orabank, NSIA Banque answer 403), some
// serve an empty frame (Ecobank, ChinaDrive), and some serve something that
// is not theirs: toyota.bj gives the TOYOTA mark, which is right for the site
// and wrong for a card headed "CFAO Mobility Bénin", and sanlam.com's logo
// image turned out to be the Investment Analysts Society of South Africa.
//
// None of them gets a logo found somewhere else. A mark from an image search
// is as likely to be a competitor's, a reseller's, or ten years out of date,
// and a wrong logo on a bank card is worse than no logo at all. The rejects
// are listed with their reasons in the fetcher so a re-run cannot restore
// them by accident.
//
// Requires must be static — Metro resolves them at build time, so a computed
// path silently yields nothing.
const LOGOS = {
  // Banks — BCEAO register
  atlantique: require("../../assets/logos/atlantique.png"),
  biic: require("../../assets/logos/biic.png"),
  ecobank: require("../../assets/logos/ecobank.png"),
  // NSIA Banque Bénin trades under the NSIA group mark; nsiabanque.bj is
  // behind Cloudflare, so this comes from groupensia.com.
  nsia: require("../../assets/logos/nsia.png"),
  boa: require("../../assets/logos/boa.png"),
  sgb: require("../../assets/logos/sgb.png"),
  uba: require("../../assets/logos/uba.png"),
  // Mobile operators — ARCEP
  mtn: require("../../assets/logos/mtn.png"),
  celtiis: require("../../assets/logos/celtiis.png"),
  // Moov Africa Bénin's own site answers 522 — Cloudflare cannot reach the
  // origin — so this is the same brand's mark from Moov Africa Côte d'Ivoire.
  // One company, one published logo, a country where the site is up.
  moov: require("../../assets/logos/moov.png"),
  // Insurers — ASA Bénin
  "nsia-iard": require("../../assets/logos/nsia-iard.png"),
  "nsia-vie": require("../../assets/logos/nsia-vie.png"),
  // Both SUNU arms carry the group mark, which is what SUNU itself publishes.
  sunu: require("../../assets/logos/sunu.png"),
  "sunu-vie": require("../../assets/logos/sunu.png"),
  // SanlamAllianz is the brand ASA Bénin lists, and both its arms use it.
  // Not sanlam.com — that is a different company and served the Investment
  // Analysts Society of South Africa.
  sanlam: require("../../assets/logos/sanlam.png"),
  "sanlam-vie": require("../../assets/logos/sanlam.png"),
  // Car distributors — their own sites, from carDealerships.js
  //
  // CFAO's is the group's own mark from cfaogroup.com, NOT the Toyota logo
  // that toyota.bj serves. That site is CFAO's, but a manufacturer's mark on
  // a card headed "CFAO Mobility Bénin" says the manufacturer is the
  // business.
  cfao: require("../../assets/logos/cfao.png"),
  socar: require("../../assets/logos/socar.png"),
  sonaec: require("../../assets/logos/sonaec.png"),
  // ALST's own mark, published on its group's site — the group our data
  // already records for it, "Groupe African Lease".
  alst: require("../../assets/logos/alst.png"),
};

export function companyLogo(key) {
  return LOGOS[key] ?? null;
}

export function hasLogo(key) {
  return Boolean(LOGOS[key]);
}

export const logoCount = Object.keys(LOGOS).length;
