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
import { openChat } from '../utils/openChat';
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
  });
  return <ThumbnailVideo player={player} contentFit="cover" nativeControls={false} />;
}

export function ListingCard({ listing, style }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const navigation = useNavigation();
  const { user } = useAuth();
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const categoryIcon = categoryIconByKey[listing.categoryKey] ?? 'pricetag-outline';
  const coverUri = listing.mediaUrl ?? listing.image;
  const isOwner = !!user && user.uid === listing.sellerId;
  const isPharmacy = listing.categoryKey === 'pharmacyOnDuty';
  const duty = isPharmacy ? getDutyLabel(listing, language, t) : null;
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.97, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  };

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

  const handleChat = () => {
    openChat({ listing, listingTitle: title, user, navigation, t });
  };

  return (
    <Card
      style={[style, { transform: [{ scale }] }]}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => navigation.navigate('ProductDetail', { listing: { ...listing, createdAt: null } })}
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
          {listing.popular ? (
            <PopularBadge>
              <Ionicons name="flame" size={13} color={colors.accentDark} />
            </PopularBadge>
          ) : null}
          {listing.isPromoted ? (
            <PromotedBadge>
              <Ionicons name="megaphone" size={13} color={colors.textInverse} />
            </PromotedBadge>
          ) : null}
          <CategoryBadge>
            <Ionicons name={categoryIcon} size={13} color={colors.textInverse} />
          </CategoryBadge>
          {listing.saleStatus && listing.saleStatus !== 'available' ? (
            <SaleStatusBadge saleStatus={listing.saleStatus}>
              <SaleStatusBadgeLabel>{t(saleStatusLabelKeys[listing.saleStatus])}</SaleStatusBadgeLabel>
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
            ) : (
              <PriceGroup>
                <PriceAmount>{priceFormatter.format(listing.price)}</PriceAmount>
                <PriceCurrency>
                  {' '}
                  <FlagLetter color="#FCD116">F</FlagLetter>
                  <FlagLetter color={colors.primary}>C</FlagLetter>
                  <FlagLetter color="#FCD116">F</FlagLetter>
                  <FlagLetter color={colors.error}>A</FlagLetter>
                </PriceCurrency>
              </PriceGroup>
            )}
            <IconButtonRow>
              {isOwner ? null : (
                <ShareIconButton onPress={handleChat} hitSlop={8}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textMuted} />
                </ShareIconButton>
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
  aspect-ratio: 4 / 5;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ThumbnailImage = styled.Image`
  width: 100%;
  height: 100%;
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
  right: ${spacing.sm}px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background-color: ${(props) => props.theme.accent};
  align-items: center;
  justify-content: center;
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
  padding: ${spacing.md}px;
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

const PriceAmount = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 17px;
  line-height: 22px;
  color: ${(props) => props.theme.text};
`;

const PriceCurrency = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 17px;
  line-height: 22px;
  color: ${(props) => props.theme.textMuted};
`;

const FlagLetter = styled.Text`
  color: ${(props) => props.color};
`;

const Title = styled.Text`
  ${type.bodyMedium}
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
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;
