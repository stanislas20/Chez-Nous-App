import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, Modal, Pressable } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { doc, updateDoc } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { firestore } from "../config/firebase";
import { reportNonFatal } from "../utils/reportError";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { useConversations } from "../hooks/useConversations";
import { usePublicProfiles } from "../hooks/usePublicProfiles";
import { PublicAvatar } from "../components/PublicAvatar";
import { openAccountGate } from "../utils/openAccountGate";
import { TabSafeAreaView } from "../components/TabSafeAreaView";

// Same avatar gradient the job cards and seller tiles use, so a listing
// with no photo reads as intentional rather than as a broken image.
const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

const listContentStyle = { padding: spacing.md };

function formatTimestamp(date, language) {
  if (!date) return "";
  const now = new Date();
  const locale = language === "en" ? "en-US" : "fr-FR";
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function ChatListScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const { user } = useAuth();
  const conversations = useConversations(user?.uid);

  // The counterpart of every visible thread, resolved once for the list.
  //
  // useConversations caps the inbox at 50, so this asks for at most 50 ids
  // and usually fewer — the hook de-duplicates, so somebody you have three
  // threads with is one lookup, and its cache is module-level, so a uid
  // already seen in a thread header or on a review costs nothing at all.
  //
  // Deliberately NOT inside renderItem. FlatList recycles rows, so resolving
  // there would be a read per scroll rather than a read per person.
  const otherUidOf = (conversation) =>
    conversation?.participantIds?.find((id) => id !== user?.uid) ?? null;
  const counterpartProfiles = usePublicProfiles(
    (conversations ?? []).map(otherUidOf).filter(Boolean),
  );

  // The thread whose "More" sheet is open, and whether the inbox is currently
  // showing the archive instead of the inbox proper.
  const [menuFor, setMenuFor] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  // One open row at a time, and every action closes the row it came from.
  // Without this a row stays swiped open behind a modal, and comes back to a
  // list that has since re-sorted underneath it.
  const swipeRefs = useRef(new Map());
  const closeRow = useCallback((id) => {
    swipeRefs.current.get(id)?.close?.();
  }, []);

  // Three per-viewer flags, all maps of uid -> bool on the conversation.
  //
  // A map rather than a field because the document is shared: archiving a
  // thread is MY decision about MY inbox, and the person on the other end
  // must not see their copy disappear. Unsetting writes false rather than
  // deleting the key, matching how blockedBy already behaves.
  const flagOf = (conversation, name) =>
    Boolean(user && conversation?.[name]?.[user.uid]);

  const writeFlag = useCallback(
    (conversation, name, value, failureKey) => {
      if (!user || !conversation?.id) return;
      closeRow(conversation.id);
      updateDoc(doc(firestore, "conversations", conversation.id), {
        [`${name}.${user.uid}`]: value,
      }).catch((error) => {
        reportNonFatal(failureKey, error, { where: "ChatListScreen" });
        Alert.alert(t("errorTitle"), t("chatListActionFailed"));
      });
    },
    [user, closeRow, t],
  );

  const openContactInfo = useCallback(
    (conversation) => {
      const otherUid = otherUidOf(conversation);
      if (!otherUid) return;
      closeRow(conversation.id);
      setMenuFor(null);
      navigation.navigate("SellerProfile", {
        sellerId: otherUid,
        sellerName:
          conversation.participantNames?.[otherUid] ??
          counterpartProfiles[otherUid]?.displayName ??
          t("chatUnknownParticipant"),
        sellerPhotoUrl: counterpartProfiles[otherUid]?.photoUrl ?? null,
      });
    },
    [navigation, counterpartProfiles, closeRow, t],
  );

  // Blocking is the one action here that is not a private preference: it
  // changes what the server will accept from the other person, so it asks
  // first and says who it is about.
  const toggleBlock = useCallback(
    (conversation) => {
      const otherUid = otherUidOf(conversation);
      const alreadyBlocked = flagOf(conversation, "blockedBy");
      setMenuFor(null);
      if (alreadyBlocked) {
        writeFlag(conversation, "blockedBy", false, "chatListUnblock");
        return;
      }
      Alert.alert(t("chatBlockConfirmTitle"), t("chatBlockConfirmMessage"), [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("chatBlockUser"),
          style: "destructive",
          onPress: () =>
            writeFlag(conversation, "blockedBy", true, "chatListBlock"),
        },
      ]);
    },
    [writeFlag, t],
  );

  if (!user) {
    return (
      <Container edges={["left", "right"]}>
        <SignInPrompt>
          <Ionicons
            name="chatbubbles-outline"
            size={40}
            color={colors.primary}
          />
          <SignInPromptText>{t("chatListSignInPrompt")}</SignInPromptText>
          <SignInButton onPress={() => openAccountGate(navigation)}>
            <SignInButtonLabel>{t("signUpButton")}</SignInButtonLabel>
          </SignInButton>
        </SignInPrompt>
      </Container>
    );
  }

  // The inbox hides archived threads; the archive shows only those. The count
  // is of the whole subscription, not of what is rendered, so the banner keeps
  // telling the truth while the archive itself is open.
  const all = conversations ?? [];
  const archivedCount = all.filter((c) => flagOf(c, "archivedBy")).length;
  const visible = all.filter(
    (c) => flagOf(c, "archivedBy") === showArchived,
  );

  return (
    <Container edges={["left", "right"]}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        /* The archive is a filter on this same list rather than a route: the
           subscription, the counterpart lookups and the unread badges are
           already here, and a second screen would duplicate all three to show
           the same rows. */
        ListHeaderComponent={
          archivedCount > 0 || showArchived ? (
            <ArchiveBanner onPress={() => setShowArchived((on) => !on)}>
              <Ionicons
                name={showArchived ? "chevron-back" : "archive-outline"}
                size={18}
                color={colors.primary}
              />
              <ArchiveBannerLabel>
                {showArchived
                  ? t("chatListBackToInbox")
                  : `${t("chatListArchived")} (${archivedCount})`}
              </ArchiveBannerLabel>
            </ArchiveBanner>
          ) : null
        }
        ListEmptyComponent={
          conversations !== null ? (
            <EmptyMessage>
              {showArchived
                ? t("chatListArchiveEmpty")
                : t("chatListEmptyMessage")}
            </EmptyMessage>
          ) : null
        }
        renderItem={({ item }) => {
          const unread = item.unreadCount?.[user.uid] ?? 0;
          // "deleted" is written by the chat screen when the newest message is
          // tombstoned. Without this case the inbox goes on showing the text of
          // a message the sender has just deleted — the most visible place that
          // failure could land, and the whole reason deleting it was asked for.
          const previewText =
            item.lastMessageType === "deleted"
              ? t("chatListDeleted")
              : item.lastMessageType === "image"
                ? t("chatPhotoMessagePreview")
                : item.lastMessageType === "audio"
                  ? t("chatVoiceMessagePreview")
                  : (item.lastMessage ?? "");
          const archived = flagOf(item, "archivedBy");
          return (
            <SwipeSlot>
              <ReanimatedSwipeable
                ref={(instance) => {
                  if (instance) swipeRefs.current.set(item.id, instance);
                  else swipeRefs.current.delete(item.id);
                }}
                friction={2}
                rightThreshold={40}
                /* No overshoot: the two buttons are a fixed-width tray, and
                   letting the row drag past them exposes bare background
                   underneath the shadow. */
                overshootRight={false}
                renderRightActions={() => (
                  <SwipeTray>
                    <SwipeAction
                      tone="neutral"
                      onPress={() => setMenuFor(item)}
                      accessibilityLabel={t("chatListMore")}
                    >
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={20}
                        color="#ffffff"
                      />
                      <SwipeActionLabel>{t("chatListMore")}</SwipeActionLabel>
                    </SwipeAction>
                    <SwipeAction
                      tone="accent"
                      onPress={() =>
                        writeFlag(
                          item,
                          "archivedBy",
                          !archived,
                          "chatListArchive",
                        )
                      }
                      accessibilityLabel={
                        archived ? t("chatListUnarchive") : t("chatListArchive")
                      }
                    >
                      <Ionicons
                        name={archived ? "arrow-undo-outline" : "archive-outline"}
                        size={20}
                        color="#ffffff"
                      />
                      <SwipeActionLabel>
                        {archived
                          ? t("chatListUnarchive")
                          : t("chatListArchive")}
                      </SwipeActionLabel>
                    </SwipeAction>
                  </SwipeTray>
                )}
              >
            <Row
              onPress={() =>
                navigation.navigate("Chat", {
                  conversationId: item.id,
                  listingTitle: item.listingTitle,
                })
              }
            >
              {/* The listing this thread is about, with the person it is with on
                  the corner.
              
                  Both, rather than one: the row's title is the listing, so replacing
                  its photograph with a face would leave a marketplace inbox where
                  nothing shows what is being discussed. The avatar answers the other
                  question — who this is — which an initial was answering badly. */}
              <ThumbnailStack>
                {item.listingThumbnail ? (
                  <Thumbnail
                    source={{ uri: item.listingThumbnail }}
                    resizeMode="cover"
                  />
                ) : (
                  <ThumbnailFallback
                    colors={[EMERALD, GOLD]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <ThumbnailFallbackLabel>
                      {(item.listingTitle ?? "").trim().charAt(0).toUpperCase() ||
                        "?"}
                    </ThumbnailFallbackLabel>
                  </ThumbnailFallback>
                )}
                <CounterpartBadge>
                  <PublicAvatar
                    photoUrl={counterpartProfiles[otherUidOf(item)]?.photoUrl}
                    name={
                      item.participantNames?.[otherUidOf(item)] ??
                      counterpartProfiles[otherUidOf(item)]?.displayName
                    }
                    size={26}
                  />
                </CounterpartBadge>
              </ThumbnailStack>
              <RowBody>
                <RowTitle numberOfLines={1}>{item.listingTitle}</RowTitle>
                <RowMessage numberOfLines={1} unread={unread > 0}>
                  {previewText}
                </RowMessage>
              </RowBody>
              <RowMeta>
                <RowTime>
                  {formatTimestamp(item.lastMessageAt?.toDate?.(), language)}
                </RowTime>
                {unread > 0 ? (
                  <UnreadBadge>
                    <UnreadBadgeLabel>{unread}</UnreadBadgeLabel>
                  </UnreadBadge>
                ) : null}
              </RowMeta>
            </Row>
              </ReanimatedSwipeable>
            </SwipeSlot>
          );
        }}
      />

      {/* "More", rendered from the same Modal + sheet shape the chat screen
          already uses for a long-pressed message, so the two menus in the
          messaging flow look and behave like one another. */}
      <Modal
        visible={menuFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}
      >
        <SheetBackdrop onPress={() => setMenuFor(null)}>
          <ActionSheet onStartShouldSetResponder={() => true}>
            <SheetItem onPress={() => openContactInfo(menuFor)}>
              <Ionicons
                name="person-circle-outline"
                size={20}
                color={colors.text}
              />
              <SheetLabel>{t("chatListContactInfo")}</SheetLabel>
            </SheetItem>

            <SheetItem
              onPress={() => {
                const on = flagOf(menuFor, "favoritedBy");
                setMenuFor(null);
                writeFlag(menuFor, "favoritedBy", !on, "chatListFavorite");
              }}
            >
              <Ionicons
                name={
                  flagOf(menuFor, "favoritedBy") ? "star" : "star-outline"
                }
                size={20}
                color={colors.text}
              />
              <SheetLabel>
                {flagOf(menuFor, "favoritedBy")
                  ? t("chatListRemoveFavorite")
                  : t("chatListAddFavorite")}
              </SheetLabel>
            </SheetItem>

            <SheetItem
              onPress={() => {
                const on = flagOf(menuFor, "archivedBy");
                setMenuFor(null);
                writeFlag(menuFor, "archivedBy", !on, "chatListArchive");
              }}
            >
              <Ionicons
                name="archive-outline"
                size={20}
                color={colors.text}
              />
              <SheetLabel>
                {flagOf(menuFor, "archivedBy")
                  ? t("chatListUnarchive")
                  : t("chatListArchive")}
              </SheetLabel>
            </SheetItem>

            <SheetItem destructive onPress={() => toggleBlock(menuFor)}>
              <Ionicons name="ban-outline" size={20} color="#B3261E" />
              <SheetLabel destructive>
                {flagOf(menuFor, "blockedBy")
                  ? t("chatUnblockUser")
                  : t("chatBlockUser")}
              </SheetLabel>
            </SheetItem>

            <SheetCancel onPress={() => setMenuFor(null)}>
              <SheetCancelLabel>{t("cancel")}</SheetCancelLabel>
            </SheetCancel>
          </ActionSheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(TabSafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const SignInPrompt = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl}px;
  gap: ${spacing.md}px;
`;

const SignInPromptText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;

const SignInButton = styled(Pressable)`
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-horizontal: ${spacing.lg}px;
  padding-vertical: ${spacing.sm}px;
`;

const SignInButtonLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const Row = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px;
  ${shadow.card}
`;

// The row's bottom margin moved out here when the row gained a swipe tray
// behind it. Left on the row, the tray inherited the gap as extra height and
// stood a row's-worth taller than the card it belongs to.
const SwipeSlot = styled.View`
  margin-bottom: ${spacing.sm}px;
`;

const SwipeTray = styled.View`
  flex-direction: row;
  align-items: stretch;
  border-radius: ${radius.md}px;
  overflow: hidden;
  margin-left: ${spacing.xs}px;
`;

const SwipeAction = styled(Pressable)`
  width: 78px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background-color: ${(props) =>
    props.tone === "accent" ? EMERALD : props.theme.textMuted};
`;

const SwipeActionLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11px;
  color: #ffffff;
`;

const ArchiveBanner = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-vertical: ${spacing.sm}px;
  padding-horizontal: ${spacing.xs}px;
  margin-bottom: ${spacing.sm}px;
`;

const ArchiveBannerLabel = styled.Text`
  ${type.body}
  font-family: ${fontFamily.medium};
  color: ${(props) => props.theme.primary};
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const ActionSheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: ${radius.lg}px;
  border-top-right-radius: ${radius.lg}px;
  padding: ${spacing.sm}px;
`;

const SheetItem = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding-vertical: ${spacing.md}px;
  padding-horizontal: ${spacing.md}px;
`;

const SheetLabel = styled.Text`
  ${type.body}
  color: ${(props) => (props.destructive ? "#B3261E" : props.theme.text)};
`;

const SheetCancel = styled(Pressable)`
  align-items: center;
  padding-vertical: ${spacing.md}px;
  margin-top: ${spacing.xs}px;
`;

const SheetCancelLabel = styled.Text`
  ${type.body}
  font-family: ${fontFamily.medium};
  color: ${(props) => props.theme.textMuted};
`;

// The listing photograph with the counterpart's face on its corner. The
// stack is only as big as the thumbnail; the badge hangs off it, so the row's
// layout and its left gutter are unchanged.
const ThumbnailStack = styled.View`
  position: relative;
`;

const CounterpartBadge = styled.View`
  position: absolute;
  right: -5px;
  bottom: -3px;
  /* A ring in the row's own background, so the avatar reads as sitting ON
     the thumbnail rather than being clipped by it. */
  border-width: 2px;
  border-color: ${(props) => props.theme.surface};
  border-radius: 15px;
  overflow: hidden;
`;

const Thumbnail = styled.Image`
  width: 56px;
  height: 56px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

// Not every listing has an image: job postings and pharmacy entries never
// do, and any failed upload lands here too. `source={{ uri: null }}` still
// renders an Image, so those rows were drawing an empty grey square. The
// initial is deliberately taken from the listing title rather than the
// seller or company — the title is displayed immediately to the right, so
// the tile is a visual anchor rather than the thing identifying the row,
// and deriving it here fixes conversations that already exist instead of
// only ones created from now on.
const ThumbnailFallback = styled(LinearGradient)`
  width: 56px;
  height: 56px;
  border-radius: ${radius.sm}px;
  align-items: center;
  justify-content: center;
`;

const ThumbnailFallbackLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 22px;
  color: #ffffff;
`;

const RowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const RowTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const RowMessage = styled.Text`
  ${(props) => (props.unread ? type.bodyMedium : type.caption)}
  color: ${(props) => (props.unread ? props.theme.text : props.theme.textMuted)};
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

const UnreadBadge = styled.View`
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background-color: ${(props) => props.theme.primary};
  align-items: center;
  justify-content: center;
  padding-horizontal: 5px;
`;

const UnreadBadgeLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
  font-size: 11px;
`;

const EmptyMessage = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: ${spacing.xl}px;
`;
