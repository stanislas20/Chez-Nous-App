import { useConversations } from "./useConversations";
import { useNewListingsFeed } from "./useNewListingsFeed";
import { useNotificationsSeen } from "./useNotificationsSeen";
import { useJobApplications } from "./useJobApplications";
import { useStoredNotifications } from "./useStoredNotifications";

// Single source of truth for everything the notification bell surfaces:
// unread messages (per-conversation, already tracked elsewhere), newly
// approved listings the user hasn't seen yet, new applications to the
// user's own job postings, and the notifications the server recorded
// outright. Shared between the bottom-tab badge (MainTabs) and the feed
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
  const listings = useNewListingsFeed();
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

  const newListings = (listings ?? []).filter((item) => {
    if (item.sellerId === uid) return false; // never notify sellers about their own post
    if (!(lastSeenAt instanceof Date)) return false; // still loading — don't flash a wrong count
    const approvedAt = item.approvedAt?.toDate?.();
    return approvedAt && approvedAt > lastSeenAt;
  });

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
    listings,
    newListings,
    jobApplications,
    newJobApplications,
    storedNotifications,
    newStoredNotifications,
    unreadMessageCount,
    badgeCount:
      unreadMessageCount +
      newListings.length +
      newJobApplications.length +
      newStoredNotifications.length,
    markSeen,
  };
}
