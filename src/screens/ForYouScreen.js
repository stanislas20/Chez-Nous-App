import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { Tappable } from "../components/Tappable";
import { SectionHeading } from "../components/SectionHeading";
import { SearchBar } from "../components/SearchBar";
import { ListingCard } from "../components/ListingCard";
import { ScreenFooter } from "../components/ScreenFooter";
import { AdCard } from "../components/AdCard";
import { PhoneCallButtons } from "../components/PhoneCallButtons";
import { mockListings } from "../data/mockListings";
import { mockJobs } from "../data/mockJobs";
import { jobCategories } from "../data/jobCategories";
import { isDriverListing } from "../data/drivers";
import { sectorTint } from "../data/companySectors";
import { cities } from "../data/cities";
import { cityCoordinates } from "../data/cityCoordinates";
import { businessCategories } from "../data/businessCategories";
import { useApprovedAds } from "../hooks/useApprovedAds";
import { useVerifiedCompanies } from "../hooks/useVerifiedCompanies";
import { useDirectory } from "../hooks/useDirectory";
import {
  carDealerships,
  dealerAccent,
  dealerBrandKey,
  dealerEmblem,
} from "../data/carDealerships";
import { brandLogo } from "../data/vehicleBrandLogos";
import {
  beninInsurers,
  beninTelecoms,
  companyEmblem,
  getSector,
} from "../data/beninCompanies";
import { beninBanks } from "../data/beninBanks";
import { companyLogo } from "../data/companyLogos";
import { getCompanySectorLabel } from "../data/companySectors";
import {
  experienceLevels,
  getExperienceLabel,
  getExperienceLevel,
  getExperienceAccent,
  getExperienceMark,
  getExperienceTint,
} from "../data/jobExperience";
import { useApprovedListingsState } from "../hooks/useApprovedListings";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useFavorites } from "../hooks/useFavorites";
import { useJobFavorites } from "../hooks/useJobFavorites";
import { useAuth } from "../auth/AuthContext";
import { openAccountGate } from "../utils/openAccountGate";
import { canPublish } from "../utils/canPublish";
import { useI18n } from "../i18n/I18nContext";
import { distanceInKm } from "../utils/geo";
import { getDutyLabel } from "../utils/pharmacyDuty";
import { queryMatches, queryMentionsAnyOf } from "../utils/search";
import { normalizeJobListing } from "../utils/normalizeJobListing";
import { listingPriceText } from "../utils/listingPrice";
import { openListing } from "../utils/openListing";
import { useSearchPharmacies } from "../hooks/useSearchPharmacies";
import { TabSafeAreaView } from "../components/TabSafeAreaView";

// Fixed brand accents from the design mockup (not theme-reactive, like the
// onboarding screen's Benin flag colors) — used for small decorative surfaces
// (avatar, badges, notification dot) meant to look the same in both themes.
const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const GOLD_BADGE_BG = "rgba(217,164,65,0.87)";
const BADGE_TEXT = "#7A4E00";
const TERRACOTTA = "#C1512D";

const priceFormatter = new Intl.NumberFormat("fr-FR");

// Content-vertical chips shown on the home feed — distinct from the app's
// listing categoryKey taxonomy (src/data/categories.js). "Marketplace" clears
// the filter (shows everything); the rest map to a real categoryKey where one
// exists, otherwise they simply show an empty state (no fake data invented).
const HOME_CATEGORIES = [
  {
    key: "market",
    icon: "storefront-outline",
    categoryKey: null,
    fixedLabel: "Marketplace",
  },
  {
    key: "jobs",
    icon: "briefcase-outline",
    categoryKey: "jobs",
    labelKey: "categoryJobs",
  },
  {
    // Opens the Restaurants directory rather than filtering the feed:
    // there is no "restaurants" entry in categories.js, so filtering in
    // place could only ever show an empty marketplace.
    key: "food",
    icon: "restaurant-outline",
    screen: "Restaurants",
    labelKey: "categoryRestaurants",
  },
  {
    // Opens the Real Estate directory, same as the shortcut tile below.
    // Filtering the feed in place would leave two controls with the same
    // name doing different things — and the in-place version can't express
    // the deal type, which decides the price unit and the filters.
    key: "house",
    icon: "home-outline",
    screen: "RealEstate",
    labelKey: "categoryRealEstateShort",
  },
  {
    key: "car",
    icon: "car-sport-outline",
    // Its own screen now, like Immobilier — the generic category grid has no
    // brand, mileage or fuel to filter on.
    screen: "Cars",
    labelKey: "categoryVehiclesShort",
  },
  {
    key: "event",
    icon: "calendar-outline",
    categoryKey: "events",
    labelKey: "categoryEvents",
  },
  {
    key: "service",
    icon: "construct-outline",
    categoryKey: "services",
    labelKey: "categoryServicesShort",
  },
  {
    key: "hotel",
    icon: "bed-outline",
    categoryKey: "hotels",
    labelKey: "categoryHotels",
  },
];

// Jobs used to be its own bottom tab (JobsScreen) — now that the "Emplois"
// chip above shows the full jobs experience in place, the tab was removed
// (see MainTabs.js) and this is the one and only jobs UI, ported wholesale
// from the old JobsScreen rather than re-designed, since that layout was
// already real, working, and unrelated to why the tab was consolidated.
// An icon each, because six same-shaped word-pills are read left to right
// like a sentence rather than scanned. The glyph is what lets someone find
// "Missions" or "Proximité" without reading the row through.
const JOB_FILTERS = [
  { key: "forYou", labelKey: "jobsFilterForYou", icon: "sparkles" },
  { key: "recent", labelKey: "jobsFilterRecent", icon: "time" },
  { key: "fullTime", labelKey: "jobsFilterFullTime", icon: "briefcase" },
  { key: "gig", labelKey: "jobsFilterGig", icon: "flash" },
  { key: "noExp", labelKey: "jobsFilterNoExp", icon: "school" },
  { key: "nearby", labelKey: "jobsFilterNearby", icon: "location" },
];

// Options inside the "Filtres" sort sheet — a single ordering applied on
// top of whatever the chips above already filtered down to. Distinct from
// JOB_FILTERS: those narrow which jobs show up, this only changes the
// order they show up in.
const JOB_SORT_OPTIONS = [
  { key: "date", labelKey: "jobsSortDate" },
  { key: "distance", labelKey: "jobsSortDistance" },
  { key: "wageDesc", labelKey: "jobsSortWageDesc" },
  { key: "wageAsc", labelKey: "jobsSortWageAsc" },
];

// Sorts with `null`s (unknown distance, no posted salary) always pushed to
// the end regardless of direction — an unknown value is never "closest" or
// "highest paid", so it shouldn't ever win a comparison by accident.
function compareNullsLast(a, b, descending) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return descending ? b - a : a - b;
}

// Derives a per-day wage estimate straight from the salary text already
// shown on the card — never a fabricated number, just a sortable reading
// of what's already displayed. "X – Y FCFA / mois" averages the range and
// divides by 30; "X FCFA / jour" is already daily. Returns null (sorts
// last) when there's no salary text to read at all.
function estimateDailyWage(job, language) {
  const salaryText = language === "en" ? job.salaryEn : job.salaryFr;
  if (!salaryText) return null;
  const numbers = (salaryText.match(/[\d\s.,]+/g) ?? [])
    .map((chunk) => Number(chunk.replace(/[^\d]/g, "")))
    .filter((n) => n > 0);
  if (numbers.length === 0) return null;
  const average = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  const isMonthly = /mois|month/i.test(salaryText);
  return Math.round(isMonthly ? average / 30 : average);
}

// Home-screen shortcut row (distinct from HOME_CATEGORIES above, which
// filters the feed in place) — each one navigates somewhere real: an
// existing marketplace category, the Jobs tab, or one of the directory
// screens. Restaurants is a directory rather than a marketplace category:
// it has no categories.js entry, so routing it through CategoryListings
// could only ever show an empty feed.
const QUICK_ACCESS = [
  {
    key: "pharmacy",
    icon: "💊",
    labelKey: "quickAccessPharmacy",
    categoryKey: "pharmacyOnDuty",
    labelEn: "Pharmacy On Duty",
    labelFr: "Pharmacie de Garde",
  },
  { key: "jobs", icon: "💼", labelKey: "quickAccessJobs", chip: "jobs" },
  {
    key: "restaurants",
    icon: "🍴",
    labelKey: "quickAccessRestaurants",
    screen: "Restaurants",
  },
  {
    key: "services",
    icon: "🛠️",
    labelKey: "quickAccessServices",
    categoryKey: "services",
    labelEn: "Services",
    labelFr: "Services",
  },
  // Its own screen rather than CategoryListings: the deal type decides the
  // price unit and which filters even apply, which a generic grid can't
  // express.
  {
    key: "housing",
    icon: "🏠",
    labelKey: "quickAccessHousing",
    screen: "RealEstate",
  },
  {
    key: "vehicles",
    icon: "🚗",
    labelKey: "quickAccessVehicles",
    screen: "Cars",
  },
  { key: "banks", icon: "🏦", labelKey: "quickAccessBanks", screen: "Banks" },
  {
    key: "tourism",
    icon: "🏝️",
    labelKey: "quickAccessTourism",
    screen: "Tourism",
  },
  {
    key: "events",
    icon: "🎟️",
    labelKey: "quickAccessEvents",
    screen: "Events",
  },
];

const listContentStyle = {
  paddingHorizontal: spacing.md,
  paddingTop: spacing.md,
  paddingBottom: spacing.md,
};
const rowStyle = { justifyContent: "space-between" };
// The leading inset lines the first chip up with the avatar and the greeting
// above it (HeaderRow is padded 20). It used to come from the chip's own
// left margin, which meant the gap between chips and the gap before the
// first one could never be set independently.
//
// The vertical padding is room for the selected chip's shadow: a horizontal
// list crops to its content box, so a shadow drawn past that box is cut off
// flat — worse on Android, where elevation spreads more widely than iOS's
// blur. Same bug as hScrollContentStyle below.
const chipListContentStyle = {
  paddingLeft: 20,
  paddingRight: 10,
  paddingTop: 2,
  paddingBottom: 10,
};
// RecCard/NearCard/DealCard's outer wrapper carries the drop shadow, and
// Android's elevation shadow spreads more diffusely than iOS's shadow-radius
// blur — 8px of vertical padding wasn't quite enough room for it, so the
// horizontal scroll's own tight bounds were clipping it off on Android.
const hScrollContentStyle = {
  paddingRight: spacing.md,
  paddingVertical: spacing.md,
};
const scrollContentStyle = {
  paddingHorizontal: 20,
  paddingTop: 18,
  paddingBottom: spacing.md,
};
// 10 rather than 14: the content padding above now carries part of the gap.
const chipsListStyle = { flexGrow: 0, marginTop: 16 };

const jobsBodyContentStyle = {
  paddingHorizontal: spacing.md,
  paddingTop: spacing.md,
  paddingBottom: spacing.xl,
};
// A horizontal FlatList nested inside a vertical ScrollView doesn't reliably
// size its own cross-axis (vertical) height from its children's content —
// without an explicit height here, the list's own bounding box can end up
// shorter than a card actually renders at, clipping the bottom of every
// card off behind the page background showing through underneath.
// Deliberately taller than the card's own 152px min-height. That's a floor,
// not a ceiling — a card can render taller than that (larger system text
// size, different font metrics per platform), and this wrapper's height is
// a hard cap, not a min-height, so it needs real headroom above the floor
// or it clips whatever grows past it.
// Taller than the card's own 190px height on purpose: a shadow renders
// outside the view's own bounds, and this row is a scroll container that
// clips to its own height — sized exactly to the card, there's no room
// left for the shadow to render into before getting clipped off, which is
// what read as the card looking cut short right at its bottom edge.
const hScrollWrapStyle = { height: 214, marginBottom: spacing.lg };
const sheetScrollContentStyle = {
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.lg,
};
const jobAllCitiesRowStyle = { marginBottom: spacing.md };

const AD_INTERVAL = 5;

function withInlineAds(listings, ads) {
  if (ads.length === 0)
    return listings.map((listing) => ({ type: "listing", listing }));

  const items = [];
  let adCount = 0;
  listings.forEach((listing, index) => {
    items.push({ type: "listing", listing });
    if ((index + 1) % AD_INTERVAL === 0) {
      items.push({
        type: "ad",
        ad: ads[adCount % ads.length],
        key: `ad-${index}`,
      });
      adCount += 1;
    }
  });
  return items;
}

function formatTimeAgo(createdAt, t) {
  const date =
    createdAt?.toDate?.() ??
    (createdAt?.seconds ? new Date(createdAt.seconds * 1000) : null);
  if (!date) return null;
  const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (hours < 1) return t("timeAgoJustNow");
  if (hours < 24) return t("timeAgoHours", { hours });
  return t("timeAgoDays", { days: Math.floor(hours / 24) });
}

function distanceKm(from, listing) {
  if (!from || listing.latitude == null || listing.longitude == null)
    return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(listing.latitude - from.latitude);
  const dLon = toRad(listing.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(listing.latitude)) *
      Math.sin(dLon / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
}

function mostFrequentCity(listings) {
  const counts = {};
  listings.forEach((listing) => {
    if (!listing.city) return;
    counts[listing.city] = (counts[listing.city] ?? 0) + 1;
  });
  const entries = Object.entries(counts);
  if (entries.length === 0) return "Cotonou";
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function TrendingCard({ listing, navigation, cardWidth }) {
  const { language, t } = useI18n();
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;

  return (
    <TrendingPressable
      style={{ width: cardWidth }}
      onPress={() => openListing(navigation, listing, t, language)}
    >
      <TrendingImage source={{ uri: coverUri }} resizeMode="cover" />
      <TrendingGradient
        colors={[
          "rgba(11,31,22,0.25)",
          "rgba(10,28,20,0.55)",
          "rgba(7,20,14,0.94)",
        ]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <TrendingBadge>
        <TrendingBadgeLabel>🔥 {t("popularBadgeLabel")}</TrendingBadgeLabel>
      </TrendingBadge>
      <TrendingContent>
        <TrendingTitle numberOfLines={1}>{title}</TrendingTitle>
        <TrendingMetaRow>
          <TrendingPrice>
            {listingPriceText(listing, t, language)}
          </TrendingPrice>
          <TrendingCity numberOfLines={1}>{listing.city}</TrendingCity>
        </TrendingMetaRow>
      </TrendingContent>
    </TrendingPressable>
  );
}

const REC_CARD_WIDTH = 168;
const REC_IMAGE_HEIGHT = 118;
// Company names here are legal names — "Marché Central SARL / KOUNAGBE
// Francis", not "Zara". At 156px on a single line almost every real one was
// cut mid-word; 220 across two lines fits them and still leaves the next
// card peeking in, which is what tells you the row scrolls.
//
// The card style derives from these rather than repeating the numbers: the
// marquee scrolls by exactly one card-plus-gap, so a width that drifts from
// the style desyncs the loop.
const BUSINESS_CARD_WIDTH = 220;
// The second stop of each firm's band. Not a fixed dark colour: mixing every
// accent toward the same near-black gave six bands that all ended the same
// way, which is the opposite of the point. This keeps the hue and takes the
// light out of it, so SOCAR's blue stays blue and MIG's plum stays plum.
const shade = (hex, amount = 0.55) => {
  const value = hex.replace("#", "");
  const channel = (at) =>
    Math.round(parseInt(value.slice(at, at + 2), 16) * (1 - amount));
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
};
const MUTED_INK = "#6B7280";
// The logo and the initials placeholder share a size: a company that adds a
// logo should not watch its card shrink, which is what happened when the
// image was 46px and the placeholder it replaced was 56px.
// One square tile for every card, filled edge to edge.
//
// Sizing the tile to each picture was tried and looked worse: a portrait
// photo produced a tall narrow pill, and cards in a row stopped matching.
// A card is a pointer, not the subject — a uniform crop reads cleanly here,
// and the profile it opens shows the picture whole and uncropped.
const BUSINESS_LOGO_SIZE = 100;
const BUSINESS_CARD_GAP = 14;
const BUSINESS_ITEM_WIDTH = BUSINESS_CARD_WIDTH + BUSINESS_CARD_GAP;

function RecommendedCard({
  listing,
  navigation,
  isFavorite,
  onToggleFavorite,
  userCoords,
}) {
  const { language, t } = useI18n();
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;
  const timeAgo = formatTimeAgo(listing.createdAt, t);
  // No "verified seller" concept exists in the data model, so the doc's
  // verified checkmark is intentionally left out rather than faked.
  const sellerInitial = listing.sellerName
    ? listing.sellerName.trim().charAt(0).toUpperCase()
    : null;
  const km = distanceKm(userCoords, listing);
  const metaText = km != null ? `${listing.city} · ${km} km` : listing.city;
  const [activePhoto, setActivePhoto] = useState(0);

  // Real photos from CreateListingScreen's upload flow (up to 6 per listing,
  // stored as listing.media) — video thumbnails aren't renderable as a still
  // image, so the swipeable carousel only includes actual photos.
  const photos = (listing.media ?? []).filter(
    (item) => item.mediaType !== "video",
  );
  const carouselPhotos =
    photos.length > 0 ? photos : coverUri ? [{ mediaUrl: coverUri }] : [];

  const handleShare = async () => {
    try {
      // A listing with no price shares the sentence without one, rather than
      // inviting somebody to "Découvrez X à 0 FCFA".
      const priceText = listingPriceText(listing, t, language);
      await Share.share({
        message: priceText
          ? t("shareListingMessage", { title, price: priceText })
          : t("shareListingMessageNoPrice", { title }),
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  return (
    <RecCard onPress={() => openListing(navigation, listing, t, language)}>
      <RecCardInner>
        <RecImageWrap>
          {carouselPhotos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEnabled={carouselPhotos.length > 1}
              onMomentumScrollEnd={(e) => {
                setActivePhoto(
                  Math.round(e.nativeEvent.contentOffset.x / REC_CARD_WIDTH),
                );
              }}
            >
              {carouselPhotos.map((photo, index) => (
                <RecImage
                  key={photo.mediaPath ?? index}
                  source={{ uri: photo.mediaUrl }}
                  resizeMode="cover"
                  style={{ width: REC_CARD_WIDTH, height: REC_IMAGE_HEIGHT }}
                />
              ))}
            </ScrollView>
          ) : null}
          {listing.isPromoted ? (
            <RecPromotedBadge>
              <RecPromotedLabel>{t("sponsoredLabel")}</RecPromotedLabel>
            </RecPromotedBadge>
          ) : null}
          {carouselPhotos.length > 1 ? (
            <RecDotsWrap>
              {carouselPhotos.map((_, index) => (
                <RecDot key={index} active={index === activePhoto} />
              ))}
            </RecDotsWrap>
          ) : null}
        </RecImageWrap>
        {/* Rendered as a sibling of RecImageWrap (not nested inside it) so it
            never shares a touch-responder parent with the photo carousel's
            horizontal ScrollView — same class of bug as the marquee touch
            fix elsewhere in this file (a nested scrollable can silently
            swallow taps on an overlapping button, especially on Android). */}
        <RecFavButton onPress={onToggleFavorite} hitSlop={10}>
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={15}
            color={isFavorite ? TERRACOTTA : "#ffffff"}
          />
        </RecFavButton>
        <RecBody>
          <RecPriceRow>
            <RecPrice numberOfLines={1}>
              {listingPriceText(listing, t, language)}
            </RecPrice>
            <Pressable onPress={handleShare} hitSlop={8}>
              <Ionicons name="share-social-outline" size={14} color="#9CA3AF" />
            </Pressable>
          </RecPriceRow>
          <RecTitle numberOfLines={1}>{title}</RecTitle>
          <RecSellerRow>
            {sellerInitial ? (
              <RecSellerAvatar>
                <RecSellerAvatarLabel>{sellerInitial}</RecSellerAvatarLabel>
              </RecSellerAvatar>
            ) : null}
            <RecMeta numberOfLines={1}>{metaText}</RecMeta>
          </RecSellerRow>
          {timeAgo ? <RecTime>{timeAgo}</RecTime> : null}
        </RecBody>
      </RecCardInner>
    </RecCard>
  );
}

function NearCard({ listing, navigation }) {
  const { language, t } = useI18n();
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;

  return (
    <NearPressable
      onPress={() => openListing(navigation, listing, t, language)}
    >
      <NearCardInner>
        <NearImageWrap>
          {coverUri ? (
            <NearImage source={{ uri: coverUri }} resizeMode="cover" />
          ) : null}
        </NearImageWrap>
        <NearBody>
          <NearPrice numberOfLines={1}>
            {listingPriceText(listing, t, language)}
          </NearPrice>
          <NearTitle numberOfLines={1}>{title}</NearTitle>
          <NearMeta numberOfLines={1}>{listing.city}</NearMeta>
        </NearBody>
      </NearCardInner>
    </NearPressable>
  );
}

function DealCard({ listing, navigation }) {
  const { language, t } = useI18n();
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;

  return (
    <NearPressable
      onPress={() => openListing(navigation, listing, t, language)}
    >
      <NearCardInner>
        <NearImageWrap>
          {coverUri ? (
            <NearImage source={{ uri: coverUri }} resizeMode="cover" />
          ) : null}
        </NearImageWrap>
        <NearBody>
          <DealPriceRow>
            <NearPrice numberOfLines={1}>
              {listingPriceText(listing, t, language)}
            </NearPrice>
            <DealOldPrice numberOfLines={1}>
              {priceFormatter.format(listing.previousPrice)}
            </DealOldPrice>
          </DealPriceRow>
          <NearTitle numberOfLines={1}>{title}</NearTitle>
          <NearMeta numberOfLines={1}>{listing.city}</NearMeta>
        </NearBody>
      </NearCardInner>
    </NearPressable>
  );
}

// Module-level so its identity is stable: this feeds useMemo dependency
// arrays, and a fresh [] on every render would rebuild every derived list
// each time.
const EMPTY_LISTINGS = [];

const MARQUEE_SPEED_PX_PER_SEC = 40;

function BusinessMarquee({ ads, navigation }) {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const animationRef = useRef(null);
  // Distance already travelled, in px, tracked WITHOUT a JS listener on the
  // animated value.
  //
  // This used to be a translateX.addListener that mirrored the live value
  // into a ref. Attaching a JS listener to a native-driven value makes the
  // native side stream updates across the bridge, and any update still in
  // flight when the listener goes away arrives with nobody registered —
  // "Sending `onAnimatedValueUpdate` with no listeners registered." I first
  // tried resequencing the teardown (stop, then unlisten); that does not fix
  // it, because the updates are already queued asynchronously and ordering
  // on the JS side can't recall them. The listener has to go.
  //
  // The position is derivable without ever reading the value back: the
  // easing is linear and the speed is a constant, so elapsed time IS
  // distance. That keeps the animation on the native thread with no bridge
  // traffic at all.
  const travelledRef = useRef(0);
  const startedAtRef = useRef(0);
  const setWidth = ads.length * BUSINESS_ITEM_WIDTH;

  const runMarquee = () => {
    const remaining = Math.max(0, setWidth - travelledRef.current);
    startedAtRef.current = Date.now();
    animationRef.current = Animated.timing(translateX, {
      toValue: -setWidth,
      duration: (remaining / MARQUEE_SPEED_PX_PER_SEC) * 1000,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animationRef.current.start(({ finished }) => {
      if (!finished) return;
      travelledRef.current = 0;
      translateX.setValue(0);
      runMarquee();
    });
  };

  // Bank the distance covered so far, so the next run resumes from here
  // rather than restarting the loop.
  const bankProgress = () => {
    if (!animationRef.current) return;
    const elapsedSec = (Date.now() - startedAtRef.current) / 1000;
    travelledRef.current = Math.min(
      setWidth,
      travelledRef.current + elapsedSec * MARQUEE_SPEED_PX_PER_SEC,
    );
  };

  useEffect(() => {
    travelledRef.current = 0;
    translateX.setValue(0);
    runMarquee();
    return () => {
      animationRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads, setWidth]);

  if (ads.length === 0) return null;

  // A marquee only makes sense once the cards overflow the screen. Below
  // that, the duplicate copy that makes the loop seamless sits directly
  // beside the original — so a single verified company appeared twice, side
  // by side. Too few to scroll: lay them out and leave them still.
  if (ads.length * BUSINESS_ITEM_WIDTH <= screenWidth) {
    return (
      <StaticBusinessRow>
        {ads.map((ad) => (
          <BusinessCard key={ad.id} ad={ad} navigation={navigation} />
        ))}
      </StaticBusinessRow>
    );
  }

  // Pause the slide for the duration of any touch on the row — on Android,
  // a native-driven transform that keeps animating *during* a press can
  // desync RN's touch/press detection on the nested card buttons, making
  // taps silently fail. Freezing position while a touch is active avoids
  // that entirely; iOS doesn't need this but it's harmless there too.
  // Bank before stopping: the elapsed-time reading has to be taken while the
  // animation is still the one that's been running.
  const pause = () => {
    bankProgress();
    animationRef.current?.stop();
  };
  const resume = () => runMarquee();

  // Render the list twice back-to-back so the loop point is invisible — as
  // the first copy slides fully offscreen, the second copy is already lined
  // up to continue, giving a seamless, gapless slide instead of a jump-cut.
  return (
    <MarqueeClip
      onTouchStart={pause}
      onTouchEnd={resume}
      onTouchCancel={resume}
    >
      <MarqueeRow style={{ transform: [{ translateX }] }}>
        {ads.concat(ads).map((ad, index) => (
          <BusinessCard
            key={`${ad.id}-${index}`}
            ad={ad}
            navigation={navigation}
          />
        ))}
      </MarqueeRow>
    </MarqueeClip>
  );
}

function BusinessCard({ ad, navigation }) {
  const { language, t } = useI18n();
  const name = ad.sponsorName ?? "";
  // Two letters is all a person's trading name gives you. A firm that ships
  // its own short form — CFAO, SONAEC — says it better than a slice does.
  const initials = ad.emblem ?? name.trim().slice(0, 2).toUpperCase();
  // A company card arrives with its label already resolved — sectors come
  // from companySectors.js, not the advertiser category list.
  const category = businessCategories.find((c) => c.key === ad.category);
  const categoryLabel =
    ad.categoryLabel ??
    (category
      ? language === "en"
        ? category.labelEn
        : category.labelFr
      : null);

  return (
    <BusinessPressable
      onPress={() => {
        // A verified company opens its own profile — every listing and job
        // it has, in one place. Before this the badge dead-ended here: the
        // card had nothing to open, since only paid ads carry a linkUrl.
        if (ad.sellerId) {
          navigation.navigate("SellerProfile", {
            sellerId: ad.sellerId,
            sellerName: ad.sponsorName,
            memberSince: null,
            sellerVerified: true,
            sellerSector: ad.categoryLabel ?? null,
            sellerCity: ad.city ?? null,
            // The card just showed this logo; the profile it opens was
            // falling back to a letter in a circle.
            sellerPhotoUrl: ad.photoUrl ?? null,
            sellerPhone: ad.phone ?? null,
          });
          return;
        }
        // A directory entry opens the directory. It has no profile of its
        // own and inventing one would be inventing a company page.
        if (ad.route) {
          navigation.navigate(ad.route);
          return;
        }
        if (ad.linkUrl) Linking.openURL(ad.linkUrl);
      }}
    >
      {/* A distributor card is built from the two things that actually
          differ between these firms: the colour the directory already gives
          each one, and the marques it carries. Nothing here is a logo we
          invented — the marks are the manufacturers' own, which we already
          ship, and they are what makes CFAO's card unmistakable next to
          ChinaDrive's without either of them having sent us anything. */}
      {ad.marques ? (
        <>
          <FirmBand
            colors={[ad.accent, shade(ad.accent)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* The mark on a white plate where we hold one, the wordmark
                otherwise — a logo dropped straight onto the accent would sit
                on whatever colour that firm happens to have. */}
            {ad.logo ? (
              <FirmLogoPlate>
                <FirmLogoImage source={ad.logo} resizeMode="contain" />
              </FirmLogoPlate>
            ) : (
              <FirmEmblem
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {initials}
              </FirmEmblem>
            )}
          </FirmBand>

          {/* Only the marques we hold a mark for. A row that fell back to
              text for the others would read as two kinds of thing; the
              full list is on the card this opens. */}
          <MarqueRow>
            {ad.marques
              .filter((marque) => brandLogo(marque))
              .slice(0, 4)
              .map((marque) => (
                <MarquePlate key={marque}>
                  <MarqueMark source={brandLogo(marque)} resizeMode="contain" />
                </MarquePlate>
              ))}
          </MarqueRow>
        </>
      ) : (
        <BusinessLogoPlate light={Boolean(ad.logo)}>
          {ad.logo ? (
            // contain, not cover: a logo cropped to fill is a logo damaged.
            <LogoImage source={ad.logo} resizeMode="contain" />
          ) : ad.photoUrl ? (
            <BusinessPhoto source={{ uri: ad.photoUrl }} resizeMode="cover" />
          ) : (
            /* A regulated company gets its sector's colour, so the banks do
               not all arrive looking like the same firm. Anything without one
               keeps the house gradient. */
            <BusinessLogo
              colors={
                ad.accent ? [ad.accent, shade(ad.accent, 0.35)] : [EMERALD, GOLD]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {/* Shrinks to fit rather than truncating: "SONAEC" is six
                  characters where a person's initials are two, and a plate
                  reading "SONAE…" identifies nothing. */}
              <BusinessLogoLabel
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {initials}
              </BusinessLogoLabel>
            </BusinessLogo>
          )}
        </BusinessLogoPlate>
      )}

      <BusinessName numberOfLines={2}>{name}</BusinessName>

      {/* The firm's own sentence where it publishes one, its group where it
          does not. Two lines, because "Société Nouvelle d'Automobiles,
          d'Équipements et de Commerce" is what SONAEC actually says and
          cutting it to one line would leave "Société Nouvelle d'Auto…". */}
      {ad.tagline ? (
        <FirmTagline numberOfLines={2}>{ad.tagline}</FirmTagline>
      ) : categoryLabel ? (
        <BusinessMetaLine numberOfLines={1}>{categoryLabel}</BusinessMetaLine>
      ) : null}

      <BusinessFootRow>
        {ad.city ? (
          <BusinessCityRow>
            <Ionicons name="location-outline" size={11} color={MUTED_INK} />
            <BusinessCity numberOfLines={1}>{ad.city}</BusinessCity>
          </BusinessCityRow>
        ) : null}

        {/* Only a company a human actually approved gets this. Paid ad
            placements share the strip but have been through no review at
            all, and stamping them "verified" is the same misrepresentation
            as listing a pending company here. */}
        {ad.verified ? (
          <VerifiedPill>
            <Ionicons name="checkmark-circle" size={12} color={EMERALD} />
            <VerifiedPillLabel>{t("companyVerifiedBadge")}</VerifiedPillLabel>
          </VerifiedPill>
        ) : null}
      </BusinessFootRow>
    </BusinessPressable>
  );
}

export function ForYouScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const { user, sellerProfile, advertiserProfile } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { coords: userCoords, requestLocation } = useCurrentLocation();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChipKey, setSelectedChipKey] = useState("market");

  // Lets a screen outside this tab (e.g. MoreScreen's "Emplois" row) jump
  // straight to the jobs view here, now that Jobs is this chip rather than
  // its own bottom tab — navigation.navigate('MainTabs', { screen: 'ForYou',
  // params: { chip: 'jobs' } }). Clears the param right after applying it so
  // navigating away and back later doesn't keep re-forcing the jobs chip.
  const [selectedJobCategory, setSelectedJobCategory] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (route?.params?.chip) {
        setSelectedChipKey(route.params.chip);
        navigation.setParams({ chip: undefined });
      }
      // A field to land on, so a link can open the jobs view already narrowed
      // — Chauffeurs sends people here for Transport work, and dropping them
      // into all seventeen fields would undo the point of the link.
      if (route?.params?.jobCategory) {
        setSelectedJobCategory(route.params.jobCategory);
        navigation.setParams({ jobCategory: undefined });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route?.params?.chip, route?.params?.jobCategory]),
  );

  const [manualNearCity, setManualNearCity] = useState(null);
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const { favoriteIds, toggleFavorite: toggleFavoriteRemote } = useFavorites(
    user?.uid,
  );

  // Jobs section state (the "Emplois" chip's own filters — reuses the
  // header's shared search query, same as the old JobsScreen reused its own
  // search bar for the exact same job list).
  const [activeJobFilter, setActiveJobFilter] = useState("forYou");
  // A separate axis from the chips above: those narrow by shape of work
  // (full-time, gig, no experience), this narrows by field. Tapping the
  // selected card again clears it.
  const [jobCity, setJobCity] = useState(null);
  const [jobCitySearch, setJobCitySearch] = useState("");
  const [jobCitySheetOpen, setJobCitySheetOpen] = useState(false);
  const {
    favoriteIds: jobFavoriteIds,
    toggleFavorite: toggleJobFavoriteRemote,
  } = useJobFavorites(user?.uid);
  const [showSavedJobsOnly, setShowSavedJobsOnly] = useState(false);
  // Lets a buyer act on the badge. Without this, verification is only
  // visible after you've already opened a listing — so it can't influence
  // what you choose to open, and a company gets no demand from earning it.
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [jobsSortBy, setJobsSortBy] = useState("date");
  const [jobsSortOpen, setJobsSortOpen] = useState(false);

  const toggleFavorite = (id) => {
    if (!user) {
      Alert.alert(t("favoritesSignInTitle"), t("favoritesSignInMessage"));
      return;
    }
    toggleFavoriteRemote(id);
  };

  const trendingCardWidth = windowWidth - spacing.md * 2;
  const selectedChip = HOME_CATEGORIES.find((c) => c.key === selectedChipKey);
  const selectedCategoryKey = selectedChip?.categoryKey ?? null;

  const { listings: liveListings, status: listingsStatus } =
    useApprovedListingsState();

  // Sample listings are for a machine with no Firebase env at all — a
  // developer building the app. They are NOT a fallback for a failed query:
  // during an outage or while a composite index rebuilds, invented listings
  // would put a buyer on the phone to a seller who doesn't exist. A failure
  // shows the notice below instead.
  const listingsUnavailable = listingsStatus === "error";
  const listingSource =
    liveListings ??
    (listingsStatus === "unconfigured" ? mockListings : EMPTY_LISTINGS);
  // Pharmacie de Garde and Emplois both have their own dedicated flows and
  // shouldn't be mixed into the general marketplace feed/search grid — a
  // job listing rendered by the generic ListingCard here would navigate to
  // ProductDetail on tap instead of JobDetailScreen, silently losing the
  // whole apply flow for anyone who found it this way.
  // Restaurants join pharmacy and jobs in being excluded here: all three are
  // directories with their own screens, and none carries a price. Left in,
  // a restaurant rendered as a goods card asking "0 FCFA".
  const listings = listingSource.filter(
    (listing) =>
      listing.categoryKey !== "pharmacyOnDuty" &&
      listing.categoryKey !== "jobs" &&
      listing.categoryKey !== "restaurants",
  );

  // Real nearest-on-duty-pharmacy lookup for the home utility card — same
  // GPS + cityCoordinates approach CategoryListingsScreen's hero card uses,
  // so this never shows a name/distance that isn't backed by real data.
  const allListingsForPharmacy = listingSource;
  const nearestPharmacy = useMemo(() => {
    if (!userCoords) return null;
    let closestListing = null;
    let closestDistance = Infinity;
    for (const listing of allListingsForPharmacy) {
      if (listing.categoryKey !== "pharmacyOnDuty" || listing.isPermanentDuty)
        continue;
      const cityCoord = cityCoordinates[listing.city];
      if (!cityCoord) continue;
      const distance = distanceInKm(userCoords, cityCoord);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestListing = listing;
      }
    }
    return closestListing
      ? { listing: closestListing, distance: closestDistance }
      : null;
  }, [allListingsForPharmacy, userCoords]);

  // Real job postings sellers have actually submitted (CreateListingScreen,
  // categoryKey: "jobs"), normalized to the same shape mockJobs.js uses —
  // without this, a seller's real job listing would never appear anywhere
  // a candidate could find and apply to it.
  const realJobListings = useMemo(() => {
    if (!liveListings) return [];
    return liveListings
      .filter((listing) => listing.categoryKey === "jobs")
      .map((listing) => normalizeJobListing(listing, t, language));
  }, [liveListings, t, language]);

  // Samples only while there are none of the real thing. Once an employer
  // has posted, mixing invented jobs in beside theirs would have a
  // candidate applying to a company that does not exist — so the whole
  // sample set steps aside, the same rule mockRestaurants follows.
  // Drivers advertising themselves, shown among Transport postings.
  //
  // A driver's listing is a Services listing — that is where it lives and
  // where Chauffeurs reads it from. But somebody browsing Emplois → Transport
  // is looking for exactly this person, and would never think to leave the
  // jobs view to find them. So the same document is surfaced in both places
  // rather than duplicated into a second one, which would then have to be
  // kept in step and could contradict itself.
  //
  // Marked `isOffer` on the way through: it is somebody offering to work, not
  // an employer offering a job, and a candidate must be able to tell those
  // apart at a glance.
  const driverListings = useMemo(() => {
    if (!liveListings) return [];
    return liveListings
      .filter((listing) => listing.categoryKey === "services")
      .filter((listing) =>
        isDriverListing(
          `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`,
        ),
      )
      .map((listing) => ({
        ...normalizeJobListing(listing, t, language),
        category: "transport",
        isOffer: true,
      }));
  }, [liveListings, t, language]);

  const jobPool = useMemo(() => {
    // Samples step aside for a driver's offer too — an invented company
    // beside a real person's advert is the thing mockJobs must never do.
    const real = [...realJobListings, ...driverListings];
    return real.length > 0 ? real : mockJobs;
  }, [realJobListings, driverListings]);

  // Identity, not a length check: the pool is either the sample array itself
  // or a list built from Firestore, and a real employer with five postings
  // must not be labelled a sample.
  const showingSampleJobs = jobPool === mockJobs;

  // 3 most-recently-posted jobs for the "Nouveaux emplois" feed row.
  const feedJobs = useMemo(
    () =>
      [...jobPool]
        .sort((a, b) => a.postedDaysAgo - b.postedDaysAgo)
        .slice(0, 3),
    [jobPool],
  );

  // Counted across every posting, deliberately ignoring the category
  // selection itself — otherwise picking one field would show "0" on all
  // the others and there'd be no way to see where else the jobs are.
  const jobCountsByCategory = useMemo(() => {
    const counts = {};
    for (const job of jobPool) {
      if (!job.category) continue;
      counts[job.category] = (counts[job.category] ?? 0) + 1;
    }
    return counts;
  }, [realJobListings]);

  // Full "Emplois" chip results — same filtering the old standalone
  // JobsScreen did, just driven by this screen's own query/location state.
  // Real postings first, sample ones after, so what's actually actionable
  // surfaces before the demo content.
  // Everything the chips narrow down, with the chip itself not yet applied.
  // Extracted so the counts on the chips and the list below are computed
  // from one list rather than each rebuilding it — and so a count can never
  // disagree with what tapping the chip actually shows.
  const jobsBeforeChipFilter = useMemo(() => {
    const list = jobPool.filter((job) => {
      const title = language === "en" ? job.titleEn : job.titleFr;
      const isQueryMatch = queryMatches(query, title, job.company);
      const matchesCity = !jobCity || job.city === jobCity;
      const matchesSaved = !showSavedJobsOnly || jobFavoriteIds.has(job.id);
      const matchesCategory =
        !selectedJobCategory || job.category === selectedJobCategory;
      return isQueryMatch && matchesCity && matchesSaved && matchesCategory;
    });

    // Attached once, up front, regardless of which chip/sort is active —
    // both the "Proximité" filter below and the Filtres sheet's "Distance"
    // sort option need it.
    if (!userCoords) return list;
    return list.map((job) => {
      const cityCoord = cityCoordinates[job.city];
      return {
        ...job,
        distanceKm: cityCoord ? distanceInKm(userCoords, cityCoord) : null,
      };
    });
  }, [
    language,
    query,
    jobCity,
    showSavedJobsOnly,
    jobFavoriteIds,
    selectedJobCategory,
    userCoords,
    realJobListings,
  ]);

  // One pass over that list, not six. Only the chips that actually narrow
  // get a number — "Pour vous" and "Récent" don't filter (the second is a
  // sort), so a count there would just repeat the total on two chips.
  const jobFilterCounts = useMemo(() => {
    const counts = { fullTime: 0, gig: 0, noExp: 0, nearby: 0 };
    for (const job of jobsBeforeChipFilter) {
      if (job.jobType === "fullTime") counts.fullTime += 1;
      if (job.jobType === "gig") counts.gig += 1;
      if (job.noExp) counts.noExp += 1;
      if (job.distanceKm != null) counts.nearby += 1;
    }
    return counts;
  }, [jobsBeforeChipFilter]);

  const jobsForYou = useMemo(() => {
    let list = jobsBeforeChipFilter;

    if (activeJobFilter === "fullTime") {
      list = list.filter((job) => job.jobType === "fullTime");
    } else if (activeJobFilter === "gig") {
      // Short, one-off work — "serveur ce soir", a weekend move. Kept in
      // the same vertical list as everything else rather than pulled into
      // a separate carousel: a gig is browsed the same way a job is, and
      // relocating it would cost its poster the placement they'd get by
      // filing the identical work as a contract.
      list = list.filter((job) => job.jobType === "gig");
    } else if (activeJobFilter === "noExp") {
      list = list.filter((job) => job.noExp);
    } else if (activeJobFilter === "nearby" && userCoords) {
      list = list.filter((job) => job.distanceKm != null);
    }

    // The Filtres sheet's chosen ordering always runs last, as the final
    // authority on what order the (already-filtered) list renders in.
    return [...list].sort((a, b) => {
      if (jobsSortBy === "distance")
        return compareNullsLast(a.distanceKm, b.distanceKm, false);
      if (jobsSortBy === "wageDesc") {
        return compareNullsLast(
          estimateDailyWage(a, language),
          estimateDailyWage(b, language),
          true,
        );
      }
      if (jobsSortBy === "wageAsc") {
        return compareNullsLast(
          estimateDailyWage(a, language),
          estimateDailyWage(b, language),
          false,
        );
      }
      return a.postedDaysAgo - b.postedDaysAgo; // "date": most recent first
    });
  }, [jobsBeforeChipFilter, activeJobFilter, jobsSortBy, language]);

  const selectJobFilter = (key) => {
    setActiveJobFilter(key);
    // "Récent" and "Proximité" are shortcuts into the same sort the
    // Filtres sheet controls, so picking either one here is reflected
    // there too instead of the two controls silently disagreeing.
    if (key === "nearby") {
      if (!userCoords) requestLocation();
      setJobsSortBy("distance");
    } else if (key === "recent") {
      setJobsSortBy("date");
    }
  };

  const selectJobsSort = (key) => {
    setJobsSortBy(key);
    if (key === "distance" && !userCoords) requestLocation();
  };

  const toggleJobFavorite = (id) => {
    if (!user) {
      Alert.alert(t("favoritesSignInTitle"), t("favoritesSignInMessage"));
      return;
    }
    toggleJobFavoriteRemote(id);
  };

  const filteredJobCities = cities.filter((city) =>
    city.toLowerCase().includes(jobCitySearch.trim().toLowerCase()),
  );
  // Fall back to real recent listings when nothing is explicitly flagged
  // popular yet, so Trending is never empty — same real data, just a
  // different (honest) ranking signal when there's no popularity data.
  const explicitlyPopular = listings.filter((listing) => listing.popular);
  const trendingListings =
    explicitlyPopular.length > 0 ? explicitlyPopular : listings.slice(0, 5);
  // Whether Trending is saying anything Recommandé does not. With no
  // popularity data it is the first five of the same list, so the rail is
  // withheld rather than filled with a copy.
  const hasRealTrending = explicitlyPopular.length > 0;
  // A real price drop, not a fabricated discount — set when a seller lowers the price on their own listing
  // whenever a seller lowers the price on an existing listing.
  const dealListings = listings.filter(
    (listing) =>
      listing.previousPrice != null && listing.previousPrice > listing.price,
  );

  // The curated home feed deliberately keeps Pharmacie de Garde out (it has
  // its own dedicated flow) — but a search is a direct request for whatever
  // the person is looking for, and "pharmacy" is a completely reasonable
  // thing to type or say there. Only widen the pool to include it while an
  // actual query is active, so browsing/trending/deals stay exactly as
  // curated as before.
  // allListingsForPharmacy is intentionally unfiltered (it needs
  // pharmacyOnDuty back for the widened-during-search case right above),
  // but still needs jobs stripped out here — same reasoning as the
  // `listings` filter above, this is a different variable so it isn't
  // covered by that filter automatically.
  const searchableListings = (
    query.trim() ? allListingsForPharmacy : listings
  ).filter(
    (listing) =>
      listing.categoryKey !== "jobs" && listing.categoryKey !== "restaurants",
  );
  const filteredListings = searchableListings.filter((listing) => {
    const title = language === "en" ? listing.titleEn : listing.titleFr;
    const isQueryMatch = queryMatches(query, title, listing.city);
    const matchesCategory =
      !selectedCategoryKey || listing.categoryKey === selectedCategoryKey;
    // `sellerVerified` is stamped onto the listing at write time, so this
    // needs no extra read — and it's only ever true for a company a human
    // approved (see CreateListingScreen).
    const matchesVerified = !showVerifiedOnly || listing.sellerVerified;
    return isQueryMatch && matchesCategory && matchesVerified;
  });

  const liveAds = useApprovedAds();
  // No mock fallback: this row is headed "Entreprises vérifiées", and
  // filling it with invented sponsors teaches the badge means nothing.
  // Empty is the honest state until a real company is approved or a real
  // ad is running — the section hides itself when there's nothing in it.
  const ads = liveAds ?? [];
  // Real approved companies lead the row, paid placements follow. A company
  // only lands here once a human has approved it, so unlike the ads beside
  // it the checkmark on these cards is literally true — which is the whole
  // reason the section is called "verified".
  const verifiedCompanies = useVerifiedCompanies();
  // The brand distributors belong in this row too, and they lead it.
  //
  // They are the businesses everybody in Bénin already knows, and they were
  // three taps down — Auto, then Concessions. Their claim to the checkmark is
  // not weaker than a signed-up company's: a person checked each one against
  // a published source before it was written, and check-dealerships holds
  // that. It is a different KIND of verification, so the card behaves
  // differently — see the `route` branch in BusinessCard. There is no profile
  // to open, no number to ring, and nothing here says they are partners: the
  // screen it opens says the opposite, in as many words.
  const dealerships = useDirectory("dealerships", carDealerships);
  const businessCards = useMemo(
    () => [
      ...dealerships.map((firm) => ({
        id: `dealer-${firm.key}`,
        sponsorName: firm.name,
        verified: true,
        // Not a sellerId: these firms have no account. The whole directory
        // opens instead, where the brands, the addresses and the "annuaire,
        // pas un partenariat" note all live.
        route: "CarDealerships",
        city: firm.city ?? null,
        // Still no company logo: we hold none, and a distributor's mark is
        // not ours to draw. What we DO hold is the marques — and those are
        // the firm's real distinguishing fact, so the card is built from
        // them instead of from a badge nobody can source.
        photoUrl: null,
        emblem: dealerEmblem(firm.name),
        // The firm's own mark where its site publishes one. This was wired
        // into the Concessionnaires screen and missed here, so the
        // distributors kept their wordmark bands in the feed while the banks
        // beside them had picked up real logos.
        logo: companyLogo(firm.key),
        accent: dealerAccent(firm.key),
        marques: (firm.brands ?? []).map(dealerBrandKey),
        // The firm's own published words where it has any, its group where
        // it does not, and nothing invented for the four that have neither.
        tagline: firm.tagline ?? firm.group ?? t("dealerBusinessSector"),
      })),
      // The banks, operators and insurers a regulator names.
      //
      // The row was six car distributors and nothing else, which made a strip
      // about verification look like a strip about cars. These come from the
      // same standard the distributors do — a published register, read on a
      // date — and they carry their regulator as the line under the name, so
      // the card says who vouched rather than leaving "vérifiée" to imply we
      // did.
      ...[
        ...beninBanks.map((bank) => ({
          key: bank.key,
          name: bank.name,
          emblem: bank.shortName,
          sector: "bank",
        })),
        ...beninTelecoms.map((item) => ({
          key: item.key,
          name: item.name,
          emblem: companyEmblem(item),
          sector: "telecom",
        })),
        ...beninInsurers.map((item) => ({
          key: item.key,
          name: item.name,
          emblem: companyEmblem(item),
          sector: "insurer",
        })),
      ].map((item) => {
        const sector = getSector(item.sector);
        return {
          id: `company-${item.sector}-${item.key}`,
          sponsorName: item.name,
          verified: true,
          route: "VerifiedCompanies",
          emblem: item.emblem,
          accent: sector.accent,
          // Who says so, in the slot the distributors use for their tagline.
          tagline: language === "en" ? sector.authorityEn : sector.authorityFr,
          // The company's own mark where we hold one, downloaded from its own
          // site; otherwise the plate carries its name. Nothing in between —
          // no mark found somewhere else.
          logo: companyLogo(item.key),
          photoUrl: null,
        };
      }),
      ...(verifiedCompanies ?? []).map((company) => ({
        id: `company-${company.id}`,
        sponsorName: company.companyName,
        categoryLabel: getCompanySectorLabel(company.sector, language),
        verified: true,
        // The uid, so the card can open the company's profile. Ads have no
        // equivalent — they open their own linkUrl instead.
        sellerId: company.id,
        city: company.city ?? null,
        photoUrl: company.photoUrl ?? null,
        phone: company.phone ?? null,
      })),
      ...ads,
    ],
    [dealerships, verifiedCompanies, ads, language, t],
  );

  // The ONPB roster above only covers pharmacies currently on duty — a
  // search for a specific pharmacy by name (on duty or not) also looks it
  // up directly via Google Places, same as the dedicated Pharmacy screen.
  // Gated to queries that actually mention "pharmacy"/"pharmacie" — without
  // this, Google's Places Text Search still happily returns nearby
  // pharmacies for completely unrelated searches ("iPhone 17", "shoes")
  // since the includedType:'pharmacy' filter alone doesn't require the rest
  // of the query to be relevant, which made every search look pharmacy-only.
  // Also fully off while on the Emplois chip — that search should only ever
  // surface job results, not marketplace pharmacies mixed in.
  const pharmacySearchQuery =
    selectedChipKey !== "jobs" &&
    queryMentionsAnyOf(query, "pharmacy", "pharmacie")
      ? query
      : "";
  const { pharmacies: searchedPharmacies } = useSearchPharmacies(
    pharmacySearchQuery,
    userCoords,
  );
  const handlePharmacyDirections = (place) => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`,
    );
  };

  const isBrowsing = query.length === 0;
  // The curated, multi-section discovery feed (matching the design) only
  // applies to the default "Marketplace" browse state. Searching or picking a
  // specific category switches to a plain results grid, since a handful of
  // curated horizontal rows isn't a usable way to page through search/filter
  // results — the mockup doesn't depict that state, so this is our own call.
  const isDefaultBrowse = isBrowsing && selectedChipKey === "market";
  const gridItems = withInlineAds(filteredListings, isBrowsing ? ads : []);

  const name =
    user?.displayName ||
    sellerProfile?.fullName ||
    advertiserProfile?.businessName;
  const initial = name ? name.trim().charAt(0).toUpperCase() : null;
  // Whatever the account actually has a picture of: a seller's own photo, a
  // company logo, or the one Firebase Auth carries. Nothing is invented —
  // no photo means the monogram, which is what was there before.
  const avatarUrl =
    sellerProfile?.photoUrl || advertiserProfile?.photoUrl || user?.photoURL;

  // Signed in, the picture opens the account it belongs to. Signed out, it
  // opens the way to make one — the same gate every other locked action
  // uses, so it lands back here afterwards.
  // Straight into the form with Emplois already chosen, so an employer never
  // meets the category sheet or the word "Vendre". Signed out, the same gate
  // every other locked action uses — it returns here afterwards.
  // Same rule as the trade screens: signed out is a door the gate opens,
  // signed in on a number that cannot publish is a wall.
  const mayPublish = !user || canPublish(user);

  const startJobPosting = () => {
    if (!user) {
      openAccountGate(navigation);
      return;
    }
    navigation.navigate("CreateListing", {
      categoryKey: "jobs",
    });
  };

  const openAccount = () => {
    if (!user) {
      openAccountGate(navigation);
      return;
    }
    navigation.navigate("Sell");
  };
  // The greeting row is tight (avatar + text + three icon buttons), so a
  // full "First Last" name gets cramped or clipped by numberOfLines={1} —
  // just the first name reads cleanly and is still a personal greeting.
  const firstName = name ? name.trim().split(/\s+/)[0] : null;

  const autoNearCity = useMemo(() => mostFrequentCity(listings), [listings]);
  const nearYouCity = manualNearCity ?? autoNearCity;
  const nearYouListings = listings.filter(
    (listing) => listing.city === nearYouCity,
  );
  const filteredCities = cities.filter((city) =>
    city.toLowerCase().includes(citySearch.trim().toLowerCase()),
  );

  // Listings/ads are already live via Firestore's onSnapshot listeners, so
  // the pull gesture's real work is re-fetching location (which drives the
  // "Near you" city and distance labels) — everything else just gets a
  // brief spinner to confirm the feed is current.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await requestLocation();
    } finally {
      setRefreshing(false);
    }
  }, [requestLocation]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  return (
    <Container edges={["top", "left", "right"]}>
      <HeaderCard>
        <HeaderRow>
          {/* The account holder's own photo when they have uploaded one.
              The gradient monogram stays as the fallback rather than being
              replaced — a grey placeholder head for everyone without a photo
              would be worse than the initial they already had.

              Tappable either way: signed in it opens their dashboard, signed
              out it opens the account gate, so the face in the corner is
              also the way into the account. */}
          <AvatarButton onPress={openAccount} hitSlop={6}>
            {avatarUrl ? (
              <AvatarPhoto source={{ uri: avatarUrl }} resizeMode="cover" />
            ) : (
              <Avatar
                colors={[EMERALD, GOLD]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {initial ? (
                  <AvatarLabel>{initial}</AvatarLabel>
                ) : (
                  <Ionicons name="person" size={16} color="#ffffff" />
                )}
              </Avatar>
            )}
          </AvatarButton>
          {/* Two lines, not three.
              
              The line under the greeting is short on purpose. The one that
              used to live here — "Découvrez ce qui se passe près de chez
              vous" — is longer than the space between an avatar and two
              buttons, so with numberOfLines={1} every user on every phone
              read "Découvrez ce qui se passe près de …". The width here is
              about 210dp; anything that does not finish inside it does not
              belong on this row.
              
              The third line, a pull-to-refresh hint, is gone for good:
              RefreshControl demonstrates that gesture the moment anybody
              pulls, and it was charging a permanent line of the one part of
              this screen that never scrolls to teach it. */}
          <GreetingBlock>
            <GreetingText numberOfLines={1}>
              {firstName
                ? t("homeGreeting", { name: firstName })
                : t("homeGreetingGuest")}
            </GreetingText>
            <WelcomeText numberOfLines={1}>{t("homeWelcome")}</WelcomeText>
          </GreetingBlock>
          <HeaderActions>
            <IconButton onPress={() => navigation.navigate("More")} hitSlop={8}>
              <Ionicons name="menu-outline" size={19} color="#ffffff" />
            </IconButton>
            <LangPill
              onPress={() => setLanguage(language === "en" ? "fr" : "en")}
            >
              <LangPillLabel>{language === "en" ? "FR" : "EN"}</LangPillLabel>
            </LangPill>
          </HeaderActions>
        </HeaderRow>

        {/* onDark only here. The other two SearchBars on this screen live
            inside bottom sheets, which are still white.
            
            The wrapper is not decoration: onDark zeroes the field's own
            horizontal margin, on the principle that a banner owns its
            spacing, so without a parent supplying it the field runs to both
            edges while everything else in the header is inset. 20px, which
            is what HeaderRow and the chip row already use — the field used
            to sit at 16 and nobody could see the 4px it was out by against
            a white ground. */}
        <SearchWrap>
          <SearchBar
            onDark
            value={query}
            onChangeText={setQuery}
            placeholder={
              selectedChipKey === "jobs"
                ? t("jobsSearchPlaceholder")
                : undefined
            }
          />
        </SearchWrap>

        <FlatList
          data={HOME_CATEGORIES}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={chipListContentStyle}
          style={chipsListStyle}
          renderItem={({ item }) => {
            const isSelected = selectedChipKey === item.key;
            const label = item.fixedLabel ?? t(item.labelKey);
            return (
              <CategoryChip
                selected={isSelected}
                onPress={() =>
                  item.screen
                    ? navigation.navigate(item.screen)
                    : setSelectedChipKey(item.key)
                }
              >
                <Ionicons
                  name={item.icon}
                  size={17}
                  color={isSelected ? EMERALD : "#ffffff"}
                />
                <ChipLabel selected={isSelected}>{label}</ChipLabel>
              </CategoryChip>
            );
          }}
        />

        {/* Inside HeaderCard, which is the part of this screen that does
            not scroll. In the body it was the first row of the tab and
            still went away the moment somebody started reading job
            adverts — and an employer opening Emplois reads job adverts on
            the way to deciding to post one. Here it is simply always
            there.

            Only on Emplois: on Marketplace it would offer something the
            tab is not about. */}
        {selectedChipKey === "jobs" && mayPublish ? (
          <HireBar onPress={startJobPosting}>
            <HireDisc>
              <Ionicons name="megaphone" size={15} color="#ffffff" />
            </HireDisc>
            <HireBarLabel numberOfLines={1}>{t("jobsPostTitle")}</HireBarLabel>
            <HireCta>
              <HireCtaLabel>{t("jobsHireCta")}</HireCtaLabel>
            </HireCta>
          </HireBar>
        ) : null}
      </HeaderCard>

      {isDefaultBrowse ? (
        <ScrollView
          contentContainerStyle={scrollContentStyle}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {/* Above the quick-access row, not buried at the bottom: if the
              listings query is down, every product section below is empty,
              and an unexplained empty marketplace reads as "there is
              nothing for sale here" rather than "we couldn't load it".
              Pull-to-refresh is already wired to this same ScrollView, so
              the notice names the gesture that retries. */}
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

          <QuickAccessRow horizontal showsHorizontalScrollIndicator={false}>
            {QUICK_ACCESS.map((item) => (
              <QuickAccessItem
                key={item.key}
                onPress={() => {
                  if (item.chip) {
                    setSelectedChipKey(item.chip);
                  } else if (item.screen) {
                    navigation.navigate(item.screen);
                  } else {
                    navigation.navigate("CategoryListings", {
                      categoryKey: item.categoryKey,
                      labelEn: item.labelEn,
                      labelFr: item.labelFr,
                    });
                  }
                }}
              >
                <QuickAccessIcon>
                  <QuickAccessEmoji>{item.icon}</QuickAccessEmoji>
                </QuickAccessIcon>
                <QuickAccessLabel numberOfLines={2}>
                  {t(item.labelKey)}
                </QuickAccessLabel>
              </QuickAccessItem>
            ))}
          </QuickAccessRow>

          {nearestPharmacy ? (
            <UtilityCard
              /* The card names one pharmacy, so it opens that pharmacy.
                 Sending it to the list meant the card answered a question it
                 had already answered, and made the user find the same entry
                 again. */
              onPress={() =>
                openListing(navigation, nearestPharmacy.listing, t, language)
              }
            >
              <UtilityKicker>{t("quickAccessPharmacyKicker")}</UtilityKicker>
              <UtilityRow>
                <UtilityInfoCol>
                  <UtilityName numberOfLines={1}>
                    {language === "en"
                      ? nearestPharmacy.listing.titleEn
                      : nearestPharmacy.listing.titleFr}
                  </UtilityName>
                  {(() => {
                    const duty = getDutyLabel(
                      nearestPharmacy.listing,
                      language,
                      t,
                    );
                    return duty.text ? (
                      <DutyBadgeRow>
                        <DutyDot stale={duty.isStale} />
                        <DutyBadgeText stale={duty.isStale} numberOfLines={1}>
                          {duty.text} · {nearestPharmacy.distance.toFixed(1)} km
                        </DutyBadgeText>
                      </DutyBadgeRow>
                    ) : null;
                  })()}
                </UtilityInfoCol>
                <Ionicons name="arrow-forward" size={16} color={EMERALD} />
              </UtilityRow>
            </UtilityCard>
          ) : null}

          {/* The named, checked businesses open the feed.
              
              This sits above "Près de {city}", which itself was moved to the
              top once for a good reason — local is the promise the app is
              built on, and the reader chose that city. The row above it now
              is the one part of the feed that is not a selection we made
              either: every card is a business a person verified, and the
              distributors among them are the names somebody scrolling past
              already recognises. Recognition is what makes the rest of the
              feed worth trusting, so it goes first and local follows
              immediately. */}
          {businessCards.length > 0 ? (
            <Section>
              <SectionHeading label={t("verifiedBusinessesSectionTitle")} />
              <BusinessMarquee ads={businessCards} navigation={navigation} />
            </Section>
          ) : null}

          <Section>
            <NearSectionHeader onPress={() => setCityPickerVisible(true)}>
              <SectionHeading
                label={t("nearYouSectionTitle", { city: nearYouCity })}
              />
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textMuted}
              />
            </NearSectionHeader>
            {nearYouListings.length > 0 ? (
              <FlatList
                data={nearYouListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => (
                  <NearCard listing={item} navigation={navigation} />
                )}
              />
            ) : (
              <EmptyCityText>
                {t("nearYouEmpty", { city: nearYouCity })}
              </EmptyCityText>
            )}
          </Section>

          {filteredListings.length > 0 ? (
            <Section>
              <SectionHeading label={t("recommendedSectionTitle")} />
              <FlatList
                data={filteredListings}
                showsVerticalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => (
                  <RecommendedCard
                    listing={item}
                    navigation={navigation}
                    isFavorite={favoriteIds.has(item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                    userCoords={userCoords}
                  />
                )}
              />
            </Section>
          ) : null}

          {/* Only when the popularity signal is real. Without it
              trendingListings is listings.slice(0, 5) — the first five
              of exactly what Recommandé shows in full underneath, and
              two rails of the same cards is padding, not a section. */}
          {hasRealTrending ? (
            <Section>
              <SectionHeading label={t("trendingSectionTitle")} />
              <FlatList
                showsVerticalScrollIndicator={false}
                data={trendingListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={trendingCardWidth + spacing.sm}
                decelerationRate="fast"
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => (
                  <TrendingCard
                    listing={item}
                    navigation={navigation}
                    cardWidth={trendingCardWidth}
                  />
                )}
              />
            </Section>
          ) : null}

          {feedJobs.length > 0 ? (
            <Section>
              <SectionHeading label={t("quickAccessJobsFeedTitle")} />
              <FlatList
                showsVerticalScrollIndicator={false}
                data={feedJobs}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => {
                  const feedJobTitle =
                    language === "en" ? item.titleEn : item.titleFr;
                  const feedJobType =
                    language === "en" ? item.typeEn : item.typeFr;
                  const feedJobSalary =
                    language === "en" ? item.salaryEn : item.salaryFr;
                  // Banded by how much experience the job asks for, so the
                  // feed answers "can I apply for this?" before anything is
                  // read. A posting that never stated a band keeps the plain
                  // border rather than being guessed at.
                  const experienceKey = getExperienceLevel(item);
                  return (
                    <FeedJobCard onPress={() => setSelectedChipKey("jobs")}>
                      <FeedJobCardInner
                        accent={
                          experienceKey
                            ? getExperienceMark(experienceKey, colors)
                            : null
                        }
                      >
                        <FeedJobTopGroup>
                          {item.postedDaysAgo < 1 ? (
                            <FeedJobBadgeAccent>
                              🔥 {t("jobsNewTag")}
                            </FeedJobBadgeAccent>
                          ) : feedJobType ? (
                            <FeedJobBadge>{feedJobType}</FeedJobBadge>
                          ) : null}
                          <FeedJobTitle numberOfLines={2}>
                            {feedJobTitle}
                          </FeedJobTitle>
                          <FeedJobMeta numberOfLines={1}>
                            {item.city}
                          </FeedJobMeta>
                        </FeedJobTopGroup>
                        {/* Two lines. "80 000 – 120 000 FCFA / mois" does
                            not fit across 168px and was being cut to
                            "80 000 – 120 000 FC…", which is the one number
                            somebody scans this rail for. The card is a fixed
                            190px with empty middle, so the second line costs
                            nothing. */}
                        <FeedJobSalary
                          onRequest={!feedJobSalary}
                          numberOfLines={2}
                        >
                          {feedJobSalary ?? t("jobsFeedSalaryOnRequest")}
                        </FeedJobSalary>
                      </FeedJobCardInner>
                    </FeedJobCard>
                  );
                }}
              />
            </Section>
          ) : null}

          {dealListings.length > 0 ? (
            <Section>
              <SectionHeading label={t("dealsSectionTitle")} />
              <FlatList
                data={dealListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => (
                  <DealCard listing={item} navigation={navigation} />
                )}
              />
            </Section>
          ) : null}

          <ScreenFooter />
        </ScrollView>
      ) : selectedChipKey === "jobs" ? (
        <ScrollView
          contentContainerStyle={jobsBodyContentStyle}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {/* Scope first, then filters.

              These are two different kinds of control and they were the
              wrong way round: where you are looking and who you are (an
              employer, someone reviewing saved ads) decides the pool, and
              Pour vous / Récent / Temps plein narrow whatever that pool
              turns out to be. Putting scope on top also lifts Recruter to
              the first row of the tab, which is the point — an employer
              should not have to read a filter row to find their own door. */}
          <JobLocFilterRow>
            <JobLocPill onPress={() => setJobCitySheetOpen(true)}>
              <Ionicons name="location" size={13} color={EMERALD} />
              <JobLocPillLabel numberOfLines={1}>
                {jobCity ?? t("pharmacyAllCities")}
              </JobLocPillLabel>
            </JobLocPill>
            <JobFiltersPill
              onPress={() => setJobsSortOpen(true)}
              active={jobsSortBy !== "date"}
            >
              <JobFiltersPillLabel active={jobsSortBy !== "date"}>
                {t("jobsFilters")}
              </JobFiltersPillLabel>
            </JobFiltersPill>
            <JobSaveLink
              active={showSavedJobsOnly}
              onPress={() => setShowSavedJobsOnly((value) => !value)}
            >
              <Ionicons
                name={showSavedJobsOnly ? "heart" : "heart-outline"}
                size={14}
                color={EMERALD}
              />
              <JobSaveLinkLabel>{t("jobsSavedLink")}</JobSaveLinkLabel>
            </JobSaveLink>
          </JobLocFilterRow>

          <JobChipScroll horizontal showsHorizontalScrollIndicator={false}>
            {JOB_FILTERS.map((f) => {
              const active = activeJobFilter === f.key;
              return (
                <JobFilterChip
                  key={f.key}
                  active={active}
                  onPress={() => selectJobFilter(f.key)}
                >
                  <Ionicons
                    name={f.icon}
                    size={13}
                    color={active ? "#ffffff" : colors.textMuted}
                  />
                  <JobFilterChipLabel active={active}>
                    {t(f.labelKey)}
                  </JobFilterChipLabel>
                  {jobFilterCounts[f.key] != null ? (
                    <JobFilterCount active={active}>
                      {jobFilterCounts[f.key]}
                    </JobFilterCount>
                  ) : null}
                </JobFilterChip>
              );
            })}
          </JobChipScroll>

          {/* Same disclosure RestaurantsScreen makes, for the same reason:
              until an employer has posted, these five are invented, and a
              candidate has no other way to tell. Applying to one already
              shows an honest "saved, not sent" screen — this says so before
              they spend time writing an application. */}
          {showingSampleJobs ? (
            <JobSampleNote>
              <JobSampleNoteIcon>
                <Ionicons
                  name="information-circle-outline"
                  size={15}
                  color={EMERALD}
                />
              </JobSampleNoteIcon>
              <JobSampleNoteLabel>{t("jobsSampleNote")}</JobSampleNoteLabel>
            </JobSampleNote>
          ) : null}

          <SectionHeading
            label={t("jobsForYouSection")}
            meta={t("jobsCategoryCount", { count: jobsForYou.length })}
          />
          {/* The cards have been colour-coded by required experience all
              along, with nothing anywhere saying so — a colour nobody can
              decode is just decoration, and a red card reads as a warning
              rather than as "this one wants a veteran". The swatches are
              built from the same getExperienceTint/getExperienceAccent the
              cards use, so the legend cannot drift from what it explains,
              and it inverts with the theme for free.

              It sits under the heading of the list it describes rather than
              up with the filters, where it was one of five stacked bands a
              candidate had to get past before seeing a single job — and far
              enough from the badges that it was not obviously about them. */}
          <JobLegend>
            <JobLegendCaption>{t("jobsExperienceLegend")}</JobLegendCaption>
            <JobLegendItems>
              {experienceLevels.map((level) => (
                <JobLegendItem key={level.key}>
                  {/* Solid ink, not the badge's fill. The fill is a wash
                      built to sit behind text, and at 14px across three
                      washes read as one colour — which is exactly what a
                      legend must not do. This is the dot from the middle of
                      the badge, scaled up. */}
                  <JobLegendSwatch
                    tint={getExperienceMark(level.key, colors)}
                    accent={getExperienceMark(level.key, colors)}
                  />
                  <JobLegendLabel>
                    {getExperienceLabel(level.key, language)}
                  </JobLegendLabel>
                </JobLegendItem>
              ))}
            </JobLegendItems>
          </JobLegend>

          {jobsForYou.length === 0 ? (
            <EmptyCityText>{t("jobsEmptyResults")}</EmptyCityText>
          ) : (
            <JobList>
              {jobsForYou.map((job) => {
                const jobTitle = language === "en" ? job.titleEn : job.titleFr;
                const typeLabel = language === "en" ? job.typeEn : job.typeFr;
                const category = jobCategories.find(
                  (c) => c.key === job.category,
                );
                const categoryLabel = category
                  ? language === "en"
                    ? category.labelEn
                    : category.labelFr
                  : null;
                const salary = language === "en" ? job.salaryEn : job.salaryFr;
                const posted = language === "en" ? job.postedEn : job.postedFr;
                const isJobFav = jobFavoriteIds.has(job.id);
                const experienceKey = getExperienceLevel(job);
                const experienceLabel = getExperienceLabel(
                  experienceKey,
                  language,
                );
                return (
                  <JobCard
                    key={job.id}
                    onPress={() => navigation.navigate("JobDetail", { job })}
                  >
                    <JobCardTopRow>
                      {/* The employer's logo where they uploaded one. The
                          gradient initial stays as the fallback rather than
                          being replaced by a grey placeholder — the same
                          rule the account avatar follows. */}
                      {job.logoUrl ? (
                        <JobLogoPhoto
                          source={{ uri: job.logoUrl }}
                          resizeMode="cover"
                        />
                      ) : (
                        <JobLogoGradient
                          colors={[EMERALD, GOLD]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <JobLogoLabel>
                            {(job.company ?? "")
                              .trim()
                              .charAt(0)
                              .toUpperCase() || "?"}
                          </JobLogoLabel>
                        </JobLogoGradient>
                      )}
                      <JobInfoCol>
                        <JobTitleRow>
                          {/* Two lines. Real job titles in Bénin are long
                              — "Assistant(e) administratif(ve)",
                              "Technicien(ne) de maintenance industrielle" —
                              and on one line they were cut mid-word, which
                              is the one field on the card a candidate
                              cannot afford to guess at. */}
                          <JobTitleText numberOfLines={2}>
                            {jobTitle}
                          </JobTitleText>
                          <Pressable
                            onPress={() => toggleJobFavorite(job.id)}
                            hitSlop={8}
                          >
                            <Ionicons
                              name={isJobFav ? "heart" : "heart-outline"}
                              size={16}
                              color={isJobFav ? "#C1512D" : colors.textMuted}
                            />
                          </Pressable>
                        </JobTitleRow>
                        <JobCompanyRow>
                          <JobCompanyText>{job.company}</JobCompanyText>
                          {job.verified ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={13}
                              color={EMERALD}
                            />
                          ) : null}
                          {/* A driver offering to work, sitting among
                              employers offering jobs. Both belong in
                              Transport and they are opposite things, so the
                              card says which one it is rather than leaving a
                              candidate to apply to another candidate. */}
                          {job.isOffer ? (
                            <OfferBadge>
                              <OfferBadgeLabel>
                                {t("jobsOfferBadge")}
                              </OfferBadgeLabel>
                            </OfferBadge>
                          ) : null}
                        </JobCompanyRow>
                      </JobInfoCol>
                    </JobCardTopRow>
                    <JobLocRow>
                      <Ionicons
                        name="location-outline"
                        size={12}
                        color={colors.textMuted}
                      />
                      <JobLocText>
                        {job.city}
                        {job.distanceKm != null &&
                        (activeJobFilter === "nearby" ||
                          jobsSortBy === "distance")
                          ? ` · ${job.distanceKm.toFixed(1)} km`
                          : ""}
                      </JobLocText>
                    </JobLocRow>
                    <JobTagsRow>
                      {/* Every band gets a badge, not only the beginner
                          one. "Sans expérience" alone told a candidate
                          nothing about the cards that lacked it — they could
                          be asking for one year or ten. The colour is the
                          same ramp the legend and the job detail page use,
                          and the words are on it as well, so the band still
                          reads for anyone who cannot separate the three
                          greens.

                          First in the row, ahead of "Nouveau" and the job
                          type: this row scrolls sideways, and at the end of
                          it the badge was cut in half on a normal phone —
                          the one tag the legend exists to explain was the
                          one you had to swipe to finish reading. */}
                      {experienceLabel ? (
                        <JobExpTag
                          tint={getExperienceTint(experienceKey, colors)}
                          accent={getExperienceMark(experienceKey, colors)}
                        >
                          <JobExpDot
                            accent={getExperienceMark(experienceKey, colors)}
                          />
                          <JobExpLabel
                            accent={getExperienceAccent(experienceKey, colors)}
                          >
                            {experienceLabel}
                          </JobExpLabel>
                        </JobExpTag>
                      ) : null}
                      {job.postedDaysAgo < 1 ? (
                        <JobTagAccent>🔥 {t("jobsNewTag")}</JobTagAccent>
                      ) : null}
                      <JobTag>{typeLabel}</JobTag>
                      {categoryLabel ? <JobTag>{categoryLabel}</JobTag> : null}
                    </JobTagsRow>
                    {salary ? <JobSalary>{salary}</JobSalary> : null}
                    <JobPosted>{posted}</JobPosted>
                  </JobCard>
                );
              })}
            </JobList>
          )}

          <SectionHeading label={t("jobsExploreSection")} />
          <CatGrid>
            {jobCategories.map((c) => {
              const selected = selectedJobCategory === c.key;
              const count = jobCountsByCategory[c.key] ?? 0;
              return (
                <CatCard
                  key={c.key}
                  selected={selected}
                  accent={c.color}
                  tint={sectorTint(c.color, 0.07)}
                  onPress={() =>
                    setSelectedJobCategory(selected ? null : c.key)
                  }
                >
                  <CatIconWrap
                    tint={sectorTint(c.color, selected ? 0.22 : 0.13)}
                  >
                    <Ionicons name={c.icon} size={20} color={c.color} />
                  </CatIconWrap>
                  <CatLabel numberOfLines={2}>
                    {language === "en" ? c.labelEn : c.labelFr}
                  </CatLabel>
                  <CatCount accent={c.color} muted={count === 0}>
                    {count > 0
                      ? t("jobsCategoryCount", { count })
                      : t("jobsCategoryEmpty")}
                  </CatCount>
                </CatCard>
              );
            })}
          </CatGrid>

          <ScreenFooter />
        </ScrollView>
      ) : (
        <FlatList
          data={gridItems}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) =>
            item.type === "ad" ? item.key : item.listing.id
          }
          numColumns={2}
          columnWrapperStyle={rowStyle}
          contentContainerStyle={listContentStyle}
          refreshControl={refreshControl}
          ListHeaderComponent={
            <>
              <VerifiedFilterRow>
                <VerifiedFilterPill
                  active={showVerifiedOnly}
                  onPress={() => setShowVerifiedOnly((value) => !value)}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={showVerifiedOnly ? "#ffffff" : EMERALD}
                  />
                  <VerifiedFilterLabel active={showVerifiedOnly}>
                    {t("marketVerifiedOnlyFilter")}
                  </VerifiedFilterLabel>
                </VerifiedFilterPill>
              </VerifiedFilterRow>
              {searchedPharmacies.length > 0 ? (
                <PharmacySearchSection>
                  <PharmacySearchLabel>
                    {t("pharmacySearchResultsLabel")}
                  </PharmacySearchLabel>
                  {searchedPharmacies.map((place) => (
                    <PharmacySearchRow key={place.id}>
                      <PharmacySearchTopRow
                        onPress={() => handlePharmacyDirections(place)}
                      >
                        <Ionicons
                          name="medkit-outline"
                          size={18}
                          color={EMERALD}
                        />
                        <PharmacySearchInfo>
                          <PharmacySearchName numberOfLines={1}>
                            {place.name}
                          </PharmacySearchName>
                          {place.address ? (
                            <PharmacySearchAddress numberOfLines={1}>
                              {place.address}
                            </PharmacySearchAddress>
                          ) : null}
                          {place.isOpenNow != null || place.rating != null ? (
                            <PharmacySearchMetaRow>
                              {place.isOpenNow != null ? (
                                <PharmacyOpenBadge open={place.isOpenNow}>
                                  <PharmacyOpenBadgeText open={place.isOpenNow}>
                                    {place.isOpenNow
                                      ? t("placeOpenNow")
                                      : t("placeClosedNow")}
                                  </PharmacyOpenBadgeText>
                                </PharmacyOpenBadge>
                              ) : null}
                              {place.rating != null ? (
                                <PharmacyRatingRow>
                                  <Ionicons
                                    name="star"
                                    size={11}
                                    color={GOLD}
                                  />
                                  <PharmacyRatingText>
                                    {place.rating.toFixed(1)}
                                  </PharmacyRatingText>
                                </PharmacyRatingRow>
                              ) : null}
                            </PharmacySearchMetaRow>
                          ) : null}
                        </PharmacySearchInfo>
                        <Ionicons
                          name="navigate-outline"
                          size={18}
                          color={EMERALD}
                        />
                      </PharmacySearchTopRow>
                      {place.phone ? (
                        <PhoneCallButtons
                          phone={place.phone}
                          style={{ marginTop: spacing.sm }}
                        />
                      ) : null}
                    </PharmacySearchRow>
                  ))}
                </PharmacySearchSection>
              ) : null}
            </>
          }
          renderItem={({ item }) =>
            item.type === "ad" ? (
              <AdCard ad={item.ad} />
            ) : (
              <ListingCard listing={item.listing} />
            )
          }
          ListFooterComponent={<ScreenFooter />}
        />
      )}

      <Modal
        visible={jobCitySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setJobCitySheetOpen(false)}
      >
        <JobSheetBackdrop onPress={() => setJobCitySheetOpen(false)}>
          <JobSheet onStartShouldSetResponder={() => true}>
            <JobSheetHandle />
            <JobSheetTitle>{t("chooseCityTitle")}</JobSheetTitle>
            <JobCurrentLocationRow onPress={requestLocation}>
              <Ionicons name="locate-outline" size={17} color={EMERALD} />
              <JobCurrentLocationLabel>
                {t("sellUseCurrentLocation")}
              </JobCurrentLocationLabel>
            </JobCurrentLocationRow>
            <SearchBar
              value={jobCitySearch}
              onChangeText={setJobCitySearch}
              placeholder={t("searchCityPlaceholder")}
            />
            <JobSheetScroll contentContainerStyle={sheetScrollContentStyle}>
              <JobSheetRow
                selected={!jobCity}
                onPress={() => {
                  setJobCity(null);
                  setJobCitySheetOpen(false);
                  setJobCitySearch("");
                }}
                style={jobAllCitiesRowStyle}
              >
                <JobSheetRowLabel>{t("pharmacyAllCities")}</JobSheetRowLabel>
                {!jobCity ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null}
              </JobSheetRow>
              {filteredJobCities.map((city) => (
                <JobSheetRow
                  key={city}
                  selected={jobCity === city}
                  onPress={() => {
                    setJobCity(city);
                    setJobCitySheetOpen(false);
                    setJobCitySearch("");
                  }}
                >
                  <JobSheetRowLabel>{city}</JobSheetRowLabel>
                  {jobCity === city ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </JobSheetRow>
              ))}
            </JobSheetScroll>
          </JobSheet>
        </JobSheetBackdrop>
      </Modal>

      <Modal
        visible={jobsSortOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setJobsSortOpen(false)}
      >
        <JobSheetBackdrop onPress={() => setJobsSortOpen(false)}>
          <JobSheet onStartShouldSetResponder={() => true}>
            <JobSheetHandle />
            <JobSheetTitle>{t("jobsSortSheetTitle")}</JobSheetTitle>
            {JOB_SORT_OPTIONS.map((opt) => {
              const selected = jobsSortBy === opt.key;
              return (
                <JobSortRow
                  key={opt.key}
                  onPress={() => selectJobsSort(opt.key)}
                >
                  <JobSortRowLabel selected={selected}>
                    {t(opt.labelKey)}
                  </JobSortRowLabel>
                  <JobSortDotOuter selected={selected}>
                    {selected ? <JobSortDotInner /> : null}
                  </JobSortDotOuter>
                </JobSortRow>
              );
            })}
            <JobSortActionsWrap
              style={{ paddingBottom: insets.bottom + spacing.md }}
            >
              <JobSortApplyButton onPress={() => setJobsSortOpen(false)}>
                <JobSortApplyButtonLabel>
                  {t("jobsSortApplyButton", { count: jobsForYou.length })}
                </JobSortApplyButtonLabel>
              </JobSortApplyButton>
            </JobSortActionsWrap>
          </JobSheet>
        </JobSheetBackdrop>
      </Modal>

      <Modal
        visible={cityPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCityPickerVisible(false)}
      >
        <ModalBackdrop onPress={() => setCityPickerVisible(false)}>
          <ModalSheet onStartShouldSetResponder={() => true}>
            <ModalHeaderRow>
              <ModalTitle>{t("chooseCityTitle")}</ModalTitle>
              <Pressable
                onPress={() => setCityPickerVisible(false)}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </ModalHeaderRow>
            <SearchBar
              value={citySearch}
              onChangeText={setCitySearch}
              placeholder={t("searchCityPlaceholder")}
            />
            {manualNearCity ? (
              <ResetCityRow
                onPress={() => {
                  setManualNearCity(null);
                  setCityPickerVisible(false);
                }}
              >
                <Ionicons
                  name="locate-outline"
                  size={16}
                  color={colors.primary}
                />
                <ResetCityLabel>{t("useMyLocationCity")}</ResetCityLabel>
              </ResetCityRow>
            ) : null}
            <FlatList
              data={filteredCities}
              showsVerticalScrollIndicator={false}
              keyExtractor={(city) => city}
              renderItem={({ item: city }) => (
                <CityRow
                  onPress={() => {
                    setManualNearCity(city);
                    setCityPickerVisible(false);
                    setCitySearch("");
                  }}
                >
                  <CityRowLabel selected={city === nearYouCity}>
                    {city}
                  </CityRowLabel>
                  {city === nearYouCity ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </CityRow>
              )}
            />
          </ModalSheet>
        </ModalBackdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(TabSafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// It sits under the category chips for the whole time somebody is in
// Emplois, so it has to survive being looked at a hundred times. The first
// version survived by being invisible — a pale strip of text with a chevron,
// which reads as a notice and gets skipped like one.
//
// A control instead: a filled disc on one side, a filled action on the
// other, and a hairline holding them together. The weight is all in those
// two small solid shapes rather than in a block of colour, so it reads as
// something to press without competing with the job cards below it.
const HireBar = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  /* The chip row above ends flush against this, so it needs its own air —
     the two read as one stuck-together block otherwise.
     
     20px horizontal, not 16: HeaderRow, the search field and the chip row
     all sit at 20, and this was the last thing in the banner still at the
     old 16. Invisible while the header was white; a visible step in now. */
  margin: 12px 20px ${spacing.sm}px;
  padding: 7px 7px 7px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.22);
`;

const HireDisc = styled.View`
  width: 30px;
  height: 30px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: ${EMERALD};
`;

const HireBarLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const HireCta = styled.View`
  padding: 7px 14px;
  border-radius: ${radius.pill}px;
  background-color: ${EMERALD};
`;

const HireCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

// The same banner the seller dashboard and Local open with — one gradient,
// one corner radius, on all three screens that lead with a full-width
// header.
//
// Every control inside it inverts. That is the part that is not a colour
// swap: a greeting, two round buttons, a search field and the chip row that
// decides what this whole screen shows were all drawn for white, and the
// selected chip is the one that actually breaks — it fills with
// theme.primary, which on this ground is emerald on emerald.
const HeaderCard = styled(LinearGradient).attrs({
  colors: ["#0B6E4F", "#07362A", "#05261D"],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
})`
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  padding-top: ${spacing.lg}px;
  padding-bottom: 14px;
  ${shadow.card}
`;

const SearchWrap = styled.View`
  padding-horizontal: 20px;
  margin-top: 10px;
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: 20px;
  gap: ${spacing.sm}px;
  margin-bottom: 13px;
`;

const AvatarButton = styled(Tappable)`
  border-radius: 14px;
`;

// Same box as the monogram below it, so the header does not shift by a pixel
// when a photo finishes loading or is removed.
const AvatarPhoto = styled(Image)`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const Avatar = styled(LinearGradient)`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
`;

const AvatarLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: #ffffff;
`;

const GreetingBlock = styled.View`
  flex: 1;
`;

const GreetingText = styled.Text`
  ${type.h3}
  color: #ffffff;
`;

const WelcomeText = styled.Text`
  ${type.caption}
  color: rgba(255, 255, 255, 0.72);
  margin-top: 1px;
`;

const HeaderActions = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const IconButton = styled(Tappable)`
  width: 38px;
  height: 38px;
  border-radius: ${radius.pill}px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.16);
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

// This row decides what the whole screen shows, so it has to read as a set of
// controls. At 14px padding and a 13px label it stood 36px tall — under the
// 44px minimum touch target, small enough to be fiddly to hit and quiet
// enough that it looked like a caption strip rather than something tappable.
//
// 12px of vertical padding against a 20px line box is exactly 44. The
// rounded rectangle matches the budget buttons and the brand filter chips
// rather than the pill it was: a pill is the shape of a passive tag, and
// these are not tags.
// Pill, like every other chip on this screen. Filtres, Enregistrés, Pour
// vous and Récent were already pills; the category tabs — the most
// important control here — were the one rounded rectangle in the set.
const CategoryChip = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  margin-right: 10px;
  padding-horizontal: 16px;
  padding-vertical: 12px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.selected ? "#ffffff" : "rgba(255, 255, 255, 0.14)"};
  ${(props) => (props.selected ? shadow.card : "")}
`;

// Weight carries the selected state alongside the fill, so which chip is
// active survives being read at a glance in bright sun — the fill alone is a
// hue difference, and hue is the first thing to go on a phone outdoors.
const ChipLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 14px;
  line-height: 20px;
  color: ${(props) => (props.selected ? EMERALD : "#ffffff")};
`;

const Section = styled.View`
  margin-bottom: 34px;
`;

const PharmacySearchSection = styled.View`
  margin: ${spacing.md}px ${spacing.md}px 4px;
  gap: ${spacing.sm}px;
`;

const PharmacySearchLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
`;

const PharmacySearchRow = styled.View`
  padding: 12px 14px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surface};
  ${shadow.card}
`;

const PharmacySearchTopRow = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
`;

const PharmacySearchInfo = styled.View`
  flex: 1;
  min-width: 0px;
`;

const PharmacySearchName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const PharmacySearchAddress = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const PharmacySearchMetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: 4px;
`;

const PharmacyOpenBadge = styled.View`
  background-color: ${(props) => (props.open ? "rgba(11,110,79,0.1)" : "rgba(193,81,45,0.1)")};
  border-radius: ${radius.pill}px;
  padding: 2px 8px;
`;

const PharmacyOpenBadgeText = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${(props) => (props.open ? EMERALD : "#C1512D")};
`;

const PharmacyRatingRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 3px;
`;

const PharmacyRatingText = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const QuickAccessRow = styled.ScrollView`
  margin-bottom: 20px;
`;

const QuickAccessItem = styled(Tappable)`
  align-items: center;
  gap: 6px;
  margin-right: 14px;
  width: 58px;
`;

const QuickAccessIcon = styled.View`
  width: 48px;
  height: 48px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  align-items: center;
  justify-content: center;
  ${shadow.card}
`;

const QuickAccessEmoji = styled.Text`
  font-size: 24px;
`;

const QuickAccessLabel = styled.Text`
  ${type.caption}
  font-size: 10px;
  color: ${(props) => props.theme.text};
  text-align: center;
`;

const UtilityCard = styled(Tappable)`
  padding: 14px 16px;
  border-radius: ${radius.xl}px;
  background-color: rgba(11, 110, 79, 0.06);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.1);
  margin-bottom: 26px;
`;

const UtilityKicker = styled.Text`
  ${type.captionMedium}
  font-size: 10px;
  letter-spacing: 0.5px;
  color: ${EMERALD};
  margin-bottom: 8px;
`;

const UtilityRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const UtilityInfoCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const UtilityName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-bottom: 4px;
`;

const DutyBadgeRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
`;

const DutyDot = styled.View`
  width: 7px;
  height: 7px;
  border-radius: 3.5px;
  background-color: ${(props) => (props.stale ? props.theme.accentDark : EMERALD)};
  flex-shrink: 0;
`;

const DutyBadgeText = styled.Text`
  ${type.caption}
  font-size: 12px;
  font-weight: 600;
  color: ${(props) => (props.stale ? props.theme.accentDark : EMERALD)};
`;

// Same split-shadow pattern the feed job cards use (and
// ListingCard's Card/CardInner) — border-radius + overflow:hidden +
// elevation combined on one Android view can leave the elevation shadow's
// rectangular outline showing as a hard line across the bottom corners
// instead of following the curve, so the shadow lives on its own plain
// outer layer and the clipped, bordered content sits in a separate inner
// one.
const FeedJobCard = styled(Tappable)`
  flex-shrink: 0;
  width: 168px;
  height: 190px;
  border-radius: ${radius.lg}px;
  margin-right: ${spacing.sm}px;
  shadow-color: #0b1f16;
  shadow-offset: 0px 6px;
  shadow-opacity: 0.16;
  shadow-radius: 14px;
  elevation: 7;
`;

// These cards are ~160px wide and already carry a type badge, a two-line
// title, a city and a salary — there is no room for a fourth labelled
// element, so the band shows as a rail down the leading edge instead. Solid
// ink at full strength, which is what makes the three of them separable in
// a row; the card itself stays white like every other card in the feed.
const FeedJobCardInner = styled.View`
  flex: 1;
  padding: 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-left-width: ${(props) => (props.accent ? 3 : 1)}px;
  border-left-color: ${(props) => props.accent ?? props.theme.border};
  justify-content: space-between;
  overflow: hidden;
`;

const FeedJobTopGroup = styled.View``;

const FeedJobBadge = styled.Text`
  align-self: flex-start;
  ${type.caption}
  font-size: 9.5px;
  font-weight: 700;
  color: ${(props) => props.theme.textMuted};
  background-color: ${(props) => props.theme.surfaceAlt};
  padding: 3px 8px;
  border-radius: ${radius.pill}px;
  margin-bottom: 8px;
  overflow: hidden;
`;

const FeedJobBadgeAccent = styled.Text`
  align-self: flex-start;
  ${type.caption}
  font-size: 9.5px;
  font-weight: 700;
  color: ${EMERALD};
  background-color: rgba(11, 110, 79, 0.1);
  padding: 3px 8px;
  border-radius: ${radius.pill}px;
  margin-bottom: 8px;
  overflow: hidden;
`;

const FeedJobTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  line-height: 16px;
  margin-bottom: 6px;
`;

const FeedJobMeta = styled.Text`
  ${type.caption}
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

// Every card shows a salary line — even the ones that didn't come with
// one, where it falls back to "salary on request" — so this always
// anchors to the card's bottom edge instead of leaving a card that
// skipped it looking like its content just ran out partway down. Same
// pattern used for postings without a listed rate.
const FeedJobSalary = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => (props.onRequest ? props.theme.textMuted : EMERALD)};
`;

const TrendingPressable = styled(Tappable)`
  height: 180px;
  border-radius: ${radius.xl}px;
  overflow: hidden;
  margin-right: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const TrendingImage = styled.Image`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const TrendingGradient = styled(LinearGradient)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

const TrendingBadge = styled.View`
  position: absolute;
  top: 14px;
  left: 14px;
  background-color: ${GOLD_BADGE_BG};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 4px;
`;

const TrendingBadgeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${BADGE_TEXT};
`;

const TrendingContent = styled.View`
  position: absolute;
  left: ${spacing.md}px;
  right: ${spacing.md}px;
  bottom: ${spacing.sm}px;
`;

const TrendingTitle = styled.Text`
  ${type.h3}
  color: #ffffff;
  margin-bottom: 4px;
`;

const TrendingMetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const TrendingPrice = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${GOLD};
`;

const TrendingCity = styled.Text`
  ${type.caption}
  color: rgba(255, 255, 255, 0.85);
`;

const RecCard = styled(Tappable)`
  width: 168px;
  margin-right: 14px;
  ${shadow.card}
`;

const RecCardInner = styled.View`
  border-radius: ${radius.xl}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
`;

const RecImageWrap = styled.View`
  height: 118px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RecImage = styled.Image`
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RecDotsWrap = styled.View`
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  flex-direction: row;
  justify-content: center;
  gap: 3px;
`;

const RecDot = styled.View`
  width: 4px;
  height: 4px;
  border-radius: 2px;
  background-color: ${(props) => (props.active ? "#ffffff" : "rgba(255,255,255,0.5)")};
`;

const RecPromotedBadge = styled.View`
  position: absolute;
  top: 8px;
  left: 8px;
  background-color: ${GOLD_BADGE_BG};
  border-radius: ${radius.pill}px;
  padding-horizontal: 7px;
  padding-vertical: 3px;
`;

const RecPromotedLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 9.5px;
  color: ${BADGE_TEXT};
`;

const RecFavButton = styled(Tappable)`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.28);
  z-index: 10;
  elevation: 10;
`;

const RecBody = styled.View`
  padding: 10px 12px 12px;
`;

const RecPriceRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
`;

const RecPrice = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  flex-shrink: 1;
  margin-right: ${spacing.xs}px;
`;

const RecTitle = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
  margin-bottom: 4px;
`;

const RecSellerRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
`;

const RecSellerAvatar = styled.View`
  width: 16px;
  height: 16px;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.border};
`;

const RecSellerAvatarLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9px;
  color: ${(props) => props.theme.textMuted};
`;

const RecMeta = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const RecTime = styled.Text`
  font-size: 10px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const NearPressable = styled(Tappable)`
  width: 148px;
  margin-right: 14px;
  ${shadow.card}
`;

const NearCardInner = styled.View`
  border-radius: ${radius.xl}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
`;

const NearImageWrap = styled.View`
  height: 90px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const NearImage = styled.Image`
  width: 100%;
  height: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const NearBody = styled.View`
  padding: 9px 11px 11px;
`;

const NearPrice = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const NearTitle = styled.Text`
  font-size: 12px;
  color: ${(props) => props.theme.text};
  margin-top: 3px;
`;

const NearMeta = styled.Text`
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const DealPriceRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
`;

const DealOldPrice = styled.Text`
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
  text-decoration-line: line-through;
`;

const StaticBusinessRow = styled.View`
  flex-direction: row;
`;

const MarqueeClip = styled.View`
  overflow: hidden;
  padding-vertical: 8px;
  margin-vertical: -8px;
`;

const MarqueeRow = styled(Animated.View)`
  flex-direction: row;
`;

const BusinessPressable = styled(Tappable)`
  width: ${BUSINESS_CARD_WIDTH}px;
  align-items: center;
  padding: 18px 16px 16px;
  border-radius: ${radius.xl}px;
  margin-right: ${BUSINESS_CARD_GAP}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

// The firm's own colour across the head of the card. This is what makes six
// cards look like six companies rather than six copies — the accent is the
// same one the Concessionnaires screen gives each firm, so a person who has
// seen one screen recognises the other.
const FirmBand = styled(LinearGradient)`
  width: 100%;
  height: 68px;
  border-radius: ${radius.lg}px;
  align-items: center;
  justify-content: center;
  padding-horizontal: 14px;
  margin-bottom: 12px;
`;

const FirmLogoPlate = styled.View`
  width: 78%;
  height: 74%;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  padding: 5px 9px;
  background-color: #ffffff;
`;

const FirmLogoImage = styled.Image`
  width: 100%;
  height: 100%;
`;

const FirmEmblem = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 24px;
  letter-spacing: 0.5px;
  width: 100%;
  text-align: center;
  color: #ffffff;
`;

// Real manufacturer marks on white plates, the same treatment the
// Concessionnaires cards use. Four is what fits at this width; the rest are
// on the screen this opens.
const MarqueRow = styled.View`
  flex-direction: row;
  justify-content: center;
  gap: 6px;
  margin-bottom: 12px;
`;

const MarquePlate = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 11px;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-color: rgba(17, 24, 39, 0.08);
`;

const MarqueMark = styled.Image`
  width: 26px;
  height: 26px;
`;

const FirmTagline = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 15px;
  text-align: center;
  margin-top: 3px;
  color: ${(props) => props.theme.textMuted};
`;

const BusinessFootRow = styled.View`
  align-items: center;
  margin-top: 10px;
  gap: 7px;
`;

const BusinessCityRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 3px;
`;

const BusinessCity = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

// Inset inside the white plate: these marks arrive trimmed to their own
// bounds, so without padding they touch the edges and read as cramped.
const LogoImage = styled.Image`
  width: 74%;
  height: 74%;
`;

const BusinessLogoPlate = styled.View`
  width: ${BUSINESS_LOGO_SIZE}px;
  height: ${BUSINESS_LOGO_SIZE}px;
  align-items: center;
  justify-content: center;
  border-radius: 26px;
  margin-bottom: ${spacing.sm}px;
  /* White under a real logo, whatever the theme. These marks are transparent
     PNGs and most of them are dark — on the dark surface they vanish. */
  background-color: ${(props) =>
    props.light ? "#ffffff" : props.theme.surface};
  ${shadow.card}
`;

const BusinessLogo = styled(LinearGradient)`
  width: ${BUSINESS_LOGO_SIZE}px;
  height: ${BUSINESS_LOGO_SIZE}px;
  border-radius: 26px;
  align-items: center;
  justify-content: center;
`;

const BusinessLogoLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 20px;
  /* Room for adjustsFontSizeToFit to shrink into — without a width the text
     is measured at its natural size and never scales down. */
  width: ${BUSINESS_LOGO_SIZE - 20}px;
  text-align: center;
  color: #ffffff;
`;

const VerifiedPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const VerifiedPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => props.theme.primaryDark};
`;

const BusinessMetaLine = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
  margin-top: 3px;
`;

const BusinessPhoto = styled.Image`
  width: ${BUSINESS_LOGO_SIZE}px;
  height: ${BUSINESS_LOGO_SIZE}px;
  border-radius: 26px;
`;

const BusinessName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  line-height: 19px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const NearSectionHeader = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const EmptyCityText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
`;

const ModalBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const ModalSheet = styled.View`
  max-height: 80%;
  background-color: ${(props) => props.theme.background};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: ${spacing.md}px ${spacing.md}px ${spacing.lg}px;
`;

const ModalHeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing.sm}px;
`;

const ModalTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
`;

const ResetCityRow = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-vertical: ${spacing.sm}px;
`;

const ResetCityLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.primary};
`;

const CityRow = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-vertical: ${spacing.sm}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const CityRowLabel = styled.Text`
  ${(props) => (props.selected ? type.bodyMedium : type.body)}
  color: ${(props) => (props.selected ? props.theme.primary : props.theme.text)};
`;

// --- "Emplois" chip body (ported from the old standalone JobsScreen) ---

const JobLocFilterRow = styled.View`
  flex-direction: row;
  align-items: center;
  /* Four items now. Wrapping is what a narrow handset does instead of
     clipping the last one off the edge, where it would be exactly as
     invisible as the card below the list was. */
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;

const JobLocPill = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  background-color: rgba(11, 110, 79, 0.08);
  padding: 7px 11px;
  border-radius: ${radius.pill}px;
  max-width: 70%;
`;

const JobLocPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
`;

const JobFiltersPill = styled(Tappable)`
  padding: 8px 14px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.active ? "rgba(11, 110, 79, 0.08)" : props.theme.surfaceAlt)};
`;

const JobFiltersPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.active ? EMERALD : props.theme.text)};
`;

// Was pushed to the right with margin-left: auto, which was fine while the
// row held three items on one line. With four it wraps, and an auto margin
// on a wrapped item strands it alone on a second line hugging the edge. It
// flows with the others instead — same shell as the pills beside it, since
// it is the same kind of control.
const JobSaveLink = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 8px 13px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.active ? "rgba(11, 110, 79, 0.08)" : props.theme.surfaceAlt};
`;

const JobSaveLinkLabel = styled.Text`
  ${type.captionMedium}
  color: ${EMERALD};
`;

// Bleeds to the screen edges so the row reads as scrollable — a chip
// clipped mid-way at the margin is the cue that there's more to the right,
// which a row ending flush inside the padding never gives.
const JobChipScroll = styled.ScrollView.attrs(() => ({
  contentContainerStyle: {
    paddingHorizontal: spacing.md,
    paddingRight: spacing.lg,
  },
}))`
  margin-horizontal: -${spacing.md}px;
  margin-bottom: ${spacing.md}px;
`;

// Sits above the marketplace grid rather than in the category chip row —
// it narrows by who is selling, not what is being sold, so mixing it in
// with the category chips would read as another category.
const VerifiedFilterRow = styled.View`
  flex-direction: row;
  padding-bottom: ${spacing.sm}px;
`;

const VerifiedFilterPill = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 8px 13px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.active ? EMERALD : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const VerifiedFilterLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

// The active chip keeps a border of its own colour rather than dropping to
// 0px — swapping border-width on selection made every chip shift by a pixel
// as the selection moved along the row.
const JobFilterChip = styled(Tappable)`
  flex-shrink: 0;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 10px 15px;
  border-radius: ${radius.pill}px;
  margin-right: ${spacing.sm}px;
  background-color: ${(props) => (props.active ? EMERALD : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

// Dimmed rather than hidden at zero: "Missions 0" tells you there's nothing
// there without making you tap to find out, which is the whole point of
// putting a number on the chip.
const JobFilterCount = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${(props) => (props.active ? "rgba(255, 255, 255, 0.75)" : props.theme.textMuted)};
`;

const JobFilterChipLabel = styled.Text`
  font-family: ${(props) => (props.active ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

// The disclosure is not negotiable — until an employer has posted, these
// jobs are invented and the reader has no other way to know. What changed is
// its voice: a filled green panel four lines deep was the loudest thing on
// the tab, competing with the jobs it was a footnote about. A hairline card
// says the same words without pretending to be the headline.
const JobSampleNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 11px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.lg}px;
`;
const JobSampleNoteIcon = styled.View`
  margin-top: 1px;
`;
const JobSampleNoteLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
`;
const ListingsErrorNote = styled.View`
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

const JobLegend = styled.View`
  gap: 10px;
  margin-bottom: ${spacing.lg}px;
`;
const JobLegendCaption = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  line-height: 15px;
  color: ${(props) => props.theme.textMuted};
`;
// Wraps rather than scrolls: three short bands fit two lines on the
// narrowest phone, and a legend you have to swipe to finish reading has
// failed at the one job it has.
const JobLegendItems = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;
// Each band sits on its own plate rather than floating in a shared row.
// Whitespace alone wasn't enough to separate them: three swatch-plus-label
// pairs on one line read as one continuous strip no matter how wide the gap
// got, because nothing marked where an entry ended. The plate does that,
// and it lets the gap come back down.
//
// surface, not surfaceAlt: the body sits on `background` (#F6F8F5) and
// surfaceAlt (#F0F2EE) is close enough to it to disappear. White with a
// hairline border separates cleanly in both themes.
const JobLegendItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  padding: 6px 11px 6px 9px;
  border-radius: 10px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;
// A miniature of the card itself — same fill, same border, same radius
// ratio — so the mapping is read off the shape rather than memorised.
const JobLegendSwatch = styled.View`
  width: 14px;
  height: 14px;
  border-radius: 5px;
  background-color: ${(props) => props.tint};
  border-width: 1px;
  border-color: ${(props) => props.accent};
`;
const JobLegendLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const JobList = styled.View`
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

// Same experience banding as the "Nouveaux emplois" cards above. Tapping
// one of those switches to this list, so a job that showed the top band in
// the feed has to show the top band here — otherwise the colour reads as
// decoration rather than as information about the job. It shows as a rail
// there and a badge here only because a 160px card has no room for words.
// An ordinary white card. The experience band is carried by JobExpTag
// inside it, not by the card's own fill.
//
// It was the fill for a while, and both ways of doing that failed. A strong
// tint drowned the card's muted text; a tint faint enough to read through
// was too faint to tell the three bands apart, so every card came out the
// same flat sage and the legend explained a difference that wasn't visible.
// A badge is only ever a few words on a known ground, so it can carry the
// colour at four times the strength and stay legible — which is the whole
// reason the bands are distinguishable again.
//
// The opaque background also brings the shadow back: Android draws
// elevation *through* a translucent background, and that was what put a
// second darker rectangle inside every card while the tint was in charge.
const JobCard = styled(Tappable)`
  padding: 15px 16px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const JobCardTopRow = styled.View`
  flex-direction: row;
  gap: 11px;
  margin-bottom: 10px;
`;

// Same box as the gradient it replaces, so a list of employers — some with
// a logo, some without — stays on one grid.
const JobLogoPhoto = styled(Image)`
  width: 42px;
  height: 42px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.border};
`;

const JobLogoGradient = styled(LinearGradient)`
  width: 42px;
  height: 42px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
`;

const JobLogoLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: #ffffff;
`;

const JobInfoCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const JobTitleRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const JobTitleText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const JobCompanyRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
`;

const OfferBadge = styled.View`
  padding: 2px 7px;
  border-radius: ${radius.pill}px;
  background-color: rgba(217, 164, 65, 0.16);
`;

const OfferBadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #8a6415;
`;

const JobCompanyText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const JobLocRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
`;

const JobLocText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

// Horizontal-scrolling instead of wrapping — a job with several tags
// (new/full-time/category/no-experience) keeps them all on one line,
// scrollable within the card, rather than wrapping to a second line that
// pushes the rest of the card's content down unevenly between listings.
// Wraps rather than scrolls sideways.
//
// As a horizontal ScrollView the tags past the card's edge were simply cut,
// with nothing to say more existed — no fade, no chevron, and a swipe
// gesture that competes with the vertical list it lives inside. On a
// four-tag card the last one was routinely half a word.
//
// Wrapping costs a second row on the busiest cards and shows everything,
// which is the trade to make: these are the job's type, sector and
// experience band, and a candidate scanning for "Temps plein" cannot scan
// for what is not drawn.
const JobTagsRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
`;

const JobTag = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
  background-color: ${(props) => props.theme.surfaceAlt};
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
`;

// The band badge. Mirrors the tag on JobDetailScreen exactly — same fill,
// same dot, same ink — because tapping a card is where the two are compared.
const JobExpTag = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  background-color: ${(props) => props.tint};
  border-width: 1px;
  border-color: ${(props) => props.accent};
  padding: 3px 9px 3px 7px;
  border-radius: ${radius.pill}px;
`;
const JobExpDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => props.accent};
`;
const JobExpLabel = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  font-weight: 600;
  color: ${(props) => props.accent};
`;

const JobTagAccent = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${EMERALD};
  background-color: rgba(11, 110, 79, 0.1);
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
`;

const JobSalary = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
  margin-bottom: 4px;
`;

const JobPosted = styled.Text`
  ${type.caption}
  font-size: 11px;
  color: #c4c4c6;
`;

// Real cards rather than the flat pills this used to be: a two-column grid
// gives each field its own coloured icon tile and a live count, which is
// what turns "Explorer par métier" from decoration into navigation. The old
// chips were plain Views with no onPress at all — they looked tappable and
// did nothing.
const CatGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  padding-bottom: ${spacing.xl}px;
`;

const CatCard = styled(Tappable)`
  width: 47.5%;
  padding: 14px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.selected ? props.tint : props.theme.surface)};
  border-width: 1.5px;
  border-color: ${(props) => (props.selected ? props.accent : props.theme.border)};
`;

const CatIconWrap = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.tint};
  margin-bottom: 10px;
`;

const CatLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
  margin-bottom: 3px;
`;

// Muted when a field has nothing open — the card stays browsable, but it
// shouldn't advertise jobs that don't exist.
const CatCount = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${(props) => (props.muted ? props.theme.textMuted : props.accent)};
`;
const JobSheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const JobSheet = styled.View`
  max-height: 80%;
  background-color: ${(props) => props.theme.background};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding-top: ${spacing.sm}px;
`;

const JobSheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.border};
  align-self: center;
  margin-bottom: ${spacing.md}px;
`;

const JobSheetTitle = styled.Text`
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
const JobSheetScroll = styled.ScrollView.attrs(() => ({
  keyboardShouldPersistTaps: "handled",
}))`
  padding-horizontal: ${spacing.md}px;
`;

const JobSheetRow = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 13px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => (props.selected ? props.theme.primaryLight : "transparent")};
`;

const JobSheetRowLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const JobSortRow = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.md}px;
  padding-horizontal: ${spacing.lg}px;
  padding-vertical: 15px;
`;

const JobSortRowLabel = styled.Text`
  ${type.bodyMedium}
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const JobSortDotOuter = styled.View`
  width: 20px;
  height: 20px;
  border-radius: 10px;
  border-width: 2px;
  border-color: ${(props) => (props.selected ? EMERALD : props.theme.border)};
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const JobSortDotInner = styled.View`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${EMERALD};
`;

const JobSortActionsWrap = styled.View`
  padding: ${spacing.sm}px ${spacing.lg}px 0;
`;

const JobSortApplyButton = styled(Tappable)`
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  padding-vertical: 14px;
  background-color: ${EMERALD};
`;

const JobSortApplyButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #ffffff;
`;

const JobCurrentLocationRow = styled(Tappable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.lg}px;
  padding-vertical: 13px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.xs}px;
`;

const JobCurrentLocationLabel = styled.Text`
  ${type.bodyMedium}
  color: ${EMERALD};
`;
