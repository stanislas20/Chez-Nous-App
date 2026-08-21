import { useRef } from 'react';
import { Animated, Pressable, Share } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import styled from 'styled-components/native';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { categories } from '../data/categories';
import { realEstatePriceSuffixKey } from '../data/realEstate';
import { openChat } from '../utils/openChat';
import { openListing } from '../utils/openListing';
import { getDutyLabel } from '../utils/pharmacyDuty';
import { CategoryPlaceholder } from './CategoryPlaceholder';

const priceFormatter = new Intl.NumberFormat('fr-FR');
const categoryIconByKey = categories.reduce((map, category) => {
  map[category.key] = category.icon;
  return map;
}, {});
const saleStatusLabelKeys = {
  pending: 'saleStatusPending',
  negotiating: 'saleStatusNegotiating',
  sold: 'saleStatusSold',
};
const saleStatusTint = (theme) => ({
  pending: theme.accent,
  negotiating: theme.skyBlue,
  sold: theme.error,
});

function VideoThumbnail({ uri }) {
  const { colors } = useTheme();
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    // Muted decorative preview — it must never claim the iOS audio session.
    // The default ('auto') still activates one in playback mode, and a held
    // playback session is why voice search failed with `audio-capture` /
    // "Session activation failed": the recogniser could not activate a
    // recording session while these were on screen. A silent thumbnail has
    // no audio to protect, so it mixes.
    p.audioMixingMode = 'mixWithOthers';
  });
  return <ThumbnailVideo player={player} contentFit="cover" nativeControls={false} />;
}

export function ListingCard({ listing, style, isFavorite, onToggleFavorite }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const navigation = useNavigation();
  const { user } = useAuth();
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const categoryIcon = categoryIconByKey[listing.categoryKey] ?? 'pricetag-outline';
  const coverUri = listing.mediaUrl ?? listing.image;
  const isOwner = !!user && user.uid === listing.sellerId;
  const isPharmacy = listing.categoryKey === 'pharmacyOnDuty';
  const isJobs = listing.categoryKey === 'jobs';
  const duty = isPharmacy ? getDutyLabel(listing, language, t) : null;
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: isPharmacy
          ? t('shareDutyPharmacyMessage', { title, phone: listing.phone ?? '' })
          : isJobs
            ? t('shareJobMessage', { title, company: listing.company ?? '' })
            : t('shareListingMessage', {
                title,
                price: `${priceFormatter.format(listing.price)} ${
                  listing.categoryKey === 'realEstate' && listing.realEstateDeal
                    ? t(realEstatePriceSuffixKey(listing.realEstateDeal))
                    : 'FCFA'
                }`,
              }),
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const handleChat = () => {
    openChat({ listing, listingTitle: title, user, navigation, t });
  };

  return (
    <Card
      style={[style, { transform: [{ scale }] }]}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => openListing(navigation, listing, t, language)}
    >
      <CardInner>
        <Thumbnail>
          {!coverUri ? (
            <CategoryPlaceholder icon={categoryIcon} size="card" />
          ) : listing.mediaType === 'video' ? (
            <VideoThumbnail uri={coverUri} />
          ) : (
            <ThumbnailImage source={{ uri: coverUri }} resizeMode="cover" />
          )}
          {listing.mediaType === 'video' ? (
            <PlayBadge>
              <Ionicons name="play" size={14} color={colors.textInverse} />
            </PlayBadge>
          ) : null}
          {listing.isPromoted ? (
            <PromotedBadge>
              <PromotedBadgeLabel>{t('sponsoredLabel')}</PromotedBadgeLabel>
            </PromotedBadge>
          ) : listing.popular ? (
            <PopularBadge>
              <Ionicons name="flame" size={13} color={colors.accentDark} />
            </PopularBadge>
          ) : null}
          {onToggleFavorite ? (
            <FavButton onPress={onToggleFavorite} hitSlop={10}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={15}
                color={isFavorite ? colors.error : colors.textInverse}
              />
            </FavButton>
          ) : null}
          <CategoryBadge>
            <Ionicons name={categoryIcon} size={13} color={colors.textInverse} />
          </CategoryBadge>
          {listing.saleStatus && listing.saleStatus !== 'available' ? (
            <SaleStatusBadge saleStatus={listing.saleStatus}>
              <SaleStatusBadgeLabel>
                {t(saleStatusLabelKeys[listing.saleStatus])}
              </SaleStatusBadgeLabel>
            </SaleStatusBadge>
          ) : null}
        </Thumbnail>
        <Details>
          <PriceRow>
            {isPharmacy ? (
              <DutyBadge>
                <Ionicons
                  name="time-outline"
                  size={13}
                  color={duty.isStale ? colors.accentDark : colors.error}
                />
                <DutyBadgeLabel stale={duty.isStale} numberOfLines={2}>
                  {duty.text}
                </DutyBadgeLabel>
              </DutyBadge>
            ) : isJobs ? (
              <DutyBadge>
                <Ionicons name="business-outline" size={13} color={colors.textMuted} />
                <CompanyLabel numberOfLines={1}>{listing.company}</CompanyLabel>
              </DutyBadge>
            ) : (
              <PriceGroup>
                <PriceAmount>{priceFormatter.format(listing.price)}</PriceAmount>
                {/* A rental in the grid read as an outright price. The
                    suffix is what separates 150 000 a month from 150 000
                    for the house. */}
                <PriceCurrency>
                  {listing.categoryKey === 'realEstate' && listing.realEstateDeal
                    ? ` ${t(realEstatePriceSuffixKey(listing.realEstateDeal))}`
                    : ' FCFA'}
                </PriceCurrency>
              </PriceGroup>
            )}
            <IconButtonRow>
              {isOwner ? null : (
                <ChatIconButton onPress={handleChat} hitSlop={8}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={colors.textInverse} />
                </ChatIconButton>
              )}
              <ShareIconButton onPress={handleShare} hitSlop={8}>
                <Ionicons name="share-social-outline" size={16} color={colors.textMuted} />
              </ShareIconButton>
            </IconButtonRow>
          </PriceRow>
          <Title numberOfLines={2}>{title}</Title>
          <CityRow>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <City>{listing.city}</City>
          </CityRow>
        </Details>
      </CardInner>
    </Card>
  );
}

const Card = styled(Animated.createAnimatedComponent(Pressable))`
  width: 47%;
  border-radius: ${radius.xl}px;
  margin-bottom: ${spacing.lg}px;
  background-color: ${(props) => props.theme.surface};
  shadow-color: #000000;
  shadow-offset: 0px 3px;
  shadow-opacity: 0.16;
  shadow-radius: 8px;
  elevation: 5;
`;

const CardInner = styled.View`
  border-radius: ${radius.xl}px;
  overflow: hidden;
`;

const Thumbnail = styled.View`
  aspect-ratio: 4 / 3;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ThumbnailImage = styled.Image`
  width: 100%;
  height: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ThumbnailVideo = styled(VideoView)`
  width: 100%;
  height: 100%;
`;

const PlayBadge = styled.View`
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: -14px;
  margin-left: -14px;
  width: 28px;
  height: 28px;
  border-radius: 14px;
  background-color: rgba(0, 0, 0, 0.45);
  align-items: center;
  justify-content: center;
`;

const PopularBadge = styled.View`
  position: absolute;
  top: ${spacing.sm}px;
  left: ${spacing.sm}px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background-color: ${(props) => props.theme.accentLight};
  align-items: center;
  justify-content: center;
`;

const PromotedBadge = styled.View`
  position: absolute;
  top: ${spacing.sm}px;
  left: ${spacing.sm}px;
  background-color: ${(props) => props.theme.accent};
  border-radius: ${radius.pill}px;
  padding-horizontal: 7px;
  padding-vertical: 3px;
`;

const PromotedBadgeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 9.5px;
  color: ${(props) => props.theme.accentDark};
`;

const FavButton = styled(Pressable)`
  position: absolute;
  top: ${spacing.sm}px;
  right: ${spacing.sm}px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.28);
  z-index: 10;
  elevation: 10;
`;

const CategoryBadge = styled.View`
  position: absolute;
  bottom: ${spacing.sm}px;
  right: ${spacing.sm}px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background-color: ${(props) => props.theme.scrim};
  align-items: center;
  justify-content: center;
`;

const SaleStatusBadge = styled.View`
  position: absolute;
  bottom: ${spacing.sm}px;
  left: ${spacing.sm}px;
  background-color: ${(props) => saleStatusTint(props.theme)[props.saleStatus]};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 3px;
`;

const SaleStatusBadgeLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
  font-size: 11px;
`;

const Details = styled.View`
  padding: 10px 12px 12px;
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const IconButtonRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const ShareIconButton = styled(Pressable)`
  padding: 2px;
`;

// Filled, colored — unlike the plain share icon, this is the primary way to
// reach the seller from the grid, so it needs to read as a real button, not
// just another muted glyph a buyer would skim past.
const ChatIconButton = styled(Pressable)`
  width: 24px;
  height: 24px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primary};
`;

const PriceGroup = styled.View`
  flex-direction: row;
  align-items: baseline;
`;

const DutyBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 1;
`;

const DutyBadgeLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.stale ? props.theme.accentDark : props.theme.error)};
`;

const CompanyLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
`;

const PriceAmount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  line-height: 18px;
  color: ${(props) => props.theme.text};
`;

const PriceCurrency = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const Title = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
  margin-top: 4px;
`;

const CityRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 2px;
  margin-top: ${spacing.xs}px;
`;

const City = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10.5px;
  line-height: 14px;
  color: ${(props) => props.theme.textMuted};
`;
