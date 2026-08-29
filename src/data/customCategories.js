// The categories sellers write for themselves.
//
// The fourteen in categories.js are the app's own structure: each one has an
// icon, a colour, a browse screen and, for several, a bespoke form and detail
// page. A seller who is selling something none of them describes had two
// options, and both were bad — file it under the nearest wrong aisle, or not
// post it. Neither tells us what the missing category was.
//
// So "Autre" is a real answer, and it asks a question: what is it, then. The
// answer is a label, not a key. It cannot become a fifteenth categoryKey —
// that is what routes a listing to its detail screen and what every browse
// screen filters on, and a key invented at runtime has no screen to route to.
// It can, however, become the answer the next seller picks from a list
// instead of inventing their own synonym for it.
//
// The list grows from listings, exactly the way quartiers do. Same reasoning:
// the names cannot be written out in advance, because the whole point is that
// we do not know them, and the people who do know are the ones typing them.
//
// Two things keep it from turning into noise. Only approved listings feed it,
// so nothing reaches the next seller's screen without a moderator having read
// it. And the fold below collapses the near-misses, so "Décoration",
// "decoration" and "DÉCORATION " are one entry rather than three.

// Long enough for "Matériel de sonorisation", short enough that nobody
// pastes a paragraph into what is meant to be a label. Mirrored in
// firestore.rules, which is where it actually holds.
export const CUSTOM_CATEGORY_MAX = 40;

// Case and accents go, and so does everything that is not a letter or a
// digit. "Coiffure & beauté" and "coiffure et beaute" both land on
// "coiffurebeaute" — near enough to be the same aisle, and keeping them
// apart would defeat the point of offering the list at all.
export function foldCategoryLabel(label) {
  return (label ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(et|and|de|des|du|la|le|les)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

// What gets stored: the seller's own words, tidied rather than rewritten.
// Whitespace collapses, the length is capped, and the first letter is
// capitalised so a list of them reads as labels instead of shouting or
// mumbling. The rest of the casing is left alone — "TV & Hi-Fi" is written
// that way on purpose and title-casing it would be worse.
export function normalizeCategoryLabel(label) {
  const cleaned = (label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_CATEGORY_MAX);
  if (!cleaned) return "";
  return cleaned[0].toLocaleUpperCase("fr") + cleaned.slice(1);
}

// A label is only worth storing if it says something. A single character, or
// a string of punctuation, is somebody dismissing the question.
export function isUsableCategoryLabel(label) {
  return foldCategoryLabel(label).length >= 2;
}

// Every custom category previous sellers have used, commonest first.
//
// Ordered by how many listings carry each one rather than alphabetically:
// the whole job of this list is to get the next seller to reuse a word
// somebody already used, and the word twelve people chose belongs above the
// word one person chose. Ties break alphabetically so the order is stable.
//
// The label shown is the first spelling seen for each folded key. There is no
// correct answer to which spelling wins, and picking the commonest would
// reshuffle the list every time a listing is approved.
export function customCategoriesFrom(listings, { field = "customCategory" } = {}) {
  const seen = new Map();
  for (const listing of listings ?? []) {
    const label = normalizeCategoryLabel(listing?.[field]);
    if (!isUsableCategoryLabel(label)) continue;
    const key = foldCategoryLabel(label);
    const entry = seen.get(key);
    if (entry) entry.count += 1;
    else seen.set(key, { key, label, count: 1 });
  }
  return [...seen.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"),
  );
}

// What to call a listing whose category is "other": the seller's own word if
// they gave one, and only then the generic label. A card reading "Autre" is
// the app admitting it did not ask.
export function categoryLabelFor(listing, fallback) {
  const custom = normalizeCategoryLabel(listing?.customCategory);
  return isUsableCategoryLabel(custom) ? custom : fallback;
}
