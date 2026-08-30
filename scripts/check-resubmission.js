// A rejection has to be survivable.
//
// "Not approved" was a terminal state. The rules held the seller's status
// equal in both directions, so a seller could read the reason, fix exactly
// the thing they were told to fix, save it — and the listing stayed
// rejected, seen by nobody, forever. The only way back was to delete it and
// post it again, losing the document, its views and its history. Nothing
// said so. Meanwhile listingRejectedNoReason, on the seller's own screen,
// read "Edit it and it will be reviewed again": the app was promising the
// one thing the rules refused.
//
// Five things have to hold for the way back to exist, and each of them
// fails silently:
//
//   the rules have to permit rejected -> pending, and permit nothing else
//   in the bargain — the form can send whatever it likes, and a rule that
//   refuses it produces a save that appears to work;
//
//   the form has to resubmit on ANY save, not on a material change. That
//   distinction protects an approved listing from being pulled out of the
//   market over a typo, and applying it to a rejected one is not a
//   harmless extra: `phone` is not a material field, and "the number does
//   not answer" is one of the three faults moderation exists to catch;
//
//   the seller has to be told, on the list and again on the form, because
//   a door nobody knows about is not a door;
//
//   the moderator reading the resubmission has to see what was asked the
//   first time, or the second reading starts from nothing;
//
//   and the note that carries that reason has to be written only by a
//   rejection, or the line the moderator reads is a sentence nobody said.
//
// Run: node scripts/check-resubmission.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

const failures = [];

// 1. The rules open one door, in one direction.
{
  const rules = read("firestore.rules");
  const seller = rules.slice(
    rules.indexOf("allow update: if request.auth != null"),
  );
  if (!/resource\.data\.status == 'rejected'/.test(seller) ||
      !/request\.resource\.data\.status == 'pending'/.test(seller)) {
    failures.push(
      "firestore.rules does not allow rejected -> pending, so a rejection " +
        "is terminal again and the form's resubmission silently fails",
    );
  }
  // The direction matters as much as the transition. Written the other way
  // round, a seller could pull an approved listing back out of the market —
  // or push somebody's listing to rejected — and the tests that catch that
  // live in scripts/rules-tests.
  if (/resource\.data\.status == 'approved'\s*\n\s*&& request\.resource\.data\.status == 'rejected'/.test(seller)) {
    failures.push("firestore.rules lets a seller reject a listing");
  }
  if (!/request\.auth\.token\.canPost == true/.test(seller)) {
    failures.push(
      "the resubmission branch does not require canPost — re-entering the " +
        "queue is publishing, and publishing is the one thing that claim gates",
    );
  }
  // The audit trail is what the moderator's line is read from. If the
  // seller can write it, the line is whatever the seller wanted it to say.
  for (const field of ["moderationNote", "moderatedBy", "moderatedAt"]) {
    if (!new RegExp(`'${field}'`).test(seller)) {
      failures.push(
        `a seller may now write ${field}, so the reason shown back to the ` +
          `moderator is the seller's own text`,
      );
    }
  }
}

// 2. Any save resubmits a rejected listing; only a material change pulls
//    back an approved one.
{
  const form = read("src/screens/CreateListingScreen.js");
  // Every assignment, then the one that decides — `let backToReview =
  // false` is also a match, and matching it first is how this guard passed
  // against a form that had lost the branch entirely.
  const assignment = [...form.matchAll(/backToReview =[\s\S]{0,220}?;/g)]
    .map((match) => match[0])
    .find((body) => /editing\.status/.test(body));
  if (!assignment) {
    failures.push("CreateListingScreen no longer decides backToReview");
  } else {
    const body = assignment;
    if (!/editing\.status === "rejected"\s*\|\|/.test(body)) {
      failures.push(
        "a rejected listing is not resubmitted on save, or is resubmitted " +
          "only on a material change — which leaves every seller whose " +
          "fault was a photograph or a phone number stuck where they were",
      );
    }
    if (!/editing\.status === "approved" && changedMaterially/.test(body)) {
      failures.push(
        "an approved listing now falls back to review on any save, so " +
          "correcting a spelling takes a live listing out of the market",
      );
    }
  }
  if (!/status: "pending"/.test(form)) {
    failures.push(
      "the edit no longer writes the pending status it decided on",
    );
  }
}

// 3. Said to the seller — twice, because the two moments are different.
//    Mes annonces is where they learn the listing can be saved at all; the
//    form is where the Save button is.
{
  const list = read("src/screens/MyListingsScreen.js");
  if (!/listingRejectedResubmitHint/.test(list)) {
    failures.push(
      "Mes annonces shows a rejection without saying what to do about it",
    );
  }
  // The hint is unconditional on purpose. It used to be the tail of
  // listingRejectedNoReason, which renders only when moderation left no
  // reason — so the sellers who were given one, the only ones who could
  // act, were the ones never told they could.
  if (/moderationNote \|\| t\("listingRejectedResubmitHint"\)/.test(list)) {
    failures.push(
      "the way out is shown only when no reason was given, which is the " +
        "one case where the seller cannot act on it",
    );
  }
  const form = read("src/screens/CreateListingScreen.js");
  if (!/editRejectedBanner/.test(form)) {
    failures.push(
      "the edit form does not say that saving resubmits, so the " +
        "consequence of the Save button is not written above the Save button",
    );
  }
}

// 4. And read by the moderator, who is otherwise judging the same listing
//    twice with no memory of the first time.
{
  const moderation = read("src/screens/ModerationScreen.js");
  // The call, not the name. A bare /moderationPreviousRejection/ is also
  // satisfied by moderationPreviousRejectionNoReason — the key it is a
  // prefix of — so the guard passed against a screen that had lost the
  // branch carrying the actual reason and kept only "no reason recorded".
  if (!/t\("moderationPreviousRejection", \{\s*reason:/.test(moderation)) {
    failures.push(
      "ModerationScreen does not show what the previous rejection said, so " +
        "the second reading of a listing starts from nothing",
    );
  }
  if (!/t\("moderationPreviousRejectionNoReason"\)/.test(moderation)) {
    failures.push(
      "a resubmission rejected without a reason now looks like a first " +
        "submission",
    );
  }
  // moderationNote is this screen's own output, which is why it sits in
  // PLUMBING and is hidden from the field dump. Showing it is a deliberate
  // exception, not a leak in that list.
  if (!/"moderationNote"/.test(moderation)) {
    failures.push("moderationNote has fallen out of PLUMBING");
  }
  // The whole discriminator rests on this: a note exists only because a
  // rejection wrote one. decide() reads `note` on the way to an approval
  // too, so a sheet that closes without clearing it stamps a half-written
  // reason onto an approved listing — and the moderator reading the next
  // resubmission is shown a sentence nobody meant.
  if (!/const closeReject = \(\) => \{\s*setRejectFor\(null\);\s*setNote\(""\);/.test(moderation)) {
    failures.push(
      "closing the reject sheet does not clear the note, so a reason typed " +
        "and abandoned is written onto the next approval",
    );
  }
  if (/onPress=\{\(\) => setRejectFor\(null\)\}/.test(moderation)) {
    failures.push(
      "a control still closes the reject sheet without clearing the note",
    );
  }
}

// 5. The strings themselves, in both languages. A missing key renders as
//    the key, which is how a card came to read "realEstateCallCta".
{
  const translations = read("src/i18n/translations.js");
  const KEYS = [
    "listingRejectedResubmitHint",
    "editRejectedBanner",
    "editResubmittedTitle",
    "editResubmittedMessage",
    "moderationPreviousRejection",
    "moderationPreviousRejectionNoReason",
  ];
  for (const key of KEYS) {
    const count = translations.split(`${key}:`).length - 1;
    if (count < 2) {
      failures.push(`${key} is missing from one of the two languages`);
    }
  }
  // The interpolation the moderator's line is built from.
  if (!/moderationPreviousRejection: "[^"]*\{reason\}/.test(translations)) {
    failures.push(
      "moderationPreviousRejection has lost its {reason} placeholder, so " +
        "the moderator is told a listing was rejected and not what for",
    );
  }
}

// 6. And somebody has to be called to the queue the listing lands in. A
//    way back that ends in a queue nobody is told about is a listing
//    waiting where only luck finds it, and the seller has just been told
//    their correction is in review.
{
  const fns = read("functions/index.js");
  const trigger = fns.slice(fns.indexOf("exports.notifyModeratorOfEditedListing"));
  if (!/before\.status !== "approved" && before\.status !== "rejected"/.test(trigger)) {
    failures.push(
      "notifyModeratorOfEditedListing ignores a resubmission, so a " +
        "corrected listing joins the queue with nobody told",
    );
  }
  if (!/"resubmitted"/.test(trigger)) {
    failures.push(
      "the moderator's push does not distinguish a correction from an " +
        "ordinary edit, which is the one arrival they have already ruled on",
    );
  }
  // The seller's own push must NOT fire on the way back. rejected ->
  // pending is the seller's own act; telling them their listing was
  // moderated, seconds after they saved it, would be the app reporting
  // their own keystroke back to them as somebody else's decision.
  const sellerPush = fns.slice(fns.indexOf("exports.notifyListingModerated"));
  if (!/if \(!approved && after\.status !== "rejected"\) return;/.test(sellerPush)) {
    failures.push(
      "notifyListingModerated no longer restricts itself to the two " +
        "verdicts, so resubmitting pushes the seller a decision nobody made",
    );
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  "clean: a rejection can be answered — one transition, opened in the " +
    "rules, taken by the form, said to the seller and read by the moderator",
);
