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

// One hue at three strengths, carried on a badge rather than the whole card.
//
// These bands were primaryLight / accentLight / errorLight to begin with —
// green, amber and the app's own ERROR colour. Green-amber-red is a severity
// ramp, and how much experience a job asks for has no severity: it made
// every posting a seasoned candidate is best qualified for look like a
// warning and every beginner job look like a pass.
//
// Replacing that with a single hue was right. Washing it across the entire
// card was not. A tint has to stay faint enough to read a whole card of
// muted text through, and three steps that faint are indistinguishable from
// each other in the feed — so the cards all came out the same flat sage,
// the legend explained a difference nobody could see, and the crispness of
// a white card was spent for nothing.
//
// So the colour now sits on one small badge per card. A badge is compared
// against white on both sides, needs to carry three words at most, and can
// therefore be four times stronger than a card wash — which is what makes
// the three bands actually separable.
//
// Two values, because they do different jobs and one ramp cannot do both:
// `Tint` fills, `Accent` is ink — it is used as dot fill, border AND label
// colour, so every step of it has to be legible as text. That is why the
// accents are solid rather than the low-alpha values a border alone could
// have got away with.
const BAND = "11, 110, 79"; // the emerald the rest of the app is built from

// Badge fill. rgba so it composites on whatever surface the badge sits on,
// with a stronger ramp in the dark theme where the same alpha barely moves
// off the background.
export function getExperienceTint(key, theme) {
  const dark = theme?.scheme === "dark";
  const steps = dark
    ? { none: 0.16, junior: 0.28, senior: 0.42 }
    : { none: 0.09, junior: 0.18, senior: 0.3 };
  if (steps[key]) return `rgba(${BAND}, ${steps[key]})`;
  // No requirement stated is not the same as an undemanding one, so an
  // unknown band gets no badge fill rather than the lightest step.
  return theme?.surfaceAlt ?? "transparent";
}

// Badge ink: dot, border and label. Solid, and legible at 10.5px on the
// matching fill in both themes — the light ramp deepens toward the app
// emerald, the dark ramp brightens away from it, so in both cases "asks for
// more" reads as "stands out more".
export function getExperienceAccent(key, theme) {
  const dark = theme?.scheme === "dark";
  const inks = dark
    ? { none: "#4E9E80", junior: "#68C29D", senior: "#8FE2BC" }
    : { none: "#4C9E80", junior: "#1E8560", senior: "#0B6E4F" };
  return inks[key] ?? theme?.textMuted ?? "#6B7280";
}
