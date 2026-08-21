import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Linking, Modal, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { SearchBar } from "../components/SearchBar";
import { mockRestaurants } from "../data/mockRestaurants";
import {
  getCuisine,
  getCuisineGradient,
  getCuisineLabel,
  getPriceBandSymbol,
  restaurantCuisines,
} from "../data/restaurantCuisines";
import { cities } from "../data/cities";
import { cityCoordinates } from "../data/cityCoordinates";
import { isOpenNow } from "../data/openingDays";
import { openListing } from "../utils/openListing";
import { buildLinkUrl } from "../data/restaurantLinks";
import { distanceInKm } from "../utils/geo";
import { queryMatches } from "../utils/search";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useApprovedListings } from "../hooks/useApprovedListings";
import { useI18n } from "../i18n/I18nContext";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// Past this, "near you" stops being true. Without it the card would offer a
// restaurant in Cotonou to someone on another continent and call it close,
// which is how a helpful feature turns into a wrong one.
const NEAREST_LIMIT_KM = 40;

const SORTS = [
  { key: "distance", labelKey: "restoSortDistance" },
  { key: "name", labelKey: "restoSortName" },
  { key: "price", labelKey: "restoSortPrice" },
];

const PRICE_ORDER = { budget: 0, mid: 1, high: 2 };

export function RestaurantsScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState("all");
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [sortBy, setSortBy] = useState("distance");
  const [cityFilter, setCityFilter] = useState(null);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  // Shown by default. Behind a toggle it was invisible in practice — a map
  // you have to discover is a map nobody uses. The toggle stays so it can be
  // collapsed when someone just wants the list.
  const [showMap, setShowMap] = useState(true);
  // The typed query drives the list immediately, but the map markers are
  // native views: rebuilding them on every keystroke tears down and
  // recreates map annotations faster than the platform copes with, which
  // is a native crash JavaScript never sees. The markers follow this
  // settled value instead.
  const [settledQuery, setSettledQuery] = useState("");

  const insets = useSafeAreaInsets();
  const { coords: userCoords, requestLocation } = useCurrentLocation();
  const liveListings = useApprovedListings();

  // Real, approved restaurant listings, mapped onto the shape the cards
  // already speak. Samples stay only while there are none — the moment a
  // real restaurant is published, the placeholders get out of the way
  // rather than padding the list alongside genuine entries.
  const source = useMemo(() => {
    const live = (liveListings ?? [])
      .filter((listing) => listing.categoryKey === "restaurants")
      .map((listing) => ({
        id: listing.id,
        name: language === "en" ? listing.titleEn : listing.titleFr,
        cuisine: listing.cuisine ?? "beninese",
        city: listing.city,
        area: listing.area ?? listing.city,
        priceBand: listing.priceBand ?? "mid",
        delivery: !!listing.hasDelivery,
        // The media picker was never gated by category, so a restaurant can
        // already upload a logo or photos — the card just wasn't showing it.
        mediaUrl: listing.mediaUrl ?? null,
        whatsapp: listing.whatsapp ?? null,
        // Kept so a real listing can open its own page in the app instead of
        // being handed off to a Maps search.
        raw: listing,
        openDays: listing.openDays ?? [],
        openTime: listing.openTime ?? null,
        closeTime: listing.closeTime ?? null,
        dishes: [],
        promoted: !!listing.isPromoted,
        verified: !!listing.sellerVerified,
        isSample: false,
      }));
    return live.length > 0 ? live : mockRestaurants;
  }, [liveListings, language]);

  const showingSamples = source === mockRestaurants;

  // Distance is attached up front so both the sort and the card labels read
  // it from one place. It's the one genuinely computed figure here — the
  // device's own position against the city's coordinates — which is why it
  // isn't stored on the sample data.
  const restaurants = useMemo(() => {
    const withDistance = source.map((item) => {
      const cityCoord = cityCoordinates[item.city];
      return {
        ...item,
        distanceKm: userCoords && cityCoord ? distanceInKm(userCoords, cityCoord) : null,
        // null means the owner didn't declare hours — which shows no badge
        // at all, rather than guessing "Fermé" and turning people away.
        openNow: isOpenNow(item.openDays, item.openTime, item.closeTime),
      };
    });

    const filtered = withDistance.filter((item) => {
      const matchesQuery = queryMatches(settledQuery, item.name, item.city, item.area);
      const matchesCuisine = cuisine === "all" || item.cuisine === cuisine;
      const matchesDelivery = !deliveryOnly || item.delivery;
      // Only excludes places known to be closed: one with no declared hours
      // stays in, because "unknown" is not "closed".
      const matchesOpen = !openOnly || item.openNow !== false;
      const matchesCity = !cityFilter || item.city === cityFilter;
      return matchesQuery && matchesCuisine && matchesDelivery && matchesOpen && matchesCity;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sortBy === "price") return PRICE_ORDER[a.priceBand] - PRICE_ORDER[b.priceBand];
      // Distance: a restaurant we can't measure sorts last rather than
      // first, which is what a null would do in a naive numeric compare.
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }, [source, settledQuery, cuisine, deliveryOnly, openOnly, cityFilter, sortBy, userCoords]);

  // The promoted row is lifted out of the list so it can't appear twice —
  // once in its own slot and again further down. It still respects every
  // active filter: a paid placement that ignores the cuisine you asked for
  // is an advert, not a result.
  const promoted = restaurants.find((item) => item.promoted) ?? null;

  // Open now AND closest — not merely closest. The list is already sorted by
  // distance, so a "nearest" card would just restate its first row in a
  // bigger box. What the sorted list cannot express is the intersection:
  // its top result is often the nearest place that happens to be shut, and
  // "where can I eat right now" is the question this screen gets opened
  // with. Deliberately separate from the paid slot too: a promotion is
  // chosen by payment, this by usefulness, and one card for both would make
  // an advert look like advice.
  const nearest = useMemo(() => {
    if (showingSamples) return null;
    // If the list is already filtered to open places and sorted by distance,
    // its first row IS "open now, closest" — the card would restate it. It
    // only earns its place when the list is ordered some other way, or still
    // contains closed places for it to cut through.
    if (openOnly && sortBy === "distance") return null;
    const candidate = restaurants.find(
      (item) =>
        !item.promoted &&
        item.openNow === true &&
        item.distanceKm != null &&
        item.distanceKm <= NEAREST_LIMIT_KM,
    );
    return candidate ?? null;
  }, [restaurants, showingSamples, openOnly, sortBy]);
  const ordinary = restaurants.filter((item) => !item.promoted && item.id !== nearest?.id);

  // Every city, with a count beside each. Filtering down to cities that
  // happen to have a restaurant today showed 5 of 61 and read as a
  // truncated list; showing "0" is more honest and lets someone check a
  // place rather than wonder why it's missing.
  const availableCities = useMemo(() => {
    const counts = new Map();
    for (const item of source) counts.set(item.city, (counts.get(item.city) ?? 0) + 1);
    return cities
      .filter((city) => queryMatches(citySearch, city))
      .map((city) => ({ city, count: counts.get(city) ?? 0 }));
  }, [citySearch, source]);

  // One marker per city, not per restaurant. Every restaurant in a city
  // shares that city's coordinates, so rendering a marker each stacked them
  // all on one point — only the last was visible or tappable, and the map
  // silently under-reported what was there.
  useEffect(() => {
    const id = setTimeout(() => setSettledQuery(query), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Markers come from the UNFILTERED source, not the filtered list.
  //
  // react-native-maps' AIRMap is a legacy (Paper) view running under the
  // New Architecture through RCTLegacyViewManagerInteropComponentView.
  // When its children change, that interop layer calls
  // -[AIRMap insertReactSubview:atIndex:] with an index its internal array
  // does not have, which throws NSRangeException and aborts the process —
  // a native crash JavaScript never sees. Typing re-filtered the list and
  // churned the markers, so the app died mid-search.
  //
  // Keeping the marker set constant sidesteps the insert/remove path
  // entirely. The pins already mark towns rather than venues (see the note
  // under the map), so showing every town that has a restaurant is honest
  // whichever way the list is filtered.
  const mapMarkers = useMemo(() => {
    const byCity = new Map();
    for (const item of source) {
      const coord = cityCoordinates[item.city];
      if (!coord) continue;
      byCity.set(item.city, {
        city: item.city,
        coord,
        count: (byCity.get(item.city)?.count ?? 0) + 1,
      });
    }
    return [...byCity.values()];
  }, [source]);

  const mapRegion = useMemo(() => {
    const anchor = cityFilter ? cityCoordinates[cityFilter] : null;
    const fallback = restaurants.length ? cityCoordinates[restaurants[0].city] : null;
    const center = anchor ?? userCoords ?? fallback ?? cityCoordinates.Cotonou;
    return { ...center, latitudeDelta: 0.14, longitudeDelta: 0.14 };
  }, [cityFilter, userCoords, restaurants]);

  const mapRef = useRef(null);
  const initialRegionRef = useRef(mapRegion);

  // Panning the map is the user's; re-centring is ours, and only when the
  // area they picked actually changes.
  //
  // `mapRegion` is a memo over `restaurants`, so it returns a brand new
  // object every time the filter changes — including on each keystroke.
  // Firing animateToRegion off object identity therefore started a fresh
  // 350ms native animation on top of the one still running, over and over
  // while someone typed. Comparing the centre by value keeps the stated
  // intent and makes the call happen once, when the centre really moves.
  const lastCenterRef = useRef(null);
  useEffect(() => {
    const centre = `${mapRegion.latitude},${mapRegion.longitude}`;
    if (lastCenterRef.current === centre) return;
    lastCenterRef.current = centre;
    mapRef.current?.animateToRegion(mapRegion, 350);
  }, [mapRegion]);

  // Same reasoning as BanksScreen: no verified street address, so this opens
  // a Maps *search* for the name rather than routing to a coordinate we'd
  // be inventing.
  // A sample has no business behind it. Sending someone to Maps to search
  // for an invented name either finds nothing or, worse, lands them on a
  // real unrelated restaurant — so tapping one says what it is instead.
  const openRestaurant = (restaurant) => {
    if (restaurant.raw) {
      openListing(navigation, restaurant.raw, t, language);
      return;
    }
    Alert.alert(t("restoSampleTitle"), t("restoSampleBody"));
  };

  // Sorting by distance with no fix is a no-op the user can't see, so
  // choosing it asks for location again — the same recovery ForYouScreen
  // uses on its own distance sort.
  const selectSort = (key) => {
    setSortBy(key);
    if (key === "distance" && !userCoords) requestLocation();
  };

  const selectCity = (city) => {
    setCityFilter(city);
    setCitySheetOpen(false);
    setCitySearch("");
  };

  return (
    <Container edges={["left", "right", "bottom"]}>
      {/* The gradient runs under the status bar, so 'top' comes off the
          SafeAreaView and is paid back as padding here. */}
      <Hero
        colors={[EMERALD, "#0a5e43"]}
        start={gradStart}
        end={gradEnd}
        style={{ paddingTop: insets.top + spacing.sm }}
      >
        <HeroTopRow>
          <HeroBack onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </HeroBack>
          <HeroFlag>
            <FlagGreen />
            <FlagRightCol>
              <FlagYellow />
              <FlagRed />
            </FlagRightCol>
          </HeroFlag>
          <HeroKicker>{t("restoHeroKicker")}</HeroKicker>
        </HeroTopRow>
        <HeroTitle>{t("menuRestaurantsRow")}</HeroTitle>
        <HeroCopy>{t("restoHeroCopy")}</HeroCopy>
      </Hero>

      <Body showsVerticalScrollIndicator={false} contentContainerStyle={bodyContentStyle}>
        {/* Area picker. Reads as one tappable row rather than a bare pill so
            the label above it can explain what the value means. */}
        <GeoRow onPress={() => setCitySheetOpen(true)}>
          <Ionicons name="location-outline" size={19} color={EMERALD} />
          <GeoTextCol>
            <GeoLabel>{t("restoAroundYou")}</GeoLabel>
            <GeoValue numberOfLines={1}>{cityFilter ?? t("restoAllAreas")}</GeoValue>
          </GeoTextCol>
          <GeoAction>{t("restoChangeArea")}</GeoAction>
          <Ionicons name="chevron-forward" size={15} color={EMERALD} />
        </GeoRow>

        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t("restoSearchPlaceholder")}
        />

        <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
          {restaurantCuisines.map((option) => {
            const active = cuisine === option.key;
            return (
              <CuisineChip
                key={option.key}
                selected={active}
                accent={option.color}
                onPress={() => setCuisine(option.key)}
              >
                <Ionicons name={option.icon} size={14} color={active ? "#ffffff" : option.color} />
                <CuisineChipLabel selected={active}>
                  {getCuisineLabel(option.key, language)}
                </CuisineChipLabel>
              </CuisineChip>
            );
          })}
        </ChipScroll>

        <ToggleRow>
          <DeliveryToggle selected={deliveryOnly} onPress={() => setDeliveryOnly((p) => !p)}>
            <Ionicons
              name="bicycle-outline"
              size={15}
              color={deliveryOnly ? EMERALD : colors.textMuted}
            />
            <ToggleLabel selected={deliveryOnly} numberOfLines={1}>
              {t("restoDeliveryFilter")}
            </ToggleLabel>
          </DeliveryToggle>

          <DeliveryToggle selected={openOnly} onPress={() => setOpenOnly((p) => !p)}>
            <Ionicons name="time-outline" size={15} color={openOnly ? EMERALD : colors.textMuted} />
            <ToggleLabel selected={openOnly} numberOfLines={1}>
              {t("restoOpenNowFilter")}
            </ToggleLabel>
          </DeliveryToggle>

          {/* This lived as a bare icon in the header, where nobody found it.
              A labelled pill beside the other filters says what it does. */}
          <DeliveryToggle selected={showMap} onPress={() => setShowMap((prev) => !prev)}>
            <Ionicons
              name={showMap ? "list-outline" : "map-outline"}
              size={15}
              color={showMap ? EMERALD : colors.textMuted}
            />
            <ToggleLabel selected={showMap} numberOfLines={1}>
              {t(showMap ? "restoShowList" : "restoShowMap")}
            </ToggleLabel>
          </DeliveryToggle>
        </ToggleRow>

        <SortRow>
          {SORTS.map((option) => (
            <SortOption
              key={option.key}
              selected={sortBy === option.key}
              onPress={() => selectSort(option.key)}
            >
              <SortLabel selected={sortBy === option.key}>{t(option.labelKey)}</SortLabel>
            </SortOption>
          ))}
        </SortRow>

        {showMap ? (
          <MapCard>
            <MapView ref={mapRef} style={mapStyle} initialRegion={initialRegionRef.current}>
              {mapMarkers.map((marker) => (
                <Marker
                  key={marker.city}
                  coordinate={marker.coord}
                  title={marker.city}
                  description={t("restoResultCount", { count: marker.count })}
                  onCalloutPress={() => selectCity(marker.city)}
                />
              ))}
            </MapView>
            {/* Every restaurant in a city shares that city's coordinates —
                there are no per-venue coordinates — so the pins mark the
                town, not the door. Saying so beats a pin that looks precise
                and isn't. */}
            <MapNote pointerEvents="none">
              <MapNoteLabel>{t("restoMapApproxNote")}</MapNoteLabel>
            </MapNote>
          </MapCard>
        ) : null}

        {showingSamples ? (
          <SampleNote>
            <SampleNoteIcon>
              <Ionicons name="information-circle-outline" size={15} color={EMERALD} />
            </SampleNoteIcon>
            <SampleNoteLabel>{t("restoSampleNote")}</SampleNoteLabel>
          </SampleNote>
        ) : null}

        {nearest ? (
          <NearestCard onPress={() => openRestaurant(nearest)}>
            <NearestIcon>
              <Ionicons name="navigate" size={18} color={EMERALD} />
            </NearestIcon>
            <NearestBody>
              <NearestKicker>{t("restoNearestKicker")}</NearestKicker>
              <NearestName numberOfLines={1}>{nearest.name}</NearestName>
              <NearestMeta numberOfLines={1}>
                {getCuisineLabel(nearest.cuisine, language)}
                {` · ${nearest.distanceKm.toFixed(1).replace(".", ",")} km`}
                {nearest.openTime && nearest.closeTime
                  ? ` · ${t("placeOpenUntil", { time: nearest.closeTime })}`
                  : ""}
              </NearestMeta>
            </NearestBody>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </NearestCard>
        ) : null}

        {promoted ? (
          <PromotedCard onPress={() => openRestaurant(promoted)}>
            <PromotedGradient colors={[EMERALD, "#0a5e43"]} start={gradStart} end={gradEnd}>
              {/* The picture leads. A featured slot that shows a generic
                  icon is a paid placement wasting the one thing that makes
                  someone choose a restaurant. */}
              {promoted.mediaUrl ? (
                <PromotedBanner>
                  <PromotedPhoto source={{ uri: promoted.mediaUrl }} resizeMode="contain" />
                </PromotedBanner>
              ) : (
                <PromotedBannerFallback>
                  <Ionicons
                    name={getCuisine(promoted.cuisine)?.icon ?? "restaurant-outline"}
                    size={34}
                    color="rgba(255, 255, 255, 0.85)"
                  />
                </PromotedBannerFallback>
              )}

              <PromotedBadge>
                <PromotedBadgeLabel>{t("restoPromotedBadge")}</PromotedBadgeLabel>
              </PromotedBadge>

              <PromotedName numberOfLines={1}>{promoted.name}</PromotedName>
              <PromotedMeta numberOfLines={1}>
                {getCuisineLabel(promoted.cuisine, language)}
                {promoted.priceBand ? ` · ${getPriceBandSymbol(promoted.priceBand)}` : ""}
                {` · ${promoted.area}`}
                {promoted.distanceKm != null
                  ? ` · ${promoted.distanceKm.toFixed(1).replace(".", ",")} km`
                  : ""}
              </PromotedMeta>

              {/* Everything else the card can answer without a tap. */}
              <PromotedTagRow>
                {promoted.openNow != null ? (
                  <PromotedTag>
                    <Ionicons name="time-outline" size={11} color="#ffffff" />
                    <PromotedTagLabel>
                      {t(promoted.openNow ? "placeOpenNow" : "placeClosedNow")}
                      {promoted.openTime && promoted.closeTime
                        ? ` · ${promoted.openTime}–${promoted.closeTime}`
                        : ""}
                    </PromotedTagLabel>
                  </PromotedTag>
                ) : null}
                {promoted.delivery ? (
                  <PromotedTag>
                    <Ionicons name="bicycle-outline" size={11} color="#ffffff" />
                    <PromotedTagLabel>{t("restoDeliveryTag")}</PromotedTagLabel>
                  </PromotedTag>
                ) : null}
                {buildLinkUrl("whatsapp", promoted.whatsapp) ? (
                  <PromotedTag>
                    <Ionicons name="logo-whatsapp" size={11} color="#ffffff" />
                    <PromotedTagLabel>WhatsApp</PromotedTagLabel>
                  </PromotedTag>
                ) : null}
                {promoted.dishes?.slice(0, 2).map((dish) => (
                  <PromotedTag key={dish}>
                    <PromotedTagLabel>{dish}</PromotedTagLabel>
                  </PromotedTag>
                ))}
              </PromotedTagRow>
            </PromotedGradient>
          </PromotedCard>
        ) : null}

        {/* A titled header with a count chip, rather than a lone grey
            number that read as one more muted line among several. */}
        <SectionHeader>
          <SectionTitle>{t("restoResultsTitle")}</SectionTitle>
          <CountChip>
            <CountChipLabel>{restaurants.length}</CountChipLabel>
          </CountChip>
        </SectionHeader>

        {/* All three slots, not just the list: with only `ordinary` and
            `promoted` checked, a result shown in the nearest card sat above
            an "aucun restaurant ne correspond" message contradicting it. */}
        {ordinary.length === 0 && !promoted && !nearest ? (
          <EmptyWrap>
            <Ionicons name="restaurant-outline" size={30} color={colors.textMuted} />
            <EmptyTitle>{t("restoEmptyTitle")}</EmptyTitle>
            <EmptyCopy>{t("restoEmptyCopy")}</EmptyCopy>
          </EmptyWrap>
        ) : (
          ordinary.map((item) => {
            const cuisineDef = getCuisine(item.cuisine);
            return (
              <RestoCard key={item.id} onPress={() => openRestaurant(item)}>
                {/* A colour-keyed edge, borrowed from the account-type cards
                    in the mockup. It gives a photo-less list a way to be
                    scanned by cuisine at a glance instead of by reading. */}
                <AccentEdge accent={cuisineDef?.color ?? EMERALD} />
                {/* contain, not cover: a restaurant's picture is often a logo
                    or a signboard, and cover crops whatever doesn't fit the
                    square — losing the sides of a wide logo or the top of a
                    dish. The tile is padded so the letterboxing reads as a
                    frame rather than a gap. */}
                {item.mediaUrl ? (
                  <RestoPhotoWrap>
                    <RestoPhoto source={{ uri: item.mediaUrl }} resizeMode="contain" />
                  </RestoPhotoWrap>
                ) : (
                  <RestoThumb
                    colors={getCuisineGradient(item.cuisine)}
                    start={gradStart}
                    end={gradEnd}
                  >
                    <Ionicons
                      name={cuisineDef?.icon ?? "restaurant-outline"}
                      size={27}
                      color="#ffffff"
                    />
                  </RestoThumb>
                )}
                <RestoBody>
                  {/* Name and price band share a baseline: the band is a
                      three-character glyph, and giving it its own line spent
                      a whole row on almost nothing. */}
                  <RestoNameRow>
                    <RestoName numberOfLines={1}>{item.name}</RestoName>
                    {item.openNow != null ? (
                      <OpenBadge open={item.openNow}>
                        <OpenBadgeLabel open={item.openNow}>
                          {t(item.openNow ? "placeOpenNow" : "placeClosedNow")}
                        </OpenBadgeLabel>
                      </OpenBadge>
                    ) : null}
                    <PriceBandChip>
                      <PriceBandLabel>{getPriceBandSymbol(item.priceBand)}</PriceBandLabel>
                    </PriceBandChip>
                  </RestoNameRow>
                  <RestoLocRow>
                    <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                    <RestoLocLabel numberOfLines={1}>
                      {getCuisineLabel(item.cuisine, language)} · {item.area}
                      {item.distanceKm != null
                        ? ` · ${item.distanceKm.toFixed(1).replace(".", ",")} km`
                        : ""}
                    </RestoLocLabel>
                  </RestoLocRow>
                  <TagRow>
                    {/* Nested inside the card's own Pressable: tapping the
                        badge messages them, tapping anywhere else opens the
                        listing. */}
                    {buildLinkUrl("whatsapp", item.whatsapp) ? (
                      <WhatsAppTag
                        onPress={() => Linking.openURL(buildLinkUrl("whatsapp", item.whatsapp))}
                        hitSlop={6}
                      >
                        <Ionicons name="logo-whatsapp" size={12} color="#ffffff" />
                        <WhatsAppTagLabel>WhatsApp</WhatsAppTagLabel>
                      </WhatsAppTag>
                    ) : null}
                    {item.delivery ? (
                      <DeliveryTag>
                        <Ionicons name="bicycle-outline" size={11} color={EMERALD} />
                        <DeliveryTagLabel>{t("restoDeliveryTag")}</DeliveryTagLabel>
                      </DeliveryTag>
                    ) : null}
                    {item.dishes.map((dish) => (
                      <DishTag key={dish}>
                        <DishTagLabel>{dish}</DishTagLabel>
                      </DishTag>
                    ))}
                  </TagRow>
                </RestoBody>
              </RestoCard>
            );
          })
        )}

        <OwnerHeading>{t("restoOwnerTitle")}</OwnerHeading>
        {/* Goes to Post-a-Listing, not the ad flow: the ad flow sells a
            promo banner, so an owner tapping this used to end up buying an
            advert instead of getting listed. */}
        <OwnerCard
          onPress={() =>
            navigation.navigate("MainTabs", {
              screen: "Sell",
              // Nested twice on purpose: the Sell tab opens SellerDashboard,
              // so params addressed to the tab stop there. Naming the inner
              // screen is what carries the category through to the form.
              params: { screen: "CreateListing", params: { categoryKey: "restaurants" } },
            })
          }
        >
          <OwnerIcon>
            <Ionicons name="restaurant" size={21} color={GOLD} />
          </OwnerIcon>
          <OwnerBody>
            <OwnerTitle>{t("restoOwnerCardTitle")}</OwnerTitle>
            <OwnerCopy>{t("restoOwnerCopy")}</OwnerCopy>
          </OwnerBody>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </OwnerCard>
      </Body>

      <Modal
        visible={citySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCitySheetOpen(false)}
      >
        {/* The sheet needs a parent with a real height for max-height to
            resolve against, and the dismiss area has to be absolute rather
            than a flex sibling — same structure as the city sheet in
            CreateListingScreen, which is why that one renders correctly. */}
        <SheetRoot>
          <SheetDismissArea onPress={() => setCitySheetOpen(false)} />
          <Sheet>
            <SheetHandle />
            <SheetTitle>{t("restoAreaSheetTitle")}</SheetTitle>
            <SheetSearchWrap>
              <SearchBar
                value={citySearch}
                onChangeText={setCitySearch}
                placeholder={t("searchCityPlaceholder")}
              />
            </SheetSearchWrap>
            <SheetScroll showsVerticalScrollIndicator={false}>
              <SheetRow onPress={() => selectCity(null)}>
                <Ionicons name="globe-outline" size={18} color={EMERALD} />
                <SheetRowLabel selected={!cityFilter}>{t("restoAllAreas")}</SheetRowLabel>
                {!cityFilter ? <Ionicons name="checkmark" size={18} color={EMERALD} /> : null}
              </SheetRow>
              {availableCities.map(({ city, count }) => (
                <SheetRow key={city} onPress={() => selectCity(city)}>
                  <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                  <SheetRowLabel selected={cityFilter === city}>{city}</SheetRowLabel>
                  <SheetCount>{count}</SheetCount>
                  {cityFilter === city ? (
                    <Ionicons name="checkmark" size={18} color={EMERALD} />
                  ) : null}
                </SheetRow>
              ))}
            </SheetScroll>
          </Sheet>
        </SheetRoot>
      </Modal>
    </Container>
  );
}

const bodyContentStyle = { padding: spacing.md, paddingBottom: spacing.xl };
const mapStyle = { flex: 1 };
const gradStart = { x: 0, y: 0 };
const gradEnd = { x: 1, y: 1 };

const Hero = styled(LinearGradient)`
  padding: ${spacing.sm}px ${spacing.md}px ${spacing.lg}px;
  border-bottom-left-radius: ${radius.xl}px;
  border-bottom-right-radius: ${radius.xl}px;
`;

const HeroTopRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const HeroBack = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: rgba(255, 255, 255, 0.16);
`;

// The same flag chip the sell and signup screens carry, so this reads as
// part of the app rather than a screen borrowed from somewhere else.
const HeroFlag = styled.View`
  flex-direction: row;
  width: 24px;
  height: 16px;
  border-radius: 3px;
  overflow: hidden;
`;

// Bénin, not Mali. Three equal vertical stripes of green/yellow/red is the
// Malian flag; Bénin is a green vertical band on the hoist with yellow over
// red stacked on the fly. Matches the BeninFlag already in CreateListing.
const FlagGreen = styled.View`
  width: 38%;
  background-color: #008751;
`;

const FlagRightCol = styled.View`
  flex: 1;
`;

const FlagYellow = styled.View`
  flex: 1;
  background-color: #fcd116;
`;

const FlagRed = styled.View`
  flex: 1;
  background-color: #e8112d;
`;

const HeroKicker = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  letter-spacing: 1.2px;
  color: rgba(255, 255, 255, 0.82);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 26px;
  color: #ffffff;
  letter-spacing: -0.3px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 18px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 6px;
  max-width: 280px;
`;

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Body = styled.ScrollView`
  flex: 1;
`;

const GeoRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 11px 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.primaryLight};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

const GeoTextCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const GeoLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10px;
  letter-spacing: 1.2px;
  color: ${(props) => props.theme.textMuted};
`;

const GeoValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-top: 2px;
`;

const GeoAction = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${EMERALD};
  margin-right: 2px;
`;

// Bleeds to the screen edges so a clipped chip signals more to scroll —
// same treatment as the jobs filter row.
const ChipScroll = styled.ScrollView.attrs(() => ({
  contentContainerStyle: { paddingHorizontal: spacing.md, paddingRight: spacing.lg },
}))`
  margin-horizontal: -${spacing.md}px;
  margin-top: ${spacing.md}px;
`;

const CuisineChip = styled(Pressable)`
  flex-shrink: 0;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: ${radius.pill}px;
  margin-right: ${spacing.sm}px;
  background-color: ${(props) => (props.selected ? props.accent : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? props.accent : props.theme.border)};
`;

const CuisineChipLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 12.5px;
  color: ${(props) => (props.selected ? "#ffffff" : props.theme.text)};
`;

// Filters sit ${spacing.sm} apart so chips, delivery and sort read as one
// cluster; the results block below opens with ${spacing.lg}. Everything was
// previously ${spacing.md} apart, which grouped nothing.
const ToggleRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.sm}px;
`;

// Each takes an equal share of the row rather than sizing to its label, so
// the three together span the full width — content-sized chips left a gap
// trailing off after the last one.
const DeliveryToggle = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.selected ? props.theme.primaryLight : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? EMERALD : props.theme.border)};
`;

const ToggleLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 12.5px;
  flex-shrink: 1;
  color: ${(props) => (props.selected ? props.theme.primaryDark : props.theme.text)};
`;

const SortRow = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-top: ${spacing.sm}px;
`;

const SortOption = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 9px 6px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => (props.selected ? props.theme.surface : "transparent")};
`;

const SortLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 12px;
  color: ${(props) => (props.selected ? props.theme.text : props.theme.textMuted)};
`;

const MapCard = styled.View`
  height: 200px;
  border-radius: ${radius.lg}px;
  overflow: hidden;
  margin-top: ${spacing.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const MapNote = styled.View`
  position: absolute;
  top: ${spacing.sm}px;
  left: ${spacing.sm}px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.92);
`;

const MapNoteLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 10.5px;
  color: #4d4d4f;
`;

const SampleNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.primaryLight};
  margin-top: ${spacing.lg}px;
`;

const SampleNoteIcon = styled.View`
  margin-top: 1px;
`;

const SampleNoteLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  margin: ${spacing.lg}px 2px ${spacing.sm}px;
`;

const SectionTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
`;

const CountChip = styled.View`
  padding: 3px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const CountChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

// The paid slot, styled to sit apart from the results rather than blend
// into them — a promotion that looks identical to an organic result is the
// thing that makes directories untrustworthy.
const NearestCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 14px;
  margin-top: ${spacing.lg}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${EMERALD};
`;

const NearestIcon = styled.View`
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const NearestBody = styled.View`
  flex: 1;
  min-width: 0;
`;

const NearestKicker = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10px;
  letter-spacing: 1.1px;
  color: ${(props) => props.theme.primaryDark};
  margin-bottom: 3px;
`;

const NearestName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const NearestMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const PromotedCard = styled(Pressable)`
  border-radius: ${radius.lg}px;
  overflow: hidden;
  margin-top: ${spacing.lg}px;
  ${shadow.card}
`;

const PromotedGradient = styled(LinearGradient)`
  padding: 14px;
`;

const PromotedBanner = styled.View`
  height: 128px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  padding: 6px;
  margin-bottom: 12px;
  background-color: rgba(255, 255, 255, 0.14);
`;

const PromotedBannerFallback = styled.View`
  height: 128px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  background-color: rgba(255, 255, 255, 0.14);
`;

const PromotedPhoto = styled(Image)`
  width: 100%;
  height: 100%;
`;

const PromotedBadge = styled.View`
  align-self: flex-start;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${GOLD};
  margin-bottom: 7px;
`;

const PromotedBadgeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 9.5px;
  letter-spacing: 1px;
  color: #1c1c1e;
`;

const PromotedName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 17px;
  color: #ffffff;
`;

const PromotedMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  margin-top: 4px;
`;

const PromotedTagRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
`;

const PromotedTag = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.18);
`;

const PromotedTagLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: #ffffff;
`;

const RestoCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 13px 14px 13px 17px;
  border-radius: ${radius.lg}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const AccentEdge = styled.View`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background-color: ${(props) => props.accent};
`;

// The owner's own photo when there is one; the cuisine gradient only as a
// fallback. Same footprint either way so the row height never jumps.
const RestoPhotoWrap = styled.View`
  width: 76px;
  height: 76px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RestoPhoto = styled(Image)`
  width: 100%;
  height: 100%;
`;

const RestoThumb = styled(LinearGradient)`
  width: 76px;
  height: 76px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
`;

const RestoBody = styled.View`
  flex: 1;
  min-width: 0;
`;

const RestoNameRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const RestoName = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const OpenBadge = styled.View`
  padding: 3px 8px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.open ? props.theme.primaryLight : props.theme.surfaceAlt)};
`;

const OpenBadgeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => (props.open ? props.theme.primaryDark : props.theme.textMuted)};
`;

const PriceBandChip = styled.View`
  padding: 3px 8px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const PriceBandLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

const RestoLocRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
`;

const RestoLocLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const TagRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const DeliveryTag = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const DeliveryTagLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => props.theme.primaryDark};
`;

const WhatsAppTag = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: #25d366;
`;

const WhatsAppTagLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: #ffffff;
`;

const DishTag = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const DishTagLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const EmptyWrap = styled.View`
  align-items: center;
  padding: ${spacing.xl}px ${spacing.md}px;
  gap: ${spacing.xs}px;
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.xs}px;
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
`;

const OwnerHeading = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin: ${spacing.lg}px 2px ${spacing.sm}px;
`;

// Dashed rather than solid: it isn't a result, it's an invitation, and the
// broken edge is what stops it reading as one more restaurant in the list.
const OwnerCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding: 17px 16px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-style: dashed;
  border-color: ${(props) => props.theme.border};
`;

const OwnerIcon = styled.View`
  width: 46px;
  height: 46px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: rgba(217, 164, 65, 0.16);
`;

const OwnerBody = styled.View`
  flex: 1;
  min-width: 0;
`;

const OwnerTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const OwnerCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const SheetRoot = styled.View`
  flex: 1;
  justify-content: flex-end;
`;

const SheetDismissArea = styled(Pressable)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  background-color: rgba(0, 0, 0, 0.4);
`;

const Sheet = styled.View`
  max-height: 80%;
  padding: ${spacing.sm}px ${spacing.md}px ${spacing.lg}px;
  border-top-left-radius: ${radius.xl}px;
  border-top-right-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.background};
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.border};
  align-self: center;
  margin-bottom: ${spacing.sm}px;
`;

const SheetTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const SheetSearchWrap = styled.View`
  margin-bottom: ${spacing.xs}px;
`;

// No flex-grow: 0 here — that collapsed the list to nothing inside a parent
// that has no fixed height of its own.
// flex-shrink is what makes this scroll: inside a max-height parent a
// ScrollView otherwise grows to its content height and is simply clipped,
// so every city past the fold was unreachable rather than scrollable.
const SheetScroll = styled.ScrollView.attrs(() => ({
  keyboardShouldPersistTaps: "handled",
}))`
  flex-shrink: 1;
`;

const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 13px 4px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SheetCount = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const SheetRowLabel = styled.Text`
  flex: 1;
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;
