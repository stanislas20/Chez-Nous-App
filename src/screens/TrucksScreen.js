import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import {
  ANATT_AUTHORISATION_URL,
  ANATT_LICENCE_URL,
  ANATT_TRANSPORT_CARD_URL,
  authorisationConditions,
  goodsLicence,
  loadSizes,
  transportCard,
  truckModes,
  trucksReviewedOn,
} from "../data/truckTransport";
import { getVehicleBodyTypeLabel } from "../data/vehicles";
import { useTrucks } from "../hooks/useTrucks";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { HeroPostBar } from "../components/HeroPostBar";
import { ScreenFooter } from "../components/ScreenFooter";
import { listingPrice } from "../utils/listingPrice";
import { openListing } from "../utils/openListing";
import { canPublish } from "../utils/canPublish";
import { openAccountGate } from "../utils/openAccountGate";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useAuth } from "../auth/AuthContext";

const INK = "#1E5C52";
const GOLD = "#D9A441";

// Camions et utilitaires.
//
// "Camion" is three errands wearing one word, and the tabs are those three:
// buying one, hiring one for a day, or paying somebody to carry a load. The
// third is why this screen exists — the first two were reachable through
// Véhicules, and finding a haulier was reachable only through a text search
// that returned garages.
//
// Nothing on this screen prices a truck or rates a haulier. Everything
// factual in the panels below is ANaTT's, dated and linked; everything else
// is a seller's own words. The strongest thing the screen can do for
// somebody about to pay a stranger to drive off with their goods is to name
// the papers that stranger is supposed to hold.
export function TrucksScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { coords } = useCurrentLocation();

  const [mode, setMode] = useState("buy");
  const [load, setLoad] = useState(null);

  // The load chooser narrows vehicles by body type; it means nothing to a
  // haulier, who is asked to move whatever you have. So it is not applied
  // there, and not shown there either.
  const isHaul = mode === "haul";
  const { forSale, forHire, hauliers } = useTrucks(coords, isHaul ? null : load);

  const visible = isHaul ? hauliers : mode === "rent" ? forHire : forSale;

  const openPostForm = () =>
    isHaul
      ? navigation.navigate("CreateListing", {
          categoryKey: "services",
          trade: "haulier",
        })
      : navigation.navigate("CreateListing", { categoryKey: "vehicles" });

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

  const open = (url) => Linking.openURL(url).catch(() => {});

  // Built from parts, never `new Date("2026-08-29")` — that form parses as
  // UTC midnight and prints the previous day anywhere west of Greenwich,
  // which is exactly where this app is read.
  const reviewed = useMemo(() => {
    const [year, month, day] = trucksReviewedOn.split("-").map(Number);
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  }, [language]);

  const money = (amount) =>
    new Intl.NumberFormat(language === "en" ? "en-GB" : "fr-FR").format(amount);

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#2A7A6D", "#1E5C52", "#0A211C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("trucksEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t(`trucksTitle_${mode}`)}</HeroTitle>
        <HeroCopy>{t(`trucksIntro_${mode}`)}</HeroCopy>
        {mayPublish ? (
          <HeroPostBar
            icon={isHaul ? "cube-outline" : "bus-outline"}
            ink={GOLD}
            label={t(isHaul ? "trucksPublishHaul" : "trucksPublishVehicle")}
            cta={t("heroPostCta")}
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
        <ModeRow>
          {truckModes.map((item) => {
            const active = mode === item.key;
            return (
              <ModeTab
                key={item.key}
                active={active}
                onPress={() => setMode(item.key)}
              >
                <Ionicons
                  name={item.icon}
                  size={15}
                  color={active ? "#ffffff" : colors.textMuted}
                />
                <ModeLabel active={active} numberOfLines={1}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </ModeLabel>
              </ModeTab>
            );
          })}
        </ModeRow>
        <ModeHint>
          {language === "en"
            ? truckModes.find((m) => m.key === mode).hintEn
            : truckModes.find((m) => m.key === mode).hintFr}
        </ModeHint>

        {/* Asked as a load, answered as a body type. A payload in tonnes
            would be a number no listing carries. */}
        {isHaul ? null : (
          <>
            <FieldLabel>{t("trucksLoadLabel")}</FieldLabel>
            <FilterScroll
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: spacing.md }}
            >
              <Chip active={!load} onPress={() => setLoad(null)}>
                <ChipLabel active={!load}>{t("trucksLoadAll")}</ChipLabel>
              </Chip>
              {loadSizes.map((size) => {
                const active = load === size.key;
                return (
                  <Chip
                    key={size.key}
                    active={active}
                    onPress={() => setLoad(active ? null : size.key)}
                  >
                    <ChipLabel active={active}>
                      {language === "en" ? size.labelEn : size.labelFr}
                    </ChipLabel>
                  </Chip>
                );
              })}
            </FilterScroll>
            {load ? (
              <LoadExample>
                {language === "en"
                  ? loadSizes.find((s) => s.key === load).exampleEn
                  : loadSizes.find((s) => s.key === load).exampleFr}
              </LoadExample>
            ) : null}
          </>
        )}

        <CountRow>
          {visible.length === 1
            ? t(`trucksCountOne_${isHaul ? "haul" : "vehicle"}`)
            : t(`trucksCount_${isHaul ? "haul" : "vehicle"}`, {
                count: visible.length,
              })}
        </CountRow>

        {visible.map((item) => {
          const title = language === "en" ? item.titleEn : item.titleFr;
          const price = listingPrice(item, t, language);
          return (
            <ItemCard
              key={item.id}
              onPress={() => openListing(navigation, item, t, language)}
            >
              <ItemTop>
                <ItemName numberOfLines={2}>{title}</ItemName>
                <PlaceRow>
                  <Ionicons
                    name="location-outline"
                    size={12}
                    color={colors.textMuted}
                  />
                  <PlaceText numberOfLines={1}>
                    {item.city}
                    {item.distanceKm != null
                      ? ` · ${item.distanceKm.toFixed(1)} km`
                      : ""}
                  </PlaceText>
                </PlaceRow>
              </ItemTop>

              <ItemMetaRow>
                {/* The seller's own declaration, or nothing. */}
                {item.bodyType ? (
                  <MetaPill>
                    <Ionicons name="bus-outline" size={12} color={INK} />
                    <MetaPillLabel>
                      {getVehicleBodyTypeLabel(item.bodyType, language)}
                    </MetaPillLabel>
                  </MetaPill>
                ) : null}
                {price ? (
                  <PriceText>
                    {price.kind === "amount"
                      ? `${price.amount}${price.suffix}`
                      : price.text}
                  </PriceText>
                ) : (
                  <Unstated>{t("trucksNoPrice")}</Unstated>
                )}
              </ItemMetaRow>
            </ItemCard>
          );
        })}

        {visible.length === 0 ? (
          <EmptyText>
            {t(isHaul ? "trucksEmptyHaul" : "trucksEmptyVehicle")}
          </EmptyText>
        ) : null}

        {/* The papers. This is the part of the screen that does the work:
            a haulier without these cannot legally carry your goods, and the
            conditions are ANaTT's own wording. */}
        <SectionHeading>{t("trucksLawTitle")}</SectionHeading>
        <Panel>
          {authorisationConditions.map((item) => (
            <PanelRow key={item.key}>
              <Ionicons name="checkmark-circle-outline" size={16} color={INK} />
              <PanelText>{language === "en" ? item.en : item.fr}</PanelText>
            </PanelRow>
          ))}
        </Panel>
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("trucksLawNote", { date: reviewed })}</NoteText>
        </Note>

        {/* One year, not one job — the thing people get wrong in both
            directions. */}
        <SectionHeading>{t("trucksCardTitle")}</SectionHeading>
        <Panel>
          <PanelRow>
            <Ionicons name="calendar-outline" size={16} color={INK} />
            <PanelText>
              {t("trucksCardValidity", { months: transportCard.validityMonths })}
            </PanelText>
          </PanelRow>
          <PanelRow>
            <Ionicons name="time-outline" size={16} color={INK} />
            <PanelText>
              {t("trucksCardProcessing", {
                hours: transportCard.processingHours,
              })}
            </PanelText>
          </PanelRow>
          {transportCard.fees.map((fee) => (
            <PanelRow key={fee.key}>
              <Ionicons name="cash-outline" size={16} color={INK} />
              <PanelText>
                {language === "en" ? fee.en : fee.fr} · {money(fee.amount)} FCFA
              </PanelText>
            </PanelRow>
          ))}
        </Panel>
        {/* Deliberately not totalled. The sum depends on how many countries
            and whether it is urgent, so one figure would be wrong for most
            readers. */}
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("trucksCardNote")}</NoteText>
        </Note>

        <SectionHeading>{t("trucksLicenceTitle")}</SectionHeading>
        <Panel>
          <PanelRow>
            <Ionicons name="card-outline" size={16} color={INK} />
            <PanelText>
              {t("trucksLicenceCovers", {
                category: goodsLicence.category,
                covers:
                  language === "en"
                    ? goodsLicence.coversEn
                    : goodsLicence.coversFr,
              })}
            </PanelText>
          </PanelRow>
          <PanelRow>
            <Ionicons name="person-outline" size={16} color={INK} />
            <PanelText>
              {t("trucksLicenceAge", { age: goodsLicence.minAge })}
            </PanelText>
          </PanelRow>
          {/* The mistake worth preventing: C is not a starting point. */}
          {goodsLicence.requiresB ? (
            <PanelRow>
              <Ionicons name="albums-outline" size={16} color={INK} />
              <PanelText>{t("trucksLicenceNeedsB")}</PanelText>
            </PanelRow>
          ) : null}
        </Panel>
        {/* No tonnage anywhere above, and that is ANaTT's silence, not an
            omission of ours. */}
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("trucksNoTonnageNote")}</NoteText>
        </Note>

        <LinkButton onPress={() => open(ANATT_TRANSPORT_CARD_URL)}>
          <Ionicons name="open-outline" size={15} color={INK} />
          <LinkLabel>{t("trucksCardAction")}</LinkLabel>
        </LinkButton>
        <LinkButton onPress={() => open(ANATT_AUTHORISATION_URL)}>
          <Ionicons name="open-outline" size={15} color={INK} />
          <LinkLabel>{t("trucksAuthorisationAction")}</LinkLabel>
        </LinkButton>
        <LinkButton onPress={() => open(ANATT_LICENCE_URL)}>
          <Ionicons name="open-outline" size={15} color={INK} />
          <LinkLabel>{t("trucksLicenceAction")}</LinkLabel>
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
  font-size: 28px;
  line-height: 34px;
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

const ModeRow = styled.View`
  flex-direction: row;
  gap: 6px;
  padding: 4px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ModeTab = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 6px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => (props.active ? INK : "transparent")};
`;

const ModeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.textMuted)};
`;

const ModeHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  margin: 8px 2px ${spacing.md}px;
  color: ${(props) => props.theme.textMuted};
`;

const FieldLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-bottom: 9px;
  color: ${(props) => props.theme.textMuted};
`;

const FilterScroll = styled.ScrollView`
  margin-bottom: ${spacing.sm}px;
`;

const Chip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 999px;
  background-color: ${(props) => (props.active ? INK : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) =>
    props.active ? INK : props.theme.border};
`;

const ChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const LoadExample = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  margin: 2px 2px ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const CountRow = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  margin: ${spacing.sm}px 2px ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const ItemCard = styled(Pressable)`
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const ItemTop = styled.View`
  gap: 5px;
`;

const ItemName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  line-height: 20px;
  color: ${(props) => props.theme.text};
`;

const PlaceRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const PlaceText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const ItemMetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 11px;
`;

const MetaPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(30, 92, 82, 0.09);
`;

const MetaPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${INK};
`;

const PriceText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  margin-left: auto;
  color: ${(props) => props.theme.text};
`;

const Unstated = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-left: auto;
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
  margin: ${spacing.lg}px 2px ${spacing.sm}px;
  color: ${(props) => props.theme.text};
`;

const Panel = styled.View`
  padding: 4px ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PanelRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 0;
`;

const PanelText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 13px;
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
  gap: 7px;
  min-height: 46px;
  border-radius: ${radius.lg}px;
  margin-top: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(30, 92, 82, 0.28);
`;

const LinkLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${INK};
`;
