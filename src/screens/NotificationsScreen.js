import { useCallback } from 'react';
import { FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useNotificationCenter } from '../hooks/useNotificationCenter';
import { openListing } from '../utils/openListing';

const listContentStyle = { padding: spacing.md, flexGrow: 1 };

function formatTimestamp(date, language) {
  if (!date) return '';
  const now = new Date();
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

// Three kinds of real, non-fabricated activity feed this bell: unread
// messages (a device-level push already fires for these too, via the
// sendMessagePush Cloud Function), listings that just cleared moderation
// (whose seller is pushed via notifyListingModerated), and new applications
// to the user's own real job postings (pushed via notifyNewJobApplication).
// Events is deliberately excluded — it's left empty rather than showing
// invented listings, so it has no genuine "new" event to surface.
export function NotificationsScreen() {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const { user } = useAuth();
  const navigation = useNavigation();
  const { conversations, newListings, newJobApplications, markSeen } = useNotificationCenter(user?.uid);

  // Marked seen on the way OUT of this tab, not on the way in — marking on
  // focus would flip newListings' filter live while the user is still
  // looking at the list (it's reactive to lastSeenAt), yanking rows out
  // from under them mid-read. Deferring to blur keeps what's on screen
  // stable for the whole visit and only clears the badge once they leave.
  useFocusEffect(
    useCallback(() => {
      return () => markSeen();
    }, [markSeen]),
  );

  if (!user) {
    return (
      <Container edges={['left', 'right', 'bottom']}>
        <Ionicons name="notifications-outline" size={40} color={colors.textMuted} />
        <Title>{t('notificationsEmptyTitle')}</Title>
        <Subtitle>{t('chatListSignInPrompt')}</Subtitle>
      </Container>
    );
  }

  const unreadConversations = (conversations ?? []).filter(
    (item) => (item.unreadCount?.[user.uid] ?? 0) > 0,
  );

  const feed = [
    ...unreadConversations.map((item) => ({ kind: 'message', id: `m-${item.id}`, item, time: item.lastMessageAt?.toDate?.() })),
    ...newListings.map((item) => ({ kind: 'listing', id: `l-${item.id}`, item, time: item.approvedAt?.toDate?.() })),
    ...newJobApplications.map((item) => ({ kind: 'application', id: `a-${item.id}`, item, time: item.createdAt?.toDate?.() })),
  ].sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));

  const isLoading = conversations === null;

  return (
    <Container edges={['left', 'right', 'bottom']}>
      <FlatList
        data={feed}
        keyExtractor={(entry) => entry.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState>
              <Ionicons name="notifications-outline" size={40} color={colors.textMuted} />
              <Title>{t('notificationsEmptyTitle')}</Title>
              <Subtitle>{t('notificationsEmptySubtitle')}</Subtitle>
            </EmptyState>
          ) : null
        }
        renderItem={({ item: entry }) => {
          if (entry.kind === 'application') {
            const application = entry.item;
            return (
              <Row onPress={() => navigation.navigate('JobApplications')}>
                <IconThumb>
                  <Ionicons name="mail-open-outline" size={20} color={colors.primary} />
                </IconThumb>
                <RowBody>
                  <RowTitle numberOfLines={1}>
                    {t('notificationNewApplicationLabel', { title: application.jobTitle ?? '' })}
                  </RowTitle>
                  <RowPreview numberOfLines={1}>
                    {application.applicantName?.trim() || t('jobApplicationsAnonymousApplicant')}
                  </RowPreview>
                </RowBody>
                <RowMeta>
                  <RowTime>{formatTimestamp(entry.time, language)}</RowTime>
                </RowMeta>
              </Row>
            );
          }

          if (entry.kind === 'listing') {
            const listing = entry.item;
            const title = language === 'en' ? listing.titleEn : listing.titleFr;
            return (
              <Row
                onPress={() =>
                  openListing(navigation, { ...listing, createdAt: null, approvedAt: null }, t, language)
                }
              >
                <Thumbnail source={{ uri: listing.mediaUrl }} resizeMode="cover" />
                <RowBody>
                  <RowTitle numberOfLines={1}>{t('notificationNewListingLabel', { title })}</RowTitle>
                  <RowPreview numberOfLines={1}>{listing.city ?? ''}</RowPreview>
                </RowBody>
                <RowMeta>
                  <RowTime>{formatTimestamp(entry.time, language)}</RowTime>
                </RowMeta>
              </Row>
            );
          }

          const item = entry.item;
          const unread = item.unreadCount?.[user.uid] ?? 0;
          const previewText =
            item.lastMessageType === 'image'
              ? t('chatPhotoMessagePreview')
              : item.lastMessageType === 'audio'
                ? t('chatVoiceMessagePreview')
                : (item.lastMessage ?? '');
          return (
            <Row
              onPress={() =>
                navigation.navigate('Chat', { conversationId: item.id, listingTitle: item.listingTitle })
              }
            >
              <Thumbnail source={{ uri: item.listingThumbnail }} resizeMode="cover" />
              <RowBody>
                <RowTitle numberOfLines={1}>
                  {t('notificationNewMessageLabel', { title: item.listingTitle })}
                </RowTitle>
                <RowPreview numberOfLines={1}>{previewText}</RowPreview>
              </RowBody>
              <RowMeta>
                <RowTime>{formatTimestamp(entry.time, language)}</RowTime>
                <UnreadDot>
                  <UnreadDotLabel>{unread}</UnreadDotLabel>
                </UnreadDot>
              </RowMeta>
            </Row>
          );
        }}
      />
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const EmptyState = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-horizontal: ${spacing.xl}px;
`;

const Title = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.md}px;
  text-align: center;
`;

const Subtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
  text-align: center;
`;

const Row = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const Thumbnail = styled.Image`
  width: 48px;
  height: 48px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const IconThumb = styled.View`
  width: 48px;
  height: 48px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => props.theme.primaryLight};
  align-items: center;
  justify-content: center;
`;

const RowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const RowTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const RowPreview = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const RowMeta = styled.View`
  align-items: flex-end;
  gap: ${spacing.xs}px;
`;

const RowTime = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  font-size: 11px;
`;

const UnreadDot = styled.View`
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background-color: ${(props) => props.theme.primary};
  align-items: center;
  justify-content: center;
  padding-horizontal: 5px;
`;

const UnreadDotLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
  font-size: 10px;
`;
