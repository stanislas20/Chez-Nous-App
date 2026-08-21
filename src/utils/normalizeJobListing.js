const JOB_TYPE_LABEL_KEYS = {
  fullTime: 'jobTypeFullTime',
  partTime: 'jobTypePartTime',
  contract: 'jobTypeContract',
  gig: 'jobTypeGig',
};

function formatPosted(daysAgo, language) {
  if (daysAgo < 1) {
    const hours = Math.max(1, Math.round(daysAgo * 24));
    return language === 'en' ? `${hours}h ago` : `Il y a ${hours}h`;
  }
  if (daysAgo < 2) {
    return language === 'en' ? 'Yesterday' : 'Hier';
  }
  if (daysAgo < 7) {
    const days = Math.round(daysAgo);
    return language === 'en' ? `${days} days ago` : `Il y a ${days}j`;
  }
  const weeks = Math.round(daysAgo / 7);
  return language === 'en' ? `${weeks} week${weeks > 1 ? 's' : ''} ago` : `Il y a ${weeks} sem.`;
}

// Converts a raw Firestore job listing (categoryKey: 'jobs', written by
// CreateListingScreen) into the same shape mockJobs.js entries use, so
// ForYouScreen's job list and JobDetailScreen can treat real and sample
// postings identically. The responsibilities/requirements/benefits lists
// are now fields on the posting form, so they carry through when the
// employer filled them; JobDetailScreen still renders each section only
// when non-empty, so a posting without them simply shows fewer sections
// rather than empty headings.
//
// typeEn/typeFr end up holding the same resolved text (whatever the
// *current* UI language maps jobType to), not genuinely separate English
// and French strings the way mockJobs.js's static pairs are — this runs
// inside a useMemo that already depends on `language`, so it re-resolves
// correctly on every language switch; it just doesn't pre-compute the
// *other* language up front.
export function normalizeJobListing(doc, t, language) {
  const typeLabelKey = JOB_TYPE_LABEL_KEYS[doc.jobType] ?? null;
  const typeLabel = typeLabelKey ? t(typeLabelKey) : '';
  const postedDaysAgo = doc.createdAt?.toDate
    ? (Date.now() - doc.createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const posted = formatPosted(postedDaysAgo, language);

  return {
    id: doc.id,
    isReal: true,
    responsibilitiesEn: doc.responsibilitiesEn ?? [],
    responsibilitiesFr: doc.responsibilitiesFr ?? [],
    requirementsEn: doc.requirementsEn ?? [],
    requirementsFr: doc.requirementsFr ?? [],
    benefitsEn: doc.benefitsEn ?? [],
    benefitsFr: doc.benefitsFr ?? [],
    sellerId: doc.sellerId,
    titleEn: doc.titleEn,
    titleFr: doc.titleFr,
    company: doc.company || '',
    city: doc.city,
    category: doc.jobCategory,
    verified: Boolean(doc.verified),
    noExp: Boolean(doc.noExp),
    // Null for postings made before the field existed; getExperienceLevel
    // falls back to `noExp` for those rather than guessing a band.
    experienceLevel: doc.experienceLevel ?? null,
    // The raw key, alongside the display labels above: "Missions rapides"
    // needs to select gigs, and it can't do that from a translated string
    // that changes with the UI language.
    jobType: doc.jobType ?? null,
    salaryEn: doc.salary || null,
    salaryFr: doc.salary || null,
    descriptionEn: doc.descriptionEn,
    descriptionFr: doc.descriptionFr,
    typeEn: typeLabel,
    typeFr: typeLabel,
    postedDaysAgo,
    postedEn: posted,
    postedFr: posted,
    // Carried through so the poster can see them on their own posting
    // (JobDetailScreen) — not shown to anyone else.
    viewCount: doc.viewCount ?? 0,
    viewCountToday: doc.viewCountToday ?? 0,
    viewCountDate: doc.viewCountDate ?? null,
  };
}
