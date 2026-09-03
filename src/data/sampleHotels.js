// Sample hotels, on the same terms as sampleGarages and mockRestaurants:
// enough to show what the screen becomes, with nothing invented that would
// be a claim about a real establishment.
//
// The design this screen comes from ships nine hotels with names, star
// counts, ratings, room rates and telephone numbers. Every one of those is
// invented, and a hotel card is a card somebody phones from a taxi at
// nine at night — so shipping them would hand real travellers numbers that
// dial strangers, and would print a rate somebody would arrive expecting.
// The layout is followed exactly; the fabricated register is not.
//
// What these deliberately do NOT carry, for the reasons sampleGarages
// records: a rating, a telephone number, a WhatsApp, or opening hours.
//
// They DO carry a rate, a tax and a generator level, because those are the
// three the screen exists to compare and a sample without them teaches an
// hotelier nothing about why the fields are worth filling in. The names
// announce themselves as examples before anyone reads the badge.
//
// `isSample: true` is what makes them disappear: the screen swaps the whole
// set out the moment one real short-stay listing is approved.
export const sampleHotels = [
  {
    id: "sample-hotel-1",
    isSample: true,
    realEstateDeal: "shortStay",
    nameEn: "Example — seafront guesthouse",
    nameFr: "Exemple — auberge bord de mer",
    city: "Cotonou",
    quartier: "Fidjrossè",
    price: 24000,
    touristTax: 1500,
    generator: "full",
    hotWater24h: true,
    breakfastIncluded: true,
    declaredStars: 2,
  },
  {
    id: "sample-hotel-2",
    isSample: true,
    realEstateDeal: "shortStay",
    nameEn: "Example — city centre rooms",
    nameFr: "Exemple — chambres au centre",
    city: "Cotonou",
    quartier: "Ganhi",
    price: 16000,
    touristTax: 1000,
    generator: "night",
    hotWater24h: false,
    breakfastIncluded: false,
    declaredStars: 1,
  },
];

// One hall, for the same reason: the Salle tab is empty until a hall is
// posted, and an empty tab reads as a broken tab rather than a young one.
export const sampleHalls = [
  {
    id: "sample-hall-1",
    isSample: true,
    realEstateDeal: "commercial",
    commercialType: "hall",
    nameEn: "Example — event hall, 150 seats",
    nameFr: "Exemple — salle de fête, 150 places",
    city: "Abomey-Calavi",
    quartier: "Godomey",
    price: 140000,
    capacity: 150,
    generator: "full",
    eventSetting: "indoor",
  },
];
