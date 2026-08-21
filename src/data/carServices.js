// The after-sale trades that surround the car market: the garage, the tyre
// fitter, the auto-electrician, the parts seller, the wash, the panel beater.
//
// These are not a category of their own — they are ordinary Services listings.
// Each tile opens the Services category with its search already filled in, so
// the results are whatever real providers have published rather than a
// hand-kept directory that would rot.
//
// `query` is French on purpose: providers write their listings in French here,
// so a French term is what actually matches. The English label is for the UI,
// not for the search.
export const carServices = [
  { key: "garage", icon: "construct-outline", query: "garage" },
  { key: "tyres", icon: "disc-outline", query: "pneu" },
  { key: "battery", icon: "flash-outline", query: "batterie" },
  { key: "parts", icon: "cog-outline", query: "pièce auto" },
  { key: "wash", icon: "water-outline", query: "lavage auto" },
  { key: "bodywork", icon: "color-fill-outline", query: "carrosserie" },
];
