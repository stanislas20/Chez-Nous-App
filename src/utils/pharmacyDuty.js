export const dutyTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Porto-Novo',
});

const dutyDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Africa/Porto-Novo',
});

// Most permanent-duty pharmacies are genuinely open 24/7, but a few carry a
// real documented exception (e.g. specific hours, or overnight coverage
// handled by a neighboring pharmacy) — dutyNoteFr/dutyNoteEn, when present,
// is the verbatim source text and takes priority over the generic label.
//
// Returns { text, isStale }. `isStale` marks the case where ONPB hasn't
// published a newer weekly roster yet, so callers can de-emphasize the
// label (muted color) instead of showing it with the same urgency as a
// live, still-valid duty countdown.
export function getDutyLabel(listing, language, t, formatter = dutyTimeFormatter) {
  if (listing.isPermanentDuty) {
    const note = language === 'en' ? listing.dutyNoteEn : listing.dutyNoteFr;
    return { text: note || t('pharmacyAlwaysOpen'), isStale: false };
  }
  const dutyUntilDate = listing.dutyUntil?.toDate?.();
  if (!dutyUntilDate) return { text: '', isStale: false };
  // ONPB hasn't always published the next weekly roster by the time the
  // current one lapses — real overnight coverage still exists, so we keep
  // showing the last verified rotation rather than nothing, honestly
  // labeled as such instead of implying it's still guaranteed valid.
  if (dutyUntilDate.getTime() < Date.now()) {
    return {
      text: t('pharmacyLastKnownSchedule', { date: dutyDateFormatter.format(dutyUntilDate) }),
      isStale: true,
    };
  }
  return { text: t('pharmacyOpenUntil', { time: formatter.format(dutyUntilDate) }), isStale: false };
}
