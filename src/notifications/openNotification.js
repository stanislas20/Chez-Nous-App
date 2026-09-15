import { doc, getDoc } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { navigateWhenReady } from "../navigation/navigationRef";
import { categories } from "../data/categories";

// The duty-pharmacy directory, addressed the same way every other caller
// addresses it: CategoryListings needs labelEn/labelFr because it renders
// them as the header, and categories.js is where those two strings live.
// Reading them here rather than retyping them means a rename in one place
// cannot leave this screen captioned with the old name.
// `departments` arrives as a comma-joined string because FCM data values must
// be strings — an array is dropped in transit, so the push and the stored row
// both carry the joined form and it is split here. Absent on notifications
// written before the senders learned to include it, and on those the screen
// simply opens unscoped, which is what it did for all of them before.
function openPharmacyDirectory(data) {
  const pharmacy = categories.find((item) => item.key === "pharmacyOnDuty");
  const departments = String(data?.departments ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  navigateWhenReady("CategoryListings", {
    categoryKey: "pharmacyOnDuty",
    labelEn: pharmacy?.labelEn ?? "Pharmacy On Duty",
    labelFr: pharmacy?.labelFr ?? "Pharmacie de Garde",
    ...(departments.length ? { departments } : {}),
  });
}

// The notification centre is a TAB, not a root screen, so it is addressed
// through MainTabs — navigating to the bare name resolves to nothing and the
// tap dies silently, which is the exact failure this file exists to remove.
function openNotificationCentre() {
  navigateWhenReady("MainTabs", { screen: "Notifications" });
}

// Where a tapped notification should land.
//
// Every push already carries what it is about — the Cloud Functions send a
// conversationId or a listingId — and until now nothing read any of it. A
// tap opened the app on whatever screen it happened to be showing, and the
// person had to go and find the thing they had just been told about. For a
// garage owner who has been sent a photo by somebody stranded at the
// roadside, that is the difference between answering in ten seconds and not
// noticing at all.
//
// Two rules here:
//
//   - Never land somewhere that misdescribes the notification. A push with
//     no id in it ("your company was verified") has no specific screen to
//     open, so it goes to the notification centre rather than guessing.
//   - Never fail silently. If a listing cannot be fetched — deleted, or the
//     reader cannot read it — the fallback is the notification centre, not
//     a dead tap.

// ProductDetail takes a whole listing object rather than an id, so a push
// that names a listing has to fetch it before it can navigate.
async function openListingById(listingId) {
  if (!listingId || !isFirebaseConfigured) {
    openNotificationCentre();
    return;
  }
  try {
    const snapshot = await getDoc(doc(firestore, "listings", listingId));
    if (!snapshot.exists()) {
      openNotificationCentre();
      return;
    }
    const listing = { id: snapshot.id, ...snapshot.data() };
    // A job posting has its own screen and its own apply flow; opening it as
    // a goods listing would strand the reader on the wrong page.
    if (listing.categoryKey === "jobs") {
      navigateWhenReady("JobDetail", { job: listing });
      return;
    }
    navigateWhenReady("ProductDetail", { listing });
  } catch {
    openNotificationCentre();
  }
}

// Does this payload name a screen of its own?
//
// The same question openNotification answers by navigating, asked without
// navigating — because a row already sitting IN the notification centre must
// not be pressable if pressing it would only re-open the notification
// centre. Kept immediately above the switch it mirrors so the two are read
// together; a new case added below without a line here makes a row inert
// that should have been tappable, which check-notification-centre.js is what
// notices.
export function notificationTarget(data) {
  if (!data || Object.keys(data).length === 0) return null;
  if (data.conversationId) return "Chat";
  switch (data.type) {
    case "listingPendingReview":
      return "Moderation";
    case "followedSellerListing":
    case "listingApproved":
    case "listingRejected":
      // openListingById falls back to the centre when the listing cannot be
      // fetched, but it cannot be known here whether it can — the id being
      // present is the most this can honestly say.
      return data.listingId ? "ProductDetail" : null;
    case "paperExpiring":
      return "Papers";
    case "newJobApplication":
      return "JobApplications";
    // The roster notifications. They were the reason stored rows exist and
    // they were the one kind with nowhere to go, so the row rendered inert:
    // a notification you could read and not act on. The duty directory is
    // where the consequence of both of them is visible — a roster waiting to
    // be applied, or a region with no fresh roster at all, both show up as
    // what the reader's own users are currently being shown.
    //
    // pharmacyRosterSyncFailure is deliberately NOT here. "Sync failed, check
    // functions logs" has no counterpart in the app; sending it to a list of
    // pharmacies would be answering a question it did not ask.
    case "pharmacyRosterDraft":
    case "pharmacyRosterStale":
      return "CategoryListings";
    default:
      return null;
  }
}

export async function openNotification(data) {
  // A tap with nothing attached still has to go somewhere.
  //
  // This used to `return`, which is the one behaviour the rule above forbids
  // and the exact symptom somebody reports as "I press Voir and nothing
  // happens": a notification composed without a data payload, or one whose
  // custom keys did not survive the trip, produced a button that did
  // literally nothing. The notification centre is where the same message is
  // listed in full, so it is the honest destination when we cannot be more
  // specific.
  if (!data || Object.keys(data).length === 0) {
    openNotificationCentre();
    return;
  }

  // A message push is the only one that carries a conversation, and it is
  // also the most time-sensitive, so it is checked first.
  if (data.conversationId) {
    navigateWhenReady("Chat", {
      conversationId: data.conversationId,
      listingTitle: data.listingTitle || "",
    });
    return;
  }

  switch (data.type) {
    // The moderator's own notification. It opens the queue rather than the
    // one listing: by the time a phone is unlocked there is often more than
    // one waiting, and the queue puts the named one at the top anyway.
    case "listingPendingReview":
      navigateWhenReady("Moderation");
      return;

    case "followedSellerListing":
    case "listingApproved":
    case "listingRejected":
      await openListingById(data.listingId);
      return;
    // A paper expiry. The screen holding the date is the only useful place
    // to land — it is where the reader corrects it or marks it renewed.
    case "paperExpiring":
      navigateWhenReady("Papers");
      return;
    case "newJobApplication":
      // The employer's own list of applicants, which is a screen of its own
      // rather than the posting — somebody told "X applied" wants the
      // application, not their own advert.
      navigateWhenReady("JobApplications");
      return;
    // Kept in step with notificationTarget above, which decides whether the
    // row in the notification centre is pressable at all.
    case "pharmacyRosterDraft":
    case "pharmacyRosterStale":
      openPharmacyDirectory(data);
      return;
    // Everything else — a shortlisting result, a company verification — has
    // no id attached, so the notification centre is the honest destination:
    // it is where the same message is listed in full.
    default:
      openNotificationCentre();
  }
}
