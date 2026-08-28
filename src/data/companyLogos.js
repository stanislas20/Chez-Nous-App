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
  boa: require("../../assets/logos/boa.png"),
  sgb: require("../../assets/logos/sgb.png"),
  uba: require("../../assets/logos/uba.png"),
  // Mobile operators — ARCEP
  mtn: require("../../assets/logos/mtn.png"),
  // Insurers — ASA Bénin
  "nsia-iard": require("../../assets/logos/nsia-iard.png"),
  "nsia-vie": require("../../assets/logos/nsia-vie.png"),
  // Both SUNU arms carry the group mark, which is what SUNU itself publishes.
  sunu: require("../../assets/logos/sunu.png"),
  "sunu-vie": require("../../assets/logos/sunu.png"),
  // Car distributors — their own sites, from carDealerships.js
  socar: require("../../assets/logos/socar.png"),
  sonaec: require("../../assets/logos/sonaec.png"),
};

export function companyLogo(key) {
  return LOGOS[key] ?? null;
}

export function hasLogo(key) {
  return Boolean(LOGOS[key]);
}

export const logoCount = Object.keys(LOGOS).length;
