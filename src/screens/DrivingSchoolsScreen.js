import { useMemo, useState } from "react";
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
  ANATT_EXAM_URL,
  ANATT_LICENCE_URL,
  drivingSchoolsReviewedOn,
  licenceCategories,
  licenceCovers,
  licenceDossier,
  licenceLabel,
  schoolQuestions,
} from "../data/drivingSchools";
import { useDrivingSchools } from "../hooks/useDrivingSchools";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { HeroPostBar } from "../components/HeroPostBar";
import { ScreenFooter } from "../components/ScreenFooter";
import { openListing } from "../utils/openListing";
import { canPublish } from "../utils/canPublish";
import { openAccountGate } from "../utils/openAccountGate";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useAuth } from "../auth/AuthContext";

const INK = "#1F4E5F";
const GOLD = "#D9A441";

// Auto-écoles.
//
// Two halves, and the order matters. The paperwork comes second even though
// it is the part we are surest of, because somebody arriving here is looking
// for a school, not a form. But it stays on the same screen rather than
// behind a tab: the attestation de formation is issued by the school, so the
// dossier is the argument for choosing one carefully.
//
// What this screen does not do:
//
//   - badge a school as agréée. ANaTT approves auto-écoles and we have no
//     register to check against. An unverifiable badge on the one screen
//     where approval is the whole question would be the worst place in the
//     app to guess, so the question is handed to the candidate instead.
//   - quote what a licence costs. ANaTT's own page says the cost varies by
//     school and sends you to ask them. Prices here are whatever each school
//     published, through the same helper every other listing uses.
export function DrivingSchoolsScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { coords } = useCurrentLocation();
  const schools = useDrivingSchools(coords);
  const [licence, setLicence] = useState(null);

  const openPostForm = () =>
    navigation.navigate("CreateListing", {
      categoryKey: "services",
      trade: "drivingSchool",
    });

  // Shown to signed-out readers too, and gated at the tap: hiding it makes
  // the screen look closed to the schools it is trying to reach. Same shape
  // as Clés and GPS.
  const { remember } = useAccountGateIntent(user, openPostForm);
  const mayPublish = !user || canPublish(user);

  const startPosting = () => {
    if (!user) {
      remember();
      openAccountGate(navigation);
      return;
    }
    openPostForm();
  };

  // A school that declared nothing is not hidden by a filter it never
  // answered — it simply cannot be claimed by one either. It shows under
  // "Tous" and nowhere else, which is the honest reading of a blank field.
  const visible = useMemo(
    () =>
      licence
        ? schools.filter((school) => school.categories.includes(licence))
        : schools,
    [schools, licence],
  );

  const chosen = licence
    ? licenceCategories.find((item) => item.key === licence)
    : null;

  const open = (url) => Linking.openURL(url).catch(() => {});

  // Split rather than `new Date("2026-08-28")`. That form is parsed as UTC
  // midnight and then formatted in the reader's own zone, so anywhere west of
  // Greenwich it prints the day before — this note showed "27 August" for a
  // page read on the 28th. A provenance date that is off by one is worse than
  // none: it is the only part of this screen the reader is asked to trust.
  const reviewed = useMemo(() => {
    const [year, month, day] = drivingSchoolsReviewedOn.split("-").map(Number);
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  }, [language]);

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#1F4E5F", "#123443", "#0B222C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("schoolsEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("schoolsTitle")}</HeroTitle>
        <HeroCopy>{t("schoolsIntro")}</HeroCopy>
        {mayPublish ? (
          <HeroPostBar
            icon="school-outline"
            ink={GOLD}
            label={t("schoolsPublishLabel")}
            cta={t("schoolsPublishCta")}
            onPress={startPosting}
          />
        ) : null}
      </Hero>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <FieldLabel>{t("schoolsFilterLabel")}</FieldLabel>
        <FilterScroll
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: spacing.md }}
        >
          <Chip active={!licence} onPress={() => setLicence(null)}>
            <ChipLabel active={!licence}>{t("schoolsFilterAll")}</ChipLabel>
          </Chip>
          {licenceCategories.map((category) => {
            const active = licence === category.key;
            return (
              <Chip
                key={category.key}
                active={active}
                onPress={() => setLicence(active ? null : category.key)}
              >
                <Ionicons
                  name={category.icon}
                  size={14}
                  color={active ? "#ffffff" : INK}
                />
                <ChipLabel active={active}>{category.key}</ChipLabel>
              </Chip>
            );
          })}
        </FilterScroll>

        {/* What the chosen licence actually covers, so the letter is not a
            code you have to already know. */}
        {chosen ? (
          <LicenceCard>
            <LicenceLetter>{chosen.key}</LicenceLetter>
            <LicenceBody>
              <LicenceName>{licenceLabel(chosen.key, language)}</LicenceName>
              <LicenceCovers>{licenceCovers(chosen.key, language)}</LicenceCovers>
              <LicenceMetaRow>
                <MetaPill>
                  <Ionicons name="person-outline" size={12} color={INK} />
                  <MetaPillLabel>
                    {t("schoolsMinAge", { age: chosen.minAge })}
                  </MetaPillLabel>
                </MetaPill>
                {/* The mistake worth preventing: C, D and E are not a
                    starting point. */}
                {chosen.requiresB ? (
                  <MetaPill>
                    <Ionicons name="albums-outline" size={12} color={INK} />
                    <MetaPillLabel>{t("schoolsNeedsB")}</MetaPillLabel>
                  </MetaPill>
                ) : null}
              </LicenceMetaRow>
            </LicenceBody>
          </LicenceCard>
        ) : null}

        <CountRow>
          {visible.length === 1
            ? t("schoolsCountOne")
            : t("schoolsCount", { count: visible.length })}
        </CountRow>

        {visible.map((school) => {
          const title = language === "en" ? school.titleEn : school.titleFr;
          return (
            <SchoolCard
              key={school.id}
              onPress={() => openListing(navigation, school, t, language)}
            >
              <SchoolTop>
                <SchoolName numberOfLines={2}>{title}</SchoolName>
                <PlaceRow>
                  <Ionicons
                    name="location-outline"
                    size={12}
                    color={colors.textMuted}
                  />
                  <PlaceText numberOfLines={1}>
                    {school.city}
                    {school.distanceKm != null
                      ? ` · ${school.distanceKm.toFixed(1)} km`
                      : ""}
                  </PlaceText>
                </PlaceRow>
              </SchoolTop>

              {/* Only the letters the school itself claimed. */}
              {school.categories.length ? (
                <>
                  <SubLabel>{t("schoolsTeaches")}</SubLabel>
                  <LetterRow>
                    {school.categories.map((key) => (
                      <Letter key={key}>
                        <LetterLabel>{key}</LetterLabel>
                      </Letter>
                    ))}
                  </LetterRow>
                </>
              ) : (
                <Unstated>{t("schoolsNoCategories")}</Unstated>
              )}
            </SchoolCard>
          );
        })}

        {visible.length === 0 ? (
          <EmptyText>
            {schools.length === 0
              ? t("schoolsNoneAtAll")
              : t("schoolsEmpty")}
          </EmptyText>
        ) : null}

        {/* The paperwork. Sourced, dated, and pointed back at the agency —
            a list like this is only as good as the day it was read. */}
        <SectionHeading>{t("schoolsDossierTitle")}</SectionHeading>
        <Panel>
          {licenceDossier.map((item) => (
            <PanelRow key={item.key}>
              <Ionicons name={item.icon} size={16} color={INK} />
              <PanelText>
                {language === "en" ? item.labelEn : item.labelFr}
              </PanelText>
            </PanelRow>
          ))}
        </Panel>
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("schoolsDossierNote", { date: reviewed })}</NoteText>
        </Note>

        <SectionHeading>{t("schoolsAskTitle")}</SectionHeading>
        <Panel>
          {schoolQuestions.map((item) => (
            <PanelRow key={item.key}>
              <Ionicons name={item.icon} size={16} color={INK} />
              <PanelText>
                {language === "en" ? item.labelEn : item.labelFr}
              </PanelText>
            </PanelRow>
          ))}
        </Panel>
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("schoolsAskNote")}</NoteText>
        </Note>
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("schoolsPriceNote")}</NoteText>
        </Note>

        {/* Straight to the agency, because everything above came from it. */}
        <LinkButton onPress={() => open(ANATT_LICENCE_URL)}>
          <Ionicons name="open-outline" size={15} color={INK} />
          <LinkLabel>{t("schoolsAnattAction")}</LinkLabel>
        </LinkButton>
        <LinkButton onPress={() => open(ANATT_EXAM_URL)}>
          <Ionicons name="open-outline" size={15} color={INK} />
          <LinkLabel>{t("schoolsExamAction")}</LinkLabel>
        </LinkButton>

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

const FieldLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  margin-bottom: 10px;
  color: ${(props) => props.theme.textMuted};
`;

const FilterScroll = styled.ScrollView`
  flex-grow: 0;
  margin-bottom: ${spacing.md}px;
`;

const Chip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 9px 15px;
  border-radius: 999px;
  background-color: ${(props) =>
    props.active ? INK : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? INK : props.theme.border)};
`;

const ChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const LicenceCard = styled.View`
  flex-direction: row;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const LicenceLetter = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 34px;
  line-height: 40px;
  color: ${INK};
`;

const LicenceBody = styled.View`
  flex: 1;
  gap: 4px;
`;

const LicenceName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const LicenceCovers = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const LicenceMetaRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`;

const MetaPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(31, 78, 95, 0.09);
`;

const MetaPillLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${INK};
`;

const CountRow = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  margin-bottom: 10px;
  color: ${(props) => props.theme.textMuted};
`;

const SchoolCard = styled(Pressable)`
  padding: 16px;
  border-radius: 20px;
  margin-bottom: 10px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const SchoolTop = styled.View`
  gap: 5px;
`;

const SchoolName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  line-height: 20px;
  color: ${(props) => props.theme.text};
`;

const PlaceRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const PlaceText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SubLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 1.2px;
  margin: 12px 0 7px;
  color: ${(props) => props.theme.textMuted};
`;

const LetterRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
`;

const Letter = styled.View`
  min-width: 30px;
  padding: 5px 10px;
  border-radius: 9px;
  align-items: center;
  background-color: rgba(31, 78, 95, 0.09);
`;

const LetterLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${INK};
`;

const Unstated = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  margin-top: 10px;
  color: ${(props) => props.theme.textMuted};
`;

const EmptyText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 20px;
  text-align: center;
  padding: ${spacing.lg}px ${spacing.md}px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionHeading = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  margin: ${spacing.lg}px 0 10px;
  color: ${(props) => props.theme.text};
`;

const Panel = styled.View`
  padding: 6px 14px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PanelRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 11px;
  padding: 12px 0;
`;

const PanelText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 19px;
  color: ${(props) => props.theme.text};
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

const LinkButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  border-radius: ${radius.md}px;
  margin-top: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: rgba(31, 78, 95, 0.35);
`;

const LinkLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${INK};
`;
