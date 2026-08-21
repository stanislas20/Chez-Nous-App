import { useConversations } from './useConversations';
import { useNewListingsFeed } from './useNewListingsFeed';
import { useNotificationsSeen } from './useNotificationsSeen';
import { useJobApplications } from './useJobApplications';

// Single source of truth for everything the notification bell surfaces:
// unread messages (per-conversation, already tracked elsewhere), newly
// approved listings the user hasn't seen yet, and new applications to the
// user's own job postings. Shared between the bottom-tab badge (MainTabs)
// and the feed screen itself (NotificationsScreen) so the two can never
// disagree on the count.
export function useNotificationCenter(uid) {
  const conversations = useConversations(uid);
  const listings = useNewListingsFeed();
  const jobApplications = useJobApplications(uid);
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

  return {
    conversations,
    listings,
    newListings,
    jobApplications,
    newJobApplications,
    unreadMessageCount,
    badgeCount: unreadMessageCount + newListings.length + newJobApplications.length,
    markSeen,
  };
}
