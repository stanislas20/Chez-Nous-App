#!/usr/bin/env node
//
// Three defects, one subject: a notification that was sent, and did not
// arrive as anything the reader could act on. All three were found on a
// physical device during Android RC1 validation, and none of them was
// visible from the code alone.
//
// 1. TAPPED FROM A TERMINATED APP, LANDED ON THE WRONG SCREEN.
//
//    From the background the tap opened the conversation. From a cold start
//    it opened the Sell dashboard. Same payload, same route name, same
//    openNotification — only the timing differed.
//
//    NavigationContainer is mounted unconditionally, but RootNavigator
//    returns a bare spinner while i18n loads, so for the first moments there
//    is no navigator inside the container and isReady() is false.
//    getInitialNotification() resolves off an async Firebase call. The two
//    orders interleave differently on every launch, and BOTH interleavings
//    lost the destination: navigating inline into a container that had just
//    become ready was dropped by React Navigation, and holding it a moment
//    after onReady had already fired meant nothing ever replayed it.
//
//    So the destination is always QUEUED and delivered on a deferred tick,
//    and arrival is confirmed rather than assumed.
//
// 2. PERMISSION GRANTED LATER NEVER REGISTERED A TOKEN.
//
//    Registration ran once, from the sign-in path, and latched a flag BEFORE
//    awaiting its result. A reader who declined the prompt and later enabled
//    notifications in Android Settings got no push until the next cold start
//    — silently, with the setting reading as granted the whole time. It cost
//    a false FAIL during testing before it was understood.
//
// 3. PUSHES LANDED IN FCM'S FALLBACK CHANNEL.
//
//    Without an explicit channelId Android files the notification under
//    fcm_fallback_notification_channel, bypassing the `messages` channel the
//    app creates and leaving the reader nothing to silence but everything.
//
// Run: node scripts/check-notification-delivery.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const NAV = "src/navigation/navigationRef.js";
const AUTH = "src/auth/AuthContext.js";
const PUSH = "src/notifications/pushToken.js";
const FUNCTIONS = "functions/index.js";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const rel of [NAV, AUTH, PUSH, FUNCTIONS]) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel} is missing — this check reads it`);
  }
}
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

// ── 1. Cold-start routing ───────────────────────────────────────────────
const nav = stripComments(read(NAV));

const whenReady = nav.slice(
  nav.search(/export function navigateWhenReady/),
  nav.search(/export function onNavigationReady/),
);

if (!whenReady.trim()) {
  failures.push(`${NAV} no longer exports navigateWhenReady`);
} else {
  // The inline navigate is the regression. If navigateWhenReady can reach
  // navigationRef.navigate without going through the queue, the dropped-on-
  // cold-start case is back.
  if (/navigationRef\.navigate\(/.test(whenReady)) {
    failures.push(
      "navigateWhenReady dispatches navigate() itself instead of queueing — " +
        "dispatching in the same tick the container reports ready is exactly " +
        "the case React Navigation drops, and it is how a notification tap " +
        "from a terminated app ends up on the default tab",
    );
  }
  if (!/pending = \{/.test(whenReady)) {
    failures.push(
      "navigateWhenReady does not store a pending destination, so a tap that " +
        "arrives before the navigator exists has nowhere to wait",
    );
  }
}

const deliverFn = nav.slice(nav.search(/function deliver\(/), nav.search(/export function navigateWhenReady/));
if (!deliverFn.trim()) {
  failures.push(`${NAV} has no deliver() — the queue has no drain`);
} else {
  if (!/pending = null;/.test(deliverFn) || !/navigationRef\.navigate\(/.test(deliverFn)) {
    failures.push(
      "deliver() does not both clear the pending destination and navigate — " +
        "one without the other is either a tap that never lands or a tap " +
        "that lands repeatedly",
    );
  }
  // Bounded. An unbounded retry against a route name that does not exist is
  // a timer running for the rest of the session.
  if (!/attempts >= DELIVERY_MAX_ATTEMPTS/.test(deliverFn)) {
    failures.push(
      "deliver() has no attempt ceiling — a destination that can never be " +
        "reached would be retried forever, which is a navigation loop",
    );
  }
  // Arrival is confirmed, not assumed.
  if (!/getCurrentRoute\(\)\?\.name === target\.name/.test(deliverFn)) {
    failures.push(
      "deliver() never checks whether the navigation actually landed, so a " +
        "silently dropped dispatch looks identical to a successful one",
    );
  }
}

if (!/export function onNavigationReady\(\) \{\s*deliver\(\);/.test(nav)) {
  failures.push(
    "onNavigationReady does not drain the queue — a destination held during " +
      "a cold start is never delivered once the navigator mounts",
  );
}

// ── 2. Token registration after a permission change ─────────────────────
const auth = stripComments(read(AUTH));

if (/hasRegisteredPushToken = true;\s*registerPushToken/.test(auth)) {
  failures.push(
    "the push-registration latch is set BEFORE registerPushToken resolves — " +
      "a denied permission then reads as registered for the rest of the " +
      "session and nothing ever retries",
  );
}
if (!/hasRegisteredPushToken = Boolean\(unsub\)/.test(auth)) {
  failures.push(
    "the push-registration latch is not derived from the registration's own " +
      "result; only a returned unsubscribe proves a token was stored",
  );
}
if (!/AppState\.addEventListener\(/.test(auth) || !/refreshPushRegistration\(/.test(auth)) {
  failures.push(
    "nothing re-checks push registration when the app returns to the " +
      "foreground — Android Settings does not tell an app its notification " +
      "switch was flipped, so a permission granted there stays unused until " +
      "the next cold start",
  );
}

const push = stripComments(read(PUSH));
const refresh = push.slice(
  push.search(/export async function refreshPushRegistration/),
  push.search(/export async function registerPushToken/),
);
if (!refresh.trim()) {
  failures.push(`${PUSH} no longer exports refreshPushRegistration`);
} else {
  if (/requestPermission\(/.test(refresh)) {
    failures.push(
      "refreshPushRegistration calls requestPermission — this runs on every " +
        "resume, so it would prompt the reader each time they come back to " +
        "the app, which is worse than the bug it fixes",
    );
  }
  if (!/hasPermission\(/.test(refresh)) {
    failures.push(
      "refreshPushRegistration does not read the current permission with " +
        "hasPermission, so it cannot notice one granted outside the app",
    );
  }
}
// Writes are deduplicated, or a resume-time check becomes a Firestore write
// every time the reader switches apps.
if (!/lastWritten\.uid === uid && lastWritten\.token === token/.test(push)) {
  failures.push(
    "savePushToken no longer skips an unchanged (account, token) pair — the " +
      "resume check then costs a Firestore write on every app switch",
  );
}

// ── 3. Notification channel ─────────────────────────────────────────────
const functions = stripComments(read(FUNCTIONS));

const clientChannel = push.match(/export const MESSAGES_CHANNEL = "([^"]+)"/);
const serverChannel = functions.match(/const MESSAGES_CHANNEL = "([^"]+)"/);
if (!clientChannel) {
  failures.push(`${PUSH} no longer defines MESSAGES_CHANNEL`);
} else if (!serverChannel) {
  failures.push(
    `${FUNCTIONS} does not define MESSAGES_CHANNEL — message pushes then ` +
      `carry no channel and Android files them under its fallback channel`,
  );
} else if (clientChannel[1] !== serverChannel[1]) {
  failures.push(
    `the channel id the app creates ("${clientChannel[1]}") and the one the ` +
      `server sends ("${serverChannel[1]}") differ; naming a channel Android ` +
      `has never been told about is the same as naming none`,
  );
}

const sendMessagePush = functions.slice(
  functions.search(/exports\.sendMessagePush = /),
  functions.search(/exports\.autoPublishVerifiedCompanyListing = /),
);
if (!sendMessagePush.trim()) {
  failures.push(`${FUNCTIONS} no longer exports sendMessagePush`);
} else if (!/channelId: MESSAGES_CHANNEL/.test(sendMessagePush)) {
  failures.push(
    "sendMessagePush does not set android.notification.channelId — this is " +
      "the exact omission that put message notifications in " +
      "fcm_fallback_notification_channel on a physical device",
  );
}

if (failures.length === 0) {
  console.log(
    "clean: a tapped notification is queued until the navigator can take it, " +
      "a permission granted later still registers, and message pushes name " +
      "their own channel",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
