import { Platform, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { closeAccountGate } from "../utils/openAccountGate";

const EMERALD = "#0B6E4F";
// Bénin's actual flag colors — used for the small flag glyph and the
// account-type cards' accent stripes, not just a decorative palette pick.
const FLAG_GREEN = "#008751";
const FLAG_YELLOW = "#FCD116";
const FLAG_RED = "#E8112D";

const scrollContentStyle = { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl };

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

export function AccountTypeScreen({ navigation, route }) {
  // Registered in two stacks under different names, so the next route is
  // told to us rather than hardcoded. Defaults keep the Sell-tab copy
  // working unchanged.
  const signUpRoute = route?.params?.signUpRoute ?? 'SellSignUp';
  const loginRoute = route?.params?.loginRoute ?? 'SellLogin';
  const forgotRoute = route?.params?.forgotRoute ?? 'ForgotPassword';
  const originKey = route?.params?.originKey ?? null;

  // Reached two ways: by tapping Vendre (history behind it) or by a jump
  // from Report/Message/Save. The old fallback here named "SellGate", a
  // route that exists only inside the Sell tab — so from the root-stack copy
  // it resolved to nothing and the arrow genuinely did nothing.
  const handleBack = () => closeAccountGate(navigation, originKey);

  const insets = useSafeAreaInsets();
  // Floor, because a zero reading is a real failure mode on iOS (the first
  // frame before the provider measures) and 0 puts the arrow in the notch.
  // The floor matters on iOS, where this screen was reading a top inset of
  // roughly nothing: 56 clears the notch/Dynamic Island on every current
  // iPhone, and is ignored on any device that reports a real inset.
  const topInset = Math.max(insets.top, Platform.OS === "ios" ? 56 : 8);
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Container edges={["left", "right", "bottom"]}>
      <HeaderRow topInset={topInset}>
        <BackButton onPress={handleBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </BackButton>
        <LanguageSwitch />
      </HeaderRow>

      <Scroll contentContainerStyle={scrollContentStyle} showsVerticalScrollIndicator={false}>
        <CountryRow>
          <BeninFlag />
          <CountryLabel>{t("accountTypeCountryLabel")}</CountryLabel>
        </CountryRow>
        <Headline>{t("accountTypeHeadline")}</Headline>
        <Copy>{t("accountTypeCopy")}</Copy>

        <TypeCard onPress={() => navigation.navigate(signUpRoute, {
              accountType: 'individual',
              originKey,
              loginRoute,
              signUpRoute,
              forgotRoute,
            })}>
          <AccentStripe>
            <AccentBand style={{ backgroundColor: FLAG_GREEN }} />
          </AccentStripe>
          <TypeIconWrap accent="green">
            <Ionicons name="person-outline" size={22} color={EMERALD} />
          </TypeIconWrap>
          <TypeInfo>
            <TypeTitle>{t("accountTypeIndividualTitle")}</TypeTitle>
            <TypeCopy>{t("accountTypeIndividualCopy")}</TypeCopy>
          </TypeInfo>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TypeCard>

        <TypeCard onPress={() => navigation.navigate(signUpRoute, {
              accountType: 'company',
              originKey,
              loginRoute,
              signUpRoute,
              forgotRoute,
            })}>
          <AccentStripe>
            <AccentBand style={{ backgroundColor: FLAG_YELLOW }} />
            <AccentBand style={{ backgroundColor: FLAG_RED }} />
          </AccentStripe>
          <TypeIconWrap accent="red">
            <Ionicons name="business-outline" size={22} color={FLAG_RED} />
          </TypeIconWrap>
          <TypeInfo>
            <TypeTitle>{t("accountTypeCompanyTitle")}</TypeTitle>
            <TypeCopy>{t("accountTypeCompanyCopy")}</TypeCopy>
            <TypeTag>
              <Ionicons name="shield-checkmark" size={11} color={EMERALD} />
              <TypeTagLabel>{t("accountTypeCompanyTag")}</TypeTagLabel>
            </TypeTag>
          </TypeInfo>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TypeCard>

        <TrustRow>
          <Ionicons name="shield-checkmark-outline" size={14} color={EMERALD} />
          <TrustText>{t("accountTypeTrustText")}</TrustText>
        </TrustRow>
      </Scroll>
    </Container>
  );
}

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

const Scroll = styled.ScrollView`
  flex: 1;
`;

// Real flag proportions (3:2), matching the same banner on the company
// sign-up steps — the two screens are one continuous flow.
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

const CountryRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
`;

const CountryLabel = styled.Text`
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
  margin-bottom: ${spacing.sm}px;
`;

const Copy = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  max-width: 320px;
  margin-bottom: ${spacing.xl}px;
`;

const TypeCard = styled(Pressable)`
  position: relative;
  overflow: hidden;
  flex-direction: row;
  align-items: flex-start;
  gap: 14px;
  padding: 20px 18px 20px 22px;
  border-radius: 22px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: 14px;
  ${shadow.card}
`;

const AccentStripe = styled.View`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
`;

const AccentBand = styled.View`
  flex: 1;
`;

const TypeIconWrap = styled.View`
  width: 46px;
  height: 46px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.accent === "red" ? "rgba(232, 17, 45, 0.09)" : "rgba(0, 135, 81, 0.09)")};
  flex-shrink: 0;
`;

const TypeInfo = styled.View`
  flex: 1;
  min-width: 0px;
`;

const TypeTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-bottom: 5px;
`;

const TypeCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.8px;
  line-height: 19px;
  color: ${(props) => props.theme.textMuted};
`;

const TypeTag = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  margin-top: ${spacing.sm}px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.1);
`;

const TypeTagLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${EMERALD};
`;

const TrustRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.xs}px;
  margin-top: ${spacing.sm}px;
`;

const TrustText = styled.Text`
  ${type.caption}
  flex: 1;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;
