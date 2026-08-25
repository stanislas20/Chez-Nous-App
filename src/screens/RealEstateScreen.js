import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import MapView, { Circle } from "react-native-maps";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { SearchBar } from "../components/SearchBar";
import { sectorTint } from "../data/companySectors";
import { selectionTick } from "../utils/haptics";
import { useAuth } from "../auth/AuthContext";
import { openAccountGate } from "../utils/openAccountGate";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { canPublish } from "../utils/canPublish";
import { useFavorites } from "../hooks/useFavorites";
import { queryMatches } from "../utils/search";
import { cities } from "../data/cities";
import { cityCoordinates } from "../data/cityCoordinates";
import {
  propertyTypes,
  getPropertyTypeLabel,
  ROOM_COUNTS,
} from "../data/realEstate";
import {
  commercialTypes,
  getCommercialTypeLabel,
  commercialPricePer,
  realEstateHasCapacity,
} from "../data/realEstate";
import { getAllQuartiers, getQuartiers } from "../data/quartiers";
import {
  getLandDocument,
  getRealEstateDeal,
  getLandDocumentBadge,
  getLandDocumentNote,
  getLandDocumentTier,
  getListerKindLabel,
  getMoveInCost,
  getRealEstateDealGlyph,
  getRealEstateDealLabel,
  realEstateDeals,
} from "../data/realEstate";
import { buildLinkUrl } from "../data/restaurantLinks";
import { useApprovedListings } from "../hooks/useApprovedListings";
import { openChat } from "../utils/openChat";

const EMERALD = "#0B6E4F";
const AMBER_TEXT = "#8A6415";
const BANNER = ["#0B6E4F", "#0F8A63"];
const THUMB_TINT = ["rgba(11, 110, 79, 0.12)", "rgba(217, 164, 65, 0.16)"];

// Budget bands are per deal: 50–100k is a monthly rent and means nothing
// against a plot of land. One shared set would be wrong for three of four.
const BUDGET_BANDS = {
  rent: [
    { key: "a", max: 50000, labelEn: "≤ 50k / month", labelFr: "≤ 50k / mois" },
    {
      key: "b",
      min: 50000,
      max: 100000,
      labelEn: "50–100k",
      labelFr: "50–100k",
    },
    { key: "c", min: 100000, labelEn: "> 100k", labelFr: "> 100k" },
  ],
  sale: [
    { key: "a", max: 15000000, labelEn: "≤ 15M", labelFr: "≤ 15M" },
    {
      key: "b",
      min: 15000000,
      max: 40000000,
      labelEn: "15–40M",
      labelFr: "15–40M",
    },
    { key: "c", min: 40000000, labelEn: "> 40M", labelFr: "> 40M" },
  ],
  land: [
    { key: "a", max: 5000000, labelEn: "≤ 5M", labelFr: "≤ 5M" },
    {
      key: "b",
      min: 5000000,
      max: 15000000,
      labelEn: "5–15M",
      labelFr: "5–15M",
    },
    { key: "c", min: 15000000, labelEn: "> 15M", labelFr: "> 15M" },
  ],
  shortStay: [
    { key: "a", max: 20000, labelEn: "≤ 20k / night", labelFr: "≤ 20k / nuit" },
    { key: "b", min: 20000, max: 40000, labelEn: "20–40k", labelFr: "20–40k" },
    { key: "c", min: 40000, labelEn: "> 40k", labelFr: "> 40k" },
  ],
  // Spans two pricing units on purpose: shops are quoted per month and halls
  // per day, and both land in the same brackets in practice — a boutique at
  // 150k a month and a hall at 150k a day are both "the middle one" to
  // someone scanning.
  commercial: [
    { key: "a", max: 100000, labelEn: "≤ 100k", labelFr: "≤ 100k" },
    {
      key: "b",
      min: 100000,
      max: 500000,
      labelEn: "100–500k",
      labelFr: "100–500k",
    },
    { key: "c", min: 500000, labelEn: "> 500k", labelFr: "> 500k" },
  ],
};

const SORTS = [
  { key: "recent", labelKey: "realEstateSortRecent" },
  { key: "priceAsc", labelKey: "realEstateSortPriceAsc" },
  { key: "priceDesc", labelKey: "realEstateSortPriceDesc" },
  { key: "surface", labelKey: "realEstateSortSurface" },
];

const priceFormatter = new Intl.NumberFormat("fr-FR");
const fcfa = (value) => priceFormatter.format(Math.round(Number(value) || 0));

const mapStyle = { flex: 1 };
const sheetScrollStyle = { flexShrink: 1 };
const sheetScrollContentStyle = { paddingBottom: spacing.md };
const listContentStyle = { padding: spacing.md, paddingBottom: spacing.xl };

export function RealEstateScreen({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const listings = useApprovedListings();
  const { user } = useAuth();

  // Publishing a property meant leaving this screen for Vendre and finding
  // Immobilier in a category sheet — the same detour every other vertical
  // has now stopped asking for. A landlord reading the market is exactly the
  // person about to list one.
  const openPostForm = () =>
    navigation.navigate("MainTabs", {
      screen: "Sell",
      params: {
        screen: "CreateListing",
        // Keeps SellerDashboard beneath the form so its back arrow works.
        initial: false,
        params: { categoryKey: "realEstate" },
      },
    });

  const { remember } = useAccountGateIntent(user, openPostForm);

  // Signed out is a door the gate opens; signed in on a number that cannot
  // publish is a wall, and inviting somebody into it is the dead promise
  // every other screen has stopped making.
  const mayPublish = !user || canPublish(user);

  const startPosting = () => {
    if (!user) {
      remember();
      openAccountGate(navigation);
      return;
    }
    openPostForm();
  };
  // The same store the heart on every other card writes to, so a property
  // saved here turns up in Saved listings rather than in a set that dies
  // with the screen.
  const { favoriteIds, toggleFavorite } = useFavorites(user?.uid);

  const [deal, setDeal] = useState("rent");
  const [city, setCity] = useState(null);
  const [quartier, setQuartier] = useState(null);
  const [band, setBand] = useState(null);
  const [sort, setSort] = useState("recent");
  const [search, setSearch] = useState("");
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [quartierPickerOpen, setQuartierPickerOpen] = useState(false);
  const [budgetPickerOpen, setBudgetPickerOpen] = useState(false);
  const [morePickerOpen, setMorePickerOpen] = useState(false);
  const [propertyType, setPropertyType] = useState(null);
  const [commercialType, setCommercialType] = useState(null);
  const [rooms, setRooms] = useState(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [contactFor, setContactFor] = useState(null);

  const bands = BUDGET_BANDS[deal] ?? [];
  const quartiers = city ? getQuartiers(city) : getAllQuartiers();

  const results = useMemo(() => {
    const selectedBand = bands.find((item) => item.key === band);
    const matched = (listings ?? [])
      .filter(
        (item) =>
          item.categoryKey === "realEstate" && item.realEstateDeal === deal,
      )
      .filter((item) => {
        if (city && item.city !== city) return false;
        if (quartier && item.quartier !== quartier) return false;
        if (
          search.trim() &&
          !queryMatches(
            search,
            item.title,
            item.description,
            item.quartier,
            item.city,
          )
        ) {
          return false;
        }
        if (selectedBand) {
          const price = Number(item.price) || 0;
          if (selectedBand.min != null && price < selectedBand.min)
            return false;
          if (selectedBand.max != null && price >= selectedBand.max)
            return false;
        }
        if (commercialType && item.commercialType !== commercialType)
          return false;
        // Property type and room count were being collected by the filter
        // sheet, counted in its badge, and then never applied.
        if (propertyType && item.propertyType !== propertyType) return false;
        if (rooms && String(item.rooms ?? "") !== String(rooms)) return false;
        return true;
      });

    const sorted = [...matched];
    if (sort === "priceAsc")
      sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    if (sort === "priceDesc")
      sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    if (sort === "surface")
      sorted.sort((a, b) => (b.surface ?? 0) - (a.surface ?? 0));
    // 'recent' keeps the query's own createdAt-desc order.
    return sorted;
  }, [
    listings,
    deal,
    city,
    quartier,
    band,
    bands,
    sort,
    search,
    propertyType,
    rooms,
    commercialType,
  ]);

  const selectDeal = (key) => {
    if (key === deal) return;
    selectionTick();
    setDeal(key);
    setCommercialType(null);
    // Bands are per-deal; one chosen under "rent" would silently filter
    // everything out under "land".
    setBand(null);
  };

  // The emerald pill slides between the four deals instead of jumping, and
  // each label crossfades to white in step with it — switching the colour
  // outright would leave white text sitting on the pale track for the length
  // of the slide.
  const DEAL_PADDING = 4;
  const DEAL_GAP = 4;
  // Fixed width per tab, wide enough for the longest label in either
  // language ("Courte durée"). Dividing the screen by the number of deals
  // worked at four and collapsed at five — the labels overlapped — so the
  // track scrolls instead and stays legible however many deals exist.
  const DEAL_TAB_WIDTH = 118;
  const dealIndex = Math.max(
    0,
    realEstateDeals.findIndex((item) => item.key === deal),
  );
  const [dealTrackWidth, setDealTrackWidth] = useState(0);
  const dealScrollRef = useRef(null);
  const dealPos = useRef(new Animated.Value(dealIndex)).current;
  const dealSettled = useRef(false);
  const dealThumbWidth = DEAL_TAB_WIDTH;

  useEffect(() => {
    if (!dealSettled.current) {
      dealPos.setValue(dealIndex);
      dealSettled.current = true;
      return;
    }
    Animated.spring(dealPos, {
      toValue: dealIndex,
      useNativeDriver: true,
      friction: 11,
      tension: 90,
    }).start();

    // A tab off the right edge would otherwise be selected but invisible.
    if (dealTrackWidth > 0) {
      const step = DEAL_TAB_WIDTH + DEAL_GAP;
      const centred =
        dealIndex * step - dealTrackWidth / 2 + DEAL_TAB_WIDTH / 2;
      dealScrollRef.current?.scrollTo({
        x: Math.max(0, centred),
        animated: true,
      });
    }
  }, [dealIndex, dealPos, dealTrackWidth, DEAL_GAP, DEAL_TAB_WIDTH]);

  const dealRange = realEstateDeals.map((_, index) => index);
  const dealThumbX = dealPos.interpolate({
    inputRange: dealRange,
    outputRange: dealRange.map((index) => index * (dealThumbWidth + DEAL_GAP)),
  });

  const mapRegion =
    city && cityCoordinates[city]
      ? { ...cityCoordinates[city], latitudeDelta: 0.14, longitudeDelta: 0.14 }
      : {
          latitude: 9.3,
          longitude: 2.3,
          latitudeDelta: 6.2,
          longitudeDelta: 6.2,
        };
  // One circle per city that actually has results, sized by how many.
  // Circles come from every property listing, not the filtered results.
  //
  // Same reason as RestaurantsScreen: react-native-maps' AIRMap is a
  // legacy view under the New Architecture, and adding or removing its
  // children makes the interop layer call insertReactSubview:atIndex: with
  // an out-of-range index — NSRangeException, then abort(). Re-filtering on
  // each keystroke churned those children and killed the app on iOS.
  //
  // A constant set never hits that path, and the caption already says the
  // circles mark a city rather than an address.
  const mapPoints = useMemo(() => {
    const counts = {};
    for (const item of listings ?? []) {
      if (item.categoryKey !== "realEstate") continue;
      if (cityCoordinates[item.city])
        counts[item.city] = (counts[item.city] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      ...cityCoordinates[name],
    }));
  }, [listings]);

  const sortLabel = t(SORTS.find((item) => item.key === sort).labelKey);
  const activeBand = bands.find((item) => item.key === band);
  const activeBandLabel = activeBand
    ? language === "en"
      ? activeBand.labelEn
      : activeBand.labelFr
    : null;
  const hasFilters = !!(
    city ||
    quartier ||
    band ||
    search.trim() ||
    propertyType ||
    rooms ||
    commercialType
  );
  const moreCount = (propertyType ? 1 : 0) + (rooms ? 1 : 0);
  // Land has no rooms to count and nothing to furnish, so the extra
  // filters are hidden for it rather than shown with nothing to match.
  const showMoreFilters = deal !== "land";
  // `listings` is null until the first snapshot lands — distinct from an
  // empty array, which means the query ran and genuinely matched nothing.
  const isLoading = listings === null;

  const clearFilters = () => {
    setCity(null);
    setQuartier(null);
    setBand(null);
    setSearch("");
  };
  const contactPhone = contactFor?.phone ?? contactFor?.sellerPhone ?? null;

  return (
    <Container edges={["left", "right", "bottom"]}>
      {/* A banner rather than a title bar: this is a destination people
          arrive at, and the count tells them the market has depth before
          they touch a filter. */}
      <Banner
        colors={BANNER}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + spacing.sm }}
      >
        <BannerTopRow>
          <BannerBack onPress={() => navigation.goBack()} hitSlop={10}>
            <Feather name="chevron-left" size={21} color="#ffffff" />
          </BannerBack>
          <BannerKicker>{t("realEstateKicker")}</BannerKicker>
        </BannerTopRow>
        <BannerTitle>{t("realEstateTitle")}</BannerTitle>
        <BannerCopy>{t("realEstateSubtitle")}</BannerCopy>
      </Banner>

      {/* Controls stay put while results scroll. Three stacked labelled
          filter sections pushed the first card ~350px down the page; as
          compact pills they cost one row and the results are visible from
          the first frame — which is the whole job of a search screen. */}
      <Chrome>
        <DealTrack
          ref={dealScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={dealTrackContentStyle}
          onLayout={(event) =>
            setDealTrackWidth(event.nativeEvent.layout.width)
          }
        >
          {dealThumbWidth > 0 ? (
            <DealThumb
              style={{
                width: dealThumbWidth,
                transform: [{ translateX: dealThumbX }],
              }}
            />
          ) : null}
          {realEstateDeals.map((item, index) => (
            <DealTab key={item.key} onPress={() => selectDeal(item.key)}>
              <DealGlyph>{getRealEstateDealGlyph(item.key)}</DealGlyph>
              <DealTabLabel numberOfLines={1}>
                {getRealEstateDealLabel(item.key, language)}
              </DealTabLabel>
              {/* The same row again in white, faded in as the pill arrives.
                  The glyph is an emoji and renders identically in both, so
                  the two layers read as one. */}
              <DealTabActiveLayer
                pointerEvents="none"
                style={{
                  opacity: dealPos.interpolate({
                    inputRange: [index - 0.6, index, index + 0.6],
                    outputRange: [0, 1, 0],
                    extrapolate: "clamp",
                  }),
                }}
              >
                <DealGlyph>{getRealEstateDealGlyph(item.key)}</DealGlyph>
                <DealTabLabel active numberOfLines={1}>
                  {getRealEstateDealLabel(item.key, language)}
                </DealTabLabel>
              </DealTabActiveLayer>
            </DealTab>
          ))}
        </DealTrack>

        {deal === "commercial" ? (
          <TypeChipRow
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={typeChipRowStyle}
          >
            {commercialTypes.map((option) => {
              const active = commercialType === option.key;
              return (
                <TypeChip
                  key={option.key}
                  active={active}
                  accent={option.color}
                  // Tapping the active chip clears it — the row has no "all"
                  // entry, so the selected chip is its own off switch.
                  onPress={() => setCommercialType(active ? null : option.key)}
                >
                  <TypeChipDisc
                    active={active}
                    tint={
                      active
                        ? "rgba(255,255,255,0.22)"
                        : sectorTint(option.color, 0.14)
                    }
                  >
                    <TypeChipGlyph>{option.glyph}</TypeChipGlyph>
                  </TypeChipDisc>
                  <TypeChipLabel active={active}>
                    {getCommercialTypeLabel(option.key, language)}
                  </TypeChipLabel>
                </TypeChip>
              );
            })}
          </TypeChipRow>
        ) : null}

        <SearchWrap>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t("realEstateSearchPlaceholder")}
          />
        </SearchWrap>

        <FilterBar>
          <FilterPill active={!!city} onPress={() => setCityPickerOpen(true)}>
            <Feather
              name="map-pin"
              size={13}
              color={city ? "#ffffff" : colors.textMuted}
            />
            <FilterPillLabel active={!!city} numberOfLines={1}>
              {city ?? t("realEstateFilterCity")}
            </FilterPillLabel>
            <Feather
              name="chevron-down"
              size={13}
              color={city ? "#ffffff" : colors.textMuted}
            />
          </FilterPill>

          <FilterPill
            active={!!quartier}
            onPress={() => setQuartierPickerOpen(true)}
          >
            <FilterPillLabel active={!!quartier} numberOfLines={1}>
              {quartier ?? t("realEstateFilterQuartier")}
            </FilterPillLabel>
            <Feather
              name="chevron-down"
              size={13}
              color={quartier ? "#ffffff" : colors.textMuted}
            />
          </FilterPill>

          <FilterPill active={!!band} onPress={() => setBudgetPickerOpen(true)}>
            <FilterPillLabel active={!!band} numberOfLines={1}>
              {activeBandLabel ?? t("realEstateFilterBudget")}
            </FilterPillLabel>
            <Feather
              name="chevron-down"
              size={13}
              color={band ? "#ffffff" : colors.textMuted}
            />
          </FilterPill>

          {showMoreFilters ? (
            <FilterPill
              active={moreCount > 0}
              onPress={() => setMorePickerOpen(true)}
            >
              <Feather
                name="sliders"
                size={13}
                color={moreCount > 0 ? "#ffffff" : colors.textMuted}
              />
              <FilterPillLabel active={moreCount > 0} numberOfLines={1}>
                {moreCount > 0
                  ? `${t("realEstateMoreFilters")} ${moreCount}`
                  : t("realEstateMoreFilters")}
              </FilterPillLabel>
            </FilterPill>
          ) : null}

          {hasFilters ? (
            <ClearPill onPress={clearFilters} hitSlop={6}>
              <Feather name="x" size={15} color={colors.textMuted} />
            </ClearPill>
          ) : null}
        </FilterBar>
      </Chrome>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {deal === "rent" ? (
              <WarnBox>
                <Feather name="alert-circle" size={15} color={AMBER_TEXT} />
                <WarnText>{t("realEstateWarnRent")}</WarnText>
              </WarnBox>
            ) : null}
            {deal === "land" ? (
              <WarnBox>
                <Feather name="shield" size={15} color={AMBER_TEXT} />
                <WarnText>{t("realEstateWarnLand")}</WarnText>
              </WarnBox>
            ) : null}

            {/* City-level circles, sized by how many results each holds.
                Deliberately not pins: we hold no street address, and a pin
                would claim a precision the data does not have. */}
            {!isLoading ? (
              <MapCard>
                <MapView
                  style={mapStyle}
                  region={mapRegion}
                  liteMode
                  pointerEvents="none"
                >
                  {mapPoints.map((point) => (
                    <Circle
                      key={point.name}
                      center={{
                        latitude: point.latitude,
                        longitude: point.longitude,
                      }}
                      radius={1200 + point.count * 400}
                      strokeColor="rgba(11, 110, 79, 0.85)"
                      fillColor="rgba(11, 110, 79, 0.22)"
                      strokeWidth={2}
                    />
                  ))}
                </MapView>
                {/* Shown whether or not there are results: an empty map
                    still answers "where am I searching", and gating it on
                    results meant it never appeared at all. */}
                <MapNote>
                  {mapPoints.length
                    ? t("realEstateMapNote")
                    : t("realEstateMapEmptyNote")}
                </MapNote>
              </MapCard>
            ) : null}

            {isLoading ? null : (
              <CountRow>
                <CountText numberOfLines={1}>
                  {t("realEstateResultCount", { count: results.length })}
                  {" · "}
                  {quartier ?? t("realEstateAllQuartiers")}
                </CountText>
                <SortLink onPress={() => setSortOpen(true)}>
                  <Feather name="sliders" size={13} color={EMERALD} />
                  <SortLinkLabel>{sortLabel}</SortLinkLabel>
                </SortLink>
              </CountRow>
            )}
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            // Skeletons rather than a spinner: the page keeps its shape as
            // data lands, instead of collapsing and jumping.
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <EmptyWrap>
              <EmptyGlyph>{getRealEstateDealGlyph(deal)}</EmptyGlyph>
              <EmptyTitle>{t("realEstateEmptyTitle")}</EmptyTitle>
              <EmptyCopy>{t("realEstateEmptyCopy")}</EmptyCopy>
              {hasFilters ? (
                <EmptyAction onPress={clearFilters}>
                  <EmptyActionLabel>
                    {t("realEstateClearFilters")}
                  </EmptyActionLabel>
                </EmptyAction>
              ) : null}
            </EmptyWrap>
          )
        }
        ListFooterComponent={
          mayPublish ? (
            <PostCard onPress={startPosting}>
              <PostIcon>
                <Ionicons
                  name="home-outline"
                  size={20}
                  color={colors.primary}
                />
              </PostIcon>
              <PostCol>
                <PostTitle>{t("realEstatePostTitle")}</PostTitle>
                <PostCopy>{t("realEstatePostCopy")}</PostCopy>
              </PostCol>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </PostCard>
          ) : null
        }
        renderItem={({ item }) => (
          <PropertyCard
            listing={item}
            language={language}
            t={t}
            colors={colors}
            saved={favoriteIds.has(item.id)}
            onToggleSave={() => toggleFavorite(item.id)}
            user={user}
            navigation={navigation}
            onOpen={() =>
              navigation.navigate("RealEstateDetail", {
                listing: { ...item, createdAt: null },
              })
            }
            onContact={() => setContactFor(item)}
          />
        )}
      />

      <Modal
        visible={cityPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCityPickerOpen(false)}
      >
        <SheetBackdrop onPress={() => setCityPickerOpen(false)}>
          <Sheet
            style={{ paddingBottom: insets.bottom + spacing.md }}
            onStartShouldSetResponder={() => true}
          >
            <SheetHandle />
            <SheetTitle>{t("realEstateCityPickerTitle")}</SheetTitle>
            <ScrollView
              style={sheetScrollStyle}
              contentContainerStyle={sheetScrollContentStyle}
              showsVerticalScrollIndicator={false}
            >
              <SheetOption
                onPress={() => {
                  setCity(null);
                  setQuartier(null);
                  setCityPickerOpen(false);
                }}
              >
                <SheetOptionLabel selected={!city}>
                  {t("realEstateAllCities")}
                </SheetOptionLabel>
                {!city ? (
                  <Feather name="check" size={17} color={EMERALD} />
                ) : null}
              </SheetOption>
              {cities.map((name) => (
                <SheetOption
                  key={name}
                  onPress={() => {
                    setCity(name);
                    // A quartier from another commune would filter to nothing.
                    setQuartier(null);
                    setCityPickerOpen(false);
                  }}
                >
                  <SheetOptionLabel selected={city === name}>
                    {name}
                  </SheetOptionLabel>
                  {city === name ? (
                    <Feather name="check" size={17} color={EMERALD} />
                  ) : null}
                </SheetOption>
              ))}
            </ScrollView>
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={quartierPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setQuartierPickerOpen(false)}
      >
        <SheetBackdrop onPress={() => setQuartierPickerOpen(false)}>
          <Sheet
            style={{ paddingBottom: insets.bottom + spacing.md }}
            onStartShouldSetResponder={() => true}
          >
            <SheetHandle />
            <SheetTitle>{t("realEstateFilterQuartier")}</SheetTitle>
            <ScrollView
              style={sheetScrollStyle}
              contentContainerStyle={sheetScrollContentStyle}
              showsVerticalScrollIndicator={false}
            >
              <SheetOption
                onPress={() => {
                  setQuartier(null);
                  setQuartierPickerOpen(false);
                }}
              >
                <SheetOptionLabel selected={!quartier}>
                  {t("realEstateAllQuartiers")}
                </SheetOptionLabel>
                {!quartier ? (
                  <Feather name="check" size={17} color={EMERALD} />
                ) : null}
              </SheetOption>
              {quartiers.map((name) => (
                <SheetOption
                  key={name}
                  onPress={() => {
                    setQuartier(name);
                    setQuartierPickerOpen(false);
                  }}
                >
                  <SheetOptionLabel selected={quartier === name}>
                    {name}
                  </SheetOptionLabel>
                  {quartier === name ? (
                    <Feather name="check" size={17} color={EMERALD} />
                  ) : null}
                </SheetOption>
              ))}
            </ScrollView>
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={budgetPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setBudgetPickerOpen(false)}
      >
        <SheetBackdrop onPress={() => setBudgetPickerOpen(false)}>
          <Sheet
            style={{ paddingBottom: insets.bottom + spacing.md }}
            onStartShouldSetResponder={() => true}
          >
            <SheetHandle />
            <SheetTitle>{t("realEstateFilterBudget")}</SheetTitle>
            <SheetOption
              onPress={() => {
                setBand(null);
                setBudgetPickerOpen(false);
              }}
            >
              <SheetOptionLabel selected={!band}>
                {t("realEstateAllBudgets")}
              </SheetOptionLabel>
              {!band ? (
                <Feather name="check" size={17} color={EMERALD} />
              ) : null}
            </SheetOption>
            {bands.map((item) => (
              <SheetOption
                key={item.key}
                onPress={() => {
                  setBand(item.key);
                  setBudgetPickerOpen(false);
                }}
              >
                <SheetOptionLabel selected={band === item.key}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </SheetOptionLabel>
                {band === item.key ? (
                  <Feather name="check" size={17} color={EMERALD} />
                ) : null}
              </SheetOption>
            ))}
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={morePickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setMorePickerOpen(false)}
      >
        <SheetBackdrop onPress={() => setMorePickerOpen(false)}>
          <Sheet
            style={{ paddingBottom: insets.bottom + spacing.md }}
            onStartShouldSetResponder={() => true}
          >
            <SheetHandle />
            <SheetTitle>{t("realEstateMoreFilters")}</SheetTitle>

            <SheetSectionLabel>
              {t("realEstateSpecPropertyType")}
            </SheetSectionLabel>
            <OptionWrap>
              {propertyTypes.map((option) => {
                const active = propertyType === option.key;
                return (
                  <OptionChip
                    key={option.key}
                    active={active}
                    onPress={() => setPropertyType(active ? null : option.key)}
                  >
                    <OptionChipLabel active={active}>
                      {getPropertyTypeLabel(option.key, language)}
                    </OptionChipLabel>
                  </OptionChip>
                );
              })}
            </OptionWrap>

            <SheetSectionLabel>{t("realEstateSpecRooms")}</SheetSectionLabel>
            <OptionWrap>
              {ROOM_COUNTS.map((count) => {
                const active = rooms === count;
                return (
                  <RoomChip
                    key={count}
                    active={active}
                    onPress={() => setRooms(active ? null : count)}
                  >
                    <OptionChipLabel active={active}>{count}</OptionChipLabel>
                  </RoomChip>
                );
              })}
            </OptionWrap>

            <SheetActions>
              <ApplyButton onPress={() => setMorePickerOpen(false)}>
                <ApplyLabel>
                  {t("realEstateSortApply", { count: results.length })}
                </ApplyLabel>
              </ApplyButton>
            </SheetActions>
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={sortOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSortOpen(false)}
      >
        <SheetBackdrop onPress={() => setSortOpen(false)}>
          <Sheet
            style={{ paddingBottom: insets.bottom + spacing.md }}
            onStartShouldSetResponder={() => true}
          >
            <SheetHandle />
            <SheetTitle>{t("realEstateSortTitle")}</SheetTitle>
            {SORTS.map((item) => {
              const active = sort === item.key;
              return (
                <SortRow key={item.key} onPress={() => setSort(item.key)}>
                  <SortRowLabel selected={active}>
                    {t(item.labelKey)}
                  </SortRowLabel>
                  <RadioOuter selected={active}>
                    {active ? <RadioInner /> : null}
                  </RadioOuter>
                </SortRow>
              );
            })}
            <SheetActions>
              <ApplyButton onPress={() => setSortOpen(false)}>
                <ApplyLabel>
                  {t("realEstateSortApply", { count: results.length })}
                </ApplyLabel>
              </ApplyButton>
            </SheetActions>
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={!!contactFor}
        animationType="slide"
        transparent
        onRequestClose={() => setContactFor(null)}
      >
        <SheetBackdrop onPress={() => setContactFor(null)}>
          <Sheet
            style={{ paddingBottom: insets.bottom + spacing.md }}
            onStartShouldSetResponder={() => true}
          >
            <SheetHandle />
            <SheetTitle>{t("realEstateContactTitle")}</SheetTitle>
            {contactPhone ? (
              <>
                <ContactRow
                  onPress={() => Linking.openURL(`tel:${contactPhone}`)}
                >
                  <ContactIcon>
                    <Feather name="phone" size={16} color={EMERALD} />
                  </ContactIcon>
                  <ContactCol>
                    <ContactValue>{contactPhone}</ContactValue>
                    <ContactHint>{t("realEstateContactCallHint")}</ContactHint>
                  </ContactCol>
                </ContactRow>
                {buildLinkUrl("whatsapp", contactPhone) ? (
                  <ContactRow
                    onPress={() =>
                      Linking.openURL(buildLinkUrl("whatsapp", contactPhone))
                    }
                  >
                    <ContactIcon>
                      <Ionicons
                        name="logo-whatsapp"
                        size={16}
                        color="#25D366"
                      />
                    </ContactIcon>
                    <ContactCol>
                      <ContactValue>WhatsApp</ContactValue>
                      <ContactHint>
                        {t("realEstateContactWhatsappHint")}
                      </ContactHint>
                    </ContactCol>
                  </ContactRow>
                ) : null}
              </>
            ) : (
              <ContactHint>{t("realEstateContactNone")}</ContactHint>
            )}
            <WarnBox>
              <Feather name="shield" size={15} color={AMBER_TEXT} />
              <WarnText>{t("realEstateWarnPayment")}</WarnText>
            </WarnBox>
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

// A card-shaped placeholder that breathes, shown while the first snapshot
// is in flight. It matches the real card's height and rhythm so the page
// doesn't jump when data replaces it — a centred spinner would collapse
// the layout and then reflow it.
function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <SkeletonWrap>
      <Animated.View style={{ opacity: pulse }}>
        <SkeletonTopRow>
          <SkeletonThumb />
          <SkeletonCol>
            <SkeletonBar width={60} height={18} />
            <SkeletonBar width={85} height={11} />
          </SkeletonCol>
        </SkeletonTopRow>
        <SkeletonBar width={70} height={13} />
        <SkeletonBar width={45} height={11} />
      </Animated.View>
    </SkeletonWrap>
  );
}

// Exported so the detail screen shows exactly the figures the card promised.
export function buildPropertyView(listing, language, t) {
  const deal = listing.realEstateDeal;
  const price = Number(listing.price) || 0;
  const moveIn = getMoveInCost(listing);
  const document =
    deal === "land" ? getLandDocument(listing.landDocument) : null;
  const tier = document ? getLandDocumentTier(listing.landDocument) : null;

  // For a rental the headline is the move-in total, not the rent: the rent
  // is what you pay later, the total is what stops you at the door. Falls
  // back to the monthly figure when the poster declared neither avance nor
  // caution — inventing a total would be worse than showing none.
  // A shop or an office is leased on the same avance-plus-caution terms as a
  // home, so it gets the same move-in headline. A hall is booked by the day
  // and has no such barrier.
  const isHall = realEstateHasCapacity(deal, listing.commercialType);
  const isCommercialLease = deal === "commercial" && !isHall;
  const usesMoveIn = (deal === "rent" || isCommercialLease) && !!moveIn;

  const headline = usesMoveIn ? fcfa(moveIn) : fcfa(price);
  const headlineUnit = usesMoveIn
    ? t("realEstateUnitMoveIn")
    : deal === "rent" || isCommercialLease
      ? t("realEstateUnitPerMonth")
      : isHall
        ? t("realEstateUnitPerDay")
        : deal === "shortStay"
          ? t("realEstateUnitPerNight")
          : t("realEstateUnitTotal");

  let subPrice = null;
  if (isHall) {
    const parts = [];
    if (Number(listing.capacity) > 0) {
      parts.push(
        t("realEstateCapacityGuests", { count: Number(listing.capacity) }),
      );
    }
    if (Number(listing.surface) > 0) parts.push(`${listing.surface} m²`);
    subPrice = parts.length ? parts.join(" · ") : null;
  } else if (deal === "rent" || isCommercialLease) {
    const parts = [t("realEstateRentPerMonth", { amount: fcfa(price) })];
    if (Number.isFinite(Number(listing.avanceMonths))) {
      parts.push(
        t("realEstateAvanceMonths", { count: Number(listing.avanceMonths) }),
      );
    }
    if (Number.isFinite(Number(listing.depositMonths))) {
      parts.push(
        t("realEstateCautionMonths", { count: Number(listing.depositMonths) }),
      );
    }
    subPrice = parts.join(" · ");
  } else if (deal === "land" && Number(listing.surface) > 0) {
    subPrice = t("realEstatePerSquareMetre", {
      amount: fcfa(price / Number(listing.surface)),
    });
  } else if (listing.rooms && listing.surface) {
    subPrice = `${t("realEstateFactRooms", { count: listing.rooms })} · ${listing.surface} m²`;
  }

  return {
    deal,
    headline,
    headlineUnit,
    subPrice,
    document,
    tier,
    documentBadge: document
      ? getLandDocumentBadge(listing.landDocument, language)
      : null,
    documentNote: document
      ? getLandDocumentNote(listing.landDocument, language)
      : null,
    listerLabel: listing.listerKind
      ? getListerKindLabel(listing.listerKind, language)
      : null,
    isVerifiedLister:
      listing.listerKind === "agency" && !!listing.sellerVerified,
    place: [listing.quartier, listing.city].filter(Boolean).join(", "),
  };
}

function PropertyCard({
  listing,
  language,
  t,
  colors,
  onOpen,
  onContact,
  saved,
  onToggleSave,
  user,
  navigation,
}) {
  const view = buildPropertyView(listing, language, t);
  const isLand = view.deal === "land";
  const phone = listing.phone ?? listing.sellerPhone ?? null;
  const isOwner = Boolean(
    user?.uid && listing.sellerId && user.uid === listing.sellerId,
  );
  // Listings store media as `media: [{ mediaType, mediaUrl }]` with the
  // cover mirrored to a top-level `mediaUrl`. There is no photoUrls field —
  // reading one meant no property photo ever rendered.
  const photo =
    listing.mediaUrl ??
    (listing.media ?? []).find((item) => item.mediaType !== "video")
      ?.mediaUrl ??
    null;
  // Each deal already carried a hue in the data and nothing used it.
  const dealColor = getRealEstateDeal(view.deal)?.color ?? EMERALD;

  return (
    <Card onPress={onOpen}>
      <CardTopRow>
        {/* A tinted plate with the deal's own glyph when there's no photo —
            a grey box with a grey outline icon told the reader nothing. */}
        <Thumb colors={THUMB_TINT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          {photo ? (
            <ThumbPhoto source={{ uri: photo }} resizeMode="cover" />
          ) : (
            <ThumbGlyph>{getRealEstateDealGlyph(view.deal)}</ThumbGlyph>
          )}
        </Thumb>
        <CardHeadCol>
          <HeadlineRow>
            <Headline>{view.headline}</Headline>
            <HeadlineUnit>{view.headlineUnit}</HeadlineUnit>
          </HeadlineRow>
          {view.subPrice ? <SubPrice>{view.subPrice}</SubPrice> : null}
        </CardHeadCol>
      </CardTopRow>

      <CardTitle numberOfLines={1}>{listing.title}</CardTitle>

      <FactRow>
        {!isLand && listing.rooms ? (
          <Fact>
            <Feather name="layout" size={13} color={dealColor} />
            <FactLabel>
              {t("realEstateFactRooms", { count: listing.rooms })}
            </FactLabel>
          </Fact>
        ) : null}
        {listing.surface ? (
          <Fact>
            <Feather name="maximize" size={13} color={dealColor} />
            <FactLabel>{listing.surface} m²</FactLabel>
          </Fact>
        ) : null}
        {isLand ? (
          <Fact>
            <Feather name="grid" size={13} color={dealColor} />
            <FactLabel>
              {listing.isLotti ? t("realEstateLotti") : t("realEstateNotLotti")}
            </FactLabel>
          </Fact>
        ) : null}
      </FactRow>

      {view.place ? (
        <PlaceRow>
          <Feather name="map-pin" size={11} color={colors.textMuted} />
          <PlaceLabel numberOfLines={1}>{view.place}</PlaceLabel>
        </PlaceRow>
      ) : null}

      <BadgeRow>
        {view.document ? (
          <DocBadge tint={view.tier.color}>
            <Feather
              name={view.document.feather}
              size={10}
              color={view.tier.color}
            />
            <DocBadgeLabel tint={view.tier.color}>
              {view.documentBadge}
            </DocBadgeLabel>
          </DocBadge>
        ) : null}
        {view.listerLabel ? (
          <ListerBadge verified={view.isVerifiedLister}>
            {view.isVerifiedLister ? (
              <Feather name="check-circle" size={10} color={EMERALD} />
            ) : null}
            <ListerBadgeLabel verified={view.isVerifiedLister}>
              {view.listerLabel}
            </ListerBadgeLabel>
          </ListerBadge>
        ) : null}
      </BadgeRow>

      {/* What the document actually confers, in words, under the badge —
          the tier is the whole point and a colour alone can't carry it. */}
      {view.documentNote ? <DocNote>{view.documentNote}</DocNote> : null}

      {isOwner ? null : (
        <ActionRow>
          {/* Always offered: an advertiser who published no number is still
            reachable this way, and a Call button on its own would open a
            sheet that can only say "no number". */}
          <MessageButton
            onPress={() =>
              openChat({
                listing,
                listingTitle: listing.title,
                user,
                navigation,
                t,
              })
            }
          >
            <Feather name="message-circle" size={14} color={EMERALD} />
            <MessageLabel>{t("realEstateMessageCta")}</MessageLabel>
          </MessageButton>
          {phone ? (
            <CallButton onPress={onContact}>
              <Feather name="phone" size={14} color="#ffffff" />
              <CallLabel>{t("callButtonLabel")}</CallLabel>
            </CallButton>
          ) : null}
          <SaveButton onPress={onToggleSave} hitSlop={6}>
            {/* Feather is stroke-only, so "saved" reads through colour rather
              than a filled variant. */}
            <Feather
              name="bookmark"
              size={15}
              color={saved ? EMERALD : colors.textMuted}
            />
          </SaveButton>
        </ActionRow>
      )}
    </Card>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Banner = styled(LinearGradient)`
  padding: ${spacing.sm}px ${spacing.md}px ${spacing.lg}px;
`;

const BannerTopRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
`;

const BannerBack = styled(Pressable)`
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background-color: rgba(255, 255, 255, 0.16);
`;

const BannerKicker = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  color: rgba(255, 255, 255, 0.82);
`;

const BannerTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 27px;
  letter-spacing: -0.5px;
  margin-top: ${spacing.sm}px;
  color: #ffffff;
`;

const BannerCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.88);
`;

const MapCard = styled.View`
  height: 200px;
  border-radius: ${radius.lg}px;
  overflow: hidden;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const MapNote = styled.Text`
  position: absolute;
  left: 10px;
  bottom: 10px;
  right: 10px;
  padding: 6px 9px;
  border-radius: ${radius.sm}px;
  overflow: hidden;
  font-family: ${fontFamily.medium};
  font-size: 10.5px;
  background-color: rgba(255, 255, 255, 0.92);
  color: #4d4d4f;
`;

const SheetSectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const OptionWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
`;

const OptionChip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 28%;
  align-items: center;
  padding: 11px 12px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.active ? EMERALD : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const RoomChip = styled(OptionChip)`
  flex-basis: 15%;
`;

const OptionChipLabel = styled.Text`
  font-family: ${(props) => (props.active ? fontFamily.bold : fontFamily.medium)};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

// Fixed above the list. Carries a hairline and the surface colour so the
// results visibly scroll *under* it rather than appearing to push it.
const Chrome = styled.View`
  padding: ${spacing.md}px 0 ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const dealTrackContentStyle = {
  flexDirection: "row",
  gap: 4,
  padding: 4,
};

const DealTrack = styled.ScrollView`
  flex-grow: 0;
  margin: 0 ${spacing.md}px ${spacing.md}px;
  border-radius: 17px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

// The moving pill, painted under the four labels.
const DealThumb = styled(Animated.View)`
  position: absolute;
  left: 4px;
  top: 4px;
  bottom: 4px;
  border-radius: 13px;
  background-color: ${EMERALD};
  shadow-color: #0b1f16;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.14;
  shadow-radius: 5px;
  elevation: 2;
`;

const DealTab = styled(Pressable)`
  width: 118px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 2px;
  border-radius: 13px;
`;

const DealTabActiveLayer = styled(Animated.View)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
`;

const DealGlyph = styled.Text`
  font-size: 13px;
`;

const DealTabLabel = styled.Text`
  font-family: ${(props) => (props.active ? fontFamily.bold : fontFamily.medium)};
  font-size: 11.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.textMuted)};
`;

const typeChipRowStyle = {
  paddingHorizontal: spacing.md,
  gap: 8,
  paddingBottom: spacing.sm,
};

// Scrolls rather than wraps: five types would take two rows on a narrow
// screen and push the search bar off the first fold.
const TypeChipRow = styled.ScrollView`
  flex-grow: 0;
`;

// Each type wears its own colour rather than all five turning the same
// green: a shop, a warehouse and a party hall are different kinds of place,
// and the colour is what lets the row be scanned instead of read. The
// selected chip fills with that colour and lifts; the rest keep it to a
// tinted disc behind the glyph.
const TypeChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 7px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.active ? props.accent : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? props.accent : props.theme.border)};
  shadow-color: ${(props) => props.accent};
  shadow-offset: 0px ${(props) => (props.active ? 4 : 0)}px;
  shadow-opacity: ${(props) => (props.active ? 0.3 : 0)};
  shadow-radius: ${(props) => (props.active ? 8 : 0)}px;
  elevation: ${(props) => (props.active ? 3 : 0)};
`;

const TypeChipDisc = styled.View`
  width: 26px;
  height: 26px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.tint};
`;

const TypeChipGlyph = styled.Text`
  font-size: 13px;
`;

const TypeChipLabel = styled.Text`
  font-family: ${(props) => (props.active ? fontFamily.bold : fontFamily.semiBold)};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const SearchWrap = styled.View`
  padding: 0 ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

// A fixed row rather than a horizontal scroll: three filters always fit,
// and scrolling left a ragged gap on the right that read as a mistake.
const FilterBar = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 0 ${spacing.md}px;
  margin-top: ${spacing.md}px;
`;

// A filter shows its own value when set — "Cotonou" rather than "Ville" —
// so the bar doubles as a summary of what is applied and there is no need
// for a second row of active-filter chips.
const FilterPill = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.active ? EMERALD : props.theme.surfaceAlt)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const FilterPillLabel = styled.Text`
  flex-shrink: 1;
  font-family: ${(props) => (props.active ? fontFamily.bold : fontFamily.medium)};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

// Icon-only and fixed width, so clearing filters never steals room from
// the three pills that always have to be readable.
const ClearPill = styled(Pressable)`
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const WarnBox = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 13px 14px;
  border-radius: ${radius.lg}px;
  margin-bottom: ${spacing.md}px;
  background-color: rgba(217, 164, 65, 0.09);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.4);
`;

const WarnText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${AMBER_TEXT};
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;

const CountText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SortLink = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const SortLinkLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  color: ${EMERALD};
`;

const Card = styled(Pressable)`
  padding: 14px;
  border-radius: 22px;
  margin-bottom: 14px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const CardTopRow = styled.View`
  flex-direction: row;
  gap: 13px;
`;

const Thumb = styled(LinearGradient)`
  width: 62px;
  height: 62px;
  border-radius: 18px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
`;

const ThumbGlyph = styled.Text`
  font-size: 25px;
`;

const ThumbPhoto = styled.Image`
  width: 100%;
  height: 100%;
`;

const CardHeadCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const HeadlineRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
`;

const Headline = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 19px;
  letter-spacing: -0.4px;
  color: ${(props) => props.theme.text};
`;

const HeadlineUnit = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${EMERALD};
`;

const SubPrice = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  margin-top: 4px;
  color: ${(props) => props.theme.textMuted};
`;

const CardTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  margin-top: 12px;
  color: ${(props) => props.theme.text};
`;

const FactRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 7px;
`;

const Fact = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const FactLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const PlaceRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
`;

const PlaceLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const BadgeRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
`;

const DocBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.tint};
`;

const DocBadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => props.tint};
`;

const ListerBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.verified ? props.theme.primaryLight : props.theme.surfaceAlt};
`;

const ListerBadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => (props.verified ? props.theme.primaryDark : props.theme.textMuted)};
`;

const DocNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 16px;
  margin-top: 8px;
  color: ${(props) => props.theme.textMuted};
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-top: 14px;
  padding-top: 13px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const CallButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 0;
  border-radius: 14px;
  background-color: ${EMERALD};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
`;

const MessageButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 0;
  border-radius: 14px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: rgba(11, 110, 79, 0.35);
`;

const MessageLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const SaveButton = styled(Pressable)`
  width: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SkeletonWrap = styled.View`
  padding: 14px;
  border-radius: 22px;
  margin-bottom: 14px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SkeletonTopRow = styled.View`
  flex-direction: row;
  gap: 13px;
  margin-bottom: 14px;
`;

const SkeletonThumb = styled.View`
  width: 62px;
  height: 62px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SkeletonCol = styled.View`
  flex: 1;
  justify-content: center;
  gap: 8px;
`;

const SkeletonBar = styled.View`
  width: ${(props) => props.width}%;
  height: ${(props) => props.height}px;
  border-radius: 6px;
  margin-bottom: 8px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const EmptyWrap = styled.View`
  align-items: center;
  padding: ${spacing.xl}px ${spacing.md}px;
  gap: 8px;
`;

const EmptyGlyph = styled.Text`
  font-size: 34px;
  margin-bottom: 4px;
`;

const PostCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 14px 15px;
  margin-top: 8px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PostIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const PostCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const PostTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const PostCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const EmptyAction = styled(Pressable)`
  margin-top: 6px;
  padding: 11px 20px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${EMERALD};
`;

const EmptyActionLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  text-align: center;
  line-height: 21px;
  color: ${(props) => props.theme.textMuted};
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.35);
`;

const Sheet = styled.View`
  max-height: 72%;
  padding: ${spacing.sm}px ${spacing.md}px ${spacing.xl}px;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  background-color: ${(props) => props.theme.background};
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.border};
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  margin-bottom: ${spacing.sm}px;
  color: ${(props) => props.theme.text};
`;

const SheetOption = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 13px 2px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SheetOptionLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.regular)};
  font-size: 14.5px;
  color: ${(props) => (props.selected ? props.theme.primaryDark : props.theme.text)};
`;

const SortRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 4px;
`;

const SortRowLabel = styled.Text`
  flex: 1;
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.regular)};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const RadioOuter = styled.View`
  width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  border-width: 2px;
  border-color: ${(props) => (props.selected ? EMERALD : props.theme.border)};
`;

const RadioInner = styled.View`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${EMERALD};
`;

const SheetActions = styled.View`
  padding-top: ${spacing.lg}px;
`;

const ApplyButton = styled(Pressable)`
  padding: 14px;
  border-radius: 20px;
  align-items: center;
  background-color: ${EMERALD};
`;

const ApplyLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: #ffffff;
`;

const ContactRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  border-radius: ${radius.lg}px;
  margin-bottom: 10px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const ContactIcon = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const ContactCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const ContactValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const ContactHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;
