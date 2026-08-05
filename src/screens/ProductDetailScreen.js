import { useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, Share, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import MapView, { Marker } from 'react-native-maps';
import { doc, updateDoc } from 'firebase/firestore';
import styled from 'styled-components/native';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { firestore } from '../config/firebase';
import { cityCoordinates } from '../data/cityCoordinates';
import { categories } from '../data/categories';
import { openChat } from '../utils/openChat';
import { CategoryPlaceholder } from '../components/CategoryPlaceholder';
import { PhoneCallButtons } from '../components/PhoneCallButtons';
import { getDutyLabel } from '../utils/pharmacyDuty';

const priceFormatter = new Intl.NumberFormat('fr-FR');
const dutyTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Porto-Novo',
});
const DEFAULT_COORDS = { latitude: 6.3703, longitude: 2.3912 };
const categoryByKey = categories.reduce((map, category) => {
  map[category.key] = category;
  return map;
}, {});
const saleStatusLabelKeys = {
  pending: 'saleStatusPending',
  negotiating: 'saleStatusNegotiating',
  sold: 'saleStatusSold',
};
const saleStatusTint = (theme) => ({
  pending: theme.accentLight,
  negotiating: 'rgba(91, 192, 235, 0.18)',
  sold: theme.errorLight,
});
const saleStatusTextColor = (theme) => ({
  pending: theme.accentDark,
  negotiating: theme.skyBlue,
  sold: theme.error,
});

function HeroVideo({ uri }) {
  const { colors } = useTheme();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <HeroVideoView player={player} contentFit="cover" nativeControls={false} />;
}

function HeroGallery({ media, width }) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <>
      <FlatList
        data={media}
        keyExtractor={(item, index) => `${item.mediaUrl}-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) =>
          item.mediaType === 'video' ? (
            <GallerySlide style={{ width }}>
              <HeroVideo uri={item.mediaUrl} />
            </GallerySlide>
          ) : (
            <GallerySlide style={{ width }}>
              <HeroImage source={{ uri: item.mediaUrl }} resizeMode="contain" />
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

export function ProductDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { listing } = route.params;
  const { language, t } = useI18n();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const description = language === 'en' ? listing.descriptionEn : listing.descriptionFr;
  const coverUri = listing.mediaUrl ?? listing.image;
  const hasGallery = Array.isArray(listing.media) && listing.media.length > 1;

  const isOwner = !!user && user.uid === listing.sellerId;
  const canEditLocation = isOwner && listing.status === 'pending';
  const isPharmacy = listing.categoryKey === 'pharmacyOnDuty';
  const duty = isPharmacy ? getDutyLabel(listing, language, t, dutyTimeFormatter) : null;
  const category = categoryByKey[listing.categoryKey];
  const categoryLabel = category ? (language === 'en' ? category.labelEn : category.labelFr) : null;
  const initialCoords = {
    latitude: listing.latitude ?? cityCoordinates[listing.city]?.latitude ?? DEFAULT_COORDS.latitude,
    longitude: listing.longitude ?? cityCoordinates[listing.city]?.longitude ?? DEFAULT_COORDS.longitude,
  };
  const [pinCoords, setPinCoords] = useState(initialCoords);
  const [isLocationDirty, setIsLocationDirty] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  const handleShare = async () => {
    try {
      await Share.share({
        message: isPharmacy
          ? t('shareDutyPharmacyMessage', { title, phone: listing.phone ?? '' })
          : t('shareListingMessage', {
              title,
              price: `${priceFormatter.format(listing.price)} FCFA`,
            }),
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const handleGetDirections = () => {
    const { latitude, longitude } = pinCoords;
    // No origin specified — the native maps app defaults to the user's
    // current location as the starting point.
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => (
        <ShareHeaderButton onPress={handleShare} hitSlop={8}>
          <Ionicons name="share-social-outline" size={22} color={colors.primary} />
        </ShareHeaderButton>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, title]);

  const handleContactSeller = () => {
    openChat({ listing, listingTitle: title, user, navigation, t });
  };

  const handleSaveLocation = async () => {
    setIsSavingLocation(true);
    try {
      await updateDoc(doc(firestore, 'listings', listing.id), {
        latitude: pinCoords.latitude,
        longitude: pinCoords.longitude,
      });
      setIsLocationDirty(false);
      Alert.alert(t('productDetailDescriptionTitle'), t('mapLocationSavedMessage'));
    } catch (error) {
      Alert.alert(t('productDetailDescriptionTitle'), t('errorLocationSaveFailed'));
    } finally {
      setIsSavingLocation(false);
    }
  };

  return (
    <Container edges={['left', 'right', 'bottom']}>
      <Content>
        <Hero>
          {!coverUri ? (
            <CategoryPlaceholder icon={category?.icon ?? 'pricetag-outline'} size="hero" />
          ) : hasGallery ? (
            <HeroGallery media={listing.media} width={windowWidth} />
          ) : listing.mediaType === 'video' ? (
            <HeroVideo uri={coverUri} />
          ) : (
            <HeroImage source={{ uri: coverUri }} resizeMode="contain" />
          )}
          {listing.popular ? (
            <PopularBadge>
              <PopularBadgeLabel>🔥 {t('productDetailPopularBadge')}</PopularBadgeLabel>
            </PopularBadge>
          ) : null}
        </Hero>

        <Body>
          {isPharmacy ? (
            <PriceCard>
              <DutyRow>
                <Ionicons name="time-outline" size={16} color={duty.isStale ? colors.accentDark : colors.error} />
                <DutyLabel stale={duty.isStale}>{duty.text}</DutyLabel>
              </DutyRow>
              {listing.phone ? <PhoneCallButtons phone={listing.phone} style={{ marginTop: spacing.xs }} /> : null}
            </PriceCard>
          ) : (
            <PriceCard>
              <PriceRow>
                <PriceAmount>{priceFormatter.format(listing.price)}</PriceAmount>
                <PriceCurrency>
                  {' '}
                  <FlagLetter color="#FCD116">F</FlagLetter>
                  <FlagLetter color={colors.primary}>C</FlagLetter>
                  <FlagLetter color="#FCD116">F</FlagLetter>
                  <FlagLetter color={colors.error}>A</FlagLetter>
                </PriceCurrency>
              </PriceRow>
              {listing.saleStatus && listing.saleStatus !== 'available' ? (
                <SaleStatusPill saleStatus={listing.saleStatus}>
                  <SaleStatusPillLabel saleStatus={listing.saleStatus}>
                    {t(saleStatusLabelKeys[listing.saleStatus])}
                  </SaleStatusPillLabel>
                </SaleStatusPill>
              ) : null}
            </PriceCard>
          )}
          <Title>{title}</Title>

          <MetaRow>
            {category ? (
              <MetaItem>
                <Ionicons name={category.icon} size={15} color={colors.textMuted} />
                <MetaLabel>{categoryLabel}</MetaLabel>
              </MetaItem>
            ) : null}
            <MetaItem>
              <Ionicons name="location-outline" size={15} color={colors.textMuted} />
              <MetaLabel>{listing.city}</MetaLabel>
            </MetaItem>
          </MetaRow>

          {listing.sellerName ? (
            <SellerRow>
              <SellerAvatar>
                <Ionicons name="person-outline" size={18} color={colors.primary} />
              </SellerAvatar>
              <SellerName numberOfLines={1}>{listing.sellerName}</SellerName>
            </SellerRow>
          ) : null}

          <Divider />

          <SectionTitle>{t('productDetailLocationTitle')}</SectionTitle>
          <MapContainer>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{ ...initialCoords, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
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
          </MapContainer>

          <GetDirectionsButton onPress={handleGetDirections}>
            <Ionicons name="navigate-outline" size={18} color={colors.primary} />
            <GetDirectionsLabel>{t('getDirectionsButton')}</GetDirectionsLabel>
          </GetDirectionsButton>

          {canEditLocation && isLocationDirty ? (
            <SaveLocationButton onPress={handleSaveLocation} disabled={isSavingLocation}>
              <SaveLocationLabel>
                {isSavingLocation ? t('adUploadingLabel') : t('mapSaveLocationButton')}
              </SaveLocationLabel>
            </SaveLocationButton>
          ) : null}
          {canEditLocation ? <MapHint>{t('mapAdjustLocationHint')}</MapHint> : null}

          <Divider />

          <SectionTitle>{t('productDetailDescriptionTitle')}</SectionTitle>
          <Description>{description}</Description>
        </Body>
      </Content>

      {isOwner ? null : (
        <Footer>
          {isPharmacy && listing.phone ? (
            <FooterRow>
              <PhoneCallButtons phone={listing.phone} size="lg" style={{ flex: 1 }} />
              <SecondaryContactButton onPress={handleContactSeller}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
              </SecondaryContactButton>
            </FooterRow>
          ) : (
            <ContactButton onPress={handleContactSeller}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textInverse} />
              <ContactButtonLabel>{t('productDetailContactButton')}</ContactButtonLabel>
            </ContactButton>
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
  height: 480px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const HeroImage = styled.Image`
  width: 100%;
  height: 100%;
`;

const HeroVideoView = styled(VideoView)`
  width: 100%;
  height: 100%;
`;

const GallerySlide = styled.View`
  height: 480px;
`;

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
  width: ${(props) => (props.active ? '18px' : '6px')};
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => (props.active ? props.theme.surface : 'rgba(255,255,255,0.6)')};
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
  align-self: center;
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
  align-items: baseline;
`;

const PriceAmount = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 19px;
  line-height: 24px;
  color: ${(props) => props.theme.text};
`;

const PriceCurrency = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 19px;
  line-height: 24px;
  color: ${(props) => props.theme.textMuted};
`;

const FlagLetter = styled.Text`
  color: ${(props) => props.color};
`;

const Title = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.md}px;
`;

const SaleStatusPill = styled.View`
  align-self: flex-start;
  background-color: ${(props) => saleStatusTint(props.theme)[props.saleStatus]};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 4px;
  margin-top: ${spacing.xs}px;
`;

const SaleStatusPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => saleStatusTextColor(props.theme)[props.saleStatus]};
`;

const MetaRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
`;

const MetaItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const MetaLabel = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
`;

const SellerRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
  padding: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.md}px;
`;

const SellerAvatar = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  background-color: ${(props) => props.theme.primaryLight};
  align-items: center;
  justify-content: center;
`;

const SellerName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const ShareHeaderButton = styled(Pressable)`
  margin-right: ${spacing.md}px;
`;

const MapContainer = styled.View`
  height: 200px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  margin-top: ${spacing.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const GetDirectionsButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  border-radius: ${radius.md}px;
  border-width: 1px;
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

const SectionTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const Description = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  line-height: 22px;
`;

const Footer = styled.View`
  padding: ${spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const ContactButton = styled(Pressable)`
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

const SecondaryContactButton = styled(Pressable)`
  width: 52px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
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

