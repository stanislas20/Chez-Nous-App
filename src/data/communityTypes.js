// What kind of community post this is.
//
// Community was the one category falling through to the generic
// item-for-sale form: it demanded a price above zero and a photo, and asked
// what condition it was in. A lost dog, a neighbourhood notice or a request
// for a plumber has no price, no condition, and often nothing to
// photograph — so the form was asking three questions that can't be
// answered honestly, and blocking on two of them.
//
// This replaces price/condition as the one thing a community post actually
// needs to declare, because it's what tells a reader how to respond: a
// found item wants contacting, an event wants attending, a request wants
// answering.
export const communityTypes = [
  { key: 'announcement', icon: 'megaphone-outline', color: '#12876A', labelEn: 'Announcement', labelFr: 'Annonce' },
  { key: 'lost', icon: 'help-buoy-outline', color: '#D6455A', labelEn: 'Lost', labelFr: 'Objet perdu' },
  { key: 'found', icon: 'search-outline', color: '#2F6BB5', labelEn: 'Found', labelFr: 'Objet trouvé' },
  { key: 'help', icon: 'hand-left-outline', color: '#EC8B2B', labelEn: 'Help needed', labelFr: 'Demande d’aide' },
  { key: 'event', icon: 'calendar-outline', color: '#A15AC4', labelEn: 'Event', labelFr: 'Événement' },
  { key: 'recommendation', icon: 'thumbs-up-outline', color: '#B98A2A', labelEn: 'Recommendation', labelFr: 'Recommandation' },
];

export function getCommunityType(key) {
  return communityTypes.find((item) => item.key === key) ?? null;
}

export function getCommunityTypeLabel(key, language) {
  const type = getCommunityType(key);
  if (!type) return null;
  return language === 'en' ? type.labelEn : type.labelFr;
}
