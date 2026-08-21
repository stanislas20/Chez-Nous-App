import { FlatList } from "react-native";
import { Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/I18nContext";
import { useFollowList } from "../hooks/useFollowList";

// Who follows this person, or who they follow.
//
// Each row opens that person's profile, which is what makes the list useful
// rather than decorative: from here you can follow back, or rate someone
// you have already dealt with.
export function FollowListScreen({ route, navigation }) {
  const { uid, kind } = route.params;
  const { colors } = useTheme();
  const { t } = useI18n();
  const rows = useFollowList(uid, kind);

  return (
    <Container edges={["left", "right", "bottom"]}>
      <FlatList
        data={rows ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          // null while loading, so the empty state never flashes before the
          // first snapshot arrives.
          rows === null ? null : (
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
        renderItem={({ item }) => (
          <Row
            onPress={() =>
              navigation.navigate("SellerProfile", {
                sellerId: item.uid,
                sellerName: item.name ?? t("chatUnknownParticipant"),
              })
            }
          >
            <Avatar>
              <AvatarLabel>
                {(item.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
              </AvatarLabel>
            </Avatar>
            <RowName numberOfLines={1}>
              {item.name ?? t("chatUnknownParticipant")}
            </RowName>
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

const Avatar = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 19px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primary};
`;

const AvatarLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.textInverse};
`;

const RowName = styled.Text`
  flex: 1;
  min-width: 0px;
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
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
