import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Modal, Platform, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useCountries } from '../hooks/useCountries';
import { useAuth } from '../auth/AuthContext';
import { mapAuthErrorToKey } from '../auth/phoneAuth';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { closeAccountGate } from '../utils/openAccountGate';
import { selectionTick } from '../utils/haptics';

// Cross-links between sign-up and log-in navigate rather than replace.
// `replace` drops the screen you came from, so the back arrow afterwards
// skipped it and landed a step further back than the person expected.
// `navigate` also reuses an instance already in the stack instead of
// stacking a second copy, so bouncing between the two cannot pile up.
const EMERALD = '#0B6E4F';
const FLAG_GREEN = '#008751';
const FLAG_YELLOW = '#FCD116';
const FLAG_RED = '#E8112D';

// Same flag banner the account-type and company sign-up screens open with,
// so signing in reads as part of that flow rather than a stray form.
function BeninFlag() {
  return (
    <FlagWrap>
      <FlagGreenBand />
      <FlagRightCol>
        <FlagYellowBand />
        <FlagRedBand />
      </FlagRightCol>
    </FlagWrap>
  );
}

export function LoginScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { logIn } = useAuth();
  const countries = useCountries();

  const [phone, setPhone] = useState('');
  const [countryIdx, setCountryIdx] = useState(0);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();
  // The floor matters on iOS, where this screen was reading a top inset of
  // roughly nothing: 56 clears the notch/Dynamic Island on every current
  // iPhone, and is ignored on any device that reports a real inset.
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 56 : 8);
  const signUpRoute = route?.params?.signUpRoute ?? 'SellSignUp';
  const loginRoute = route?.params?.loginRoute ?? 'SellLogin';
  const originKey = route?.params?.originKey ?? null;
  const forgotRoute = route?.params?.forgotRoute ?? 'ForgotPassword';

  // Both screens rely on AuthContext flipping `user` and SellStack swapping
  // its routes — which never happens to the root-stack copies, so they
  // would sit on a filled-in form after a successful login. Navigating by
  // the origin route's key pops straight back to whatever needed the
  // account, however deep the auth flow went.
  const { user: authedUser } = useAuth();
  useEffect(() => {
    if (authedUser && originKey) navigation.navigate({ key: originKey });
  }, [authedUser, originKey, navigation]);

  // Presentation only. Both account types authenticate identically — a
  // phone number and a password — and which type a number belongs to isn't
  // knowable until Firebase has already signed the user in. So this picks
  // the framing and where "create an account" leads; it is deliberately
  // NOT passed to logIn(), because filtering the login by it would either
  // be a lie or leak which numbers are registered as businesses.
  const [accountType, setAccountType] = useState(route?.params?.accountType ?? 'individual');
  const isCompany = accountType === 'company';

  // The thumb slides between the two sides instead of jumping. It is the
  // difference between a control that responds and one that simply redraws —
  // and it shows which way the choice moved, which a swap cannot.
  const SEG_PADDING = 4;
  const SEG_GAP = 4;
  const [segWidth, setSegWidth] = useState(0);
  const thumbX = useRef(new Animated.Value(0)).current;
  const thumbSettled = useRef(false);
  const thumbWidth = segWidth > 0 ? (segWidth - SEG_PADDING * 2 - SEG_GAP) / 2 : 0;

  useEffect(() => {
    if (thumbWidth <= 0) return;
    const target = isCompany ? thumbWidth + SEG_GAP : 0;
    // The first pass is a placement, not a move: arriving with Company
    // already chosen should not animate in from the left.
    if (!thumbSettled.current) {
      thumbX.setValue(target);
      thumbSettled.current = true;
      return;
    }
    Animated.spring(thumbX, {
      toValue: target,
      useNativeDriver: true,
      // Firm, with no overshoot — a bouncy thumb reads as a toy.
      friction: 11,
      tension: 90,
    }).start();
  }, [isCompany, thumbWidth, thumbX]);

  // Tapping the side that is already chosen is not a change, so it neither
  // ticks nor re-runs the spring.
  const chooseAccountType = (next) => {
    if (next === accountType) return;
    selectionTick();
    setAccountType(next);
  };

  const country = countries[countryIdx];
  const phoneDigits = phone.replace(/\D/g, '');
  const isPhoneValid = phoneDigits.length >= 8;
  const fullPhone = `${country.dial}${phoneDigits}`;
  const canSubmit = isPhoneValid && password.length >= 4;

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert(t('loginTitle'), t('errorRequiredFields'));
      return;
    }

    setIsSubmitting(true);
    try {
      await logIn({ phone: fullPhone, password });
    } catch (error) {
      Alert.alert(t('loginTitle'), t(mapAuthErrorToKey(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Container edges={['left', 'right', 'bottom']}>
        <HeaderRow topInset={topInset}>
          <BackLink onPress={() => closeAccountGate(navigation, originKey)} hitSlop={12}>
            <Ionicons name="chevron-back" size={17} color={colors.text} />
            {/* Labelled "Sell" even when the user arrived from a listing
                they were reporting, which named the wrong destination. The
                chevron alone is honest wherever it came from. */}
          </BackLink>
          <HeaderTitle>{t('loginTitle')}</HeaderTitle>
          <LanguageSwitch />
        </HeaderRow>

        <Content
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FlagEyebrowRow>
            <BeninFlag />
            <FlagEyebrowLabel>
              {t(isCompany ? 'companySignUpEyebrow' : 'loginEyebrow')}
            </FlagEyebrowLabel>
          </FlagEyebrowRow>
          {/* "Welcome back" is wider than "Bon retour" and breaks in two on a
              narrower iPhone. Held to one line and allowed to shrink a little
              instead — the greeting reads worse split than a point smaller. */}
          <Headline numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {t('loginHeadline')}
          </Headline>
          <HeadlineCopy>
            {t(isCompany ? 'loginHeadlineCopyCompany' : 'loginHeadlineCopy')}
          </HeadlineCopy>

          <SegControl onLayout={(event) => setSegWidth(event.nativeEvent.layout.width)}>
            {thumbWidth > 0 ? (
              <SegThumb
                style={{ width: thumbWidth, transform: [{ translateX: thumbX }] }}
              />
            ) : null}
            <SegOption
              selected={!isCompany}
              onPress={() => chooseAccountType('individual')}
              accessibilityRole="button"
              accessibilityState={{ selected: !isCompany }}
            >
              <SegIcon selected={!isCompany}>
                <Ionicons
                  name="person"
                  size={14}
                  color={!isCompany ? EMERALD : colors.textMuted}
                />
              </SegIcon>
              <SegLabel selected={!isCompany}>{t('accountTypeIndividualTitle')}</SegLabel>
            </SegOption>
            <SegOption
              selected={isCompany}
              onPress={() => chooseAccountType('company')}
              accessibilityRole="button"
              accessibilityState={{ selected: isCompany }}
            >
              <SegIcon selected={isCompany}>
                <Ionicons
                  name="business"
                  size={14}
                  color={isCompany ? EMERALD : colors.textMuted}
                />
              </SegIcon>
              <SegLabel selected={isCompany}>{t('accountTypeCompanyTitle')}</SegLabel>
            </SegOption>
          </SegControl>

          <Label>{t('fieldPhone')}</Label>
          <PhoneFieldRow valid={isPhoneValid}>
            <CountrySelect onPress={() => setCountrySheetOpen(true)} hitSlop={8}>
              <FlagEmoji>{country.flag}</FlagEmoji>
              <DialCodeText>{country.dial}</DialCodeText>
              <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
            </CountrySelect>
            <FieldDivider />
            <PhoneInput
              value={phone}
              onChangeText={setPhone}
              placeholder={t('fieldPhonePlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </PhoneFieldRow>

          <Label>{t('fieldPassword')}</Label>
          <InputRow>
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder={t('fieldPasswordPlaceholder')}
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </InputRow>

          <ForgotPasswordRow>
            <Pressable onPress={() => navigation.navigate(forgotRoute, { loginRoute })}>
              <FooterLink>{t('forgotPasswordLink')}</FooterLink>
            </Pressable>
          </ForgotPasswordRow>
        </Content>

        <CtaDock>
          <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <SubmitLabel>{t('loginButton')}</SubmitLabel>
            )}
          </SubmitButton>

          <FooterRow>
            <FooterText>{t(isCompany ? 'noAccountYetCompany' : 'noAccountYet')} </FooterText>
            {/* The segmented control above IS the account-type choice, so
                this carries it straight into sign-up rather than asking
                again. It must always be passed: navigating to SellSignUp
                bare leaves accountType undefined, which silently drops a
                business owner into the individual flow. */}
            <Pressable
              onPress={() =>
                navigation.navigate(signUpRoute, {
                  accountType,
                  originKey,
                  signUpRoute,
                  loginRoute,
                  forgotRoute,
                })
              }
            >
              <FooterLink>{t(isCompany ? 'goToSignUpCompany' : 'goToSignUp')}</FooterLink>
            </Pressable>
          </FooterRow>

          <TrustRow>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.textMuted} />
            <TrustText>{t('loginSecureConnection')}</TrustText>
          </TrustRow>
        </CtaDock>
      </Container>

      <Modal
        visible={countrySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCountrySheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setCountrySheetOpen(false)}>
          <CountrySheet onStartShouldSetResponder={() => true}>
            <SheetHandle />
            {countries.map((item, index) => (
              <CountryRow
                key={item.dial}
                selected={index === countryIdx}
                onPress={() => {
                  setCountryIdx(index);
                  setCountrySheetOpen(false);
                }}
              >
                <FlagEmoji>{item.flag}</FlagEmoji>
                <CountryName>{item.name}</CountryName>
                <CountryDial>{item.dial}</CountryDial>
              </CountryRow>
            ))}
          </CountrySheet>
        </SheetBackdrop>
      </Modal>
    </Flex>
  );
}

const Flex = styled.KeyboardAvoidingView`
  flex: 1;
`;

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${spacing.md}px;
  /* The inset is applied here in JS rather than by the SafeAreaView edge.
     On iOS that edge left the arrow up against the status bar — near enough
     the Dynamic Island that the system was swallowing taps on it — so the
     value is read directly and floored, and the row adds its own padding on
     top of it instead of relying on the edge alone. */
  padding-top: ${(props) => props.topInset + spacing.sm}px;
  padding-bottom: ${spacing.sm}px;
`;

const BackLink = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 44px;
  height: 44px;
  margin-left: -4px;
`;

const HeaderTitle = styled.Text`
  position: absolute;
  left: 0px;
  right: 0px;
  text-align: center;
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const Content = styled.ScrollView``;

const FlagWrap = styled.View`
  width: 27px;
  height: 18px;
  border-radius: 3px;
  overflow: hidden;
  flex-direction: row;
  flex-shrink: 0;
`;

const FlagGreenBand = styled.View`
  width: 40%;
  background-color: ${FLAG_GREEN};
`;

const FlagRightCol = styled.View`
  flex: 1;
`;

const FlagYellowBand = styled.View`
  flex: 1;
  background-color: ${FLAG_YELLOW};
`;

const FlagRedBand = styled.View`
  flex: 1;
  background-color: ${FLAG_RED};
`;

const FlagEyebrowRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: ${spacing.md}px;
`;

const FlagEyebrowLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.3px;
  color: ${(props) => props.theme.textMuted};
`;

const Headline = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 27px;
  line-height: 32px;
  color: ${(props) => props.theme.text};
  margin-bottom: 8px;
`;

// Full width and taller than the appearance toggle in the menu: this one
// reframes the screen it sits on, so it reads as a choice rather than a
// setting tucked into a row.
// A recessed track with a raised thumb, rather than a solid green block:
// the selected side reads as a surface lifted off the track, which is both
// quieter and more precise than filling half the control with colour. The
// emerald stays as the accent on the icon and the hairline.
const SegControl = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

// The moving surface, painted under the two labels.
const SegThumb = styled(Animated.View)`
  position: absolute;
  left: 4px;
  top: 4px;
  bottom: 4px;
  border-radius: 14px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.22);
  /* Tight and low: a thumb that floats too far off the track stops looking
     like part of the same control. */
  shadow-color: #0b1f16;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 5px;
  elevation: 2;
`;

const SegOption = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding-vertical: 11px;
  border-radius: 14px;
`;

const SegIcon = styled.View`
  opacity: ${(props) => (props.selected ? 1 : 0.85)};
`;

const SegLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.bold : fontFamily.medium)};
  font-size: 13px;
  color: ${(props) => (props.selected ? props.theme.text : props.theme.textMuted)};
`;

const HeadlineCopy = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  max-width: 320px;
  /* Two lines' worth of height, reserved whether or not the second line is
     used. The individual and company sentences are different lengths, so
     without this the block grows by a line when the toggle changes and the
     whole form below it jumps — worse on iOS, where the company sentence
     was the one that wrapped. Reserved space reads as breathing room; a
     form that shifts under your thumb reads as a bug. */
  min-height: 42px;
  margin-bottom: ${spacing.lg}px;
`;

const Label = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
  margin-top: ${spacing.md}px;
`;

const InputRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  min-height: 52px;
  ${shadow.card}
`;

const Input = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const PhoneFieldRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => (props.valid ? EMERALD : props.theme.border)};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  min-height: 52px;
  ${shadow.card}
`;

const CountrySelect = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

const FlagEmoji = styled.Text`
  font-size: 18px;
`;

const DialCodeText = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const FieldDivider = styled.View`
  width: 1px;
  height: 22px;
  background-color: ${(props) => props.theme.border};
  flex-shrink: 0;
`;

const PhoneInput = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  ${type.body}
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const ForgotPasswordRow = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  margin-top: ${spacing.xs}px;
`;

const CtaDock = styled.View`
  padding: ${spacing.sm}px ${spacing.lg}px ${spacing.md}px;
`;

const SubmitButton = styled(Pressable)`
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};
  ${shadow.card}
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const FooterRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-top: ${spacing.md}px;
`;

const FooterText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
`;

const FooterLink = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.primary};
`;

const TrustRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: ${spacing.md}px;
`;

const TrustText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const CountrySheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: ${spacing.sm}px 0px ${spacing.xl}px;
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.border};
  align-self: center;
  margin-bottom: ${spacing.md}px;
`;

const CountryRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding-horizontal: ${spacing.lg}px;
  padding-vertical: 13px;
  background-color: ${(props) => (props.selected ? props.theme.primaryLight : 'transparent')};
`;

const CountryName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const CountryDial = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;
