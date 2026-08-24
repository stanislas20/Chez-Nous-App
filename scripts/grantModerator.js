// Who may approve a listing from inside the app.
//
// Until now the answer was "whoever holds the service-account key", which is
// the same credential that can read every private message and delete every
// document. That is the right tool for a script and the wrong one for a
// person doing daily review: it cannot be granted to one individual, and it
// cannot be taken back from one individual either.
//
// A `moderator` custom claim can. It is set only here, by somebody who
// already holds admin credentials, so it can never be self-assigned — the
// same shape as canPost.
//
// The account is selected by its pseudo-e-mail, never by phone number, and
// that matters: every sign-up leaves TWO Firebase users behind. The SMS step
// signs in with the phone provider to check the code, which creates a user,
// and that user persists alongside the e-mail/password account the app
// actually signs into. Granting the claim to the phone twin would look like
// success here and refuse the moderator in the app, with nothing on either
// side to explain it.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/grantModerator.js +2290146464674
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/grantModerator.js +229… --revoke
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/grantModerator.js --list

const admin = require("../functions/node_modules/firebase-admin");

const PSEUDO_EMAIL_DOMAIN = "chez-nous.app";
const args = process.argv.slice(2);
const REVOKE = args.includes("--revoke");
const LIST = args.includes("--list");
const phoneArg = args.find((value) => value.startsWith("+"));

admin.initializeApp({ projectId: "benin-marketplace-3eb04" });

const pseudoEmail = (e164) => `${e164.replace("+", "")}@${PSEUDO_EMAIL_DOMAIN}`;

async function list() {
  const page = await admin.auth().listUsers(1000);
  const moderators = page.users.filter((u) => u.customClaims?.moderator);
  if (!moderators.length) {
    console.log("No moderators.");
    return;
  }
  console.log(`${moderators.length} moderator(s):`);
  moderators.forEach((u) =>
    console.log(
      `  ${u.email ?? u.phoneNumber}  ${u.displayName ?? "—"}  uid=${u.uid}`,
    ),
  );
}

async function apply(phone) {
  const email = pseudoEmail(phone);

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (error) {
    throw new Error(
      `No password account for ${phone} (looked for ${email}). ` +
        `A phone-provider twin may exist, but it is not the account the app ` +
        `signs into and must not be given the claim.`,
    );
  }

  await admin.auth().setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    moderator: REVOKE ? false : true,
  });

  console.log(
    `${REVOKE ? "Revoked" : "Granted"} moderator for ${phone} ` +
      `(${user.displayName ?? "no name"}, uid ${user.uid}).`,
  );

  // Anyone else who already had it, so a second moderator is never granted
  // by accident and never forgotten.
  const page = await admin.auth().listUsers(1000);
  const others = page.users.filter(
    (u) => u.customClaims?.moderator && u.uid !== user.uid,
  );
  if (others.length) {
    console.log(`\nAlso moderators: ${others.map((u) => u.email).join(", ")}`);
  } else if (!REVOKE) {
    console.log("\nThis is the only moderator.");
  }
  console.log(
    "\nThe claim reaches the device when its ID token next refreshes," +
      " within the hour, or immediately on next sign-in.",
  );
}

(LIST ? list() : apply(phoneArg))
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
