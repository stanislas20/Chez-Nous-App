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
export function getDutyLabel(listing, language, t) {
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
  // dutyUntil marks the end of the whole weekly rotation (always 23:59:59
  // on its last day, per the ONPB sync), not a same-day closing time — a
  // "de garde" pharmacy stays open overnight every night through that date.
  // Showing the clock time here read as "closes tonight at 23:59", which
  // is exactly backwards, so this shows the date instead.
  return { text: t('pharmacyOpenUntil', { date: dutyDateFormatter.format(dutyUntilDate) }), isStale: false };
}
