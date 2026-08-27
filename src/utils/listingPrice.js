import { realEstatePriceSuffixKey } from "../data/realEstate";
import { getServiceRateLabel } from "../data/serviceRateTypes";

// What a listing costs, or an honest answer that it does not say.
//
// `price` is 0 on every listing whose category never asks for one — a
// pharmacy on duty, a job, a community notice, a restaurant, a trade working
// sur devis. CreateListingScreen sets it to 0 and moves on, which is fine as
// storage and was a lie on screen: 0 formatted is "0", and "0 FCFA" does not
// read as "no price given". It reads as free. A restaurant card was offering
// to feed people for nothing.
//
// The fix is not a list of categories that skip the price. That list would go
// stale the first time a category was added — the same by-exclusion trap that
// had tracker fitters answering questions about winches. It is the stored
// value that decides: a price is a positive number or it is absent, and
// absent has to be said in words or not at all.
//
// Returns null when there is nothing truthful to print. Callers render
// nothing at all in that case, rather than a placeholder — a card with no
// price line is quieter and more honest than one apologising for it.
const priceFormatter = new Intl.NumberFormat("fr-FR");

export function listingPrice(listing, t, language) {
  const value = Number(listing?.price);
  if (Number.isFinite(value) && value > 0) {
    return {
      kind: "amount",
      amount: priceFormatter.format(value),
      // Included here rather than at each call site because a rent shown as
      // a bare total is its own bug: 150 000 a month and 150 000 outright are
      // different offers that were rendering identically.
      suffix:
        listing.categoryKey === "realEstate" && listing.realEstateDeal
          ? ` ${t(realEstatePriceSuffixKey(listing.realEstateDeal))}`
          : " FCFA",
    };
  }

  // "Sur devis" is not a missing price — it is the answer, chosen from the
  // rate picker by someone who cannot quote until they have seen the job.
  // Worth saying out loud, unlike the silence below.
  if (listing?.serviceRateType === "quote") {
    const label = getServiceRateLabel("quote", language);
    if (label) return { kind: "words", text: label };
  }

  return null;
}

// The same thing flattened, for share sheets and single-line rows.
export function listingPriceText(listing, t, language) {
  const price = listingPrice(listing, t, language);
  if (!price) return null;
  return price.kind === "amount"
    ? `${price.amount}${price.suffix}`
    : price.text;
}
