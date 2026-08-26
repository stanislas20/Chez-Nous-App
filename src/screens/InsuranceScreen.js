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
import { HeroPostBar } from "../components/HeroPostBar";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useVehiclePapers } from "../hooks/useVehiclePapers";
import {
  filterInsurers,
  insurancePriceFor,
  useInsurers,
} from "../hooks/useInsurers";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  formulasFor,
  insuranceDurations,
  insuranceVehicles,
  powerBands,
} from "../data/insurance";
import { getPaperKind, paperStatus } from "../data/vehiclePapers";

// Indigo, and the reason is the same as the wash screen's teal: this is not
// a repair errand. Nothing here is fixed, nothing is fitted; it is paperwork
// and money, and the colour says so before the words do.
const INDIGO = "#4A4FA6";
const INK = "#3A3F72";
const GOLD = "#D9A441";

// Comparer avant de renouveler.
//
// A motor premium is not one number, and that is the whole design: it falls
// out of the vehicle, its fiscal horsepower, the term and the formula. Fix
// those four and two agencies are finally answering the same question. Leave
// them loose and "c'est combien ?" gets three incomparable answers.
//
// What the screen must never do is answer it itself. The premium also turns
// on the value of the vehicle and on the reader's own record, and only an
// insurer can price that — so every figure here was declared by the agency
// showing it, or there is no figure.
export function InsuranceScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();
  const { papers } = useVehiclePapers();

  const [vehicle, setVehicle] = useState("car");
  const [band, setBand] = useState("mid");
  const [months, setMonths] = useState(12);
  const [formula, setFormula] = useState("extended");
  const [openFormula, setOpenFormula] = useState("extended");

  const providers = useInsurers(coords);
  const ratings =
    useSellerRatings(providers.map((item) => item.sellerId)) ?? {};

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // The one date on this screen we are entitled to state, and only because
  // the reader typed it into Papiers & contrôle themselves. No entry, no
  // banner — an invented "expires in 18 days" would be the exact kind of
  // urgency this screen exists to argue against.
  const cover = useMemo(() => {
    const stored = papers?.insurance;
    if (!stored) return null;
    const kind = getPaperKind("insurance");
    const status = paperStatus(kind, stored, today);
    if (status.state === "unknown") return null;
    return status;
  }, [papers, today]);

  const vehicleMeta = insuranceVehicles.find((item) => item.key === vehicle);
  const ratedByPower = vehicleMeta?.ratedByPower === true;

  // Comprehensive is not written on two-wheelers or on passenger transport
  // by most insurers here, so the choice disappears rather than being
  // offered and refused at the counter.
  const formulas = useMemo(() => formulasFor(vehicle), [vehicle]);
  const activeFormula = formulas.some((item) => item.key === formula)
    ? formula
    : (formulas[0]?.key ?? null);

  const matching = useMemo(
    () =>
      filterInsurers(providers, {
        vehicle,
        formula: activeFormula,
        months,
      }),
    [providers, vehicle, activeFormula, months],
  );

  const label = (item, key) =>
    language === "en" ? item[`${key}En`] : item[`${key}Fr`];

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  const formatPrice = (value) =>
    `${Number(value).toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;

  const call = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  // The message carries all four answers, which is the point of having
  // asked for them: the agency can quote without a round of questions, and
  // the reader can put the same message to the next agency unchanged.
  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const chosen = formulas.find((item) => item.key === activeFormula);
    const duration = insuranceDurations.find((item) => item.months === months);
    const message = [
      t("insureQuoteIntro"),
      t("insureQuoteVehicle", { vehicle: label(vehicleMeta, "label") }),
      ratedByPower
        ? t("insureQuotePower", {
            band: label(
              powerBands.find((item) => item.key === band),
              "label",
            ),
          })
        : null,
      chosen
        ? t("insureQuoteFormula", { formula: label(chosen, "label") })
        : null,
      duration
        ? t("insureQuoteTerm", { term: label(duration, "label") })
        : null,
      t("insureQuoteAsk"),
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
      trade: "insurance",
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
        colors={["#5157B0", INK, "#1B1E38"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      >
        <HeroGlow />
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <Eyebrow>{t("insureEyebrow")}</Eyebrow>
        </HeroTop>

        {/* Only ever shown from a date the reader entered themselves. */}
        {cover ? (
          <CoverPill state={cover.state}>
            <CoverDot state={cover.state} />
            <CoverLabel>
              {cover.state === "expired"
                ? t("insureCoverExpired", { days: -cover.days })
                : t("insureCoverLeft", { days: cover.days })}
            </CoverLabel>
          </CoverPill>
        ) : null}

        <HeroTitle>{t("insureTitle")}</HeroTitle>
        <HeroCopy>{t("insureIntro")}</HeroCopy>
        {/* In the hero, which does not scroll. See HeroPostBar for why
            every vertical in the app now does this. */}
        {mayPublish ? (
          <HeroPostBar
            icon="shield-checkmark-outline"
            ink={INDIGO}
            label={t("insurePostPrompt")}
            cta={t("heroPostCta")}
            onPress={startPosting}
          />
        ) : null}
      </Hero>

      {/* Astride the banner's edge, and a SIBLING of the scroll view rather
          than its first child. A negative margin inside a ScrollView is
          clipped by the scroll view's own top edge — the dock does not ride
          up over the banner, it just loses its first 30px. */}
      <VehicleDock>
        {insuranceVehicles.map((item) => {
          const on = item.key === vehicle;
          return (
            <VehicleCard
              key={item.key}
              on={on}
              onPress={() => setVehicle(item.key)}
            >
              <Ionicons
                name={item.icon}
                size={19}
                color={on ? "#ffffff" : colors.textMuted}
              />
              <VehicleLabel on={on} numberOfLines={2}>
                {label(item, "label")}
              </VehicleLabel>
            </VehicleCard>
          );
        })}
      </VehicleDock>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Only where it is actually the rating basis. A two-wheeler is
            rated on engine size, and asking for a CV band would be asking
            for a figure the reader's papers do not contain. */}
        {ratedByPower ? (
          <>
            <SectionLabel>{t("insurePowerLabel")}</SectionLabel>
            <Segment>
              {powerBands.map((item) => {
                const on = item.key === band;
                return (
                  <SegmentItem
                    key={item.key}
                    on={on}
                    onPress={() => setBand(item.key)}
                  >
                    <SegmentLabel on={on}>{label(item, "label")}</SegmentLabel>
                  </SegmentItem>
                );
              })}
            </Segment>
            <Note>{t("insurePowerNote")}</Note>
          </>
        ) : (
          <Note>{t("insureMotoNote")}</Note>
        )}

        <SectionLabel>{t("insureTermLabel")}</SectionLabel>
        <Segment>
          {insuranceDurations.map((item) => {
            const on = item.months === months;
            return (
              <SegmentItem
                key={item.months}
                on={on}
                onPress={() => setMonths(item.months)}
              >
                <SegmentLabel on={on}>{label(item, "label")}</SegmentLabel>
              </SegmentItem>
            );
          })}
        </Segment>
        {/* The short terms are not a discount, they are the opposite, and
            somebody choosing one should know that is what they are doing. */}
        <Note>
          {months === 12 ? t("insureTermYearNote") : t("insureTermShortNote")}
        </Note>

        <SectionTitle>{t("insureFormulaTitle")}</SectionTitle>
        {formulas.map((item) => {
          const on = item.key === activeFormula;
          const expanded = item.key === openFormula;
          return (
            <FormulaCard
              key={item.key}
              on={on}
              onPress={() => {
                setFormula(item.key);
                setOpenFormula(expanded ? null : item.key);
              }}
            >
              <FormulaTop>
                <Radio on={on}>{on ? <RadioDot /> : null}</Radio>
                <FormulaCol>
                  <FormulaTag on={on}>{label(item, "tag")}</FormulaTag>
                  <FormulaLabel>{label(item, "label")}</FormulaLabel>
                </FormulaCol>
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={17}
                  color={colors.textMuted}
                />
              </FormulaTop>

              {expanded ? (
                <FormulaBody>
                  {label(item, "covers").map((line) => (
                    <CoverRow key={line}>
                      <Ionicons name="checkmark" size={14} color={INDIGO} />
                      <CoverText>{line}</CoverText>
                    </CoverRow>
                  ))}
                  {/* What it does NOT do, given the same weight. This is the
                      half people are sold past. */}
                  {label(item, "misses").map((line) => (
                    <CoverRow key={line}>
                      <Ionicons
                        name="close"
                        size={14}
                        color={colors.textMuted}
                      />
                      <MissText>{line}</MissText>
                    </CoverRow>
                  ))}
                  {item.warnEn ? (
                    <FormulaWarn>
                      <Ionicons
                        name="alert-circle-outline"
                        size={14}
                        color="#8a6415"
                      />
                      <FormulaWarnText>{label(item, "warn")}</FormulaWarnText>
                    </FormulaWarn>
                  ) : null}
                </FormulaBody>
              ) : null}
            </FormulaCard>
          );
        })}

        <Caveat>
          <Ionicons name="document-text-outline" size={15} color="#8a6415" />
          <CaveatText>{t("insureFormulaCaveat")}</CaveatText>
        </Caveat>

        <CountRow>
          <CountText>
            {t("insureCount", {
              count: matching.length,
              formula: label(
                formulas.find((item) => item.key === activeFormula) ??
                  formulas[0],
                "label",
              ),
            })}
          </CountText>
        </CountRow>

        {matching.map((item) => {
          const price = insurancePriceFor(item, activeFormula, vehicle, months);
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
                    {item.sellerVerified ? (
                      <VerifiedBadge>
                        <VerifiedLabel>{t("garageVerified")}</VerifiedLabel>
                      </VerifiedBadge>
                    ) : null}
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
                {item.insuranceMobileMoney ? (
                  <MomoPill>
                    <Ionicons
                      name="phone-portrait-outline"
                      size={11}
                      color={INDIGO}
                    />
                    <MomoLabel>{t("insureMobileMoney")}</MomoLabel>
                  </MomoPill>
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

              {/* Their premium for this cover, this vehicle and this term.
                  Never scaled from the annual figure, never an average of
                  the others, and absent where they left it blank. */}
              <PriceRow>
                {price != null ? (
                  <>
                    <Price>{formatPrice(price)}</Price>
                    <PriceUnit>{t("insurePriceTerm", { months })}</PriceUnit>
                  </>
                ) : (
                  <PriceOnAsking>{t("insurePriceOnAsking")}</PriceOnAsking>
                )}
              </PriceRow>

              {item.insuranceDelivery ? (
                <DetailLine numberOfLines={2}>
                  {item.insuranceDelivery}
                </DetailLine>
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
                    <Ionicons name="logo-whatsapp" size={15} color={INDIGO} />
                    <GhostLabel>WhatsApp</GhostLabel>
                  </GhostButton>
                ) : null}
              </ActionRow>
            </Card>
          );
        })}

        {matching.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>{t("insureNoneTitle")}</EmptyTitle>
            <EmptyCopy>{t("insureNoneCopy")}</EmptyCopy>
            {/* No button here: the hero's is on screen already, and this
                one only ever appeared when no agency matched — so it
                vanished exactly as the screen filled up. */}
          </EmptyCard>
        ) : null}

        <Safety>
          <Ionicons name="shield-outline" size={15} color="#8a6415" />
          <SafetyText>{t("insureSafety")}</SafetyText>
        </Safety>
      </Scroll>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// Same curve and the same arithmetic as every other vehicle banner: 54px of
// bottom padding, of which the dock takes back 30, leaving 24 clear.
const Hero = styled(LinearGradient)`
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px 54px;
`;

const HeroGlow = styled.View`
  position: absolute;
  top: -150px;
  right: -70px;
  width: 260px;
  height: 260px;
  border-radius: 130px;
  background-color: rgba(150, 156, 235, 0.2);
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

const CoverPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  margin-bottom: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.12);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.2);
`;

const CoverDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) =>
    props.state === "expired"
      ? "#FF8A5B"
      : props.state === "soon"
        ? GOLD
        : "#7BD8A8"};
`;

const CoverLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.9);
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
  color: rgba(255, 255, 255, 0.68);
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

// Straddles the banner's curve, like the wash and papers docks.
const VehicleDock = styled.View`
  z-index: 2;
  flex-direction: row;
  gap: 8px;
  margin-top: -30px;
  padding: 0px ${spacing.md}px;
`;

const VehicleCard = styled(Pressable)`
  flex: 1;
  align-items: center;
  gap: 7px;
  padding: 13px 5px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => (props.on ? INK : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.on ? INK : props.theme.border)};
  ${shadow.card}
`;

const VehicleLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  text-align: center;
  color: ${(props) => (props.on ? "#ffffff" : props.theme.textMuted)};
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 10px;
  margin-top: ${spacing.md}px;
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.lg}px;
  margin-bottom: 12px;
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
  background-color: ${(props) => (props.on ? props.theme.surface : "transparent")};
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

const FormulaCard = styled(Pressable)`
  padding: 15px ${spacing.md}px;
  margin-bottom: 11px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.on ? INDIGO : props.theme.border)};
  ${shadow.card}
`;

const FormulaTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
`;

const Radio = styled.View`
  width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  border-width: 1.5px;
  border-color: ${(props) => (props.on ? INDIGO : props.theme.border)};
`;

const RadioDot = styled.View`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${INDIGO};
`;

const FormulaCol = styled.View`
  flex: 1;
  gap: 4px;
`;

const FormulaTag = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: ${(props) => (props.on ? INDIGO : props.theme.textMuted)};
`;

const FormulaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const FormulaBody = styled.View`
  margin-top: 13px;
  padding-top: 13px;
  gap: 8px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const CoverRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
`;

const CoverText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
`;

const MissText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const FormulaWarn = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  margin-top: 5px;
  padding: 11px 13px;
  border-radius: ${radius.lg}px;
  background-color: rgba(224, 164, 21, 0.09);
  border-width: 1px;
  border-color: rgba(224, 164, 21, 0.26);
`;

const FormulaWarnText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #7a5a12;
`;

const Caveat = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 13px ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(224, 164, 21, 0.09);
  border-width: 1px;
  border-color: rgba(224, 164, 21, 0.26);
`;

const CaveatText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #7a5a12;
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
  background-color: rgba(74, 79, 166, 0.09);
  border-width: 1px;
  border-color: rgba(74, 79, 166, 0.16);
`;

const MonoText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${INDIGO};
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

const VerifiedBadge = styled.View`
  padding: 4px 9px;
  border-radius: 999px;
  background-color: rgba(74, 79, 166, 0.09);
`;

const VerifiedLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  color: ${INDIGO};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin-bottom: 12px;
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

const MomoPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(74, 79, 166, 0.08);
`;

const MomoLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${INDIGO};
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

const PriceRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 7px;
  margin-bottom: 8px;
`;

const Price = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 20px;
  color: ${(props) => props.theme.text};
`;

const PriceUnit = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const PriceOnAsking = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.textMuted};
`;

const DetailLine = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
  margin-bottom: 12px;
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
  background-color: ${INK};
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
  background-color: rgba(74, 79, 166, 0.07);
  border-width: 1px;
  border-color: rgba(74, 79, 166, 0.24);
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${INDIGO};
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
