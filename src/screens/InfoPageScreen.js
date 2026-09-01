import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import {
  getInfoPage,
  infoPageIntro,
  infoPageTitle,
  infoSectionBody,
  infoSectionHeading,
} from "../data/infoPages";

const scrollStyle = {
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xl,
};

// One screen for the four pages behind Aide & sécurité.
//
// Four near-identical screens would have been four places to fix a heading
// style and four chances to leave one behind — and there is nothing about
// Confidentialité that wants a different shape from À propos. Which page is
// a route param; the prose lives in data/infoPages.js.
export function InfoPageScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const page = getInfoPage(route?.params?.page);

  // A route param naming a page that does not exist should not be a blank
  // screen with a back button and no explanation.
  if (!page) {
    return (
      <Container edges={["top", "left", "right", "bottom"]}>
        <Header>
          <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </BackButton>
          <HeaderTitle numberOfLines={1}>{t("menuHelpSafetySectionTitle")}</HeaderTitle>
        </Header>
        <Missing>{t("infoPageMissing")}</Missing>
      </Container>
    );
  }

  return (
    <Container edges={["top", "left", "right", "bottom"]}>
      <Header>
        <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </BackButton>
        <HeaderTitle numberOfLines={1}>
          {infoPageTitle(page, language)}
        </HeaderTitle>
      </Header>

      <ScrollView
        contentContainerStyle={scrollStyle}
        showsVerticalScrollIndicator={false}
      >
        <Crest>
          <Ionicons name={page.icon} size={22} color={colors.primary} />
        </Crest>
        <Intro>{infoPageIntro(page, language)}</Intro>

        {page.sections.map((section, index) => (
          <Section key={`${page.key}-${index}`}>
            <SectionHeadingText>
              {infoSectionHeading(section, language)}
            </SectionHeadingText>
            <SectionBody>{infoSectionBody(section, language)}</SectionBody>
          </Section>
        ))}
      </ScrollView>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
`;

const BackButton = styled.Pressable`
  padding: 4px;
`;

const HeaderTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const Crest = styled.View`
  align-self: flex-start;
  padding: 10px;
  border-radius: ${radius.md}px;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const Intro = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 14.5px;
  line-height: 21px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.lg}px;
`;

const Section = styled.View`
  margin-bottom: ${spacing.lg}px;
`;

const SectionHeadingText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const SectionBody = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 14px;
  line-height: 21px;
  color: ${(props) => props.theme.text};
`;

const Missing = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 14px;
  color: ${(props) => props.theme.textMuted};
  padding: 0 ${spacing.md}px;
`;
