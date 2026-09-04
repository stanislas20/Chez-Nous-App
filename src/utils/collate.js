// Sorting names the way French reads them, without paying for it twice.
//
// `a.localeCompare(b, "fr")` is the obvious way to write this and it is a
// trap on Android. Under Hermes that call builds a collator, crosses into
// the platform's ICU and throws the collator away again — every single
// comparison. Measured on a Galaxy, sorting the 737 names in the hotel
// directory:
//
//   a.localeCompare(b, "fr")            6441 ms
//   the same sort, run again            6303 ms   (so: not a warm-up)
//   new Intl.Collator("fr")                1 ms
//   the same sort through its .compare    10 ms
//
// 630 times faster, same order. The Hôtels screen was spending 6.7 of the
// 7.2 seconds it took to open inside one such sort, with the screen blank
// behind it — see check-osm-directory.js, which now holds that file in
// name order so the screen never has to sort it at all.
//
// Everything else that sorts names goes through here. The country picker
// alone was 1.7 seconds for its 245 countries.
//
// The collators are cached per locale because building one is the part
// worth avoiding; comparing through one is cheap.
const collators = new Map();

export function collate(language) {
  const locale = language === "en" ? "en" : "fr";
  let collator = collators.get(locale);
  if (!collator) {
    // Intl is present in Hermes on both platforms, but a build that ships
    // without it must still sort accents correctly — so the fallback is
    // the slow-but-right call rather than a byte comparison, which would
    // file "Ébène" after "Zinsou".
    collator =
      typeof Intl !== "undefined" && Intl.Collator
        ? new Intl.Collator(locale)
        : { compare: (a, b) => String(a).localeCompare(String(b), locale) };
    collators.set(locale, collator);
  }
  return collator.compare;
}

// The common case: compare two names in French.
export function compareNames(a, b) {
  return collate("fr")(String(a ?? ""), String(b ?? ""));
}
