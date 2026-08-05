const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();

// Keep costs bounded on a low-traffic endpoint.
setGlobalOptions({ maxInstances: 10 });

const PSEUDO_EMAIL_DOMAIN = 'chez-nous.app';
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
// How long after the phone-OTP sign-in the resulting ID token is trusted for
// a password reset. Ties the reset tightly to the OTP flow that just ran.
const AUTH_TIME_MAX_AGE_SECONDS = 5 * 60;
const E164_RE = /^\+[1-9]\d{6,14}$/;

function phoneToPseudoEmail(e164Phone) {
  // Mirrors src/auth/phoneAuth.js#phoneToPseudoEmail exactly.
  return `${e164Phone.replace('+', '')}@${PSEUDO_EMAIL_DOMAIN}`;
}

exports.resetSellerPassword = onCall(async (request) => {
  const { idToken, newPassword } = request.data || {};

  if (typeof idToken !== 'string' || !idToken) {
    throw new HttpsError('invalid-argument', 'Missing verification token.');
  }
  if (
    typeof newPassword !== 'string' ||
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    throw new HttpsError('invalid-argument', 'Invalid password.');
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    throw new HttpsError('unauthenticated', 'Invalid or expired verification token.');
  }

  if (decodedToken.firebase?.sign_in_provider !== 'phone') {
    throw new HttpsError('permission-denied', 'Phone verification required.');
  }

  const phoneNumber = decodedToken.phone_number;
  if (!phoneNumber || !E164_RE.test(phoneNumber)) {
    throw new HttpsError('permission-denied', 'Missing or invalid phone number claim.');
  }

  const authTimeSeconds = decodedToken.auth_time;
  const nowSeconds = Date.now() / 1000;
  if (!authTimeSeconds || nowSeconds - authTimeSeconds > AUTH_TIME_MAX_AGE_SECONDS) {
    throw new HttpsError('deadline-exceeded', 'Phone verification expired. Please verify again.');
  }

  const pseudoEmail = phoneToPseudoEmail(phoneNumber);

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(pseudoEmail);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No seller account found for this phone number.');
    }
    throw new HttpsError('internal', 'Could not look up account.');
  }

  try {
    await admin.auth().updateUser(userRecord.uid, { password: newPassword });
    // Invalidate any other active sessions for this seller now that the
    // password has changed.
    await admin.auth().revokeRefreshTokens(userRecord.uid);
  } catch (error) {
    if (error.code === 'auth/invalid-password') {
      throw new HttpsError('invalid-argument', 'Invalid password.');
    }
    throw new HttpsError('internal', 'Could not update password.');
  }

  return { success: true };
});

exports.sendMessagePush = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data();
    if (!message) return;

    const { conversationId } = event.params;
    const conversationSnap = await admin
      .firestore()
      .doc(`conversations/${conversationId}`)
      .get();
    if (!conversationSnap.exists) return;

    const conversation = conversationSnap.data();
    const recipientUid = conversation.participantIds.find((id) => id !== message.senderId);
    if (!recipientUid) return;

    // Don't notify if either side has blocked this conversation.
    if (conversation.blockedBy?.[recipientUid] || conversation.blockedBy?.[message.senderId]) return;

    const [recipientSnap, senderSnap] = await Promise.all([
      admin.firestore().doc(`sellers/${recipientUid}`).get(),
      admin.firestore().doc(`sellers/${message.senderId}`).get(),
    ]);

    const pushToken = recipientSnap.exists ? recipientSnap.data().pushToken : null;
    if (!pushToken) return;

    const senderName = senderSnap.exists ? senderSnap.data().fullName : null;
    const body = message.text || (message.imageUrl ? '📷 Photo' : message.audioUrl ? '🎤 Voice message' : 'New message');

    try {
      await admin.messaging().send({
        token: pushToken,
        notification: {
          title: senderName || 'New message',
          body,
        },
        data: {
          conversationId,
          listingTitle: conversation.listingTitle || '',
        },
      });
    } catch (error) {
      // Token is no longer valid (app uninstalled, etc.) — drop it so we stop
      // trying to send to it.
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        await admin.firestore().doc(`sellers/${recipientUid}`).update({
          pushToken: admin.firestore.FieldValue.delete(),
        });
      }
    }
  },
);
