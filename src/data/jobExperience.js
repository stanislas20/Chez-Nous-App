// How much experience a job asks for, as three bands rather than a free
// number: a poster picks reliably between "none / 1–3 / over 3", whereas an
// open years field invites "2-3", "24 months" and "négociable", none of
// which can be coloured or filtered.
//
// The bands exist to be seen at a glance on the home feed — green means a
// beginner can apply, amber means some track record, red means seasoned —
// which is why they carry their own labels here rather than i18n keys, the
// same way companySectors.js does.
export const experienceLevels = [
  { key: 'none', labelEn: 'No experience', labelFr: 'Sans expérience' },
  { key: 'junior', labelEn: '1 to 3 years', labelFr: '1 à 3 ans' },
  { key: 'senior', labelEn: 'Over 3 years', labelFr: 'Plus de 3 ans' },
];

// Jobs posted before this field existed only ever recorded a `noExp`
// boolean, so a legacy `true` still resolves to the green band. A legacy
// `false` resolves to null, NOT to a band: it recorded "not beginner-
// friendly" and nothing more, and inventing "over 3 years" from it would
// paint old listings red on a requirement nobody ever stated.
export function getExperienceLevel(job) {
  if (!job) return null;
  if (job.experienceLevel) return job.experienceLevel;
  return job.noExp ? 'none' : null;
}

export function getExperienceLabel(key, language) {
  const level = experienceLevels.find((item) => item.key === key);
  if (!level) return null;
  return language === 'en' ? level.labelEn : level.labelFr;
}

// Reuses the theme's own semantic tints instead of hardcoded pastels, so
// the bands invert correctly in dark mode — where "light green" has to
// become a deep green that a white title still reads against. An unknown
// band falls back to the normal card surface: no requirement stated is not
// the same as a demanding one.
export function getExperienceTint(key, theme) {
  if (key === 'none') return theme.primaryLight;
  if (key === 'junior') return theme.accentLight;
  if (key === 'senior') return theme.errorLight;
  return theme.surface;
}

export function getExperienceAccent(key, theme) {
  if (key === 'none') return theme.primaryDark;
  if (key === 'junior') return theme.accentDark;
  if (key === 'senior') return theme.error;
  return theme.border;
}
