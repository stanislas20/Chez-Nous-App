import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { ListingCard } from "../components/ListingCard";
import { CategoryPlaceholder } from "../components/CategoryPlaceholder";
import {
  PhoneCallButtons,
  splitPhoneNumbers,
} from "../components/PhoneCallButtons";
import { SearchBar } from "../components/SearchBar";
import { mockListings } from "../data/mockListings";
import { cities } from "../data/cities";
import { useCategoryListings } from "../hooks/useCategoryListings";
import {
  useDebouncedValue,
  useListingsSearch,
} from "../hooks/useListingsSearch";
import {
  customCategoriesFrom,
  foldCategoryLabel,
  listingSearchParts,
} from "../data/customCategories";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { openListing } from "../utils/openListing";
import { usePlacePhotoUrl } from "../utils/placePhoto";
import { useNearbyPharmacies } from "../hooks/useNearbyPharmacies";
import { useSearchPharmacies } from "../hooks/useSearchPharmacies";
import { useI18n } from "../i18n/I18nContext";
import { countContact } from "../utils/contactCount";
import { cityCoordinates } from "../data/cityCoordinates";
import { serviceTrades } from "../data/serviceTrades";
import { SectionHeading } from "../components/SectionHeading";
import { RailChip } from "../components/RailChip";
import { distanceInKm } from "../utils/geo";
import { getDutyLabel } from "../utils/pharmacyDuty";
import { queryMatches } from "../utils/search";
import { compareNames } from "../utils/collate";
import { SearchResultNote } from "../components/SearchResultNote";

const pharmacyMark = require("../../assets/pharmacy-mark.png");

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

// SectionList has no numColumns, so the two-per-row grid is cut by hand.
// A trailing odd card needs no filler: ListingCard is width 47% inside a
// space-between row, so it sits left at its own width — the same thing
// columnWrapperStyle did with an odd last row.
// The bucket for listings that declared no trade.
//
// A string, not a Symbol. It reaches SectionList as `section.key`, and React
// coerces keys to strings — a Symbol throws "Cannot convert a Symbol value
// to a string" the moment the section renders. The sentinel is prefixed so
// it cannot be mistaken for one of the form's own keys, which are plain
// words from serviceTrades.
const UNTYPED_TRADE = "__untyped";

const GRID_COLUMNS = 2;

// Same reasoning as LocalScreen: uneven sections mean the largest trade
// buries every trade under it. Three rows shows what a trade holds without
// spending the whole screen on it. Lifted once a trade is chosen, because
// then the reader has asked for exactly that.
const SECTION_PREVIEW_ROWS = 3;

function chunkIntoRows(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += GRID_COLUMNS) {
    rows.push(items.slice(index, index + GRID_COLUMNS));
  }
  return rows;
}
const emptyScrollContentStyle = { flexGrow: 1 };
const sheetScrollContentStyle = { paddingHorizontal: spacing.md };

// "Mis à jour il y a X min" — only rendered when the listing actually has a
// real Firestore createdAt timestamp (mock data has none, so this quietly
// renders nothing rather than fabricating a freshness claim).
function formatPharmacyFreshness(createdAt, t) {
  const date = createdAt?.toDate?.();
  if (!date) return null;
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return t("pharmacyUpdatedJustNow");
  if (minutes < 60) return t("pharmacyUpdatedMinutesAgo", { minutes });
  const hours = Math.floor(minutes / 60);
  return t("pharmacyUpdatedHoursAgo", { hours });
}

// Dials a pharmacy's phone number(s) from a compact list row. A single
// number dials straight away (with Android's own confirm dialog, matching
// PhoneCallButtons); multiple slash-separated numbers show a picker so the
// user chooses which one, since there's no room here for separate chips.
function callPharmacy(phone, t, listing) {
  // A pharmacy is a directory entry rather than something for sale, but the
  // number belongs to it and somebody ringing it at two in the morning is
  // the clearest signal this app ever gets that the entry was worth having.
  countContact(listing);
  const numbers = splitPhoneNumbers(phone);
  if (numbers.length === 0) return;

  const dial = (number) => {
    if (Platform.OS !== "android") {
      Linking.openURL(`tel:${number}`);
      return;
    }
    Alert.alert(
      t("confirmCallTitle", { phone: number }),
      t("confirmCallMessage"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("callButtonLabel"),
          onPress: () => Linking.openURL(`tel:${number}`),
        },
      ],
    );
  };

  if (numbers.length === 1) {
    dial(numbers[0]);
    return;
  }

  Alert.alert(t("callButtonLabel"), undefined, [
    ...numbers.map((number) => ({ text: number, onPress: () => dial(number) })),
    { text: t("cancel"), style: "cancel" },
  ]);
}

// Groups listings by city (alphabetically) into a flat list of header/item
// entries for a single-column directory-style list.
function groupByCity(listings, distanceById) {
  const byCity = new Map();
  for (const listing of listings) {
    const city = listing.city || "—";
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push(listing);
  }
  const cityNames = [...byCity.keys()].sort(compareNames);

  const rows = [];
  for (const city of cityNames) {
    const items = byCity.get(city);
    rows.push({
      type: "header",
      key: `header-${city}`,
      city,
      count: items.length,
    });
    for (const listing of items) {
      rows.push({
        type: "item",
        key: listing.id,
        listing,
        distance: distanceById?.get(listing.id) ?? null,
      });
    }
  }
  return rows;
}

// Flat, distance-sorted alternative to groupByCity — closest pharmacies
// first, no city headers. Listings whose city has no known coordinates
// (so distance can't be computed) are left out, since there'd be nothing
// real to sort them by.
function sortByDistance(listings, distanceById) {
  return listings
    .map((listing) => ({
      listing,
      distance: distanceById?.get(listing.id) ?? null,
    }))
    .filter((entry) => entry.distance != null)
    .sort((a, b) => a.distance - b.distance)
    .map(({ listing, distance }) => ({
      type: "item",
      key: listing.id,
      listing,
      distance,
    }));
}

function PharmacyRow({ listing, distance }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { language, t } = useI18n();
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const duty = getDutyLabel(listing, language, t);

  return (
    <PharmacyRowContainer
      onPress={() => openListing(navigation, listing, t, language)}
    >
      <PharmacyRowBody>
        <PharmacyRowTitle numberOfLines={1}>{title}</PharmacyRowTitle>
        {duty.text ? (
          <DutyBadgeRow>
            <DutyDot stale={duty.isStale} />
            <PharmacyRowDutyText stale={duty.isStale} numberOfLines={1}>
              {duty.text}
            </PharmacyRowDutyText>
          </DutyBadgeRow>
        ) : null}
        <NearestDistanceText numberOfLines={1}>
          {listing.city}
          {distance != null
            ? ` · ${t("nearestPharmacyDistance", { distance: distance.toFixed(1) })}`
            : ""}
        </NearestDistanceText>
      </PharmacyRowBody>
      {listing.phone ? (
        <RowCallButton
          onPress={() => callPharmacy(listing.phone, t, listing)}
          hitSlop={6}
        >
          <Ionicons name="call" size={14} color={colors.textInverse} />
          <RowCallButtonLabel>{t("callButtonLabel")}</RowCallButtonLabel>
        </RowCallButton>
      ) : null}
    </PharmacyRowContainer>
  );
}

// A real, live pharmacy from Google Places — not part of the ONPB on-duty
// roster, just an ordinary nearby pharmacy the user might be searching for.
function NearbyPharmacyRow({ place }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  // Resolved through the Places proxy rather than built from a key in
  // the bundle. Null until it arrives, which the row below already
  // handles — a pharmacy without a photograph is the ordinary case.
  const photoUrl = usePlacePhotoUrl(place.photoName, 240);

  const handleDirections = () => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`,
    );
  };

  return (
    <PharmacyRowContainer onPress={handleDirections}>
      {/* Google's own photo of this exact place. It carries the
          contributor's credit, which their terms require wherever the photo
          appears — no credit available means no photo, not an uncredited
          one. */}
      {photoUrl ? (
        <PharmacyThumb>
          <PharmacyPhoto source={{ uri: photoUrl }} resizeMode="cover" />
          <PhotoCredit numberOfLines={1}>{place.photoAttribution}</PhotoCredit>
        </PharmacyThumb>
      ) : (
        <PharmacyThumb>
          <CategoryPlaceholder icon="storefront-outline" size="card" />
        </PharmacyThumb>
      )}
      <PharmacyRowBody>
        <PharmacyRowTitle numberOfLines={1}>{place.name}</PharmacyRowTitle>
        {place.address ? (
          <PharmacyRowPhone numberOfLines={1}>{place.address}</PharmacyRowPhone>
        ) : null}
        {place.distance != null ? (
          <NearestDistanceText>
            {t("nearestPharmacyDistance", {
              distance: place.distance.toFixed(1),
            })}
          </NearestDistanceText>
        ) : null}
        {place.isOpenNow != null || place.rating != null ? (
          <NearbyMetaRow>
            {place.isOpenNow != null ? (
              <NearbyOpenBadge open={place.isOpenNow}>
                <NearbyOpenBadgeText open={place.isOpenNow}>
                  {place.isOpenNow ? t("placeOpenNow") : t("placeClosedNow")}
                </NearbyOpenBadgeText>
              </NearbyOpenBadge>
            ) : null}
            {place.rating != null ? (
              <NearbyRatingRow>
                <Ionicons name="star" size={11} color={colors.accentDark} />
                <NearbyRatingText>{place.rating.toFixed(1)}</NearbyRatingText>
              </NearbyRatingRow>
            ) : null}
          </NearbyMetaRow>
        ) : null}
        {place.phone ? (
          // fit: this sits inside the row's flex:1 body, which is a column
          // and stretches what it holds — a Google Places number is nearly
          // always a single one, so without this "Appeler" spans the whole
          // body with its label adrift in the centre.
          <PhoneCallButtons
            phone={place.phone}
            fit
            style={{ marginTop: spacing.xs }}
          />
        ) : null}
      </PharmacyRowBody>
      <NearbyDirectionsButton onPress={handleDirections} hitSlop={8}>
        <Ionicons name="navigate" size={17} color={colors.textInverse} />
      </NearbyDirectionsButton>
    </PharmacyRowContainer>
  );
}

function NearestPharmacyCard({ status, nearest, onRequestLocation }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { language, t } = useI18n();

  if (status === "idle" || status === "locating") {
    return (
      <NearestCard>
        <ActivityIndicator color={colors.primary} />
        <NearestLocatingText>
          {t("nearestPharmacyLocating")}
        </NearestLocatingText>
      </NearestCard>
    );
  }

  if (status === "denied" || status === "error") {
    return (
      <NearestCard>
        <NearestLocatingText>
          {status === "denied"
            ? t("nearestPharmacyPermissionDenied")
            : t("nearestPharmacyUnavailable")}
        </NearestLocatingText>
        <EnableLocationButton onPress={onRequestLocation}>
          <Ionicons
            name="locate-outline"
            size={15}
            color={colors.textInverse}
          />
          <EnableLocationButtonLabel>
            {t("nearestPharmacyEnableLocation")}
          </EnableLocationButtonLabel>
        </EnableLocationButton>
      </NearestCard>
    );
  }

  if (!nearest) return null;

  const { listing, distance } = nearest;
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const duty = getDutyLabel(listing, language, t);
  const cityCoord = cityCoordinates[listing.city];
  const freshnessText = formatPharmacyFreshness(listing.createdAt, t);

  const handleDirections = () => {
    if (!cityCoord) return;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${cityCoord.latitude},${cityCoord.longitude}`,
    );
  };

  return (
    <NearestCard
      highlighted
      onPress={() => openListing(navigation, listing, t, language)}
    >
      <NearestKicker>{t("nearestPharmacyTitle")}</NearestKicker>
      <NearestBodyRow>
        <HeroIconBox>
          {/* The coupe d'Hygie, not a first-aid case. "medkit" is a doctor's
              bag; the sign over a pharmacie here is the serpent and the
              chalice. Drawn in scripts/make-pharmacy-mark.py — there is no
              react-native-svg in this project, so it ships as an asset. */}
          <PharmacyMark source={pharmacyMark} resizeMode="contain" />
        </HeroIconBox>
        <PharmacyRowBody>
          <NearestName numberOfLines={1}>{title}</NearestName>
          {duty.text ? (
            <DutyBadgeRow>
              <DutyDot stale={duty.isStale} />
              <PharmacyRowDutyText stale={duty.isStale} numberOfLines={1}>
                {duty.text}
              </PharmacyRowDutyText>
            </DutyBadgeRow>
          ) : null}
          <NearestDistanceText>
            {listing.city} ·{" "}
            {t("nearestPharmacyDistance", { distance: distance.toFixed(1) })}
          </NearestDistanceText>
        </PharmacyRowBody>
      </NearestBodyRow>
      {/* One wrapping row for every action, two to a line, each taking an
          equal share of it. `flow` hands the numbers over as bare siblings
          rather than inside their own row, so "Obtenir l'itinéraire" is part
          of the same sequence and takes the place beside the last chip; the
          shared basis is what makes the two halves match instead of each
          button being as wide as its own label happened to be. */}
      <NearestActionsColumn>
        {listing.phone ? (
          <PhoneCallButtons
            listing={listing}
            phone={listing.phone}
            size="md"
            flow
            itemStyle={actionGridItem}
          />
        ) : null}
        {cityCoord ? (
          <NearestActionButton
            secondary
            style={actionGridItem}
            onPress={handleDirections}
          >
            <Ionicons
              name="navigate-outline"
              size={15}
              color={colors.primary}
            />
            <NearestActionButtonLabel secondary>
              {t("getDirectionsButton")}
            </NearestActionButtonLabel>
          </NearestActionButton>
        ) : null}
      </NearestActionsColumn>
      <NearestBrowseAllText>
        {t("nearestPharmacyBrowseAll")}
      </NearestBrowseAllText>
      {freshnessText ? (
        <NearestFreshnessText>{freshnessText}</NearestFreshnessText>
      ) : null}
    </NearestCard>
  );
}

// One reading of the departments param, used by both the initial state and
// the later re-sync. Two copies of this would be two chances to disagree
// about what an empty or malformed value means.
//
// Arrives comma-joined because FCM data values must be strings; an array is
// accepted too so a direct navigate() is not a special case.
function parseDepartments(raw) {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const cleaned = list.map((name) => name.trim()).filter(Boolean);
  return cleaned.length ? cleaned : null;
}

export function CategoryListingsScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { categoryKey, labelEn, labelFr } = route.params;
  const { language, t } = useI18n();
  const categoryLabel = language === "en" ? labelEn : labelFr;
  // Seeded when another screen opens this category with a search already in
  // mind — the car-services tiles land here with "garage", "pneu" and so on.
  const [query, setQuery] = useState(route.params?.initialQuery ?? "");
  const [refreshing, setRefreshing] = useState(false);
  // Departments a roster notification asked us to scope to.
  //
  // Both pharmacy notifications are about the live duty roster, so both
  // opened this screen — and landed on the same unfiltered list of 200,
  // which made two different messages produce one identical outcome. The
  // notification knows which regions it concerns; this is where that
  // survives into the view.
  //
  // State rather than a bare route param so it can be cleared: arriving in a
  // filtered list with no way out is how somebody concludes the other
  // pharmacies are gone.
  const rawDepartments = route.params?.departments;
  const [departmentFilter, setDepartmentFilter] = useState(() =>
    parseDepartments(rawDepartments),
  );

  // Re-scope when a LATER notification names different departments.
  //
  // departmentFilter was initialised from route.params once, and a lazy
  // useState initialiser runs only at mount. Opening a second roster
  // notification while this screen is already the focused route merges the
  // new params and nothing else happens: the reader taps a Littoral
  // notification and keeps looking at Ouémé and Plateau. The notification
  // routed correctly and the screen ignored it.
  //
  // Keyed on the PARAM VALUE, not on every render, and that distinction is
  // the whole difficulty. Re-reading params each render would undo the
  // clearable chip — tapping X sets the filter to null, the next ordinary
  // render would read the unchanged param and put it straight back, and the
  // X would look broken. So the last value actually synced is remembered,
  // seeded with what the initialiser already consumed so mount does not
  // apply it twice.
  const lastSyncedDepartments = useRef(rawDepartments);
  useEffect(() => {
    if (rawDepartments === lastSyncedDepartments.current) return;
    lastSyncedDepartments.current = rawDepartments;
    setDepartmentFilter(parseDepartments(rawDepartments));
  }, [rawDepartments]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  // Two lists, not one long scroll. "Autres pharmacies" used to sit below
  // every on-duty pharmacy in the country — often a hundred rows down and in
  // practice unreachable. Duty stays the default because it is the urgent
  // one; nearby is now one tap away instead of a scroll away.
  const [pharmacyTab, setPharmacyTab] = useState("duty");
  const [citySearch, setCitySearch] = useState("");
  const [sortMode, setSortMode] = useState("distance"); // 'distance' | 'city'
  const groupByLocation = categoryKey === "pharmacyOnDuty";
  // Services is one category holding a dozen unrelated jobs — a mechanic, a
  // customs broker, a driving school and an importer in Brussels all publish
  // under it, and they arrived in one undifferentiated grid. Grouping by the
  // trade the form already records is the only division the data supports;
  // every other category has no comparable sub-key, which is why this is
  // scoped to services rather than applied to all of them.
  const groupByTrade = categoryKey === "services";
  const [selectedTrade, setSelectedTrade] = useState(null);
  // Everything a seller could not find a category for arrives here, in one
  // aisle. Their own words are the only thing separating a saxophone from a
  // welding torch, so those words become the filter.
  const isOtherCategory = categoryKey === "other";
  const [customFilter, setCustomFilter] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: categoryLabel });
  }, [navigation, categoryLabel]);

  // The category this screen is for, asked for by name.
  //
  // It used to read every approved listing in the database and keep the ones
  // whose categoryKey matched — on a screen whose entire purpose is one
  // category, and which is reached by tapping that category's own tile.
  //
  // Not paginated by scroll, because this screen has four different list
  // shapes underneath it (a pharmacy roster grouped by city, a services list
  // grouped by trade, the "Autre" aisle grouped by custom label, and a plain
  // grid) and all four group the whole set before rendering. Bounding the
  // read to the category is the change that matters here; a cursor through
  // grouped sections would reshuffle the groups as pages landed.
  const {
    listings: liveListings,
    status: listingsStatus,
    hasMore: hasMoreInCategory,
    isLoadingMore: loadingMoreInCategory,
    loadMore: loadMoreInCategory,
  } = useCategoryListings(categoryKey);

  // See the note on `listings` below. Debounced so typing does not become a
  // query per character.
  const debouncedQuery = useDebouncedValue(query);
  const searchFilters = useMemo(
    () => [{ field: "categoryKey", value: categoryKey }],
    [categoryKey],
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
  const allListings =
    liveListings ?? (listingsStatus === "unconfigured" ? mockListings : []);
  const categoryListings = allListings.filter(
    (listing) =>
      listing.categoryKey === categoryKey &&
      // "Pharmacie de garde" is the rotating on-duty roster — pharmacies
      // permanently mandated to stay open every day belong to a separate
      // ONPB designation and shouldn't crowd out the current rotation.
      !(categoryKey === "pharmacyOnDuty" && listing.isPermanentDuty),
  );

  // Has the whole rotation lapsed?
  //
  // ONPB publishes weekly and sometimes simply stops — nineteen days, once,
  // with the sync running perfectly and correctly reporting there was nothing
  // to fetch. When that happens every card falls back to "last known
  // schedule, call to confirm", which is honest but a dead end: the reader is
  // holding a three-week-old list at two in the morning with nowhere to go.
  //
  // Permanent-duty pharmacies are excluded above, so if nothing here is still
  // in date, the rotation itself has run out.
  const rosterLapsed = useMemo(() => {
    if (categoryKey !== "pharmacyOnDuty" || categoryListings.length === 0) {
      return false;
    }
    const now = Date.now();
    return !categoryListings.some((listing) => {
      const until = listing.dutyUntil?.toDate?.();
      return until && until.getTime() > now;
    });
  }, [categoryKey, categoryListings]);

  // The same list the publish form offers, built from the same function, so
  // the chip a seller tapped is the chip a buyer taps. Commonest first.
  const customAisles = useMemo(
    () => (isOtherCategory ? customCategoriesFrom(categoryListings) : []),
    [isOtherCategory, categoryListings],
  );

  const aisleFilteredListings =
    isOtherCategory && customFilter
      ? categoryListings.filter(
          (listing) => foldCategoryLabel(listing.customCategory) === customFilter,
        )
      : categoryListings;

  // Applied before the city grouping, because a department contains many
  // cities and the two narrow in that order.
  const departmentFilteredListings = departmentFilter
    ? aisleFilteredListings.filter((listing) =>
        departmentFilter.includes(listing.department),
      )
    : aisleFilteredListings;

  const cityFilteredListings =
    groupByLocation && selectedCity
      ? departmentFilteredListings.filter(
          (listing) => listing.city === selectedCity,
        )
      : departmentFilteredListings;

  // Searching this aisle asks Firestore for the whole aisle, not the 200 that
  // happen to be loaded. Phase C measured a listing in this very category
  // that could not be found because it sat outside the cap.
  //
  // The category travels with the query, so a search here stays a search
  // here. The city filter is applied locally afterwards for the same reason
  // it is applied locally in browse: this screen's city selection is a
  // display grouping rather than a query, and only the pharmacy roster uses
  // it at all.
  const listings = useMemo(() => {
    if (!isSearchMode) return cityFilteredListings;
    const rows = searchResults ?? [];
    return selectedCity
      ? rows.filter((listing) => listing.city === selectedCity)
      : rows;
  }, [isSearchMode, searchResults, cityFilteredListings, selectedCity]);

  // Ordered by serviceTrades — the same order and the same names the posting
  // form offers — so a trade is called one thing where it is published and
  // the same thing where it is browsed.
  //
  // Listings that declared no trade are real and must not vanish: they are
  // the ones published before the form recorded it, plus anyone who reached
  // Services without coming through a trade screen. They get a section of
  // their own at the end rather than being dropped or silently folded into
  // somebody else's.
  const tradeSections = useMemo(() => {
    if (!groupByTrade) return [];
    const byTrade = new Map();
    const scoped = selectedTrade
      ? listings.filter(
          (listing) => (listing.trade ?? UNTYPED_TRADE) === selectedTrade,
        )
      : listings;
    for (const listing of scoped) {
      const key = listing.trade ?? UNTYPED_TRADE;
      const bucket = byTrade.get(key);
      if (bucket) bucket.push(listing);
      else byTrade.set(key, [listing]);
    }

    const build = (key, title, items) => {
      const rows = chunkIntoRows(items);
      const capped = selectedTrade ? rows : rows.slice(0, SECTION_PREVIEW_ROWS);
      return {
        key,
        title,
        total: items.length,
        hidden: items.length - capped.flat().length,
        data: capped,
      };
    };

    const sections = serviceTrades
      .filter((trade) => byTrade.has(trade.key))
      .map((trade) => build(trade.key, t(trade.labelKey), byTrade.get(trade.key)));

    // Anything with a trade string the form no longer offers keeps its raw
    // key as a heading — visible and odd, rather than missing and silent.
    const named = new Set(serviceTrades.map((trade) => trade.key));
    for (const [key, items] of byTrade) {
      if (key === UNTYPED_TRADE || named.has(key)) continue;
      sections.push(build(key, key, items));
    }

    const untyped = byTrade.get(UNTYPED_TRADE);
    if (untyped) {
      sections.push(
        build(UNTYPED_TRADE, t("categoryListingsOtherTrades"), untyped),
      );
    }
    return sections;
  }, [groupByTrade, listings, t, selectedTrade]);

  // Counted off the unscoped list, so every trade keeps its count when one
  // of them is selected and the rail stays a way back to the others.
  const tradeRail = useMemo(() => {
    if (!groupByTrade) return [];
    const counts = new Map();
    for (const listing of listings) {
      const key = listing.trade ?? UNTYPED_TRADE;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const rail = serviceTrades
      .filter((trade) => counts.has(trade.key))
      .map((trade) => ({
        key: trade.key,
        icon: trade.icon,
        label: t(trade.labelKey),
        count: counts.get(trade.key),
      }));
    if (counts.has(UNTYPED_TRADE)) {
      rail.push({
        key: UNTYPED_TRADE,
        icon: "ellipsis-horizontal-circle-outline",
        label: t("categoryListingsOtherTrades"),
        count: counts.get(UNTYPED_TRADE),
      });
    }
    return rail;
  }, [groupByTrade, listings, t]);

  const {
    status: locationStatus,
    coords,
    requestLocation,
  } = useCurrentLocation({
    enabled: groupByLocation,
  });

  const distanceById = useMemo(() => {
    const map = new Map();
    if (!coords) return map;
    for (const listing of listings) {
      const cityCoord = cityCoordinates[listing.city];
      if (cityCoord) map.set(listing.id, distanceInKm(coords, cityCoord));
    }
    return map;
  }, [coords, listings]);

  // Can only sort by distance once we actually have a GPS fix to sort from —
  // falls back to the city-grouped view otherwise, even if the user's last
  // choice was "distance".
  const effectiveSortMode =
    sortMode === "distance" && coords ? "distance" : "city";

  // Rendered by the grid layout, which is the one every non-pharmacy
  // category uses — the pharmacy layout has a header of its own and no
  // "Autre" listings to sort.
  //
  // Only when there is more than one aisle: a single chip is not a filter,
  // it is the whole list with a button on it.
  // Prepended to whichever header this screen is rendering, so the note
  // appears once above the results in every one of its list shapes.
  const searchNote = isSearchMode ? (
    <SearchResultNote
      shown={searchResults?.length ?? 0}
      total={searchTotal}
      complete={searchComplete}
      totalIsExact={searchTotalIsExact}
    />
  ) : null;

  const renderTradeRail = () => (
    <>
      {searchNote}
      {tradeRail.length > 1 ? (
      <AisleRow
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={aisleRowStyle}
      >
        <RailChip
          label={t("otherAisleAll")}
          count={listings.length}
          selected={!selectedTrade}
          onPress={() => setSelectedTrade(null)}
        />
        {tradeRail.map((entry) => {
          const active = selectedTrade === entry.key;
          return (
            <RailChip
              key={entry.key}
              icon={entry.icon}
              label={entry.label}
              count={entry.count}
              selected={active}
              onPress={() => setSelectedTrade(active ? null : entry.key)}
            />
          );
        })}
      </AisleRow>
      ) : null}
    </>
  );

  const renderAisleRow = () => (
    <>
      {searchNote}
      {isOtherCategory && customAisles.length > 1 ? (
      <AisleRow
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={aisleRowStyle}
      >
        <RailChip
          label={t("otherAisleAll")}
          count={categoryListings.length}
          selected={!customFilter}
          onPress={() => setCustomFilter(null)}
        />
        {customAisles.map((aisle) => {
          const active = customFilter === aisle.key;
          return (
            <RailChip
              key={aisle.key}
              label={aisle.label}
              count={aisle.count}
              selected={active}
              onPress={() => setCustomFilter(active ? null : aisle.key)}
            />
          );
        })}
      </AisleRow>
      ) : null}
    </>
  );

  // The city choices that exist INSIDE the department scope.
  //
  // The scope is the parent filter and the city narrows within it. Offering
  // the national list while scoped invited a combination that can only be
  // empty — picking Cotonou under an Ouémé/Plateau scope produced nought
  // results and a message blaming a search the reader never made.
  //
  // Derived from the scoped listings, never hard-coded, so a roster that
  // stops covering a town stops offering it. Ordered through the canonical
  // list so the sheet keeps its familiar order, with any city the data has
  // and the canonical list lacks appended rather than dropped — a pharmacy
  // that cannot be reached through the filter is worse than an unfamiliar
  // ordering.
  const scopedCityNames = useMemo(() => {
    if (!departmentFilter) return null;
    const present = new Set();
    for (const listing of departmentFilteredListings) {
      if (listing.city) present.add(listing.city);
    }
    const canonical = cities.filter((city) => present.has(city));
    const extras = [...present].filter((city) => !cities.includes(city));
    return [...canonical, ...extras];
  }, [departmentFilter, departmentFilteredListings]);

  // A city chosen before the scope arrived may not exist inside it. Reset
  // deterministically when the scope changes rather than rendering an
  // impossible pair — and only then, so a city picked WITHIN the scope is
  // left alone.
  useEffect(() => {
    if (!scopedCityNames || !selectedCity) return;
    if (!scopedCityNames.includes(selectedCity)) setSelectedCity(null);
  }, [scopedCityNames, selectedCity]);

  const filteredSheetCities = (scopedCityNames ?? cities).filter((city) =>
    city.toLowerCase().includes(citySearch.trim().toLowerCase()),
  );

  const nearestPharmacy = useMemo(() => {
    if (!coords || categoryListings.length === 0) return null;
    let closestListing = null;
    let closestDistance = Infinity;
    for (const listing of categoryListings) {
      const cityCoord = cityCoordinates[listing.city];
      if (!cityCoord) continue;
      const distance = distanceInKm(coords, cityCoord);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestListing = listing;
      }
    }
    return closestListing
      ? { listing: closestListing, distance: closestDistance }
      : null;
  }, [coords, categoryListings]);

  const { status: nearbyStatus, pharmacies: nearbyPharmacies } =
    useNearbyPharmacies(groupByLocation ? coords : null);
  const filteredNearbyPharmacies = query.trim()
    ? nearbyPharmacies.filter((place) => queryMatches(query, place.name))
    : nearbyPharmacies;

  // A specific pharmacy by name can easily be further away than the fixed
  // radius/20-result cap useNearbyPharmacies searches within — this looks it
  // up directly by name via Google Places Text Search instead of proximity,
  // so "a specific pharmacy of the user's choice" is findable regardless of
  // distance, not just whichever happen to already be nearby. Only fires
  // with an actual query, and only on this screen.
  const { pharmacies: searchedPharmacies } = useSearchPharmacies(
    groupByLocation ? query : "",
    groupByLocation ? coords : null,
  );
  const nearbyIds = new Set(filteredNearbyPharmacies.map((place) => place.id));
  const combinedNearbyPharmacies = query.trim()
    ? [
        ...filteredNearbyPharmacies,
        ...searchedPharmacies.filter((place) => !nearbyIds.has(place.id)),
      ]
    : filteredNearbyPharmacies;

  // Listings are already live via Firestore's onSnapshot listener (see
  // useApprovedListings), so on the pharmacy screen the pull gesture's real
  // work is re-fetching location — it drives the nearest-pharmacy card and
  // the nearby-pharmacies search, neither of which updates on its own.
  // Other categories have nothing to re-fetch, so it's just a brief spinner
  // confirming the feed is current.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (groupByLocation) {
      await requestLocation();
      setRefreshing(false);
    } else {
      setTimeout(() => setRefreshing(false), 600);
    }
  }, [groupByLocation, requestLocation]);

  // Says which of the three things is true: more is coming, more exists, or
  // this is all of it. Before this the third and the second looked the same.
  const categoryListFooter = loadingMoreInCategory ? (
    <ListFooterRow>
      <ActivityIndicator color={colors.primary} />
    </ListFooterRow>
  ) : !hasMoreInCategory && listings.length > 0 ? (
    <ListFooterNote>{t("localEndOfResults")}</ListFooterNote>
  ) : null;

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  const pharmacyRows = useMemo(() => {
    if (!groupByLocation) return null;
    const rows = [];
    if (pharmacyTab === "duty") {
      if (listings.length > 0) {
        rows.push(
          ...(effectiveSortMode === "distance"
            ? sortByDistance(listings, distanceById)
            : groupByCity(listings, distanceById)),
        );
      }
      return rows;
    }
    if (locationStatus !== "granted") {
      // This tab is defined by proximity, so with no location fix it has
      // nothing to show. Saying so — and offering the permission — beats the
      // generic "no results", which reads as "there are no pharmacies".
      rows.push({
        type: "nearby-status",
        key: "nearby-status",
        status: "permission",
      });
      return rows;
    }
    if (locationStatus === "granted") {
      if (nearbyStatus === "loading") {
        rows.push({
          type: "nearby-status",
          key: "nearby-status",
          status: "loading",
        });
      } else if (nearbyStatus === "error") {
        rows.push({
          type: "nearby-status",
          key: "nearby-status",
          status: "error",
        });
      } else if (combinedNearbyPharmacies.length === 0) {
        rows.push({
          type: "nearby-status",
          key: "nearby-status",
          status: "empty",
        });
      } else {
        for (const place of combinedNearbyPharmacies) {
          rows.push({ type: "nearby", key: `nearby-${place.id}`, place });
        }
      }
    }
    return rows;
  }, [
    pharmacyTab,
    groupByLocation,
    listings,
    locationStatus,
    nearbyStatus,
    combinedNearbyPharmacies,
    effectiveSortMode,
    distanceById,
    t,
  ]);

  return (
    <Container edges={["left", "right"]}>
      {groupByLocation ? (
        <FlatList
          key="grouped"
          data={pharmacyRows}
          /* Passed as an element, not a function: a new component type each
             render would remount the search field and dismiss the keyboard
             on every keystroke. */
          ListHeaderComponent={
            <>
              {groupByLocation ? (
                <LocationRow onPress={() => setCitySheetOpen(true)}>
                  <Ionicons name="location" size={15} color={colors.primary} />
                  <LocationLabel numberOfLines={1}>
                    {selectedCity ?? t("pharmacyAllCities")}
                  </LocationLabel>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={colors.textMuted}
                  />
                </LocationRow>
              ) : null}
              {/* Arrived from a roster notification, which is about some
                  regions and not others. Shown as a chip with an X rather
                  than applied silently, so the scope is visible and one tap
                  undoes it. */}
              {departmentFilter ? (
                <ScopeChip onPress={() => setDepartmentFilter(null)}>
                  <Ionicons name="funnel" size={13} color={colors.primary} />
                  <ScopeChipLabel numberOfLines={1}>
                    {departmentFilter.join(", ")}
                  </ScopeChipLabel>
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </ScopeChip>
              ) : null}
              {/* Only when the rotation has actually run out. Two ways
                  through that do not depend on us: the register itself, and
                  a service that answers a message. */}
              {rosterLapsed ? (
                <LapsedCard>
                  <LapsedTop>
                    <Ionicons
                      name="alert-circle-outline"
                      size={16}
                      color={colors.accentDark}
                    />
                    <LapsedTitle>{t("pharmacyRosterLapsedTitle")}</LapsedTitle>
                  </LapsedTop>
                  <LapsedBody>{t("pharmacyRosterLapsedBody")}</LapsedBody>
                  <LapsedAction
                    onPress={() =>
                      Linking.openURL(
                        "https://onpb.bj/category/tour-de-garde/",
                      ).catch(() => {})
                    }
                  >
                    <Ionicons
                      name="open-outline"
                      size={15}
                      color={colors.primary}
                    />
                    <LapsedActionLabel>
                      {t("pharmacyRosterLapsedOnpb")}
                    </LapsedActionLabel>
                  </LapsedAction>
                  <LapsedAction
                    onPress={() =>
                      Linking.openURL(
                        "https://wa.me/22956191919",
                      ).catch(() => {})
                    }
                  >
                    <Ionicons
                      name="logo-whatsapp"
                      size={15}
                      color={colors.primary}
                    />
                    <LapsedActionLabel>
                      {t("pharmacyRosterLapsedPharmap")}
                    </LapsedActionLabel>
                  </LapsedAction>
                </LapsedCard>
              ) : null}
              {groupByLocation ? (
                <NearestPharmacyCard
                  status={locationStatus}
                  nearest={nearestPharmacy}
                  onRequestLocation={requestLocation}
                />
              ) : null}
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder={
                  groupByLocation ? t("pharmacySearchPlaceholder") : undefined
                }
              />
              {groupByLocation ? (
                <PharmacyTabRow>
                  <PharmacyTab
                    selected={pharmacyTab === "duty"}
                    onPress={() => setPharmacyTab("duty")}
                  >
                    {/* Same mark as the card above, tinted: the tab is white
                        on green when chosen and grey when not, and the asset
                        carries its shape in the alpha channel so a tint is
                        all it takes. */}
                    <PharmacyTabMark
                      source={pharmacyMark}
                      resizeMode="contain"
                      style={{
                        tintColor:
                          pharmacyTab === "duty"
                            ? colors.textInverse
                            : colors.textMuted,
                      }}
                    />
                    <PharmacyTabLabel
                      selected={pharmacyTab === "duty"}
                      numberOfLines={1}
                    >
                      {t("onDutySectionTitle")}
                    </PharmacyTabLabel>
                    <PharmacyTabCount selected={pharmacyTab === "duty"}>
                      <PharmacyTabCountLabel selected={pharmacyTab === "duty"}>
                        {listings.length}
                      </PharmacyTabCountLabel>
                    </PharmacyTabCount>
                  </PharmacyTab>
                  <PharmacyTab
                    selected={pharmacyTab === "nearby"}
                    onPress={() => setPharmacyTab("nearby")}
                  >
                    <Ionicons
                      name="navigate"
                      size={15}
                      color={
                        pharmacyTab === "nearby"
                          ? colors.textInverse
                          : colors.textMuted
                      }
                    />
                    <PharmacyTabLabel
                      selected={pharmacyTab === "nearby"}
                      numberOfLines={1}
                    >
                      {t("nearbyPharmaciesSectionTitle")}
                    </PharmacyTabLabel>
                    {combinedNearbyPharmacies.length ? (
                      <PharmacyTabCount selected={pharmacyTab === "nearby"}>
                        <PharmacyTabCountLabel
                          selected={pharmacyTab === "nearby"}
                        >
                          {combinedNearbyPharmacies.length}
                        </PharmacyTabCountLabel>
                      </PharmacyTabCount>
                    ) : null}
                  </PharmacyTab>
                </PharmacyTabRow>
              ) : null}
              <RefreshHintRow>
                <Ionicons
                  name="arrow-down-outline"
                  size={11}
                  color={colors.textMuted}
                />
                <RefreshHintText>{t("pullToRefreshHint")}</RefreshHintText>
              </RefreshHintRow>
            </>
          }
          keyExtractor={(row) => row.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={listContentStyle}
          refreshControl={refreshControl}
          ListEmptyComponent={
            pharmacyTab === "duty" && categoryListings.length === 0 ? (
              /* An empty duty list is a real state, not a missing feature:
                 ONPB publishes weekly and there are gaps. Saying so — and
                 pointing at the tab that does have results — beats a bare
                 "coming soon". */
              <EmptyState>
                <EmptyIconWrap>
                  <Ionicons
                    name="calendar-outline"
                    size={26}
                    color={colors.primary}
                  />
                </EmptyIconWrap>
                <EmptyTitle>{t("pharmacyDutyEmptyTitle")}</EmptyTitle>
                <EmptyText>{t("pharmacyDutyEmptyCopy")}</EmptyText>
                <EmptyAction onPress={() => setPharmacyTab("nearby")}>
                  <EmptyActionLabel>
                    {t("pharmacyDutyEmptyAction")}
                  </EmptyActionLabel>
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={colors.primary}
                  />
                </EmptyAction>
              </EmptyState>
            ) : (
              <EmptyState>
                <EmptyText>
                  {/* "No results for your search" was shown whenever the
                      list came back empty, including when the reader had
                      only picked filters. It named a cause that did not
                      exist and hid the one that did. */}
                  {categoryListings.length === 0
                    ? t("categoryListingsComingSoon")
                    : query.trim()
                      ? t("categoryListingsNoResults")
                      : t("categoryListingsNoFilterMatch")}
                </EmptyText>
              </EmptyState>
            )
          }
          renderItem={({ item: row }) => {
            if (row.type === "section") {
              if (row.key === "section-garde") {
                return (
                  <SectionHeaderRow>
                    <SectionTitleInline>{row.title}</SectionTitleInline>
                    {coords ? (
                      <SortToggle
                        onPress={() =>
                          setSortMode(
                            effectiveSortMode === "distance"
                              ? "city"
                              : "distance",
                          )
                        }
                      >
                        <SortToggleLabel>
                          {effectiveSortMode === "distance"
                            ? t("sortByCityLabel")
                            : t("sortByDistanceLabel")}
                        </SortToggleLabel>
                      </SortToggle>
                    ) : null}
                  </SectionHeaderRow>
                );
              }
              return <SectionTitle>{row.title}</SectionTitle>;
            }
            if (row.type === "header") {
              return (
                <CityHeader>
                  <CityHeaderText>{row.city}</CityHeaderText>
                  <CityHeaderCount>{row.count}</CityHeaderCount>
                </CityHeader>
              );
            }
            if (row.type === "nearby") {
              return <NearbyPharmacyRow place={row.place} />;
            }
            if (row.type === "nearby-status") {
              return (
                <NearbyStatusRow>
                  {row.status === "loading" ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : null}
                  <NearbyStatusText>
                    {row.status === "loading"
                      ? t("nearbyPharmaciesLoading")
                      : row.status === "error"
                        ? t("nearbyPharmaciesUnavailable")
                        : row.status === "permission"
                          ? t("nearestPharmacyPermissionDenied")
                          : t("nearbyPharmaciesEmpty")}
                  </NearbyStatusText>
                  {row.status === "permission" ? (
                    <NearbyEnableWrap>
                      <EnableLocationButton onPress={requestLocation}>
                        <Ionicons
                          name="locate-outline"
                          size={15}
                          color={colors.textInverse}
                        />
                        <EnableLocationButtonLabel>
                          {t("nearestPharmacyEnableLocation")}
                        </EnableLocationButtonLabel>
                      </EnableLocationButton>
                    </NearbyEnableWrap>
                  ) : null}
                </NearbyStatusRow>
              );
            }
            return (
              <PharmacyRow listing={row.listing} distance={row.distance} />
            );
          }}
        />
      ) : listings.length === 0 ? (
        <ScrollView
          contentContainerStyle={emptyScrollContentStyle}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          <EmptyState>
            <EmptyText>
              {categoryListings.length === 0
                ? t("categoryListingsComingSoon")
                : t("categoryListingsNoResults")}
            </EmptyText>
          </EmptyState>
        </ScrollView>
      ) : (
        groupByTrade ? (
          <SectionList
            key="tradeGrid"
            sections={tradeSections}
            stickySectionHeadersEnabled
            keyExtractor={(row) => row.map((listing) => listing.id).join("-")}
            ListHeaderComponent={renderTradeRail}
            contentContainerStyle={listContentStyle}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
            renderSectionHeader={({ section }) => (
              // Opaque: a sticky heading with a see-through background has
              // cards sliding visibly through it.
              <StickyHeading>
                <SectionHeading
                  label={section.title}
                  meta={
                    section.hidden
                      ? null
                      : t("listingCountShort", { count: section.total })
                  }
                  action={
                    section.hidden ? (
                      <SeeAllLink onPress={() => setSelectedTrade(section.key)}>
                        {t("localSectionSeeAll", { count: section.total })}
                      </SeeAllLink>
                    ) : null
                  }
                />
              </StickyHeading>
            )}
            renderItem={({ item: row, section }) => (
              <GridRow style={rowStyle}>
                {row.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    flush
                    // One listing in the trade: it takes the row. See
                    // ListingCard's `full`.
                    full={section.total === 1}
                  />
                ))}
              </GridRow>
            )}
          />
        ) : (
          <FlatList
            key="grid"
            data={listings}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={rowStyle}
            ListHeaderComponent={renderAisleRow}
            contentContainerStyle={listContentStyle}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
            // The one list in the app whose job is browsing an aisle to its
            // end. A category holding more than 200 used to stop dead at 200
            // with nothing on screen saying so — measured in
            // scripts/rules-tests/categoryCap.test.js, where a category of
            // 1,000 showed 200 and hid 800 silently.
            //
            // The window grows rather than paging with a cursor, because this
            // screen groups its whole set before rendering and a cursor would
            // reshuffle the groups underneath the reader.
            onEndReached={loadMoreInCategory}
            onEndReachedThreshold={0.6}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            ListFooterComponent={categoryListFooter}
            // numColumns keeps a lone item at column width, so the
            // single-listing case is handled here the same way the grouped
            // grid handles it above.
            renderItem={({ item }) => (
              <ListingCard listing={item} flush full={listings.length === 1} />
            )}
          />
        )
      )}
      {groupByLocation ? (
        <Modal
          visible={citySheetOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setCitySheetOpen(false)}
        >
          <SheetLift behavior="padding">
          <SheetBackdrop onPress={() => setCitySheetOpen(false)}>
            <Sheet onStartShouldSetResponder={() => true}>
              <SheetHandle />
              <SheetTitle>{t("chooseCityTitle")}</SheetTitle>
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
                    setCitySheetOpen(false);
                    setCitySearch("");
                  }}
                >
                  <SheetRowLabel>{t("pharmacyAllCities")}</SheetRowLabel>
                  {!selectedCity ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </SheetRow>
                {filteredSheetCities.map((city) => (
                  <SheetRow
                    key={city}
                    selected={selectedCity === city}
                    onPress={() => {
                      setSelectedCity(city);
                      setCitySheetOpen(false);
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
          </SheetLift>
        </Modal>
      ) : null}
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// The shared EnableLocationButton is left-aligned by design; centred here
// because it sits alone under a centred status message.
const NearbyEnableWrap = styled.View`
  align-items: center;
  margin-top: ${spacing.sm}px;
`;

// Two standalone buttons with a real gap, not segments inside a shared
// track. On a track the unselected half was transparent, so it read as
// empty background rather than as the other tab — there appeared to be one
// control, not a choice between two.
const EmptyIconWrap = styled.View`
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
  margin-bottom: ${spacing.sm}px;
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
  text-align: center;
`;

const EmptyAction = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: ${spacing.md}px;
  padding: 10px 16px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const EmptyActionLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.primaryDark};
`;

// Horizontal, not wrapped: there is no bound on how many words sellers
// invent, and a wrapping row of forty would push the listings off the
// screen it is meant to filter.
const AisleRow = styled.ScrollView`
  margin: ${spacing.sm}px 0 ${spacing.sm}px;
`;

// Padded independently now that the list itself is not.
const aisleRowStyle = {
  paddingHorizontal: spacing.md - 2,
  gap: spacing.sm,
  alignItems: "center",
};

const PharmacyTabRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin: ${spacing.sm}px ${spacing.md}px ${spacing.md}px;
`;

// Both halves are visible objects: the chosen one filled, the other an
// outlined card. The difference between them is fill versus outline, which
// survives at a glance; transparent versus filled did not.
const PharmacyTab = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.selected ? props.theme.primary : props.theme.surface)};
  border-width: 1.5px;
  border-color: ${(props) => (props.selected ? props.theme.primary : props.theme.border)};
  ${(props) => (props.selected ? shadow.card : "")}
`;

const PharmacyTabLabel = styled.Text`
  flex-shrink: 1;
  font-family: ${(props) => (props.selected ? fontFamily.bold : fontFamily.medium)};
  font-size: 13px;
  letter-spacing: ${(props) => (props.selected ? "0.2px" : "0px")};
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.textMuted)};
`;

const PharmacyTabCount = styled.View`
  padding: 2px 7px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.selected ? "rgba(255, 255, 255, 0.24)" : props.theme.surfaceAlt};
`;

const PharmacyTabCountLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.textMuted)};
`;

const RefreshHintRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding-horizontal: ${spacing.md}px;
  padding-top: 6px;
`;

const LapsedCard = styled.View`
  padding: 14px 15px;
  border-radius: 18px;
  margin-bottom: ${spacing.sm}px;
  gap: 8px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.32);
`;

const LapsedTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const LapsedTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const LapsedBody = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const LapsedAction = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 12px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const LapsedActionLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.primary};
`;

const ScopeChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: ${spacing.xs}px;
  margin-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  padding-vertical: ${spacing.xs}px;
  padding-horizontal: ${spacing.sm}px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ScopeChipLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
  max-width: 220px;
`;

const LocationRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding-horizontal: ${spacing.md}px;
  padding-top: ${spacing.sm}px;
`;

const LocationLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex-shrink: 1;
`;

const RefreshHintText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const NearestCard = styled(Pressable)`
  background-color: ${(props) => (props.highlighted ? "rgba(11, 110, 79, 0.06)" : props.theme.surface)};
  border-width: ${(props) => (props.highlighted ? 1 : 0)}px;
  border-color: rgba(11, 110, 79, 0.15);
  border-radius: ${radius.lg}px;
  padding: ${spacing.md}px;
  margin-horizontal: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
  gap: ${spacing.sm}px;
  ${(props) => (props.highlighted ? "" : shadow.card)}
`;

const NearestKicker = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const HeroIconBox = styled.View`
  width: 46px;
  height: 46px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.primary};
  align-items: center;
  justify-content: center;
`;

// The asset is white with its shape in the alpha channel, so tintColor can
// recolour it wherever it needs to sit on something other than the green.
const PharmacyMark = styled.Image`
  width: 25px;
  height: 25px;
`;

// A shade larger than the 15px Ionicon it replaces: the glyph is mostly
// outline where the medkit was a solid block, so it needs the extra pixel
// or two to carry the same weight beside the label.
const PharmacyTabMark = styled.Image`
  width: 16px;
  height: 16px;
`;

const NearestName = styled.Text`
  ${type.bodyMedium}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const DutyBadgeRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
`;

const DutyDot = styled.View`
  width: 7px;
  height: 7px;
  border-radius: 3.5px;
  background-color: ${(props) => (props.stale ? props.theme.accentDark : props.theme.error)};
`;

const NearestBodyRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
`;

const NearestDistanceText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 3px;
`;

const NearestLocatingText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  flex: 1;
`;

// Row when the actions fit on one, column when they do not.
//
// It was always a column, for a good reason: PhoneCallButtons needs the
// card's full width to lay multiple phone-number chips out horizontally, and
// sharing a row 50/50 with "Itinéraire" squeezed it until every chip wrapped
// onto its own line — a vertical stack of numbers.
//
// But that reason only holds when there ARE several numbers. With one, the
// column stretched a short "Appeler" and a short "Itinéraire" to the full
// width of the card, one above the other: two green bands with their labels
// stranded in the middle and a lot of nothing on either side.
//
// One wrapping row holding every action on the card.
//
// It used to be a plain column, which stretched what it held: a short
// "Appeler" and a short "Itinéraire" each became a full-width band with its
// label stranded in the middle. Making them a column of content-sized buttons
// fixed the bands but not the emptiness — Tanguiéta's three numbers wrapped
// 2 + 1, and the directions button, living in a container of its own, could
// not rise into the gap beside the third chip.
//
// So they all share this row and wrap as one sequence. align-items: center
// rather than flex-start: this is the cross axis here, and the chips are a
// couple of pixels shorter than the outlined button beside them.
const NearestActionsColumn = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.xs}px;
`;

// Two to a line, each taking half of it.
//
// A basis of 45% is the trick: two of them plus the gap fit on one line and
// a third cannot, so the row breaks two-up. flex-grow then spends the
// remainder equally, which both squares the halves against each other and
// lets a lone button on the last line take the whole width instead of
// leaving a stub. Without the shared basis each button is as wide as its own
// label — a six-digit chip against "Obtenir l'itinéraire" — and the card
// reads as ragged.
const actionGridItem = { flexGrow: 1, flexBasis: "45%" };

const NearestActionButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding-horizontal: ${spacing.md}px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.secondary ? "transparent" : props.theme.primary)};
  border-width: ${(props) => (props.secondary ? "1px" : "0px")};
  border-color: ${(props) => props.theme.primary};
`;

const NearestActionButtonLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.secondary ? props.theme.primary : props.theme.textInverse)};
`;

const EnableLocationButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding-horizontal: ${spacing.md}px;
  height: 34px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primary};
`;

const EnableLocationButtonLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
`;

const NearestBrowseAllText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: 2px;
`;

const NearestFreshnessText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;

const SectionTitle = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.lg}px;
  margin-bottom: ${spacing.sm}px;
  padding-bottom: ${spacing.sm}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SectionHeaderRow = styled.View`
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: ${spacing.lg}px;
  margin-bottom: ${spacing.sm}px;
  padding-bottom: ${spacing.sm}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SectionTitleInline = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
`;

const SortToggle = styled(Pressable)`
  padding-vertical: 2px;
`;

const SortToggleLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
`;

const NearbyStatusRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
`;

const NearbyStatusText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  flex: 1;
`;

const CityHeader = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: ${spacing.xs}px;
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const CityHeaderText = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
`;

const CityHeaderCount = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const PharmacyRowContainer = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const PharmacyThumb = styled.View`
  width: 56px;
  height: 56px;
  border-radius: ${radius.sm}px;
  overflow: hidden;
`;

const PharmacyPhoto = styled.Image`
  width: 100%;
  height: 100%;
`;

// Small, and over the image rather than beside it: the credit is required,
// but it shouldn't cost the row a line of its own.
const PhotoCredit = styled.Text`
  position: absolute;
  left: 0px;
  right: 0px;
  bottom: 0px;
  padding: 2px 4px;
  font-family: ${fontFamily.regular};
  font-size: 8px;
  color: rgba(255, 255, 255, 0.9);
  background-color: rgba(0, 0, 0, 0.42);
`;

const PharmacyRowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const PharmacyRowTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const PharmacyRowDutyText = styled.Text`
  ${type.caption}
  color: ${(props) => (props.stale ? props.theme.accentDark : props.theme.error)};
  flex-shrink: 1;
`;

const PharmacyRowPhone = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const RowCallButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 8px;
`;

const RowCallButtonLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
`;

const NearbyDirectionsButton = styled(Pressable)`
  width: 38px;
  height: 38px;
  border-radius: 19px;
  background-color: ${(props) => props.theme.primary};
  align-items: center;
  justify-content: center;
`;

const NearbyMetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: 2px;
`;

const NearbyOpenBadge = styled.View`
  background-color: ${(props) => (props.open ? props.theme.primaryLight : "rgba(193,81,45,0.1)")};
  border-radius: ${radius.pill}px;
  padding: 2px 8px;
`;

const NearbyOpenBadgeText = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${(props) => (props.open ? props.theme.primary : "#C1512D")};
`;

const NearbyRatingRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 3px;
`;

const NearbyRatingText = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

// No vertical margin: ListingCard already carries margin-bottom, which is
// where the row gap came from under columnWrapperStyle.
const GridRow = styled.View`
  flex-direction: row;
`;

const SeeAllLink = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.primary};
`;

const StickyHeading = styled.View`
  background-color: ${(props) => props.theme.background};
`;

const EmptyState = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.lg}px;
`;

const EmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;

// A Modal is its own window, and the app runs adjustPan (app.json,
// softwareKeyboardLayoutMode "pan"), so the Android window never resizes and
// the pan applies to the activity behind this sheet rather than to the sheet.
// Without a lift of its own the keyboard covers the search box and the list it
// is filtering. "padding" on both platforms, as the papers, fleet and tyres
// screens already do — "height" measures a box adjustPan never changed.
//
// The anchor stays on SheetBackdrop, which this only wraps: the backdrop is the
// Pressable that dismisses the sheet, and turning it into a
// KeyboardAvoidingView would silently drop that.
const SheetLift = styled(KeyboardAvoidingView)`
  flex: 1;
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
  ${type.h3}
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

const ListFooterRow = styled.View`
  padding-vertical: ${spacing.lg}px;
  align-items: center;
`;

const ListFooterNote = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  padding-vertical: ${spacing.lg}px;
`;
