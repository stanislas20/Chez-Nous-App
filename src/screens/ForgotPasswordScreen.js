import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, Platform, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useCountries } from '../hooks/useCountries';
import { sendOtp, confirmOtp, mapPhoneAuthErrorToKey } from '../auth/phoneVerification';
import {
  resetSellerPassword,
  lookupSellerForRecovery,
  mapResetPasswordErrorToKey,
} from '../auth/passwordReset';
import { LanguageSwitch } from '../components/LanguageSwitch';

const EMERALD = '#0B6E4F';
const FLAG_GREEN = '#008751';
const FLAG_YELLOW = '#FCD116';
const FLAG_RED = '#E8112D';
const GOLD = '#D9A441';
const TERRACOTTA = '#C1512D';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
// The code is checked as soon as the sixth digit lands. The pause is long
// enough to see that digit arrive, so the screen doesn't appear to jump
// before the number has been read back.
const AUTO_SUBMIT_DELAY_MS = 420;

const STEP_PHONE = 1;
const STEP_CODE = 2;
const STEP_PASSWORD = 3;
const STEP_DONE = 4;

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

// Enough to satisfy every rule below on the first try, drawn fresh each
// time — a fixed suggestion would hand the same password to everyone who
// tapped the button.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';

function generatePassword() {
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(UPPER), pick(DIGITS)];
  while (chars.length < 12) chars.push(pick(LOWER));
  // Shuffle, so the capital and the digit aren't always in the same place.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function ForgotPasswordScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const countries = useCountries();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 56 : 8);

  // This screen is registered in both SellStack and the root stack, so where
  // "sign in" leads is passed in rather than hardcoded — see openAccountGate.
  const loginRoute = route?.params?.loginRoute ?? 'SellLogin';

  const [step, setStep] = useState(STEP_PHONE);
  const [countryIdx, setCountryIdx] = useState(0);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [code, setCode] = useState('');
  const [idToken, setIdToken] = useState(null);
  const [account, setAccount] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // With the keyboard up, `behavior="padding"` shrinks the whole screen: the
  // focused field stays visible but everything under it — the SMS/WhatsApp
  // tiles, the confirm field — sits behind the keyboard until you scroll.
  // Lifting the focused block to the top of the remaining window brings what
  // follows it along, so nothing has to be hunted for.
  const scrollRef = useRef(null);
  const blockOffsets = useRef({});
  const rememberBlock = (key) => (event) => {
    blockOffsets.current[key] = event.nativeEvent.layout.y;
  };
  const revealBlock = (key) => () => {
    const y = blockOffsets.current[key];
    if (y == null) return;
    // After the keyboard's own layout pass, or the scroll lands on the old
    // viewport height and undershoots.
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true }), 80);
  };

  const country = countries[countryIdx];
  const phoneDigits = phone.replace(/\D/g, '');
  const isPhoneValid = phoneDigits.length >= 8;
  const fullPhone = `${country.dial}${phoneDigits}`;
  const maskedPhone = phoneDigits.length >= 2 ? `•• •• •• ${phoneDigits.slice(-2)}` : '•• •• •• ••';

  const rules = useMemo(
    () => [
      { key: 'fpRuleLength', ok: password.length >= 8 },
      { key: 'fpRuleCase', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
      { key: 'fpRuleDigit', ok: /\d/.test(password) },
    ],
    [password],
  );
  const score = rules.filter((rule) => rule.ok).length;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const isPasswordValid = score === rules.length && passwordsMatch;

  const strengthColor = score <= 1 ? TERRACOTTA : score === 2 ? GOLD : EMERALD;
  const strengthKey =
    score <= 1 ? 'fpStrengthWeak' : score === 2 ? 'fpStrengthMedium' : 'fpStrengthStrong';

  // Debounced: the number is looked up once typing settles, not on every
  // keystroke, so a ten-digit number costs one call rather than three.
  useEffect(() => {
    if (!isPhoneValid) {
      setAccount(null);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      const found = await lookupSellerForRecovery({ phone: fullPhone });
      if (active) setAccount(found?.found ? found : null);
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fullPhone, isPhoneValid]);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setTimeout(() => setSeconds((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const headerTitle = [
    t('fpHeaderRecovery'),
    t('fpHeaderVerification'),
    t('fpHeaderPassword'),
    t('fpHeaderDone'),
  ][step - 1];

  const handleBack = () => {
    if (step === STEP_PHONE) {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate(loginRoute);
      return;
    }
    // Leaving the code step drops the digits: they belong to a verification
    // that is about to be restarted, and a half-entered code left on screen
    // reads as though it still counts.
    if (step === STEP_CODE) setCode('');
    setStep(step - 1);
  };

  const handleSendCode = async () => {
    if (!isPhoneValid || isSending) return;
    setIsSending(true);
    try {
      const nextConfirmation = await sendOtp(fullPhone);
      setConfirmation(nextConfirmation);
      setCode('');
      setSeconds(RESEND_COOLDOWN_SECONDS);
      setStep(STEP_CODE);
    } catch (error) {
      Alert.alert(t('forgotPasswordTitle'), t(mapPhoneAuthErrorToKey(error)));
    } finally {
      setIsSending(false);
    }
  };

  const handleResend = async () => {
    if (seconds > 0 || isSending) return;
    setIsSending(true);
    try {
      const nextConfirmation = await sendOtp(fullPhone);
      setConfirmation(nextConfirmation);
      setCode('');
      setSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      Alert.alert(t('forgotPasswordTitle'), t(mapPhoneAuthErrorToKey(error)));
    } finally {
      setIsSending(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== CODE_LENGTH || isVerifying) return;
    setIsVerifying(true);
    try {
      const token = await confirmOtp(confirmation, code);
      setIdToken(token);
      setStep(STEP_PASSWORD);
    } catch (error) {
      // Clear on failure so the next attempt starts from an empty row rather
      // than making them delete six digits by hand.
      setCode('');
      Alert.alert(t('otpTitle'), t(mapPhoneAuthErrorToKey(error)));
    } finally {
      setIsVerifying(false);
    }
  };

  // The keypad fills the last box and the check fires on its own, so there is
  // no separate "confirm" tap for a code that is already complete.
  useEffect(() => {
    if (code.length !== CODE_LENGTH || isVerifying || step !== STEP_CODE) return undefined;
    const timer = setTimeout(handleVerify, AUTO_SUBMIT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  const handleSave = async () => {
    if (!isPasswordValid || isSaving) return;
    setIsSaving(true);
    try {
      await resetSellerPassword({ idToken, newPassword: password });
      setStep(STEP_DONE);
    } catch (error) {
      const key = mapResetPasswordErrorToKey(error);
      Alert.alert(t('forgotPasswordNewPasswordTitle'), t(key));
      if (key === 'errorResetTokenExpired') {
        // The phone verification aged out, so the whole flow restarts rather
        // than leaving a password form that can no longer submit.
        setConfirmation(null);
        setIdToken(null);
        setCode('');
        setSeconds(0);
        setStep(STEP_PHONE);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyPress = (key) => {
    if (key === 'del') {
      setCode((prev) => prev.slice(0, -1));
      return;
    }
    if (!key) return;
    setCode((prev) => (prev.length >= CODE_LENGTH ? prev : prev + key));
  };

  const handleGeneratePassword = () => {
    const generated = generatePassword();
    setPassword(generated);
    setConfirmPassword(generated);
    // Shown rather than hidden: a password nobody can read is a password
    // nobody can write down before it is saved.
    setShowPassword(true);
  };

  const primaryAction =
    step === STEP_PHONE
      ? handleSendCode
      : step === STEP_CODE
        ? handleVerify
        : step === STEP_PASSWORD
          ? handleSave
          : () => navigation.navigate(loginRoute);

  const primaryLabel =
    step === STEP_PHONE
      ? isSending
        ? t('fpCtaSending')
        : t('otpSendCodeButton')
      : step === STEP_CODE
        ? isVerifying
          ? t('fpCtaVerifying')
          : t('fpCtaVerify')
        : step === STEP_PASSWORD
          ? isSaving
            ? t('fpCtaSaving')
            : t('fpCtaSave')
          : t('fpDoneCta');

  const primaryDisabled =
    step === STEP_PHONE
      ? !isPhoneValid || isSending
      : step === STEP_CODE
        ? code.length !== CODE_LENGTH || isVerifying
        : step === STEP_PASSWORD
          ? !isPasswordValid || isSaving
          : false;

  const stepMeta = [
    { title: t('fpTitlePhone'), copy: t('fpCopyPhone') },
    {
      title: t('fpTitleCode'),
      copy: t('fpCopyCode', { method: t('fpMethodSms'), phone: maskedPhone }),
    },
    { title: t('fpTitlePassword'), copy: t('fpCopyPassword') },
  ][Math.min(step, STEP_PASSWORD) - 1];

  return (
    <Flex behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Container edges={['left', 'right', 'bottom']}>
        <HeaderRow topInset={topInset}>
          <BackButton onPress={handleBack} hitSlop={12}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </BackButton>
          <HeaderTitle numberOfLines={1}>{headerTitle}</HeaderTitle>
          <LanguageSwitch />
        </HeaderRow>

        <ProgressWrap>
          <ProgressTrack>
            <ProgressFill
              step={step}
              colors={[FLAG_GREEN, FLAG_YELLOW, FLAG_RED]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </ProgressTrack>
        </ProgressWrap>

        {step === STEP_DONE ? (
          <Scroll contentContainerStyle={scrollStyle} showsVerticalScrollIndicator={false}>
            <DoneWrap>
              <DoneIcon>
                <Ionicons name="checkmark" size={30} color={EMERALD} />
              </DoneIcon>
              <DoneTitle>{t('fpDoneTitle')}</DoneTitle>
              <DoneCopy>{t('fpDoneCopy')}</DoneCopy>
            </DoneWrap>

            <DeviceRow>
              <DeviceIcon>
                <Ionicons name="phone-portrait-outline" size={17} color={EMERALD} />
              </DeviceIcon>
              <DeviceCol>
                <DeviceName>{t('fpDeviceThis')}</DeviceName>
                <DeviceSub>{t('fpDeviceThisSub')}</DeviceSub>
              </DeviceCol>
              <DeviceBadge>{t('fpDeviceActive')}</DeviceBadge>
            </DeviceRow>

            <DeviceRow>
              <DeviceIcon muted>
                <Ionicons name="laptop-outline" size={17} color={colors.textMuted} />
              </DeviceIcon>
              <DeviceCol>
                <DeviceName>{t('fpDeviceOthers')}</DeviceName>
                <DeviceSub>{t('fpDeviceOthersSub')}</DeviceSub>
              </DeviceCol>
            </DeviceRow>
          </Scroll>
        ) : (
          <Scroll
            ref={scrollRef}
            contentContainerStyle={scrollStyle}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <KickerRow>
              <StepPill>{t('fpStepLabel', { step: Math.min(step, STEP_PASSWORD) })}</StepPill>
            </KickerRow>
            <Headline>{stepMeta.title}</Headline>
            <Copy>{stepMeta.copy}</Copy>

            {step === STEP_PHONE ? (
              <>
                <FieldLabel onLayout={rememberBlock('phone')}>{t('fieldPhone')}</FieldLabel>
                <PhoneFieldRow valid={isPhoneValid}>
                  <CountrySelect onPress={() => setCountrySheetOpen(true)} hitSlop={8}>
                    <FlagEmoji>{country.flag}</FlagEmoji>
                    <DialCode>{country.dial}</DialCode>
                    <Ionicons name="chevron-down" size={10} color={colors.textMuted} />
                  </CountrySelect>
                  <FieldDivider />
                  <PhoneInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder={t('fieldPhonePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    maxLength={10}
                    autoComplete="tel"
                    onFocus={revealBlock('phone')}
                  />
                  {isPhoneValid ? (
                    <Ionicons name="checkmark" size={18} color={EMERALD} />
                  ) : null}
                </PhoneFieldRow>

                {account?.name ? (
                  <AccountCard>
                    <AccountAvatar>
                      <AccountInitial>{account.name.trim().charAt(0).toUpperCase()}</AccountInitial>
                    </AccountAvatar>
                    <AccountCol>
                      <AccountName numberOfLines={1}>{account.name}</AccountName>
                      <AccountSub>
                        {account.memberSince
                          ? t('fpAccountSince', { year: account.memberSince })
                          : t('fpAccountFound')}
                      </AccountSub>
                    </AccountCol>
                    <AccountCheck>
                      <Ionicons name="checkmark" size={11} color="#ffffff" />
                    </AccountCheck>
                  </AccountCard>
                ) : isPhoneValid ? (
                  <AccountCard>
                    <AccountAvatar>
                      <Ionicons name="call" size={19} color="#ffffff" />
                    </AccountAvatar>
                    <AccountCol>
                      <AccountName>{fullPhone}</AccountName>
                      <AccountSub>{t('fpCodeGoesTo')}</AccountSub>
                    </AccountCol>
                  </AccountCard>
                ) : null}

                <SectionLabel>{t('fpSendVia')}</SectionLabel>
                {/* Stated, not offered. Firebase phone auth delivers by SMS
                    and nothing else, so there is one channel to name — and a
                    picker holding a single option only invites the question
                    of what the other one was for. */}
                <DeliveryRow>
                  <DeliveryIcon>
                    <Ionicons name="chatbubble-outline" size={17} color="#ffffff" />
                  </DeliveryIcon>
                  <DeliveryCol>
                    <MethodLabel>{t('fpMethodSms')}</MethodLabel>
                    <MethodHint>{t('fpMethodSmsHint')}</MethodHint>
                  </DeliveryCol>
                </DeliveryRow>

                <HelpRow>
                  <Ionicons name="help-circle-outline" size={14} color={colors.textMuted} />
                  <HelpText>
                    {t('fpNoAccessQuestion')} <HelpLink>{t('fpContactSupport')}</HelpLink>
                  </HelpText>
                </HelpRow>
              </>
            ) : null}

            {step === STEP_CODE ? (
              <>
                <AccountCard>
                  <AccountAvatar>
                    <Ionicons name="call" size={19} color="#ffffff" />
                  </AccountAvatar>
                  <AccountCol>
                    <AccountName>{country.dial}</AccountName>
                    <AccountSub>{maskedPhone}</AccountSub>
                  </AccountCol>
                  <EditNumber onPress={handleBack} hitSlop={10}>
                    <EditNumberLabel>{t('fpEditNumber')}</EditNumberLabel>
                  </EditNumber>
                </AccountCard>

                <HelpRow>
                  <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
                  <HelpText>{t('fpCodeSecrecy')}</HelpText>
                </HelpRow>
              </>
            ) : null}

            {step === STEP_PASSWORD ? (
              <>
                <GenerateRow onPress={handleGeneratePassword}>
                  <Ionicons name="key-outline" size={17} color={EMERALD} />
                  <GenerateLabel>{t('fpGeneratePassword')}</GenerateLabel>
                </GenerateRow>

                <FieldLabel onLayout={rememberBlock('password')}>{t('fpNewPassword')}</FieldLabel>
                <PasswordFieldRow>
                  <PasswordInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onFocus={revealBlock('password')}
                  />
                  <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={10}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </PasswordFieldRow>

                {password.length > 0 ? (
                  <StrengthRow>
                    <StrengthTrack>
                      <StrengthFill score={score} total={rules.length} tone={strengthColor} />
                    </StrengthTrack>
                    <StrengthLabel tone={strengthColor}>{t(strengthKey)}</StrengthLabel>
                  </StrengthRow>
                ) : null}

                <RuleList>
                  {rules.map((rule) => (
                    <RuleRow key={rule.key}>
                      <RuleIcon ok={rule.ok}>
                        <Ionicons name="checkmark" size={10} color="#ffffff" />
                      </RuleIcon>
                      <RuleText ok={rule.ok}>{t(rule.key)}</RuleText>
                    </RuleRow>
                  ))}
                </RuleList>

                <FieldLabel onLayout={rememberBlock('confirm')}>
                  {t('fieldConfirmPassword')}
                </FieldLabel>
                <PasswordFieldRow>
                  <PasswordInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder={t('fieldConfirmPasswordPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onFocus={revealBlock('confirm')}
                  />
                </PasswordFieldRow>

                {passwordsMismatch ? <MismatchText>{t('errorPasswordMismatch')}</MismatchText> : null}
                {passwordsMatch ? (
                  <MatchRow>
                    <Ionicons name="checkmark" size={12} color={EMERALD} />
                    <MatchText>{t('fpPasswordsMatch')}</MatchText>
                  </MatchRow>
                ) : null}
              </>
            ) : null}
          </Scroll>
        )}

        {step === STEP_CODE ? (
          <KeypadDock>
            <CodeRow>
              {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                <CodeBox
                  // Fixed-length row of positions, not a reorderable list.
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  index={index}
                  char={code[index] ?? ''}
                  active={index === code.length}
                />
              ))}
            </CodeRow>

            <ResendRow>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <ResendButton onPress={handleResend} disabled={seconds > 0} hitSlop={8}>
                <ResendLabel active={seconds <= 0}>
                  {seconds > 0 ? t('fpResendIn', { seconds }) : t('otpResendButton')}
                </ResendLabel>
              </ResendButton>
            </ResendRow>

            {KEYPAD_ROWS.map((row) => (
              <KeypadRow key={row.join('')}>
                {row.map((key) => (
                  <KeypadKey
                    key={key || 'blank'}
                    blank={!key}
                    disabled={!key}
                    onPress={() => handleKeyPress(key)}
                  >
                    {key === 'del' ? (
                      <Ionicons name="backspace-outline" size={20} color={colors.text} />
                    ) : (
                      <KeypadLabel>{key}</KeypadLabel>
                    )}
                  </KeypadKey>
                ))}
              </KeypadRow>
            ))}
          </KeypadDock>
        ) : null}

        <CtaDock>
          <PrimaryButton disabled={primaryDisabled} onPress={primaryAction}>
            <PrimaryLabel>{primaryLabel}</PrimaryLabel>
          </PrimaryButton>
          {step === STEP_DONE ? null : (
            <TrustRow>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
              <TrustText>{t('fpTrustNote')}</TrustText>
            </TrustRow>
          )}
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

// One box of the code row. The digit lands with a small pop and the next
// empty box carries a blinking caret, so the row reads as a field being
// filled rather than six static squares.
function CodeBox({ char, active, index }) {
  const pop = useRef(new Animated.Value(char ? 1 : 0.5)).current;
  const caret = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!char) {
      pop.setValue(0.5);
      return undefined;
    }
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [char, pop]);

  useEffect(() => {
    if (!active) {
      caret.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 1, duration: 10, useNativeDriver: true }),
        Animated.delay(540),
        Animated.timing(caret, { toValue: 0, duration: 10, useNativeDriver: true }),
        Animated.delay(540),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, caret]);

  return (
    <CodeBoxWrap filled={!!char} active={active} testID={`code-box-${index}`}>
      {char ? (
        <Animated.Text
          style={{
            transform: [{ scale: pop }],
            opacity: pop,
            fontFamily: fontFamily.bold,
            fontSize: 22,
            color: CODE_TEXT,
          }}
        >
          {char}
        </Animated.Text>
      ) : (
        <Animated.View
          style={{ opacity: caret, width: 2, height: 24, borderRadius: 2, backgroundColor: EMERALD }}
        />
      )}
    </CodeBoxWrap>
  );
}

const CODE_TEXT = '#1C1C1E';

const scrollStyle = { padding: spacing.lg, paddingTop: 18, paddingBottom: 16 };

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
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.lg}px;
  /* Same reasoning as the sign-up header: the inset is read in JS and
     floored, because relying on the SafeAreaView edge left the arrow up
     against the status bar on iOS. */
  padding-top: ${(props) => props.topInset + spacing.sm}px;
  padding-bottom: ${spacing.sm}px;
`;

const BackButton = styled(Pressable)`
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  margin-left: -${spacing.xs}px;
`;

const HeaderTitle = styled.Text`
  flex: 1;
  text-align: center;
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const ProgressWrap = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${spacing.lg}px;
  padding-top: ${spacing.xs}px;
`;

const ProgressTrack = styled.View`
  flex: 1;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.12);
  overflow: hidden;
`;

const ProgressFill = styled(LinearGradient)`
  height: 100%;
  border-radius: ${radius.pill}px;
  width: ${(props) => props.step * 25}%;
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const KickerRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
`;

const StepPill = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1px;
  color: ${EMERALD};
  background-color: rgba(11, 110, 79, 0.09);
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
`;

const Headline = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 25px;
  line-height: 29px;
  color: ${(props) => props.theme.text};
  margin-bottom: 8px;
`;

const Copy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 20px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 22px;
  max-width: 300px;
`;

const FieldLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  margin-bottom: 8px;
`;

const PhoneFieldRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding-horizontal: 14px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => (props.valid ? EMERALD : props.theme.border)};
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

const DialCode = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const FieldDivider = styled.View`
  width: 1px;
  height: 22px;
  flex-shrink: 0;
  background-color: ${(props) => props.theme.border};
`;

const PhoneInput = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  font-family: ${fontFamily.regular};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const AccountCard = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 13px 15px;
  border-radius: 18px;
  background-color: rgba(11, 110, 79, 0.05);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.2);
  margin-top: 12px;
  margin-bottom: 4px;
`;

const AccountAvatar = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 15px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: ${EMERALD};
`;

const AccountInitial = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: #ffffff;
`;

const AccountCheck = styled.View`
  width: 22px;
  height: 22px;
  border-radius: 11px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: ${EMERALD};
`;

const AccountCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const AccountName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const AccountSub = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const EditNumber = styled(Pressable)`
  flex-shrink: 0;
`;

const EditNumberLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  color: ${EMERALD};
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-top: 24px;
  margin-bottom: 11px;
`;

const DeliveryRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 15px;
  border-radius: 18px;
  margin-bottom: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
`;

const DeliveryIcon = styled.View`
  width: 36px;
  height: 36px;
  border-radius: 12px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: ${EMERALD};
`;

const DeliveryCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const MethodLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const MethodHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 15px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const HelpRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 13px 14px;
  border-radius: 16px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-top: 4px;
`;

const HelpText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const HelpLink = styled.Text`
  font-family: ${fontFamily.bold};
  color: ${EMERALD};
`;

const CodeRow = styled.View`
  flex-direction: row;
  gap: 9px;
  margin-bottom: 4px;
`;

const CodeBoxWrap = styled.View`
  flex: 1;
  height: 58px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) =>
    props.filled ? EMERALD : props.active ? 'rgba(11, 110, 79, 0.45)' : props.theme.border};
`;

const ResendRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 10px;
`;

const ResendButton = styled(Pressable)``;

const ResendLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${(props) => (props.active ? EMERALD : props.theme.textMuted)};
`;

// Sits between the scrolling half of the step and the dock, so the digits
// stay put while the card and the boxes above them move.
const KeypadDock = styled.View`
  flex-shrink: 0;
  gap: 9px;
  padding-horizontal: ${spacing.lg}px;
  padding-bottom: 8px;
`;

const KeypadRow = styled.View`
  flex-direction: row;
  gap: 9px;
`;

const KeypadKey = styled(Pressable)`
  flex: 1;
  height: 50px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background-color: ${(props) => (props.blank ? 'transparent' : props.theme.surface)};
  border-width: ${(props) => (props.blank ? 0 : 1)}px;
  border-color: ${(props) => props.theme.border};
`;

const KeypadLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 20px;
  color: ${(props) => props.theme.text};
`;

const GenerateRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 14px;
  margin-top: 4px;
  margin-bottom: 18px;
  border-radius: 16px;
  border-width: 1.5px;
  border-color: rgba(11, 110, 79, 0.3);
  background-color: rgba(11, 110, 79, 0.04);
`;

const GenerateLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const PasswordFieldRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding-horizontal: 14px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
`;

const PasswordInput = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  font-family: ${fontFamily.regular};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const StrengthRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 9px;
  margin-top: 11px;
  margin-bottom: 14px;
`;

const StrengthTrack = styled.View`
  flex: 1;
  height: 4px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.border};
`;

const StrengthFill = styled.View`
  height: 100%;
  border-radius: ${radius.pill}px;
  width: ${(props) => (props.score / props.total) * 100}%;
  background-color: ${(props) => props.tone};
`;

const StrengthLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  color: ${(props) => props.tone};
`;

const RuleList = styled.View`
  margin-bottom: 20px;
`;

const RuleRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
`;

const RuleIcon = styled.View`
  width: 16px;
  height: 16px;
  border-radius: 8px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.ok ? EMERALD : props.theme.border)};
`;

const RuleText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => (props.ok ? props.theme.text : props.theme.textMuted)};
`;

const MismatchText = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  margin-top: 7px;
  color: ${TERRACOTTA};
`;

const MatchRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
`;

const MatchText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${EMERALD};
`;

const DoneWrap = styled.View`
  align-items: center;
  padding: 34px 8px 10px;
`;

const DoneIcon = styled.View`
  width: 68px;
  height: 68px;
  border-radius: 34px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.1);
  margin-bottom: 20px;
`;

const DoneTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 21px;
  text-align: center;
  color: ${(props) => props.theme.text};
  margin-bottom: 9px;
`;

const DoneCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 21px;
  text-align: center;
  max-width: 290px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 26px;
`;

const DeviceRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 11px;
  padding: 14px 15px;
  border-radius: 16px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: 10px;
`;

const DeviceIcon = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 13px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.muted ? props.theme.surfaceAlt : 'rgba(11, 110, 79, 0.1)')};
`;

const DeviceCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const DeviceName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const DeviceSub = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const DeviceBadge = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  flex-shrink: 0;
  color: ${EMERALD};
`;

const CtaDock = styled.View`
  flex-shrink: 0;
  padding: 12px ${spacing.lg}px 22px;
  background-color: ${(props) => props.theme.background};
`;

const PrimaryButton = styled(Pressable)`
  border-radius: 18px;
  padding: 17px 20px;
  align-items: center;
  background-color: ${(props) => (props.disabled ? 'rgba(11, 110, 79, 0.35)' : EMERALD)};
  ${(props) => (props.disabled ? '' : shadow.card)}
`;

const PrimaryLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: #ffffff;
`;

const TrustRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
`;

const TrustText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
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
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const CountryDial = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  color: ${(props) => props.theme.textMuted};
`;
