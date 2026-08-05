import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { isValidPhone, normalizePhone, mapAuthErrorToKey } from "../auth/phoneAuth";
import { sendOtp, confirmOtp, mapPhoneAuthErrorToKey } from "../auth/phoneVerification";
import { LanguageSwitch } from "../components/LanguageSwitch";

const RESEND_COOLDOWN_SECONDS = 60;

export function SignUpScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { signUp } = useAuth();

  const [step, setStep] = useState("phone");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmation, setConfirmation] = useState(null);
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
      Alert.alert(t("signUpTitle"), t("errorInvalidPhone"));
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
      Alert.alert(t("signUpTitle"), t(mapPhoneAuthErrorToKey(error)));
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
      await confirmOtp(confirmation, otpCode.trim());
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
    if (!fullName.trim() || !password || !confirmPassword) {
      Alert.alert(t("signUpTitle"), t("errorRequiredFields"));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t("signUpTitle"), t("errorWeakPassword"));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t("signUpTitle"), t("errorPasswordMismatch"));
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp({ fullName: fullName.trim(), phone, password });
    } catch (error) {
      Alert.alert(t("signUpTitle"), t(mapAuthErrorToKey(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerTitle = step === "otp" ? t("otpTitle") : t("signUpTitle");

  return (
    <Flex behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Container>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScreenBody contentContainerStyle={{ flexGrow: 1 }}>
            <TopSection>
              <TopBar>
                <LanguageSwitch />
              </TopBar>

              <HeroImage
                source={require("../../assets/taxi-moto.jpg")}
                resizeMode="cover"
              />

              <HeaderTitle>{headerTitle}</HeaderTitle>
            </TopSection>

            <Content>
              {step === "phone" ? (
                <>
                  <Label>{t("fieldPhone")}</Label>
                  <InputRow>
                    <Ionicons name="call-outline" size={20} color={colors.textMuted} />
                    <Input
                      value={phone}
                      onChangeText={setPhone}
                      placeholder={t("fieldPhonePlaceholder")}
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
                      <SubmitLabel>{t("otpSendCodeButton")}</SubmitLabel>
                    )}
                  </SubmitButton>

                  <FooterRow>
                    <FooterText>{t("alreadyHaveAccount")} </FooterText>
                    <Pressable onPress={() => navigation.replace("SellLogin")}>
                      <FooterLink>{t("goToLogin")}</FooterLink>
                    </Pressable>
                  </FooterRow>
                </>
              ) : null}

              {step === "otp" ? (
                <>
                  <OtpSubtitle>{t("otpSubtitle", { phone: normalizePhone(phone) })}</OtpSubtitle>

                  <Label>{t("otpFieldCode")}</Label>
                  <InputRow>
                    <Ionicons name="keypad-outline" size={20} color={colors.textMuted} />
                    <Input
                      value={otpCode}
                      onChangeText={setOtpCode}
                      placeholder={t("otpFieldCodePlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </InputRow>

                  <SubmitButton onPress={handleVerifyCode} disabled={isVerifyingCode}>
                    {isVerifyingCode ? (
                      <ActivityIndicator color={colors.textInverse} />
                    ) : (
                      <SubmitLabel>{t("otpVerifyButton")}</SubmitLabel>
                    )}
                  </SubmitButton>

                  <FooterRow>
                    <Pressable onPress={handleSendCode} disabled={resendCooldown > 0}>
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
                  <Label>{t("fieldFullName")}</Label>
                  <InputRow>
                    <Ionicons name="person-outline" size={20} color={colors.textMuted} />
                    <Input
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder={t("fieldFullNamePlaceholder")}
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>

                  <Label>{t("fieldPassword")}</Label>
                  <InputRow>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
                    <Input
                      value={password}
                      onChangeText={setPassword}
                      placeholder={t("fieldPasswordPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={colors.textMuted}
                      />
                    </Pressable>
                  </InputRow>

                  <Label>{t("fieldConfirmPassword")}</Label>
                  <InputRow>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
                    <Input
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder={t("fieldConfirmPasswordPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                    />
                    <Pressable
                      onPress={() => setShowConfirmPassword((prev) => !prev)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={colors.textMuted}
                      />
                    </Pressable>
                  </InputRow>

                  <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <ActivityIndicator color={colors.textInverse} />
                    ) : (
                      <SubmitLabel>{t("signUpButton")}</SubmitLabel>
                    )}
                  </SubmitButton>
                </>
              ) : null}
            </Content>
          </ScreenBody>
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

const ScreenBody = styled.ScrollView.attrs(() => ({
  keyboardShouldPersistTaps: "handled",
}))`
  flex: 1;
`;

const TopSection = styled.View`
  padding-horizontal: ${spacing.lg}px;
  padding-top: ${spacing.xl}px;
`;

const TopBar = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  margin-bottom: ${spacing.sm}px;
`;

const HeroImage = styled.Image`
  width: 100%;
  height: 360px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.lg}px;
`;

const HeaderTitle = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
  text-align: center;
`;

const Content = styled.View`
  padding-horizontal: ${spacing.lg}px;
  padding-top: ${spacing.md}px;
  padding-bottom: ${spacing.xl}px;
`;

const OtpSubtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.sm}px;
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
  ${shadow.card}
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
