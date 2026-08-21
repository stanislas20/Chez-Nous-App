import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  Share,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import MapView, { Marker } from "react-native-maps";
import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { firestore } from "../config/firebase";
import { cityCoordinates } from "../data/cityCoordinates";
import {
  getCuisineLabel,
  getPriceBandLabel,
  getPriceBandSymbol,
} from "../data/restaurantCuisines";
import {
  getOpeningDayLabel,
  isOpenNow,
  openingDays,
} from "../data/openingDays";
import { buildLinkUrl, restaurantLinkKinds } from "../data/restaurantLinks";
import {
  getAmenityLabel,
  getPropertyTypeLabel,
  getRealEstateDealLabel,
  realEstatePriceSuffixKey,
} from "../data/realEstate";
import { categories } from "../data/categories";
import { openChat } from "../utils/openChat";
import { useFavorites } from "../hooks/useFavorites";
import { recordRecentlyViewed } from "../hooks/useRecentlyViewed";
import { useApprovedListings } from "../hooks/useApprovedListings";
import { CategoryPlaceholder } from "../components/CategoryPlaceholder";
import { PhoneCallButtons } from "../components/PhoneCallButtons";
import { ImageLightbox } from "../components/ImageLightbox";
import { useSellerStats } from "../hooks/useSellerStats";
import { withViewHeat } from "../utils/viewHeat";
import { getDutyLabel } from "../utils/pharmacyDuty";
import { getTodayDateString } from "../utils/listingLifecycle";
import { openAccountGate } from "../utils/openAccountGate";

const EMERALD = "#0B6E4F";
const priceFormatter = new Intl.NumberFormat("fr-FR");
const DEFAULT_COORDS = { latitude: 6.3703, longitude: 2.3912 };
const categoryByKey = categories.reduce((map, category) => {
  map[category.key] = category;
  return map;
}, {});
const saleStatusLabelKeys = {
  available: "saleStatusAvailable",
  pending: "saleStatusPending",
  negotiating: "saleStatusNegotiating",
  sold: "saleStatusSold",
};
const saleStatusTint = (theme) => ({
  available: theme.primaryLight,
  pending: theme.accentLight,
  negotiating: "rgba(91, 192, 235, 0.18)",
  sold: theme.errorLight,
});
const saleStatusTextColor = (theme) => ({
  available: theme.primary,
  pending: theme.accentDark,
  negotiating: theme.skyBlue,
  sold: theme.error,
});
// The card's own drop shadow bleeds a few pixels past its layout box —
// without bottom padding here, the FlatList's tight auto-sized bounds clip
// that shadow right where it should fade out, reading as the surrounding
// white space cutting into the bottom of the card.
const similarListContentStyle = {
  paddingRight: spacing.lg,
  paddingBottom: spacing.md,
};

function HeroVideo({ uri }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    // Muted decorative preview — it must never claim the iOS audio session.
    // The default ('auto') still activates one in playback mode, and a held
    // playback session is why voice search failed with `audio-capture` /
    // "Session activation failed": the recogniser could not activate a
    // recording session while these were on screen. A silent thumbnail has
    // no audio to protect, so it mixes.
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });
  return (
    <HeroVideoView player={player} contentFit="cover" nativeControls={false} />
  );
}

function HeroGallery({ media, width, height, onIndexChange, onPressPhoto }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slideStyle = { width, height };

  return (
    <>
      <FlatList
        data={media}
        keyExtractor={(item, index) => `${item.mediaUrl}-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setActiveIndex(index);
          onIndexChange?.(index);
        }}
        renderItem={({ item }) =>
          item.mediaType === "video" ? (
            <GallerySlide style={slideStyle}>
              <PhotoPressable onPress={() => onPressPhoto?.(item.mediaUrl)}>
                <HeroVideo uri={item.mediaUrl} />
              </PhotoPressable>
            </GallerySlide>
          ) : (
            <GallerySlide style={slideStyle}>
              <PhotoPressable onPress={() => onPressPhoto?.(item.mediaUrl)}>
                <HeroImage
                  source={{ uri: item.mediaUrl }}
                  resizeMode="contain"
                />
              </PhotoPressable>
            </GallerySlide>
          )
        }
      />
      <GalleryDots>
        {media.map((_, index) => (
          <GalleryDot key={index} active={index === activeIndex} />
        ))}
      </GalleryDots>
    </>
  );
}

// A compact teaser card for the "similar listings" row — mirrors
// ForYouScreen's NearCard (fixed pixel thumbnail height, not aspect-ratio)
// rather than reusing the full grid ListingCard, whose aspect-ratio-driven
// Thumbnail wasn't resolving before this horizontal FlatList measured it,
// clipping the card's bottom.
function SimilarCard({ listing, navigation }) {
  const { language } = useI18n();
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;
  const category = categoryByKey[listing.categoryKey];

  return (
    <SimilarPressable
      onPress={() =>
        navigation.navigate("ProductDetail", {
          listing: { ...listing, createdAt: null },
        })
      }
    >
      <SimilarCardInner>
        <SimilarImageWrap>
          {coverUri ? (
            <SimilarImage source={{ uri: coverUri }} resizeMode="contain" />
          ) : (
            <CategoryPlaceholder
              icon={category?.icon ?? "pricetag-outline"}
              size="card"
            />
          )}
        </SimilarImageWrap>
        <SimilarBody>
          <SimilarPrice numberOfLines={1}>
            {priceFormatter.format(listing.price)} FCFA
          </SimilarPrice>
          <SimilarTitle numberOfLines={1}>{title}</SimilarTitle>
          <SimilarMeta numberOfLines={1}>{listing.city}</SimilarMeta>
        </SimilarBody>
      </SimilarCardInner>
    </SimilarPressable>
  );
}

export function ProductDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { listing } = route.params;
  const { language, t } = useI18n();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const description =
    language === "en" ? listing.descriptionEn : listing.descriptionFr;
  const coverUri = listing.mediaUrl ?? listing.image;
  const hasGallery = Array.isArray(listing.media) && listing.media.length > 1;
  // A single photo is shown at its own real aspect ratio (full width, no
  // fixed height) so nothing gets cropped — "cover" inside a fixed-height
  // box was cutting off part of the photo. A multi-photo gallery still uses
  // a fixed height so every slide pages at the same size (standard
  // swipeable-gallery behavior — Instagram/Airbnb do the same).
  const [singlePhotoRatio, setSinglePhotoRatio] = useState(4 / 3);
  // Every slide in the gallery shares one height (a swipeable pager can't
  // reasonably resize itself mid-swipe), sized from the first photo's real
  // aspect ratio so at least the primary photo shows with zero cropping.
  const [galleryAspectRatio, setGalleryAspectRatio] = useState(4 / 3);
  const gallerySlideHeight = windowWidth / galleryAspectRatio;
  const galleryCount = hasGallery ? listing.media.length : coverUri ? 1 : 0;

  // Image.getSize fetches real pixel dimensions directly from the URI —
  // more reliable here than an <Image onLoad>, which depends on that exact
  // slide having actually mounted inside the horizontal FlatList.
  useEffect(() => {
    const primaryUri = hasGallery ? listing.media?.[0]?.mediaUrl : coverUri;
    const isVideo = hasGallery
      ? listing.media?.[0]?.mediaType === "video"
      : listing.mediaType === "video";
    if (!primaryUri || isVideo) return undefined;
    let cancelled = false;
    Image.getSize(
      primaryUri,
      (w, h) => {
        if (cancelled || !w || !h) return;
        if (hasGallery) setGalleryAspectRatio(w / h);
        else setSinglePhotoRatio(w / h);
      },
      () => {
        // Non-critical — keep the default ratio if this fails.
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverUri, hasGallery, listing.media]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  // Every slide, video included — the viewer plays videos with their own
  // controls rather than freezing on a first frame.
  const lightboxMedia = hasGallery
    ? listing.media
        .filter((item) => item.mediaUrl)
        .map((item) => ({
          uri: item.mediaUrl,
          isVideo: item.mediaType === "video",
        }))
    : coverUri
      ? [{ uri: coverUri, isVideo: listing.mediaType === "video" }]
      : [];
  const [lightboxAt, setLightboxAt] = useState(null);
  // Matched on the URL, not the slide number: a listing can mix photos and
  // videos, and the two indexes only agree by accident.
  const openLightbox = (mediaUrl) => {
    const position = lightboxMedia.findIndex((item) => item.uri === mediaUrl);
    setLightboxAt(position < 0 ? 0 : position);
  };

  const isOwner = !!user && user.uid === listing.sellerId;
  const canEditLocation = isOwner && listing.status === "pending";

  const { favoriteIds, toggleFavorite: toggleFavoriteRemote } = useFavorites(
    user?.uid,
  );
  const isFavorite = listing.id ? favoriteIds.has(listing.id) : false;
  const toggleFavorite = () => {
    if (!user) {
      Alert.alert(t("favoritesSignInTitle"), t("favoritesSignInMessage"));
      return;
    }
    toggleFavoriteRemote(listing.id);
  };

  // One increment per real visit — skip the seller's own views (shouldn't
  // inflate their own count) and anything that isn't a real, approved,
  // already-persisted listing (e.g. the unsaved preview from
  // CreateListingScreen, or a not-yet-approved listing the security rules
  // wouldn't allow this write on anyway).
  const hasCountedView = useRef(false);
  useEffect(() => {
    if (hasCountedView.current) return;
    if (isOwner || listing.status !== "approved" || !listing.id) return;
    hasCountedView.current = true;
    const today = getTodayDateString();
    const isSameDay = listing.viewCountDate === today;
    updateDoc(doc(firestore, "listings", listing.id), {
      viewCount: increment(1),
      viewCountToday: isSameDay ? increment(1) : 1,
      viewCountDate: today,
    }).catch(() => {
      // Non-critical — a missed view count shouldn't disrupt browsing.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  // Personal history — recorded regardless of ownership (you did view it),
  // unlike the view counter above which deliberately excludes the owner.
  useEffect(() => {
    if (!listing.id) return;
    recordRecentlyViewed(listing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);
  const isPharmacy = listing.categoryKey === "pharmacyOnDuty";
  const isJobs = listing.categoryKey === "jobs";
  const isRestaurant = listing.categoryKey === "restaurants";
  const isRealEstate = listing.categoryKey === "realEstate";
  const isVehicle = listing.categoryKey === "vehicles";
  // Reputation belongs beside the seller's name, which is where a buyer
  // decides whether to trust them — not two taps away on a profile they
  // have no particular reason to open.
  const sellerStats = useSellerStats(listing.sellerId);
  // The live projection first, the copy stamped on the listing second. The
  // second only matters for listings published before this projection
  // existed and never touched since.
  const sellerPhotoUrl =
    sellerStats?.photoUrl ?? listing.sellerPhotoUrl ?? null;
  // null when the owner declared no hours — no badge at all rather than a
  // guess that could send someone to a closed door.
  const restaurantOpen = isRestaurant
    ? isOpenNow(listing.openDays, listing.openTime, listing.closeTime)
    : null;
  const whatsappUrl = isRestaurant
    ? buildLinkUrl("whatsapp", listing.whatsapp)
    : null;
  const restaurantLinks = isRestaurant
    ? restaurantLinkKinds
        .filter((kind) => kind.key !== "whatsapp")
        .map((kind) => ({
          ...kind,
          url: buildLinkUrl(kind.key, listing[kind.key]),
        }))
        .filter((kind) => kind.url)
    : [];
  const duty = isPharmacy ? getDutyLabel(listing, language, t) : null;
  const category = categoryByKey[listing.categoryKey];
  const categoryLabel = category
    ? language === "en"
      ? category.labelEn
      : category.labelFr
    : null;
  const initialCoords = {
    latitude:
      listing.latitude ??
      cityCoordinates[listing.city]?.latitude ??
      DEFAULT_COORDS.latitude,
    longitude:
      listing.longitude ??
      cityCoordinates[listing.city]?.longitude ??
      DEFAULT_COORDS.longitude,
  };
  const [pinCoords, setPinCoords] = useState(initialCoords);
  const [isLocationDirty, setIsLocationDirty] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  // Prefer other listings in the same category; in a young marketplace
  // there's often nothing else in that exact category yet, so fall back to
  // any other real listing rather than leaving the section permanently
  // empty — still genuine data either way, never invented.
  const allListings = useApprovedListings();
  const otherListings = (allListings ?? []).filter(
    (item) =>
      item.id !== listing.id &&
      item.categoryKey !== "pharmacyOnDuty" &&
      item.categoryKey !== "jobs",
  );
  const sameCategoryListings = otherListings.filter(
    (item) => item.categoryKey === listing.categoryKey,
  );
  const similarListings = (
    sameCategoryListings.length > 0 ? sameCategoryListings : otherListings
  ).slice(0, 10);

  const sellerListingCount = (allListings ?? []).filter(
    (item) => item.sellerId === listing.sellerId,
  ).length;
  const sellerMemberSinceDate = listing.sellerMemberSince?.toDate?.() ?? null;
  const sellerMemberSinceLabel = sellerMemberSinceDate
    ? t("dashboardMemberSince", {
        date: new Intl.DateTimeFormat(language === "en" ? "en-US" : "fr-FR", {
          month: "long",
          year: "numeric",
        }).format(sellerMemberSinceDate),
      })
    : null;

  const handleShare = async () => {
    try {
      const result = await Share.share({
        message: isPharmacy
          ? t("shareDutyPharmacyMessage", { title, phone: listing.phone ?? "" })
          : isJobs
            ? t("shareJobMessage", { title, company: listing.company ?? "" })
            : t("shareListingMessage", {
                title,
                price: `${priceFormatter.format(listing.price)} FCFA`,
              }),
      });
      // Only a share that actually happened. The sheet also resolves when
      // it is dismissed, and counting that would make the number a measure
      // of curiosity rather than of reach.
      if (result?.action !== Share.sharedAction || !listing.id) return;
      updateDoc(doc(firestore, "listings", listing.id), {
        shareCount: increment(1),
      }).catch(() => {
        // Non-critical — a missed count must never break sharing.
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const handleGetDirections = () => {
    const { latitude, longitude } = pinCoords;
    // No origin specified — the native maps app defaults to the user's
    // current location as the starting point.
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    );
  };

  const handleContactSeller = () => {
    openChat({ listing, listingTitle: title, user, navigation, t });
  };

  const handleSaveLocation = async () => {
    setIsSavingLocation(true);
    try {
      await updateDoc(doc(firestore, "listings", listing.id), {
        latitude: pinCoords.latitude,
        longitude: pinCoords.longitude,
      });
      setIsLocationDirty(false);
      Alert.alert(
        t("productDetailDescriptionTitle"),
        t("mapLocationSavedMessage"),
      );
    } catch (error) {
      Alert.alert(
        t("productDetailDescriptionTitle"),
        t("errorLocationSaveFailed"),
      );
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleViewSellerProfile = () => {
    navigation.navigate("SellerProfile", {
      sellerId: listing.sellerId,
      sellerName: listing.sellerName,
      memberSince: listing.sellerMemberSince ?? null,
      sellerVerified: Boolean(listing.sellerVerified),
      sellerPhotoUrl,
    });
  };

  const handleReport = () => {
    if (!user) {
      Alert.alert(
        t("reportSignUpRequiredTitle"),
        t("reportSignUpRequiredMessage"),
        [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("signUpButton"),
            onPress: () => openAccountGate(navigation),
          },
        ],
      );
      return;
    }
    navigation.navigate("ReportListing", {
      listingId: listing.id,
      listingTitle: title,
    });
  };

  const saleStatus = listing.saleStatus ?? "available";

  return (
    <Container edges={["left", "right", "bottom"]}>
      <Content showsVerticalScrollIndicator={false}>
        <FloatingHeader style={{ paddingTop: insets.top + spacing.sm }}>
          <FloatingIconButton onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </FloatingIconButton>
          <FloatingHeaderSpacer />
          <FloatingIconButton onPress={toggleFavorite} hitSlop={8}>
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={18}
              color={isFavorite ? colors.error : colors.text}
            />
          </FloatingIconButton>
          <FloatingIconButton onPress={handleShare} hitSlop={8}>
            <Ionicons
              name="share-social-outline"
              size={18}
              color={colors.text}
            />
          </FloatingIconButton>
        </FloatingHeader>

        {coverUri && !hasGallery && listing.mediaType !== "video" ? (
          // A single photo: shown at its real aspect ratio, full width, no
          // fixed height, so nothing gets cropped.
          <HeroSingle>
            <PhotoPressable onPress={() => openLightbox(coverUri)}>
              <HeroSingleImage
                source={{ uri: coverUri }}
                resizeMode="contain"
                style={{ aspectRatio: singlePhotoRatio }}
              />
            </PhotoPressable>
            {listing.popular ? (
              <PopularBadge>
                <PopularBadgeLabel>
                  🔥 {t("productDetailPopularBadge")}
                </PopularBadgeLabel>
              </PopularBadge>
            ) : null}
          </HeroSingle>
        ) : (
          <Hero style={hasGallery ? { height: gallerySlideHeight } : undefined}>
            {!coverUri ? (
              <CategoryPlaceholder
                icon={category?.icon ?? "pricetag-outline"}
                size="hero"
              />
            ) : hasGallery ? (
              <HeroGallery
                media={listing.media}
                width={windowWidth}
                height={gallerySlideHeight}
                onIndexChange={setActivePhotoIndex}
                onPressPhoto={openLightbox}
              />
            ) : (
              <PhotoPressable onPress={() => openLightbox(coverUri)}>
                <HeroVideo uri={coverUri} />
              </PhotoPressable>
            )}
            {listing.popular ? (
              <PopularBadge>
                <PopularBadgeLabel>
                  🔥 {t("productDetailPopularBadge")}
                </PopularBadgeLabel>
              </PopularBadge>
            ) : null}
            {galleryCount > 1 ? (
              <PhotoCountBadge>
                <PhotoCountLabel>
                  {activePhotoIndex + 1} / {galleryCount}
                </PhotoCountLabel>
              </PhotoCountBadge>
            ) : null}
          </Hero>
        )}

        <Body>
          {isRestaurant ? (
            <PriceCard>
              <RestoTopRow>
                <RestoCuisine>
                  {getCuisineLabel(listing.cuisine, language)}
                </RestoCuisine>
                {listing.priceBand ? (
                  <RestoBandChip>
                    <RestoBandLabel>
                      {getPriceBandSymbol(listing.priceBand)} ·{" "}
                      {getPriceBandLabel(listing.priceBand, language)}
                    </RestoBandLabel>
                  </RestoBandChip>
                ) : null}
              </RestoTopRow>

              {restaurantOpen != null ? (
                <DutyRow>
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={restaurantOpen ? colors.primary : colors.textMuted}
                  />
                  <RestoOpenLabel open={restaurantOpen}>
                    {t(restaurantOpen ? "placeOpenNow" : "placeClosedNow")}
                    {listing.openTime && listing.closeTime
                      ? ` · ${listing.openTime} – ${listing.closeTime}`
                      : ""}
                  </RestoOpenLabel>
                </DutyRow>
              ) : null}

              {/* The week as a strip, with the closed days dimmed rather than
                  removed — "fermé le lundi" is information too. */}
              {listing.openDays?.length ? (
                <RestoDayRow>
                  {openingDays.map((day) => {
                    const on = listing.openDays.includes(day.key);
                    return (
                      <RestoDayChip key={day.key} on={on}>
                        <RestoDayLabel on={on}>
                          {getOpeningDayLabel(day.key, language)}
                        </RestoDayLabel>
                      </RestoDayChip>
                    );
                  })}
                </RestoDayRow>
              ) : null}

              {restaurantLinks.length ? (
                <RestoLinkRow>
                  {restaurantLinks.map((kind) => (
                    <RestoLinkButton
                      key={kind.key}
                      tint={`${kind.color}1F`}
                      onPress={() => Linking.openURL(kind.url)}
                    >
                      <Ionicons name={kind.icon} size={18} color={kind.color} />
                    </RestoLinkButton>
                  ))}
                </RestoLinkRow>
              ) : null}

              {/* Promoted out of the icon row: for a business this is the
                  contact people actually reach for, and burying it among
                  five social glyphs wastes it. */}
              {whatsappUrl ? (
                <WhatsAppButton onPress={() => Linking.openURL(whatsappUrl)}>
                  <Ionicons name="logo-whatsapp" size={18} color="#ffffff" />
                  <WhatsAppLabel>{t("contactOnWhatsApp")}</WhatsAppLabel>
                </WhatsAppButton>
              ) : null}

              {listing.phone ? (
                <PhoneCallButtons
                  phone={listing.phone}
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
            </PriceCard>
          ) : isPharmacy ? (
            <PriceCard>
              <DutyRow>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={duty.isStale ? colors.accentDark : colors.error}
                />
                <DutyLabel stale={duty.isStale}>{duty.text}</DutyLabel>
              </DutyRow>
              {listing.phone ? (
                <PhoneCallButtons
                  phone={listing.phone}
                  style={{ marginTop: spacing.xs }}
                />
              ) : null}
            </PriceCard>
          ) : isJobs ? (
            <PriceCard>
              <DutyRow>
                <Ionicons
                  name="business-outline"
                  size={16}
                  color={colors.text}
                />
                <JobCompanyLabel>{listing.company}</JobCompanyLabel>
              </DutyRow>
              {listing.salary ? (
                <JobSalaryText>{listing.salary}</JobSalaryText>
              ) : null}
            </PriceCard>
          ) : (
            <PriceRow>
              <PriceGroup>
                <PriceLine>
                  {/* Tabular figures so the digits sit on a fixed pitch —
                      a seven-figure price is read in groups, and
                      proportional numerals make the groups uneven. */}
                  <PriceAmount style={{ fontVariant: ["tabular-nums"] }}>
                    {priceFormatter.format(listing.price)}
                  </PriceAmount>
                  {/* A rent rendered as a bare total is not a cosmetic gap:
                      150 000 / month and 150 000 outright are different
                      offers and were displaying identically. */}
                  <PriceCurrency>
                    {isRealEstate && listing.realEstateDeal
                      ? t(realEstatePriceSuffixKey(listing.realEstateDeal))
                      : "FCFA"}
                  </PriceCurrency>
                </PriceLine>
                {/* Collected by the publish form since the beginning and
                    never shown. Whether a price is firm or negotiable
                    changes how a buyer opens the conversation. */}
                {listing.negotiable ? (
                  <NegotiableTag>
                    <Ionicons
                      name="swap-horizontal-outline"
                      size={12}
                      color={colors.primary}
                    />
                    <NegotiableTagLabel>
                      {t("sellFieldNegotiable")}
                    </NegotiableTagLabel>
                  </NegotiableTag>
                ) : null}
              </PriceGroup>
              <SaleStatusPill saleStatus={saleStatus}>
                <SaleStatusPillLabel saleStatus={saleStatus}>
                  {t(saleStatusLabelKeys[saleStatus])}
                </SaleStatusPillLabel>
              </SaleStatusPill>
            </PriceRow>
          )}
          <Title>{title}</Title>

          {/* Fields the forms have been collecting all along with nothing on
              the buyer's side to read them. */}
          {isRealEstate ? (
            <SpecGrid>
              {listing.realEstateDeal ? (
                <SpecItem>
                  <Ionicons
                    name="pricetag-outline"
                    size={15}
                    color={colors.primary}
                  />
                  <SpecText>
                    {getRealEstateDealLabel(listing.realEstateDeal, language)}
                  </SpecText>
                </SpecItem>
              ) : null}
              {listing.propertyType ? (
                <SpecItem>
                  <Ionicons
                    name="business-outline"
                    size={15}
                    color={colors.primary}
                  />
                  <SpecText>
                    {getPropertyTypeLabel(listing.propertyType, language)}
                  </SpecText>
                </SpecItem>
              ) : null}
              {listing.bedrooms ? (
                <SpecItem>
                  <Ionicons
                    name="bed-outline"
                    size={15}
                    color={colors.primary}
                  />
                  <SpecText>
                    {listing.bedrooms} {t("detailBedrooms")}
                  </SpecText>
                </SpecItem>
              ) : null}
              {listing.bathrooms ? (
                <SpecItem>
                  <Ionicons
                    name="water-outline"
                    size={15}
                    color={colors.primary}
                  />
                  <SpecText>
                    {listing.bathrooms} {t("detailBathrooms")}
                  </SpecText>
                </SpecItem>
              ) : null}
              {listing.surfaceArea ? (
                <SpecItem>
                  <Ionicons
                    name="resize-outline"
                    size={15}
                    color={colors.primary}
                  />
                  <SpecText>
                    {listing.surfaceArea} {t("sellSurfaceUnit")}
                  </SpecText>
                </SpecItem>
              ) : null}
              {listing.isFurnished ? (
                <SpecItem>
                  <Ionicons
                    name="cube-outline"
                    size={15}
                    color={colors.primary}
                  />
                  <SpecText>{t("sellFieldFurnished")}</SpecText>
                </SpecItem>
              ) : null}
              {listing.depositMonths ? (
                <SpecItem>
                  <Ionicons
                    name="wallet-outline"
                    size={15}
                    color={colors.primary}
                  />
                  <SpecText>
                    {t("detailDeposit")} {listing.depositMonths}{" "}
                    {t("sellDepositUnit")}
                  </SpecText>
                </SpecItem>
              ) : null}
            </SpecGrid>
          ) : null}

          {listing.amenities?.length ? (
            <AmenityWrap>
              {listing.amenities.map((key) => (
                <AmenityTag key={key}>
                  <AmenityTagLabel>
                    {getAmenityLabel(key, language)}
                  </AmenityTagLabel>
                </AmenityTag>
              ))}
            </AmenityWrap>
          ) : null}

          {listing.sportsSize || listing.babyDetail ? (
            <SpecGrid>
              <SpecItem>
                <Ionicons
                  name="resize-outline"
                  size={15}
                  color={colors.primary}
                />
                <SpecText>{listing.sportsSize ?? listing.babyDetail}</SpecText>
              </SpecItem>
            </SpecGrid>
          ) : null}

          <MetaRow>
            {category ? (
              <MetaItem>
                <MetaLabel>{categoryLabel}</MetaLabel>
              </MetaItem>
            ) : null}
            <MetaDot>·</MetaDot>
            <MetaItem>
              <Ionicons
                name="location-outline"
                size={13}
                color={colors.textMuted}
              />
              <MetaLabel>{listing.city}</MetaLabel>
            </MetaItem>
            {listing.status === "approved" ? (
              <>
                <MetaDot>·</MetaDot>
                <MetaLabel muted>
                  {/* The badge only appears once a listing is genuinely
                      being looked at — see viewHeat.js for why the
                      thresholds are set well above today's numbers. */}
                  {withViewHeat(
                    listing.viewCount,
                    t("productDetailViewCount", {
                      count: listing.viewCount ?? 0,
                    }),
                  )}
                </MetaLabel>
                {/* Silent at zero: "0 partages" beside a listing reads as a
                    verdict on it, where no number at all reads as new. */}
                {listing.shareCount ? (
                  <>
                    <MetaDot>·</MetaDot>
                    <MetaLabel muted>
                      {t("productDetailShareCount", {
                        count: listing.shareCount,
                      })}
                    </MetaLabel>
                  </>
                ) : null}
              </>
            ) : null}
          </MetaRow>

          {listing.sellerName ? (
            <Section>
              <SectionTitle>{t("productDetailSellerTitle")}</SectionTitle>
              <SellerRow onPress={handleViewSellerProfile}>
                {/* The seller's own picture when they have set one — the
                    difference between a shop and an anonymous initial. The
                    monogram stays for everyone who has not. */}
                {sellerPhotoUrl ? (
                  <SellerAvatarPhoto
                    source={{ uri: sellerPhotoUrl }}
                    resizeMode="cover"
                  />
                ) : (
                  <SellerAvatar>
                    <SellerAvatarLabel>
                      {listing.sellerName.trim().charAt(0).toUpperCase()}
                    </SellerAvatarLabel>
                  </SellerAvatar>
                )}
                <SellerInfoCol>
                  <SellerNameRow>
                    <SellerName numberOfLines={1}>
                      {listing.sellerName}
                    </SellerName>
                    {listing.sellerVerified ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={13}
                        color={colors.primary}
                      />
                    ) : null}
                  </SellerNameRow>
                  {sellerMemberSinceLabel ? (
                    <SellerSub numberOfLines={1}>
                      {sellerMemberSinceLabel}
                    </SellerSub>
                  ) : null}
                  <SellerSub numberOfLines={1}>
                    {t("sellerProfileActiveListings", {
                      count: sellerListingCount,
                    })}
                  </SellerSub>
                  {/* Silent until someone has actually been rated. "0 avis"
                    beside a name reads as a bad score rather than as a new
                    seller, and this marketplace is full of new sellers. */}
                  {sellerStats?.ratingCount ? (
                    <SellerRatingRow>
                      <Ionicons name="star" size={12} color="#D9A441" />
                      <SellerRatingLabel>
                        {sellerStats.rating.toFixed(1).replace(".", ",")} ·{" "}
                        {t("ratingCount", { count: sellerStats.ratingCount })}
                      </SellerRatingLabel>
                    </SellerRatingRow>
                  ) : null}
                </SellerInfoCol>
                <SellerProfileLink>
                  {t("productDetailViewProfileLink")}
                </SellerProfileLink>
              </SellerRow>
            </Section>
          ) : null}

          <Section>
            <SectionTitle>{t("productDetailLocationTitle")}</SectionTitle>
            <MapContainer>
              <MapView
                style={{ flex: 1 }}
                initialRegion={{
                  ...initialCoords,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
              >
                <Marker
                  coordinate={pinCoords}
                  draggable={canEditLocation}
                  onDragEnd={(event) => {
                    setPinCoords(event.nativeEvent.coordinate);
                    setIsLocationDirty(true);
                  }}
                />
              </MapView>
              <ApproxLocationBadge pointerEvents="none">
                <ApproxLocationLabel>
                  {t("productDetailApproxLocationBadge")}
                </ApproxLocationLabel>
              </ApproxLocationBadge>
            </MapContainer>

            <GetDirectionsButton onPress={handleGetDirections}>
              <Ionicons
                name="navigate-outline"
                size={16}
                color={colors.primary}
              />
              <GetDirectionsLabel>
                {t("getDirectionsButton")}
              </GetDirectionsLabel>
            </GetDirectionsButton>

            {canEditLocation && isLocationDirty ? (
              <SaveLocationButton
                onPress={handleSaveLocation}
                disabled={isSavingLocation}
              >
                <SaveLocationLabel>
                  {isSavingLocation
                    ? t("adUploadingLabel")
                    : t("mapSaveLocationButton")}
                </SaveLocationLabel>
              </SaveLocationButton>
            ) : null}
            {canEditLocation ? (
              <MapHint>{t("mapAdjustLocationHint")}</MapHint>
            ) : null}
          </Section>

          <Section>
            <SectionTitle>{t("productDetailDescriptionTitle")}</SectionTitle>
            <Description>{description}</Description>
          </Section>

          <SafetyBox>
            <SafetyTitle>{t("productDetailSafetyTitle")}</SafetyTitle>
            <SafetyTip>{t("productDetailSafetyTip1")}</SafetyTip>
            <SafetyTip>{t("productDetailSafetyTip2")}</SafetyTip>
            <SafetyTip>{t("productDetailSafetyTip3")}</SafetyTip>
          </SafetyBox>

          {!isPharmacy && similarListings.length > 0 ? (
            <Section>
              <SectionTitle>{t("productDetailSimilarTitle")}</SectionTitle>
              <FlatList
                data={similarListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={similarListContentStyle}
                renderItem={({ item }) => (
                  <SimilarCard listing={item} navigation={navigation} />
                )}
              />
            </Section>
          ) : null}

          {user ? (
            <ReportRow onPress={handleReport}>
              <ReportLabel>{t("productDetailReportLink")}</ReportLabel>
            </ReportRow>
          ) : null}
        </Body>
      </Content>

      {/* Mounted only while open, so reopening on a different photo starts
          at that photo instead of restoring the last one's index and zoom. */}
      {lightboxAt !== null ? (
        <ImageLightbox
          visible
          media={lightboxMedia}
          startIndex={lightboxAt}
          onClose={() => setLightboxAt(null)}
        />
      ) : null}

      {isOwner ? null : (
        <Footer>
          {isPharmacy && listing.phone ? (
            <FooterRow>
              <PhoneCallButtons
                phone={listing.phone}
                size="lg"
                style={{ flex: 1 }}
              />
              <SecondaryContactButton onPress={handleContactSeller}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={colors.primary}
                />
              </SecondaryContactButton>
            </FooterRow>
          ) : isVehicle && listing.phone ? (
            /* Calling is how a car actually gets bought here, so it is the
               primary action rather than one of five icons. This footer is
               also the only tap-to-call route for a vehicle now that the
               browse cards carry no buttons — chat and WhatsApp stay beside
               it for anyone who would rather write first. */
            <FooterRow>
              <FooterFavButton onPress={toggleFavorite}>
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={20}
                  color={isFavorite ? colors.error : colors.text}
                />
              </FooterFavButton>
              <PhoneCallButtons
                phone={listing.phone}
                size="lg"
                style={{ flex: 1 }}
              />
              {listing.whatsapp ? (
                <SecondaryContactButton
                  onPress={() =>
                    Linking.openURL(buildLinkUrl("whatsapp", listing.whatsapp))
                  }
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                </SecondaryContactButton>
              ) : null}
              <SecondaryContactButton onPress={handleContactSeller}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={colors.primary}
                />
              </SecondaryContactButton>
            </FooterRow>
          ) : (
            <FooterRow>
              <FooterFavButton onPress={toggleFavorite}>
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={20}
                  color={isFavorite ? colors.error : colors.text}
                />
              </FooterFavButton>
              <ContactButton onPress={handleContactSeller}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={colors.textInverse}
                />
                <ContactButtonLabel>
                  {t("productDetailContactButton")}
                </ContactButtonLabel>
              </ContactButton>
            </FooterRow>
          )}
        </Footer>
      )}
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Content = styled.ScrollView``;

const Hero = styled.View`
  height: 340px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

// A plain wrapper, not a button: it carries no chrome, so the only thing
// that says "tappable" is that a photo behaves the way photos do.
const PhotoPressable = styled(Pressable)`
  width: 100%;
  height: 100%;
`;

const HeroImage = styled.Image`
  width: 100%;
  height: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const HeroSingle = styled.View`
  width: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const HeroSingleImage = styled.Image`
  width: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const HeroVideoView = styled(VideoView)`
  width: 100%;
  height: 100%;
`;

const GallerySlide = styled.View``;

const GalleryDots = styled.View`
  position: absolute;
  bottom: ${spacing.sm}px;
  left: 0;
  right: 0;
  flex-direction: row;
  justify-content: center;
  gap: 6px;
`;

const GalleryDot = styled.View`
  width: ${(props) => (props.active ? "18px" : "6px")};
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => (props.active ? props.theme.surface : "rgba(255,255,255,0.6)")};
`;

// Bottom-right, not top — the floating header's icon buttons occupy the top
// of the photo, and the pagination dots already own bottom-center.
const PhotoCountBadge = styled.View`
  position: absolute;
  bottom: ${spacing.sm}px;
  right: ${spacing.md}px;
  background-color: rgba(0, 0, 0, 0.45);
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 4px;
`;

const PhotoCountLabel = styled.Text`
  ${type.captionMedium}
  color: #ffffff;
  font-size: 11px;
`;

// A real header bar in normal flow, not floated over the gallery — an
// overlay looked like it was covering/cropping the top of the photo, so the
// full image stays unobstructed instead (a deliberate departure from the
// mockup's overlapping header, in favor of the whole photo being visible).
// Floats over the photo (the photo itself is now sized to its real aspect
// ratio with no cropping — see singlePhotoRatio/galleryAspectRatio — so
// overlapping it no longer hides any of the image the way it did when a
// fixed-height "cover" crop was fighting the header for the same pixels).
const FloatingHeader = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${spacing.md}px;
  padding-bottom: ${spacing.sm}px;
  gap: ${spacing.sm}px;
  z-index: 10;
`;

const FloatingHeaderSpacer = styled.View`
  flex: 1;
`;

const FloatingIconButton = styled(Pressable)`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.surface};
  shadow-color: #000000;
  shadow-offset: 0px 3px;
  shadow-opacity: 0.2;
  shadow-radius: 8px;
  elevation: 6;
`;

const PopularBadge = styled.View`
  position: absolute;
  top: ${spacing.md}px;
  left: ${spacing.md}px;
  background-color: ${(props) => props.theme.accentLight};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 4px;
`;

const PopularBadgeLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.accentDark};
`;

const Body = styled.View`
  padding: ${spacing.lg}px;
`;

const PriceCard = styled.View`
  align-self: flex-start;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  shadow-color: #000000;
  shadow-offset: 0px 3px;
  shadow-opacity: 0.18;
  shadow-radius: 8px;
  elevation: 5;
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${spacing.sm}px;
`;

const PriceGroup = styled.View`
  flex: 1;
  min-width: 0px;
`;

const PriceLine = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 7px;
`;

// The number is the message; the currency is a unit. They used to be set at
// the same 26px, so "FCFA" shouted as loudly as the amount and the eye had
// to do the separating. Tightened tracking as well — large numerals set at
// default spacing read as loose.
const PriceAmount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 22px;
  line-height: 27px;
  letter-spacing: -0.2px;
  color: ${(props) => props.theme.text};
`;

const PriceCurrency = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  letter-spacing: 0.6px;
  color: ${(props) => props.theme.primary};
`;

const NegotiableTag = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  margin-top: 7px;
  padding: 4px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const NegotiableTagLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
`;

const Title = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.xs}px;
`;

const SaleStatusPill = styled.View`
  background-color: ${(props) => saleStatusTint(props.theme)[props.saleStatus]};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 5px;
`;

const SaleStatusPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => saleStatusTextColor(props.theme)[props.saleStatus]};
`;

const MetaRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: ${spacing.xs}px;
  margin-top: ${spacing.sm}px;
`;

const MetaItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const MetaDot = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

// Caption, not body. Category, city and view count are context for the
// title above them, and at 15px they were set at the same size as the
// description — reading as a second headline rather than as a byline.
const MetaLabel = styled.Text`
  ${type.caption}
  color: ${(props) => (props.muted ? props.theme.textMuted : props.theme.text)};
`;

const SellerRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-top: ${spacing.md}px;
  padding-right: ${spacing.md}px;
  padding-bottom: ${spacing.sm}px;
  padding-left: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.md}px;
`;

const SellerAvatar = styled.View`
  width: 42px;
  height: 42px;
  border-radius: ${radius.md}px;
  background-color: ${EMERALD};
  align-items: center;
  justify-content: center;
`;

const SellerAvatarPhoto = styled.Image`
  width: 42px;
  height: 42px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SellerAvatarLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: #ffffff;
`;

const SellerInfoCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const SellerNameRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const SellerName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const SellerSub = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 1px;
`;

const SellerRatingRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
`;

const SellerRatingLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
`;

const SellerProfileLink = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
  flex-shrink: 0;
`;

const MapContainer = styled.View`
  position: relative;
  height: 160px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  margin-top: ${spacing.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ApproxLocationBadge = styled.View`
  position: absolute;
  top: ${spacing.sm}px;
  left: ${spacing.sm}px;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 4px;
`;

const ApproxLocationLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 10px;
  color: #4d5c56;
`;

const GetDirectionsButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  border-radius: ${radius.md}px;
  border-width: 1.5px;
  border-color: ${(props) => props.theme.primary};
  padding-vertical: ${spacing.sm}px;
  margin-top: ${spacing.sm}px;
`;

const GetDirectionsLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.primary};
`;

const SaveLocationButton = styled(Pressable)`
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.sm}px;
  align-items: center;
  margin-top: ${spacing.sm}px;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};
`;

const SaveLocationLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const MapHint = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
`;

const Divider = styled.View`
  height: 1px;
  background-color: ${(props) => props.theme.border};
  margin-vertical: ${spacing.lg}px;
`;

// Every block below the price now has the same anatomy: one heading, one
// top margin, no rules. Before this, two sections were separated by a
// Divider and three were not, the seller card had no heading at all, and
// SectionTitle used the same h3 as the listing title — so "Emplacement"
// competed with "Toyota RAV4 2013" for the same rank.
const Section = styled.View`
  margin-top: ${spacing.lg}px;
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const Description = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  line-height: 22px;
`;

const SafetyBox = styled.View`
  margin-top: ${spacing.lg}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.md}px;
  background-color: rgba(11, 110, 79, 0.06);
  margin-top: ${spacing.lg}px;
  margin-bottom: ${spacing.lg}px;
`;

const SafetyTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.xs}px;
`;

const SafetyTip = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  line-height: 18px;
  margin-top: 2px;
`;

const SimilarPressable = styled(Pressable)`
  width: 150px;
  margin-right: ${spacing.sm}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  shadow-color: #000000;
  shadow-offset: 0px 3px;
  shadow-opacity: 0.1;
  shadow-radius: 8px;
  elevation: 4;
`;

const SimilarCardInner = styled.View`
  border-radius: ${radius.lg}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
`;

const SimilarImageWrap = styled.View`
  height: 112px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SimilarImage = styled.Image`
  width: 100%;
  height: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SimilarBody = styled.View`
  padding: 9px 11px 11px;
`;

const SimilarPrice = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const SimilarTitle = styled.Text`
  font-size: 12px;
  color: ${(props) => props.theme.text};
  margin-top: 3px;
`;

const SimilarMeta = styled.Text`
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const ReportRow = styled(Pressable)`
  align-items: center;
  margin-top: ${spacing.sm}px;
`;

const ReportLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const Footer = styled.View`
  padding: ${spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const ContactButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
`;

const ContactButtonLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const FooterRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
`;

const FooterFavButton = styled(Pressable)`
  width: 52px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
`;

const SecondaryContactButton = styled(Pressable)`
  width: 52px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SpecGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.sm}px;
`;

const SpecItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SpecText = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const AmenityWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: ${spacing.sm}px;
`;

const AmenityTag = styled.View`
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const AmenityTagLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${(props) => props.theme.primaryDark};
`;

const RestoTopRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  margin-bottom: ${spacing.xs}px;
`;

const RestoCuisine = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const RestoBandChip = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RestoBandLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const RestoOpenLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.open ? props.theme.primaryDark : props.theme.textMuted)};
`;

const RestoDayRow = styled.View`
  flex-direction: row;
  gap: 5px;
  margin-top: ${spacing.sm}px;
`;

const RestoDayChip = styled.View`
  flex: 1;
  align-items: center;
  padding: 7px 0;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => (props.on ? props.theme.primaryLight : props.theme.surfaceAlt)};
`;

const RestoDayLabel = styled.Text`
  font-family: ${(props) => (props.on ? fontFamily.semiBold : fontFamily.regular)};
  font-size: 11px;
  color: ${(props) => (props.on ? props.theme.primaryDark : props.theme.textMuted)};
`;

const WhatsAppButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: ${spacing.sm}px;
  padding: 13px;
  border-radius: ${radius.lg}px;
  background-color: #25d366;
`;

const WhatsAppLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: #ffffff;
`;

const RestoLinkRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.sm}px;
`;

const RestoLinkButton = styled(Pressable)`
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.tint};
`;

const DutyRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const DutyLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => (props.stale ? props.theme.accentDark : props.theme.error)};
`;

const JobCompanyLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const JobSalaryText = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;
