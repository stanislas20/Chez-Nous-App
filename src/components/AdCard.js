import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { openAdLink } from '../utils/links';

function VideoThumbnail({ uri }) {
  const { colors } = useTheme();
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
  });
  return <ThumbnailVideo player={player} contentFit="cover" nativeControls={false} />;
}

export function AdCard({ ad, style }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const title = language === 'en' ? ad.titleEn : ad.titleFr;

  return (
    <Card style={style} onPress={() => openAdLink(ad.linkUrl)}>
      <Thumbnail>
        {ad.mediaType === 'video' ? (
          <VideoThumbnail uri={ad.mediaUrl} />
        ) : (
          <ThumbnailImage source={{ uri: ad.mediaUrl }} resizeMode="cover" />
        )}
        {ad.mediaType === 'video' ? (
          <PlayBadge>
            <Ionicons name="play" size={14} color={colors.textInverse} />
          </PlayBadge>
        ) : null}
        <Badge>
          <BadgeLabel>{t('sponsoredLabel')}</BadgeLabel>
        </Badge>
      </Thumbnail>
      <Details>
        <SponsorName>{ad.sponsorName}</SponsorName>
        <Title numberOfLines={2}>{title}</Title>
      </Details>
    </Card>
  );
}

const Card = styled(Pressable)`
  width: 47%;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.xl}px;
  overflow: hidden;
  margin-bottom: ${spacing.lg}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.accentLight};
  ${shadow.card}
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

const Badge = styled.View`
  position: absolute;
  top: ${spacing.xs}px;
  left: ${spacing.xs}px;
  background-color: ${(props) => props.theme.accentLight};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.xs}px;
  padding-vertical: 2px;
`;

const BadgeLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.accentDark};
  font-size: 11px;
`;

const Details = styled.View`
  padding: ${spacing.md}px;
`;

const SponsorName = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.accentDark};
`;

const Title = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
  margin-top: 2px;
`;
