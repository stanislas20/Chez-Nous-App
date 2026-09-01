import { getCategoryLabel } from "./categories";
import { getEventKindLabel } from "./events";

// What to call a listing, in two words, on its own card.
//
// The card already carried a category ICON in this spot — a shape you have
// to already know to read. A word is what makes a wall of cards scannable:
// Soirée, Véhicules, Immobilier.
//
// The most specific thing the listing actually declares wins. An event is
// not usefully labelled "Événements & Sorties" when its own organiser said
// Soirée, and that specificity is the whole point of the badge. Where no
// subtype was declared, the category is the honest answer rather than a
// guess at one.
export function listingBadgeLabel(listing, language) {
  if (!listing) return null;

  if (listing.categoryKey === "events" && listing.eventKind) {
    const kind = getEventKindLabel(listing.eventKind, language);
    // "Autre" as a badge says nothing the category did not already say.
    if (kind && listing.eventKind !== "other") return kind;
  }

  // A custom aisle is a word the seller typed for a thing the list missed,
  // so it is more specific than "Autre" by construction.
  if (listing.categoryKey === "other" && listing.customCategory) {
    return listing.customCategory;
  }

  return getCategoryLabel(listing.categoryKey, language);
}
