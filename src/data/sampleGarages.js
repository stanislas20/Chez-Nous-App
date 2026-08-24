// Sample garages, on the same terms as mockRestaurants: enough to show what
// the screen becomes, with nothing invented that would be a claim about a
// real business.
//
// The screen is empty until repair providers start posting, and an empty
// directory teaches nobody anything — least of all a garage owner deciding
// whether it is worth listing. One sample card answers "what would mine look
// like", which is the question that gets them to post.
//
// What these deliberately do NOT carry:
//
//   - A rating. There is no way to earn one before customers exist, and a
//     star average is a record about someone's livelihood.
//   - A phone number or WhatsApp. A number here would either be invented —
//     and dial a stranger — or belong to a business that never agreed to be
//     listed. So the sample cards have no working contact, and the UI says
//     so rather than presenting a button that does nothing.
//   - Opening hours. They would be fiction, and "Ouvert jusqu'à 18:30" is
//     exactly the kind of fiction that sends someone across town.
//
// The names are plainly generic on purpose. "Chez Maman Bénin" reads as a
// real restaurant that might exist; a garage card is a card someone will
// try to phone, so these announce themselves as examples in the name
// itself, before anyone reads the badge.
//
// Distance is real when it appears: computed at render from the device's
// own position against cityCoordinates, never stored here.
//
// `isSample: true` is what makes them disappear — the screen swaps the whole
// set out the moment one real garage is approved, the same rule the sample
// restaurants and job postings follow.
export const sampleGarages = [
  {
    id: "sample-garage-1",
    isSample: true,
    nameEn: "Example — general mechanic",
    nameFr: "Exemple — mécanicien généraliste",
    city: "Cotonou",
    place: "Fidjrossè",
    specialties: ["meca", "vidange", "frein"],
    serviceRateType: "quote",
  },
  {
    id: "sample-garage-2",
    isSample: true,
    nameEn: "Example — tyres and alignment",
    nameFr: "Exemple — pneus et géométrie",
    city: "Abomey-Calavi",
    place: "Godomey",
    specialties: ["pneu"],
    serviceRateType: "fixed",
  },
];
