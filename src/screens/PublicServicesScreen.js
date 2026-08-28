import { Linking, Pressable, ScrollView } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import {
  institutionBlurb,
  institutionEmblem,
  institutionGroups,
  institutionsIn,
  institutionsReviewedOn,
} from "../data/beninInstitutions";
import { ScreenFooter } from "../components/ScreenFooter";

const SLATE = "#2E4057";
const GOLD = "#D9A441";

// Services publics.
//
// Deliberately not in "Entreprises vérifiées". That row means somebody at
// Chez-Nous approved a company's account, and a ministry has no account and
// never asked to be here. Putting the state beside paid placements would also
// read as an endorsement running in both directions, and neither one is true.
//
// So this screen makes a narrower promise and keeps it: these are official
// sites, the list came from the government's own portal, and here is the date
// it was read. Nothing else — no opening hours, no phone numbers, no claim
// about how long a procedure takes.
export function PublicServicesScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();

  const open = (url) => Linking.openURL(url).catch(() => {});

  // Built from its parts, not parsed: `new Date("2026-08-28")` is read as UTC
  // midnight and formatted locally, which prints the day before west of
  // Greenwich.
  const [year, month, day] = institutionsReviewedOn.split("-").map(Number);
  const reviewed = new Intl.DateTimeFormat(
    language === "en" ? "en-GB" : "fr-FR",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(new Date(year, month - 1, day));

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#2E4057", "#1E2C3C", "#141E29"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("publicEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("publicTitle")}</HeroTitle>
        <HeroCopy>{t("publicIntro")}</HeroCopy>
      </Hero>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {institutionGroups.map((group) => {
          const items = institutionsIn(group.key);
          if (!items.length) return null;
          return (
            <Section key={group.key}>
              <SectionHead>
                <Ionicons name={group.icon} size={15} color={SLATE} />
                <SectionLabel>
                  {language === "en" ? group.labelEn : group.labelFr}
                </SectionLabel>
              </SectionHead>

              {items.map((item) => (
                <Row key={item.key} onPress={() => open(item.url)}>
                  {/* No logo. We hold none for these bodies and a coat of
                      arms is emphatically not ours to draw. */}
                  <Plate>
                    <PlateLabel numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                      {institutionEmblem(item)}
                    </PlateLabel>
                  </Plate>
                  <RowBody>
                    <RowName numberOfLines={2}>{item.name}</RowName>
                    {item.fullName ? (
                      <RowFull numberOfLines={2}>{item.fullName}</RowFull>
                    ) : null}
                    {institutionBlurb(item, language) ? (
                      <RowBlurb numberOfLines={2}>
                        {institutionBlurb(item, language)}
                      </RowBlurb>
                    ) : null}
                  </RowBody>
                  <Ionicons
                    name="open-outline"
                    size={16}
                    color={colors.textMuted}
                  />
                </Row>
              ))}
            </Section>
          );
        })}

        {/* The two things that make this list worth trusting, and the one
            thing it must not be mistaken for. */}
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("publicSourceNote", { date: reviewed })}</NoteText>
        </Note>
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("publicNotAffiliated")}</NoteText>
        </Note>

        <ScreenFooter />
      </ScrollView>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px
    ${spacing.lg}px;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
`;

const HeroTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-bottom: ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.16);
`;

const HeroEyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.6px;
  color: rgba(255, 255, 255, 0.72);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 30px;
  line-height: 36px;
  letter-spacing: -0.6px;
  color: #ffffff;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 20px;
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.82);
`;

const Section = styled.View`
  margin-bottom: ${spacing.lg}px;
`;

const SectionHead = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
`;

const Row = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  margin-bottom: 8px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const Plate = styled.View`
  width: 52px;
  height: 52px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  padding-horizontal: 5px;
  background-color: rgba(46, 64, 87, 0.1);
`;

const PlateLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  width: 100%;
  text-align: center;
  color: ${SLATE};
`;

const RowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const RowName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  line-height: 19px;
  color: ${(props) => props.theme.text};
`;

const RowFull = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
`;

const RowBlurb = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const Note = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 13px 15px;
  border-radius: 18px;
  margin-top: ${spacing.sm}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
`;

const NoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
`;
