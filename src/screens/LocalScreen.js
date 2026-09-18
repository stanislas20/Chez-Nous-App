import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { SearchBar } from "../components/SearchBar";
import { RailChip } from "../components/RailChip";
import { BeninFlag } from "../components/BeninFlag";
import { SectionHeading } from "../components/SectionHeading";
import { Tappable } from "../components/Tappable";
import { ListingCard } from "../components/ListingCard";
import { ScreenFooter } from "../components/ScreenFooter";
import { mockListings } from "../data/mockListings";
import { cities } from "../data/cities";
import { cityCoordinates } from "../data/cityCoordinates";
import { nearestKnownCity } from "../utils/nearestCity";
import {
  categories,
  DIRECTORY_CATEGORIES,
  MARKETPLACE_FEED_CATEGORIES,
} from "../data/categories";
import { listingSearchParts } from "../data/customCategories";
import { LinearGradient } from "expo-linear-gradient";
import { useListingsQuery } from "../hooks/useListingsQuery";
import {
  useDebouncedValue,
  useListingsSearch,
} from "../hooks/useListingsSearch";
import { getDutyLabel } from "../utils/pharmacyDuty";
import {
  getCuisineGradient,
  getCuisineLabel,
} from "../data/restaurantCuisines";
import { openListing } from "../utils/openListing";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useAuth } from "../auth/AuthContext";
import { useFavorites } from "../hooks/useFavorites";
import { distanceInKm } from "../utils/geo";
import { queryMatches } from "../utils/search";
import { useI18n } from "../i18n/I18nContext";
import { smallImageUri } from "../utils/listingImage";
import { TabSafeAreaView } from "../components/TabSafeAreaView";
import { useBannerStatusBar } from "../hooks/useBannerStatusBar";
import { SearchResultNote } from "../components/SearchResultNote";

const EMERALD = "#0B6E4F";
// Module-level so its identity is stable across renders — it feeds useMemo
// dependency arrays, and a fresh [] each render would rebuild every derived
// list every time.
const EMPTY_LISTINGS = [];
const DISTANCE_STEPS_KM = [5, 10, 25, 50];
const LOCAL_CATEGORIES = categories.filter(
  (category) => category.key !== "pharmacyOnDuty",
);

// The grid runs closer to the edges than the rest of the screen so the
// photographs get that width. The header blocks above it — the pharmacy
// card, the restaurant strip, the rails — keep their own padding, since
// edge-to-edge prose reads as a layout mistake rather than a decision, so
// each of those keeps or regains its own horizontal margin below.
const listContentStyle = {
  paddingHorizontal: 2,
  paddingTop: spacing.md,
  paddingBottom: spacing.md,
};

const rowStyle = { justifyContent: "space-between" };
// Padded independently now that the list itself is not. `headerBlockStyle`
// is the same 14, which with the list's 2 comes back to the app's 16.
const categoryRailStyle = {
  gap: spacing.xs,
  paddingLeft: spacing.md - 2,
  paddingRight: spacing.md,
};

// SectionList has no numColumns — the prop simply does not exist on it — so
// the two-per-row grid is built by hand: each section's listings are cut
// into pairs and one pair is rendered per row.
//
// A trailing odd card needs no filler. ListingCard is 49.6% wide here — the
// `flush` variant; the 47% this comment used to quote is the rounded one the
// screen stopped using — and the row is space-between, so a lone card sits on
// the left at its own width, which is exactly what FlatList's
// columnWrapperStyle did with an odd last row.
const GRID_COLUMNS = 2;

// How much of a category is shown before it defers to the next one.
//
// Grouping alone was not enough. Sections are wildly uneven — one category
// with forty listings and the next with one — so the biggest category buried
// every category under it, and a reader scrolling for furniture gave up
// somewhere in the middle of vehicles. Three rows is enough to see what a
// category holds and short enough that the one below it is still on screen.
//
// Only while browsing everything. Choosing a category means the reader has
// asked for that one, and a cap there would be hiding what they just asked
// to see, so the drill-in is uncapped.
const SECTION_PREVIEW_ROWS = 3;

function chunkIntoRows(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += GRID_COLUMNS) {
    rows.push(items.slice(index, index + GRID_COLUMNS));
  }
  return rows;
}
const sheetScrollContentStyle = { paddingHorizontal: spacing.md };

export function LocalScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  useBannerStatusBar();
  const { colors } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const { user } = useAuth();
  const { favoriteIds, toggleFavorite: toggleFavoriteRemote } = useFavorites(
    user?.uid,
  );
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [priceSort, setPriceSort] = useState(null); // null | 'asc' | 'desc'
  const [query, setQuery] = useState("");
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const {
    status: locationStatus,
    coords: userCoords,
    requestLocation,
  } = useCurrentLocation({ enabled: false });

  // Somebody's fix landing outside every city we know. Unlike the posting
  // form, this screen's location is opt-in — they pressed a button — so the
  // failure has to be said rather than passed over in silence.
  const [locationOutOfRange, setLocationOutOfRange] = useState(false);

  // Once a GPS fix comes back, snap the location filter to whichever known
  // city is closest — same helper the posting form uses, including its
  // refusal to answer when the nearest is implausibly far.
  useEffect(() => {
    if (!userCoords) return;
    const nearest = nearestKnownCity(userCoords);
    if (!nearest) {
      // A default simulator fix in California is 12 000 km from the closest
      // Bénin city. Filtering the screen to it would be worse than useless.
      setLocationOutOfRange(true);
      return;
    }
    setLocationOutOfRange(false);
    setSelectedCity(nearest.city);
    setLocationSheetOpen(false);
    if (distanceKm == null) {
      setDistanceKm(DISTANCE_STEPS_KM[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCoords]);

  const toggleFavorite = (id) => {
    if (!user) {
      Alert.alert(t("favoritesSignInTitle"), t("favoritesSignInMessage"));
      return;
    }
    toggleFavoriteRemote(id);
  };

  // The pull refetches the first page and, if a fix was already granted,
  // the location backing the distance filter.
  //
  // This used to be a gesture with nothing behind it: the listings were a
  // live subscription, so the pull only ever refreshed the GPS and waited
  // half a second so the spinner did not flash. Now that the feed is a
  // bounded page there is something real to ask for, and the artificial
  // delay is gone with it.
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshListings(),
        locationStatus === "granted" ? requestLocation() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDistanceChipPress = () => {
    if (locationStatus !== "granted") {
      requestLocation();
      return;
    }
    const currentIndex = DISTANCE_STEPS_KM.indexOf(distanceKm);
    const next =
      currentIndex === -1
        ? DISTANCE_STEPS_KM[0]
        : (DISTANCE_STEPS_KM[currentIndex + 1] ?? null);
    setDistanceKm(next);
  };

  // A bounded, city-scoped page instead of the whole catalogue.
  //
  // The city filter is the one this screen is built around, and it is an
  // equality on an indexed field — so it belongs in the query rather than in
  // the useMemo below, which used to run it over every approved listing in
  // the database. When no city is chosen the query is unfiltered and simply
  // paginated; the JavaScript filter stays for the case where a page arrives
  // before the city selection has propagated, and costs nothing when the
  // query already did the work.
  //
  // Distance, price sort and free text stay client-side: the first is an
  // inequality Firestore would make dictate the sort order, and the other
  // two have no index that could serve them.
  const {
    listings: liveListings,
    status: listingsStatus,
    hasMore: hasMoreListings,
    isLoadingMore: loadingMoreListings,
    loadMore: loadMoreListings,
    refresh: refreshListings,
  } = useListingsQuery({
    // Directories are excluded server-side. Filtering them out of a page
    // already fetched is what emptied this screen on "All cities": the
    // pharmacy roster is 200 of 209 approved listings and carries a fresh
    // createdAt every week, so the 60 newest were all pharmacies and every
    // one was thrown away below. With a city chosen the page narrowed enough
    // to survive, which is why this looked like it worked and only failed
    // in the default state.
    filters: [
      { field: "categoryKey", op: "in", value: MARKETPLACE_FEED_CATEGORIES },
      ...(selectedCity ? [{ field: "city", value: selectedCity }] : []),
    ],
    pageSize: 60,
  });

  // Search asks Firestore rather than filtering the page.
  //
  // Phase C measured what the alternative costs: a listing at position 2,321
  // of 2,408 — approved, live, matching exactly — could not be found here,
  // because this screen filtered an array bounded at 60. To a buyer that is
  // indistinguishable from "there isn't one".
  //
  // Debounced, so a two-word search costs one query rather than fourteen.
  // The city filter travels with it, so searching inside a chosen city stays
  // a search inside that city.
  const debouncedQuery = useDebouncedValue(query);
  const searchFilters = useMemo(
    () => (selectedCity ? [{ field: "city", value: selectedCity }] : []),
    [selectedCity],
  );
  const {
    results: searchResults,
    status: searchStatus,
    isSearching,
    failed: searchFailed,
    total: searchTotal,
    complete: searchComplete,
    totalIsExact: searchTotalIsExact,
  } = useListingsSearch(debouncedQuery, { filters: searchFilters });
  const isSearchMode = searchStatus !== "idle";

  // Sample listings are for a machine with no Firebase env — a developer
  // building the app — never a stand-in for a query that failed. See the
  // status doc in useApprovedListings.js: fiction shown during an outage
  // sends a buyer chasing a seller who doesn't exist.
  const listingsUnavailable = listingsStatus === "error";
  const listingSource =
    liveListings ??
    (listingsStatus === "unconfigured" ? mockListings : EMPTY_LISTINGS);
  // Directories and job posts each have their own screen and none of them
  // carries a price, so none belongs in a grid of things for sale. Only
  // pharmacies were excluded here, which meant a job and (once the category
  // existed) a restaurant both rendered as goods cards asking "0 FCFA" —
  // the same leak that was fixed on the home feed.
  const listings = listingSource.filter(
    (listing) => !DIRECTORY_CATEGORIES.includes(listing.categoryKey),
  );

  // The two directories with real (or soon-real) data behind them. Banks and
  // tourism are still fixed sample lists, so they stay in Menu rather than
  // being given prime space here to look busy.
  const allForDirectories = listingSource;

  const nearestPharmacy = useMemo(() => {
    if (!userCoords) return null;
    let closest = null;
    let closestDistance = Infinity;
    for (const listing of allForDirectories) {
      if (listing.categoryKey !== "pharmacyOnDuty" || listing.isPermanentDuty)
        continue;
      const cityCoord = cityCoordinates[listing.city];
      if (!cityCoord) continue;
      const distance = distanceInKm(userCoords, cityCoord);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = listing;
      }
    }
    return closest ? { listing: closest, distance: closestDistance } : null;
  }, [allForDirectories, userCoords]);

  // Real restaurant listings only — no sample fallback here. A strip padded
  // with placeholders on the main Local tab would be the "Missions rapides"
  // mistake again: a section that looks populated and leads nowhere.
  const nearbyRestaurants = useMemo(() => {
    const list = (liveListings ?? [])
      .filter((listing) => listing.categoryKey === "restaurants")
      .map((listing) => {
        const cityCoord = cityCoordinates[listing.city];
        return {
          ...listing,
          distanceKm:
            userCoords && cityCoord
              ? distanceInKm(userCoords, cityCoord)
              : null,
        };
      });
    return list
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .slice(0, 8);
  }, [liveListings, userCoords]);

  // Everything except the category filter.
  //
  // Split out so the category rail can count what each category WOULD show.
  // Counting off filteredListings instead would collapse the rail to a
  // single chip the moment a category was chosen — every other category
  // reading zero — and there would be no way back to the others without
  // opening the filter sheet.
  const listingsBeforeCategory = useMemo(() => {
    // While searching, the rows come from Firestore rather than from the
    // loaded page. The filters below still run: the query applied the city,
    // and distance and price sort have no index that could serve them.
    let result = isSearchMode ? (searchResults ?? []) : listings;

    if (selectedCity) {
      result = result.filter((listing) => listing.city === selectedCity);
    }
    if (distanceKm != null && userCoords) {
      result = result.filter((listing) => {
        const cityCoord = cityCoordinates[listing.city];
        if (!cityCoord) return false;
        return distanceInKm(userCoords, cityCoord) <= distanceKm;
      });
    }
    if (!isSearchMode && query.trim().length > 0) {
      result = result.filter((listing) => {
        const title = language === "en" ? listing.titleEn : listing.titleFr;
        return queryMatches(
          query,
          title,
          listing.city,
          ...listingSearchParts(listing),
        );
      });
    }
    if (priceSort) {
      result = [...result].sort((a, b) =>
        priceSort === "asc" ? a.price - b.price : b.price - a.price,
      );
    }
    return result;
  }, [
    listings,
    isSearchMode,
    searchResults,
    selectedCity,
    distanceKm,
    userCoords,
    query,
    priceSort,
    language,
  ]);

  const filteredListings = useMemo(
    () =>
      selectedCategoryKey
        ? listingsBeforeCategory.filter(
            (listing) => listing.categoryKey === selectedCategoryKey,
          )
        : listingsBeforeCategory,
    [listingsBeforeCategory, selectedCategoryKey],
  );

  // What the rail offers: only categories with something in them, in
  // categories.js order, each carrying its own count. A chip that leads to
  // an empty screen is worse than no chip.
  const categoryRail = useMemo(() => {
    const counts = new Map();
    for (const listing of listingsBeforeCategory) {
      const key = listing.categoryKey ?? "other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return LOCAL_CATEGORIES.filter((category) => counts.has(category.key)).map(
      (category) => ({
        key: category.key,
        icon: category.icon,
        label: language === "en" ? category.labelEn : category.labelFr,
        count: counts.get(category.key),
      }),
    );
  }, [listingsBeforeCategory, language]);

  // Grouped by category rather than poured into one grid.
  //
  // Everything approved landed in a single stream ordered by whatever
  // Firestore returned, so a fridge sat between two building plots and a
  // haircut. The filter chips could narrow it to one category, but that
  // asks the reader to already know what they want — the point of a market
  // is to see what is in it.
  //
  // Ordered by categories.js, not by size or by arrival, so the sections
  // come in the same order as the filter chips above them. A category with
  // nothing in it is dropped rather than shown empty.
  //
  // The chips still work and are not redundant: picking one leaves exactly
  // one section standing, which is the old behaviour with a heading on it.
  const listingSections = useMemo(() => {
    const byCategory = new Map();
    for (const listing of filteredListings) {
      const key = listing.categoryKey ?? "other";
      const bucket = byCategory.get(key);
      if (bucket) bucket.push(listing);
      else byCategory.set(key, [listing]);
    }

    const label = (category) =>
      language === "en" ? category.labelEn : category.labelFr;

    // Capped while browsing everything, whole once a category is chosen.
    const build = (key, title, items) => {
      const rows = chunkIntoRows(items);
      const capped = selectedCategoryKey ? rows : rows.slice(0, SECTION_PREVIEW_ROWS);
      return {
        key,
        title,
        total: items.length,
        hidden: items.length - capped.flat().length,
        data: capped,
      };
    };

    const known = LOCAL_CATEGORIES.filter((category) =>
      byCategory.has(category.key),
    ).map((category) =>
      build(category.key, label(category), byCategory.get(category.key)),
    );

    // A categoryKey with no row in categories.js still has listings behind
    // it, and dropping them would make them unreachable from this screen
    // with nothing to say so. They go last, under their own raw key.
    const accountedFor = new Set(known.map((section) => section.key));
    const orphans = [...byCategory.keys()]
      .filter((key) => !accountedFor.has(key))
      .map((key) => build(key, key, byCategory.get(key)));

    return [...known, ...orphans];
  }, [filteredListings, language, selectedCategoryKey]);

  const filteredCities = cities.filter((city) =>
    city.toLowerCase().includes(citySearch.trim().toLowerCase()),
  );

  const activeFilterCount =
    (selectedCity ? 1 : 0) +
    (selectedCategoryKey ? 1 : 0) +
    (distanceKm != null ? 1 : 0) +
    (priceSort ? 1 : 0);

  const clearFilters = () => {
    setSelectedCity(null);
    setSelectedCategoryKey(null);
    setDistanceKm(null);
    setPriceSort(null);
  };

  const selectedCategory =
    LOCAL_CATEGORIES.find((category) => category.key === selectedCategoryKey) ??
    null;
  const locationLabel = selectedCity
    ? t("localLocationLabel", { city: selectedCity })
    : t("localAllCities");

  return (
    <Container edges={["left", "right"]}>
      {/* See ForYouScreen: the banner owns the status bar strip, so the
          SafeAreaView must not also pay for it in white. */}
      <Header style={{ paddingTop: insets.top + spacing.lg }}>
        {/* Depth, not decoration for its own sake: a flat gradient this
            large reads as a coloured rectangle, and two very faint discs
            catching the light off the top-right corner give it a surface.
            They sit behind everything and are clipped by the banner's own
            rounded corners. */}
        <HeaderGlowLarge pointerEvents="none" />
        <HeaderGlowSmall pointerEvents="none" />
        <HeaderRow>
          <TitleGroup>
            <ScreenTitle>{t("localTitle")}</ScreenTitle>
            {/* Drawn rather than shipped as an image: three rectangles is
                less than a PNG costs, and it stays sharp at any density.
                Proportions are the real ones — 3:2 overall, the green hoist
                band two fifths of the length — because a national flag
                drawn approximately is worse than no flag. */}
            <BeninFlag width={42} />
          </TitleGroup>
          <LangPill
            onPress={() => setLanguage(language === "en" ? "fr" : "en")}
          >
            <LangPillLabel>{language === "en" ? "FR" : "EN"}</LangPillLabel>
          </LangPill>
        </HeaderRow>

        <LocationRow onPress={() => setLocationSheetOpen(true)}>
          <RowIconSlot>
            <Ionicons name="location" size={16} color="#ffffff" />
          </RowIconSlot>
          <LocationLabel numberOfLines={1}>{locationLabel}</LocationLabel>
          <Ionicons
            name="chevron-down"
            size={14}
            color="rgba(255, 255, 255, 0.7)"
          />
        </LocationRow>
        <SearchBarWrap>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            /* "Rechercher près de Toutes les villes" — near All cities —
               is not a sentence. The placeholder names a place only when
               there is a place to name; with no city chosen it asks the
               plain question. */
            onDark
            placeholder={
              selectedCity
                ? t("localSearchPlaceholder", { city: selectedCity })
                : t("localSearchPlaceholderAll")
            }
          />
        </SearchBarWrap>

        <ChipRow>
          <Chip selected={distanceKm != null} onPress={handleDistanceChipPress}>
            {locationStatus === "locating" ? (
              <ActivityIndicator
                size="small"
                color={distanceKm != null ? EMERALD : "#ffffff"}
              />
            ) : (
              <ChipLabel selected={distanceKm != null}>
                {distanceKm != null
                  ? `${distanceKm} km`
                  : t("localFilterDistanceLabel")}
              </ChipLabel>
            )}
          </Chip>

          <Chip
            selected={!!selectedCategoryKey}
            onPress={() => setCategorySheetOpen(true)}
          >
            <ChipLabel selected={!!selectedCategoryKey}>
              {selectedCategory
                ? language === "en"
                  ? selectedCategory.labelEn
                  : selectedCategory.labelFr
                : t("localFilterCategoryLabel")}
            </ChipLabel>
            <Ionicons
              name="chevron-down"
              size={12}
              color={
                selectedCategoryKey ? EMERALD : "rgba(255, 255, 255, 0.75)"
              }
            />
          </Chip>

          <Chip
            selected={!!priceSort}
            onPress={() =>
              setPriceSort(
                priceSort === null
                  ? "asc"
                  : priceSort === "asc"
                    ? "desc"
                    : null,
              )
            }
          >
            <ChipLabel selected={!!priceSort}>
              {priceSort === "asc"
                ? t("localFilterPriceAsc")
                : priceSort === "desc"
                  ? t("localFilterPriceDesc")
                  : t("localFilterPriceLabel")}
            </ChipLabel>
          </Chip>

          {activeFilterCount > 0 ? (
            <ClearChip onPress={clearFilters}>
              <Ionicons name="close" size={13} color="#ffffff" />
              <ChipLabel>{t("localFilterClear")}</ChipLabel>
            </ClearChip>
          ) : null}
        </ChipRow>

        {locationStatus === "denied" ||
        locationStatus === "error" ||
        locationOutOfRange ? (
          <LocationHintText>
            {locationStatus === "denied"
              ? t("nearestPharmacyPermissionDenied")
              : locationOutOfRange
                ? t("locationOutOfRange")
                : t("nearestPharmacyUnavailable")}
          </LocationHintText>
        ) : null}
      </Header>

      <SectionList
        sections={listingSections}
        stickySectionHeadersEnabled
        // Load-more. The threshold is half a screen rather than the default,
        // because these rows are two cards wide and tall: by the time the
        // last one is on screen the next page has usually landed.
        // Virtualization budget. The defaults keep about ten screens of
        // rows mounted, and each row here is two photographs — a decoded
        // 600px bitmap is roughly 1.4 MB, so the default is tens of
        // megabytes of images held for scrolling nobody has done yet.
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        onEndReached={loadMoreListings}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            {isSearchMode ? (
              <SearchResultNote
                shown={searchResults?.length ?? 0}
                total={searchTotal}
                complete={searchComplete}
                totalIsExact={searchTotalIsExact}
              />
            ) : null}
            {/* First thing in the list, because when the query is down every
                section below it is empty — and an unexplained empty
                marketplace reads as "nothing is for sale" rather than "we
                couldn't load it". Pull-to-refresh is already on this list,
                so the notice names the gesture that retries. */}
            {listingsUnavailable ? (
              <ListingsErrorNote>
                <Ionicons
                  name="cloud-offline-outline"
                  size={16}
                  color={colors.error}
                />
                <ListingsErrorLabel>
                  {t("listingsUnavailable")}
                </ListingsErrorLabel>
              </ListingsErrorNote>
            ) : null}

            {/* Places first: what's physically around you is the reason to
                open this tab, and all of it used to be buried in Menu. */}
            {nearestPharmacy ? (
              <PlaceCard
                onPress={() =>
                  openListing(navigation, nearestPharmacy.listing, t, language)
                }
              >
                <PlaceIcon tint="rgba(214, 69, 90, 0.14)">
                  <Ionicons name="medkit-outline" size={20} color="#D6455A" />
                </PlaceIcon>
                <PlaceBody>
                  <PlaceKicker>{t("localPharmacyKicker")}</PlaceKicker>
                  <PlaceName numberOfLines={1}>
                    {language === "en"
                      ? nearestPharmacy.listing.titleEn
                      : nearestPharmacy.listing.titleFr}
                  </PlaceName>
                  <PlaceMeta numberOfLines={1}>
                    {getDutyLabel(nearestPharmacy.listing, language, t)?.text ??
                      nearestPharmacy.listing.city}
                    {" · "}
                    {nearestPharmacy.distance.toFixed(1).replace(".", ",")} km
                  </PlaceMeta>
                </PlaceBody>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textMuted}
                />
              </PlaceCard>
            ) : null}

            {/* "Voir toutes" only when there is a strip to see the rest
                of. With none published the card below is itself the way
                into the directory — it says so and carries the chevron —
                and two links to the same screen, a thumb apart, is one
                link too many. */}
            <SectionHeadingWrap>
              <SectionHeading
                label={t("localRestaurantsSectionTitle")}
                action={
                  nearbyRestaurants.length ? (
                    <SeeAllLink
                      onPress={() => navigation.navigate("Restaurants")}
                    >
                      {t("dashboardSeeAll")}
                    </SeeAllLink>
                  ) : null
                }
              />
            </SectionHeadingWrap>

            {nearbyRestaurants.length ? (
              <RestoStrip horizontal showsHorizontalScrollIndicator={false}>
                {nearbyRestaurants.map((item) => (
                  <RestoMini
                    key={item.id}
                    onPress={() => openListing(navigation, item, t, language)}
                  >
                    {item.mediaUrl ? (
                      <RestoMiniPhotoWrap>
                        <RestoMiniPhoto
                          source={{ uri: smallImageUri(item) }}
                          resizeMode="contain"
                        />
                      </RestoMiniPhotoWrap>
                    ) : (
                      <RestoMiniThumb
                        colors={getCuisineGradient(item.cuisine)}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <Ionicons name="restaurant" size={20} color="#ffffff" />
                      </RestoMiniThumb>
                    )}
                    <RestoMiniName numberOfLines={1}>
                      {language === "en" ? item.titleEn : item.titleFr}
                    </RestoMiniName>
                    <RestoMiniMeta numberOfLines={1}>
                      {getCuisineLabel(item.cuisine, language)}
                      {item.distanceKm != null
                        ? ` · ${item.distanceKm.toFixed(1).replace(".", ",")} km`
                        : ""}
                    </RestoMiniMeta>
                  </RestoMini>
                ))}
              </RestoStrip>
            ) : (
              /* Nothing published yet, so this points at the directory
                 rather than filling the strip with invented places. */
              <PlaceCard onPress={() => navigation.navigate("Restaurants")}>
                <PlaceIcon tint="rgba(210, 96, 58, 0.14)">
                  <Ionicons
                    name="restaurant-outline"
                    size={20}
                    color="#D2603A"
                  />
                </PlaceIcon>
                <PlaceBody>
                  <PlaceName>{t("localRestaurantsEmptyTitle")}</PlaceName>
                  <PlaceMeta>{t("localRestaurantsEmptyCopy")}</PlaceMeta>
                </PlaceBody>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textMuted}
                />
              </PlaceCard>
            )}

            <SectionHeadingWrap>
              <SectionHeading
                label={t("localNearbySectionTitle")}
                meta={
                  filteredListings.length
                    ? t("listingCountShort", { count: filteredListings.length })
                    : null
                }
              />
            </SectionHeadingWrap>

            {/* Choosing a category was three taps into a modal — open the
                filter sheet, tap Catégorie, tap the row — for the single
                most common thing anybody does on this screen. The rail puts
                the same choice in reach, and now that the list is grouped it
                doubles as the map of what is actually in the market.

                Tapping the active chip clears it, so the way back to
                everything is the chip you just pressed rather than a trip
                back into the sheet. */}
            {/* Also shown when a category is active but the rail has been
                narrowed to one chip by a search: hiding it there would leave
                a filter on with no visible control to clear it, which is the
                trap RealEstateScreen guards against when the car pill
                disappears. */}
            {categoryRail.length > 1 || selectedCategoryKey ? (
              <CategoryRail
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={categoryRailStyle}
              >
                {categoryRail.map((entry) => {
                  const active = selectedCategoryKey === entry.key;
                  return (
                    <RailChip
                      key={entry.key}
                      icon={entry.icon}
                      label={entry.label}
                      count={entry.count}
                      selected={active}
                      onPress={() =>
                        setSelectedCategoryKey(active ? null : entry.key)
                      }
                    />
                  );
                })}
              </CategoryRail>
            ) : null}
          </>
        }
        keyExtractor={(row) => row.map((listing) => listing.id).join("-")}
        contentContainerStyle={listContentStyle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState>
            {/* Three states, and they must not be confused with each other.
                A search still running must never say "no results" — that is
                the sentence that sends somebody away from a listing that was
                about to appear. And a failed search must not say it either:
                "we found nothing" and "we could not look" are different
                facts, and only one of them is worth retrying. */}
            {isSearching ? (
              <ActivityIndicator color={colors.primary} />
            ) : searchFailed ? (
              <EmptyText>{t("searchFailed")}</EmptyText>
            ) : (
              <EmptyText>
                {isSearchMode
                  ? t("searchNoResults", { query: query.trim() })
                  : t("localEmptyResults")}
              </EmptyText>
            )}
          </EmptyState>
        }
        renderSectionHeader={({ section }) => (
          // Opaque, because a sticky header with a transparent background
          // has cards scrolling visibly through it.
          <StickyHeading>
            <SectionHeading
              label={section.title}
              meta={
                section.hidden ? null : t("listingCountShort", { count: section.total })
              }
              action={
                section.hidden ? (
                  // Selecting the category is the drill-in: filteredListings
                  // narrows to it and the cap lifts, so this reuses the
                  // filter the chips already drive rather than inventing a
                  // second way to be looking at one category.
                  <SeeAllLink
                    onPress={() => setSelectedCategoryKey(section.key)}
                  >
                    {t("localSectionSeeAll", { count: section.total })}
                  </SeeAllLink>
                ) : null
              }
            />
          </StickyHeading>
        )}
        renderItem={({ item: row }) => (
          <GridRow style={rowStyle}>
            {row.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                flush
                // Deliberately never `full`.
                //
                // A section holding exactly one listing used to take the
                // whole row, on the reasoning that a lone half-width card
                // left an empty half-row that looked broken. On a screen
                // that is mostly one- and two-listing categories it does
                // something worse: the same listing is a 16:9 banner here
                // and a square on a seller's profile, so the grid changes
                // size as you scroll and nothing lines up with anything.
                //
                // The empty half-row is the smaller price, and it is one
                // the seller profile has always paid without looking
                // broken.
                isFavorite={favoriteIds.has(listing.id)}
                onToggleFavorite={() => toggleFavorite(listing.id)}
              />
            ))}
          </GridRow>
        )}
        ListFooterComponent={
          <>
            {/* Only while a page is actually in flight. A permanent spinner
                at the bottom of a finite list reads as a list that never
                ends, which is the opposite of what it means. */}
            {loadingMoreListings ? (
              <LoadingMoreRow>
                <ActivityIndicator color={colors.primary} />
              </LoadingMoreRow>
            ) : null}
            {/* Said once, at the real end. Without it the last page and a
                failed page look identical from the reader's side. */}
            {!hasMoreListings && listingSections.length > 0 ? (
              <EndOfResults>{t("localEndOfResults")}</EndOfResults>
            ) : null}
            <ScreenFooter />
          </>
        }
      />

      <Modal
        visible={locationSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setLocationSheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setLocationSheetOpen(false)}>
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetHandle />
            <SheetTitle>{t("chooseCityTitle")}</SheetTitle>
            <CurrentLocationRow
              onPress={requestLocation}
              disabled={locationStatus === "locating"}
            >
              {locationStatus === "locating" ? (
                <ActivityIndicator size="small" color={EMERALD} />
              ) : (
                <Ionicons name="locate-outline" size={17} color={EMERALD} />
              )}
              <CurrentLocationLabel>
                {t("sellUseCurrentLocation")}
              </CurrentLocationLabel>
            </CurrentLocationRow>
            <SearchBar
              value={citySearch}
              onChangeText={setCitySearch}
              placeholder={t("searchCityPlaceholder")}
            />
            <SheetScroll
              contentContainerStyle={{
                ...sheetScrollContentStyle,
                paddingBottom: spacing.lg + insets.bottom,
              }}
            >
              <SheetRow
                selected={!selectedCity}
                onPress={() => {
                  setSelectedCity(null);
                  setLocationSheetOpen(false);
                  setCitySearch("");
                }}
              >
                <SheetRowLabel>{t("localAllCities")}</SheetRowLabel>
                {!selectedCity ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null}
              </SheetRow>
              {filteredCities.map((city) => (
                <SheetRow
                  key={city}
                  selected={selectedCity === city}
                  onPress={() => {
                    setSelectedCity(city);
                    setLocationSheetOpen(false);
                    setCitySearch("");
                  }}
                >
                  <SheetRowLabel>{city}</SheetRowLabel>
                  {selectedCity === city ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </SheetRow>
              ))}
            </SheetScroll>
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={categorySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCategorySheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setCategorySheetOpen(false)}>
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetHandle />
            <SheetTitle>{t("localCategorySheetTitle")}</SheetTitle>
            <SheetScroll
              contentContainerStyle={{
                ...sheetScrollContentStyle,
                paddingBottom: spacing.lg + insets.bottom,
              }}
            >
              <SheetRow
                selected={!selectedCategoryKey}
                onPress={() => {
                  setSelectedCategoryKey(null);
                  setCategorySheetOpen(false);
                }}
              >
                <SheetRowLabel>{t("localCategoryAllOption")}</SheetRowLabel>
                {!selectedCategoryKey ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null}
              </SheetRow>
              {LOCAL_CATEGORIES.map((category) => (
                <SheetRow
                  key={category.key}
                  selected={selectedCategoryKey === category.key}
                  onPress={() => {
                    setSelectedCategoryKey(category.key);
                    setCategorySheetOpen(false);
                  }}
                >
                  <Ionicons
                    name={category.icon}
                    size={18}
                    color={colors.text}
                  />
                  <SheetRowLabel>
                    {language === "en" ? category.labelEn : category.labelFr}
                  </SheetRowLabel>
                  {selectedCategoryKey === category.key ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </SheetRow>
              ))}
            </SheetScroll>
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(TabSafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// The same banner the seller dashboard opens with — identical gradient,
// identical corner radius — so the two tabs that lead with a full-width
// header lead with the same one.
//
// Everything inside it inverts, which is the part that is not cosmetic: a
// title, a city row, a search field and four filter chips were all drawn
// for a white surface, and left alone on this ground they range from low
// contrast to invisible. The selected chip was the worst of them — it fills
// with theme.primary, which on emerald is emerald on emerald.
const Header = styled(LinearGradient).attrs({
  colors: ["#0B6E4F", "#07362A", "#05261D"],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
})`
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  padding-top: ${spacing.lg}px;
  padding-bottom: ${spacing.lg}px;
  /* So the glow discs are cut by the banner's corners rather than hanging
     past them. Safe with elevation here because the gradient is opaque —
     the artifact that bit the job cards needed a translucent background. */
  overflow: hidden;
  ${shadow.card}
`;

const HeaderGlowLarge = styled.View`
  position: absolute;
  top: -96px;
  right: -70px;
  width: 240px;
  height: 240px;
  border-radius: 120px;
  background-color: rgba(255, 255, 255, 0.06);
`;

const HeaderGlowSmall = styled.View`
  position: absolute;
  top: 30px;
  right: 96px;
  width: 130px;
  height: 130px;
  border-radius: 65px;
  background-color: rgba(255, 255, 255, 0.04);
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${spacing.md}px;
  margin-bottom: 10px;
`;

const TitleGroup = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
`;

const ScreenTitle = styled.Text`
  ${type.h2}
  color: #ffffff;
`;

const LangPill = styled(Tappable)`
  background-color: rgba(255, 255, 255, 0.16);
  padding-horizontal: 11px;
  padding-vertical: 7px;
  border-radius: ${radius.pill}px;
`;

const LangPillLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: #ffffff;
`;

// Location row and refresh hint each lead with an icon of a different
// width; a fixed-width icon slot (rather than icon + gap flush against the
// text) keeps their text flush with the plain Subtitle line below/above,
// which has no icon at all — otherwise the three lines' text visibly
// stair-step instead of lining up on the same left edge.
const ROW_ICON_SLOT = 16;

// The whole row is the control that opens the city sheet, so it springs as
// one — a chevron that moves while the label it belongs to sits still reads
// as two separate things.
//
// It is a filled pill spanning the banner rather than a bare line of text.
// As text it took only the width of "All cities" and left two thirds of the
// banner empty beside it, which is what made the header look half-finished;
// it also gave no sign it was tappable at all. Full width puts the chevron
// out at the right edge where a disclosure belongs, and matches the search
// field directly below.
const LocationRow = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  margin-horizontal: ${spacing.md}px;
  margin-bottom: 4px;
  padding: 11px 14px;
  border-radius: ${radius.lg}px;
  background-color: rgba(255, 255, 255, 0.12);
`;

const RowIconSlot = styled.View`
  width: ${ROW_ICON_SLOT}px;
  align-items: center;
  margin-right: ${spacing.sm}px;
`;

const LocationLabel = styled.Text`
  ${type.bodyMedium}
  color: #ffffff;
  flex: 1;
`;

// Two lines used to sit between the city row and the search field and
// neither survived a look at them together.
//
// "Annonces près de chez vous" restated the screen's own title and the city
// row directly above it, in three places saying one thing.
//
// The pull-to-refresh hint was worse: justify-content: flex-end parked it
// alone against the right edge, under two left-aligned lines, which read as
// a layout accident rather than a hint. RefreshControl demonstrates the
// gesture the moment anybody pulls — it does not need a permanent line of
// sticky chrome, and certainly not a misaligned one.
// SearchBar's onDark variant zeroes its own horizontal margin on purpose —
// on a banner the parent owns the spacing — so the parent has to supply it.
// Without this the field runs to both edges of the banner while the title,
// the city row and the chips are all inset 16px. On the old white header
// that misalignment was invisible; on the gradient it is the first thing
// you see.
const SearchBarWrap = styled.View`
  padding-horizontal: ${spacing.md}px;
  margin-top: ${spacing.md}px;
`;

// Fills the row instead of scrolling inside it.
//
// As a horizontal ScrollView the three chips took only the width their
// labels needed and left a third of the banner empty to their right, which
// on a white header read as breathing room and on the gradient reads as a
// row that stopped early.
//
// flex-grow with the default basis is what makes that work without the
// usual cost: each chip grows to share whatever is left over, so the row is
// always full, but none of them can be squeezed below its own label. A
// fourth chip appears when filters are active — "Effacer" — and the three
// simply give up a share to it. If the labels ever do outgrow one line
// (a long category name, "Prix décroissant"), they wrap to a second row
// rather than truncating, which is the failure mode to prefer on a control
// whose label IS its state.
const ChipRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.md}px;
  margin-top: 18px;
`;

// Selected is white on the banner rather than theme.primary — the filled
// chip has to be the thing that stands out, and primary against this
// gradient is emerald on emerald.
const Chip = styled(Tappable)`
  flex-grow: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background-color: ${(props) =>
    props.selected ? "#ffffff" : "rgba(255, 255, 255, 0.14)"};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: 9px;
`;

const ClearChip = styled(Tappable)`
  flex-grow: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background-color: transparent;
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.35);
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: 9px;
`;

const ChipLabel = styled.Text`
  ${(props) => (props.selected ? type.captionMedium : type.caption)}
  color: ${(props) => (props.selected ? EMERALD : "#ffffff")};
`;

// theme.error is a red chosen to sit on a white page; on the banner it goes
// muddy. This is the same warning at a lightness the ground can carry.
const LocationHintText = styled.Text`
  ${type.caption}
  color: #FFC9C4;
  padding-horizontal: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
`;

const ListingsErrorNote = styled.View`
  margin-horizontal: ${spacing.md - 2}px;
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.errorLight};
  margin-bottom: ${spacing.md}px;
`;
const ListingsErrorLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
`;

const PlaceCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 13px 14px;
  margin: 0 ${spacing.md}px ${spacing.sm}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PlaceIcon = styled.View`
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.tint};
`;

const PlaceBody = styled.View`
  flex: 1;
  min-width: 0;
`;

const PlaceKicker = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10px;
  letter-spacing: 1px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 2px;
`;

const PlaceName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const PlaceMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const RestoStrip = styled.ScrollView.attrs(() => ({
  contentContainerStyle: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
}))``;

const RestoMini = styled(Pressable)`
  width: 132px;
  margin-right: ${spacing.sm}px;
  padding: 10px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

// The owner's own picture when there is one, contained so a wide logo keeps
// its name — the cuisine gradient is only the fallback. Same height either
// way so the strip doesn't jump.
const RestoMiniPhotoWrap = styled.View`
  height: 62px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  padding: 4px;
  margin-bottom: 8px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RestoMiniPhoto = styled.Image`
  width: 100%;
  height: 100%;
`;

const RestoMiniThumb = styled(LinearGradient)`
  height: 62px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
`;

const RestoMiniName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const RestoMiniMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const SeeAllLink = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.primary};
`;

// SectionHeading brings its own bottom margin; this only supplies the
// screen's horizontal padding and the air above the section.
const SectionHeadingWrap = styled.View`
  padding-horizontal: ${spacing.md}px;
  padding-top: ${spacing.lg}px;
`;

// No vertical margin here. ListingCard already carries margin-bottom, which
// is where the row gap came from under columnWrapperStyle — adding another
// would double the spacing the grid has always had.
const CategoryRail = styled.ScrollView`
  margin-bottom: ${spacing.sm}px;
`;

const GridRow = styled.View`
  flex-direction: row;
`;

// The screen's own background, so cards pass behind the pinned heading
// rather than through it.
const StickyHeading = styled.View`
  background-color: ${(props) => props.theme.background};
  padding-horizontal: ${spacing.md - 2}px;
`;

const EmptyState = styled.View`
  padding: ${spacing.xl}px ${spacing.md}px;
  align-items: center;
`;

const EmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const Sheet = styled.View`
  max-height: 80%;
  background-color: ${(props) => props.theme.background};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding-top: ${spacing.sm}px;
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.border};
  align-self: center;
  margin-bottom: ${spacing.md}px;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  padding-horizontal: ${spacing.lg}px;
  margin-bottom: ${spacing.sm}px;
`;

// keyboardShouldPersistTaps: the sheet's own search field puts the keyboard
// up, and the default ("never") makes the next tap anywhere in this scroll
// get eaten dismissing it — so selecting a city while typing silently
// needed two taps. "handled" lets the row take the tap on the first try and
// still dismisses the keyboard.
const SheetScroll = styled.ScrollView.attrs(() => ({
  keyboardShouldPersistTaps: "handled",
}))`
  padding-horizontal: ${spacing.md}px;
`;

const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 13px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => (props.selected ? props.theme.primaryLight : "transparent")};
`;

const SheetRowLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const CurrentLocationRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.lg}px;
  padding-vertical: 13px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.xs}px;
`;

const CurrentLocationLabel = styled.Text`
  ${type.bodyMedium}
  color: ${EMERALD};
`;

const LoadingMoreRow = styled.View`
  padding-vertical: ${spacing.lg}px;
  align-items: center;
`;

const EndOfResults = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  padding-vertical: ${spacing.lg}px;
`;
