import { useMemo, useState } from "react";
import { Linking, Pressable } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { openAccountGate } from "../utils/openAccountGate";
import { canPublish } from "../utils/canPublish";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { driversForOccasion, useDrivers } from "../hooks/useDrivers";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  driverOccasions,
  driverSafetyChecks,
  getExperienceLabel,
  getLanguageLabel,
  getOccasionCopy,
  getOccasionLabel,
  getOccasionUnit,
  getPermitLabel,
  getVehicleModeLabel,
} from "../data/drivers";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// A car with a driver, priced by the arrangement.
//
// The design's strongest idea is that these are five different products with
// five different prices, and that the question you should ask changes with
// the one you pick — an airport transfer turns on the waiting time, a run to
// Parakou on who pays the empty return. The copy at the top changes with the
// chip for exactly that reason.
//
// Three things in the design are not built, and each is deliberate:
//
//   · "Identité, permis et assurance vérifiés". We verify none of those. The
//     pill states what the driver DECLARED and says so, because a badge
//     claiming a check nobody performed is the most dangerous thing this
//     screen could carry.
//   · A live "Disponible" dot. There is no live signal and no provider
//     control over one, so a pulsing green light would be decoration
//     pretending to be information.
//   · Prices we made up. A price appears only where the driver typed one;
//     otherwise the card says the price is to be agreed, and that driver
//     sorts last rather than reading as the cheapest.
export function DriversScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [occasion, setOccasion] = useState("airport");

  const drivers = useDrivers(coords);
  const ratings = useSellerRatings(drivers.map((item) => item.sellerId));

  const matching = useMemo(
    () => driversForOccasion(drivers, occasion),
    [drivers, occasion],
  );

  const copy = getOccasionCopy(occasion, language);
  const unit = getOccasionUnit(occasion, language);

  // Only claim an order when there is something to order by.
  const anyPriced = matching.some((item) => priceFor(item, occasion) != null);

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const message = [
      t("driverQuoteOpen"),
      t("driverQuoteNeed", { need: getOccasionLabel(occasion, language) }),
      t("driverQuoteAsk"),
    ].join(" ");
    Linking.openURL(
      `${url}${url.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`,
    ).catch(() => {});
  };

  const openPostForm = () =>
    navigation.navigate("CreateListing", {
      categoryKey: "services",
      trade: "driver",
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
      {/* Navy, not the app's emerald: this is the one car screen about being
          driven rather than about repair, and the design separates it. */}
      <Hero
        colors={["#123A6B", "#0C2647", "#08182E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{copy.kicker}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{copy.title}</HeroTitle>
        <HeroCopy>{copy.copy}</HeroCopy>
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ChipWrap>
          {driverOccasions.map((item) => {
            const active = occasion === item.key;
            return (
              <Chip
                key={item.key}
                active={active}
                onPress={() => setOccasion(item.key)}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={active ? "#ffffff" : colors.textMuted}
                />
                <ChipLabel active={active}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </ChipLabel>
              </Chip>
            );
          })}
        </ChipWrap>

        <CountRow>
          <CountText numberOfLines={2}>
            {t("driverCountLabel", {
              count: matching.length,
              occasion: getOccasionLabel(occasion, language),
            })}
          </CountText>
          {anyPriced ? <SortNote>{t("driverCheapestFirst")}</SortNote> : null}
        </CountRow>

        {matching.map((item, index) => {
          const score = ratings[item.sellerId];
          const price = priceFor(item, occasion);
          const permitLine = item.permits
            .map((key) => getPermitLabel(key, language))
            .filter(Boolean)
            .join(" · ");
          const languageLine = item.languages
            .map((key) => getLanguageLabel(key, language))
            .filter(Boolean)
            .join(", ");
          const vehicleLine = [
            item.vehicle || getVehicleModeLabel(item.vehicleMode, language),
            item.seats ? t("driverSeats", { count: item.seats }) : null,
            item.airConditioned ? t("driverAirConditioned") : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <Card
              key={item.id}
              first={index === 0}
              onPress={() =>
                navigation.navigate("ProductDetail", { listing: item })
              }
            >
              <CardTop>
                <Monogram>
                  <MonogramLabel>
                    {(title(item) || "?").slice(0, 2).toUpperCase()}
                  </MonogramLabel>
                </Monogram>
                <CardTitleCol>
                  <DriverName numberOfLines={1}>{title(item)}</DriverName>
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
                      <AgencyPill>
                        <AgencyLabel>{t("driverAgency")}</AgencyLabel>
                      </AgencyPill>
                    ) : null}
                  </RatingRow>
                </CardTitleCol>
              </CardTop>

              {/* Declared, and labelled as declared. The design had a green
                  tick reading "identité, permis et assurance vérifiés"; we
                  verify none of those, and a badge claiming a check nobody
                  performed is the most dangerous thing this screen could
                  carry. */}
              {permitLine ? (
                <DeclaredPill>
                  <Ionicons
                    name="card-outline"
                    size={11}
                    color={colors.textMuted}
                  />
                  <DeclaredLabel>
                    {t("driverPermitDeclared", { permits: permitLine })}
                  </DeclaredLabel>
                </DeclaredPill>
              ) : null}

              <PriceRow>
                {price != null ? (
                  <>
                    <Price>{formatPrice(price)}</Price>
                    <PriceUnit>{unit}</PriceUnit>
                  </>
                ) : (
                  <PriceOnAsking>{t("driverPriceOnAsking")}</PriceOnAsking>
                )}
              </PriceRow>

              {item.included ? (
                <IncludedRow>
                  <Ionicons name="checkmark" size={14} color={EMERALD} />
                  <IncludedText>{item.included}</IncludedText>
                </IncludedRow>
              ) : null}
              {item.excluded ? (
                <ExcludedRow>
                  <Ionicons
                    name="alert-circle-outline"
                    size={14}
                    color="#8a6415"
                  />
                  <ExcludedText>{item.excluded}</ExcludedText>
                </ExcludedRow>
              ) : null}

              {vehicleLine ? <SpecText>{vehicleLine}</SpecText> : null}
              {languageLine || item.experience ? (
                <MutedText>
                  {[
                    languageLine
                      ? t("driverSpeaks", { langs: languageLine })
                      : null,
                    getExperienceLabel(item.experience, language),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </MutedText>
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
                    <Ionicons name="logo-whatsapp" size={15} color={EMERALD} />
                    <GhostLabel>WhatsApp</GhostLabel>
                  </GhostButton>
                ) : null}
              </ActionRow>
            </Card>
          );
        })}

        {matching.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>{t("driverNoneForOccasion")}</EmptyTitle>
            <EmptyCopy>{t("driverNoDriversCopy")}</EmptyCopy>
          </EmptyCard>
        ) : null}

        {/* The design's closing warning, kept almost word for word, because
            it names the exact thing that goes wrong. */}
        <SafetyCard>
          <SafetyRow>
            <Ionicons name="alert-circle-outline" size={15} color="#8a6415" />
            <SafetyText>{t("driverPriceWarning")}</SafetyText>
          </SafetyRow>
          {driverSafetyChecks.map((item) => (
            <SafetyRow key={item.key}>
              <Ionicons name={item.icon} size={14} color="#8a6415" />
              <SafetyText>
                {language === "en" ? item.labelEn : item.labelFr}
              </SafetyText>
            </SafetyRow>
          ))}
        </SafetyCard>

        {mayPublish ? (
          <PostCard onPress={startPosting}>
            <PostIcon>
              <Ionicons name="car-outline" size={20} color={EMERALD} />
            </PostIcon>
            <PostCol>
              <PostTitle>{t("driverPostTitle")}</PostTitle>
              <PostCopy>{t("driverPostCopy")}</PostCopy>
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

function priceFor(item, occasion) {
  const value = Number(item.prices?.[occasion]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatPrice(value) {
  return `${value.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px
    ${spacing.lg}px;
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
  background-color: rgba(255, 255, 255, 0.16);
`;

const HeroEyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 25px;
  line-height: 30px;
  color: #ffffff;
  margin-bottom: 9px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.72);
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const ChipWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: ${spacing.md}px;
`;

const Chip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: auto;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0px 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const ChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  margin-bottom: 13px;
`;

const CountText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const SortNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 0;
`;

const Card = styled(Pressable)`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) =>
    props.first ? "rgba(11, 110, 79, 0.28)" : props.theme.border};
  margin-bottom: ${spacing.md}px;
  gap: 9px;
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
`;

const CardTitleCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const Monogram = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const MonogramLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${EMERALD};
`;

const DriverName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const RatingRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  flex-wrap: wrap;
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
  flex-shrink: 1;
`;

const AgencyPill = styled.View`
  padding: 3px 8px;
  border-radius: ${radius.md}px;
  background-color: rgba(11, 110, 79, 0.08);
`;

const AgencyLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  color: ${EMERALD};
`;

const DeclaredPill = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  padding: 5px 10px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const DeclaredLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: baseline;
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

const IncludedRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
`;

const IncludedText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${EMERALD};
`;

const ExcludedRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
`;

const ExcludedText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: #8a6415;
`;

const SpecText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
`;

const MutedText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const ActionRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
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
  background-color: ${(props) => (props.disabled ? "#9CA3AF" : EMERALD)};
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
  background-color: rgba(11, 110, 79, 0.07);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.22);
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const EmptyCard = styled.View`
  padding: ${spacing.lg}px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const SafetyCard = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(224, 164, 21, 0.09);
  border-width: 1px;
  border-color: rgba(224, 164, 21, 0.26);
  margin-bottom: ${spacing.md}px;
  gap: 9px;
`;

const SafetyRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #7a5a12;
`;

const PostCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 14px 15px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PostIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const PostCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const PostTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const PostCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;
