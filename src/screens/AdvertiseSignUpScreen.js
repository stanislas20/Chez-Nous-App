import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import {
  isValidPhone,
  normalizePhone,
  mapAuthErrorToKey,
} from "../auth/phoneAuth";
import {
  sendOtp,
  confirmOtp,
  mapPhoneAuthErrorToKey,
} from "../auth/phoneVerification";

const RESEND_COOLDOWN_SECONDS = 60;
const contentContainerStyle = { padding: spacing.lg };

export function AdvertiseSignUpScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { signUpAdvertiser } = useAuth();

  const [step, setStep] = useState("phone");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmation, setConfirmation] = useState(null);
  const [phoneIdToken, setPhoneIdToken] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSendCode = async () => {
    if (!isValidPhone(phone)) {
      Alert.alert(t("advertiserSignUpTitle"), t("errorInvalidPhone"));
      return;
    }

    setIsSendingCode(true);
    try {
      const nextConfirmation = await sendOtp(normalizePhone(phone));
      setConfirmation(nextConfirmation);
      setOtpCode("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStep("otp");
    } catch (error) {
      Alert.alert(t("advertiserSignUpTitle"), t(mapPhoneAuthErrorToKey(error)));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!otpCode.trim()) {
      Alert.alert(t("otpTitle"), t("errorOtpInvalidCode"));
      return;
    }

    setIsVerifyingCode(true);
    try {
      // Kept: it is the only proof an SMS reached this handset, and the
      // advertiser account cannot publish an ad without presenting it.
      const idToken = await confirmOtp(confirmation, otpCode.trim());
      setPhoneIdToken(idToken);
      setStep("details");
    } catch (error) {
      Alert.alert(t("otpTitle"), t(mapPhoneAuthErrorToKey(error)));
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleChangeNumber = () => {
    setStep("phone");
    setConfirmation(null);
    setOtpCode("");
    setResendCooldown(0);
  };

  const handleSubmit = async () => {
    if (!businessName.trim() || !password || !confirmPassword) {
      Alert.alert(t("advertiserSignUpTitle"), t("errorRequiredFields"));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t("advertiserSignUpTitle"), t("errorWeakPassword"));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t("advertiserSignUpTitle"), t("errorPasswordMismatch"));
      return;
    }

    setIsSubmitting(true);
    try {
      await signUpAdvertiser({
        businessName: businessName.trim(),
        phone,
        password,
        phoneIdToken,
      });
    } catch (error) {
      Alert.alert(t("advertiserSignUpTitle"), t(mapAuthErrorToKey(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerTitle =
    step === "otp" ? t("otpTitle") : t("advertiserSignUpTitle");

  return (
    <Flex behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Container edges={["left", "right", "bottom"]}>
        <Content
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Title>{headerTitle}</Title>
          {step === "phone" ? (
            <Subtitle>{t("advertiserSignUpSubtitle")}</Subtitle>
          ) : null}

          {step === "phone" ? (
            <>
              <Label>{t("fieldPhone")}</Label>
              <Input
                value={phone}
                onChangeText={setPhone}
                placeholder={t("fieldPhonePlaceholder")}
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                maxLength={10}
                autoCapitalize="none"
              />

              <SubmitButton onPress={handleSendCode} disabled={isSendingCode}>
                {isSendingCode ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <SubmitLabel>{t("otpSendCodeButton")}</SubmitLabel>
                )}
              </SubmitButton>

              <FooterRow>
                <FooterText>{t("alreadyHaveAccount")} </FooterText>
                <Pressable
                  onPress={() => navigation.navigate("AdvertiseLogin")}
                >
                  <FooterLink>{t("goToLogin")}</FooterLink>
                </Pressable>
              </FooterRow>
            </>
          ) : null}

          {step === "otp" ? (
            <>
              <Subtitle>
                {t("otpSubtitle", { phone: normalizePhone(phone) })}
              </Subtitle>

              <Label>{t("otpFieldCode")}</Label>
              <Input
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder={t("otpFieldCodePlaceholder")}
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
              />

              <SubmitButton
                onPress={handleVerifyCode}
                disabled={isVerifyingCode}
              >
                {isVerifyingCode ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <SubmitLabel>{t("otpVerifyButton")}</SubmitLabel>
                )}
              </SubmitButton>

              <FooterRow>
                <Pressable
                  onPress={handleSendCode}
                  disabled={resendCooldown > 0}
                >
                  <FooterLink style={{ opacity: resendCooldown > 0 ? 0.5 : 1 }}>
                    {resendCooldown > 0
                      ? t("otpResendCountdown", { seconds: resendCooldown })
                      : t("otpResendButton")}
                  </FooterLink>
                </Pressable>
              </FooterRow>

              <FooterRow>
                <Pressable onPress={handleChangeNumber}>
                  <FooterLink>{t("otpChangeNumberLink")}</FooterLink>
                </Pressable>
              </FooterRow>
            </>
          ) : null}

          {step === "details" ? (
            <>
              <Label>{t("fieldBusinessName")}</Label>
              <Input
                value={businessName}
                onChangeText={setBusinessName}
                placeholder={t("fieldBusinessNamePlaceholder")}
                placeholderTextColor={colors.textMuted}
              />

              <Label>{t("fieldPassword")}</Label>
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder={t("fieldPasswordPlaceholder")}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
              />

              <Label>{t("fieldConfirmPassword")}</Label>
              <Input
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={t("fieldConfirmPasswordPlaceholder")}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
              />

              <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <SubmitLabel>{t("advertiserSignUpButton")}</SubmitLabel>
                )}
              </SubmitButton>
            </>
          ) : null}
        </Content>
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

const Title = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
`;

const Subtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
  margin-bottom: ${spacing.lg}px;
`;

const Label = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.xs}px;
  margin-top: ${spacing.md}px;
`;

const Input = styled.TextInput`
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  ${type.body}
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

const FooterText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
`;

const FooterLink = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.primary};
`;
