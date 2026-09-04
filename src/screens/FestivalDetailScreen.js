import { Image, Linking, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { EVENT_ACCENT, getEventKindTint } from "../data/events";
import {
  festivalPhoto,
  festivalRecurrence,
  festivalWhat,
} from "../data/beninFestivals";

// One festival, in full.
//
// The cards were Pressables that only did something when the festival had
// a website, so five of the seven looked like buttons and were not —
// Nonvitcha among them. Which is the same complaint the tourism cards drew
// and the same answer: give the tap somewhere to go, and put on it the
// things a card has no room for.
//
// What is here that was not on the card: the reading date and the page it
// was read from, said plainly rather than buried in a data file; a
// sentence about what happens when no edition has been announced; and the
// two questions a festival raises next, answered by screens this app
// already has.
export function FestivalDetailScreen({ route, navigation }) {
  const { festival } = route.params ?? {};
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();

  if (!festival) return null;

  const photo = festivalPhoto(festival);
  const tint = getEventKindTint(festival.kind) ?? EVENT_ACCENT;
  const sourceHost = festival.source
    ? festival.source.replace(/^https?:\/\//, "").split("/")[0]
    : null;
  const readOn = (() => {
    const [year, month, day] = String(festival.confirmedOn).split("-").map(Number);
    if (!year) return festival.confirmedOn;
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  })();

  return (
    <Container edges={["left", "right", "bottom"]}>
      <Body showsVerticalScrollIndicator={false} contentContainerStyle={bodyStyle}>
        <Hero>
          {photo ? (
            <HeroPhoto source={{ uri: photo.url }} resizeMode="cover" />
          ) : (
            <HeroFallback
              colors={[tint, "#141018"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          )}
          <HeroScrim
            colors={["rgba(0,0,0,0.45)", "transparent", "rgba(0,0,0,0.75)"]}
            locations={[0, 0.4, 1]}
            pointerEvents="none"
          />
          <BackButton
            style={{ top: insets.top + spacing.sm }}
            onPress={() => navigation.goBack()}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroFoot>
            <HeroTitle numberOfLines={2}>{festival.name}</HeroTitle>
            <HeroMeta numberOfLines={1}>
              {festival.venue ? `${festival.venue} · ${festival.city}` : festival.city}
            </HeroMeta>
          </HeroFoot>
        </Hero>

        {/* Credited outside the picture here, where there is room for the
            whole line, and it opens the file's page on Commons. */}
        {photo ? (
          <CreditRow
            onPress={() => photo.descriptionUrl && Linking.openURL(photo.descriptionUrl)}
          >
            <CreditText numberOfLines={2}>
              {t("tourismPhotoCredit", {
                author: photo.author,
                licence: photo.licence,
              })}
              {photo.shows ? ` — ${photo.shows}` : ""}
            </CreditText>
          </CreditRow>
        ) : null}

        <Section>
          <SectionTitle>{t("festivalsAboutTitle")}</SectionTitle>
          <Body1>{festivalWhat(festival, language)}</Body1>
        </Section>

        <Section>
          <SectionTitle>{t("festivalsWhenTitle")}</SectionTitle>
          <When>{festivalRecurrence(festival, language)}</When>
          {festival.lastConfirmedEdition ? (
            <Edition>
              {t("festivalsLastEdition", { edition: festival.lastConfirmedEdition })}
            </Edition>
          ) : (
            // Said outright rather than left as an absence. A blank where a
            // date should be reads as "we forgot", not as "nobody knows
            // yet", and the difference matters to somebody about to book.
            <Caveat>{t("festivalsNoDateYet")}</Caveat>
          )}
        </Section>

        <Section>
          <SectionTitle>{t("festivalsWhereTitle")}</SectionTitle>
          {festival.website ? (
            <ActionRow onPress={() => Linking.openURL(festival.website)}>
              <Ionicons name="globe-outline" size={17} color={colors.primary} />
              <ActionLabel numberOfLines={1}>
                {festival.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </ActionLabel>
              <ActionHint>{t("tourismWebsite")}</ActionHint>
            </ActionRow>
          ) : null}
          <ActionRow
            onPress={() =>
              Linking.openURL(
                "https://www.google.com/maps/search/?api=1&query=" +
                  encodeURIComponent(
                    `${festival.venue ? `${festival.venue} ` : ""}${festival.city} Bénin`,
                  ),
              )
            }
          >
            <Ionicons name="navigate-outline" size={17} color={colors.primary} />
            <ActionLabel numberOfLines={1}>
              {festival.venue ?? festival.city}
            </ActionLabel>
            <ActionHint>{t("tourismDirections")}</ActionHint>
          </ActionRow>
          <ActionRow onPress={() => navigation.navigate("Hotels")}>
            <Ionicons name="bed-outline" size={17} color={colors.primary} />
            <ActionLabel numberOfLines={1}>
              {t("festivalsSleep", { city: festival.city })}
            </ActionLabel>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </ActionRow>
          <ActionRow onPress={() => navigation.navigate("Tourism")}>
            <Ionicons name="compass-outline" size={17} color={colors.primary} />
            <ActionLabel numberOfLines={1}>
              {t("festivalsSeeCity", { city: festival.city })}
            </ActionLabel>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </ActionRow>
        </Section>

        {/* Where the entry came from and when it was read, on the screen
            rather than only in the file. A calendar the reader cannot age
            is a calendar they have to take on trust. */}
        <Section>
          <SectionTitle>{t("festivalsSourceTitle")}</SectionTitle>
          <Caveat>
            {t("festivalsSourceLine", { date: readOn, host: sourceHost ?? "—" })}
          </Caveat>
          {festival.source ? (
            <ActionRow onPress={() => Linking.openURL(festival.source)}>
              <Ionicons name="open-outline" size={17} color={colors.primary} />
              <ActionLabel numberOfLines={1}>{t("festivalsOpenSource")}</ActionLabel>
              <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
            </ActionRow>
          ) : null}
          <Caveat>{t("festivalsIntro")}</Caveat>
        </Section>
      </Body>
    </Container>
  );
}

const bodyStyle = { paddingBottom: spacing.xl };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Body = styled.ScrollView`
  flex: 1;
`;

const Hero = styled.View`
  width: 100%;
  height: 260px;
  background-color: #141018;
`;

const HeroPhoto = styled(Image)`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`;

const HeroFallback = styled(LinearGradient)`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`;

const HeroScrim = styled(LinearGradient)`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`;

const BackButton = styled(Pressable)`
  position: absolute;
  left: ${spacing.md}px;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 17px;
  background-color: rgba(0, 0, 0, 0.35);
`;

const HeroFoot = styled.View`
  position: absolute;
  left: ${spacing.md}px;
  right: ${spacing.md}px;
  bottom: ${spacing.md}px;
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 24px;
  line-height: 30px;
  color: #ffffff;
`;

const HeroMeta = styled.Text`
  ${type.caption}
  color: rgba(255, 255, 255, 0.86);
  margin-top: 2px;
`;

const CreditRow = styled(Pressable)`
  padding: ${spacing.sm}px ${spacing.md}px 0;
`;

const CreditText = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Section = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.lg}px;
  margin: ${spacing.md}px ${spacing.md}px 0;
  padding: ${spacing.md}px;
  ${shadow.card}
`;

const SectionTitle = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const Body1 = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.text};
  line-height: 21px;
`;

const When = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const Edition = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 4px;
`;

const Caveat = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 4px;
  line-height: 18px;
`;

const ActionRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px 0;
`;

const ActionLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const ActionHint = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.primary};
`;
