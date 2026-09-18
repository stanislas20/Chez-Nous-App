import { FlatList, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
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

  return (
    <Container edges={["left", "right"]}>
      <FlatList
        data={conversations ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
          conversations !== null ? (
            <EmptyMessage>{t("chatListEmptyMessage")}</EmptyMessage>
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
          return (
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
          );
        }}
      />
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
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
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
