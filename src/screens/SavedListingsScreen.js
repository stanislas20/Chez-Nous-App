import { useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { ListingCard } from "../components/ListingCard";
import { mockListings } from "../data/mockListings";
import { useListingsByIds } from "../hooks/useListingsByIds";
import { useFavorites } from "../hooks/useFavorites";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";

// Two pixels, so the grid runs to the edges and the photographs get the
// width — the Marketplace layout, matching Local and Pour vous. Everything
// else in these lists (headers, empty states) carries its own padding
// already, so only the cards move.
const listContentStyle = {
  paddingHorizontal: 2,
  paddingTop: spacing.lg,
  paddingBottom: spacing.md,
};
const rowStyle = { justifyContent: "space-between" };
// Stable identity, so it can't retrigger work in dependent hooks.
const EMPTY_LISTINGS = [];

export function SavedListingsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const { favoriteIds } = useFavorites(user?.uid);
  // The favourites are already a list of ids, so those are the documents to
  // read. This screen used to download every approved listing in the database
  // and keep the handful whose id was in that set — the cost of opening it
  // was the size of the catalogue rather than the size of the reader's own
  // saved list.
  const savedIds = useMemo(() => [...favoriteIds], [favoriteIds]);
  const { listings: fetched, status: listingsStatus } =
    useListingsByIds(savedIds);
  // Sample listings only stand in for a missing backend on a developer's
  // machine. On a failed query this stays empty and the screen says why —
  // "you have nothing saved" is a different, and wrong, statement.
  const savedListings =
    fetched ??
    (listingsStatus === "unconfigured"
      ? mockListings.filter((listing) => favoriteIds.has(listing.id))
      : EMPTY_LISTINGS);

  if (!user) {
    return (
      <Container edges={["left", "right", "bottom"]}>
        <EmptyState>
          <Ionicons name="heart-outline" size={40} color={colors.textMuted} />
          <EmptyTitle>{t("favoritesSignInTitle")}</EmptyTitle>
          <EmptySubtitle>{t("favoritesSignInMessage")}</EmptySubtitle>
        </EmptyState>
      </Container>
    );
  }

  if (savedListings.length === 0) {
    // A failed query and an empty favourites list look identical from here,
    // so say which one it is rather than telling someone with saved items
    // that they have none.
    const unavailable = listingsStatus === "error";
    return (
      <Container edges={["left", "right", "bottom"]}>
        <EmptyState>
          <Ionicons
            name={unavailable ? "cloud-offline-outline" : "heart-outline"}
            size={40}
            color={unavailable ? colors.error : colors.textMuted}
          />
          <EmptyTitle>
            {unavailable ? t("listingsUnavailableTitle") : t("savedEmptyTitle")}
          </EmptyTitle>
          <EmptySubtitle>
            {unavailable ? t("listingsUnavailable") : t("savedEmptySubtitle")}
          </EmptySubtitle>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container edges={["left", "right", "bottom"]}>
      <FlatList
        data={savedListings}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={rowStyle}
        contentContainerStyle={listContentStyle}
        // Virtualization budget. The defaults keep about ten screens of
        // rows mounted, and each row here is two photographs — a decoded
        // 600px bitmap is roughly 1.4 MB, so the default is tens of
        // megabytes of images held for scrolling nobody has done yet.
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <ListingCard listing={item} flush />}
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
