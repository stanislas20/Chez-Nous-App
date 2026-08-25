import { FlatList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { useConversations } from "../hooks/useConversations";
import { openAccountGate } from "../utils/openAccountGate";

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

  if (!user) {
    return (
      <Container edges={["left", "right", "bottom"]}>
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
    <Container edges={["left", "right", "bottom"]}>
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
          const previewText =
            item.lastMessageType === "image"
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

const Container = styled(SafeAreaView)`
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
