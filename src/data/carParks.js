// The physical used-car market east of Cotonou.
//
// This is the part of the vertical that the existing classifieds sites do
// not have: the trade here is concentrated in sales parks strung along the
// Cotonou–Porto-Novo road, and someone hunting a car goes to a place before
// they go to a website.
//
// Two rules hold this list honest:
//
//   1. No stock or seller counts. They would be invented today, and a
//      fabricated "87 véhicules" is the first thing that betrays an empty
//      marketplace. The screen counts real listings instead, and stays quiet
//      at zero.
//   2. Positions are the centre of the locality, not a street address — the
//      parks are stretches of roadside, not single addresses. The map says so
//      rather than dropping a pin that implies a precision nobody has.
//
// SCALE, and why these five entries are localities rather than parks: the
// market runs about a dozen kilometres east of Cotonou and holds HUNDREDS of
// individual regrouping parks — named businesses like Ritis at Ekpè or Balla
// et Fils at Sèkandji, plus a long tail of informal ones. Cotonou lands
// 1 000–1 500 used vehicles a day, and the trade is put at 9% of Bénin's GDP.
//
// So nothing counting this array may call the result "parcs". Five is the
// number of LOCALITIES the parks cluster in, and the labels say so. The hero
// stat used to read "5 parcs automobiles", which understated a sector of
// hundreds by two orders of magnitude.
export const carParks = [
  {
    key: "sekandji",
    name: "Sèkandji",
    commune: "Sèmè-Podji",
    latitude: 6.3833,
    longitude: 2.5333,
  },
  {
    key: "djeffa",
    name: "Djeffa",
    commune: "Sèmè-Podji",
    latitude: 6.3708,
    longitude: 2.5028,
  },
  {
    key: "ekpe",
    name: "Ekpè",
    commune: "Sèmè-Podji",
    latitude: 6.3667,
    longitude: 2.4833,
  },
  {
    key: "semeKpodji",
    name: "Sèmè-Kpodji",
    commune: "Sèmè-Podji",
    latitude: 6.3639,
    longitude: 2.6278,
  },
  {
    key: "agblangandan",
    name: "Agblangandan",
    commune: "Sèmè-Podji",
    latitude: 6.3722,
    longitude: 2.4667,
  },
  {
    // Point Kilométrique 10 on the Cotonou–Porto-Novo road. People search for
    // it by this name, which is why it is its own entry even though the
    // stretch it names runs into Agblangandan and Ekpè either side of it —
    // these are overlapping stretches of one road, not separate towns.
    key: "pk10",
    name: "PK10",
    commune: "Cotonou",
    latitude: 6.3735,
    longitude: 2.479,
  },
];

// The named businesses operating on the corridor. Only those whose details
// are published are here — the great majority of the hundreds of parks are
// informal and have no source to check against, so this is a starting point
// rather than a register.
//
// `note` is what each one publishes about itself. Nothing here is a Chez-Nous
// endorsement or a verified figure, and "largest in Africa" claims circulating
// on social media about this corridor are deliberately not repeated.
export const carParkOperators = [
  {
    key: "balla",
    name: "Société Balla et Fils",
    park: "sekandji",
    noteEn:
      "Around 12 hectares beside the inter-state road, holding thousands of vehicles across all categories.",
    noteFr:
      "Environ 12 hectares en bordure de la route inter-État, avec des milliers de véhicules de toutes catégories.",
    website: "http://societeballa.com",
  },
  {
    key: "ritis",
    name: "Ritis International",
    park: "ekpe",
    noteEn:
      "Pitches leased to Beninese and foreign importers, 15 minutes from the port, with its own access lane and slip road onto the highway.",
    noteFr:
      "Emplacements loués à des importateurs béninois et étrangers, à 15 minutes du port, avec sa propre voie d’accès et une bretelle vers la voie rapide.",
    website: "http://www.ritisgroup.com",
  },
];

export function operatorsForPark(parkKey) {
  return carParkOperators.filter((item) => item.park === parkKey);
}

// The whole corridor, used to frame the map so every park is on screen at
// once — the point of the screen is that they form one market, not five
// unrelated dots.
export const CAR_PARK_REGION = {
  latitude: 6.3714,
  longitude: 2.5428,
  latitudeDelta: 0.09,
  longitudeDelta: 0.22,
};

export function getCarPark(key) {
  return carParks.find((item) => item.key === key) ?? null;
}

export function getCarParkLabel(key) {
  const park = getCarPark(key);
  return park ? `${park.name}, ${park.commune}` : "";
}
