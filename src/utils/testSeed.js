// Test data that gets out of the way on its own.
//
// The demo cards elsewhere in the app — garages, jobs, restaurants — are
// plain arrays rendered only while the real list is empty, so they vanish
// the instant somebody publishes. Seeded listings cannot do that: they are
// genuine documents, which is the whole point of them, since only a real
// document exercises the Firestore read, the distance sort, the ratings and
// the contact buttons.
//
// So they yield instead. The moment one genuine listing turns up in a list,
// every seeded one drops out of it — a professional's first post is never
// shown beside something titled "TEST —", and nobody has to remember to run
// the cleanup before that happens.
//
// Per list, deliberately: a real garage appearing under Garages says nothing
// about whether anyone sells tyres yet, and pulling the test tyres on the
// strength of it would empty a screen that is still genuinely empty.
export function withoutTestSeed(items) {
  if (!items?.length) return items ?? [];
  const real = items.filter((item) => !item.isTestSeed);
  // Still nothing genuine here: the seeded rows are all this list has, and
  // an empty screen would teach us less than a populated one.
  if (!real.length) return items;
  return real;
}
