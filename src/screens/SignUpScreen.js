import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  TouchableWithoutFeedback,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import styled, { css } from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useCountries } from "../hooks/useCountries";
import { POSTING_COUNTRY } from "../data/countries";
import { CountryPickerSheet } from "../components/CountryPickerSheet";
import { useAuth } from "../auth/AuthContext";
import { isPossibleNationalNumber, mapAuthErrorToKey } from "../auth/phoneAuth";
import {
  sendOtp,
  confirmOtp,
  mapPhoneAuthErrorToKey,
} from "../auth/phoneVerification";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { closeAccountGate } from "../utils/openAccountGate";
import { cities } from "../data/cities";
import {
  companySectors,
  getCompanySectorLabel,
  sectorTint,
} from "../data/companySectors";

const RESEND_COOLDOWN_SECONDS = 60;

const EMERALD = "#0B6E4F";
const FLAG_GREEN = "#008751";
const FLAG_YELLOW = "#FCD116";
const FLAG_RED = "#E8112D";

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

// The mockup only shows step 1's progress state explicitly, but the flow
// genuinely has 3 steps (phone → otp → account details) — carrying the
// same progress bar across all of them, not just the first, is the
// faithful reading of "step 1 of 3" rather than a fixed decoration. A
// company account has two extra steps (legal identifiers, then documents,
// then the representative) in place of the single "details" step.
const STEP_NUMBER_INDIVIDUAL = { phone: 1, otp: 2, details: 3 };
const TOTAL_STEPS_INDIVIDUAL = 3;
// Phone verification is a shared prerequisite, not folded into a single
// continuous counter — once a company account clears it, the wizard moves
// into its own restarted 3-step progress (legal → documents →
// representative) rather than showing "step 4 of 5".
const STEP_NUMBER_COMPANY_DETAIL = {
  companyLegal: 1,
  companyDocs: 2,
  companyRep: 3,
};
const TOTAL_STEPS_COMPANY_DETAIL = 3;
const COMPANY_DETAIL_STEPS = ["companyLegal", "companyDocs", "companyRep"];
const COMPANY_STEP_TITLE_KEYS = {
  companyLegal: "companyLegalTitle",
  companyDocs: "companyDocsTitle",
  companyRep: "companyRepTitle",
};
const COMPANY_STEP_COPY_KEYS = {
  companyLegal: "companyLegalCopy",
  companyDocs: "companyDocsCopy",
  companyRep: "companyRepCopy",
};

// Mirrors the format APIEx actually issues: RB/<3-letter town code>/<2-digit
// year> <B|A|G|...> <4-6 digit sequence>. Client-side, this only catches
// obviously malformed input before it's submitted — it's not what makes the
// account trustworthy; the manual review of the uploaded extract is.
const RCCM_PATTERN = /^RB\/[A-Z]{3}\/\d{2}\s?[A-Z]\s?\d{4,6}$/i;
const IFU_PATTERN = /^\d{13}$/;

// Dial codes are public, well-known ISO calling codes — not app-specific
// data. Actual validity of the number is enforced by Firebase's OTP send
// (auth/invalid-phone-number), so the client-side check here only needs to
// be a reasonable length guard, not a per-country format authority.
export function SignUpScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { signUp, signUpCompany } = useAuth();
  const countries = useCountries();

  const insets = useSafeAreaInsets();
  // The floor matters on iOS, where this screen was reading a top inset of
  // roughly nothing: 56 clears the notch/Dynamic Island on every current
  // iPhone, and is ignored on any device that reports a real inset.
  const topInset = Math.max(insets.top, Platform.OS === "ios" ? 56 : 8);
  const isCompany = route.params?.accountType === "company";
  // Which stack this copy lives in — see openAccountGate.
  const signUpRoute = route.params?.signUpRoute ?? "SellSignUp";
  const loginRoute = route.params?.loginRoute ?? "SellLogin";
  const originKey = route.params?.originKey ?? null;
  const forgotRoute = route.params?.forgotRoute ?? "ForgotPassword";

  // Both screens rely on AuthContext flipping `user` and SellStack swapping
  // its routes — which never happens to the root-stack copies, so they
  // would sit on a filled-in form after a successful signup. Navigating by
  // the origin route's key pops straight back to whatever needed the
  // account, however deep the auth flow went.
  const { user: authedUser } = useAuth();
  useEffect(() => {
    if (authedUser && originKey) navigation.navigate({ key: originKey });
  }, [authedUser, originKey, navigation]);

  // A company registers its business first and its sign-in credentials
  // last: the legal identifiers are the point of the account, so the flow
  // opens on them rather than making a business owner type a phone number
  // through two screens that are indistinguishable from an individual's.
  // Phone + password live in the representative step, and the SMS code is
  // the final gate before the account is actually created.
  const [step, setStep] = useState(isCompany ? "companyLegal" : "phone");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneIdToken, setPhoneIdToken] = useState(null);
  const [countryCode, setCountryCode] = useState(POSTING_COUNTRY);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
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
  // Set when a company submission fails *after* its SMS code was accepted.
  // The number is verified at that point, so the retry must not cost the
  // user another code — the OTP screen turns into a plain retry instead.
  const [companySubmitFailed, setCompanySubmitFailed] = useState(false);
  // Optional, and asked for here rather than left to the dashboard: a
  // company that has just filed its RCCM should not have to go hunting for
  // where to add a logo, and without one its card in the verified strip is
  // two grey initials.
  const [logoAsset, setLogoAsset] = useState(null);

  // Company-only fields.
  const [companyName, setCompanyName] = useState("");
  const [rccm, setRccm] = useState("");
  const [ifu, setIfu] = useState("");
  const [sectorIdx, setSectorIdx] = useState(null);
  const [companyCity, setCompanyCity] = useState(null);
  const [sectorSheetOpen, setSectorSheetOpen] = useState(false);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [rccmDoc, setRccmDoc] = useState(null);
  const [ifuDoc, setIfuDoc] = useState(null);
  const [repName, setRepName] = useState("");
  const [repRole, setRepRole] = useState("");
  const [repIdDoc, setRepIdDoc] = useState(null);
  const [consent, setConsent] = useState(false);

  const selectedSector = sectorIdx === null ? null : companySectors[sectorIdx];

  const rccmValid = RCCM_PATTERN.test(rccm.trim());
  const ifuValid = IFU_PATTERN.test(ifu.replace(/\s/g, ""));
  const companyLegalValid =
    companyName.trim().length > 1 &&
    rccmValid &&
    ifuValid &&
    sectorIdx !== null &&
    !!companyCity;

  const pickVerificationDoc = async (setter) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (asset) setter(asset);
    } catch {
      Alert.alert(t("signUpTitle"), t("companyDocPickError"));
    }
  };

  const country =
    countries.find((item) => item.code === countryCode) ?? countries[0];
  const phoneDigits = phone.replace(/\D/g, "");
  // Checked against the chosen country's real length rather than a blanket
  // eight digits, so a dropped digit is caught here instead of coming back
  // from Firebase as an error code.
  const isPhoneValid = isPossibleNationalNumber(phoneDigits, country.code);
  const showPhoneError =
    phoneTouched && phoneDigits.length > 0 && !isPhoneValid;
  // Built from the selected country's own dial code rather than
  // phoneAuth.js's hardcoded +229 default — this is what lets sign-up
  // support every listed country instead of just Bénin.
  const fullPhone = `${country.dial}${phoneDigits}`;

  const isCompanyDetailStep = isCompany && COMPANY_DETAIL_STEPS.includes(step);
  // The SMS gate sits after the company wizard's last numbered step, so it
  // keeps the "3 of 3" label and simply fills the bar rather than inventing
  // a fourth step the user was never promised.
  const isCompanyOtp = isCompany && step === "otp";
  const progressCurrent = isCompanyDetailStep
    ? STEP_NUMBER_COMPANY_DETAIL[step]
    : isCompanyOtp
      ? TOTAL_STEPS_COMPANY_DETAIL
      : STEP_NUMBER_INDIVIDUAL[step];
  const progressTotal =
    isCompanyDetailStep || isCompanyOtp
      ? TOTAL_STEPS_COMPANY_DETAIL
      : TOTAL_STEPS_INDIVIDUAL;
  // Within the wizard the bar is scaled over four segments — the fourth is
  // the SMS gate — so finishing the representative step leaves the track
  // visibly short of full rather than claiming the account already exists.
  const progressPercent = isCompanyDetailStep
    ? (progressCurrent / (TOTAL_STEPS_COMPANY_DETAIL + 1)) * 100
    : (progressCurrent / progressTotal) * 100;

  // Submitting a company account uploads three documents before the
  // profile write lands, so it is long enough to deserve its own screen
  // rather than a spinner inside the button.
  const showCompanyChecking = isCompany && isSubmitting;

  // Inside the company wizard the back arrow walks the steps rather than
  // dropping the whole flow — only step 1 exits to the account-type screen.
  const handleBack = () => {
    if (isCompanyOtp) {
      setStep("companyRep");
      setCompanySubmitFailed(false);
      setConfirmation(null);
      setOtpCode("");
      setResendCooldown(0);
      return;
    }
    const detailIdx = COMPANY_DETAIL_STEPS.indexOf(step);
    if (isCompany && detailIdx > 0) {
      setStep(COMPANY_DETAIL_STEPS[detailIdx - 1]);
      return;
    }
    // Shared with the other two auth screens so all three agree and none
    // can dead-end — see closeAccountGate.
    closeAccountGate(navigation, originKey);
  };

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSendCode = async () => {
    setPhoneTouched(true);
    if (!isPhoneValid) {
      Alert.alert(t("signUpTitle"), t("errorInvalidPhone"));
      return;
    }

    setIsSendingCode(true);
    try {
      const nextConfirmation = await sendOtp(fullPhone);
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
      // Kept, not discarded. This token is the only proof that an SMS
      // reached this handset, and the account cannot be allowed to publish
      // without presenting it — see claimPostingRight.
      const idToken = await confirmOtp(confirmation, otpCode.trim());
      setPhoneIdToken(idToken);
      // For a company the code is the last thing standing between a
      // completed file and the account, so verifying it submits — there is
      // no further screen to send them to.
      if (isCompany) {
        setIsVerifyingCode(false);
        // Passed directly: setPhoneIdToken above has not been applied to
        // this render yet, and the company path submits immediately.
        await handleCompanySubmit(idToken);
        return;
      }
      setStep("details");
    } catch (error) {
      Alert.alert(t("otpTitle"), t(mapPhoneAuthErrorToKey(error)));
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleChangeNumber = () => {
    setStep(isCompany ? "companyRep" : "phone");
    setCompanySubmitFailed(false);
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
      // The verification token travels with the sign-up. If the server
      // cannot be told which number was verified, the whole sign-up is
      // rolled back rather than leaving an account nobody could publish
      // from and nobody could explain.
      await signUp({
        fullName: fullName.trim(),
        phone: fullPhone,
        password,
        phoneIdToken,
      });
    } catch (error) {
      Alert.alert(t("signUpTitle"), t(mapAuthErrorToKey(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const pickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        // No forced crop: a wide logo squared off at pick time loses its
        // sides permanently. Kept whole and fitted with `contain` on display.
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (asset) setLogoAsset(asset);
    } catch {
      Alert.alert(t("signUpTitle"), t("companyDocPickError"));
    }
  };

  const companyRepValid =
    repName.trim().length > 1 &&
    repRole.trim().length > 0 &&
    isPhoneValid &&
    !!repIdDoc &&
    consent &&
    password.length >= 6 &&
    password === confirmPassword;

  // One dock button drives all three company steps, so its enabled state
  // is the current step's own completeness rather than a per-screen check
  // — the mockup greys the CTA out until the step is done instead of
  // letting it be pressed into an error alert.
  const companyStepValid =
    step === "companyLegal"
      ? companyLegalValid
      : step === "companyDocs"
        ? !!rccmDoc && !!ifuDoc
        : companyRepValid && !isSubmitting && !isSendingCode;

  // Takes the token explicitly on the first attempt, because the state
  // setter has not been applied to the render that calls it. On the retry
  // path there is no argument, and the stored one is by then correct.
  const handleCompanySubmit = async (verifiedToken) => {
    if (!repName.trim() || !repRole.trim() || !repIdDoc) {
      Alert.alert(t("signUpTitle"), t("errorRequiredFields"));
      return;
    }
    if (!consent) {
      Alert.alert(t("signUpTitle"), t("companyConsentRequired"));
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
      await signUpCompany({
        fullName: repName.trim(),
        phone: fullPhone,
        password,
        companyName: companyName.trim(),
        rccm: rccm.trim().toUpperCase(),
        ifu: ifu.replace(/\s/g, ""),
        // The key, not its label — see companySectors.js.
        sector: companySectors[sectorIdx].key,
        companyCity,
        rccmDoc,
        ifuDoc,
        repName: repName.trim(),
        repRole: repRole.trim(),
        repIdDoc,
        logoAsset,
        phoneIdToken: verifiedToken ?? phoneIdToken,
      });
    } catch (error) {
      if (error?.code !== "auth/email-already-in-use") {
        Alert.alert(t("signUpTitle"), t(mapAuthErrorToKey(error)));
      }
      // A number already registered can't be retried as-is. Anything else —
      // a dropped upload, a failed profile write — is worth retrying against
      // the code they already burned, so hold position and offer that.
      if (error?.code === "auth/email-already-in-use") {
        // This number already has an account. Sending them back to re-enter
        // it is the one thing that cannot help: the number is not the
        // mistake, and retyping it produces the same error. Say what
        // happened and offer the door that actually opens.
        setCompanySubmitFailed(false);
        setConfirmation(null);
        setOtpCode("");
        setResendCooldown(0);
        setStep("companyRep");
        Alert.alert(t("signUpTitle"), t("companyNumberAlreadyUsed"), [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("companyGoToLogin"),
            onPress: () =>
              navigation.navigate(loginRoute, {
                accountType: "company",
                originKey,
                signUpRoute,
                loginRoute,
                forgotRoute,
              }),
          },
        ]);
      } else {
        setCompanySubmitFailed(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompanyStepNext = () => {
    if (step === "companyLegal") {
      setStep("companyDocs");
      return;
    }
    if (step === "companyDocs") {
      setStep("companyRep");
      return;
    }
    // Nothing is uploaded or created yet — the representative still has to
    // prove they hold the number the account will sign in with.
    handleSendCode();
  };

  // The dock is the company wizard's one action, carried through the SMS
  // gate so that screen doesn't fall back to the individual flow's button.
  // On the code screen it has two faces: verify, or — once a code has
  // already been spent on a submission that failed downstream — retry that
  // submission without asking for a new one.
  const companyDock = isCompanyOtp
    ? companySubmitFailed
      ? {
          label: t("companyRetryButton"),
          trust: t("companyRetryTrustText"),
          onPress: () => handleCompanySubmit(),
          enabled: !isSubmitting,
          busy: isSubmitting,
        }
      : {
          label: t("otpVerifyButton"),
          trust: t("companyOtpTrustText"),
          onPress: handleVerifyCode,
          enabled: !isVerifyingCode && !isSubmitting,
          busy: isVerifyingCode,
        }
    : {
        label: isSendingCode
          ? t("signUpSendingCode")
          : step === "companyRep"
            ? t("companySubmitButton")
            : t("companyContinueButton"),
        trust:
          step === "companyRep"
            ? t("companyRepTrustText")
            : t("companyLegalTrustText"),
        onPress: handleCompanyStepNext,
        enabled: companyStepValid,
        busy: isSendingCode,
      };

  // Documents are already uploading by this point, so the whole screen —
  // including the back arrow — is taken away rather than left as a form
  // that looks editable but isn't.
  if (showCompanyChecking) {
    return (
      <Container edges={["left", "right", "bottom"]}>
        <HeaderRow topInset={topInset}>
          <HeaderSpacer />
          <LanguageSwitch />
        </HeaderRow>
        <CheckingWrap>
          <ActivityIndicator size="large" color={EMERALD} />
          <CheckingTitle>{t("companyVerifyingTitle")}</CheckingTitle>
          <CheckingCopy>{t("companyVerifyingCopy")}</CheckingCopy>
        </CheckingWrap>
      </Container>
    );
  }

  return (
    <Flex behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Container edges={["left", "right", "bottom"]}>
        <HeaderRow topInset={topInset}>
          <BackButton onPress={handleBack} hitSlop={12}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </BackButton>
          <LanguageSwitch />
        </HeaderRow>

        <ProgressWrap>
          <ProgressTrack>
            <ProgressFill
              colors={[FLAG_GREEN, FLAG_YELLOW, FLAG_RED]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: `${progressPercent}%` }}
            />
          </ProgressTrack>
          <ProgressLabel>
            {t("signUpStepProgress", {
              step: progressCurrent,
              total: progressTotal,
            })}
          </ProgressLabel>
        </ProgressWrap>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScreenBody contentContainerStyle={{ flexGrow: 1 }}>
            {step === "phone" ? (
              <>
                {/* Individual accounts only. A company opens on its legal
                    identifiers and collects the phone number in the
                    representative step, so it never lands here. */}
                <Content>
                  <Eyebrow>{t("signUpEyebrow")}</Eyebrow>
                  <Headline>{t("signUpPhoneHeadline")}</Headline>
                  <HeadlineCopy>{t("signUpPhoneCopy")}</HeadlineCopy>

                  <SecureRow>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={14}
                      color={EMERALD}
                    />
                    <SecureText>{t("signUpSecureConnection")}</SecureText>
                  </SecureRow>

                  <Label>{t("fieldPhone")}</Label>
                  <PhoneFieldRow valid={isPhoneValid} error={showPhoneError}>
                    <CountrySelect
                      onPress={() => setCountrySheetOpen(true)}
                      hitSlop={8}
                    >
                      <FlagEmoji>{country.flag}</FlagEmoji>
                      <DialCodeText>{country.dial}</DialCodeText>
                      <Ionicons
                        name="chevron-down"
                        size={12}
                        color={colors.textMuted}
                      />
                    </CountrySelect>
                    <FieldDivider />
                    <PhoneInput
                      value={phone}
                      onChangeText={(text) => {
                        setPhone(text);
                        setPhoneTouched(true);
                      }}
                      onBlur={() => setPhoneTouched(true)}
                      placeholder={t("fieldPhonePlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="phone-pad"
                      maxLength={10}
                    />
                    {isPhoneValid ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={colors.primary}
                      />
                    ) : null}
                  </PhoneFieldRow>
                  {showPhoneError ? (
                    <ErrorText>{t("errorInvalidPhone")}</ErrorText>
                  ) : null}
                </Content>

                <CtaDock>
                  <SubmitButton
                    onPress={handleSendCode}
                    disabled={isSendingCode}
                  >
                    {isSendingCode ? (
                      <SubmitRow>
                        <ActivityIndicator color={colors.textInverse} />
                        <SubmitLabel>{t("signUpSendingCode")}</SubmitLabel>
                      </SubmitRow>
                    ) : (
                      <SubmitLabel>{t("signUpReceiveCodeButton")}</SubmitLabel>
                    )}
                  </SubmitButton>

                  <TrustRow>
                    <Ionicons
                      name="lock-closed-outline"
                      size={13}
                      color={colors.textMuted}
                    />
                    <TrustText>{t("signUpPhoneTrustText")}</TrustText>
                  </TrustRow>

                  <FooterRow>
                    <FooterText>{t("alreadyHaveAccount")} </FooterText>
                    <Pressable
                      onPress={() =>
                        navigation.navigate(loginRoute, {
                          originKey,
                          signUpRoute,
                          loginRoute,
                          forgotRoute,
                        })
                      }
                    >
                      <FooterLink>{t("goToLogin")}</FooterLink>
                    </Pressable>
                  </FooterRow>
                </CtaDock>
              </>
            ) : null}

            {step === "otp" ? (
              <Content>
                {isCompany ? (
                  <>
                    <FlagEyebrowRow>
                      <BeninFlag />
                      <FlagEyebrowLabel>
                        {t("companySignUpEyebrow")}
                      </FlagEyebrowLabel>
                    </FlagEyebrowRow>
                    <CompanyHeadline>{t("otpTitle")}</CompanyHeadline>
                    <CompanyCopy>
                      {t("otpSubtitle", { phone: fullPhone })}
                    </CompanyCopy>

                    {companySubmitFailed ? (
                      <RetryNotice>
                        <Ionicons
                          name="alert-circle-outline"
                          size={18}
                          color={colors.error}
                        />
                        <RetryNoticeText>
                          {t("companyRetryNotice")}
                        </RetryNoticeText>
                      </RetryNotice>
                    ) : (
                      <FieldGroup>
                        <FieldLabel>{t("otpFieldCode")}</FieldLabel>
                        <CompanyInput
                          value={otpCode}
                          onChangeText={setOtpCode}
                          placeholder={t("otpFieldCodePlaceholder")}
                          placeholderTextColor={colors.textMuted}
                          keyboardType="number-pad"
                          maxLength={6}
                        />
                      </FieldGroup>
                    )}
                  </>
                ) : (
                  <>
                    <HeaderTitle>{t("otpTitle")}</HeaderTitle>
                    <OtpSubtitle>
                      {t("otpSubtitle", { phone: fullPhone })}
                    </OtpSubtitle>

                    <Label>{t("otpFieldCode")}</Label>
                    <InputRow>
                      <Ionicons
                        name="keypad-outline"
                        size={20}
                        color={colors.textMuted}
                      />
                      <Input
                        value={otpCode}
                        onChangeText={setOtpCode}
                        placeholder={t("otpFieldCodePlaceholder")}
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                    </InputRow>
                  </>
                )}

                {/* A company verifies from the docked CTA; only the
                    individual flow keeps its inline button. */}
                {isCompany ? null : (
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
                )}

                {/* Resending is pointless once the code has been accepted —
                    what failed was the submission after it. */}
                {companySubmitFailed ? null : (
                  <FooterRow>
                    <Pressable
                      onPress={handleSendCode}
                      disabled={resendCooldown > 0}
                    >
                      <FooterLink
                        style={{ opacity: resendCooldown > 0 ? 0.5 : 1 }}
                      >
                        {resendCooldown > 0
                          ? t("otpResendCountdown", { seconds: resendCooldown })
                          : t("otpResendButton")}
                      </FooterLink>
                    </Pressable>
                  </FooterRow>
                )}

                <FooterRow>
                  <Pressable onPress={handleChangeNumber}>
                    <FooterLink>{t("otpChangeNumberLink")}</FooterLink>
                  </Pressable>
                </FooterRow>
              </Content>
            ) : null}

            {step === "details" ? (
              <Content>
                <HeaderTitle>{t("signUpTitle")}</HeaderTitle>

                <Label>{t("fieldFullName")}</Label>
                <InputRow>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.textMuted}
                  />
                  <Input
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder={t("fieldFullNamePlaceholder")}
                    placeholderTextColor={colors.textMuted}
                  />
                </InputRow>

                <Label>{t("fieldPassword")}</Label>
                <InputRow>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={colors.textMuted}
                  />
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t("fieldPasswordPlaceholder")}
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </InputRow>

                <Label>{t("fieldConfirmPassword")}</Label>
                <InputRow>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={colors.textMuted}
                  />
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
                      name={
                        showConfirmPassword ? "eye-off-outline" : "eye-outline"
                      }
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
              </Content>
            ) : null}

            {isCompanyDetailStep ? (
              <Content>
                <FlagEyebrowRow>
                  <BeninFlag />
                  <FlagEyebrowLabel>
                    {t("companySignUpEyebrow")}
                  </FlagEyebrowLabel>
                </FlagEyebrowRow>
                <CompanyHeadline>
                  {t(COMPANY_STEP_TITLE_KEYS[step])}
                </CompanyHeadline>
                <CompanyCopy>{t(COMPANY_STEP_COPY_KEYS[step])}</CompanyCopy>

                {step === "companyLegal" ? (
                  <>
                    {/* Optional and first: a logo is the one thing that
                        makes the verified card look like a real business
                        rather than two grey initials. */}
                    <LogoRow onPress={pickLogo}>
                      {logoAsset ? (
                        <LogoPreview
                          source={{ uri: logoAsset.uri }}
                          resizeMode="cover"
                        />
                      ) : (
                        <LogoPlaceholder>
                          <Ionicons
                            name="image-outline"
                            size={22}
                            color={colors.primary}
                          />
                        </LogoPlaceholder>
                      )}
                      <LogoTextCol>
                        <LogoTitle>{t("companyFieldLogo")}</LogoTitle>
                        <LogoHint>
                          {logoAsset
                            ? t("companyLogoChange")
                            : t("companyFieldLogoHint")}
                        </LogoHint>
                      </LogoTextCol>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.textMuted}
                      />
                    </LogoRow>

                    <FieldGroup>
                      <FieldLabel>{t("companyFieldName")}</FieldLabel>
                      <CompanyInput
                        value={companyName}
                        onChangeText={setCompanyName}
                        placeholder={t("companyFieldNamePlaceholder")}
                        placeholderTextColor={colors.textMuted}
                      />
                    </FieldGroup>

                    <FieldGroup>
                      <FieldLabel>{t("companyFieldRccm")}</FieldLabel>
                      <CompanyInput
                        value={rccm}
                        onChangeText={setRccm}
                        placeholder="RB/COT/24 B 12345"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="characters"
                        valid={rccmValid}
                      />
                      <FieldHint>{t("companyFieldRccmHint")}</FieldHint>
                    </FieldGroup>

                    <FieldGroup>
                      <FieldLabel>{t("companyFieldIfu")}</FieldLabel>
                      <CompanyInput
                        value={ifu}
                        onChangeText={setIfu}
                        placeholder={t("companyFieldIfuPlaceholder")}
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={13}
                        valid={ifuValid}
                      />
                      <FieldHint>{t("companyFieldIfuHint")}</FieldHint>
                    </FieldGroup>

                    <FieldGroup>
                      <FieldLabel>{t("companyFieldSector")}</FieldLabel>
                      <CompanySelector onPress={() => setSectorSheetOpen(true)}>
                        {/* Carries the chosen sector's chip out of the sheet
                            and onto the closed field, so the choice stays
                            recognisable at a glance instead of collapsing
                            back into plain text. */}
                        {selectedSector ? (
                          <SectorIconWrap
                            small
                            tint={sectorTint(selectedSector.color, 0.12)}
                          >
                            <Ionicons
                              name={selectedSector.icon}
                              size={17}
                              color={selectedSector.color}
                            />
                          </SectorIconWrap>
                        ) : null}
                        <CompanySelectorText muted={sectorIdx === null}>
                          {sectorIdx === null
                            ? t("companyFieldSectorPlaceholder")
                            : getCompanySectorLabel(
                                selectedSector.key,
                                language,
                              )}
                        </CompanySelectorText>
                        <Ionicons
                          name="chevron-down"
                          size={16}
                          color={colors.textMuted}
                        />
                      </CompanySelector>
                    </FieldGroup>

                    <FieldGroup>
                      <FieldLabel>{t("companyFieldCity")}</FieldLabel>
                      <CompanySelector onPress={() => setCitySheetOpen(true)}>
                        <CompanySelectorText muted={!companyCity}>
                          {companyCity || t("companyFieldCityPlaceholder")}
                        </CompanySelectorText>
                        <Ionicons
                          name="chevron-down"
                          size={16}
                          color={colors.textMuted}
                        />
                      </CompanySelector>
                    </FieldGroup>
                  </>
                ) : null}

                {step === "companyDocs" ? (
                  <>
                    <DocRow
                      onPress={() => pickVerificationDoc(setRccmDoc)}
                      added={!!rccmDoc}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={20}
                        color={EMERALD}
                      />
                      <DocLabelCol>
                        <DocName>{t("companyDocRccmLabel")}</DocName>
                        <DocHint numberOfLines={1}>
                          {rccmDoc ? rccmDoc.name : t("companyDocRccmHint")}
                        </DocHint>
                      </DocLabelCol>
                      <DocBadge added={!!rccmDoc}>
                        <DocBadgeLabel added={!!rccmDoc}>
                          {rccmDoc
                            ? t("companyDocAdded")
                            : t("companyDocAttach")}
                        </DocBadgeLabel>
                      </DocBadge>
                    </DocRow>

                    <DocRow
                      onPress={() => pickVerificationDoc(setIfuDoc)}
                      added={!!ifuDoc}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={20}
                        color={EMERALD}
                      />
                      <DocLabelCol>
                        <DocName>{t("companyDocIfuLabel")}</DocName>
                        <DocHint numberOfLines={1}>
                          {ifuDoc ? ifuDoc.name : t("companyDocIfuHint")}
                        </DocHint>
                      </DocLabelCol>
                      <DocBadge added={!!ifuDoc}>
                        <DocBadgeLabel added={!!ifuDoc}>
                          {ifuDoc
                            ? t("companyDocAdded")
                            : t("companyDocAttach")}
                        </DocBadgeLabel>
                      </DocBadge>
                    </DocRow>

                    <FieldHint>{t("companyDocsPrivacyHint")}</FieldHint>
                  </>
                ) : null}

                {step === "companyRep" ? (
                  <>
                    <FieldGroup>
                      <FieldLabel>{t("companyFieldRepName")}</FieldLabel>
                      <CompanyInput
                        value={repName}
                        onChangeText={setRepName}
                        placeholder={t("companyFieldRepNamePlaceholder")}
                        placeholderTextColor={colors.textMuted}
                      />
                      <FieldHint>{t("companyFieldRepNameHint")}</FieldHint>
                    </FieldGroup>

                    <FieldGroup>
                      <FieldLabel>{t("companyFieldRepRole")}</FieldLabel>
                      <CompanyInput
                        value={repRole}
                        onChangeText={setRepRole}
                        placeholder={t("companyFieldRepRolePlaceholder")}
                        placeholderTextColor={colors.textMuted}
                      />
                    </FieldGroup>

                    <FieldGroup>
                      <FieldLabel>{t("fieldPhone")}</FieldLabel>
                      <CompanyInputRow
                        valid={isPhoneValid}
                        error={showPhoneError}
                      >
                        <CountrySelect
                          onPress={() => setCountrySheetOpen(true)}
                          hitSlop={8}
                        >
                          <FlagEmoji>{country.flag}</FlagEmoji>
                          <DialCodeText>{country.dial}</DialCodeText>
                          <Ionicons
                            name="chevron-down"
                            size={12}
                            color={colors.textMuted}
                          />
                        </CountrySelect>
                        <FieldDivider />
                        <CompanyInputFlex
                          value={phone}
                          onChangeText={(text) => {
                            setPhone(text);
                            setPhoneTouched(true);
                          }}
                          onBlur={() => setPhoneTouched(true)}
                          placeholder={t("fieldPhonePlaceholder")}
                          placeholderTextColor={colors.textMuted}
                          keyboardType="phone-pad"
                          maxLength={10}
                        />
                        {isPhoneValid ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={EMERALD}
                          />
                        ) : null}
                      </CompanyInputRow>
                      <FieldHint>{t("companyFieldRepPhoneHint")}</FieldHint>
                    </FieldGroup>

                    <FieldGroup>
                      <FieldLabel>{t("fieldPassword")}</FieldLabel>
                      <CompanyInputRow>
                        <CompanyInputFlex
                          value={password}
                          onChangeText={setPassword}
                          placeholder={t("fieldPasswordPlaceholder")}
                          placeholderTextColor={colors.textMuted}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                        />
                        <Pressable
                          onPress={() => setShowPassword((prev) => !prev)}
                          hitSlop={8}
                        >
                          <Ionicons
                            name={
                              showPassword ? "eye-off-outline" : "eye-outline"
                            }
                            size={20}
                            color={colors.textMuted}
                          />
                        </Pressable>
                      </CompanyInputRow>
                    </FieldGroup>

                    <FieldGroup>
                      <FieldLabel>{t("fieldConfirmPassword")}</FieldLabel>
                      <CompanyInputRow>
                        <CompanyInputFlex
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          placeholder={t("fieldConfirmPasswordPlaceholder")}
                          placeholderTextColor={colors.textMuted}
                          secureTextEntry={!showConfirmPassword}
                          autoCapitalize="none"
                        />
                        <Pressable
                          onPress={() =>
                            setShowConfirmPassword((prev) => !prev)
                          }
                          hitSlop={8}
                        >
                          <Ionicons
                            name={
                              showConfirmPassword
                                ? "eye-off-outline"
                                : "eye-outline"
                            }
                            size={20}
                            color={colors.textMuted}
                          />
                        </Pressable>
                      </CompanyInputRow>
                    </FieldGroup>

                    <DocRow
                      onPress={() => pickVerificationDoc(setRepIdDoc)}
                      added={!!repIdDoc}
                    >
                      <Ionicons name="card-outline" size={20} color={EMERALD} />
                      <DocLabelCol>
                        <DocName>{t("companyDocRepIdLabel")}</DocName>
                        <DocHint numberOfLines={1}>
                          {repIdDoc ? repIdDoc.name : t("companyDocRepIdHint")}
                        </DocHint>
                      </DocLabelCol>
                      <DocBadge added={!!repIdDoc}>
                        <DocBadgeLabel added={!!repIdDoc}>
                          {repIdDoc
                            ? t("companyDocAdded")
                            : t("companyDocAttach")}
                        </DocBadgeLabel>
                      </DocBadge>
                    </DocRow>

                    <ConsentRow onPress={() => setConsent((prev) => !prev)}>
                      <ConsentBox checked={consent}>
                        {consent ? (
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color="#ffffff"
                          />
                        ) : null}
                      </ConsentBox>
                      <ConsentText>{t("companyConsentText")}</ConsentText>
                    </ConsentRow>
                  </>
                ) : null}
              </Content>
            ) : null}
          </ScreenBody>
        </TouchableWithoutFeedback>

        {isCompanyDetailStep || isCompanyOtp ? (
          <CompanyDock>
            <CompanyCta
              onPress={companyDock.onPress}
              disabled={!companyDock.enabled}
            >
              {companyDock.busy ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <CompanyCtaLabel>{companyDock.label}</CompanyCtaLabel>
              )}
            </CompanyCta>
            <CompanyTrustRow>
              <Ionicons
                name="lock-closed-outline"
                size={13}
                color={colors.textMuted}
              />
              <CompanyTrustText>{companyDock.trust}</CompanyTrustText>
            </CompanyTrustRow>
          </CompanyDock>
        ) : null}
      </Container>

      <CountryPickerSheet
        visible={countrySheetOpen}
        selectedCode={countryCode}
        onSelect={setCountryCode}
        onClose={() => setCountrySheetOpen(false)}
      />

      <Modal
        visible={sectorSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSectorSheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setSectorSheetOpen(false)}>
          <CountrySheet
            onStartShouldSetResponder={() => true}
            style={{ maxHeight: "70%" }}
          >
            <SheetHandle />
            <SheetTitle>{t("companyFieldSector")}</SheetTitle>
            {/* Scrolls for the same reason the city sheet does — the list is
                well past what fits in a bottom sheet, and options below the
                fold may as well not exist. */}
            <CitySheetScroll showsVerticalScrollIndicator={false}>
              {companySectors.map((sector, index) => {
                const selected = index === sectorIdx;
                return (
                  <SectorRow
                    key={sector.key}
                    selected={selected}
                    tint={sectorTint(sector.color, 0.09)}
                    onPress={() => {
                      setSectorIdx(index);
                      setSectorSheetOpen(false);
                    }}
                  >
                    <SectorIconWrap
                      tint={sectorTint(sector.color, selected ? 0.2 : 0.12)}
                    >
                      <Ionicons
                        name={sector.icon}
                        size={20}
                        color={sector.color}
                      />
                    </SectorIconWrap>
                    <SectorLabel selected={selected}>
                      {getCompanySectorLabel(sector.key, language)}
                    </SectorLabel>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color={sector.color}
                      />
                    ) : null}
                  </SectorRow>
                );
              })}
            </CitySheetScroll>
          </CountrySheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={citySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCitySheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setCitySheetOpen(false)}>
          <CountrySheet
            onStartShouldSetResponder={() => true}
            style={{ maxHeight: "70%" }}
          >
            <SheetHandle />
            <SheetTitle>{t("companyFieldCity")}</SheetTitle>
            <CitySheetScroll showsVerticalScrollIndicator={false}>
              {cities.map((city) => (
                <CountryRow
                  key={city}
                  selected={city === companyCity}
                  onPress={() => {
                    setCompanyCity(city);
                    setCitySheetOpen(false);
                  }}
                >
                  <CountryName>{city}</CountryName>
                  {city === companyCity ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </CountryRow>
              ))}
            </CitySheetScroll>
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
  padding-horizontal: ${spacing.lg}px;
  /* The inset is applied here in JS rather than by the SafeAreaView edge.
     On iOS that edge left the arrow up against the status bar — near enough
     the Dynamic Island that the system was swallowing taps on it — so the
     value is read directly and floored, and the row adds its own padding on
     top of it instead of relying on the edge alone. */
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

const ProgressWrap = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
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
`;

const ProgressLabel = styled.Text`
  font-size: 11px;
  font-family: ${fontFamily.semiBold};
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 0;
`;

const SecureRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  margin-bottom: ${spacing.lg}px;
`;

const SecureText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const ScreenBody = styled.ScrollView.attrs(() => ({
  keyboardShouldPersistTaps: "handled",
  showsVerticalScrollIndicator: false,
}))`
  flex: 1;
`;

const Content = styled.View`
  padding-horizontal: ${spacing.lg}px;
  padding-top: ${spacing.md}px;
  padding-bottom: ${spacing.xl}px;
`;

const Eyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  letter-spacing: 1px;
  color: ${EMERALD};
  margin-bottom: ${spacing.sm}px;
`;

// The flag reads as a passport-style chip rather than a square icon: real
// flag proportions (3:2), so it sits next to the eyebrow label as a stamp
// of officialdom instead of another rounded app glyph.
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
  font-size: 25px;
  line-height: 30px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const HeadlineCopy = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  max-width: 320px;
  margin-bottom: ${spacing.xl}px;
`;

const HeaderTitle = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const OtpSubtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
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
  border-color: ${(props) =>
    props.error
      ? props.theme.error
      : props.valid
        ? props.theme.primary
        : props.theme.border};
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

const ErrorText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.error};
  margin-top: 7px;
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

const SubmitRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const TrustRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.xs}px;
  margin-top: ${spacing.md}px;
`;

const TrustText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  flex: 1;
  line-height: 17px;
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
  background-color: ${(props) => (props.selected ? props.theme.primaryLight : "transparent")};
`;

const CountryName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  padding: 4px ${spacing.lg}px ${spacing.sm}px;
`;

const CitySheetScroll = styled.ScrollView``;

// The company wizard uses a different field idiom from the rest of sign-up:
// an outside label over a tall, flat, icon-free box. Legal identifiers are
// transcribed off a paper document, so the field has to look like a form
// line to copy into — a leading icon inside the box only steals width from
// strings like "RB/COT/24 B 12345".
const CompanyHeadline = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 27px;
  line-height: 32px;
  color: ${(props) => props.theme.text};
  margin-bottom: 12px;
`;

const CompanyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 14px;
  line-height: 21px;
  color: ${(props) => props.theme.textMuted};
  max-width: 320px;
  margin-bottom: 30px;
`;

const LogoRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 12px 14px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-style: dashed;
  border-color: ${(props) => props.theme.border};
`;

const LogoPreview = styled.Image`
  width: 52px;
  height: 52px;
  border-radius: ${radius.md}px;
`;

const LogoPlaceholder = styled.View`
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const LogoTextCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const LogoTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const LogoHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const FieldGroup = styled.View`
  margin-bottom: 18px;
`;

const FieldLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  margin-bottom: 8px;
`;

// `valid` turns the border emerald only for the fields with a real format
// to satisfy (RCCM, IFU, phone) — it is a "this matches the registry's
// shape" signal, not a generic filled-in state.
const companyFieldFrame = css`
  height: 54px;
  border-width: 1.5px;
  border-color: ${(props) =>
    props.error
      ? props.theme.error
      : props.valid
        ? EMERALD
        : props.theme.border};
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
`;

const CompanyInput = styled.TextInput`
  ${companyFieldFrame}
  padding-horizontal: 15px;
  font-family: ${fontFamily.regular};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const CompanyInputRow = styled.View`
  ${companyFieldFrame}
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-horizontal: 15px;
`;

const CompanyInputFlex = styled.TextInput`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const CompanySelector = styled(Pressable)`
  ${companyFieldFrame}
  flex-direction: row;
  align-items: center;
  gap: 11px;
  padding-horizontal: 12px;
`;

const CompanySelectorText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 15px;
  color: ${(props) => (props.muted ? props.theme.textMuted : props.theme.text)};
`;

// Roomier than the country/city rows it sits beside: nineteen options is a
// list you scan rather than read, and the colour chip needs space to do
// that work.
const SectorRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 14px;
  padding-horizontal: ${spacing.lg}px;
  padding-vertical: 11px;
  background-color: ${(props) => (props.selected ? props.tint : "transparent")};
`;

const SectorIconWrap = styled.View`
  width: ${(props) => (props.small ? 32 : 40)}px;
  height: ${(props) => (props.small ? 32 : 40)}px;
  border-radius: ${(props) => (props.small ? 11 : 14)}px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: ${(props) => props.tint};
`;

const SectorLabel = styled.Text`
  flex: 1;
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const RetryNotice = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.errorLight};
  margin-bottom: ${spacing.sm}px;
`;

const RetryNoticeText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.8px;
  line-height: 19px;
  color: ${(props) => props.theme.text};
`;

const FieldHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 6px;
`;

// Docked rather than scrolled with the fields: step 1 is long enough to
// push an inline button off-screen, and "what do I do next" should not
// depend on how far down the form you are.
const CompanyDock = styled.View`
  padding: 12px ${spacing.lg}px 22px;
  background-color: ${(props) => props.theme.background};
`;

const CompanyCta = styled(Pressable)`
  border-radius: 18px;
  padding-vertical: 17px;
  align-items: center;
  background-color: ${(props) => (props.disabled ? "rgba(11, 110, 79, 0.35)" : EMERALD)};
`;

const CompanyCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: #ffffff;
`;

const CompanyTrustRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  margin-top: 14px;
`;

const CompanyTrustText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

// Keeps the language switch pinned right while the back arrow is absent,
// so the header doesn't jump when the checking screen takes over.
const HeaderSpacer = styled.View`
  width: 34px;
  height: 34px;
`;

const CheckingWrap = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-horizontal: ${spacing.lg}px;
`;

const CheckingTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 21px;
  color: ${(props) => props.theme.text};
  margin-top: 18px;
  margin-bottom: 8px;
  text-align: center;
`;

const CheckingCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 21px;
  color: ${(props) => props.theme.textMuted};
  max-width: 300px;
  text-align: center;
`;

// An empty slot is a dashed outline — the standing convention for "drop
// something here". Attaching a file swaps it to a solid emerald border and
// a filled badge, so a half-finished document step is legible at a glance
// without reading either row's label.
const DocRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding: 15px ${spacing.md}px;
  border-radius: 18px;
  margin-bottom: 12px;
  border-width: 1.5px;
  border-style: ${(props) => (props.added ? "solid" : "dashed")};
  border-color: ${(props) => (props.added ? EMERALD : "rgba(11, 110, 79, 0.35)")};
  background-color: ${(props) => (props.added ? "rgba(11, 110, 79, 0.07)" : "rgba(11, 110, 79, 0.03)")};
`;

const DocLabelCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const DocName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const DocHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const DocBadge = styled.View`
  flex-shrink: 0;
  padding: 5px 11px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.added ? EMERALD : "rgba(11, 110, 79, 0.12)")};
`;

const DocBadgeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${(props) => (props.added ? "#ffffff" : EMERALD)};
`;

const ConsentRow = styled(Pressable)`
  flex-direction: row;
  align-items: flex-start;
  gap: 11px;
  padding-vertical: 14px;
`;

const ConsentBox = styled.View`
  width: 22px;
  height: 22px;
  border-radius: 11px;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
  flex-shrink: 0;
  border-width: 1.5px;
  border-color: ${(props) => (props.checked ? EMERALD : props.theme.border)};
  background-color: ${(props) => (props.checked ? EMERALD : props.theme.surface)};
`;

const ConsentText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.8px;
  line-height: 19px;
  color: ${(props) => props.theme.textMuted};
`;
