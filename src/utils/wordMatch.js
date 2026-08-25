// Whole-word matching for free text a provider wrote.
//
// Extracted from garageSpecialties, which learned all of this the hard way
// and should not be the only file that knows it.
//
// The rule everywhere is the same: a listing is placed by its own words, so
// the matching has to be tight enough that a plumber never becomes an auto
// electrician. Substring matching is what breaks that — with forty terms
// concatenated, "et" matched inside "géométrie" and "eau" inside "faisceau",
// and a plumbing advert ("fuite, robinet, chauffe-eau") came back as
// auto-electrics.
export function foldText(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

// Up to three trailing characters, so a term written in the plural or lightly
// inflected still counts — "pneus" for pneu, "freinage" for frein — while
// staying far too tight to reach an unrelated longer word.
export const INFLECTION_SLACK = 3;

export function mentionsWord(text, term) {
  const needle = foldText(term);
  if (!needle) return false;
  const haystack = foldText(text);
  // A multi-word term ("valise diagnostic") is a phrase, so it is matched as
  // one rather than word by word.
  if (needle.includes(" ")) return haystack.includes(needle);
  return haystack
    .split(" ")
    .some(
      (word) =>
        word === needle ||
        (word.startsWith(needle) &&
          word.length - needle.length <= INFLECTION_SLACK),
    );
}

export function mentionsAnyWord(text, terms) {
  return (terms ?? []).some((term) => mentionsWord(text, term));
}

// The two-list pattern: terms that are unmistakable on their own, and
// ambiguous ones that only count once the text has also established what
// kind of listing this is. Every trade in the app is decided this way.
export function matchesTrade(text, { terms, weakTerms, context }) {
  if (mentionsAnyWord(text, terms)) return true;
  if (!weakTerms?.length) return false;
  return mentionsAnyWord(text, context) && mentionsAnyWord(text, weakTerms);
}
