// How much text a listing, an application and a message may carry.
//
// These are duplicated in firestore.rules, which is the copy that binds —
// a maxLength on a TextInput is a courtesy to somebody typing, and stops
// nobody holding the SDK. The duplication is guarded: scripts/check-text-
// limits.js asserts the two agree, so raising one without the other fails a
// test rather than shipping a form that accepts what the database refuses.
//
// The numbers are set against real content rather than against a round
// figure. The longest description anywhere in the bundled data is 323
// characters and the longest title 39, so these leave well over an order of
// magnitude of headroom — the point is not to shape what people write, it
// is that nothing capped these at all before, and a listing could hold a
// pasted document up to Firestore's 1 MiB document ceiling. On a feed that
// downloads the whole collection, a handful of those are paid for by every
// reader on every cold start.

// A phone screen shows roughly 40 characters of title on a card. 120 is
// three lines of that, which is longer than any title should be and short
// enough that no card can be pushed out of shape.
export const LISTING_TITLE_MAX = 120;

// About 800 words. Long enough for a full job posting or a property
// description with its own paragraphs; short enough that it is not a
// document.
export const LISTING_DESCRIPTION_MAX = 5000;

// Nobody types four thousand characters into a chat composer on a phone.
// This is a ceiling on what can be pasted, not a limit anybody will meet.
export const CHAT_MESSAGE_MAX = 4000;

// What a candidate writes to an employer alongside their CV.
export const APPLICATION_MESSAGE_MAX = 2000;

// FCFA. Ten billion is around fifteen million euro — above any Cotonou
// property, and low enough to refuse the overflow-shaped numbers that make
// a price card render nonsense.
//
// Zero is valid and common: listingPrice.js reads 0 as "no price given" for
// jobs, pharmacies, restaurants and anything sur devis.
export const LISTING_PRICE_MAX = 10000000000;
