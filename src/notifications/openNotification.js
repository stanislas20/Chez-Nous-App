import { doc, getDoc } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { navigateWhenReady } from "../navigation/navigationRef";

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

export async function openNotification(data) {
  if (!data) return;

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
    case "newJobApplication":
      // The employer's own list of applicants, which is a screen of its own
      // rather than the posting — somebody told "X applied" wants the
      // application, not their own advert.
      navigateWhenReady("JobApplications");
      return;
    // Everything else — a shortlisting result, a company verification — has
    // no id attached, so the notification centre is the honest destination:
    // it is where the same message is listed in full.
    default:
      openNotificationCentre();
  }
}
