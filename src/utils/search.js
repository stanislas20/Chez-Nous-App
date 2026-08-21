// Shared free-text search matching for every screen with a SearchBar.
//
// A typed query is usually a short keyword fragment ("porto novo"), which a
// plain whole-string substring check (title.includes(query)) handles fine.
// A spoken query (SearchBar's voice search) is naturally a full sentence —
// "can you find me a pharmacy in Porto Novo" — and that entire sentence
// almost never appears verbatim inside a short title, so the same substring
// check silently returns nothing. Stripping common filler words first and
// then requiring only the remaining meaningful words to each appear
// somewhere in the searchable text fixes both cases with one rule.
const STOPWORDS = new Set([
  // English filler words that carry no search-relevant meaning on their own.
  'a', 'an', 'the', 'i', 'me', 'my', 'for', 'of', 'to', 'in', 'on', 'near',
  'please', 'show', 'find', 'search', 'looking', 'look', 'want', 'need',
  'some', 'any', 'with', 'is', 'are', 'can', 'you', 'get', 'give',
  // French equivalents — the app is bilingual and voice search runs in
  // whichever language the UI is currently set to.
  'je', 'veux', 'voudrais', 'cherche', 'cherchez', 'trouve', 'trouver',
  'un', 'une', 'des', 'le', 'la', 'les', 'de', 'du', 'pour', 'dans',
  'pres', 'proche', 'sil', 'vous', 'plait', 'montre', 'montrez', 'moi',
  'peux', 'pouvez', 'avec', 'est', 'sont', 'donne', 'donnez',
]);

function fold(value) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function queryTokens(query) {
  return fold(query)
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

// A word "matches" if it's a plain substring anywhere in the haystack, OR
// if it shares a long-enough prefix with some individual word in the
// haystack. That second rule is what lets a single spoken word like
// "pharmacy" (English) find a listing titled "Pharmacie Boladji" (French —
// real listing names are proper nouns/business names, not translated) or
// "bank" find "Banque Atlantique". Words under 4 characters skip the fuzzy
// rule entirely (too short to compare a meaningful prefix ratio on) and
// fall back to requiring an exact match.
function sharesStrongPrefix(token, word) {
  const minLen = Math.min(token.length, word.length);
  if (minLen < 4) return token === word;
  let shared = 0;
  while (shared < minLen && token[shared] === word[shared]) shared++;
  return shared / minLen >= 0.75;
}

function tokenMatchesHaystack(token, haystack, words) {
  if (haystack.includes(token)) return true;
  return words.some((word) => sharesStrongPrefix(token, word));
}

// True when (almost) every meaningful word in `query` matches somewhere
// across the given searchable text fields (accent/case/punctuation-
// insensitive on both sides, plus the fuzzy-prefix rule above). An empty
// query, or one made up entirely of filler words, matches everything —
// same as the "no query yet" behavior every screen already had.
//
// A LONG query (4+ meaningful words) additionally tolerates exactly one
// non-matching word, on top of the fuzzy rule — natural speech sometimes
// includes a word (an unrelated filler that slipped past the stopword list,
// a mistranscribed word) that isn't going to match anything no matter how
// it's compared.
//
// Short queries get no such tolerance. Dropping one word out of two means
// half the query is ignored: dictating "Ecobank" comes through as "eco
// bank", and matching on "bank" alone returned Bank of Africa and Orabank
// alongside it. The looser rule only makes sense once there are enough
// words left that the remainder still identifies something.
export function queryMatches(query, ...textParts) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return true;
  const haystack = fold(textParts.filter(Boolean).join(' '));
  const words = haystack.split(' ').filter(Boolean);
  const matchedCount = tokens.filter((token) => tokenMatchesHaystack(token, haystack, words)).length;
  const requiredMatches = tokens.length >= 4 ? tokens.length - 1 : tokens.length;
  return matchedCount >= requiredMatches;
}

// The inverse shape of queryMatches: true when ANY single meaningful word in
// `query` matches one of `keywords` — used to gate a category-specific
// lookup (e.g. only hit the Google Places pharmacy API when the search
// plausibly means "pharmacy") behind an actual mention of that category,
// rather than every keyword needing to be about it. queryMatches itself
// isn't right for this — "find me a pharmacy in Porto Novo" has 3 real
// words, and requiring 2+ of them to match "pharmacy pharmacie" would
// wrongly reject it just for also naming a city.
export function queryMentionsAnyOf(query, ...keywords) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return false;
  const haystack = fold(keywords.join(' '));
  const words = haystack.split(' ').filter(Boolean);
  return tokens.some((token) => tokenMatchesHaystack(token, haystack, words));
}
