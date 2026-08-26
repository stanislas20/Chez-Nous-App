// How much experience a job asks for, as three bands rather than a free
// number: a poster picks reliably between "none / 1–3 / over 3", whereas an
// open years field invites "2-3", "24 months" and "négociable", none of
// which can be coloured or filtered.
//
// The bands exist to be seen at a glance on the home feed, which is why they
// carry their own labels here rather than i18n keys, the same way
// companySectors.js does.
export const experienceLevels = [
  { key: "none", labelEn: "No experience", labelFr: "Sans expérience" },
  { key: "junior", labelEn: "1 to 3 years", labelFr: "1 à 3 ans" },
  { key: "senior", labelEn: "Over 3 years", labelFr: "Plus de 3 ans" },
];

// Jobs posted before this field existed only ever recorded a `noExp`
// boolean, so a legacy `true` still resolves to the green band. A legacy
// `false` resolves to null, NOT to a band: it recorded "not beginner-
// friendly" and nothing more, and inventing "over 3 years" from it would
// paint old listings red on a requirement nobody ever stated.
export function getExperienceLevel(job) {
  if (!job) return null;
  if (job.experienceLevel) return job.experienceLevel;
  return job.noExp ? "none" : null;
}

export function getExperienceLabel(key, language) {
  const level = experienceLevels.find((item) => item.key === key);
  if (!level) return null;
  return language === "en" ? level.labelEn : level.labelFr;
}

// One hue at three strengths, not a traffic light.
//
// These bands used to be primaryLight / accentLight / errorLight — green,
// amber and the app's own ERROR colour. Green-amber-red is a severity ramp,
// and how much experience a job asks for has no severity: it made every
// posting a seasoned candidate is best qualified for look like a warning,
// and every beginner job look like a pass. Borrowing a verdict palette for
// a neutral fact is what made the feed look unfinished.
//
// A single hue deepening across the three bands says the true thing — this
// is a scale, and the job asks for more as it darkens — without telling
// anybody their experience is a problem.
//
// Returned as rgba over whatever the card sits on, so the same three values
// composite correctly on a white surface and on a near-black one. That
// removes the light/dark branch these functions used to need, along with
// the chance of getting it wrong in one theme and never seeing it.
const BAND = "11, 110, 79"; // the emerald the rest of the app is built from

export function getExperienceTint(key, theme) {
  // Kept deliberately faint. The first pass ran to 0.22 on the top band and
  // the card's own muted text stopped carrying against it — a scale you
  // cannot read the card through is worse than no scale. Three steps this
  // shallow are still separable side by side in a list, which is the only
  // place they are ever compared.
  if (key === "none") return `rgba(${BAND}, 0.035)`;
  if (key === "junior") return `rgba(${BAND}, 0.075)`;
  if (key === "senior") return `rgba(${BAND}, 0.125)`;
  // No requirement stated is not the same as a demanding one, so an unknown
  // band stays an ordinary card rather than being given the lightest step.
  return theme.surface;
}

export function getExperienceAccent(key, theme) {
  if (key === "none") return `rgba(${BAND}, 0.18)`;
  if (key === "junior") return `rgba(${BAND}, 0.28)`;
  if (key === "senior") return `rgba(${BAND}, 0.40)`;
  return theme.border;
}
