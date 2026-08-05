import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { openAdLink } from '../utils/links';

function VideoBanner({ ad, isActive }) {
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const player = useVideoPlayer(ad.mediaUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (isActive && isFocused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, isFocused, player]);

  return <BannerVideo player={player} contentFit="cover" nativeControls={false} />;
}

export function AdBanner({ ad, isActive, style }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const title = language === 'en' ? ad.titleEn : ad.titleFr;

  return (
    <Card style={style} onPress={() => openAdLink(ad.linkUrl)}>
      {ad.mediaType === 'video' ? (
        <VideoBanner ad={ad} isActive={isActive} />
      ) : (
        <BannerImage source={{ uri: ad.mediaUrl }} resizeMode="cover" />
      )}
      <SponsoredTag>
        <SponsoredLabel>{t('sponsoredLabel')}</SponsoredLabel>
      </SponsoredTag>
      <Overlay>
        <SponsorName>{ad.sponsorName}</SponsorName>
        <Title numberOfLines={2}>{title}</Title>
      </Overlay>
    </Card>
  );
}

const Card = styled(Pressable)`
  width: 280px;
  height: 150px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surfaceAlt};
  ${shadow.card}
`;

const BannerImage = styled.Image`
  width: 100%;
  height: 100%;
`;

const BannerVideo = styled(VideoView)`
  width: 100%;
  height: 100%;
`;

const SponsoredTag = styled.View`
  position: absolute;
  top: ${spacing.xs}px;
  left: ${spacing.xs}px;
  background-color: ${(props) => props.theme.accentLight};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.xs}px;
  padding-vertical: 2px;
`;

const SponsoredLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.accentDark};
`;

const Overlay = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: ${spacing.sm}px;
  background-color: rgba(11, 31, 22, 0.55);
`;

const SponsorName = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
`;

const Title = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textInverse};
  margin-top: 2px;
`;
