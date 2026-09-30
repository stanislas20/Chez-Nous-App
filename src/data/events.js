// What an event is, as the person running it describes it.
//
// Two things on this screen are not decoration, and both come from how
// going out actually works here:
//
//   the price is two prices — almost every door charges more than the
//   advance ticket, and somebody deciding on Thursday whether to pay now
//   or at the gate needs both numbers side by side, not an average;
//
//   the hour is two hours — the time on the flyer is when the doors open,
//   not when anything starts. A concert announced for 20h begins at 21h30
//   and everyone knows it except the visitor. Both are shown, and the
//   second one only if the organiser gave it.
//
// Nothing here is invented. A field left blank is not displayed, and no
// event exists in this app until somebody posts it — see EventsScreen for
// why this vertical ships no sample data.

// Deliberately broad. Somebody organising a christening, a conference or a
// vide-grenier should find their thing here rather than give up and file it
// under Autre, which is how a listing stops being findable.
export const eventKinds = [
  { key: "concert", icon: "musical-notes-outline", labelEn: "Concert", labelFr: "Concert" },
  { key: "party", icon: "sparkles-outline", labelEn: "Party", labelFr: "Soirée" },
  { key: "culture", icon: "color-palette-outline", labelEn: "Culture", labelFr: "Culture" },
  { key: "cinema", icon: "film-outline", labelEn: "Cinema", labelFr: "Cinéma" },
  { key: "sport", icon: "football-outline", labelEn: "Sport", labelFr: "Sport" },
  { key: "ceremony", icon: "heart-outline", labelEn: "Ceremony", labelFr: "Cérémonie" },
  { key: "conference", icon: "easel-outline", labelEn: "Talks & training", labelFr: "Conférences & formations" },
  { key: "market", icon: "storefront-outline", labelEn: "Markets & fairs", labelFr: "Marchés & foires" },
  { key: "worship", icon: "book-outline", labelEn: "Worship", labelFr: "Culte" },
  { key: "community", icon: "people-outline", labelEn: "Community", labelFr: "Communauté" },
  { key: "other", icon: "ellipsis-horizontal-circle-outline", labelEn: "Other", labelFr: "Autre" },
];

// The card's ground when an event has no photograph. Keyed to the kind so a
// wall of unillustrated events still reads as a list of different things.
export const eventKindTint = {
  concert: "#6D2C55",
  party: "#4A2E7A",
  culture: "#A8701C",
  cinema: "#2F4A6E",
  sport: "#1E6B4F",
  ceremony: "#8A3A5B",
  conference: "#345A7A",
  market: "#8A5A1C",
  worship: "#4A5A7A",
  community: "#1A7A6B",
  other: "#5B5B6E",
};

export const EVENT_ACCENT = "#6D2C55";

export function getEventKindLabel(key, language) {
  const kind = eventKinds.find((item) => item.key === key);
  if (!kind) return null;
  return language === "en" ? kind.labelEn : kind.labelFr;
}

export function getEventKindIcon(key) {
  return eventKinds.find((item) => item.key === key)?.icon ?? "ticket-outline";
}

export function getEventKindTint(key) {
  return eventKindTint[key] ?? eventKindTint.other;
}

// How somebody pays to get in. Declared, because "Mobile Money" and "cash at
// the gate only" are the difference between turning up and turning back.
export const eventPayModes = [
  { key: "momo", labelEn: "Mobile Money", labelFr: "Mobile Money" },
  { key: "cash", labelEn: "Cash at the gate", labelFr: "Espèces sur place" },
  { key: "both", labelEn: "Mobile Money or cash", labelFr: "Mobile Money ou espèces" },
  { key: "free", labelEn: "Nothing to pay", labelFr: "Rien à payer" },
];

export function getEventPayLabel(key, language) {
  const mode = eventPayModes.find((item) => item.key === key);
  if (!mode) return null;
  return language === "en" ? mode.labelEn : mode.labelFr;
}

// The three windows the browse screen offers.
//
// "Tonight" is not "today": an event that started at 15h is not something
// you can still decide to attend at 21h, so tonight means from now until
// the small hours. The weekend is Saturday and Sunday whatever day you ask.
export const eventWindows = [
  { key: "tonight", labelEn: "Tonight", labelFr: "Ce soir" },
  { key: "weekend", labelEn: "This weekend", labelFr: "Ce week-end" },
  { key: "week", labelEn: "The week", labelFr: "La semaine" },
  // Everything further out than a week.
  //
  // Without this the three windows above were not a filter, they were a
  // cliff: an event more than seven days away fell into no window at all,
  // and useEvents drops anything with no window. So a concert announced a
  // month ahead — which is when concerts are announced — was accepted,
  // approved, and then displayed nowhere, under any tab. The organiser had
  // no way to find that out and no tab they could have pressed.
  { key: "later", labelEn: "Later", labelFr: "Plus tard" },
];

export function getEventWindowLabel(key, language) {
  const window = eventWindows.find((item) => item.key === key);
  if (!window) return null;
  return language === "en" ? window.labelEn : window.labelFr;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Midnight this morning, as a timestamp.
//
// The one place the day boundary is decided, so the Firestore query and
// eventWindowsFor cannot disagree about what "today" means. Comparing raw
// timestamps instead — eventDateMs >= Date.now() — would drop a concert
// that starts at eight the moment the clock passes eight, which is exactly
// when somebody is looking for it.
export function startOfDayMs(now = Date.now()) {
  return startOfDay(new Date(now)).getTime();
}

// Which windows an event falls into, given when you are asking.
//
// An event can be in several at once — tonight's concert is also part of
// this week — which is why this returns a list rather than picking one.
export function eventWindowsFor(startsAtMs, now = Date.now()) {
  if (!Number.isFinite(startsAtMs)) return [];

  const nowDate = new Date(now);
  const eventDate = new Date(startsAtMs);
  const today = startOfDay(nowDate);
  const eventDay = startOfDay(eventDate);
  const daysAhead = Math.round((eventDay - today) / DAY_MS);

  if (daysAhead < 0) return [];
  // A week out, inclusive of today. Beyond that it is not "the week" — but
  // it is still something you can go to, so it goes to its own window
  // rather than off the end of the list.
  if (daysAhead > 6) return ["later"];

  const windows = ["week"];

  // Saturday is 6, Sunday is 0.
  const eventWeekday = eventDate.getDay();
  if (eventWeekday === 6 || eventWeekday === 0) windows.push("weekend");

  // Still ahead of you today, or in the small hours of tomorrow.
  const withinTonight =
    startsAtMs >= now && startsAtMs <= now + 10 * 60 * 60 * 1000;
  if (daysAhead === 0 && withinTonight) windows.push("tonight");

  return windows;
}

// Free means free at both prices. An event that is free in advance and
// charges at the gate is not a free event, and saying so would cost
// somebody the entry fee they did not bring.
export function isEventFree(advance, gate) {
  return Number(advance) === 0 && Number(gate) === 0;
}

// Everything a card needs to state the price honestly, in one place.
//
// Returns nulls rather than invented text when the organiser gave no price:
// an event with no declared price is one you have to ask about, and that is
// what the screen then says.
export function eventPricing(listing) {
  const advance = Number.isFinite(listing?.eventPriceAdvance)
    ? listing.eventPriceAdvance
    : null;
  const gate = Number.isFinite(listing?.eventPriceGate)
    ? listing.eventPriceGate
    : null;

  if (advance == null && gate == null) {
    return { known: false, free: false, advance: null, gate: null, dearerAtGate: false };
  }

  const free = isEventFree(advance ?? 0, gate ?? 0);
  return {
    known: true,
    free,
    advance,
    gate,
    // The whole reason two prices are carried.
    dearerAtGate: advance != null && gate != null && gate > advance,
  };
}

// A typed time, printed the way a time is written here.
//
// The field asks for 20h00 and accepts 20, 20h, 20:30 — because people type
// all of those and refusing them would be pedantry. What it must not do is
// print them back raw: a card reading "À 20" is the app repeating a
// shorthand instead of telling somebody an hour.
//
// Anything genuinely unparseable is returned untouched rather than blanked.
// If an organiser wrote "après la messe", that is more use on the card than
// nothing, and it is not this function's place to overrule it.
export function normaliseEventTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = /^(\d{1,2})\s*[h:]?\s*(\d{1,2})?$/.exec(text);
  if (!match) return text;

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return text;

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}h${pad(minutes)}`;
}

// Doors and start are different facts. Only claim a start time if one was
// given, and never repeat it when the organiser said they are the same.
export function eventHours(listing) {
  const doors = normaliseEventTime(listing?.eventDoorsAt);
  const starts = normaliseEventTime(listing?.eventStartsAt);
  return {
    doors,
    starts: starts && starts !== doors ? starts : null,
    hasAny: Boolean(doors || starts),
  };
}

// An events listing, by the only thing that makes it one: it was filed
// under the events category. Unlike the trades, there is no prose fallback
// here — a date is not something the app should infer from a description.
export function isEventListing(listing) {
  return listing?.categoryKey === "events";
}

// Reacting is public and counted; liking is private and yours.
//
// They are deliberately two different gestures. A like is closer to a
// bookmark — it says "I want to find this again" and nobody else sees it.
// A reaction is a signal to the room, and to the organiser, that something
// is worth turning up to. Collapsing them into one heart would lose
// whichever meaning the person actually intended.
export const eventReactions = [
  { key: "fire", glyph: "🔥", labelEn: "Hot", labelFr: "Ça chauffe" },
  { key: "love", glyph: "❤️", labelEn: "Love", labelFr: "J’adore" },
  { key: "party", glyph: "🎉", labelEn: "Celebrate", labelFr: "On y va" },
  { key: "clap", glyph: "👏", labelEn: "Bravo", labelFr: "Bravo" },
];

export function getEventReactionLabel(key, language) {
  const reaction = eventReactions.find((item) => item.key === key);
  if (!reaction) return null;
  return language === "en" ? reaction.labelEn : reaction.labelFr;
}

export function getEventReactionGlyph(key) {
  return eventReactions.find((item) => item.key === key)?.glyph ?? null;
}

// The date somebody typed, as an instant — or null if it was not a date.
//
// There is no date picker in this project, so the form asks for JJ/MM/AAAA
// and this is the only thing that decides whether what came back is real.
// It rejects the overflow JavaScript would otherwise wave through: `new
// Date(2026, 1, 31)` is the 3rd of March, so a christening entered as
// 31/02 would silently move itself and nobody would find out until the day.
export function parseEventDate(dateText, timeText) {
  const date = /^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/.exec(
    String(dateText ?? "").trim(),
  );
  if (!date) return null;

  const day = Number(date[1]);
  const month = Number(date[2]);
  const year = Number(date[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // "21h30", "21h", "21:30" — all three are how people write a time here.
  const time = /^(\d{1,2})\s*[h:]\s*(\d{2})?$/.exec(
    String(timeText ?? "").trim(),
  );
  const hours = time ? Number(time[1]) : 0;
  const minutes = time && time[2] ? Number(time[2]) : 0;
  if (hours > 23 || minutes > 59) return null;

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (parsed.getDate() !== day || parsed.getMonth() !== month - 1) return null;
  return parsed.getTime();
}

// What an events listing looks like when the category is switched away.
//
// Same reason the stay-car block has one: a listing edited from Événements
// to Électronique must not keep a door price and a start time that the new
// category has no field to show and no way to correct.
export const EVENT_CLEARED = {
  eventKind: null,
  eventDate: "",
  eventDateMs: null,
  eventDoorsAt: "",
  eventStartsAt: "",
  eventVenue: "",
  eventQuartier: "",
  eventPriceAdvance: null,
  eventPriceGate: null,
  eventPayMode: null,
  eventOrganiser: "",
  eventCapacityNote: "",
};

// What each window actually covers, said out loud.
//
// "Ce soir" and "Ce week-end" are not self-explanatory the way they look:
// tonight means today, whatever today is, and the weekend is two named
// days. The doc's tab carries both lines for that reason — the second one
// is the answer to "which days is that, then".
const WEEKDAY_NAMES = {
  fr: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

export function eventWindowSubLabel(key, language, now = Date.now()) {
  const lang = language === "en" ? "en" : "fr";
  if (key === "tonight") {
    const today = WEEKDAY_NAMES[lang][new Date(now).getDay()];
    return lang === "en"
      ? today
      : today.charAt(0).toUpperCase() + today.slice(1);
  }
  if (key === "weekend") return lang === "en" ? "Sat and Sun" : "Sam. et dim.";
  if (key === "later") return lang === "en" ? "Beyond" : "Au-delà";
  return lang === "en" ? "7 days" : "7 jours";
}
