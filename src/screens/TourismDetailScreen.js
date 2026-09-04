import { Image, Linking, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import {
  siteBlurb,
  siteDetail,
  siteTypeLine,
  sitesNear,
} from "../data/tourismSites";

const LATERITE = "#9C4221";

// One place, in full.
//
// The list cards were not pressable and there was nothing behind them,
// which is the oldest complaint there is: a card that looks like a button
// and is not one. This is what a tap opens — the photograph at a size
// worth looking at, the whole description rather than four lines, the
// listing, and every way of reaching the place that anybody has published.
export function TourismDetailScreen({ route, navigation }) {
  const { site } = route.params ?? {};
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();

  if (!site) return null;

  const name = (language === "en" ? site.nameEn : site.name) ?? site.name;
  const phones = (site.phone ?? "").split("/").filter(Boolean);

  return (
    <Container edges={["left", "right", "bottom"]}>
      {/* Fixed, with the page sliding over it.

          The hero used to scroll away with everything else, which on a
          screen whose whole point is the photograph meant the photograph
          was the first thing to leave. Now it is pinned behind the sheet
          and stays there while the reader moves down the page. */}
      <Hero>
          {site.photo ? (
            <HeroPhoto source={{ uri: site.photo.url }} resizeMode="cover" />
          ) : (
            <HeroFallback
              colors={[LATERITE, "#2B1206"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          )}
          <HeroScrim
            colors={["rgba(0,0,0,0.45)", "transparent", "rgba(0,0,0,0.7)"]}
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
            <HeroTitle numberOfLines={3}>{name}</HeroTitle>
            <HeroMeta numberOfLines={1}>{site.admin}</HeroMeta>
          </HeroFoot>
      </Hero>

      <Body
        showsVerticalScrollIndicator={false}
        contentContainerStyle={bodyStyle}
      >
        <Spacer pointerEvents="none" />
        <Sheet>

        <Section>
          {siteDetail(site, language) ? (
            <Body1>{siteDetail(site, language)}</Body1>
          ) : siteTypeLine(site) ? (
            <TypeLine>{siteTypeLine(site)}</TypeLine>
          ) : null}
          {/* Credited under the picture it belongs to, not in a licence
              page nobody opens. CC BY-SA asks for the photographer by
              name; this is that. */}
          {site.photo ? (
            <Credit
              onPress={() =>
                site.photo.descriptionUrl &&
                Linking.openURL(site.photo.descriptionUrl)
              }
            >
              <CreditText>
                {t("tourismPhotoCredit", {
                  author: site.photo.author,
                  licence: site.photo.licence,
                })}
              </CreditText>
            </Credit>
          ) : null}
        </Section>

        {site.heritage?.length ? (
          <Section>
            <SectionTitle>{t("tourismDetailHeritage")}</SectionTitle>
            {site.heritage.map((line) => (
              <Fact key={line}>
                <Ionicons name="ribbon-outline" size={15} color={LATERITE} />
                <FactText>{line}</FactText>
              </Fact>
            ))}
          </Section>
        ) : null}

        <Section>
          <SectionTitle>{t("tourismContactTitle")}</SectionTitle>
          {/* Everything anybody has published, and a plain sentence when
              that is nothing. Five of these places have a number and the
              rest do not; inventing one, or showing a switchboard that
              closed in 2019, is how a directory stops being worth
              opening. */}
          {phones.length ? (
            <>
              {phones.map((number) => (
                <ActionRow key={number} onPress={() => Linking.openURL(`tel:${number}`)}>
                  <Ionicons name="call-outline" size={17} color={colors.primary} />
                  <ActionLabel>{number}</ActionLabel>
                  <ActionHint>{t("tourismCall")}</ActionHint>
                </ActionRow>
              ))}
              <Caveat>{t("tourismPhoneUnverified")}</Caveat>
            </>
          ) : null}
          {site.mail ? (
            <ActionRow onPress={() => Linking.openURL(`mailto:${site.mail}`)}>
              <Ionicons name="mail-outline" size={17} color={colors.primary} />
              <ActionLabel numberOfLines={1}>{site.mail}</ActionLabel>
              <ActionHint>{t("tourismEmail")}</ActionHint>
            </ActionRow>
          ) : null}
          {site.website ? (
            <ActionRow onPress={() => Linking.openURL(site.website)}>
              <Ionicons name="globe-outline" size={17} color={colors.primary} />
              <ActionLabel numberOfLines={1}>
                {site.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </ActionLabel>
              <ActionHint>{t("tourismWebsite")}</ActionHint>
            </ActionRow>
          ) : null}
          {!phones.length && !site.mail && !site.website ? (
            <Caveat>{t("tourismContactNone")}</Caveat>
          ) : null}
        </Section>

        <Section>
          <SectionTitle>{t("tourismDetailWhere")}</SectionTitle>
          <NoTariff>
            <Ionicons name="alert-circle-outline" size={14} color="#8a6415" />
            <NoTariffLabel>{t("tourismNoTariff")}</NoTariffLabel>
          </NoTariff>
          <Primary
            onPress={() =>
              Linking.openURL(
                "https://www.google.com/maps/search/?api=1&query=" +
                  encodeURIComponent(`${site.latitude},${site.longitude}`),
              )
            }
          >
            <Ionicons name="navigate-outline" size={16} color="#ffffff" />
            <PrimaryLabel>{t("tourismDirections")}</PrimaryLabel>
          </Primary>
          <CrossRow
            onPress={() => navigation.navigate("Hotels", { city: site.city })}
          >
            <Ionicons name="bed-outline" size={17} color={colors.primary} />
            <CrossLabel>{t("tourismSleepHere")}</CrossLabel>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </CrossRow>
          <CrossRow
            onPress={() =>
              navigation.navigate("Restaurants", { city: site.city })
            }
          >
            <Ionicons name="restaurant-outline" size={17} color={colors.primary} />
            <CrossLabel>{t("tourismAlongRestaurants")}</CrossLabel>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </CrossRow>
        </Section>

        {/* The question somebody standing at a place actually has. Built
            from the directory itself, so it cannot name somewhere that is
            not in it, and every row opens the same screen you are on. */}
        <Section>
          <SectionTitle>{t("tourismNearbyTitle")}</SectionTitle>
          {sitesNear(site).map((other) => (
            <ActionRow
              key={other.id}
              onPress={() =>
                navigation.push("TourismDetail", { site: other })
              }
            >
              <Ionicons
                name="location-outline"
                size={17}
                color={colors.primary}
              />
              <ActionLabel numberOfLines={1}>
                {(language === "en" ? other.nameEn : other.name) ?? other.name}
              </ActionLabel>
              <ActionHint>
                {t("tourismAwayKm", { km: Math.round(other.awayKm) })}
              </ActionHint>
            </ActionRow>
          ))}
        </Section>

        <Footer>{t("tourismSourceNote")}</Footer>
        </Sheet>
      </Body>
    </Container>
  );
}

// The banner is fixed and the page slides over it, so its height is a
// number two styles share: the hero itself, and the spacer that lets it
// show through before the sheet arrives. Declared here because a styled
// component evaluates its interpolations the moment it is created — put
// this below them and the module throws on import, before anything can
// render.
const HERO_HEIGHT = 420;

const bodyStyle = { paddingBottom: spacing.xl };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Body = styled.ScrollView`
  flex: 1;
`;

// Nothing but height: it is the window onto the fixed hero.
const Spacer = styled.View`
  height: ${HERO_HEIGHT - 28}px;
`;

// Opaque, so the hero does not show between the cards, and rounded so it
// reads as a sheet lifted over the picture rather than a gap.
const Sheet = styled.View`
  background-color: ${(props) => props.theme.background};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding-top: ${spacing.xs}px;
  min-height: 520px;
`;

// Behind the page, not part of it.
const Hero = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: ${HERO_HEIGHT}px;
  background-color: #1b1b1d;
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

// Clear of the sheet.
//
// The sheet slides up over the last 28px of the hero and rounds its own
// corners on top of that, so a caption sitting at the hero's foot lost its
// second line to it — "Place de l'Amazone · Cotonou" was half a line of
// letters behind a corner. This sits above the overlap.
const HeroFoot = styled.View`
  position: absolute;
  left: ${spacing.md}px;
  right: ${spacing.md}px;
  bottom: 52px;
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

const TypeLine = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  font-style: italic;
`;

const Credit = styled(Pressable)`
  margin-top: ${spacing.sm}px;
`;

const CreditText = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Fact = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: 4px;
`;

const FactText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
  flex: 1;
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

const Caveat = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 4px;
`;

const NoTariff = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: ${spacing.md}px;
`;

const NoTariffLabel = styled.Text`
  ${type.caption}
  color: #8a6415;
  flex: 1;
`;

const Primary = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background-color: ${LATERITE};
  border-radius: 999px;
  padding: ${spacing.sm}px ${spacing.md}px;
`;

const PrimaryLabel = styled.Text`
  ${type.button}
  color: #ffffff;
`;

const CrossRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px 0 0;
`;

const CrossLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const Footer = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin: ${spacing.md}px ${spacing.md}px 0;
`;
