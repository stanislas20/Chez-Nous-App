import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/I18nContext";
import { useFollowList } from "../hooks/useFollowList";
import { usePublicProfiles } from "../hooks/usePublicProfiles";
import { PublicAvatar } from "../components/PublicAvatar";

// The same circle the inbox, the chat header and every review already draw.
const AVATAR_SIZE = 38;

// Who follows this person, or who they follow.
//
// Each row opens that person's profile, which is what makes the list useful
// rather than decorative: from here you can follow back, or rate someone you
// have already dealt with.
//
// The faces come from sellerStats, the public projection that exists for
// exactly this — `allow read: if true`, carrying displayName and photoUrl and
// nothing else. The private sellers/{uid} document is never touched, which is
// what keeps RCCM, IFU and the representative's ID off the wire.
export function FollowListScreen({ route, navigation }) {
  const { uid, kind } = route.params;
  const { colors } = useTheme();
  const { t } = useI18n();
  const { rows, loadingMore, loadMore } = useFollowList(uid, kind);

  // Only the people actually on screen. Memoised on the row identities so a
  // re-render for any other reason does not look like a new set of ids.
  const uids = useMemo(() => (rows ?? []).map((row) => row.uid), [rows]);
  const profiles = usePublicProfiles(uids);

  // The live public name wins over the one stamped into the follow row when
  // it was created: somebody who has since corrected their name shows the
  // correction, and rows written before names were denormalised still read
  // as a person rather than as a placeholder.
  const nameFor = (item) =>
    profiles[item.uid]?.displayName ??
    item.name ??
    t("chatUnknownParticipant");

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
          // Loading and empty are different answers and must not be mistaken
          // for one another: rows is null until the first page lands, so the
          // empty state never flashes on the way in.
          rows === null ? (
            <Loading>
              <ActivityIndicator color={colors.primary} />
            </Loading>
          ) : (
            <Empty>
              <EmptyText>
                {t(
                  kind === "followers"
                    ? "followListEmptyFollowers"
                    : "followListEmptyFollowing",
                )}
              </EmptyText>
            </Empty>
          )
        }
        ListFooterComponent={
          // Under the rows, never in place of them. A page that fails leaves
          // everything already loaded exactly where it was.
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
