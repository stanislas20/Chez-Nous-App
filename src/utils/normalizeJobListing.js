const JOB_TYPE_LABEL_KEYS = {
  fullTime: "jobTypeFullTime",
  partTime: "jobTypePartTime",
  contract: "jobTypeContract",
  gig: "jobTypeGig",
};

function formatPosted(daysAgo, language) {
  if (daysAgo < 1) {
    const hours = Math.max(1, Math.round(daysAgo * 24));
    return language === "en" ? `${hours}h ago` : `Il y a ${hours}h`;
  }
  if (daysAgo < 2) {
    return language === "en" ? "Yesterday" : "Hier";
  }
  if (daysAgo < 7) {
    const days = Math.round(daysAgo);
    return language === "en" ? `${days} days ago` : `Il y a ${days}j`;
  }
  const weeks = Math.round(daysAgo / 7);
  return language === "en"
    ? `${weeks} week${weeks > 1 ? "s" : ""} ago`
    : `Il y a ${weeks} sem.`;
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
// Amount plus period, or the raw text when there is no period to add.
//
// A bare "50000" on a job card is indistinguishable from a sale price, which
// is exactly what a reader took it for. The period is stored separately, so
// it can be attached at display time rather than depending on the employer
// having typed it.
const SALARY_PERIOD_KEYS = {
  hour: "salaryPerHour",
  day: "salaryPerDay",
  week: "salaryPerWeek",
  month: "salaryPerMonth",
};

// The same fr-FR grouping listingPrice uses, so 50000 reads as 50 000 on a
// job card exactly as it does on a listing card.
const salaryFormatter = new Intl.NumberFormat("fr-FR");

function formatSalary(doc, t) {
  const raw = typeof doc?.salary === "string" ? doc.salary.trim() : doc?.salary;
  if (!raw) return null;

  // Only a bare number gets currency and grouping added. An employer who
  // typed "80 000 - 120 000 FCFA" already said it their way, and appending
  // another FCFA to that would be worse than leaving it alone.
  const digitsOnly = /^[\d\s.,]+$/.test(String(raw));
  const value = Number(String(raw).replace(/[^\d]/g, ""));
  const amount =
    digitsOnly && Number.isFinite(value) && value > 0
      ? `${salaryFormatter.format(value)} FCFA`
      : String(raw);

  // Monthly unless the employer said otherwise.
  //
  // A bare number with no period was the original complaint: on a card it is
  // indistinguishable from a sale price. Postings made before salaryPeriod
  // existed have no answer stored, so the choice is between saying nothing
  // and assuming the norm — and for salaried work in Bénin the norm is
  // monthly, which is also what the form now pre-selects.
  //
  // The assumption is deliberately narrow. It applies ONLY where the salary
  // is a bare number, because that is the only case with nothing to lose: an
  // employer who wrote "80 000 - 120 000 FCFA / mois" already said it, and
  // `amount` below is their text untouched, so no period is appended to it.
  const period = doc?.salaryPeriod ?? (digitsOnly ? "month" : null);
  const key = SALARY_PERIOD_KEYS[period];
  if (!key || typeof t !== "function") return amount;
  return t(key, { amount });
}

export function normalizeJobListing(doc, t, language) {
  const typeLabelKey = JOB_TYPE_LABEL_KEYS[doc.jobType] ?? null;
  const typeLabel = typeLabelKey ? t(typeLabelKey) : "";
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
    company: doc.company || "",
    // The employer's own picture, if they attached one. The posting form
    // already asks for it — "un logo d'entreprise ou une photo du lieu de
    // travail aide les candidats à faire confiance à l'annonce" — and until
    // now nothing rendered it, so every card drew the same initial and the
    // upload changed nothing a candidate could see.
    //
    // Cover image first, then the first attachment, then the account photo:
    // an employer who uploaded a logo means the logo, and one who uploaded
    // nothing still has a face on their account. `mediaUrl` and not `url` —
    // the media entries are { mediaType, mediaUrl, mediaPath }.
    logoUrl:
      doc.mediaUrl ?? doc.media?.[0]?.mediaUrl ?? doc.sellerPhotoUrl ?? null,
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
    // The amount with its period attached, composed here so every surface
    // that shows a salary shows the same thing.
    //
    // salaryPeriod did not exist before Phase G, and a job posted without it
    // keeps whatever text the employer typed — which for the bundled examples
    // is already "80 000 FCFA / mois". So the fallback is the raw string, and
    // nothing that predates the field changes appearance.
    salaryEn: formatSalary(doc, t),
    salaryFr: formatSalary(doc, t),
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
