import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, type } from '../theme/typography';
import { SearchBar } from '../components/SearchBar';
import { ListingCard } from '../components/ListingCard';
import { AdCard } from '../components/AdCard';
import { mockListings } from '../data/mockListings';
import { mockAds } from '../data/mockAds';
import { cities } from '../data/cities';
import { businessCategories } from '../data/businessCategories';
import { useApprovedAds } from '../hooks/useApprovedAds';
import { useApprovedListings } from '../hooks/useApprovedListings';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

// Fixed brand accents from the design mockup (not theme-reactive, like the
// onboarding screen's Benin flag colors) — used for small decorative surfaces
// (avatar, badges, notification dot) meant to look the same in both themes.
const EMERALD = '#0B6E4F';
const GOLD = '#D9A441';
const GOLD_BADGE_BG = 'rgba(217,164,65,0.87)';
const BADGE_TEXT = '#7A4E00';
const TERRACOTTA = '#C1512D';

const priceFormatter = new Intl.NumberFormat('fr-FR');

// Content-vertical chips shown on the home feed — distinct from the app's
// listing categoryKey taxonomy (src/data/categories.js). "Marketplace" clears
// the filter (shows everything); the rest map to a real categoryKey where one
// exists, otherwise they simply show an empty state (no fake data invented).
const HOME_CATEGORIES = [
  { key: 'market', icon: 'storefront-outline', categoryKey: null, fixedLabel: 'Marketplace' },
  { key: 'jobs', icon: 'briefcase-outline', categoryKey: 'jobs', labelKey: 'categoryJobs' },
  { key: 'food', icon: 'restaurant-outline', categoryKey: 'restaurants', labelKey: 'categoryRestaurants' },
  { key: 'house', icon: 'home-outline', categoryKey: 'realEstate', labelKey: 'categoryRealEstateShort' },
  { key: 'car', icon: 'car-sport-outline', categoryKey: 'vehicles', labelKey: 'categoryVehiclesShort' },
  { key: 'event', icon: 'calendar-outline', categoryKey: 'events', labelKey: 'categoryEvents' },
  { key: 'service', icon: 'construct-outline', categoryKey: 'services', labelKey: 'categoryServicesShort' },
  { key: 'hotel', icon: 'bed-outline', categoryKey: 'hotels', labelKey: 'categoryHotels' },
];

const listContentStyle = { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md };
const rowStyle = { justifyContent: 'space-between' };
const chipListContentStyle = { paddingRight: spacing.md };
const hScrollContentStyle = { paddingRight: spacing.md, paddingVertical: 8 };
const scrollContentStyle = { paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.md };
const chipsListStyle = { flexGrow: 0, marginTop: 14 };

const AD_INTERVAL = 5;

function withInlineAds(listings, ads) {
  if (ads.length === 0) return listings.map((listing) => ({ type: 'listing', listing }));

  const items = [];
  let adCount = 0;
  listings.forEach((listing, index) => {
    items.push({ type: 'listing', listing });
    if ((index + 1) % AD_INTERVAL === 0) {
      items.push({ type: 'ad', ad: ads[adCount % ads.length], key: `ad-${index}` });
      adCount += 1;
    }
  });
  return items;
}

function formatTimeAgo(createdAt, t) {
  const date = createdAt?.toDate?.() ?? (createdAt?.seconds ? new Date(createdAt.seconds * 1000) : null);
  if (!date) return null;
  const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (hours < 1) return t('timeAgoJustNow');
  if (hours < 24) return t('timeAgoHours', { hours });
  return t('timeAgoDays', { days: Math.floor(hours / 24) });
}

function distanceKm(from, listing) {
  if (!from || listing.latitude == null || listing.longitude == null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(listing.latitude - from.latitude);
  const dLon = toRad(listing.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(listing.latitude)) * Math.sin(dLon / 2) ** 2;
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
  if (entries.length === 0) return 'Cotonou';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function TrendingCard({ listing, navigation, cardWidth }) {
  const { language, t } = useI18n();
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;

  return (
    <TrendingPressable
      style={{ width: cardWidth }}
      onPress={() => navigation.navigate('ProductDetail', { listing: { ...listing, createdAt: null } })}
    >
      <TrendingImage source={{ uri: coverUri }} resizeMode="cover" />
      <TrendingGradient
        colors={['rgba(11,31,22,0.25)', 'rgba(10,28,20,0.55)', 'rgba(7,20,14,0.94)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <TrendingBadge>
        <TrendingBadgeLabel>🔥 {t('popularBadgeLabel')}</TrendingBadgeLabel>
      </TrendingBadge>
      <TrendingContent>
        <TrendingTitle numberOfLines={1}>{title}</TrendingTitle>
        <TrendingMetaRow>
          <TrendingPrice>{priceFormatter.format(listing.price)} FCFA</TrendingPrice>
          <TrendingCity numberOfLines={1}>{listing.city}</TrendingCity>
        </TrendingMetaRow>
      </TrendingContent>
    </TrendingPressable>
  );
}

const REC_CARD_WIDTH = 168;
const REC_IMAGE_HEIGHT = 118;
const BUSINESS_ITEM_WIDTH = 156 + 14;

function RecommendedCard({ listing, navigation, isFavorite, onToggleFavorite, userCoords }) {
  const { language, t } = useI18n();
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;
  const timeAgo = formatTimeAgo(listing.createdAt, t);
  // No "verified seller" concept exists in the data model, so the doc's
  // verified checkmark is intentionally left out rather than faked.
  const sellerInitial = listing.sellerName ? listing.sellerName.trim().charAt(0).toUpperCase() : null;
  const km = distanceKm(userCoords, listing);
  const metaText = km != null ? `${listing.city} · ${km} km` : listing.city;
  const [activePhoto, setActivePhoto] = useState(0);

  // Real photos from CreateListingScreen's upload flow (up to 6 per listing,
  // stored as listing.media) — video thumbnails aren't renderable as a still
  // image, so the swipeable carousel only includes actual photos.
  const photos = (listing.media ?? []).filter((item) => item.mediaType !== 'video');
  const carouselPhotos = photos.length > 0 ? photos : coverUri ? [{ mediaUrl: coverUri }] : [];

  const handleShare = async () => {
    try {
      await Share.share({
        message: t('shareListingMessage', {
          title,
          price: `${priceFormatter.format(listing.price)} FCFA`,
        }),
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  return (
    <RecCard
      onPress={() => navigation.navigate('ProductDetail', { listing: { ...listing, createdAt: null } })}
    >
      <RecCardInner>
      <RecImageWrap>
        {carouselPhotos.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={carouselPhotos.length > 1}
            onMomentumScrollEnd={(e) => {
              setActivePhoto(Math.round(e.nativeEvent.contentOffset.x / REC_CARD_WIDTH));
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
            <RecPromotedLabel>{t('sponsoredLabel')}</RecPromotedLabel>
          </RecPromotedBadge>
        ) : null}
        <RecFavButton onPress={onToggleFavorite} hitSlop={8}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={15}
            color={isFavorite ? TERRACOTTA : '#ffffff'}
          />
        </RecFavButton>
        {carouselPhotos.length > 1 ? (
          <RecDotsWrap>
            {carouselPhotos.map((_, index) => (
              <RecDot key={index} active={index === activePhoto} />
            ))}
          </RecDotsWrap>
        ) : null}
      </RecImageWrap>
      <RecBody>
        <RecPriceRow>
          <RecPrice numberOfLines={1}>{priceFormatter.format(listing.price)} FCFA</RecPrice>
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
  const { language } = useI18n();
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;

  return (
    <NearPressable
      onPress={() => navigation.navigate('ProductDetail', { listing: { ...listing, createdAt: null } })}
    >
      <NearCardInner>
        <NearImageWrap>
          {coverUri ? <NearImage source={{ uri: coverUri }} resizeMode="cover" /> : null}
        </NearImageWrap>
        <NearBody>
          <NearPrice numberOfLines={1}>{priceFormatter.format(listing.price)} FCFA</NearPrice>
          <NearTitle numberOfLines={1}>{title}</NearTitle>
          <NearMeta numberOfLines={1}>{listing.city}</NearMeta>
        </NearBody>
      </NearCardInner>
    </NearPressable>
  );
}

function DealCard({ listing, navigation }) {
  const { language } = useI18n();
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const coverUri = listing.mediaUrl ?? listing.image;

  return (
    <NearPressable
      onPress={() => navigation.navigate('ProductDetail', { listing: { ...listing, createdAt: null } })}
    >
      <NearCardInner>
        <NearImageWrap>
          {coverUri ? <NearImage source={{ uri: coverUri }} resizeMode="cover" /> : null}
        </NearImageWrap>
        <NearBody>
          <DealPriceRow>
            <NearPrice numberOfLines={1}>{priceFormatter.format(listing.price)} FCFA</NearPrice>
            <DealOldPrice numberOfLines={1}>{priceFormatter.format(listing.previousPrice)}</DealOldPrice>
          </DealPriceRow>
          <NearTitle numberOfLines={1}>{title}</NearTitle>
          <NearMeta numberOfLines={1}>{listing.city}</NearMeta>
        </NearBody>
      </NearCardInner>
    </NearPressable>
  );
}

const MARQUEE_SPEED_PX_PER_SEC = 40;

function BusinessMarquee({ ads }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const setWidth = ads.length * BUSINESS_ITEM_WIDTH;

  useEffect(() => {
    translateX.setValue(0);
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: -setWidth,
        duration: (setWidth / MARQUEE_SPEED_PX_PER_SEC) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [ads, setWidth, translateX]);

  if (ads.length === 0) return null;

  // Render the list twice back-to-back so the loop point is invisible — as
  // the first copy slides fully offscreen, the second copy is already lined
  // up to continue, giving a seamless, gapless slide instead of a jump-cut.
  return (
    <MarqueeClip>
      <MarqueeRow style={{ transform: [{ translateX }] }}>
        {ads.concat(ads).map((ad, index) => (
          <BusinessCard key={`${ad.id}-${index}`} ad={ad} />
        ))}
      </MarqueeRow>
    </MarqueeClip>
  );
}

function BusinessCard({ ad }) {
  const { language } = useI18n();
  const name = ad.sponsorName ?? '';
  const initials = name.trim().slice(0, 2).toUpperCase();
  const category = businessCategories.find((c) => c.key === ad.category);
  const categoryLabel = category ? (language === 'en' ? category.labelEn : category.labelFr) : null;

  return (
    <BusinessPressable
      onPress={() => {
        if (ad.linkUrl) Linking.openURL(ad.linkUrl);
      }}
    >
      <BusinessLogo colors={[EMERALD, GOLD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <BusinessLogoLabel>{initials}</BusinessLogoLabel>
      </BusinessLogo>
      <BusinessNameRow>
        <BusinessName numberOfLines={1}>{name}</BusinessName>
        <Ionicons name="checkmark-circle" size={15} color={EMERALD} />
      </BusinessNameRow>
      {categoryLabel ? <BusinessCategory numberOfLines={1}>{categoryLabel}</BusinessCategory> : null}
    </BusinessPressable>
  );
}

export function ForYouScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const { user, sellerProfile, advertiserProfile } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const { coords: userCoords } = useCurrentLocation();
  const [query, setQuery] = useState('');
  const [selectedChipKey, setSelectedChipKey] = useState('market');
  const [favorites, setFavorites] = useState({});
  const [manualNearCity, setManualNearCity] = useState(null);
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  const toggleFavorite = (id) => {
    setFavorites((current) => ({ ...current, [id]: !current[id] }));
  };

  const trendingCardWidth = windowWidth - spacing.md * 2;
  const selectedChip = HOME_CATEGORIES.find((c) => c.key === selectedChipKey);
  const selectedCategoryKey = selectedChip?.categoryKey ?? null;

  const liveListings = useApprovedListings();
  // Pharmacie de Garde has its own dedicated category screen and shouldn't
  // be mixed into the general marketplace feed.
  const listings = (liveListings ?? mockListings).filter(
    (listing) => listing.categoryKey !== 'pharmacyOnDuty',
  );
  // Fall back to real recent listings when nothing is explicitly flagged
  // popular yet, so Trending is never empty — same real data, just a
  // different (honest) ranking signal when there's no popularity data.
  const explicitlyPopular = listings.filter((listing) => listing.popular);
  const trendingListings = explicitlyPopular.length > 0 ? explicitlyPopular : listings.slice(0, 5);
  // A real price drop, not a fabricated discount — set by EditListingScreen
  // whenever a seller lowers the price on an existing listing.
  const dealListings = listings.filter(
    (listing) => listing.previousPrice != null && listing.previousPrice > listing.price,
  );

  const filteredListings = listings.filter((listing) => {
    const title = language === 'en' ? listing.titleEn : listing.titleFr;
    const matchesQuery = title.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = !selectedCategoryKey || listing.categoryKey === selectedCategoryKey;
    return matchesQuery && matchesCategory;
  });

  const liveAds = useApprovedAds();
  const ads = liveAds && liveAds.length > 0 ? liveAds : mockAds;

  const isBrowsing = query.length === 0;
  // The curated, multi-section discovery feed (matching the design) only
  // applies to the default "Marketplace" browse state. Searching or picking a
  // specific category switches to a plain results grid, since a handful of
  // curated horizontal rows isn't a usable way to page through search/filter
  // results — the mockup doesn't depict that state, so this is our own call.
  const isDefaultBrowse = isBrowsing && selectedChipKey === 'market';
  const gridItems = withInlineAds(filteredListings, isBrowsing ? ads : []);

  const name = user?.displayName || sellerProfile?.fullName || advertiserProfile?.businessName;
  const initial = name ? name.trim().charAt(0).toUpperCase() : null;

  const autoNearCity = useMemo(() => mostFrequentCity(listings), [listings]);
  const nearYouCity = manualNearCity ?? autoNearCity;
  const nearYouListings = listings.filter((listing) => listing.city === nearYouCity);
  const filteredCities = cities.filter((city) =>
    city.toLowerCase().includes(citySearch.trim().toLowerCase()),
  );

  return (
    <Container edges={['top', 'left', 'right', 'bottom']}>
      <HeaderCard>
        <HeaderRow>
          <Avatar colors={[EMERALD, GOLD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            {initial ? (
              <AvatarLabel>{initial}</AvatarLabel>
            ) : (
              <Ionicons name="person" size={16} color="#ffffff" />
            )}
          </Avatar>
          <GreetingBlock>
            <GreetingText numberOfLines={1}>
              {name ? t('homeGreeting', { name }) : t('homeGreetingGuest')}
            </GreetingText>
            <SubtitleText numberOfLines={1}>{t('homeSubtitle')}</SubtitleText>
          </GreetingBlock>
          <HeaderActions>
            <IconButton onPress={() => navigation.navigate('Notifications')} hitSlop={8}>
              <Ionicons name="notifications-outline" size={19} color={colors.text} />
            </IconButton>
            <IconButton onPress={() => navigation.navigate('More')} hitSlop={8}>
              <Ionicons name="menu-outline" size={19} color={colors.text} />
            </IconButton>
            <LangPill onPress={() => setLanguage(language === 'en' ? 'fr' : 'en')}>
              <LangPillLabel>{language === 'en' ? 'FR' : 'EN'}</LangPillLabel>
            </LangPill>
          </HeaderActions>
        </HeaderRow>

        <SearchBar value={query} onChangeText={setQuery} />

        <FlatList
          data={HOME_CATEGORIES}
          keyExtractor={(item) => item.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={chipListContentStyle}
          style={chipsListStyle}
          renderItem={({ item }) => {
            const isSelected = selectedChipKey === item.key;
            const label = item.fixedLabel ?? t(item.labelKey);
            return (
              <CategoryChip selected={isSelected} onPress={() => setSelectedChipKey(item.key)}>
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={isSelected ? colors.textInverse : colors.text}
                />
                <ChipLabel selected={isSelected}>{label}</ChipLabel>
              </CategoryChip>
            );
          }}
        />
      </HeaderCard>

      {isDefaultBrowse ? (
        <ScrollView contentContainerStyle={scrollContentStyle}>
          {trendingListings.length > 0 ? (
            <Section>
              <SectionTitle>🔥 {t('trendingSectionTitle')}</SectionTitle>
              <FlatList
                data={trendingListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={trendingCardWidth + spacing.sm}
                decelerationRate="fast"
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => (
                  <TrendingCard listing={item} navigation={navigation} cardWidth={trendingCardWidth} />
                )}
              />
            </Section>
          ) : null}

          {ads.length > 0 ? (
            <Section>
              <SectionTitle>🏆 {t('verifiedBusinessesSectionTitle')}</SectionTitle>
              <BusinessMarquee ads={ads} />
            </Section>
          ) : null}

          {filteredListings.length > 0 ? (
            <Section>
              <SectionTitle>⭐ {t('recommendedSectionTitle')}</SectionTitle>
              <FlatList
                data={filteredListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => (
                  <RecommendedCard
                    listing={item}
                    navigation={navigation}
                    isFavorite={!!favorites[item.id]}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                    userCoords={userCoords}
                  />
                )}
              />
            </Section>
          ) : null}

          <Section>
            <NearSectionHeader onPress={() => setCityPickerVisible(true)}>
              <SectionTitle>📍 {t('nearYouSectionTitle', { city: nearYouCity })}</SectionTitle>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </NearSectionHeader>
            {nearYouListings.length > 0 ? (
              <FlatList
                data={nearYouListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => <NearCard listing={item} navigation={navigation} />}
              />
            ) : (
              <EmptyCityText>{t('nearYouEmpty', { city: nearYouCity })}</EmptyCityText>
            )}
          </Section>

          {dealListings.length > 0 ? (
            <Section>
              <SectionTitle>🎯 {t('dealsSectionTitle')}</SectionTitle>
              <FlatList
                data={dealListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={hScrollContentStyle}
                renderItem={({ item }) => <DealCard listing={item} navigation={navigation} />}
              />
            </Section>
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          data={gridItems}
          keyExtractor={(item) => (item.type === 'ad' ? item.key : item.listing.id)}
          numColumns={2}
          columnWrapperStyle={rowStyle}
          contentContainerStyle={listContentStyle}
          renderItem={({ item }) =>
            item.type === 'ad' ? <AdCard ad={item.ad} /> : <ListingCard listing={item.listing} />
          }
        />
      )}

      <Modal
        visible={cityPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCityPickerVisible(false)}
      >
        <ModalBackdrop onPress={() => setCityPickerVisible(false)}>
          <ModalSheet onStartShouldSetResponder={() => true}>
            <ModalHeaderRow>
              <ModalTitle>{t('chooseCityTitle')}</ModalTitle>
              <Pressable onPress={() => setCityPickerVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </ModalHeaderRow>
            <SearchBar value={citySearch} onChangeText={setCitySearch} placeholder={t('searchCityPlaceholder')} />
            {manualNearCity ? (
              <ResetCityRow
                onPress={() => {
                  setManualNearCity(null);
                  setCityPickerVisible(false);
                }}
              >
                <Ionicons name="locate-outline" size={16} color={colors.primary} />
                <ResetCityLabel>{t('useMyLocationCity')}</ResetCityLabel>
              </ResetCityRow>
            ) : null}
            <FlatList
              data={filteredCities}
              keyExtractor={(city) => city}
              renderItem={({ item: city }) => (
                <CityRow
                  onPress={() => {
                    setManualNearCity(city);
                    setCityPickerVisible(false);
                    setCitySearch('');
                  }}
                >
                  <CityRowLabel selected={city === nearYouCity}>{city}</CityRowLabel>
                  {city === nearYouCity ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
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

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const HeaderCard = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  padding-top: ${spacing.lg}px;
  padding-bottom: 14px;
  ${shadow.card}
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: 20px;
  gap: ${spacing.sm}px;
  margin-bottom: 16px;
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
  color: ${(props) => props.theme.text};
`;

const SubtitleText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const HeaderActions = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const IconButton = styled(Pressable)`
  width: 38px;
  height: 38px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const LangPill = styled(Pressable)`
  background-color: rgba(11, 110, 79, 0.1);
  padding-horizontal: 11px;
  padding-vertical: 7px;
  border-radius: ${radius.pill}px;
`;

const LangPillLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${EMERALD};
`;

const CategoryChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-left: ${spacing.md}px;
  padding-horizontal: 14px;
  padding-vertical: 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.selected ? props.theme.primary : props.theme.primaryLight)};
`;

const ChipLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.text)};
`;

const Section = styled.View`
  margin-bottom: 34px;
`;

const SectionTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-bottom: 12px;
`;

const TrendingPressable = styled(Pressable)`
  height: 180px;
  border-radius: 24px;
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

const RecCard = styled(Pressable)`
  width: 168px;
  margin-right: 14px;
  ${shadow.card}
`;

const RecCardInner = styled.View`
  border-radius: 22px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
`;

const RecImageWrap = styled.View`
  height: 118px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RecImage = styled.Image``;

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
  background-color: ${(props) => (props.active ? '#ffffff' : 'rgba(255,255,255,0.5)')};
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

const RecFavButton = styled(Pressable)`
  position: absolute;
  top: 8px;
  right: 8px;
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

const NearPressable = styled(Pressable)`
  width: 148px;
  margin-right: 14px;
  ${shadow.card}
`;

const NearCardInner = styled.View`
  border-radius: 20px;
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

const MarqueeClip = styled.View`
  overflow: hidden;
`;

const MarqueeRow = styled(Animated.View)`
  flex-direction: row;
`;

const BusinessPressable = styled(Pressable)`
  width: 156px;
  padding: 18px;
  border-radius: 22px;
  margin-right: 14px;
  background-color: ${(props) => props.theme.surface};
  ${shadow.card}
`;

const BusinessLogo = styled(LinearGradient)`
  width: 56px;
  height: 56px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.sm}px;
`;

const BusinessLogoLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: #ffffff;
`;

const BusinessNameRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const BusinessName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  flex-shrink: 1;
`;

const BusinessCategory = styled.Text`
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 4px;
`;

const NearSectionHeader = styled(Pressable)`
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

const ResetCityRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-vertical: ${spacing.sm}px;
`;

const ResetCityLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.primary};
`;

const CityRow = styled(Pressable)`
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
