// The reminder behind the switch on Papiers & contrôle.
//
// The screen used to carry a note saying, in as many words, that a switch
// promising a reminder would be a lie — because the app had no way to reach
// somebody whose phone was in a pocket. That was true when the only thing
// counting the days was the screen itself. It stops being true the moment
// something on a server holds the date, which is exactly what this function
// is, and exactly what the reader is told when they turn it on.
//
// Two things follow from that, and both are load-bearing:
//
//   - The dates only arrive here because somebody switched them on, and the
//     switch says so at the point of choice rather than in a policy nobody
//     opens. Switching it off deletes the copy; it does not merely stop the
//     sending.
//   - We know a date, not a document. Chez-Nous cannot see anyone's
//     insurance certificate, so every message is phrased as "the date you
//     recorded", never as a statement about their papers. If they renewed
//     last week and did not update the screen, the reminder is wrong, and
//     the wording has to leave room for that.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

// `paperDates` holds calendar dates — "2026-09-01" — and not instants, which
// is the whole reason this file needs no timezone library.
//
// The screen stores an ISO instant locally, because that is what a Date
// gives you, but an instant only means "midnight somewhere" and the server
// would have to guess where. Guessing costs a day: a phone set to another
// timezone, or a reader who happens to be abroad, and "expires tomorrow"
// arrives on the wrong morning. So the client converts to the plain date the
// reader actually typed before sending it, and nothing here has to know
// where the phone was.
//
// Bénin itself is UTC+1 all year with no daylight saving, so today's date in
// Bénin — the one thing this function does need — is exact arithmetic.
const BENIN_OFFSET_MS = 3600000;

// The four points at which telling somebody is still useful.
//
// Thirty days is enough to arrange an insurance renewal or book a test
// without rearranging a week. Seven is the reminder that catches the person
// who read the first one and meant to deal with it. One is the last moment
// it can be acted on in advance. Zero is the day itself — the reminder
// system would otherwise go quiet on exactly the morning the document stops
// covering them, which is the one day it must not.
//
// Nothing is sent after that. A reminder about a date that has passed is a
// reproach, not a reminder, and repeating it is how people learn to swipe
// the whole app away.
const LEAD_DAYS = [30, 7, 1, 0];

// The renewable papers, mirrored from src/data/vehiclePapers.js.
//
// A duplicated table is a duplicated table, and this one is guarded:
// scripts/check-paper-status.js asserts these keys are exactly the renewable
// kinds the app tracks, so adding a paper to the screen without adding it
// here fails a test rather than silently never reminding anybody about it.
const PAPER_LABELS = {
  insurance: { fr: "Votre assurance", en: "Your insurance" },
  technical: { fr: "Votre visite technique", en: "Your roadworthiness test" },
  licence: { fr: "Votre permis de conduire", en: "Your driving licence" },
  vignette: { fr: "Votre vignette", en: "Your road tax" },
};

// Today's date in Bénin, as UTC midnight so it can be subtracted.
function beninToday(now) {
  const shifted = new Date(now.getTime() + BENIN_OFFSET_MS);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// A calendar date, as UTC midnight. Anything that is not a plain date is
// refused rather than coerced — Date's parser will happily accept a great
// deal of nonsense and return a real-looking instant for it.
function parseDay(value) {
  const match = typeof value === "string" && value.match(DATE_ONLY);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const stamp = Date.UTC(year, month - 1, day);
  // Rejects 31 February, which passes the range check above.
  if (new Date(stamp).getUTCMonth() !== month - 1) return null;
  return stamp;
}

function daysUntil(value, now) {
  const target = parseDay(value);
  if (target === null) return null;
  return Math.round((target - beninToday(now)) / 86400000);
}

// dd/mm/yyyy — how a date is written on every form these papers come from.
function formatDate(value) {
  const match = typeof value === "string" && value.match(DATE_ONLY);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function buildMessage(kind, days, isoDate, language) {
  const label = PAPER_LABELS[kind];
  if (!label) return null;
  const name = language === "en" ? label.en : label.fr;
  const date = formatDate(isoDate);

  if (language === "en") {
    return {
      title:
        days === 0
          ? `${name} expires today`
          : days === 1
            ? `${name} expires tomorrow`
            : `${name} expires in ${days} days`,
      body: `You recorded ${date} in Papers & test. If you have already renewed it, open the screen and correct the date.`,
    };
  }
  return {
    title:
      days === 0
        ? `${name} expire aujourd’hui`
        : days === 1
          ? `${name} expire demain`
          : `${name} expire dans ${days} jours`,
    body: `Vous avez enregistré le ${date} dans Papiers & contrôle. Si c’est déjà renouvelé, ouvrez l’écran et corrigez la date.`,
  };
}

// One send per (paper, lead) per expiry date, remembered on the seller's own
// document. Re-running the function on the same day sends nothing twice, and
// correcting a date to a new one re-arms every lead that has not passed —
// which is the behaviour somebody expects after renewing.
function sentKey(kind, days) {
  return `${kind}_${days}`;
}

// The push itself, kept out of the loop so a test can look at it.
//
// A reminder somebody asked for, about a date that costs money to miss, is
// worth a sound and a buzz in a pocket. Neither is free:
//
// On Android 8 and later the CHANNEL decides both, not this payload. Asking
// for a sound in a message that lands in a channel created without one
// changes nothing — which is why these reminders used to arrive silently.
// PAPERS_CHANNEL is the id the app creates at HIGH importance with a double
// vibration, and naming it here is what puts the message in it. Naming a
// channel the handset does not have costs the sound, not the notification,
// so an install older than the channel is still told.
//
// iOS has no channels: the sound is asked for per message, and the handset's
// own ring/silent switch has the last word over both platforms.
const PAPERS_CHANNEL = "papers";

function buildPush(token, message, kind) {
  return {
    token,
    notification: message,
    data: { type: "paperExpiring", paperKind: kind },
    android: {
      priority: "high",
      notification: {
        channelId: PAPERS_CHANNEL,
        sound: "default",
        defaultVibrateTimings: true,
      },
    },
    apns: {
      payload: { aps: { sound: "default" } },
    },
  };
}

async function sendReminders(now) {
  const db = admin.firestore();
  const snapshot = await db
    .collection("sellers")
    .where("paperReminders", "==", true)
    .get();

  let sent = 0;
  let watched = 0;
  let unreachable = 0;

  for (const docSnap of snapshot.docs) {
    const seller = docSnap.data();
    const dates = seller.paperDates;
    const token = seller.pushToken;
    // Reminders on, dates stored, and nowhere to send them. The client
    // refuses to reach this state now, but an account can still arrive here
    // by revoking notification permission afterwards — and the failure is
    // silent from the reader's side, so it must not be silent from ours.
    if (dates && !token) {
      unreachable += 1;
      logger.warn("paper reminders: no push token", { uid: docSnap.id });
    }
    if (!dates || !token) continue;

    const language = seller.paperLanguage === "en" ? "en" : "fr";
    const already = seller.paperRemindersSent || {};
    const updates = {};

    for (const [kind, day] of Object.entries(dates)) {
      if (!day || !PAPER_LABELS[kind]) continue;
      watched += 1;
      const days = daysUntil(day, now);
      if (days === null || !LEAD_DAYS.includes(days)) continue;

      const key = sentKey(kind, days);
      if (already[key] === day) continue;

      const message = buildMessage(kind, days, day, language);
      if (!message) continue;

      try {
        await admin.messaging().send(buildPush(token, message, kind));
        updates[`paperRemindersSent.${key}`] = day;
        sent += 1;
      } catch (error) {
        // A token that is no longer registered is dead for every future
        // send, not just this one, so it goes rather than being retried
        // daily forever. Same handling as sendMessagePush.
        if (
          error.code === "messaging/invalid-registration-token" ||
          error.code === "messaging/registration-token-not-registered"
        ) {
          await docSnap.ref.update({
            pushToken: admin.firestore.FieldValue.delete(),
          });
          break;
        }
        logger.error("paper reminder failed", {
          uid: docSnap.id,
          kind,
          error: error.message,
        });
      }
    }

    if (Object.keys(updates).length) {
      await docSnap.ref.update(updates);
    }
  }

  logger.info("paper reminders", {
    accounts: snapshot.size,
    watched,
    sent,
    unreachable,
  });
  return { accounts: snapshot.size, watched, sent, unreachable };
}

// Eight in the morning, local. Late enough not to wake anybody, early enough
// that "expires tomorrow" still leaves a working day to do something about
// it — which is the entire point of the one-day lead.
exports.sendPaperReminders = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "Africa/Porto-Novo",
    timeoutSeconds: 300,
  },
  async () => {
    await sendReminders(new Date());
  },
);

// Exported for scripts/check-paper-status.js, which runs the arithmetic at
// its boundaries without needing Firebase — and `sendReminders` for running
// the whole thing by hand against a simulated clock, which is the only way
// to watch a lead day arrive without waiting a month for it.
exports.internals = {
  sendReminders,
  LEAD_DAYS,
  PAPER_LABELS,
  daysUntil,
  formatDate,
  buildMessage,
  buildPush,
  PAPERS_CHANNEL,
  sentKey,
  parseDay,
};
