// Where an application sits in the employer's pipeline.
//
// firestore.rules already allowed the employer to write this field, and
// applications are already created as 'new' — the screen simply never read
// or set it, so every application looked identical forever and an employer
// working through a list had no way to remember where they'd got to.
//
// Deliberately four states, not a free-text note: the point is a decision
// the applicant can be told about. 'reviewed' is the only internal one —
// 'shortlisted' and 'declined' are outcomes, and a candidate left guessing
// after applying is the same silent-decision problem the verification flow
// had.
export const applicationStatuses = [
  { key: 'new', icon: 'ellipse-outline', labelEn: 'New', labelFr: 'Nouvelle' },
  { key: 'reviewed', icon: 'eye-outline', labelEn: 'Reviewed', labelFr: 'Examinée' },
  { key: 'shortlisted', icon: 'star-outline', labelEn: 'Shortlisted', labelFr: 'Présélectionnée' },
  { key: 'declined', icon: 'close-circle-outline', labelEn: 'Declined', labelFr: 'Refusée' },
];

export function getApplicationStatus(key) {
  return applicationStatuses.find((item) => item.key === key) ?? applicationStatuses[0];
}

export function getApplicationStatusLabel(key, language) {
  const status = getApplicationStatus(key);
  return language === 'en' ? status.labelEn : status.labelFr;
}

// Theme tokens rather than fixed hexes, so the pipeline reads correctly in
// dark mode instead of three pale smudges on a dark card.
export function getApplicationStatusColor(key, theme) {
  if (key === 'shortlisted') return theme.primary;
  if (key === 'declined') return theme.error;
  if (key === 'reviewed') return theme.accentDark;
  return theme.textMuted;
}

export function getApplicationStatusTint(key, theme) {
  if (key === 'shortlisted') return theme.primaryLight;
  if (key === 'declined') return theme.errorLight;
  if (key === 'reviewed') return theme.accentLight;
  return theme.surfaceAlt;
}
