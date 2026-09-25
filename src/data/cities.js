// The selectable communes, as a plain array of display names.
//
// Thirteen screens import this and treat it as strings — mapping it into
// chips, filtering it by a search box, comparing it to `listing.city`. It
// stays exactly that shape: turning it into objects would be a change to all
// thirteen for no gain here.
//
// What changed is where the names come from. They are now derived from
// src/data/benin/communes.js, which carries the official 77 with their
// p-codes, departments and centroids, so the list can no longer drift from
// the roll. See that file for why display names are not taken from COD-AB.
//
// The order is deliberate and preserved: the communes people actually pick
// first, in the order they were already in, with the seventeen that were
// missing appended. "Ikpinlé" is gone from this list because it is not a
// commune — but it still resolves, so listings stored under it keep working.
import { communeNames } from './benin/communes';

export const cities = communeNames;
