import { Linking, Pressable, ScrollView } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import {
  beninInsurers,
  beninTelecoms,
  companiesReviewedOn,
  companyEmblem,
  companySectors,
  insuranceBranches,
} from "../data/beninCompanies";
import { beninBanks, formerNames } from "../data/beninBanks";
import { ScreenFooter } from "../components/ScreenFooter";

const GOLD = "#D9A441";

// The companies a register vouches for, and the register that does it.
//
// The point of this screen is the line under each heading: "agréées par la
// BCEAO", "autorisés par l'ARCEP", "membres de l'ASA Bénin". Without it the
// list is just names somebody typed, which is what the app had before.
//
// No logos, no phone numbers, no branches, no ranking. Alphabetical inside
// each group — ordering licensed companies against each other would be an
// opinion this app has no standing to hold.
export function VerifiedCompaniesScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();

  const [year, month, day] = companiesReviewedOn.split("-").map(Number);
  const reviewed = new Intl.DateTimeFormat(
    language === "en" ? "en-GB" : "fr-FR",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(new Date(year, month - 1, day));

  const open = (url) => Linking.openURL(url).catch(() => {});

  // Banks arrive from their own file — they were verified first and have a
  // screen of their own with search and directions.
  const rowsFor = (sector) => {
    if (sector === "bank") {
      return beninBanks.map((bank) => ({
        key: bank.key,
        name: bank.name,
        emblem: bank.shortName,
        note: formerNames(bank.key).length
          ? t("banksFormerly", { name: formerNames(bank.key).join(", ") })
          : null,
      }));
    }
    if (sector === "telecom") {
      return beninTelecoms.map((item) => ({
        key: item.key,
        name: item.name,
        emblem: companyEmblem(item),
        note: item.fullName,
      }));
    }
    return null; // insurers are grouped again, below
  };

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#134E4A", "#0C3230", "#08211F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("companiesEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("companiesTitle")}</HeroTitle>
        <HeroCopy>{t("companiesIntro")}</HeroCopy>
      </Hero>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {companySectors.map((sector) => (
          <Section key={sector.key}>
            <SectionHead>
              <Ionicons name={sector.icon} size={16} color={sector.accent} />
              <SectionLabel>
                {language === "en" ? sector.labelEn : sector.labelFr}
              </SectionLabel>
            </SectionHead>
            {/* Who says so. This is the whole claim the screen makes. */}
            <Authority onPress={() => open(sector.source)}>
              <AuthorityLabel>
                {language === "en" ? sector.authorityEn : sector.authorityFr}
              </AuthorityLabel>
              <Ionicons name="open-outline" size={12} color={colors.textMuted} />
            </Authority>

            {sector.key === "insurer"
              ? insuranceBranches.map((branch) => (
                  <Branch key={branch.key}>
                    <BranchLabel>
                      {language === "en" ? branch.labelEn : branch.labelFr}
                    </BranchLabel>
                    {beninInsurers
                      .filter((item) => item.branch === branch.key)
                      .map((item) => (
                        <Row key={item.key}>
                          <Plate accent={sector.accent}>
                            <PlateLabel
                              accent={sector.accent}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.5}
                            >
                              {companyEmblem(item)}
                            </PlateLabel>
                          </Plate>
                          <RowName numberOfLines={2}>{item.name}</RowName>
                        </Row>
                      ))}
                  </Branch>
                ))
              : rowsFor(sector.key).map((item) => (
                  <Row key={item.key}>
                    <Plate accent={sector.accent}>
                      <PlateLabel
                        accent={sector.accent}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.5}
                      >
                        {item.emblem}
                      </PlateLabel>
                    </Plate>
                    <RowBody>
                      <RowName numberOfLines={2}>{item.name}</RowName>
                      {item.note ? (
                        <RowNote numberOfLines={1}>{item.note}</RowNote>
                      ) : null}
                    </RowBody>
                  </Row>
                ))}
          </Section>
        ))}

        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("companiesSourceNote", { date: reviewed })}</NoteText>
        </Note>
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("companiesNotEndorsement")}</NoteText>
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
  gap: 8px;
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const Authority = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin: 4px 0 12px 24px;
`;

const AuthorityLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const Branch = styled.View`
  margin-bottom: ${spacing.sm}px;
`;

const BranchLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-bottom: 7px;
  color: ${(props) => props.theme.textMuted};
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  margin-bottom: 7px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const Plate = styled.View`
  width: 56px;
  height: 46px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  padding-horizontal: 5px;
  background-color: ${(props) => `${props.accent}1A`};
`;

const PlateLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  width: 100%;
  text-align: center;
  color: ${(props) => props.accent};
`;

const RowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const RowName = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  line-height: 19px;
  color: ${(props) => props.theme.text};
`;

const RowNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
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
