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
import {
  filterWashProviders,
  useCarWash,
  washPriceFor,
} from "../hooks/useCarWash";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  getWashFormulaDuration,
  getWashFormulaLabel,
  getWashFormulaNote,
  getWashVehicleLabel,
  washFormulasFor,
  washModes,
  washVehicles,
} from "../data/carWash";

// Teal, and the only screen in the app that uses it.
//
// Every other vehicle screen opens in the same emerald, which is right when
// they are variations on one errand. This one is water, and a reader who has
// been through four green banners registers the change before they read a
// word of it.
const TEAL = "#0E6E8C";
const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// How much does a wash cost.
//
// The question has no single answer and the screen is built around admitting
// that: the price falls out of what you drive and what you are asking for, so
// both are chosen before anybody is listed, and each washer answers for that
// exact combination or says they have not priced it.
export function CarWashScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [mode, setMode] = useState("station");
  const [vehicle, setVehicle] = useState("berline");
  const [formula, setFormula] = useState("ext");

  const providers = useCarWash(coords);
  const ratings = useSellerRatings(providers.map((item) => item.sellerId));

  // A motorbike has no seats to shampoo and a courtyard has no roof for
  // ceramic. The list of formulas narrows to what the two earlier choices
  // leave standing, rather than offering something and refusing it later.
  const formulas = useMemo(
    () => washFormulasFor(vehicle, mode),
    [vehicle, mode],
  );

  const activeFormula = formulas.some((item) => item.key === formula)
    ? formula
    : (formulas[0]?.key ?? null);

  const matching = useMemo(
    () =>
      filterWashProviders(providers, {
        mode,
        vehicle,
        formula: activeFormula,
      }),
    [providers, mode, vehicle, activeFormula],
  );

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  const call = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const message = [
      t("washQuoteIntro"),
      t("washQuoteJob", {
        formula: getWashFormulaLabel(activeFormula, language),
        vehicle: getWashVehicleLabel(vehicle, language),
      }),
      mode === "domicile" ? t("washQuoteHome") : null,
      t("washQuoteAsk"),
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
      trade: "wash",
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

  const switchVehicle = (key) => {
    if (key === vehicle) return;
    setVehicle(key);
  };

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#0E6E8C", "#0A4A61", "#062E3D"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroGlow />
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("washEyebrow")}</HeroEyebrow>
        </HeroTop>

        <HeroTitle>{t("washTitle")}</HeroTitle>
        <HeroCopy>{t("washIntro")}</HeroCopy>
      </Hero>

      {/* Where the work happens, first, because it removes two formulas and
          changes who can serve you at all. It sits astride the banner's edge
          rather than inside it: one control on one card, instead of two pale
          rectangles floating in a field of teal. */}
      <ModeDock>
        <ModeCard>
          {washModes.map((option) => {
            const active = mode === option.key;
            return (
              <ModeTab
                key={option.key}
                active={active}
                onPress={() => setMode(option.key)}
              >
                <ModeIcon active={active}>
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={active ? "#ffffff" : colors.textMuted}
                  />
                </ModeIcon>
                <ModeCol>
                  <ModeLabel active={active} numberOfLines={1}>
                    {language === "en" ? option.labelEn : option.labelFr}
                  </ModeLabel>
                  <ModeHint active={active} numberOfLines={1}>
                    {language === "en" ? option.hintEn : option.hintFr}
                  </ModeHint>
                </ModeCol>
              </ModeTab>
            );
          })}
        </ModeCard>
      </ModeDock>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>{t("washVehicleLabel")}</SectionLabel>
        <VehicleRow>
          {washVehicles.map((option) => {
            const active = vehicle === option.key;
            return (
              <VehicleTile
                key={option.key}
                active={active}
                onPress={() => switchVehicle(option.key)}
              >
                <Ionicons
                  name={option.icon}
                  size={19}
                  color={active ? "#ffffff" : colors.textMuted}
                />
                <VehicleLabel active={active} numberOfLines={1}>
                  {language === "en" ? option.labelEn : option.labelFr}
                </VehicleLabel>
              </VehicleTile>
            );
          })}
        </VehicleRow>

        <SectionLabel>{t("washFormulaLabel")}</SectionLabel>
        <FormulaList>
          {formulas.map((option) => {
            const active = activeFormula === option.key;
            return (
              <FormulaRow
                key={option.key}
                active={active}
                onPress={() => setFormula(option.key)}
              >
                <FormulaIcon active={active}>
                  <Ionicons
                    name={option.icon}
                    size={17}
                    color={active ? TEAL : colors.textMuted}
                  />
                </FormulaIcon>
                <FormulaCol>
                  <FormulaName active={active}>
                    {language === "en" ? option.labelEn : option.labelFr}
                  </FormulaName>
                  <FormulaDetail numberOfLines={2}>
                    {language === "en" ? option.detailEn : option.detailFr}
                  </FormulaDetail>
                </FormulaCol>
                {/* How long the work takes, which is a fact about the work
                    and not a promise from any provider — so it sits with the
                    formula, never on a card. */}
                <FormulaDuration>
                  {getWashFormulaDuration(option.key, language)}
                </FormulaDuration>
              </FormulaRow>
            );
          })}
        </FormulaList>

        {/* The note changes with the choice, and it is the part of this
            screen worth reading: what to ask, and what goes wrong. */}
        {activeFormula ? (
          <FormulaNote>
            {getWashFormulaNote(activeFormula, language)}
          </FormulaNote>
        ) : null}

        {mode === "domicile" ? (
          <HomeNote>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={TEAL}
            />
            <HomeNoteText>{t("washHomeLimitNote")}</HomeNoteText>
          </HomeNote>
        ) : null}

        <CountRow>
          <CountText numberOfLines={2}>
            {t("washCount", {
              count: matching.length,
              vehicle: getWashVehicleLabel(vehicle, language),
            })}
          </CountText>
          <SortNote>{t("washCheapestFirst")}</SortNote>
        </CountRow>

        {matching.map((item) => {
          const score = ratings[item.sellerId];
          const price = washPriceFor(item, activeFormula, vehicle);
          return (
            <Card
              key={item.id}
              onPress={() =>
                navigation.navigate("ProductDetail", { listing: item })
              }
            >
              <CardTop>
                {item.photoUrl ? (
                  <Portrait
                    source={{ uri: item.photoUrl }}
                    resizeMode="cover"
                  />
                ) : (
                  <Monogram>
                    <MonogramLabel>
                      {(title(item) || "?").slice(0, 2).toUpperCase()}
                    </MonogramLabel>
                  </Monogram>
                )}
                <CardTitleCol>
                  <ShopName numberOfLines={1}>{title(item)}</ShopName>
                  <RatingRow>
                    {score ? (
                      <>
                        <Ionicons name="star" size={12} color={GOLD} />
                        <RatingValue>
                          {score.rating.toFixed(1).replace(".", ",")}
                        </RatingValue>
                        <MetaText>
                          {t("garageReviewCount", { count: score.ratingCount })}
                        </MetaText>
                      </>
                    ) : (
                      <MetaText>{t("garageNoRating")}</MetaText>
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
                {item.washByAppointment ? (
                  <AppointmentPill>
                    <AppointmentLabel>
                      {t("washByAppointment")}
                    </AppointmentLabel>
                  </AppointmentPill>
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

              {/* Their price for this formula on this vehicle and nothing
                  else. No average, no nearby cell, and no number at all
                  where they left it blank. */}
              <PriceRow>
                {price != null ? (
                  <>
                    <Price>{formatPrice(price)}</Price>
                    <PriceUnit>
                      {t("washPriceFor", {
                        vehicle: getWashVehicleLabel(vehicle, language),
                      })}
                    </PriceUnit>
                  </>
                ) : (
                  <PriceOnAsking>{t("washPriceOnAsking")}</PriceOnAsking>
                )}
              </PriceRow>

              {mode === "domicile" && item.washHomeFee != null ? (
                <HomeFeeRow>
                  <Ionicons name="car-outline" size={13} color={TEAL} />
                  <HomeFeeText>
                    {t("washHomeFee", {
                      fee: formatPrice(Number(item.washHomeFee)),
                    })}
                  </HomeFeeText>
                </HomeFeeRow>
              ) : null}

              {item.washEquipment ? (
                <DetailLine numberOfLines={2}>{item.washEquipment}</DetailLine>
              ) : null}
              {/* Whether you have to provide water matters more here than
                  anywhere: on a day the supply is cut, a washer who brings
                  their own tank is the only one who can come. */}
              {mode === "domicile" && item.washWaterSupply ? (
                <MutedLine numberOfLines={2}>{item.washWaterSupply}</MutedLine>
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
                    <Ionicons name="logo-whatsapp" size={15} color={TEAL} />
                    <GhostLabel>WhatsApp</GhostLabel>
                  </GhostButton>
                ) : null}
              </ActionRow>
            </Card>
          );
        })}

        {matching.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>
              {t("washNoneMatching", {
                vehicle: getWashVehicleLabel(vehicle, language),
              })}
            </EmptyTitle>
            <EmptyCopy>
              {mode === "domicile"
                ? t("washNoneHomeCopy")
                : t("washNoneMatchingCopy")}
            </EmptyCopy>
          </EmptyCard>
        ) : null}

        <SafetyCard>
          <Ionicons name="alert-circle-outline" size={15} color="#8a6415" />
          <SafetyText>{t("washSafetyNote")}</SafetyText>
        </SafetyCard>

        {mayPublish ? (
          <PostCard onPress={startPosting}>
            <PostIcon>
              <Ionicons name="water-outline" size={20} color={TEAL} />
            </PostIcon>
            <PostCol>
              <PostTitle>{t("washPostTitle")}</PostTitle>
              <PostCopy>{t("washPostCopy")}</PostCopy>
            </PostCol>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </PostCard>
        ) : null}
      </Scroll>
    </Container>
  );
}

function formatPrice(value) {
  return `${value.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// Curved at the base, which is the shape every other header in the app
// already has — ForYou, Local and the seller dashboard all end this way, and
// a hard rectangle here was the odd one out. The extra bottom padding is
// room for the selector that overlaps it: 54px of it, of which the card
// takes back 30, leaving the copy a clear 24 above the card's top edge.
const Hero = styled(LinearGradient)`
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px 54px;
`;

// One soft light source off the corner, larger than the banner so only its
// falloff shows. Water is the subject; a flat block of teal is not.
const HeroGlow = styled.View`
  position: absolute;
  top: -140px;
  right: -80px;
  width: 260px;
  height: 260px;
  border-radius: 130px;
  background-color: rgba(150, 220, 240, 0.18);
`;

const HeroTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.14);
`;

const HeroEyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 26px;
  color: #ffffff;
  margin-bottom: 7px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  max-width: 300px;
  color: rgba(255, 255, 255, 0.72);
`;

// Pulled up over the banner's curve. The negative margin is the whole
// device: the card breaks the edge, so the banner reads as a surface with
// something resting on it rather than a block with a gap underneath.
const ModeDock = styled.View`
  z-index: 2;
  margin-top: -30px;
  padding: 0px ${spacing.md}px;
`;

const ModeCard = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 5px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const ModeTab = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 9px;
  min-height: 56px;
  padding: 0px 10px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.active ? TEAL : "transparent")};
`;

const ModeIcon = styled.View`
  width: 32px;
  height: 32px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.active ? "rgba(255,255,255,0.2)" : props.theme.surfaceAlt};
`;

const ModeCol = styled.View`
  flex: 1;
  gap: 2px;
`;

const ModeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const ModeHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10.5px;
  color: ${(props) =>
    props.active ? "rgba(255,255,255,0.78)" : props.theme.textMuted};
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 10px;
  margin-top: ${spacing.sm}px;
`;

const VehicleRow = styled.View`
  flex-direction: row;
  gap: 9px;
  margin-bottom: ${spacing.sm}px;
`;

const VehicleTile = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 22%;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 74px;
  padding: 12px 6px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.active ? TEAL : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? TEAL : props.theme.border)};
`;

const VehicleLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.textMuted)};
`;

const FormulaList = styled.View`
  gap: 9px;
  margin-bottom: 11px;
`;

const FormulaRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 11px;
  padding: 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? "rgba(14,110,140,0.06)" : props.theme.surface};
  border-width: ${(props) => (props.active ? 1.5 : 1)}px;
  border-color: ${(props) =>
    props.active ? "rgba(14,110,140,0.45)" : props.theme.border};
`;

const FormulaIcon = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.active ? "rgba(14,110,140,0.1)" : props.theme.surfaceAlt};
`;

const FormulaCol = styled.View`
  flex: 1;
  gap: 3px;
`;

const FormulaName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const FormulaDetail = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
`;

const FormulaDuration = styled.Text`
  flex-shrink: 0;
  max-width: 84px;
  text-align: right;
  font-family: ${fontFamily.regular};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const FormulaNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const HomeNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: rgba(14, 110, 140, 0.07);
  border-width: 1px;
  border-color: rgba(14, 110, 140, 0.22);
  margin-bottom: ${spacing.sm}px;
`;

const HomeNoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${TEAL};
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
  margin-bottom: 12px;
`;

const CountText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SortNote = styled.Text`
  flex-shrink: 0;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Card = styled(Pressable)`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
  gap: 9px;
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 11px;
`;

const Portrait = styled(Image)`
  width: 46px;
  height: 46px;
  border-radius: 15px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const Monogram = styled.View`
  width: 46px;
  height: 46px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: rgba(14, 110, 140, 0.09);
`;

const MonogramLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${TEAL};
`;

const CardTitleCol = styled.View`
  flex: 1;
  gap: 5px;
`;

const ShopName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const RatingRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
`;

const RatingValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const MetaText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const VerifiedBadge = styled.View`
  padding: 4px 9px;
  border-radius: 999px;
  background-color: rgba(11, 110, 79, 0.09);
`;

const VerifiedLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  color: ${EMERALD};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
`;

const MetaItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
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
  color: ${(props) => (props.open ? EMERALD : "#8A8A8E")};
`;

const AppointmentPill = styled.View`
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(14, 110, 140, 0.08);
`;

const AppointmentLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${TEAL};
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px;
`;

const Price = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 21px;
  color: ${(props) => props.theme.text};
`;

const PriceUnit = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const PriceOnAsking = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.textMuted};
`;

const HomeFeeRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 7px;
`;

const HomeFeeText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${TEAL};
`;

const DetailLine = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
`;

const MutedLine = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const ActionRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
`;

const CallButton = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.disabled ? "#9CA3AF" : TEAL)};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
`;

const GhostButton = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 46px;
  border-radius: ${radius.lg}px;
  background-color: rgba(14, 110, 140, 0.07);
  border-width: 1px;
  border-color: rgba(14, 110, 140, 0.24);
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${TEAL};
`;

const EmptyCard = styled.View`
  padding: ${spacing.lg}px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
  gap: 8px;
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 19px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
`;

const SafetyCard = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
  margin-bottom: ${spacing.md}px;
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;

const PostCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-style: dashed;
  border-color: rgba(14, 110, 140, 0.32);
`;

const PostIcon = styled.View`
  width: 42px;
  height: 42px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: rgba(14, 110, 140, 0.08);
`;

const PostCol = styled.View`
  flex: 1;
  gap: 3px;
`;

const PostTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const PostCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
`;
