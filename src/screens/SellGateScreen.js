import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";

// Fixed brand accents (same convention as ForYouScreen's header) — used for
// the decorative hero card and benefit icons, not theme-reactive.
const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// Reach leads now, and it leads with a globe rather than a map pin.
//
// The order used to be post → reach → chat, which put the mechanics of the
// app before the reason to use it. Since anyone in the world can now hold an
// account, browse and message, "your shop seen from Paris" is both the
// strongest thing this page can say and, for the first time, a true one.
const BENEFIT_ICONS = [
  "globe-outline",
  "camera-outline",
  "chatbubble-ellipses-outline",
];

const scrollContentStyle = {
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.xs,
  paddingBottom: spacing.lg,
};

export function SellGateScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const benefits = [
    {
      icon: BENEFIT_ICONS[0],
      title: t("sellGateBenefit2Title"),
      copy: t("sellGateBenefit2Copy"),
    },
    {
      icon: BENEFIT_ICONS[1],
      title: t("sellGateBenefit1Title"),
      copy: t("sellGateBenefit1Copy"),
    },
    {
      icon: BENEFIT_ICONS[2],
      title: t("sellGateBenefit3Title"),
      copy: t("sellGateBenefit3Copy"),
    },
  ];

  const steps = [t("sellGateStep1"), t("sellGateStep2"), t("sellGateStep3")];

  return (
    <Container edges={["left", "right", "bottom"]}>
      <Scroll
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator={false}
      >
        <HeroSection>
          <Eyebrow>{t("sellGateEyebrow")}</Eyebrow>
          <Headline>{t("sellGateHeadline")}</Headline>
          <HeadlineCopy>{t("sellGateHeadlineCopy")}</HeadlineCopy>

          <StackWrap>
            <StackCardBack />
            <StackCardMid />
            <StackCardFront>
              <StackImage
                colors={[EMERALD, "#063d2c"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <StackBadge>
                  <StackBadgeLabel>{t("sellGateSampleBadge")}</StackBadgeLabel>
                </StackBadge>
              </StackImage>
              <StackBody>
                <StackPrice>{t("sellGateSamplePrice")}</StackPrice>
                <StackTitle numberOfLines={1}>
                  {t("sellGateSampleTitle")}
                </StackTitle>
                <StackMeta>
                  <Ionicons
                    name="location-outline"
                    size={10}
                    color={colors.textMuted}
                  />
                  <StackMetaText>{t("sellGateSampleMeta")}</StackMetaText>
                </StackMeta>
              </StackBody>
            </StackCardFront>
          </StackWrap>
        </HeroSection>

        <SectionTitle>{t("sellGateBenefitsTitle")}</SectionTitle>
        <BenefitList>
          {benefits.map((benefit) => (
            <BenefitRow key={benefit.title}>
              <BenefitIconWrap>
                <Ionicons name={benefit.icon} size={18} color={EMERALD} />
              </BenefitIconWrap>
              <BenefitTextWrap>
                <BenefitTitle>{benefit.title}</BenefitTitle>
                <BenefitCopy>{benefit.copy}</BenefitCopy>
              </BenefitTextWrap>
            </BenefitRow>
          ))}
        </BenefitList>

        <SectionTitle>{t("sellGateStepsTitle")}</SectionTitle>
        <StepsRow>
          <StepsLine />
          {steps.map((label, index) => (
            <StepCol key={label}>
              <StepDot>
                <StepDotLabel>{index + 1}</StepDotLabel>
              </StepDot>
              <StepLabel>{label}</StepLabel>
            </StepCol>
          ))}
        </StepsRow>

        <TrustRow>
          <Ionicons name="shield-checkmark-outline" size={18} color={EMERALD} />
          <TrustText>{t("sellGateTrustText")}</TrustText>
        </TrustRow>

        <CtaBlock>
          <PrimaryButton onPress={() => navigation.navigate("AccountType")}>
            <PrimaryButtonLabel>{t("sellGateSignUpButton")}</PrimaryButtonLabel>
          </PrimaryButton>
          <LoginRow
            onPress={() => navigation.navigate("SellLogin")}
            hitSlop={8}
          >
            <LoginRowText>
              {t("sellGateAlreadySeller")}{" "}
              <LoginLink>{t("sellGateLoginButton")}</LoginLink>
            </LoginRowText>
          </LoginRow>
        </CtaBlock>
      </Scroll>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const HeroSection = styled.View`
  margin-bottom: ${spacing.xl}px;
  padding-top: ${spacing.xs}px;
`;

const Eyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  letter-spacing: 1px;
  color: ${EMERALD};
  margin-bottom: ${spacing.sm}px;
`;

const Headline = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 27px;
  line-height: 32px;
  letter-spacing: -0.2px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const HeadlineCopy = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  max-width: 300px;
  margin-bottom: ${spacing.lg}px;
`;

const StackWrap = styled.View`
  height: 168px;
  margin-top: ${spacing.xs}px;
`;

const StackCardBack = styled.View`
  position: absolute;
  top: 20px;
  left: 40px;
  right: 0px;
  height: 130px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  transform: rotate(5deg);
`;

const StackCardMid = styled.View`
  position: absolute;
  top: 9px;
  left: 20px;
  right: 20px;
  height: 130px;
  border-radius: ${radius.xl}px;
  background-color: rgba(217, 164, 65, 0.19);
  transform: rotate(-3deg);
`;

const StackCardFront = styled.View`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 40px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  overflow: hidden;
  flex-direction: row;
  ${shadow.card}
`;

const StackImage = styled(LinearGradient)`
  width: 92px;
  flex-shrink: 0;
`;

const StackBadge = styled.View`
  margin: 8px;
  align-self: flex-start;
  background-color: rgba(217, 164, 65, 0.93);
  border-radius: ${radius.pill}px;
  padding-horizontal: 6px;
  padding-vertical: 3px;
`;

const StackBadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 8.5px;
  color: #063d2c;
`;

const StackBody = styled.View`
  flex: 1;
  padding: 15px;
  justify-content: center;
  gap: 3px;
`;

const StackPrice = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-bottom: 2px;
`;

const StackTitle = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
`;

const StackMeta = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
`;

const StackMetaText = styled.Text`
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 16.5px;
  letter-spacing: -0.1px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.md}px;
`;

const BenefitList = styled.View`
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.xl}px;
`;

const BenefitRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 14px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  ${shadow.card}
`;

const BenefitIconWrap = styled.View`
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.08);
`;

const BenefitTextWrap = styled.View`
  flex: 1;
`;

const BenefitTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  margin-bottom: 3px;
`;

const BenefitCopy = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const StepsRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: ${spacing.xl}px;
  padding: 4px 4px 0px;
`;

const StepsLine = styled.View`
  position: absolute;
  top: 21px;
  left: 16%;
  right: 16%;
  height: 1.5px;
  background-color: rgba(11, 110, 79, 0.18);
`;

const StepCol = styled.View`
  align-items: center;
  flex: 1;
`;

const StepDot = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.1);
  margin-bottom: ${spacing.xs}px;
`;

const StepDotLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${EMERALD};
`;

const StepLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  padding-horizontal: 4px;
`;

const TrustRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(11, 110, 79, 0.07);
`;

const TrustText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
  flex: 1;
  line-height: 18px;
`;

const CtaBlock = styled.View`
  margin-top: ${spacing.lg}px;
`;

const PrimaryButton = styled.Pressable`
  background-color: ${EMERALD};
  border-radius: ${radius.lg}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  ${shadow.card}
`;

const PrimaryButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: #ffffff;
`;

const LoginRow = styled.Pressable`
  align-items: center;
  margin-top: ${spacing.md}px;
`;

const LoginRowText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const LoginLink = styled.Text`
  font-family: ${fontFamily.semiBold};
  color: ${EMERALD};
`;
