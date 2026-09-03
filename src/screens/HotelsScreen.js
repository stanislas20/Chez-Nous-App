import { useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useHotels } from "../hooks/useHotels";
import { useAuth } from "../auth/AuthContext";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { openAccountGate } from "../utils/openAccountGate";
import { canPublish, publishBlockReason } from "../utils/canPublish";
import { isVerifiedCompanyProfile } from "../utils/listingLifecycle";
import { cities } from "../data/cities";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useBannerStatusBar } from "../hooks/useBannerStatusBar";
import { sampleHalls, sampleHotels } from "../data/sampleHotels";
import {
  allInNightly,
  byAllInNightly,
  byCapacityDesc,
  getGeneratorLabel,
  hotelBudgetMatches,
  hotelBudgets,
  hotelZoneMatches,
  hotelZones,
  recommendHotel,
} from "../data/hotelTerms";
import { buildLinkUrl } from "../data/restaurantLinks";
import { countContact } from "../utils/contactCount";
import { ScreenFooter } from "../components/ScreenFooter";

const LAGOON = "#1A5A63";
// The same lagoon, lifted for the dark palette. #1A5A63 on #1A211B is very
// nearly the same value: on a dark card the accent text disappears rather
// than reads as an accent. Everything that speaks in the screen's colour
// asks the theme which of the two to use.
const LAGOON_DARK = "#5FB3BE";
const lagoonInk = (theme) => (theme.scheme === "dark" ? LAGOON_DARK : LAGOON);
const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// Where to sleep, priced the way it is paid.
//
// Built from the proposed design, and it leads where that design leads: on
// the fact that a quoted room rate is not the price of a night. The taxe de
// séjour is added at the desk and the petit-déjeuner may or may not be
// inside, so three hotels quoting "25 000" quote three different nights.
// Every figure on this screen is the rate plus the tax, and every card
// breaks out how much of it was tax.
//
// The second thing it leads on is electricity, and that is the ordering
// rule as well as a badge. A room without a groupe électrogène has air
// conditioning only while the grid has power, and a Cotonou night without
// air conditioning is a night nobody sleeps. It outranks the star count,
// which is declared by the establishment and audited by nobody — which is
// why the stars carry the word "déclarées" everywhere they appear, and why
// the note at the foot says so in a sentence.
//
// What the design ships and this does not: nine invented hotels carrying
// invented telephone numbers, ratings and rates. A hotel card is one
// somebody phones from a taxi at nine at night. The sample cards here
// follow the rule sampleGarages set — no number, no rating, no hours — and
// vanish the moment one real short-stay listing is approved.
export function HotelsScreen({ navigation }) {
  const { t, language } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useBannerStatusBar();

  const [mode, setMode] = useState("stay");
  const [zone, setZone] = useState("all");
  const [budget, setBudget] = useState("all");
  const [query, setQuery] = useState("");
  // Null means "wherever I am". A chosen city replaces the phone's own
  // position, because somebody booking a room in Parakou on Tuesday is
  // standing in Cotonou on Monday — the whole point of choosing.
  const [city, setCity] = useState(null);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [nearestFirst, setNearestFirst] = useState(false);

  const { user, sellerProfile } = useAuth();
  const { coords } = useCurrentLocation();
  const { rooms, halls } = useHotels(coords);
  const isStay = mode === "stay";

  // Samples only while there are none of the real thing, per tab. A tab is
  // swapped on its own: one real hotel must not empty the halls tab, and
  // one real hall must not empty the hotels tab.
  const real = isStay ? rooms : halls;
  const showingSamples = !!real && real.length === 0;
  const pool = useMemo(() => {
    if (real && real.length) return real;
    if (!real) return [];
    // The distance is real even on a sample: computed at render from the
    // device's own position against the city's coordinates, never stored
    // here. Same rule sampleGarages follows — the card may be an example,
    // but no figure on it is invented. It also means "le plus proche" can
    // be demonstrated before the first hotel posts.
    return (isStay ? sampleHotels : sampleHalls).map((item) => {
      const cityCoord = cityCoordinates[item.city];
      return {
        ...item,
        allIn: allInNightly(item),
        distanceKm:
          coords && cityCoord ? distanceInKm(coords, cityCoord) : null,
      };
    });
  }, [real, isStay, coords]);

  const ratings = useSellerRatings(
    useMemo(() => (real ?? []).map((item) => item.sellerId), [real]),
  );

  // Posting a hotel is not posting a sofa.
  //
  // An establishment card carries a telephone number people ring at night
  // and a price they turn up expecting, and it sits in a directory beside
  // the ONPB roster. So this one entry point asks for a verified company
  // rather than any signed-in seller: the RCCM and the IFU behind that
  // badge have been read by a human, which is the only check this app has
  // that the business exists at all.
  //
  // A visitor still sees the button. Hiding it from the signed-out would
  // hide the fact that listing is possible from exactly the hotelier who
  // has not joined yet; they go through the account gate, and the gate
  // brings them back here. What is hidden is the dead promise: a signed-in
  // seller who cannot publish, or one whose company is not verified, is
  // told which of the two it is rather than shown a button that fails.
  const openHotelPostForm = () =>
    navigation.navigate("CreateListing", {
      categoryKey: "realEstate",
      realEstateDeal: "shortStay",
    });
  const { remember } = useAccountGateIntent(user, openHotelPostForm);
  const verifiedCompany = isVerifiedCompanyProfile(sellerProfile);
  const mayPublish = !user || (canPublish(user) && verifiedCompany);
  const startPosting = () => {
    if (!user) {
      remember();
      openAccountGate(navigation);
      return;
    }
    openHotelPostForm();
  };

  const nameOf = (item) =>
    item.isSample
      ? language === "en"
        ? item.nameEn
        : item.nameFr
      : (language === "en" ? item.titleEn : item.titleFr) ?? "";

  const trimmed = query.trim().toLowerCase();
  // The zones are Cotonou quartiers. Once a city is named they describe
  // nothing — "Haie Vive" is not a district of Parakou — so the city takes
  // over as the location filter and the zone row goes away with it.
  const zoning = !city;
  const matched = useMemo(() => {
    const list = pool
      .filter((item) => (city ? item.city === city : true))
      .filter((item) => (zoning ? hotelZoneMatches(zone, item) : true))
      .filter(
        (item) =>
          !trimmed ||
          nameOf(item).toLowerCase().includes(trimmed) ||
          (item.quartier ?? "").toLowerCase().includes(trimmed) ||
          (item.city ?? "").toLowerCase().includes(trimmed),
      )
      // The budget bands read the all-in price, never the room rate:
      // filtering on the rate would file a hotel one band below the one its
      // guest actually pays, which is the deception this screen is against.
      .filter((item) => !isStay || hotelBudgetMatches(budget, item.allIn));

    // Distance only sorts when it is known for everything being sorted. A
    // list where half the rows have no distance would order the unknown
    // ones arbitrarily and still call itself "le plus proche".
    if (nearestFirst && list.every((item) => item.distanceKm != null)) {
      return list.sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return list.sort(isStay ? byAllInNightly : byCapacityDesc);
  }, [pool, city, zoning, zone, trimmed, budget, isStay, nearestFirst, language]);

  // Offered only when it can be honoured: the phone knows where it is, no
  // city has been named, and every row on screen has a distance.
  const canSortByDistance =
    !!coords &&
    !city &&
    matched.length > 0 &&
    matched.every((item) => item.distanceKm != null);

  const sheetCities = useMemo(
    () =>
      cities.filter((name) =>
        name.toLowerCase().includes(citySearch.trim().toLowerCase()),
      ),
    [citySearch],
  );

  // The recommendation, and its reason in the same card. Only on the
  // sleeping tab: a hall is chosen on how many people fit, and there is no
  // equivalent rule worth stating.
  const { hotel: pick, reasonKey } = useMemo(
    () => (isStay ? recommendHotel(matched) : { hotel: null, reasonKey: null }),
    [matched, isStay],
  );
  const rest = pick ? matched.filter((item) => item.id !== pick.id) : matched;

  const fcfa = (value) =>
    `${Math.round(Number(value) || 0)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${t("currencyFcfa")}`;

  // countContact first — a tap on Appeler is the closest thing this screen
  // has to a result, and the seller sees it on their own card.
  const call = (item) => {
    if (!item.phone) return;
    countContact(item);
    Linking.openURL(`tel:${item.phone}`).catch(() => {});
  };

  const openWhatsapp = (item) => {
    const url = buildLinkUrl("whatsapp", item.whatsapp ?? item.phone);
    if (!url) return;
    countContact(item);
    Linking.openURL(url).catch(() => {});
  };

  const renderCard = (item, { recommended } = {}) => {
    const rating = ratings?.[item.sellerId];
    const generator = item.generator ?? "none";
    const powered = generator === "full";
    const stars = Number(item.declaredStars) || 0;
    const reachable = !item.isSample && (item.phone || item.whatsapp);

    return (
      <Card key={item.id} recommended={recommended}>
        {recommended ? (
          <PickKicker>
            <PickKickerLabel>{t("hotelsPickKicker")}</PickKickerLabel>
          </PickKicker>
        ) : null}

        <CardTop>
          <Monogram>
            <MonogramLabel>
              {nameOf(item).replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2).toUpperCase()}
            </MonogramLabel>
          </Monogram>
          <CardHead>
            <CardName numberOfLines={2}>{nameOf(item)}</CardName>
            <MetaRow>
              {rating?.count ? (
                <RatingRow>
                  <Ionicons name="star" size={12} color={GOLD} />
                  <RatingLabel>
                    {rating.average.toFixed(1).replace(".", ",")}
                  </RatingLabel>
                  <MutedLabel>
                    {t("ratingCount", { count: rating.count })}
                  </MutedLabel>
                </RatingRow>
              ) : (
                <MutedLabel>{t("hotelsNoRatingYet")}</MutedLabel>
              )}
              {item.isSample ? (
                <SampleTag>
                  <SampleTagLabel>{t("hotelsSampleTag")}</SampleTagLabel>
                </SampleTag>
              ) : null}
            </MetaRow>
          </CardHead>
        </CardTop>

        {/* The reason, stated. A card that says "our pick" and nothing else
            is an advertisement; this one names the rule it won on. */}
        {recommended && reasonKey ? <WhyLabel>{t(reasonKey)}</WhyLabel> : null}

        {isStay ? (
          <PriceRow>
            <PriceLabel>{fcfa(item.allIn)}</PriceLabel>
            <PriceUnit>
              {item.touristTax
                ? t("hotelsPerNightWithTax", { tax: fcfa(item.touristTax) })
                : t("hotelsPerNightNoTax")}
            </PriceUnit>
          </PriceRow>
        ) : (
          <PriceRow>
            <PriceLabel>{fcfa(item.price)}</PriceLabel>
            <PriceUnit>
              {item.capacity
                ? t("hotelsPerDayWithCapacity", { count: item.capacity })
                : t("hotelsPerDay")}
            </PriceUnit>
          </PriceRow>
        )}

        <BadgeRow>
          <Badge tone={powered ? "good" : "warn"}>
            {powered ? (
              <Ionicons name="checkmark" size={11} color={EMERALD} />
            ) : null}
            <BadgeLabel tone={powered ? "good" : "warn"}>
              {getGeneratorLabel(generator, language)}
            </BadgeLabel>
          </Badge>
          {isStay ? (
            <Badge tone={item.breakfastIncluded ? "good" : "plain"}>
              <BadgeLabel tone={item.breakfastIncluded ? "good" : "plain"}>
                {item.breakfastIncluded
                  ? t("hotelsBreakfastIncluded")
                  : t("hotelsBreakfastExtra")}
              </BadgeLabel>
            </Badge>
          ) : null}
        </BadgeRow>

        {isStay && stars ? (
          <StarsLabel>{t("hotelsDeclaredStars", { count: stars })}</StarsLabel>
        ) : null}

        <FactRow>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} />
          <FactLabel numberOfLines={1}>
            {[item.quartier, item.city].filter(Boolean).join(", ")}
            {item.distanceKm != null
              ? ` · ${item.distanceKm.toFixed(1).replace(".", ",")} km`
              : ""}
          </FactLabel>
        </FactRow>

        {isStay && item.hotWater24h ? (
          <FactRow>
            <Ionicons name="water-outline" size={12} color={lagoonInk(colors)} />
            <FactLabel>{t("hotelsHotWater")}</FactLabel>
          </FactRow>
        ) : null}

        {/* Deliberately dead on a sample, and drawn as dead: a number here
            would either be invented or belong to an establishment that
            never agreed to be listed. */}
        <ActionRow>
          <CallButton
            muted={!reachable}
            disabled={!reachable}
            onPress={() => call(item)}
          >
            <Ionicons
              name="call"
              size={15}
              color={reachable ? "#ffffff" : colors.textMuted}
            />
            <CallLabel muted={!reachable}>
              {item.isSample ? t("hotelsSampleNoContact") : t("callButtonLabel")}
            </CallLabel>
          </CallButton>
          {reachable ? (
            <WhatsappButton onPress={() => openWhatsapp(item)}>
              <Ionicons name="logo-whatsapp" size={16} color={LAGOON} />
              <WhatsappLabel>WhatsApp</WhatsappLabel>
            </WhatsappButton>
          ) : null}
        </ActionRow>
      </Card>
    );
  };

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#22757F", "#1A5A63", "#0E353B", "#071F23"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + spacing.sm }}
      >
        <HeroMark pointerEvents="none">
          <Ionicons name="bed-outline" size={170} color="rgba(255,255,255,0.1)" />
        </HeroMark>
        <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </BackButton>
        <HeroKicker>{t("hotelsKicker")}</HeroKicker>
        <HeroRow>
          <HeroTitle numberOfLines={2}>{t("hotelsHeroTitle")}</HeroTitle>
          {mayPublish ? (
            <HeroPostButton onPress={startPosting}>
              <Ionicons name="add" size={16} color={LAGOON} />
              <HeroPostLabel>{t("hotelsPublish")}</HeroPostLabel>
            </HeroPostButton>
          ) : null}
        </HeroRow>
        <HeroCopy>{t("hotelsHeroCopy")}</HeroCopy>
        <SearchField>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.7)" />
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("hotelsSearchPlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.6)"
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color="rgba(255,255,255,0.7)" />
            </Pressable>
          ) : null}
        </SearchField>
      </Hero>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Two things a building is hired for, and they are chosen on
            different facts: a room on what the night costs, a hall on how
            many people fit. So the budget row belongs to one tab only. */}
        {/* Where, before what. A city replaces the phone's own position,
            because the person booking a room in Parakou on Tuesday is
            standing in Cotonou on Monday. */}
        <LocationRow onPress={() => setCitySheetOpen(true)}>
          <Ionicons
            name={city ? "location" : "navigate"}
            size={15}
            color={lagoonInk(colors)}
          />
          <LocationLabel numberOfLines={1}>
            {city ?? t("hotelsAroundYou")}
          </LocationLabel>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={colors.textMuted}
          />
        </LocationRow>

        <ModeRow>
          {[
            { key: "stay", labelKey: "hotelsModeStay", hintKey: "hotelsModeStayHint" },
            { key: "hall", labelKey: "hotelsModeHall", hintKey: "hotelsModeHallHint" },
          ].map((option) => {
            const active = mode === option.key;
            return (
              <ModeTab
                key={option.key}
                active={active}
                onPress={() => setMode(option.key)}
              >
                <ModeLabel active={active}>{t(option.labelKey)}</ModeLabel>
                <ModeHint active={active} numberOfLines={1}>
                  {t(option.hintKey)}
                </ModeHint>
              </ModeTab>
            );
          })}
        </ModeRow>

        {zoning ? (
        <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
          {hotelZones.map((option) => {
            const active = zone === option.key;
            return (
              <Chip
                key={option.key}
                active={active}
                onPress={() => setZone(option.key)}
              >
                <ChipLabel active={active}>
                  {language === "en" ? option.labelEn : option.labelFr}
                </ChipLabel>
              </Chip>
            );
          })}
        </ChipScroll>
        ) : null}

        {isStay ? (
          <BudgetRow>
            {hotelBudgets.map((option) => {
              const active = budget === option.key;
              return (
                <BudgetTab
                  key={option.key}
                  active={active}
                  onPress={() => setBudget(option.key)}
                >
                  <BudgetLabel active={active} numberOfLines={1}>
                    {language === "en" ? option.labelEn : option.labelFr}
                  </BudgetLabel>
                </BudgetTab>
              );
            })}
          </BudgetRow>
        ) : null}

        <CountRow>
          <CountLabel>
            {isStay
              ? t("hotelsCountStay", { count: matched.length })
              : t("hotelsCountHall", { count: matched.length })}
          </CountLabel>
          {canSortByDistance ? (
            <SortToggle onPress={() => setNearestFirst((prev) => !prev)}>
              <Ionicons
                name={nearestFirst ? "navigate" : "swap-vertical"}
                size={13}
                color={lagoonInk(colors)}
              />
              <SortToggleLabel>
                {nearestFirst
                  ? t("hotelsSortNearest")
                  : isStay
                    ? t("hotelsSortStay")
                    : t("hotelsSortHall")}
              </SortToggleLabel>
            </SortToggle>
          ) : (
            <SortNote>
              {isStay ? t("hotelsSortStay") : t("hotelsSortHall")}
            </SortNote>
          )}
        </CountRow>

        {pick ? renderCard(pick, { recommended: true }) : null}
        {rest.map((item) => renderCard(item))}

        {matched.length === 0 ? (
          <EmptyLabel>{t("hotelsEmpty")}</EmptyLabel>
        ) : null}

        {showingSamples ? (
          <SampleNote>{t("hotelsSampleNote")}</SampleNote>
        ) : null}

        {/* Why the button is not there. A seller in Bénin whose company is
            not yet verified is one form away and is told so; a seller
            outside the country is not, and pointing them at verification
            would send them at a door that does not open for them. */}
        {user && !mayPublish ? (
          <SampleNote>
            {publishBlockReason(user) === "country"
              ? t("postingCountryTitle")
              : t("hotelsPublishVerifiedOnly")}
          </SampleNote>
        ) : null}

        {/* The sentence the design ends on, and the one this screen most
            has to say: a star count here is the establishment's own claim,
            and the tax and the power are worth one telephone call before a
            taxi across town. */}
        <SafetyNote>
          <Ionicons name="alert-circle-outline" size={15} color="#8a6415" />
          <SafetyLabel>{t("hotelsSafetyNote")}</SafetyLabel>
        </SafetyNote>

        <ScreenFooter />
      </ScrollView>

      <Modal
        visible={citySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCitySheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setCitySheetOpen(false)}>
          <Sheet
            onStartShouldSetResponder={() => true}
            style={{ paddingBottom: spacing.lg + insets.bottom }}
          >
            <SheetHandle />
            <SheetTitle>{t("chooseCityTitle")}</SheetTitle>
            <SheetSearch
              value={citySearch}
              onChangeText={setCitySearch}
              placeholder={t("searchCityPlaceholder")}
              placeholderTextColor={colors.textMuted}
            />
            <SheetScroll>
              <SheetRow
                selected={!city}
                onPress={() => {
                  setCity(null);
                  setCitySheetOpen(false);
                  setCitySearch("");
                }}
              >
                <SheetRowLabel>{t("hotelsAroundYou")}</SheetRowLabel>
                {!city ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null}
              </SheetRow>
              {sheetCities.map((name) => (
                <SheetRow
                  key={name}
                  selected={city === name}
                  onPress={() => {
                    setCity(name);
                    setCitySheetOpen(false);
                    setCitySearch("");
                    // A city and a proximity sort are two answers to the
                    // same question, and the city is the one just given.
                    setNearestFirst(false);
                  }}
                >
                  <SheetRowLabel>{name}</SheetRowLabel>
                  {city === name ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </SheetRow>
              ))}
            </SheetScroll>
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

// This one honours `edges`, so the screen keeps the sides and the bottom
// and leaves the top to the banner. See check-banner-top-inset.
const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  overflow: hidden;
  padding: ${spacing.md}px ${spacing.md}px ${spacing.lg}px;
  z-index: 2;
  shadow-color: #071f23;
  shadow-offset: 0px 3px;
  shadow-opacity: 0.18;
  shadow-radius: 8px;
  elevation: 6;
`;

const HeroMark = styled.View`
  position: absolute;
  right: -30px;
  bottom: -46px;
`;

const BackButton = styled(Pressable)`
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  margin-left: -${spacing.xs}px;
  border-radius: ${radius.pill}px;
`;

const HeroKicker = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.66);
  margin-top: ${spacing.xs}px;
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 25px;
  line-height: 30px;
  color: #ffffff;
  margin-top: ${spacing.xs}px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.76);
  margin-top: ${spacing.xs}px;
`;

const SearchField = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  margin-top: ${spacing.md}px;
  padding: 0 ${spacing.md}px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.16);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.24);
`;

const SearchInput = styled(TextInput)`
  flex: 1;
  padding: 0;
  font-family: ${fontFamily.regular};
  font-size: 15px;
  color: #ffffff;
`;

const HeroRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
`;

// White on the gradient, so the one action an hotelier came for is the
// brightest thing on the banner rather than something found by scrolling.
const HeroPostButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  min-height: 38px;
  padding: 0 ${spacing.md}px;
  border-radius: ${radius.pill}px;
  background-color: #ffffff;
`;

const HeroPostLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${LAGOON};
`;

const LocationRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  padding: 0 ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const LocationLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const SortToggle = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const SortToggleLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${(props) => lagoonInk(props.theme)};
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: ${(props) => props.theme.scrim};
`;

const Sheet = styled.View`
  max-height: 70%;
  padding: ${spacing.sm}px ${spacing.md}px 0;
  border-top-left-radius: ${radius.xl}px;
  border-top-right-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  align-self: center;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const SheetSearch = styled(TextInput)`
  min-height: 44px;
  padding: 0 ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  font-family: ${fontFamily.regular};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const SheetScroll = styled.ScrollView``;

const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  min-height: 48px;
  padding: 0 ${spacing.sm}px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) =>
    props.selected ? "rgba(26, 90, 99, 0.09)" : "transparent"};
`;

const SheetRowLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const ModeRow = styled.View`
  flex-direction: row;
  gap: 3px;
  padding: 4px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ModeTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: ${spacing.sm}px ${spacing.xs}px;
  border-radius: ${radius.md}px;
  border-width: 1px;
  border-color: ${(props) =>
    props.active ? "rgba(26, 90, 99, 0.5)" : "transparent"};
  background-color: ${(props) =>
    props.active ? "rgba(26, 90, 99, 0.16)" : "transparent"};
`;

const ModeLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 13px;
  color: ${(props) => (props.active ? props.theme.text : props.theme.textMuted)};
`;

const ModeHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10px;
  margin-top: 2px;
  color: ${(props) =>
    props.active ? lagoonInk(props.theme) : props.theme.textMuted};
`;

const ChipScroll = styled.ScrollView.attrs({
  contentContainerStyle: { gap: 8, paddingVertical: 12 },
})``;

const Chip = styled(Pressable)`
  padding: 9px ${spacing.md}px;
  border-radius: ${radius.pill}px;
  border-width: 1px;
  border-color: ${(props) => (props.active ? LAGOON : props.theme.border)};
  background-color: ${(props) => (props.active ? LAGOON : props.theme.surface)};
`;

const ChipLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const BudgetRow = styled.View`
  flex-direction: row;
  gap: 3px;
  padding: 4px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.sm}px;
`;

const BudgetTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 9px 4px;
  border-radius: ${radius.sm}px;
  border-width: 1px;
  border-color: ${(props) =>
    props.active ? "rgba(26, 90, 99, 0.5)" : "transparent"};
  background-color: ${(props) =>
    props.active ? "rgba(26, 90, 99, 0.16)" : "transparent"};
`;

const BudgetLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${(props) => (props.active ? props.theme.text : props.theme.textMuted)};
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  margin: ${spacing.sm}px 0 ${spacing.md}px;
`;

const CountLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SortNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Card = styled.View`
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) =>
    props.recommended ? "rgba(26, 90, 99, 0.34)" : props.theme.border};
  ${shadow.card}
`;

const PickKicker = styled.View`
  align-self: flex-start;
  padding: 5px ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  border-radius: ${radius.pill}px;
  background-color: rgba(26, 90, 99, 0.09);
  border-width: 1px;
  border-color: rgba(26, 90, 99, 0.22);
`;

const PickKickerLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: ${(props) => lagoonInk(props.theme)};
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
`;

const Monogram = styled.View`
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: rgba(26, 90, 99, 0.08);
  border-width: 1px;
  border-color: rgba(26, 90, 99, 0.14);
`;

const MonogramLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${(props) => lagoonInk(props.theme)};
`;

const CardHead = styled.View`
  flex: 1;
`;

const CardName = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 15px;
  line-height: 20px;
  color: ${(props) => props.theme.text};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: ${spacing.xs}px;
  margin-top: 5px;
`;

const RatingRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const RatingLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const MutedLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SampleTag = styled.View`
  padding: 4px ${spacing.sm}px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SampleTagLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const WhyLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => lagoonInk(props.theme)};
  margin-top: ${spacing.sm}px;
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  gap: ${spacing.xs}px;
  margin-top: ${spacing.sm}px;
`;

const PriceLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 20px;
  color: ${(props) => props.theme.text};
`;

const PriceUnit = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const BadgeRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: ${spacing.xs}px;
  margin-top: ${spacing.sm}px;
`;

const badgeTint = {
  good: "rgba(11, 110, 79, 0.08)",
  warn: "rgba(224, 164, 21, 0.13)",
  plain: "rgba(0, 0, 0, 0.045)",
};

const badgeInk = { good: EMERALD, warn: "#8a6415", plain: "#5B5B5E" };

const Badge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px ${spacing.sm}px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => badgeTint[props.tone]};
`;

const BadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => badgeInk[props.tone]};
`;

const StarsLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${(props) => lagoonInk(props.theme)};
  margin-top: ${spacing.sm}px;
`;

const FactRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
`;

const FactLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
  padding-top: ${spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const CallButton = styled(Pressable)`
  flex: 1.6;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.muted ? props.theme.border : LAGOON};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${(props) => (props.muted ? props.theme.textMuted : "#ffffff")};
`;

const WhatsappButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 46px;
  border-radius: ${radius.pill}px;
  background-color: rgba(26, 90, 99, 0.09);
`;

const WhatsappLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${(props) => lagoonInk(props.theme)};
`;

const EmptyLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 21px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
  padding: ${spacing.xl}px ${spacing.md}px;
`;

const SampleNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const SafetyNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.md}px;
  background-color: rgba(224, 164, 21, 0.1);
  border-width: 1px;
  border-color: rgba(224, 164, 21, 0.28);
`;

const SafetyLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 18px;
  color: #6b5a2e;
`;
