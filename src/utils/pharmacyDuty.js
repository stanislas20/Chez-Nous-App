const dutyDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Africa/Porto-Novo',
});

// What "de garde" means, since the label has to say it in five words: ONPB
// schedules a group of pharmacies to stay open THROUGH THE NIGHT for a dated
// window — "GROUPE A, DU 03 AOUT AU 09 AOUT 2026". It is the night that is
// being guaranteed. In the daytime every pharmacy is open, so a label that
// claims "jour et nuit" is both wider than the roster promises and useless
// at the hour somebody actually needs it.
//
// isPermanentDuty is not a designation ONPB issues — its rosters have four
// columns, number/name/quartier/phone, and no permanence mark anywhere. The
// 24 records that once carried the flag were an import's invention and have
// been unflagged. The branch stays for a pharmacy that declares its own 24/7
// opening, which is the only way that fact could ever be known; dutyNote*,
// when present, is verbatim source text and outranks the generic label.
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
  // dutyUntil marks the end of the whole rotation (always 23:59:59 on its
  // last day, per the ONPB sync), not a same-day closing time — the pharmacy
  // takes the night every night through that date. Showing the clock time
  // here read as "closes tonight at 23:59", which is exactly backwards, so
  // this shows the date instead.
  return { text: t('pharmacyOpenUntil', { date: dutyDateFormatter.format(dutyUntilDate) }), isStale: false };
}
