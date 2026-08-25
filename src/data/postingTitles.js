// What the posting form is called, which depends on what is being posted.
//
// The header was built from the route's category, so choosing a category
// inside the form never changed it — somebody who picked Services was still
// looking at "Vendre un article" while filling in a service. And where a
// category WAS preset, the header showed its noun ("Services"), which names
// the aisle rather than the act.
//
// A verb per category instead. Not decoration: "Vendre" is wrong for a job
// advert, wrong for a lost dog, wrong for a chauffeur offering their time,
// and each of those is a different promise about what happens next.
const TITLE_KEYS = {
  vehicles: "postingTitleVehicles",
  realEstate: "postingTitleRealEstate",
  services: "postingTitleServices",
  jobs: "postingTitleJobs",
  community: "postingTitleCommunity",
  restaurants: "postingTitleRestaurants",
};

// Everything else is an object with a price — electronics, fashion,
// furniture, agriculture and the rest — where "vendre un article" is exactly
// right and a bespoke verb would be noise.
export function postingTitleKey(categoryKey, { isPromoted } = {}) {
  if (isPromoted) return "promoteListingTileLabel";
  return TITLE_KEYS[categoryKey] ?? "sellTitle";
}
