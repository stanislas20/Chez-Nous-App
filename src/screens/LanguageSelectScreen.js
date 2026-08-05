import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import styled from 'styled-components/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme/colors';
import { fontFamily, type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';

const GREEN = '#008751';
const YELLOW = '#FCD116';
const RED = '#E8112D';
const INK = '#1C1C1E';
const MUTED = '#6B7280';

const WAVE_BARS = [
  { height: 46, color: GREEN, delay: 0 },
  { height: 62, color: YELLOW, delay: 200 },
  { height: 78, color: RED, delay: 400 },
  { height: 62, color: YELLOW, delay: 600 },
  { height: 46, color: GREEN, delay: 800 },
];

// Slow infinite float, mirroring the design's blobFloat keyframes: drift to a
// peak offset and back, forever. Each blob gets its own independent loop so
// they never fall into visual sync with one another.
function useFloatLoop({ dx, dy, scale, duration }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, duration]);

  return {
    transform: [
      { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) },
    ],
  };
}

function useFadeUp(delay) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);

  return {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };
}

function WaveBar({ height, color, delay }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1300, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  return (
    <AnimatedBar
      style={{
        height,
        backgroundColor: color,
        transform: [{ scaleY: anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
      }}
    />
  );
}

function LanguageCard({ flag, label, selected, onPress, style }) {
  return (
    <AnimatedCardWrap style={style}>
      <CardPressable onPress={onPress}>
        <CardBlur intensity={selected ? 0 : 40} tint="light" selected={selected}>
          <CardInner selected={selected}>
            <FlagEmoji>{flag}</FlagEmoji>
            <CardLabel>{label}</CardLabel>
            {selected ? (
              <CheckBadge>
                <Ionicons name="checkmark" size={13} color="#fff" />
              </CheckBadge>
            ) : null}
          </CardInner>
        </CardBlur>
      </CardPressable>
    </AnimatedCardWrap>
  );
}

export function LanguageSelectScreen() {
  const { t, setLanguage } = useI18n();
  const [selected, setSelected] = useState(null);

  const logoAnim = useRef(new Animated.Value(0)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(logoAnim, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();
  }, [logoAnim]);

  const blob1 = useFloatLoop({ dx: 14, dy: -18, scale: 1.06, duration: 9000 });
  const blob2 = useFloatLoop({ dx: -16, dy: 14, scale: 1.08, duration: 11000 });
  const blob3 = useFloatLoop({ dx: 10, dy: 16, scale: 1.05, duration: 10000 });

  const headingStyle = useFadeUp(80);
  const waveStyle = useFadeUp(120);
  const langStyle = useFadeUp(160);
  const ctaStyle = useFadeUp(220);

  const logoStyle = {
    opacity: logoAnim,
    transform: [{ scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
  };

  const pressIn = () => {
    Animated.spring(ctaScale, { toValue: 0.97, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  };
  const pressOut = () => {
    Animated.spring(ctaScale, { toValue: 1, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  };

  const handleContinue = () => {
    if (selected) setLanguage(selected);
  };
  const handleSkip = () => setLanguage(selected || 'fr');

  return (
    <Scene edges={['top', 'bottom']}>
      <Blob style={[{ top: -60, left: -50, width: 220, height: 220, backgroundColor: GREEN, opacity: 0.22 }, blob1]} />
      <Blob style={[{ top: -30, right: -60, width: 240, height: 240, backgroundColor: YELLOW, opacity: 0.28 }, blob2]} />
      <Blob style={[{ bottom: -80, left: '30%', width: 260, height: 260, backgroundColor: RED, opacity: 0.18 }, blob3]} />

      <Content>
        <AnimatedLogoWrap style={logoStyle}>
          <LogoMark>
            <LogoGreenBand />
            <LogoStripeColumn>
              <LogoStripe color={YELLOW} />
              <LogoStripe color={RED} />
            </LogoStripeColumn>
          </LogoMark>
        </AnimatedLogoWrap>

        <AnimatedHeading style={headingStyle}>
          <Brand>Chez-Nous</Brand>
          <Tagline>{t('onboardingTagline')}</Tagline>
          <Subcopy>{t('onboardingSubcopy')}</Subcopy>
        </AnimatedHeading>

        <AnimatedWaveWrap style={waveStyle}>
          {WAVE_BARS.map((bar, index) => (
            <WaveBar key={index} height={bar.height} color={bar.color} delay={bar.delay} />
          ))}
        </AnimatedWaveWrap>

        <AnimatedLangSection style={langStyle}>
          <LangLabel>
            <Ionicons name="globe-outline" size={15} color={MUTED} />
            <LangLabelText>{t('languagePickerTitle')}</LangLabelText>
          </LangLabel>

          <LanguageCard
            flag="🇫🇷"
            label={t('languageFrench')}
            selected={selected === 'fr'}
            onPress={() => setSelected('fr')}
          />
          <LanguageCard
            flag="🇬🇧"
            label={t('languageEnglish')}
            selected={selected === 'en'}
            onPress={() => setSelected('en')}
          />
        </AnimatedLangSection>

        <AnimatedCtaWrap style={ctaStyle}>
          <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
            <ContinuePressable
              disabled={!selected}
              onPress={handleContinue}
              onPressIn={pressIn}
              onPressOut={pressOut}
            >
              {selected ? (
                <ContinueGradient colors={[GREEN, '#00A85C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <ContinueLabel active>{t('onboardingContinueButton')}</ContinueLabel>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </ContinueGradient>
              ) : (
                <ContinueDisabled>
                  <ContinueLabel>{t('onboardingContinueButton')}</ContinueLabel>
                  <Ionicons name="arrow-forward" size={16} color="#9CA3AF" />
                </ContinueDisabled>
              )}
            </ContinuePressable>
          </Animated.View>

          <SkipLink onPress={handleSkip} hitSlop={8}>
            <SkipLabel>{t('onboardingSkipButton')}</SkipLabel>
          </SkipLink>
        </AnimatedCtaWrap>
      </Content>
    </Scene>
  );
}

const Scene = styled(SafeAreaView)`
  flex: 1;
  background-color: #f7f7f5;
  overflow: hidden;
`;

const Blob = styled(Animated.View)`
  position: absolute;
  border-radius: 999px;
`;

const Content = styled.View`
  flex: 1;
  align-items: center;
  padding: ${spacing.xl}px ${spacing.lg}px ${spacing.lg}px;
`;

const AnimatedLogoWrap = styled(Animated.View)`
  margin-bottom: ${spacing.lg}px;
`;

const LogoMark = styled.View`
  flex-direction: row;
  width: 84px;
  height: 84px;
  border-radius: 42px;
  overflow: hidden;
  border-width: 3px;
  border-color: #fff;
  shadow-color: #000;
  shadow-offset: 0px 10px;
  shadow-opacity: 0.16;
  shadow-radius: 22px;
  elevation: 8;
`;

const LogoGreenBand = styled.View`
  width: 42%;
  background-color: ${GREEN};
`;

const LogoStripeColumn = styled.View`
  flex: 1;
`;

const LogoStripe = styled.View`
  flex: 1;
  background-color: ${(props) => props.color};
`;

const AnimatedHeading = styled(Animated.View)`
  align-items: center;
  margin-bottom: ${spacing.xl}px;
`;

const Brand = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 34px;
  color: ${INK};
  margin-bottom: 6px;
  text-align: center;
`;

const Tagline = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #374151;
  margin-bottom: 6px;
  text-align: center;
`;

const Subcopy = styled.Text`
  ${type.caption}
  color: ${MUTED};
  text-align: center;
  max-width: 260px;
`;

const AnimatedWaveWrap = styled(Animated.View)`
  flex: 1;
  min-height: 44px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 9px;
`;

const AnimatedBar = styled(Animated.View)`
  width: 7px;
  border-radius: 4px;
`;

const AnimatedLangSection = styled(Animated.View)`
  width: 100%;
  max-width: 320px;
`;

const LangLabel = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  margin-bottom: ${spacing.sm}px;
`;

const LangLabelText = styled.Text`
  ${type.captionMedium}
  color: ${MUTED};
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const AnimatedCardWrap = styled(Animated.View)`
  margin-bottom: ${spacing.sm}px;
`;

const CardPressable = styled(Pressable)``;

const CardBlur = styled(BlurView)`
  border-radius: 20px;
  overflow: hidden;
  border-width: ${(props) => (props.selected ? '2px' : '1px')};
  border-color: ${(props) => (props.selected ? GREEN : 'rgba(255,255,255,0.7)')};
`;

const CardInner = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: ${spacing.md}px ${spacing.md + 2}px;
  background-color: ${(props) => (props.selected ? '#FFFFFF' : 'rgba(255,255,255,0.55)')};
`;

const FlagEmoji = styled.Text`
  font-size: 22px;
`;

const CardLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  color: ${INK};
`;

const CheckBadge = styled.View`
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background-color: ${GREEN};
  align-items: center;
  justify-content: center;
`;

const AnimatedCtaWrap = styled(Animated.View)`
  width: 100%;
  max-width: 320px;
  margin-top: ${spacing.md}px;
`;

const ContinuePressable = styled(Pressable)`
  border-radius: 26px;
  overflow: hidden;
`;

const ContinueGradient = styled(LinearGradient)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  padding-vertical: 17px;
  shadow-color: ${GREEN};
  shadow-offset: 0px 10px;
  shadow-opacity: 0.28;
  shadow-radius: 20px;
  elevation: 6;
`;

const ContinueDisabled = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  padding-vertical: 17px;
  background-color: #e5e7eb;
`;

const ContinueLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  color: ${(props) => (props.active ? '#fff' : '#9CA3AF')};
`;

const SkipLink = styled(Pressable)`
  align-items: center;
  margin-top: ${spacing.md}px;
`;

const SkipLabel = styled.Text`
  ${type.caption}
  color: #9ca3af;
`;
