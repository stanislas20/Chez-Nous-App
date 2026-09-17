#!/usr/bin/env node
//
// An English moderator received: "Nouvelle annonce à valider — … attend votre
// validation." An entirely French notification, in an English app.
//
// The interesting part is that no translation was missing. The strings were
// composed by a Cloud Function, and the function had no way to know which
// language the reader uses — because the preference lived only in
// AsyncStorage on the handset and had never been written anywhere a server
// could read it. That absence is the defect; the French text was only its
// symptom.
//
// So the fix is a fact, not a string: sellers/{uid}.language, written by the
// client, read by the function. This file defends both halves, because
// either one alone silently does nothing — a language nobody writes, or a
// language nobody reads.
//
// Two client-side cases are defended alongside it, for the same underlying
// reason: copy that cannot follow the reader.
//
//   * the pharmacy duty label built its date on a formatter pinned to fr-FR,
//     so an English reader got "As of 6 septembre · call to confirm" — an
//     English sentence with a French month wedged into it, shown to somebody
//     deciding whether to drive across a city at night
//
//   * the notifications screen borrowed the MESSAGES sign-in prompt, so a
//     reader looking at an empty notification list was told to sign in to
//     see their messages: a different screen, one tab away, that they had
//     not asked about
//
// Run: node scripts/check-server-locale.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const AUTH = "src/auth/AuthContext.js";
const FUNCTIONS = "functions/index.js";
const DUTY = "src/utils/pharmacyDuty.js";
const NOTIFICATIONS = "src/screens/NotificationsScreen.js";
const TRANSLATIONS = "src/i18n/translations.js";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const rel of [AUTH, FUNCTIONS, DUTY, NOTIFICATIONS, TRANSLATIONS]) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel} is missing — this check reads it`);
  }
}
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

// ── 1. The client publishes the language ────────────────────────────────
const auth = stripComments(read(AUTH));

if (!/updateDoc\(doc\(firestore, "sellers", uid\), \{ language \}\)/.test(auth)) {
  failures.push(
    "the reader's language is never written to sellers/{uid} — every " +
      "server-composed notification then falls back to French regardless of " +
      "which language the app is in",
  );
}
// setDoc with merge would CREATE the document, which is how advertisers got
// phantom seller profiles once before. This file's neighbours already carry
// that scar.
if (/setDoc\(\s*doc\(firestore, "sellers", uid\)[\s\S]{0,80}language/.test(auth)) {
  failures.push(
    "the language is written with setDoc — a merge write creates the " +
      "document, giving every advertiser a phantom seller profile containing " +
      "nothing but a language",
  );
}
if (!/lastWrittenLanguage/.test(auth)) {
  failures.push(
    "nothing remembers the last language written, so the write repeats on " +
      "every render and every resume",
  );
}

// ── 2. The server reads it ──────────────────────────────────────────────
const functions = stripComments(read(FUNCTIONS));

if (!/function localeOf\(seller\)/.test(functions)) {
  failures.push(
    `${FUNCTIONS} has no localeOf() — nothing turns the stored language into ` +
      `a choice of copy`,
  );
}
if (!/seller\?\.language === "en"/.test(functions)) {
  failures.push(
    "localeOf does not consult the seller's stored language, so the field " +
      "the client now writes is read by nobody",
  );
}
if (!/MODERATION_PUSH_COPY/.test(functions)) {
  failures.push(
    "the moderation push copy table is gone — the strings are hard-coded " +
      "again, which is the defect",
  );
}
for (const language of ["fr", "en"]) {
  if (!new RegExp(`\\n  ${language}: \\{`).test(functions)) {
    failures.push(
      `MODERATION_PUSH_COPY has no "${language}" entry; a missing language ` +
        `falls through to undefined and the push throws instead of sending`,
    );
  }
}
// The French must still be there. "Localised" that quietly drops the
// majority language would be a worse regression than the one being fixed.
if (!/Nouvelle annonce à valider/.test(functions)) {
  failures.push(
    "the French moderation strings are gone — French is the fallback and the " +
      "majority language of this readership",
  );
}
if (!/tokens\.map\(\(\{ token, language \}\)/.test(functions)) {
  failures.push(
    "the moderation push is not composed per recipient — one language is " +
      "being chosen for everybody, which is what it did before",
  );
}

// ── 3. The pharmacy date follows the reader ─────────────────────────────
const duty = stripComments(read(DUTY));

if (/new Intl\.DateTimeFormat\('fr-FR'/.test(duty)) {
  failures.push(
    "the duty-date formatter is pinned to fr-FR again — that is exactly what " +
      "produced 'As of 6 septembre' on an English screen",
  );
}
if (!/language === 'en' \? 'en-GB' : 'fr-FR'/.test(duty)) {
  failures.push(
    "the duty-date locale is not derived from the language argument that " +
      "getDutyLabel already receives",
  );
}
if (!/timeZone: 'Africa\/Porto-Novo'/.test(duty)) {
  failures.push(
    "the duty formatter lost its Africa/Porto-Novo time zone — a duty window " +
      "is a Bénin night, and rendering it in the phone's own zone shows the " +
      "wrong DAY to the diaspora this app explicitly serves",
  );
}
if ([...duty.matchAll(/dutyDateFormatter\(language\)/g)].length < 2) {
  failures.push(
    "not every duty-date call passes the language through, so one of the two " +
      "labels is still formatted in the wrong one",
  );
}

// ── 4. The notifications screen speaks about notifications ──────────────
const notifications = stripComments(read(NOTIFICATIONS));

if (/t\("chatListSignInPrompt"\)/.test(notifications)) {
  failures.push(
    "the notifications screen is using the MESSAGES sign-in prompt again — " +
      "it tells the reader to sign in to see a different screen",
  );
}
if (!/t\("notificationsSignInPrompt"\)/.test(notifications)) {
  failures.push(
    "the notifications screen does not use notificationsSignInPrompt",
  );
}

const translations = read(TRANSLATIONS);
const count = [...translations.matchAll(/\bnotificationsSignInPrompt:/g)].length;
if (count < 2) {
  failures.push(
    `notificationsSignInPrompt is defined ${count} time(s); en and fr each ` +
      `need it`,
  );
}

if (failures.length === 0) {
  console.log(
    "clean: the server knows which language to write in, and the two screens " +
      "that spoke the wrong one no longer do",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
