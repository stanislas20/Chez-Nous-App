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
import { getGarageSpecialtyLabel } from "../data/garageSpecialties";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  airconServices,
  airconSymptoms,
  refrigerants,
  specialtiesForSymptom,
} from "../data/aircon";

// Ice, and it is the point rather than the decoration: this is the one
// vehicle screen somebody opens because they are physically uncomfortable.
const ICE = "#2C7FA6";
const DEEP = "#123A52";
const GOLD = "#D9A441";

// Climatisation.
//
// The tile used to drop the reader into the garage list filtered to "clim",
// which is a fine list and answers none of the questions they have. This
// screen answers three: what the symptom probably is, which trade fixes it,
// and — the one that saves real money — that a sealed circuit does not
// consume gas, so a car needing a recharge every few months is leaking and
// each refill is being sold the same repair twice.
export function AirconScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [symptom, setSymptom] = useState(null);
  const [gas, setGas] = useState("unknown");

  // One definition of who is a garage, shared with Garages and Dépannage.
  // A separate matcher here would drift the first time a term was added and
  // put a workshop on one screen but not the other.
  const providers = useGarageProviders(coords);
  const ratings =
    useSellerRatings(providers.map((item) => item.sellerId)) ?? {};

  // With no symptom chosen, everybody who does air conditioning. With one,
  // the trades that symptom actually needs — several of these are electrical
  // faults, and sending somebody to a refrigeration specialist for a blown
  // fuse wastes their morning.
  const wanted = useMemo(
    () => (symptom ? specialtiesForSymptom(symptom) : ["clim"]),
    [symptom],
  );

  const matching = useMemo(
    () =>
      providers
        .filter((item) => wanted.some((key) => item.specialties.includes(key)))
        .sort((a, b) => {
          if (a.openNow !== b.openNow) return a.openNow === false ? 1 : -1;
          if (a.distanceKm != null && b.distanceKm != null) {
            return a.distanceKm - b.distanceKm;
          }
          return 0;
        }),
    [providers, wanted],
  );

  const label = (item, key) =>
    language === "en" ? item[`${key}En`] : item[`${key}Fr`];

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  const openSymptom = useMemo(
    () => airconSymptoms.find((item) => item.key === symptom) ?? null,
    [symptom],
  );

  const call = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  // The message carries the symptom and the gas, because those are the two
  // things the workshop would otherwise have to ask for — and the gas is the
  // one that decides whether they can do the job at all.
  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const chosen = refrigerants.find((item) => item.key === gas);
    const message = [
      t("airconQuoteIntro"),
      openSymptom
        ? t("airconQuoteSymptom", { symptom: label(openSymptom, "label") })
        : null,
      gas !== "unknown" && chosen
        ? t("airconQuoteGas", { gas: label(chosen, "label") })
        : null,
      t("airconQuoteAsk"),
    ]
      .filter(Boolean)
      .join(" ");
    Linking.openURL(
      `${url}${url.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`,
    ).catch(() => {});
  };

  const openPostForm = () =>
    navigation.navigate("CreateListing", {
      categoryKey: "services",
      trade: "garage",
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

  const gasMeta = refrigerants.find((item) => item.key === gas);

  return (
    <Container edges={["left", "right"]}>
      <Hero
        topInset={insets.top}
        colors={["#3E9BC4", ICE, DEEP]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      >
        <HeroGlow />
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <Eyebrow>{t("airconEyebrow")}</Eyebrow>
        </HeroTop>
        <HeroTitle>{t("airconTitle")}</HeroTitle>
        <HeroCopy>{t("airconIntro")}</HeroCopy>
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* First, and deliberately. It is the one thing on this screen that
            changes what somebody agrees to pay for. */}
        <Truth>
          <TruthIcon>
            <Ionicons name="information-circle" size={18} color={ICE} />
          </TruthIcon>
          <TruthCol>
            <TruthTitle>{t("airconSealedTitle")}</TruthTitle>
            <TruthCopy>{t("airconSealedCopy")}</TruthCopy>
          </TruthCol>
        </Truth>

        <SectionTitle>{t("airconSymptomTitle")}</SectionTitle>
        {airconSymptoms.map((item) => {
          const on = item.key === symptom;
          return (
            <SymptomCard
              key={item.key}
              on={on}
              onPress={() => setSymptom(on ? null : item.key)}
            >
              <SymptomTop>
                <SymptomIcon on={on}>
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={on ? "#ffffff" : ICE}
                  />
                </SymptomIcon>
                <SymptomLabel numberOfLines={2}>
                  {label(item, "label")}
                </SymptomLabel>
                <Ionicons
                  name={on ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.textMuted}
                />
              </SymptomTop>

              {on ? (
                <SymptomBody>
                  <CausesLabel>{t("airconCausesLabel")}</CausesLabel>
                  {item.causes.map((cause) => (
                    <CauseRow key={cause.labelEn}>
                      <CauseDot />
                      <CauseText>{label(cause, "label")}</CauseText>
                      {/* Naming the trade is the useful half: half of these
                          are not refrigeration work at all. */}
                      <TradePill>
                        <TradeLabel>
                          {getGarageSpecialtyLabel(cause.specialty, language)}
                        </TradeLabel>
                      </TradePill>
                    </CauseRow>
                  ))}
                  <CausesNote>{t("airconCausesNote")}</CausesNote>
                </SymptomBody>
              ) : null}
            </SymptomCard>
          );
        })}

        <SectionLabel>{t("airconGasLabel")}</SectionLabel>
        <Segment>
          {refrigerants.map((item) => {
            const on = item.key === gas;
            return (
              <SegmentItem
                key={item.key}
                on={on}
                onPress={() => setGas(item.key)}
              >
                <SegmentLabel on={on} numberOfLines={1}>
                  {label(item, "label")}
                </SegmentLabel>
              </SegmentItem>
            );
          })}
        </Segment>
        <Note>{label(gasMeta, "note")}</Note>
        <Warn>
          <Ionicons name="warning-outline" size={15} color="#8a6415" />
          <WarnText>{t("airconGasWarn")}</WarnText>
        </Warn>

        <SectionTitle>{t("airconServicesTitle")}</SectionTitle>
        <ServiceList>
          {airconServices.map((item) => (
            <ServiceRow key={item.key}>
              <ServiceIcon>
                <Ionicons name={item.icon} size={16} color={ICE} />
              </ServiceIcon>
              <ServiceCol>
                <ServiceLabel>{label(item, "label")}</ServiceLabel>
                <ServiceNote>{label(item, "note")}</ServiceNote>
              </ServiceCol>
            </ServiceRow>
          ))}
        </ServiceList>

        <CountRow>
          <CountText>
            {openSymptom
              ? t("airconCountFor", {
                  count: matching.length,
                  symptom: label(openSymptom, "label"),
                })
              : t("airconCount", { count: matching.length })}
          </CountText>
        </CountRow>

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
                          {t("garageReviewCount", {
                            count: score.ratingCount,
                          })}
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

              {/* Which of the trades this symptom needs they actually cover.
                  With no symptom chosen there is nothing to disambiguate. */}
              {openSymptom ? (
                <TradeRow>
                  {wanted
                    .filter((key) => item.specialties.includes(key))
                    .map((key) => (
                      <CoversPill key={key}>
                        <CoversLabel>
                          {getGarageSpecialtyLabel(key, language)}
                        </CoversLabel>
                      </CoversPill>
                    ))}
                </TradeRow>
              ) : null}

              <ActionRow>
                <CallButton
                  onPress={() => call(item.phone)}
                  disabled={!item.phone}
                >
                  <Ionicons name="call" size={15} color="#ffffff" />
                  <CallLabel>{t("garageContactCall")}</CallLabel>
                </CallButton>
                {item.whatsapp || item.phone ? (
                  <GhostButton
                    onPress={() => openWhatsapp(item.whatsapp || item.phone)}
                  >
                    <Ionicons name="logo-whatsapp" size={15} color={ICE} />
                    <GhostLabel>WhatsApp</GhostLabel>
                  </GhostButton>
                ) : null}
              </ActionRow>
            </Card>
          );
        })}

        {matching.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>{t("airconNoneTitle")}</EmptyTitle>
            <EmptyCopy>{t("airconNoneCopy")}</EmptyCopy>
            {mayPublish ? (
              <PostButton onPress={startPosting}>
                <Ionicons name="add" size={16} color="#ffffff" />
                <PostLabel>{t("airconPost")}</PostLabel>
              </PostButton>
            ) : null}
          </EmptyCard>
        ) : null}

        <Safety>
          <Ionicons name="shield-outline" size={15} color="#8a6415" />
          <SafetyText>{t("airconSafety")}</SafetyText>
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

const Scroll = styled.ScrollView`
  flex: 1;
`;

const Truth = styled.View`
  flex-direction: row;
  gap: 11px;
  padding: 14px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: rgba(44, 127, 166, 0.07);
  border-width: 1px;
  border-color: rgba(44, 127, 166, 0.22);
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

const SymptomCard = styled(Pressable)`
  padding: 13px ${spacing.md}px;
  margin-bottom: 10px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.on ? ICE : props.theme.border)};
  ${shadow.card}
`;

const SymptomTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
`;

const SymptomIcon = styled.View`
  width: 36px;
  height: 36px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.on ? ICE : "rgba(44, 127, 166, 0.09)")};
`;

const SymptomLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const SymptomBody = styled.View`
  margin-top: 13px;
  padding-top: 13px;
  gap: 9px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const CausesLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
`;

const CauseRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 9px;
`;

const CauseDot = styled.View`
  width: 5px;
  height: 5px;
  border-radius: 3px;
  background-color: ${ICE};
`;

const CauseText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const TradePill = styled.View`
  padding: 4px 9px;
  border-radius: 999px;
  background-color: rgba(44, 127, 166, 0.09);
`;

const TradeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  color: ${ICE};
`;

const CausesNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const Segment = styled.View`
  flex-direction: row;
  gap: 3px;
  padding: 4px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.border};
`;

const SegmentItem = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 10px 4px;
  border-radius: ${radius.md}px;
  background-color: ${(props) =>
    props.on ? props.theme.surface : "transparent"};
`;

const SegmentLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => (props.on ? props.theme.text : props.theme.textMuted)};
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
  background-color: rgba(44, 127, 166, 0.08);
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
  background-color: rgba(44, 127, 166, 0.09);
`;

const MonoText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${ICE};
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

const TradeRow = styled.View`
  flex-direction: row;
  gap: 7px;
  flex-wrap: wrap;
  margin-bottom: 12px;
`;

const CoversPill = styled.View`
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(44, 127, 166, 0.08);
`;

const CoversLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${ICE};
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
  background-color: ${ICE};
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
  background-color: rgba(44, 127, 166, 0.07);
  border-width: 1px;
  border-color: rgba(44, 127, 166, 0.24);
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${ICE};
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

const PostButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
  padding: 12px 18px;
  border-radius: 999px;
  background-color: ${ICE};
`;

const PostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
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
