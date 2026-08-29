import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { useApprovedListings } from "../hooks/useApprovedListings";
import {
  customCategoriesFrom,
  foldCategoryLabel,
} from "../data/customCategories";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { openListing } from "../utils/openListing";
import { buildPlacePhotoUrl } from "../utils/placePhoto";
import { useNearbyPharmacies } from "../hooks/useNearbyPharmacies";
import { useSearchPharmacies } from "../hooks/useSearchPharmacies";
import { useI18n } from "../i18n/I18nContext";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { getDutyLabel } from "../utils/pharmacyDuty";
import { queryMatches } from "../utils/search";

const pharmacyMark = require("../../assets/pharmacy-mark.png");

const listContentStyle = {
  paddingHorizontal: spacing.md,
  paddingTop: spacing.lg,
  paddingBottom: spacing.md,
};
const rowStyle = { justifyContent: "space-between" };
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
function callPharmacy(phone, t) {
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
  const cityNames = [...byCity.keys()].sort((a, b) => a.localeCompare(b));

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
          onPress={() => callPharmacy(listing.phone, t)}
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

  const photoUrl = buildPlacePhotoUrl(place.photoName, 240);

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
  // Everything a seller could not find a category for arrives here, in one
  // aisle. Their own words are the only thing separating a saxophone from a
  // welding torch, so those words become the filter.
  const isOtherCategory = categoryKey === "other";
  const [customFilter, setCustomFilter] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: categoryLabel });
  }, [navigation, categoryLabel]);

  const liveListings = useApprovedListings();
  const allListings = liveListings ?? mockListings;
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

  const cityFilteredListings =
    groupByLocation && selectedCity
      ? aisleFilteredListings.filter((listing) => listing.city === selectedCity)
      : aisleFilteredListings;

  const listings = query.trim()
    ? cityFilteredListings.filter((listing) => {
        const title =
          (language === "en" ? listing.titleEn : listing.titleFr) ?? "";
        return queryMatches(query, title, listing.city);
      })
    : cityFilteredListings;

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
  const renderAisleRow = () =>
    isOtherCategory && customAisles.length > 1 ? (
      <AisleRow
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={aisleRowStyle}
      >
        <AisleChip
          selected={!customFilter}
          onPress={() => setCustomFilter(null)}
        >
          <AisleChipLabel selected={!customFilter}>
            {t("otherAisleAll")}
          </AisleChipLabel>
          <AisleChipCount selected={!customFilter}>
            <AisleChipCountLabel selected={!customFilter}>
              {categoryListings.length}
            </AisleChipCountLabel>
          </AisleChipCount>
        </AisleChip>
        {customAisles.map((aisle) => {
          const active = customFilter === aisle.key;
          return (
            <AisleChip
              key={aisle.key}
              selected={active}
              onPress={() => setCustomFilter(active ? null : aisle.key)}
            >
              <AisleChipLabel selected={active} numberOfLines={1}>
                {aisle.label}
              </AisleChipLabel>
              <AisleChipCount selected={active}>
                <AisleChipCountLabel selected={active}>
                  {aisle.count}
                </AisleChipCountLabel>
              </AisleChipCount>
            </AisleChip>
          );
        })}
      </AisleRow>
    ) : null;

  const filteredSheetCities = cities.filter((city) =>
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
                  {categoryListings.length === 0
                    ? t("categoryListingsComingSoon")
                    : t("categoryListingsNoResults")}
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
          renderItem={({ item }) => <ListingCard listing={item} />}
        />
      )}
      {groupByLocation ? (
        <Modal
          visible={citySheetOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setCitySheetOpen(false)}
        >
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

const aisleRowStyle = {
  paddingHorizontal: spacing.md,
  gap: spacing.sm,
  alignItems: "center",
};

const AisleChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  padding: 9px 13px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.selected ? props.theme.primary : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) =>
    props.selected ? props.theme.primary : props.theme.border};
`;

const AisleChipLabel = styled.Text`
  flex-shrink: 1;
  font-family: ${(props) =>
    props.selected ? fontFamily.bold : fontFamily.medium};
  font-size: 13px;
  color: ${(props) =>
    props.selected ? props.theme.textInverse : props.theme.text};
`;

const AisleChipCount = styled.View`
  padding: 1px 6px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.selected ? "rgba(255, 255, 255, 0.24)" : props.theme.surfaceAlt};
`;

const AisleChipCountLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  color: ${(props) =>
    props.selected ? props.theme.textInverse : props.theme.textMuted};
`;

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
