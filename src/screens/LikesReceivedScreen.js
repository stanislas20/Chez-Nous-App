import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/I18nContext";
import { useProfileLikesReceived } from "../hooks/useProfileLikesReceived";
import { usePublicProfiles } from "../hooks/usePublicProfiles";
import { PublicAvatar } from "../components/PublicAvatar";

// The same circle the inbox, the chat header, reviews and the follower list
// already draw.
const AVATAR_SIZE = 38;

// Who has liked your profile.
//
// Profile likes only. There is deliberately no "Listings" tab beside it:
// the heart on a listing writes `favorites`, which firestore.rules makes
// readable by its author alone, and somebody who saved a listing was told
// they were bookmarking it. Putting the two behind one heading would teach
// the opposite — that a private save is part of a public social system —
// and the names are not ours to show.
//
// Owner-only. The hook takes the uid from auth rather than from a route
// param, and the rules enforce the same thing from the other side.
export function LikesReceivedScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { rows, loadingMore, loadMore } = useProfileLikesReceived();

  const uids = useMemo(() => (rows ?? []).map((row) => row.uid), [rows]);
  const profiles = usePublicProfiles(uids);

  // The live public name, then the neutral placeholder. Nothing is stamped
  // onto the relationship: a brand-new collection has no rows predating the
  // projection, so a copied name could only ever go stale.
  const nameFor = (item) =>
    profiles[item.uid]?.displayName ?? t("chatUnknownParticipant");

  const whenFor = (item) =>
    item.createdAtMs
      ? new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", {
          day: "numeric",
          month: "short",
        }).format(new Date(item.createdAtMs))
      : "";

  return (
    <Container edges={["left", "right", "bottom"]}>
      <FlatList
        data={rows ?? []}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={{ padding: spacing.md }}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          // Loading and empty are different answers: rows is null until the
          // first page lands, so the empty state never flashes on the way in.
          rows === null ? (
            <Loading>
              <ActivityIndicator color={colors.primary} />
            </Loading>
          ) : (
            <Empty>
              <EmptyText>{t("likesReceivedEmpty")}</EmptyText>
            </Empty>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <Footer>
              <ActivityIndicator color={colors.primary} />
            </Footer>
          ) : null
        }
        renderItem={({ item }) => (
          <Row
            onPress={() =>
              navigation.navigate("SellerProfile", {
                sellerId: item.uid,
                sellerName: nameFor(item),
              })
            }
          >
            <PublicAvatar
              photoUrl={profiles[item.uid]?.photoUrl}
              name={nameFor(item)}
              size={AVATAR_SIZE}
            />
            <RowName numberOfLines={1}>{nameFor(item)}</RowName>
            <RowWhen>{whenFor(item)}</RowWhen>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </Row>
        )}
      />
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Row = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 12px;
  margin-bottom: ${spacing.sm}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const RowName = styled.Text`
  flex: 1;
  min-width: 0px;
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const RowWhen = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const Loading = styled.View`
  align-items: center;
  padding: ${spacing.xl}px ${spacing.lg}px;
`;

const Footer = styled.View`
  align-items: center;
  padding: ${spacing.md}px;
`;

const Empty = styled.View`
  align-items: center;
  padding: ${spacing.xl}px ${spacing.lg}px;
`;

const EmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;
