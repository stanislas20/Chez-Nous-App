// Sample restaurants, on the same terms as mockBanks: enough to build and
// judge the screen against, with nothing invented that would be a claim
// about a real business.
//
// What the mockup asked for and this deliberately does NOT carry:
//
//   - Star ratings and review counts. "4,8 ★ (214 avis)" on a real
//     restaurant is a fabricated record about someone's livelihood, and
//     there is no review system in this app to produce one honestly.
//   - Exact menu prices ("3 000 – 6 000 FCFA"). We have no verified menu.
//     A price band conveys the same useful signal without asserting a
//     figure nobody checked.
//   - Delivery fees and closing times. Both change weekly and would be
//     wrong within a month of being typed here.
//
// Distance IS real: it's computed at render time from the device's own
// location against cityCoordinates, not stored here.
//
// `isSample: true` is carried on every row so the UI can say plainly that
// these are placeholders — the same honesty the sample job postings use.
export const mockRestaurants = [
  {
    id: 'rest1',
    name: 'Chez Maman Bénin',
    cuisine: 'beninese',
    city: 'Cotonou',
    area: 'Fidjrossè',
    priceBand: 'budget',
    delivery: true,
    dishes: ['Amiwo', 'Poulet braisé'],
    isSample: true,
  },
  {
    id: 'rest2',
    name: 'Le Grill de Ganhi',
    cuisine: 'grill',
    city: 'Cotonou',
    area: 'Ganhi',
    priceBand: 'mid',
    delivery: true,
    dishes: ['Brochettes', 'Terrasse'],
    // The "Mise en avant" slot is a paid placement, the same idea the ads
    // collection already models. Flagged on a sample row so the slot can be
    // built and judged; a real one would come from an approved ad, never
    // from a hardcoded flag.
    promoted: true,
    isSample: true,
  },
  {
    id: 'rest3',
    name: 'Maquis du Lac',
    cuisine: 'fish',
    city: 'Cotonou',
    area: 'Akpakpa',
    priceBand: 'mid',
    delivery: false,
    dishes: ['Tilapia', 'Vue sur le lac'],
    isSample: true,
  },
  {
    id: 'rest4',
    name: 'Saveurs d’Abomey',
    cuisine: 'beninese',
    city: 'Abomey',
    area: 'Centre',
    priceBand: 'budget',
    delivery: true,
    dishes: ['Wagasi', 'Pâte rouge'],
    isSample: true,
  },
  {
    id: 'rest5',
    name: 'Beirut Cotonou',
    cuisine: 'lebanese',
    city: 'Cotonou',
    area: 'Haie Vive',
    priceBand: 'high',
    delivery: true,
    dishes: ['Chawarma', 'Mezzé'],
    isSample: true,
  },
  {
    id: 'rest6',
    name: 'Pizza Nokoué',
    cuisine: 'pizza',
    city: 'Porto-Novo',
    area: 'Centre',
    priceBand: 'mid',
    delivery: true,
    dishes: ['Four à bois', 'Familial'],
    isSample: true,
  },
  {
    id: 'rest7',
    name: 'Le Baobab',
    cuisine: 'beninese',
    city: 'Parakou',
    area: 'Zongo',
    priceBand: 'budget',
    delivery: false,
    dishes: ['Igname pilée', 'Poisson fumé'],
    isSample: true,
  },
  {
    id: 'rest8',
    name: 'Snack Étoile',
    cuisine: 'fastFood',
    city: 'Abomey-Calavi',
    area: 'Calavi Centre',
    priceBand: 'budget',
    delivery: true,
    dishes: ['Burgers', 'Jus frais'],
    isSample: true,
  },
];
