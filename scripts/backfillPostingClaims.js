// Gives existing accounts the posting claim their number entitles them to.
//
// The claim is new, so on the day the rule ships every account has none —
// including sellers in Cotonou with listings already live, who would find
// Publier refusing them for a reason that has nothing to do with them. This
// walks every user once and sets the claim from the number their account is
// keyed on.
//
// It is the one place the claim is set without an SMS, which is safe for a
// reason worth writing down: it only reads the pseudo-email Firebase already
// holds, and that address was fixed when the account was created. It cannot
// be used to bless a number the account does not have.
//
// Non-Bénin accounts are set to canPost:false explicitly rather than left
// unset. An absent claim and a false one behave identically in the rules, but
// only one of them says somebody looked.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/backfillPostingClaims.js            # report only
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/backfillPostingClaims.js --apply

const admin = require("../functions/node_modules/firebase-admin");
const { parsePhoneNumberFromString } = require("libphonenumber-js");

const POSTING_DIAL = "+229";
const APPLY = process.argv.includes("--apply");

admin.initializeApp({ projectId: "benin-marketplace-3eb04" });

function phoneOf(user) {
  // The account's own phone claim first, then the pseudo-email it signs in
  // with — sign-up derives one from the other, but a phone-provider account
  // may carry only the first.
  if (user.phoneNumber) return user.phoneNumber;
  const local = (user.email || "").split("@")[0];
  return /^\d+$/.test(local) ? `+${local}` : null;
}

async function run() {
  let processed = 0;
  let granted = 0;
  let denied = 0;
  let skipped = 0;
  const byCountry = new Map();

  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const user of page.users) {
      processed += 1;
      const phone = phoneOf(user);
      if (!phone) {
        skipped += 1;
        continue;
      }
      const canPost = phone.startsWith(POSTING_DIAL);
      const country = parsePhoneNumberFromString(phone)?.country ?? "inconnu";
      byCountry.set(country, (byCountry.get(country) ?? 0) + 1);

      if (canPost) granted += 1;
      else denied += 1;

      if (APPLY && user.customClaims?.canPost !== canPost) {
        await admin.auth().setCustomUserClaims(user.uid, {
          ...(user.customClaims || {}),
          canPost,
        });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`${processed} account(s) examined`);
  console.log(`  may publish : ${granted}`);
  console.log(`  may not     : ${denied}`);
  console.log(`  no number   : ${skipped}`);
  console.log(
    "  by country  : " +
      [...byCountry.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => `${code}×${count}`)
        .join(", "),
  );
  if (!APPLY) {
    console.log(
      "\nNothing was written. Re-run with --apply to set the claims.",
    );
  } else {
    console.log(
      "\nClaims written. Each account picks them up when its ID token next" +
        " refreshes, within the hour, or immediately on next sign-in.",
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
