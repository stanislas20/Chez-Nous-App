import { FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { ListingCard } from "../components/ListingCard";
import { useRecentlyViewed } from "../hooks/useRecentlyViewed";
import { useI18n } from "../i18n/I18nContext";

const listContentStyle = {
  paddingHorizontal: spacing.md,
  paddingTop: spacing.lg,
  paddingBottom: spacing.md,
};
const rowStyle = { justifyContent: "space-between" };

export function RecentlyViewedScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { listings, refresh } = useRecentlyViewed();

  // AsyncStorage isn't reactive — re-read every time this screen regains
  // focus so a listing viewed just now shows up on the way back here.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (listings !== null && listings.length === 0) {
    return (
      <Container edges={["left", "right", "bottom"]}>
        <EmptyState>
          <Ionicons name="time-outline" size={40} color={colors.textMuted} />
          <EmptyTitle>{t("recentlyViewedEmptyTitle")}</EmptyTitle>
          <EmptySubtitle>{t("recentlyViewedEmptySubtitle")}</EmptySubtitle>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container edges={["left", "right", "bottom"]}>
      <FlatList
        data={listings ?? []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={rowStyle}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <ListingCard listing={item} />}
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

const EmptyTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.md}px;
  text-align: center;
`;

const EmptySubtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
  text-align: center;
`;
