// Opening days and hours, declared by the owner posting the listing.
//
// This is the piece that was missing when the Restaurants directory was
// built: the mockup wanted "Ouvert jusqu'à 22h30" and an "Ouvert
// maintenant" filter, and inventing either would have meant the app telling
// someone a place is open when it is closed. Hours entered by the owner are
// first-party data — they can be wrong, but they're wrong in the way a shop
// sign is wrong, not in the way a fabricated record is.
//
// Monday-first, matching how the week is written in Bénin.
export const openingDays = [
  { key: 'mon', labelEn: 'Mon', labelFr: 'Lun' },
  { key: 'tue', labelEn: 'Tue', labelFr: 'Mar' },
  { key: 'wed', labelEn: 'Wed', labelFr: 'Mer' },
  { key: 'thu', labelEn: 'Thu', labelFr: 'Jeu' },
  { key: 'fri', labelEn: 'Fri', labelFr: 'Ven' },
  { key: 'sat', labelEn: 'Sat', labelFr: 'Sam' },
  { key: 'sun', labelEn: 'Sun', labelFr: 'Dim' },
];

export function getOpeningDayLabel(key, language) {
  const day = openingDays.find((item) => item.key === key);
  if (!day) return null;
  return language === 'en' ? day.labelEn : day.labelFr;
}

// Accepts 9:00, 09:00, 9h, 9h30 — people write times several ways and
// rejecting a form over a missing zero is a bad trade. Returns a normalised
// "HH:MM" so everything downstream compares like with like, or null when it
// genuinely can't be read as a time.
export function normaliseTime(value) {
  if (!value) return null;
  const match = String(value)
    .trim()
    .match(/^(\d{1,2})\s*[:hH.]?\s*(\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// A kitchen that closes after midnight is normal, so a closing time earlier
// than the opening time means "tomorrow", not an error.
export function isOpenNow(openDays, openTime, closeTime, now = new Date()) {
  if (!openDays?.length || !openTime || !closeTime) return null;
  const open = normaliseTime(openTime);
  const close = normaliseTime(closeTime);
  if (!open || !close) return null;

  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const openMin = toMinutes(open);
  const closeMin = toMinutes(close);

  if (closeMin > openMin) {
    return openDays.includes(dayKeys[now.getDay()]) && minutesNow >= openMin && minutesNow < closeMin;
  }
  // Spans midnight: open today after opening, or still open from yesterday.
  const yesterday = dayKeys[(now.getDay() + 6) % 7];
  if (openDays.includes(dayKeys[now.getDay()]) && minutesNow >= openMin) return true;
  return openDays.includes(yesterday) && minutesNow < closeMin;
}
