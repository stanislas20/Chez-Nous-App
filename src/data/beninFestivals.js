import { compareNames } from "../utils/collate";
import festivalPhotos from "./festivalPhotos.json";

// The country's own calendar: the festivals that come round every year.
//
// The Events screen is deliberately empty until somebody posts something —
// see the note at the top of events.js, and the empty state that says so.
// That rule is right for a concert at a maquis and wrong for the Vodun
// Days: nobody is going to "post" a national holiday, and a visitor asking
// what is on in January should not be told nothing is.
//
// So this is a second tier, the same shape as the OpenStreetMap directory
// on the hotels screen: app-supplied, sourced, and kept visibly apart from
// what sellers put up. Every entry names where it was read.
//
// WHAT IS NOT HERE. Exact dates for the years to come. These move: Vodun
// Days grew from the 10 January holiday into three days, Nonvitcha follows
// Pentecost, and the Gaani follows the Muslim calendar, so it slides
// through the seasons. Each entry states its recurrence in words and
// carries `confirmedOn`, the day the source was read — the same rule
// scripts/seedHotels.js applies to a tariff. Where a specific edition was
// confirmed it is given as `lastConfirmedEdition` and labelled as the
// edition that was announced, not as a promise about the next one.
//
// A price is never given. Nothing publishes one reliably and a festival
// that was free last year is not free by law.

export const festivalSources = {
  vodunDays: "https://vodundays.bj/",
  weloveEya: "https://weloveyafestival.com/",
  visitBenin: "https://visitbeninrepublic.com/festivals-events/",
};

export const beninFestivals = [
  {
    key: "vodun-days",
    name: "Vodun Days",
    city: "Ouidah",
    kind: "culture",
    // 10 January is the national Vodun holiday; the festival built around
    // it now runs three days.
    recurrenceFr: "Début janvier, autour du 10 — fête nationale du Vodun",
    recurrenceEn: "Early January, around the 10th — the national Vodun holiday",
    lastConfirmedEdition: "8–10 janvier 2026",
    whatFr:
      "Places et couvents de la vieille ville, village d'artisans, et des concerts le soir sur la plage.",
    whatEn:
      "The old town's squares and convents, a craft village, and concerts on the beach at night.",
    website: "https://vodundays.bj/",
    source: "https://vodundays.bj/",
    confirmedOn: "2026-09-04",
  },
  {
    key: "welove-eya",
    name: "WeLove EYA",
    city: "Cotonou",
    venue: "Place de l'Amazone",
    kind: "concert",
    recurrenceFr: "Fin décembre, entre Noël et le Nouvel An",
    recurrenceEn: "Late December, between Christmas and New Year",
    lastConfirmedEdition: "27–28 décembre 2025",
    whatFr:
      "Le grand rendez-vous afrobeat du pays, sur la Place de l'Amazone.",
    whatEn: "The country's big afrobeat weekend, on the Place de l'Amazone.",
    website: "https://weloveyafestival.com/",
    source: "https://weloveyafestival.com/",
    confirmedOn: "2026-09-04",
  },
  {
    key: "gaani",
    name: "Gaani",
    city: "Nikki",
    kind: "culture",
    // Follows the Muslim calendar, so it moves through the year.
    recurrenceFr:
      "Fixée sur le calendrier musulman, elle se déplace d'année en année",
    recurrenceEn: "Set by the Muslim calendar, so it moves from year to year",
    lastConfirmedEdition: null,
    whatFr:
      "La grande fête bariba : cavaliers en parade, tambours et cour royale de Nikki.",
    whatEn:
      "The Bariba festival: mounted parades, drums and the royal court of Nikki.",
    website: null,
    source: "https://visitbeninrepublic.com/festivals-events/",
    confirmedOn: "2026-09-04",
  },
  {
    key: "nonvitcha",
    name: "Nonvitcha",
    city: "Grand-Popo",
    kind: "community",
    recurrenceFr: "Week-end de la Pentecôte",
    recurrenceEn: "Whitsun weekend",
    lastConfirmedEdition: null,
    whatFr:
      "Le rassemblement annuel des Xwla et Xwla, au bord de la lagune : discours, sport, danses.",
    whatEn:
      "The yearly gathering of the Xwla and Xwela by the lagoon: speeches, sport, dancing.",
    website: null,
    source: "https://visitbeninrepublic.com/festivals-events/",
    confirmedOn: "2026-09-04",
  },
  {
    key: "igname",
    name: "Fête de l'igname",
    city: "Savalou",
    kind: "culture",
    recurrenceFr: "Mi-août, à la première récolte",
    recurrenceEn: "Mid-August, at the first harvest",
    lastConfirmedEdition: null,
    whatFr:
      "L'igname nouvelle offerte avant d'être mangée : cortèges, tam-tams et cuisine mahi.",
    whatEn:
      "The new yam offered before it is eaten: processions, drums and Mahi cooking.",
    website: null,
    source: "https://visitbeninrepublic.com/festivals-events/",
    confirmedOn: "2026-09-04",
  },
];

// The month a festival is usually in, for ordering. Not a date, and never
// shown as one — the words in recurrenceFr are what the reader sees.
const USUAL_MONTH = {
  "vodun-days": 1,
  "welove-eya": 12,
  gaani: 12,
  nonvitcha: 6,
  igname: 8,
};

// Ordered from the month it is now, so the next one to come is first.
export function festivalsFromNow(monthNow) {
  const month = monthNow ?? new Date().getMonth() + 1;
  const distance = (key) => {
    const usual = USUAL_MONTH[key] ?? 12;
    return (usual - month + 12) % 12;
  };
  return [...beninFestivals].sort(
    (a, b) => distance(a.key) - distance(b.key) || compareNames(a.name, b.name),
  );
}

// A photograph OF the festival, never its poster.
//
// The obvious banner is the official artwork and it is somebody's
// copyright; re-hosting it would be republishing work this app has no
// licence to. These are Commons photographs under CC BY-SA — free to
// show, photographer credited on the card. Four of the five have one; the
// yam festival keeps its gradient rather than borrowing a picture of some
// other harvest.
export function festivalPhoto(festival) {
  return festivalPhotos[festival.key] ?? null;
}

export function festivalRecurrence(festival, language) {
  return language === "en" ? festival.recurrenceEn : festival.recurrenceFr;
}

export function festivalWhat(festival, language) {
  return language === "en" ? festival.whatEn : festival.whatFr;
}
