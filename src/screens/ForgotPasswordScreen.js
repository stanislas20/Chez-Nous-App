import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { isValidPhone, normalizePhone } from '../auth/phoneAuth';
import { sendOtp, confirmOtp, mapPhoneAuthErrorToKey } from '../auth/phoneVerification';
import { resetSellerPassword, mapResetPasswordErrorToKey } from '../auth/passwordReset';

const RESEND_COOLDOWN_SECONDS = 60;

export function ForgotPasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { logIn } = useAuth();

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [idToken, setIdToken] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSendCode = async () => {
    if (!isValidPhone(phone)) {
      Alert.alert(t('forgotPasswordTitle'), t('errorInvalidPhone'));
      return;
    }

    setIsSendingCode(true);
    try {
      const nextConfirmation = await sendOtp(normalizePhone(phone));
      setConfirmation(nextConfirmation);
      setOtpCode('');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStep('otp');
    } catch (error) {
      Alert.alert(t('forgotPasswordTitle'), t(mapPhoneAuthErrorToKey(error)));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!otpCode.trim()) {
      Alert.alert(t('otpTitle'), t('errorOtpInvalidCode'));
      return;
    }

    setIsVerifyingCode(true);
    try {
      const token = await confirmOtp(confirmation, otpCode.trim());
      setIdToken(token);
      setStep('newPassword');
    } catch (error) {
      Alert.alert(t('otpTitle'), t(mapPhoneAuthErrorToKey(error)));
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleChangeNumber = () => {
    setStep('phone');
    setConfirmation(null);
    setOtpCode('');
    setIdToken(null);
    setResendCooldown(0);
  };

  const handleSubmit = async () => {
    if (!password || !confirmPassword) {
      Alert.alert(t('forgotPasswordNewPasswordTitle'), t('errorRequiredFields'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('forgotPasswordNewPasswordTitle'), t('errorWeakPassword'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('forgotPasswordNewPasswordTitle'), t('errorPasswordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await resetSellerPassword({ idToken, newPassword: password });
      try {
        // Best-effort seamless sign-in with the new password. AuthContext's
        // onAuthStateChanged listener drives the navigation swap on success.
        await logIn({ phone, password });
      } catch (loginError) {
        Alert.alert(t('forgotPasswordSuccessTitle'), t('forgotPasswordSuccessMessage'), [
          { text: 'OK', onPress: () => navigation.replace('SellLogin') },
        ]);
      }
    } catch (error) {
      const key = mapResetPasswordErrorToKey(error);
      Alert.alert(t('forgotPasswordNewPasswordTitle'), t(key));
      if (key === 'errorResetTokenExpired') {
        handleChangeNumber();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Container edges={['left', 'right', 'bottom']}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Content
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            <HeroImage source={require('../../assets/reset-password.jpg')} resizeMode="cover" />

            {step === 'phone' ? (
              <>
                <Subtitle>{t('forgotPasswordSubtitle')}</Subtitle>

                <Label>{t('fieldPhone')}</Label>
                <InputRow>
                  <Ionicons name="call-outline" size={20} color={colors.textMuted} />
                  <Input
                    value={phone}
                    onChangeText={setPhone}
                    placeholder={t('fieldPhonePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    maxLength={10}
                    autoCapitalize="none"
                  />
                </InputRow>

                <SubmitButton onPress={handleSendCode} disabled={isSendingCode}>
                  {isSendingCode ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <SubmitLabel>{t('otpSendCodeButton')}</SubmitLabel>
                  )}
                </SubmitButton>
              </>
            ) : null}

            {step === 'otp' ? (
              <>
                <Title>{t('otpTitle')}</Title>
                <Subtitle>{t('otpSubtitle', { phone: normalizePhone(phone) })}</Subtitle>

                <Label>{t('otpFieldCode')}</Label>
                <InputRow>
                  <Ionicons name="keypad-outline" size={20} color={colors.textMuted} />
                  <Input
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder={t('otpFieldCodePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </InputRow>

                <SubmitButton onPress={handleVerifyCode} disabled={isVerifyingCode}>
                  {isVerifyingCode ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <SubmitLabel>{t('otpVerifyButton')}</SubmitLabel>
                  )}
                </SubmitButton>

                <FooterRow>
                  <Pressable onPress={handleSendCode} disabled={resendCooldown > 0}>
                    <FooterLink style={{ opacity: resendCooldown > 0 ? 0.5 : 1 }}>
                      {resendCooldown > 0
                        ? t('otpResendCountdown', { seconds: resendCooldown })
                        : t('otpResendButton')}
                    </FooterLink>
                  </Pressable>
                </FooterRow>

                <FooterRow>
                  <Pressable onPress={handleChangeNumber}>
                    <FooterLink>{t('otpChangeNumberLink')}</FooterLink>
                  </Pressable>
                </FooterRow>
              </>
            ) : null}

            {step === 'newPassword' ? (
              <>
                <Title>{t('forgotPasswordNewPasswordTitle')}</Title>
                <Subtitle>{t('forgotPasswordNewPasswordSubtitle')}</Subtitle>

                <Label>{t('fieldPassword')}</Label>
                <InputRow>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
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

                <Label>{t('fieldConfirmPassword')}</Label>
                <InputRow>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
                  <Input
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder={t('fieldConfirmPasswordPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => setShowConfirmPassword((prev) => !prev)} hitSlop={8}>
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </InputRow>

                <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <SubmitLabel>{t('forgotPasswordSubmitButton')}</SubmitLabel>
                  )}
                </SubmitButton>
              </>
            ) : null}
          </Content>
        </TouchableWithoutFeedback>
      </Container>
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

const Content = styled.ScrollView``;

const HeroImage = styled.Image`
  width: 100%;
  height: 360px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-top: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

const Title = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
  text-align: center;
`;

const Subtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: ${spacing.xs}px;
  margin-bottom: ${spacing.lg}px;
`;

const Label = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.xs}px;
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
  ${shadow.card}
`;

const Input = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const SubmitButton = styled(Pressable)`
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  margin-top: ${spacing.xl}px;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const FooterRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-top: ${spacing.lg}px;
`;

const FooterLink = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.primary};
`;
