import { useMemo, useState } from "react";
import { Image, Linking, Pressable } from "react-native";
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
import { useAuth } from "../auth/AuthContext";
import { openAccountGate } from "../utils/openAccountGate";
import { canPublish } from "../utils/canPublish";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useGarageProviders } from "../hooks/useGarageProviders";
import { buildLinkUrl } from "../data/restaurantLinks";
import { countContact } from "../utils/contactCount";
import {
  getTrackerKind,
  getTrackingNeed,
  kindSuitsNeed,
  trackerKinds,
  trackingNeeds,
  trackingQuestions,
} from "../data/carTracking";

// Slate and midnight. Not the emerald everything is built from, not Clés'
// brass and not Climatisation's ice — four vehicle screens that look alike
// are four screens somebody has to read the title of to know where they are.
const SLATE = "#3F5C73";
const MIDNIGHT = "#16232E";
const TERRACOTTA = "#C1512D";
const GOLD = "#D9A441";

// GPS & traceur.
//
// The tile ran a text search of Services for "gps traceur", which finds
// whatever happens to contain those words — including, before the matcher
// learned better, every printing shop with a plotter.
//
// What the screen is for: almost every tracker needs a SIM with data and a
// platform account, so the box is bought once and the tracking is paid for
// as long as you want it to work. The advert quotes the box. Two units at
// the same price can differ threefold over three years, and a tracker whose
// SIM has lapsed is a dead weight that looks fitted — discovered, always, on
// the morning the vehicle is gone.
export function TrackingScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [need, setNeed] = useState(null);
  // Nothing preselected, for the reason Clés learned: a default is an answer
  // the reader never gave, and here it would recommend hardware.
  const [kind, setKind] = useState(null);

  // The same definition of a provider the other vehicle screens use. A
  // tracker fitter publishes an ordinary Services listing; "gps" is a
  // garage specialty like any other, and the matcher is what keeps the
  // plotters out.
  const providers = useGarageProviders(coords);
  const ratings =
    useSellerRatings(providers.map((item) => item.sellerId)) ?? {};

  const matching = useMemo(
    () =>
      providers
        .filter((item) => item.specialties.includes("gps"))
        .sort((a, b) => {
          if (a.openNow !== b.openNow) return a.openNow === false ? 1 : -1;
          if (a.distanceKm != null && b.distanceKm != null) {
            return a.distanceKm - b.distanceKm;
          }
          return 0;
        }),
    [providers],
  );

  const label = (item, key) =>
    language === "en" ? item[`${key}En`] : item[`${key}Fr`];

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  const openNeed = useMemo(() => getTrackingNeed(need), [need]);
  const kindMeta = getTrackerKind(kind);

  // Whether the chosen box answers the chosen reason. Said out loud rather
  // than left to be inferred: picking "find it after a theft" and an OBD
  // plug-in is the combination the whole screen exists to argue with.
  const mismatch = need && kind ? !kindSuitsNeed(need, kind) : false;

  const call = (phone, listing) => {
  // Counted before the phone opens: a tap here is the closest thing this
  // app has to a result, and it goes through the one helper so it cannot
  // drift from the other screens that count it.
    countContact(listing);
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  // The message carries the reason and the box, because those are the two
  // things the installer would otherwise have to ask for.
  const openWhatsapp = (value, listing) => {
    countContact(listing);
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const message = [
      t("gpsQuoteIntro"),
      openNeed ? t("gpsQuoteNeed", { need: label(openNeed, "label") }) : null,
      kindMeta ? t("gpsQuoteKind", { kind: label(kindMeta, "label") }) : null,
      t("gpsQuoteAsk"),
    ]
      .filter(Boolean)
      .join(" ");
    Linking.openURL(`${url}?text=${encodeURIComponent(message)}`).catch(
      () => {},
    );
  };

  const openPostForm = () =>
    navigation.navigate("CreateListing", {
      categoryKey: "services",
      trade: "gps",
    });

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

  return (
    <Container edges={["left", "right"]}>
      <Hero
        topInset={insets.top}
        colors={["#5A7C96", SLATE, MIDNIGHT]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      >
        <HeroGlow />
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <Eyebrow>{t("gpsEyebrow")}</Eyebrow>
        </HeroTop>
        <HeroTitle>{t("gpsTitle")}</HeroTitle>
        <HeroCopy>{t("gpsIntro")}</HeroCopy>

        {/* In the hero, which does not scroll. See HeroPostBar. */}
        {mayPublish ? (
          <HeroPostBar onPress={startPosting}>
            <HeroPostDisc>
              <Ionicons name="navigate" size={15} color={MIDNIGHT} />
            </HeroPostDisc>
            <HeroPostLabel numberOfLines={1}>
              {t("gpsPostPrompt")}
            </HeroPostLabel>
            <HeroPostCta>
              <HeroPostCtaLabel>{t("gpsPost")}</HeroPostCtaLabel>
            </HeroPostCta>
          </HeroPostBar>
        ) : null}
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle>{t("gpsNeedTitle")}</SectionTitle>
        <NeedGrid>
          {trackingNeeds.map((item) => {
            const on = item.key === need;
            return (
              <NeedCard
                key={item.key}
                on={on}
                onPress={() => setNeed(on ? null : item.key)}
              >
                <NeedIcon on={on} urgent={item.urgent}>
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={on ? "#ffffff" : item.urgent ? TERRACOTTA : SLATE}
                  />
                </NeedIcon>
                <NeedLabel numberOfLines={2}>{label(item, "label")}</NeedLabel>
                <NeedHint numberOfLines={2}>{label(item, "hint")}</NeedHint>
              </NeedCard>
            );
          })}
        </NeedGrid>

        {openNeed ? (
          <Truth>
            <TruthIcon>
              <Ionicons
                name={openNeed.urgent ? "warning" : "information-circle"}
                size={18}
                color={openNeed.urgent ? TERRACOTTA : SLATE}
              />
            </TruthIcon>
            <TruthCol>
              <TruthTitle>{label(openNeed, "label")}</TruthTitle>
              <TruthCopy>{label(openNeed, "note")}</TruthCopy>
            </TruthCol>
          </Truth>
        ) : null}

        <SectionLabel>{t("gpsKindLabel")}</SectionLabel>
        <ServiceList>
          {trackerKinds.map((item) => {
            const on = item.key === kind;
            // Marked while a reason is chosen, so the recommendation is
            // visible before the tap rather than only after it.
            const suits = need ? kindSuitsNeed(need, item.key) : null;
            return (
              <KindRow
                key={item.key}
                on={on}
                onPress={() => setKind(on ? null : item.key)}
              >
                <ServiceIcon>
                  <Ionicons
                    name={item.icon}
                    size={16}
                    color={on ? "#ffffff" : SLATE}
                  />
                </ServiceIcon>
                <ServiceCol>
                  <KindTop>
                    <ServiceLabel>{label(item, "label")}</ServiceLabel>
                    {suits === true ? (
                      <SuitsPill>
                        <SuitsLabel>{t("gpsKindSuits")}</SuitsLabel>
                      </SuitsPill>
                    ) : null}
                  </KindTop>
                  <ServiceNote>{label(item, "hint")}</ServiceNote>
                </ServiceCol>
              </KindRow>
            );
          })}
        </ServiceList>

        {kindMeta ? <Note>{label(kindMeta, "note")}</Note> : null}

        {/* The combination the screen exists to argue with: an OBD box
            bought to survive a theft. Said plainly, and it does not block —
            somebody may have a reason, and this is advice rather than a
            gate. */}
        {mismatch && openNeed && kindMeta ? (
          <Warn>
            <Ionicons name="warning-outline" size={15} color="#8a6415" />
            <WarnText>
              {t("gpsMismatch", {
                kind: label(kindMeta, "label"),
                need: label(openNeed, "label"),
              })}
            </WarnText>
          </Warn>
        ) : null}

        {/* Where Clés shows prices, this shows the questions that decide
            them. No figures: none were supplied for this trade, and a range
            invented here would be quoted back at an installer who never
            agreed to it. */}
        <SectionTitle>{t("gpsAskTitle")}</SectionTitle>
        <ServiceList>
          {trackingQuestions.map((item) => (
            <ServiceRow key={item.key}>
              <ServiceIcon>
                <Ionicons name={item.icon} size={16} color={SLATE} />
              </ServiceIcon>
              <ServiceCol>
                <ServiceLabel>{label(item, "label")}</ServiceLabel>
                <ServiceNote>{label(item, "note")}</ServiceNote>
              </ServiceCol>
            </ServiceRow>
          ))}
        </ServiceList>
        <Note>{t("gpsAskNote")}</Note>

        {matching.length ? (
          <CountRow>
            <CountText>{t("gpsCount", { count: matching.length })}</CountText>
          </CountRow>
        ) : null}

        {matching.map((item) => {
          const score = ratings[item.sellerId];
          return (
            <Card key={item.id}>
              <CardTop>
                {item.photoUrl ? (
                  <Portrait
                    source={{ uri: item.photoUrl }}
                    resizeMode="cover"
                  />
                ) : (
                  <Mono>
                    <MonoText>
                      {(title(item) || "?").slice(0, 2).toUpperCase()}
                    </MonoText>
                  </Mono>
                )}
                <CardTitleCol>
                  <CardTitle numberOfLines={2}>{title(item)}</CardTitle>
                  <RatingRow>
                    {score ? (
                      <>
                        <Ionicons name="star" size={12} color={GOLD} />
                        <RatingText>
                          {score.rating.toFixed(1).replace(".", ",")}
                        </RatingText>
                        <ReviewText>
                          {t("garageReviewCount", { count: score.ratingCount })}
                        </ReviewText>
                      </>
                    ) : (
                      <ReviewText>{t("garageNoRating")}</ReviewText>
                    )}
                  </RatingRow>
                </CardTitleCol>
              </CardTop>

              <MetaRow>
                {item.openNow != null ? (
                  <OpenPill open={item.openNow}>
                    <OpenDot open={item.openNow} />
                    <OpenLabel open={item.openNow}>
                      {!item.openNow
                        ? t("garageClosed")
                        : item.closeTime
                          ? t("garageOpenUntil", { time: item.closeTime })
                          : t("tyreOpenNow")}
                    </OpenLabel>
                  </OpenPill>
                ) : null}
                {item.place ? (
                  <MetaItem>
                    <Ionicons
                      name="location-outline"
                      size={11}
                      color={colors.textMuted}
                    />
                    <MetaText numberOfLines={1}>
                      {item.distanceKm != null
                        ? `${item.place} · ${item.distanceKm.toFixed(1)} km`
                        : item.place}
                    </MetaText>
                  </MetaItem>
                ) : null}
              </MetaRow>

              <ActionRow>
                <CallButton
                  onPress={() => call(item.phone, item)}
                  disabled={!item.phone}
                >
                  <Ionicons name="call" size={15} color="#ffffff" />
                  <CallLabel>{t("garageContactCall")}</CallLabel>
                </CallButton>
                {item.whatsapp || item.phone ? (
                  <GhostButton
                    onPress={() => openWhatsapp(item.whatsapp || item.phone, item)}
                  >
                    <Ionicons name="logo-whatsapp" size={15} color={SLATE} />
                    <GhostLabel>WhatsApp</GhostLabel>
                  </GhostButton>
                ) : null}
              </ActionRow>
            </Card>
          );
        })}

        {matching.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>{t("gpsNoneTitle")}</EmptyTitle>
            <EmptyCopy>{t("gpsNoneCopy")}</EmptyCopy>
          </EmptyCard>
        ) : null}

        {/* The one thing on this screen that can hurt somebody, kept apart
            from the buying questions and placed last, where the safety note
            sits on every other vehicle screen. */}
        <SectionTitle>{t("gpsCutoffTitle")}</SectionTitle>
        <Truth>
          <TruthIcon>
            <Ionicons name="warning" size={18} color={TERRACOTTA} />
          </TruthIcon>
          <TruthCol>
            <TruthTitle>{t("gpsCutoffHeading")}</TruthTitle>
            <TruthCopy>{t("gpsCutoffCopy")}</TruthCopy>
          </TruthCol>
        </Truth>

        <Safety>
          <Ionicons name="shield-outline" size={15} color="#8a6415" />
          <SafetyText>{t("gpsSafety")}</SafetyText>
        </Safety>
      </Scroll>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px
    ${spacing.lg}px;
`;

const HeroGlow = styled.View`
  position: absolute;
  top: -150px;
  right: -70px;
  width: 260px;
  height: 260px;
  border-radius: 130px;
  background-color: rgba(190, 230, 245, 0.2);
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

const Eyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.72);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 25px;
  line-height: 30px;
  color: #ffffff;
  margin-bottom: 8px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 19px;
  max-width: 300px;
  color: rgba(255, 255, 255, 0.7);
`;

// White on the gradient, the way HireBar sits on the emerald header: the
// hero's own palette is three blues, and a fourth blue button on it would
// be the least visible thing in the block.
const HeroPostBar = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-top: ${spacing.md}px;
  padding: 7px 7px 7px 9px;
  border-radius: 999px;
  background-color: #ffffff;
`;

const HeroPostDisc = styled.View`
  width: 30px;
  height: 30px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: rgba(19, 78, 102, 0.12);
`;

const HeroPostLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${MIDNIGHT};
`;

const HeroPostCta = styled.View`
  padding: 7px 14px;
  border-radius: 999px;
  background-color: ${MIDNIGHT};
`;

const HeroPostCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const Truth = styled.View`
  flex-direction: row;
  gap: 11px;
  padding: 14px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: rgba(63, 92, 115, 0.07);
  border-width: 1px;
  border-color: rgba(63, 92, 115, 0.22);
`;

const TruthIcon = styled.View`
  margin-top: 1px;
`;

const TruthCol = styled.View`
  flex: 1;
  gap: 4px;
`;

const TruthTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const TruthCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.lg}px;
  margin-bottom: 12px;
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.lg}px;
  margin-bottom: 10px;
`;

// Two across. Six needs in one column is a lot of scrolling before the
// question is even answered, and the labels are short enough to pair.
const NeedGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const NeedCard = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  padding: 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.on ? "rgba(168, 118, 42, 0.1)" : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.on ? SLATE : props.theme.border)};
`;

const NeedIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  margin-bottom: 9px;
  background-color: ${(props) =>
    props.on
      ? props.urgent
        ? TERRACOTTA
        : SLATE
      : props.urgent
        ? "rgba(193, 81, 45, 0.12)"
        : "rgba(168, 118, 42, 0.12)"};
`;

const NeedLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const NeedHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const Note = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 10px;
`;

const Warn = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  margin-top: 11px;
  padding: 12px ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(224, 164, 21, 0.09);
  border-width: 1px;
  border-color: rgba(224, 164, 21, 0.26);
`;

const WarnText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #7a5a12;
`;

const ServiceList = styled.View`
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  overflow: hidden;
`;

// A ServiceRow that can be chosen. Same geometry as the rows around it, so
// the list reads as one thing, with the selected state carried by the
// surface rather than by a control bolted onto the side.
const KindRow = styled(Pressable)`
  flex-direction: row;
  align-items: flex-start;
  gap: 11px;
  padding: 13px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
  background-color: ${(props) =>
    props.on ? "rgba(63, 92, 115, 0.09)" : "transparent"};
`;

const KindTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 7px;
`;

// Marked before the tap, not after: the point is to steer the choice, and a
// recommendation that only appears once you have chosen has steered nothing.
const SuitsPill = styled.View`
  padding: 2px 7px;
  border-radius: ${radius.pill}px;
  background-color: rgba(63, 92, 115, 0.12);
`;

const SuitsLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  color: ${SLATE};
`;

const ServiceRow = styled.View`
  flex-direction: row;
  gap: 12px;
  padding: 13px ${spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const ServiceIcon = styled.View`
  width: 32px;
  height: 32px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: rgba(63, 92, 115, 0.08);
`;

const ServiceCol = styled.View`
  flex: 1;
  gap: 3px;
`;

const ServiceLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const ServiceNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const CountRow = styled.View`
  margin-top: ${spacing.lg}px;
  margin-bottom: 12px;
`;

const CountText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Card = styled.View`
  padding: ${spacing.md}px;
  margin-bottom: 14px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
`;

const Portrait = styled(Image)`
  width: 46px;
  height: 46px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.border};
`;

const Mono = styled.View`
  width: 46px;
  height: 46px;
  border-radius: ${radius.lg}px;
  align-items: center;
  justify-content: center;
  background-color: rgba(63, 92, 115, 0.09);
`;

const MonoText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${SLATE};
`;

const CardTitleCol = styled.View`
  flex: 1;
  gap: 5px;
`;

const CardTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const RatingRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const RatingText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const ReviewText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`;

const OpenPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  background-color: ${(props) =>
    props.open ? "rgba(18,161,80,0.08)" : "rgba(0,0,0,0.04)"};
`;

const OpenDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => (props.open ? "#12A150" : "#B0B0B4")};
`;

const OpenLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => (props.open ? "#0B6E4F" : props.theme.textMuted)};
`;

const MetaItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  flex-shrink: 1;
`;

const MetaText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const CallButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  border-radius: 999px;
  background-color: ${SLATE};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
`;

const GhostButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  border-radius: 999px;
  background-color: rgba(63, 92, 115, 0.07);
  border-width: 1px;
  border-color: rgba(63, 92, 115, 0.24);
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${SLATE};
`;

const EmptyCard = styled.View`
  padding: ${spacing.lg}px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  align-items: center;
  gap: 9px;
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
`;

const Safety = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  margin-top: ${spacing.lg}px;
  padding: 14px ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(224, 164, 21, 0.1);
  border-width: 1px;
  border-color: rgba(224, 164, 21, 0.28);
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;
