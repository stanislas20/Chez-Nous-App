import { useConversations } from "./useConversations";
import { useNotificationsSeen } from "./useNotificationsSeen";
import { useJobApplications } from "./useJobApplications";
import { useStoredNotifications } from "./useStoredNotifications";

// Single source of truth for everything the notification bell surfaces:
// unread messages (per-conversation, already tracked elsewhere), new
// applications to the user's own job postings, and the notifications the
// server recorded outright — which now includes a listing published by a
// seller this user follows.
//
// WHAT IS NO LONGER HERE, and why. This hook used to call
// useNewListingsFeed(), which asks for the thirty most recently approved
// listings ACROSS EVERY SELLER. No uid, no follower filter: every listing
// published anywhere in Benin incremented every user's badge and appeared
// in their Notifications tab. At a few dozen listings a day that reads as a
// busy app; at a few thousand it is unusable, and it was never personal in
// the first place.
//
// A followed seller's listing is now a real notification, written per
// recipient by notifyFollowersOfNewListing at the moment it is published,
// and it arrives through useStoredNotifications with everything else. The
// push and the row in the tab are the same event rather than two things
// that happen to coincide.
//
// useNewListingsFeed still exists and is deliberately not deleted. "New on
// Chez-Nous" is a good discovery surface; it is simply not a personal
// notification, and where it belongs is a separate question. Shared between the bottom-tab badge (MainTabs) and the feed
// screen itself (NotificationsScreen) so the two can never disagree on the
// count.
//
// The fourth source is the one that was missing, and its absence was not
// visible from here: everything this hook returned was DERIVED from data
// that existed for another reason, so a notification with no listing and no
// conversation behind it — a pharmacy roster waiting for review — had
// nothing to be derived from. The push said it had happened, "Voir" routed
// here, and here had never heard of it. See useStoredNotifications.
export function useNotificationCenter(uid) {
  const conversations = useConversations(uid);
  const storedNotifications = useStoredNotifications(uid);
  // Destructured, like every other call site. Phase E changed this hook to
  // return { applications, failed } so a failed read stops rendering as "no
  // applicants"; this caller was missed, and because MainTabs sits behind
  // every screen the app could not get past its splash.
  const { applications: jobApplications } = useJobApplications(uid);
  const { lastSeenAt, markSeen } = useNotificationsSeen(uid);

  const unreadMessageCount = (conversations ?? []).reduce(
    (sum, conversation) => sum + (conversation.unreadCount?.[uid] ?? 0),
    0,
  );

  const newJobApplications = (jobApplications ?? []).filter((application) => {
    if (!(lastSeenAt instanceof Date)) return false;
    const createdAt = application.createdAt?.toDate?.();
    return createdAt && createdAt > lastSeenAt;
  });

  // Same seen-cursor as the other two, so the badge clears on the same
  // gesture and cannot disagree with itself. A row whose createdAt has not
  // arrived from the server yet is not counted: serverTimestamp() reads back
  // null locally for a moment, and counting it as unseen would flash the
  // badge for a notification that is about to be dated correctly anyway.
  const newStoredNotifications = (storedNotifications ?? []).filter((entry) => {
    if (!(lastSeenAt instanceof Date)) return false;
    const createdAt = entry.createdAt?.toDate?.();
    return createdAt && createdAt > lastSeenAt;
  });

  return {
    conversations,
    jobApplications,
    newJobApplications,
    storedNotifications,
    newStoredNotifications,
    unreadMessageCount,
    // The follower-listing rows are inside newStoredNotifications now, so
    // there is no separate listing term. Nothing global reaches this number.
    badgeCount:
      unreadMessageCount +
      newJobApplications.length +
      newStoredNotifications.length,
    markSeen,
  };
}
