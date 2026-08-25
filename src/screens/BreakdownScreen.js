import { useMemo, useState } from "react";
import { FlatList, Linking, Modal, Pressable, ScrollView } from "react-native";
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
import { openChat } from "../utils/openChat";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useGarageProviders } from "../hooks/useGarageProviders";
import { cities } from "../data/cities";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { buildLinkUrl } from "../data/restaurantLinks";
import { getGarageSpecialtyLabel } from "../data/garageSpecialties";
import {
  formatAvailabilityAge,
  getAvailabilityLabel,
  getEquipmentLabel,
  getResponseTimeLabel,
  readAvailability,
} from "../data/roadside";
import { getServiceRateLabel } from "../data/serviceRateTypes";
import {
  breakdownProblems,
  getBreakdownProblem,
} from "../data/breakdownProblems";
import { gridItemWidth } from "../utils/gridWidth";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const TERRACOTTA = "#C1512D";
const EMERGENCY_NUMBER = "112";

// Dépannage: someone is standing beside a car that will not move.
//
// Deliberately not a second Garages screen. Garages answers "who should
// maintain my car", which is a decision taken sitting down, with filters and
// sorting and time to compare. This answers "who can help me right now", so
// it is one column of large targets, plain words, and the fewest taps
// between arriving and a phone ringing.
//
// Three things the brief asks for are NOT here, because nothing in the app
// can honestly produce them yet:
//
//   - "🟢 Disponible maintenant". No provider anywhere has told us whether
//     they are free, so a green dot would be decoration on a guess — and a
//     wrong one strands somebody who waited for a call that was never
//     coming. This is the single most valuable thing to add next, and it
//     needs a control the provider owns (see the note under the list).
//   - "Arrivée estimée 15–25 min". We have no dispatch and no provider
//     position. An ETA would be a promise made by an app that cannot keep
//     it.
//   - "Demander une intervention" and the job-in-progress tracking that
//     follows it. That is a request record, a provider who receives it, and
//     a way to accept — a backend, not a screen. Until it exists, the
//     honest primary action is the one that already works: a phone call.
//
// What IS here is real: the provider's own number, their own WhatsApp,
// directions to their own address, the trades their own listing names, and
// ratings left by real customers.
export function BreakdownScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Screens that already asked the question hand the answer over rather than
  // asking it again — somebody who has just told Pneus they have a puncture
  // should not meet the same grid of problems on arrival.
  const [problemKey, setProblemKey] = useState(route?.params?.problem ?? null);
  const [answerKey, setAnswerKey] = useState(null);

  // A hand-picked city, which overrides the fix entirely.
  //
  // The nearest-known-city rule is a good guess and a guess is all it is:
  // there are a few dozen cities in the list and hundreds of places to break
  // down between them, so somebody stranded outside Natitingou can be told
  // they are in Tanguiéta. Being wrong about where you are is worse on this
  // screen than on any other — it decides every provider shown — so the row
  // opens a list rather than only asking for the permission again.
  const [manualCity, setManualCity] = useState(null);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");

  // Requested on arrival rather than on demand, unlike every other screen in
  // the app. Here the whole point is who is near, the person is unlikely to
  // want to type a quartier one-handed at the roadside, and they came to
  // this screen precisely because something is wrong.
  const {
    status: locationStatus,
    coords: userCoords,
    requestLocation,
  } = useCurrentLocation({ enabled: true });

  // useCurrentLocation gives a fix, not a place name. Naming the nearest
  // known city is what turns "12.4 km" into something a person recognises —
  // and it is the same "nearest known city" rule the Local tab already uses
  // rather than a second idea of where somebody is.
  const detectedCity = useMemo(() => {
    if (!userCoords) return null;
    let nearest = null;
    let shortest = Infinity;
    for (const city of cities) {
      const coord = cityCoordinates[city];
      if (!coord) continue;
      const away = distanceInKm(userCoords, coord);
      if (away < shortest) {
        shortest = away;
        nearest = city;
      }
    }
    return nearest;
  }, [userCoords]);

  const activeCity = manualCity ?? detectedCity;
  // A chosen city means the city's own coordinates. Distances then run from
  // there and the screen says so, rather than presenting a measurement from
  // a town centre as a measurement from the reader.
  const activeCoords = manualCity
    ? (cityCoordinates[manualCity] ?? userCoords)
    : userCoords;

  const providers = useGarageProviders(activeCoords);
  const ratings = useSellerRatings(
    useMemo(() => providers.map((item) => item.sellerId), [providers]),
  );

  const problem = problemKey ? getBreakdownProblem(problemKey) : null;
  const answer = problem?.followUp?.options.find(
    (option) => option.key === answerKey,
  );

  // The follow-up narrows the trades when it has been answered; until then
  // the problem's own list stands. An empty list means "we do not know" —
  // "Autre problème" — and shows everyone rather than nobody.
  const trades = answer?.trades ?? problem?.trades ?? [];

  const matches = useMemo(() => {
    const list =
      trades.length === 0
        ? providers
        : providers.filter((item) =>
            item.specialties.some((key) => trades.includes(key)),
          );
    // Whoever said they are free comes first, then whoever is nearest.
    // Distance decides nothing on its own here: the closest garage in the
    // city is no use to a stranded person if it is shut, and a provider who
    // declared themselves available ten minutes ago is the whole point of
    // the screen. "Not declared" ranks between available and unavailable —
    // unknown is not the same as no.
    const rank = (item) => {
      const state = readAvailability(item)?.key ?? null;
      if (state === "now") return 0;
      if (state === "hour") return 1;
      if (state === null) return 2;
      return 3;
    };
    return [...list].sort((a, b) => {
      const byState = rank(a) - rank(b);
      if (byState !== 0) return byState;
      // "We could not measure" last rather than treated as zero km.
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }, [providers, trades]);

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  // A search rather than a pinned coordinate: a listing carries a city and a
  // quartier, not a surveyed point, so asking Maps to find the name is
  // honest where dropping a pin would not be.
  const openDirections = (item) => {
    const query = encodeURIComponent(
      [item.name, item.place, item.city].filter(Boolean).join(" "),
    );
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${query}`,
    ).catch(() => {});
  };

  // A photo of the fault, delivered where it can actually arrive: the chat
  // thread for that provider, which already carries images and reaches their
  // inbox. The mockup put "Ajouter une photo" above the list, but a photo
  // with no recipient goes nowhere — it belongs to the provider you picked,
  // and it opens straight into the picker so nobody hunts for a paperclip at
  // the roadside.
  const sendPhoto = (item) => {
    openChat({
      listing: item,
      listingTitle: language === "en" ? item.titleEn : item.titleFr,
      user,
      navigation,
      t,
      attachOnOpen: true,
    });
  };

  const selectProblem = (key) => {
    setProblemKey(key);
    setAnswerKey(null);
  };

  const locationLabel =
    activeCity ??
    (locationStatus === "granted"
      ? t("breakdownLocating")
      : t("breakdownLocationOff"));

  const filteredCities = cities.filter((city) =>
    city.toLowerCase().includes(citySearch.trim().toLowerCase()),
  );

  const chooseCity = (city) => {
    setManualCity(city);
    setCityPickerOpen(false);
    setCitySearch("");
  };

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#8f2f1b", "#5e1f12", "#3d150c"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("breakdownEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("breakdownTitle")}</HeroTitle>
        <HeroCopy>{t("breakdownIntro")}</HeroCopy>
      </Hero>

      {/* Where you are, on the screen where it decides everything, and now
          astride the banner's edge instead of sunk into it. This is the one
          control that must look tappable: on a red field it was another
          notice, and somebody who refused the permission has to see that
          there is something here to press. */}
      <LocationDock>
        <LocationRow onPress={() => setCityPickerOpen(true)}>
          <LocationIcon>
            <Ionicons
              name={manualCity ? "location" : "navigate"}
              size={15}
              color={TERRACOTTA}
            />
          </LocationIcon>
          <LocationLabel numberOfLines={1}>{locationLabel}</LocationLabel>
          <LocationAction>{t("breakdownChangeCity")}</LocationAction>
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
        </LocationRow>
        {/* Said once, where the number it qualifies is about to appear. */}
        {manualCity ? (
          <ManualNote>
            {t("breakdownManualCity", { city: manualCity })}
          </ManualNote>
        ) : null}
      </LocationDock>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Question>{t("breakdownQuestion")}</Question>
        <ProblemGrid>
          {breakdownProblems.map((item, index) => {
            const active = problemKey === item.key;
            return (
              <ProblemCard
                key={item.key}
                active={active}
                width={gridItemWidth(index, breakdownProblems.length, 2)}
                onPress={() => selectProblem(item.key)}
              >
                <ProblemEmoji>{item.emoji}</ProblemEmoji>
                <ProblemLabel active={active}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </ProblemLabel>
              </ProblemCard>
            );
          })}
        </ProblemGrid>

        {problem ? (
          <>
            {/* Safety first, literally: on an overheating engine or after a
                collision, the useful sentence is not "here are four
                garages". */}
            {problem.safetyKey ? (
              <SafetyCard emergency={problem.emergency}>
                <Ionicons
                  name={problem.emergency ? "alert-circle" : "warning-outline"}
                  size={18}
                  color={problem.emergency ? TERRACOTTA : "#8a6415"}
                />
                <SafetyText emergency={problem.emergency}>
                  {t(problem.safetyKey)}
                </SafetyText>
              </SafetyCard>
            ) : null}

            {/* 112 above the provider list, not inside it. Chez-Nous is a way
                to reach a mechanic, not an emergency service, and after a
                collision the first call is not to a garage. */}
            {problem.emergency ? (
              <EmergencyButton onPress={() => call(EMERGENCY_NUMBER)}>
                <Ionicons name="call" size={18} color="#ffffff" />
                <EmergencyLabel>
                  {t("breakdownCallEmergency", { number: EMERGENCY_NUMBER })}
                </EmergencyLabel>
              </EmergencyButton>
            ) : null}

            {problem.followUp ? (
              <FollowUp>
                <FollowUpQuestion>
                  {language === "en"
                    ? problem.followUp.questionEn
                    : problem.followUp.questionFr}
                </FollowUpQuestion>
                {problem.followUp.options.map((option) => {
                  const chosen = answerKey === option.key;
                  return (
                    <AnswerRow
                      key={option.key}
                      chosen={chosen}
                      onPress={() => setAnswerKey(option.key)}
                    >
                      <AnswerLabel chosen={chosen}>
                        {language === "en" ? option.labelEn : option.labelFr}
                      </AnswerLabel>
                      {chosen ? (
                        <Ionicons name="checkmark" size={16} color={EMERALD} />
                      ) : null}
                    </AnswerRow>
                  );
                })}
              </FollowUp>
            ) : null}

            <ResultHead>
              <ResultTitle>{t("breakdownNearYou")}</ResultTitle>
              <ResultCount>
                {t("breakdownCount", { count: matches.length })}
              </ResultCount>
            </ResultHead>

            {matches.map((item) => {
              const score = ratings?.[item.sellerId] ?? null;
              const name = language === "en" ? item.titleEn : item.titleFr;
              const availability = readAvailability(item);
              const responseLabel = getResponseTimeLabel(
                item.responseTime,
                language,
              );
              const equipmentLabel = (item.equipment ?? [])
                .map((key) => getEquipmentLabel(key, language))
                .filter(Boolean)
                .join(" + ");
              const rateLabel = getServiceRateLabel(
                item.serviceRateType,
                language,
              );
              return (
                <ProviderCard key={item.id}>
                  <ProviderTop>
                    <ProviderCol>
                      <ProviderName numberOfLines={2}>{name}</ProviderName>
                      <ProviderMeta numberOfLines={1}>
                        {[
                          item.distanceKm != null
                            ? `${item.distanceKm.toFixed(1).replace(".", ",")} km`
                            : null,
                          item.place,
                          item.specialties
                            .slice(0, 2)
                            .map((key) =>
                              getGarageSpecialtyLabel(key, language),
                            )
                            .join(" · "),
                        ]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </ProviderMeta>
                    </ProviderCol>
                    {score ? (
                      <RatingWrap>
                        <Ionicons name="star" size={12} color={GOLD} />
                        <RatingValue>
                          {score.rating.toFixed(1).replace(".", ",")}
                        </RatingValue>
                      </RatingWrap>
                    ) : null}
                  </ProviderTop>

                  {/* Only shown when the provider said so themselves, and
                      only while it is still recent — readAvailability
                      expires a declaration after four hours rather than
                      leaving a green dot standing from last week. The
                      timestamp is beside it so the reader can judge it
                      rather than trust it. */}
                  {availability || responseLabel ? (
                    <StateRow>
                      {availability ? (
                        <AvailabilityPill state={availability.key}>
                          <AvailabilityDot state={availability.key} />
                          <AvailabilityLabel state={availability.key}>
                            {getAvailabilityLabel(availability.key, language)}
                          </AvailabilityLabel>
                        </AvailabilityPill>
                      ) : null}
                      {responseLabel ? (
                        <ResponseWrap>
                          <Ionicons
                            name="time-outline"
                            size={13}
                            color={colors.textMuted}
                          />
                          {/* "habituellement" is doing real work: this is the
                              provider's own typical, not an ETA we computed
                              and would be held to. */}
                          <ResponseLabel>
                            {t("breakdownUsually", { time: responseLabel })}
                          </ResponseLabel>
                        </ResponseWrap>
                      ) : null}
                    </StateRow>
                  ) : null}

                  {availability ? (
                    <UpdatedLabel>
                      {t("breakdownUpdated", {
                        ago: formatAvailabilityAge(
                          availability.ageMs,
                          language,
                        ),
                      })}
                    </UpdatedLabel>
                  ) : null}

                  {equipmentLabel || rateLabel ? (
                    <DetailRow>
                      {equipmentLabel ? (
                        <DetailText numberOfLines={1}>
                          {equipmentLabel}
                        </DetailText>
                      ) : null}
                      {rateLabel && item.price > 0 ? (
                        <PriceText>
                          {rateLabel} {item.price.toLocaleString("fr-FR")} FCFA
                        </PriceText>
                      ) : rateLabel ? (
                        <PriceText>{rateLabel}</PriceText>
                      ) : null}
                    </DetailRow>
                  ) : null}

                  {item.coverageZones ? (
                    <ZonesLabel numberOfLines={2}>
                      {t("breakdownZones", { zones: item.coverageZones })}
                    </ZonesLabel>
                  ) : null}

                  {/* Call first and biggest: at the roadside it is the only
                      one that reaches a person in seconds. WhatsApp sits
                      beside it rather than behind a menu — it is how most
                      of this market actually messages, and a photo of the
                      fault saves a conversation. */}
                  <ActionRow>
                    <CallButton
                      onPress={() => call(item.phone)}
                      disabled={!item.phone}
                      muted={!item.phone}
                    >
                      <Ionicons name="call" size={16} color="#ffffff" />
                      <CallLabel>{t("breakdownCall")}</CallLabel>
                    </CallButton>
                    {item.whatsapp ? (
                      <WhatsappButton
                        onPress={() => openWhatsapp(item.whatsapp)}
                      >
                        <Ionicons
                          name="logo-whatsapp"
                          size={16}
                          color="#ffffff"
                        />
                      </WhatsappButton>
                    ) : null}
                    <GhostButton onPress={() => openDirections(item)}>
                      <Ionicons
                        name="navigate-outline"
                        size={16}
                        color={EMERALD}
                      />
                    </GhostButton>
                  </ActionRow>

                  {/* Under the call row, not competing with it: on a roadside
                      the phone is still the fastest thing, and a photo is
                      what saves the conversation once someone has answered.
                      Dashed, because it adds something rather than reporting
                      something. */}
                  <PhotoButton onPress={() => sendPhoto(item)}>
                    <Ionicons name="camera-outline" size={16} color={EMERALD} />
                    <PhotoCol>
                      <PhotoLabel>{t("breakdownSendPhoto")}</PhotoLabel>
                      <PhotoHint>{t("breakdownSendPhotoHint")}</PhotoHint>
                    </PhotoCol>
                  </PhotoButton>
                </ProviderCard>
              );
            })}

            {matches.length === 0 ? (
              <EmptyCard>
                <EmptyTitle>{t("breakdownEmptyTitle")}</EmptyTitle>
                <EmptyCopy>{t("breakdownEmptyCopy")}</EmptyCopy>
                <EmptyAction onPress={() => navigation.navigate("Garages")}>
                  <EmptyActionLabel>{t("breakdownSeeAll")}</EmptyActionLabel>
                </EmptyAction>
              </EmptyCard>
            ) : null}

            {/* Said plainly, because its absence is the thing a stranded
                person most needs to know. */}
            <AvailabilityNote>
              <Ionicons
                name="information-circle-outline"
                size={15}
                color={colors.textMuted}
              />
              <AvailabilityText>
                {t("breakdownAvailabilityNote")}
              </AvailabilityText>
            </AvailabilityNote>
          </>
        ) : null}
      </ScrollView>
      <Modal
        visible={cityPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCityPickerOpen(false)}
      >
        <SheetBackdrop onPress={() => setCityPickerOpen(false)}>
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetHandle />
            <SheetTitle>{t("chooseCityTitle")}</SheetTitle>

            <SheetSearch>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <SheetInput
                value={citySearch}
                onChangeText={setCitySearch}
                placeholder={t("searchCityPlaceholder")}
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
              />
            </SheetSearch>

            {/* Offered only once a city has been chosen, because with none
                chosen it is already what the screen is doing. Asking again
                also re-prompts when the permission was refused. */}
            {manualCity || locationStatus !== "granted" ? (
              <ResetRow
                onPress={() => {
                  setManualCity(null);
                  setCityPickerOpen(false);
                  setCitySearch("");
                  if (locationStatus !== "granted") requestLocation();
                }}
              >
                <Ionicons name="locate-outline" size={16} color={TERRACOTTA} />
                <ResetLabel>{t("useMyLocationCity")}</ResetLabel>
              </ResetRow>
            ) : null}

            <FlatList
              data={filteredCities}
              keyExtractor={(city) => city}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item: city }) => (
                <CityRow onPress={() => chooseCity(city)}>
                  <CityLabel selected={city === activeCity}>{city}</CityLabel>
                  {city === activeCity ? (
                    <Ionicons name="checkmark" size={17} color={TERRACOTTA} />
                  ) : null}
                </CityRow>
              )}
            />
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// Red, not the app's emerald. Every other screen is the marketplace; this one
// is the one you open when something has gone wrong, and it should not look
// like browsing.
// Curved at the base like every other header in the app, with room at the
// bottom for the location row that overlaps it: 54px, of which the card
// takes back 30.
const Hero = styled(LinearGradient)`
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px 54px;
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
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.8);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 26px;
  line-height: 31px;
  color: #ffffff;
  margin-bottom: 6px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.78);
  max-width: 310px;
`;

// Pulled up over the banner's curve, so the banner reads as a surface with
// something resting on it rather than a block with a gap beneath.
const LocationDock = styled.View`
  z-index: 2;
  margin-top: -30px;
  padding: 0px ${spacing.md}px;
`;

const LocationRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 0px 14px;
  min-height: 56px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const LocationIcon = styled.View`
  width: 32px;
  height: 32px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: rgba(193, 81, 45, 0.1);
`;

const ManualNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 8px;
  margin-left: 4px;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.35);
`;

const Sheet = styled.View`
  max-height: 78%;
  padding: 10px ${spacing.md}px ${spacing.lg}px;
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  background-color: ${(props) => props.theme.background};
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  background-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.md}px;
`;

const SheetSearch = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 0px 14px;
  height: 48px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.sm}px;
`;

const SheetInput = styled.TextInput`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  padding: 0px;
`;

const ResetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 50px;
  padding: 0px 4px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const ResetLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${TERRACOTTA};
`;

const CityRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  min-height: 50px;
  padding: 0px 4px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const CityLabel = styled.Text`
  font-family: ${(props) =>
    props.selected ? fontFamily.semiBold : fontFamily.regular};
  font-size: 14.5px;
  color: ${(props) =>
    props.selected ? props.theme.text : props.theme.textMuted};
`;

const LocationLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

// The one place a colour is doing work rather than decoration: this is the
// word somebody taps when the permission was refused, and it has to read as
// an action rather than as the end of the sentence.
const LocationAction = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${TERRACOTTA};
`;

const Question = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.md}px;
`;

const ProblemGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: ${spacing.lg}px;
`;

// Big targets: this is used one-handed, outdoors, by somebody who is not
// having a good day.
const ProblemCard = styled(Pressable)`
  width: ${(props) => props.width};
  min-height: 92px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: ${spacing.md}px 10px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) =>
    props.active ? props.theme.primaryLight : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
  ${shadow.card}
`;

const ProblemEmoji = styled.Text`
  font-size: 26px;
`;

const ProblemLabel = styled.Text`
  font-family: ${(props) =>
    props.active ? fontFamily.bold : fontFamily.medium};
  font-size: 12.5px;
  line-height: 17px;
  text-align: center;
  color: ${(props) => (props.active ? EMERALD : props.theme.text)};
`;

const SafetyCard = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.emergency ? "rgba(193, 81, 45, 0.1)" : "rgba(217, 164, 65, 0.12)"};
  border-width: 1px;
  border-color: ${(props) =>
    props.emergency ? "rgba(193, 81, 45, 0.3)" : "rgba(217, 164, 65, 0.32)"};
  margin-bottom: ${spacing.md}px;
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${(props) =>
    props.emergency ? fontFamily.semiBold : fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => (props.emergency ? "#8a2f1b" : "#6b5a2e")};
`;

const EmergencyButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  min-height: 52px;
  border-radius: ${radius.lg}px;
  background-color: ${TERRACOTTA};
  margin-bottom: ${spacing.md}px;
`;

const EmergencyLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: #ffffff;
`;

const FollowUp = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.lg}px;
`;

const FollowUpQuestion = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const AnswerRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  padding: 12px 14px;
  margin-top: 8px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.chosen ? props.theme.primaryLight : props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => (props.chosen ? EMERALD : "transparent")};
`;

const AnswerLabel = styled.Text`
  flex: 1;
  font-family: ${(props) =>
    props.chosen ? fontFamily.semiBold : fontFamily.regular};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const ResultHead = styled.View`
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;

const ResultTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const ResultCount = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const ProviderCard = styled.View`
  gap: 12px;
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: 10px;
  ${shadow.card}
`;

const ProviderTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
`;

const ProviderCol = styled.View`
  flex: 1;
`;

const ProviderName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  line-height: 20px;
  color: ${(props) => props.theme.text};
`;

const ProviderMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 4px;
`;

const RatingWrap = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const RatingValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const StateRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
`;

const AvailabilityPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.state === "now"
      ? props.theme.primaryLight
      : props.state === "hour"
        ? "rgba(217, 164, 65, 0.16)"
        : props.theme.surfaceAlt};
`;

const AvailabilityDot = styled.View`
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background-color: ${(props) =>
    props.state === "now"
      ? EMERALD
      : props.state === "hour"
        ? GOLD
        : props.theme.textMuted};
`;

const AvailabilityLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  color: ${(props) =>
    props.state === "now"
      ? EMERALD
      : props.state === "hour"
        ? "#8a6415"
        : props.theme.textMuted};
`;

const ResponseWrap = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const ResponseLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const UpdatedLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: -6px;
`;

const DetailRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
`;

const DetailText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
`;

const PriceText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const ZonesLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: -6px;
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
  min-height: 48px;
  border-radius: 15px;
  background-color: ${(props) => (props.muted ? props.theme.textMuted : EMERALD)};
  opacity: ${(props) => (props.muted ? 0.45 : 1)};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: #ffffff;
`;

const WhatsappButton = styled(Pressable)`
  width: 52px;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  background-color: #25d366;
`;

const GhostButton = styled(Pressable)`
  width: 52px;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.28);
`;

const PhotoButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 48px;
  padding: 10px 13px;
  border-radius: 15px;
  border-width: 1px;
  border-style: dashed;
  border-color: rgba(11, 110, 79, 0.4);
  background-color: ${(props) => props.theme.primaryLight};
`;

const PhotoCol = styled.View`
  flex: 1;
`;

const PhotoLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const PhotoHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const EmptyCard = styled.View`
  align-items: center;
  padding: 26px 20px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
  text-align: center;
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;

const EmptyAction = styled(Pressable)`
  margin-top: ${spacing.md}px;
  min-height: 44px;
  justify-content: center;
  padding: 0 18px;
  border-radius: 15px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const EmptyActionLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const AvailabilityNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 13px 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-top: ${spacing.md}px;
`;

const AvailabilityText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;
