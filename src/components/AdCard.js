import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { previewBufferOptions } from '../utils/videoPreview';
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
    p.bufferOptions = previewBufferOptions;
    // Muted decorative preview — it must never claim the iOS audio session.
    // The default ('auto') still activates one in playback mode, and a held
    // playback session is why voice search failed with `audio-capture` /
    // "Session activation failed": the recogniser could not activate a
    // recording session while these were on screen. A silent thumbnail has
    // no audio to protect, so it mixes.
    p.audioMixingMode = 'mixWithOthers';
    // It plays. This was written as a still and read as a broken card:
    // an advertiser who paid for a video got one frame of it.
    p.loop = true;
    p.play();
  });
  return <ThumbnailVideo player={player} contentFit="cover" nativeControls={false} />;
}

// `flush` mirrors ListingCard's. An ad shares the grid with listings, so if
// only one of the two squares off, every row shows a rounded narrow card
// beside a square wide one — the ads would read as broken rather than as
// ads.
export function AdCard({ ad, style, flush = false }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const title = language === 'en' ? ad.titleEn : ad.titleFr;

  return (
    <Card flush={flush} style={style} onPress={() => openAdLink(ad.linkUrl)}>
      <Thumbnail flush={flush}>
        {ad.mediaType === 'video' ? (
          <VideoThumbnail uri={ad.mediaUrl} />
        ) : (
          <ThumbnailImage source={{ uri: ad.mediaUrl }} resizeMode="contain" />
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
  width: ${(props) => (props.flush ? "49.6%" : "47%")};
  background-color: ${(props) => props.theme.surface};
  border-radius: ${(props) => (props.flush ? 0 : radius.xl)}px;
  overflow: hidden;
  margin-bottom: ${(props) => (props.flush ? 2 : spacing.lg)}px;
  border-width: 1px;
  /* The accent border is what marks this as an ad, so it survives the flush
     variant where ListingCard's shadow does not — losing it would make paid
     placement indistinguishable from an ordinary listing. */
  border-color: ${(props) => props.theme.accentLight};
  ${(props) => (props.flush ? "" : shadow.card)}
`;

const Thumbnail = styled.View`
  /* Square in the flush grid, matching ListingCard, so the two never sit
     side by side at different heights. */
  aspect-ratio: ${(props) => (props.flush ? "1 / 1" : "4 / 5")};
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
