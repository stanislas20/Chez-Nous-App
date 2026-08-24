import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
} from "react-native";
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
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useApprovedListings } from "../hooks/useApprovedListings";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { cityCoordinates } from "../data/cityCoordinates";
import { sampleGarages } from "../data/sampleGarages";
import { buildLinkUrl } from "../data/restaurantLinks";
import { distanceInKm } from "../utils/geo";
import { queryMatches } from "../utils/search";
import { isOpenNow } from "../data/openingDays";
import { getServiceRateLabel } from "../data/serviceRateTypes";
import {
  garageSpecialties,
  garageSpecialtiesFor,
  garageSymptoms,
  getGarageSpecialty,
  getGarageSpecialtyLabel,
  getGarageSymptom,
  isGarageListing,
} from "../data/garageSpecialties";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const TERRACOTTA = "#C1512D";

// Find a garage, starting from the symptom rather than the trade.
//
// Built from the dc-24 mockup, with the invented parts replaced by real
// ones. Everything structural is kept — the hero, the symptom triage, the
// breakdown card, the specialty rail, the filters, the sort, the card
// layout, both sheets. What changed is where the content comes from:
//
//   - The garages are real approved Services listings that mention a
//     car-repair trade, not a hardcoded list of six shops.
//   - Ratings come from sellerStats, which counts real ratings people left.
//     A garage nobody has rated shows no stars at all rather than an
//     invented 4,7.
//   - "Ouvert · ferme à 19h00" is computed from the opening hours the
//     provider actually published. A provider who published none shows no
//     status, instead of being guessed as closed and losing the work.
//   - The mockup's price band (₣ / ₣₣ / ₣₣₣) is gone. Nothing in the data
//     ranks a garage as cheap or dear, and three symbols would have been a
//     verdict we invented. What a provider does state is how they charge —
//     fixed, hourly, daily, or on request — so the card shows that instead.
//
// One control from the mockup is deliberately absent: the "Se déplace"
// filter. There is no field anywhere that records whether a provider comes
// to you, so the filter could only have been decorative — and a filter that
// silently ignores what you asked for is worse than one that is missing.
// The moment CreateListingScreen asks the question, the chip belongs here.
export function GaragesScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const listings = useApprovedListings();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  // Arrives pre-filtered when opened from a named tile ("Pneus", "Batterie")
  // and unfiltered from the section header. Initial state rather than an
  // effect: the first render is already correct, so the full list never
  // flashes before narrowing to the trade that was asked for.
  const [specialty, setSpecialty] = useState(route?.params?.specialty ?? null);
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState("distance");
  const [symptomKey, setSymptomKey] = useState(null);
  const [contactFor, setContactFor] = useState(null);

  // Off until asked. The distance sort is the only thing that needs a fix,
  // so the permission prompt happens when someone chooses it rather than on
  // arrival — same rule the Jobs "À proximité" filter follows.
  const {
    status: locationStatus,
    coords: userCoords,
    requestLocation,
  } = useCurrentLocation({ enabled: false });

  // Services listings that mention any car-repair trade. Everything else in
  // the Services category is somebody's plumbing or catering ad.
  const garages = useMemo(() => {
    if (!listings) return [];
    const searchableText = (listing) =>
      `${listing.titleEn ?? ""} ${listing.titleFr ?? ""} ${listing.descriptionEn ?? ""} ${listing.descriptionFr ?? ""}`;

    return listings
      .filter((listing) => listing.categoryKey === "services")
      .filter((listing) => isGarageListing(searchableText(listing)))
      .map((listing) => {
        const text = searchableText(listing);
        const cityCoord = cityCoordinates[listing.city];
        return {
          ...listing,
          name: language === "en" ? listing.titleEn : listing.titleFr,
          specialties: garageSpecialtiesFor(text),
          distanceKm:
            userCoords && cityCoord
              ? distanceInKm(userCoords, cityCoord)
              : null,
          // null means the provider declared no hours — which shows no badge
          // at all rather than guessing "Fermé" and turning customers away.
          openNow: isOpenNow(
            listing.openDays,
            listing.openTime,
            listing.closeTime,
          ),
          place: listing.quartier || listing.area || listing.city || null,
          // The cover photo the provider uploaded. The media picker was
          // never gated by category, so a garage can already post photos of
          // the workshop — the card simply was not showing them.
          photoUrl: listing.mediaUrl ?? null,
        };
      });
  }, [listings, language, userCoords]);

  // Samples only while there are none of the real thing — the same rule the
  // restaurants and job screens follow, and for the same reason: one real
  // garage beside two invented ones would have somebody phoning an example.
  // Distance still comes from the device against the sample's city, so even
  // the placeholder never states a figure we did not compute.
  const showingSamples = garages.length === 0;
  const pool = useMemo(() => {
    if (!showingSamples) return garages;
    return sampleGarages.map((item) => {
      const cityCoord = cityCoordinates[item.city];
      return {
        ...item,
        name: language === "en" ? item.nameEn : item.nameFr,
        distanceKm:
          userCoords && cityCoord ? distanceInKm(userCoords, cityCoord) : null,
        openNow: null,
      };
    });
  }, [showingSamples, garages, language, userCoords]);

  // Ratings for everything that passed the category filter, not just what
  // survives the chips: the score has to be known before "Mieux noté" can
  // sort, and re-fetching on every filter change would restart the query
  // each time a chip is tapped.
  const ratings = useSellerRatings(
    useMemo(() => garages.map((item) => item.sellerId), [garages]),
  );

  // Opening the posting form with Services and the garage trade already
  // set, so the placeholder and the "name your trades" note are the ones a
  // garage needs. Nested twice on purpose: the Sell tab opens
  // SellerDashboard, so params addressed to the tab stop there — naming the
  // inner screen is what carries them through.
  const openGaragePostForm = () =>
    navigation.navigate("MainTabs", {
      screen: "Sell",
      params: {
        screen: "CreateListing",
        params: { categoryKey: "services", trade: "garage" },
      },
    });

  const { remember } = useAccountGateIntent(user, openGaragePostForm);

  // A visitor goes through the shared account gate, not the Sell tab:
  // jumping to the tab pops this screen off the root stack, so the back
  // arrow had nothing to return to. The gate returns them here, and
  // `remember` picks the form back up when it does.
  const startPosting = () => {
    if (!user) {
      remember();
      openAccountGate(navigation);
      return;
    }
    openGaragePostForm();
  };

  const toggleFilter = (key) =>
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));

  // Choosing a trade only ever changed the results, and the results are far
  // below the triage panel — so the tap looked dead: the sheet closed and
  // the part of the screen that moved was off-screen. Worse when nobody has
  // posted yet, because then the list is empty before and after, and the
  // honest "no provider yet" answer was never seen either.
  //
  // So selecting a trade now carries you to its outcome. The count row is
  // the anchor rather than the specialty rail: what someone wants after
  // saying "battery" is the answer, and that row names the trade as well as
  // the number, so the selection is confirmed in words on arrival.
  const scrollRef = useRef(null);
  const resultsY = useRef(0);
  const revealResults = () => {
    // After the sheet's dismiss animation, or the scroll competes with it
    // and lands short.
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, resultsY.current - spacing.md),
        animated: true,
      });
    }, 260);
  };

  // A sample card has no listing behind it, so it cannot open one — but
  // silence is the wrong answer to a tap. Saying why, and offering the one
  // action that does exist, beats a card that swallows presses: a driver
  // learns these two are examples, and an owner gets the way in.
  const explainSample = () => {
    Alert.alert(t("garageSampleTag"), t("garageSampleNote"), [
      { text: t("garageSampleDismiss"), style: "cancel" },
      { text: t("garageOwnerCardTitle"), onPress: startPosting },
    ]);
  };

  const chooseSpecialty = (key) => {
    setSpecialty(key);
    revealResults();
  };

  const visible = useMemo(() => {
    const list = pool
      .filter((item) =>
        !specialty ? true : item.specialties.includes(specialty),
      )
      .filter((item) => queryMatches(search, item.name, item.place, item.city))
      .filter((item) => (!filters.open ? true : item.openNow === true))
      .filter((item) =>
        !filters.verified ? true : Boolean(item.sellerVerified),
      )
      .filter((item) => (!filters.whatsapp ? true : Boolean(item.whatsapp)))
      .filter((item) =>
        !filters.quote ? true : item.serviceRateType === "quote",
      );

    // Sorting always pushes "we don't know" to the end rather than treating
    // a missing value as a zero: an unrated garage is not the worst-rated
    // one, and a provider who set no price is not the cheapest.
    const unknownLast = (a, b, pick, direction) => {
      const left = pick(a);
      const right = pick(b);
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      return direction * (left - right);
    };

    if (sortBy === "rating") {
      return [...list].sort((a, b) =>
        unknownLast(
          a,
          b,
          (item) => ratings?.[item.sellerId]?.rating ?? null,
          -1,
        ),
      );
    }
    if (sortBy === "price") {
      return [...list].sort((a, b) =>
        unknownLast(a, b, (item) => (item.price > 0 ? item.price : null), 1),
      );
    }
    return [...list].sort((a, b) =>
      unknownLast(a, b, (item) => item.distanceKm, 1),
    );
  }, [pool, specialty, search, filters, sortBy, ratings]);

  const selectSort = (key) => {
    setSortBy(key);
    if (key === "distance" && locationStatus !== "granted") requestLocation();
  };

  const symptom = symptomKey ? getGarageSymptom(symptomKey) : null;

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  // Through buildLinkUrl, not a hand-rolled wa.me. Providers type a Bénin
  // number the way it is written locally ("01 23 45 67 89"), and wa.me needs
  // international form — my first version passed the local digits straight
  // through, which opens a wrong account or nothing at all. buildLinkUrl
  // adds the 229 when it is missing and also accepts a handle or a full URL,
  // because people type all three.
  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const SORTS = [
    { key: "distance", labelKey: "garageSortDistance" },
    { key: "rating", labelKey: "garageSortRating" },
    { key: "price", labelKey: "garageSortPrice" },
  ];

  const FILTERS = [
    { key: "open", labelKey: "garageFilterOpen" },
    { key: "verified", labelKey: "garageFilterVerified" },
    { key: "whatsapp", labelKey: "garageFilterWhatsapp" },
    { key: "quote", labelKey: "garageFilterQuote" },
  ];

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#0B6E4F", "#07362A", "#05261D"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("garagesEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("garagesTitle")}</HeroTitle>
        <HeroCopy>{t("garagesIntro")}</HeroCopy>

        <HeroSearch>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.75)" />
          <HeroInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("garagesSearchPlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.6)"
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={10}>
              <Ionicons
                name="close-circle"
                size={17}
                color="rgba(255,255,255,0.7)"
              />
            </Pressable>
          ) : null}
        </HeroSearch>
      </Hero>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Symptom before trade. Someone whose car makes a noise does not
            know whether that is the alternator, the belt or the brakes, and
            a grid of ten trade names asks them to diagnose the fault before
            they are allowed to look for help. */}
        <TriagePanel>
          <TriageTitle>{t("garageTriageTitle")}</TriageTitle>
          <TriageCopy>{t("garageTriageCopy")}</TriageCopy>
          {garageSymptoms.map((item) => (
            <SymptomRow key={item.key} onPress={() => setSymptomKey(item.key)}>
              <SymptomLabel>
                {language === "en" ? item.labelEn : item.labelFr}
              </SymptomLabel>
              <Ionicons name="arrow-forward" size={15} color={EMERALD} />
            </SymptomRow>
          ))}
        </TriagePanel>

        {/* Its own card, in its own colour, because "I am stranded right
            now" is a different situation from browsing — and it selects the
            breakdown trade rather than pretending we can send anyone. */}
        {/* Its own screen, not a filter on this one. "I am stuck by the
            road" is a different task from choosing a garage, and it starts
            from the problem rather than the trade. */}
        <SosCard onPress={() => navigation.navigate("Breakdown")}>
          <SosIcon>
            <Ionicons name="warning-outline" size={21} color={TERRACOTTA} />
          </SosIcon>
          <SosCol>
            <SosTitle>{t("garageSosTitle")}</SosTitle>
            <SosCopy>{t("garageSosCopy")}</SosCopy>
          </SosCol>
          <Ionicons name="chevron-forward" size={17} color={TERRACOTTA} />
        </SosCard>

        <SectionLabel>{t("garageSpecialtiesLabel")}</SectionLabel>
        <SpecialtyRail
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 14, paddingRight: spacing.md }}
        >
          <SpecialtyItem onPress={() => chooseSpecialty(null)}>
            <SpecialtyDisc active={!specialty}>
              <Ionicons
                name="apps-outline"
                size={20}
                color={!specialty ? "#ffffff" : colors.text}
              />
            </SpecialtyDisc>
            <SpecialtyLabel active={!specialty} numberOfLines={1}>
              {t("garageSpecialtyAll")}
            </SpecialtyLabel>
          </SpecialtyItem>
          {garageSpecialties.map((item) => {
            const active = specialty === item.key;
            return (
              <SpecialtyItem
                key={item.key}
                onPress={() => chooseSpecialty(active ? null : item.key)}
              >
                <SpecialtyDisc active={active}>
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={active ? "#ffffff" : colors.text}
                  />
                </SpecialtyDisc>
                <SpecialtyLabel active={active} numberOfLines={1}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </SpecialtyLabel>
              </SpecialtyItem>
            );
          })}
        </SpecialtyRail>

        {/* Reached the tyre fitters by filtering this list, which answers
            "who can fit one" but not "which one fits my car". The screen
            that does is one tap away, and this is the moment somebody
            wants it. */}
        {specialty === "batt" ? (
          <TyreLink onPress={() => navigation.navigate("Battery")}>
            <TyreLinkIcon>
              <Ionicons
                name="battery-charging-outline"
                size={18}
                color={colors.primary}
              />
            </TyreLinkIcon>
            <TyreLinkCol>
              <TyreLinkTitle>{t("garageBatteryLinkTitle")}</TyreLinkTitle>
              <TyreLinkCopy>{t("garageBatteryLinkCopy")}</TyreLinkCopy>
            </TyreLinkCol>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </TyreLink>
        ) : null}

        {specialty === "carro" ? (
          <TyreLink onPress={() => navigation.navigate("Bodywork")}>
            <TyreLinkIcon>
              <Ionicons
                name="color-fill-outline"
                size={18}
                color={colors.primary}
              />
            </TyreLinkIcon>
            <TyreLinkCol>
              <TyreLinkTitle>{t("garageBodyLinkTitle")}</TyreLinkTitle>
              <TyreLinkCopy>{t("garageBodyLinkCopy")}</TyreLinkCopy>
            </TyreLinkCol>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </TyreLink>
        ) : null}

        {specialty === "elec" || specialty === "diag" ? (
          <TyreLink onPress={() => navigation.navigate("Electric")}>
            <TyreLinkIcon>
              <Ionicons name="flash-outline" size={18} color={colors.primary} />
            </TyreLinkIcon>
            <TyreLinkCol>
              <TyreLinkTitle>{t("garageElectricLinkTitle")}</TyreLinkTitle>
              <TyreLinkCopy>{t("garageElectricLinkCopy")}</TyreLinkCopy>
            </TyreLinkCol>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </TyreLink>
        ) : null}

        {specialty === "pneu" ? (
          <TyreLink onPress={() => navigation.navigate("Tyres")}>
            <TyreLinkIcon>
              <Ionicons name="disc-outline" size={18} color={colors.primary} />
            </TyreLinkIcon>
            <TyreLinkCol>
              <TyreLinkTitle>{t("garageTyreLinkTitle")}</TyreLinkTitle>
              <TyreLinkCopy>{t("garageTyreLinkCopy")}</TyreLinkCopy>
            </TyreLinkCol>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </TyreLink>
        ) : null}

        <SectionLabel>{t("garageFiltersLabel")}</SectionLabel>
        <FilterScroll
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: spacing.md }}
        >
          {FILTERS.map((item) => {
            const active = Boolean(filters[item.key]);
            return (
              <FilterChip
                key={item.key}
                active={active}
                onPress={() => toggleFilter(item.key)}
              >
                {active ? (
                  <Ionicons name="checkmark" size={13} color="#ffffff" />
                ) : null}
                <FilterChipLabel active={active}>
                  {t(item.labelKey)}
                </FilterChipLabel>
              </FilterChip>
            );
          })}
        </FilterScroll>

        <SortRow>
          {SORTS.map((item) => {
            const active = sortBy === item.key;
            return (
              <SortTab
                key={item.key}
                active={active}
                onPress={() => selectSort(item.key)}
              >
                <SortLabel active={active}>{t(item.labelKey)}</SortLabel>
              </SortTab>
            );
          })}
        </SortRow>

        {/* Named, not just counted: "3 garages" beside an active specialty
            chip reads as the total, and it is not. */}
        <CountRow
          onLayout={(event) => {
            resultsY.current = event.nativeEvent.layout.y;
          }}
        >
          <CountText>
            {t("garageCount", { count: visible.length })}
            {specialty
              ? ` · ${getGarageSpecialtyLabel(specialty, language)}`
              : ""}
          </CountText>
          {sortBy === "distance" && locationStatus !== "granted" ? (
            <CountHint>{t("garageDistanceHint")}</CountHint>
          ) : null}
        </CountRow>

        {/* Said before the cards, not after: somebody scanning a list of
            garages must know these two are not garages before they read
            them as such. */}
        {showingSamples ? (
          <SampleNote>
            <Ionicons
              name="information-circle-outline"
              size={15}
              color={EMERALD}
            />
            <SampleNoteText>{t("garageSampleNote")}</SampleNoteText>
          </SampleNote>
        ) : null}

        {visible.map((item) => {
          const score = ratings?.[item.sellerId] ?? null;
          const rateLabel = getServiceRateLabel(item.serviceRateType, language);
          return (
            <GarageCard
              key={item.id}
              // A sample has no listing behind it, so it opens nothing. The
              // card is still laid out exactly as a real one, because
              // showing an owner what theirs will look like is its whole
              // job.
              onPress={
                item.isSample
                  ? explainSample
                  : () =>
                      navigation.navigate("ProductDetail", { listing: item })
              }
            >
              <CardTop>
                {/* The photo when there is one, the initial when there is
                    not — the slot keeps its size either way, so a row of
                    cards stays aligned whether or not each provider
                    uploaded anything. `contain` rather than `cover`
                    because what gets uploaded is as often a painted sign
                    or a logo as a photograph of the workshop, and cropping
                    a logo to a square cuts the name off it. */}
                {item.photoUrl ? (
                  <PhotoWrap>
                    <Photo
                      source={{ uri: item.photoUrl }}
                      resizeMode="contain"
                    />
                  </PhotoWrap>
                ) : (
                  <Monogram>
                    <MonogramText>
                      {(item.name ?? "").trim().charAt(0).toUpperCase() || "?"}
                    </MonogramText>
                  </Monogram>
                )}
                <CardTopCol>
                  <GarageName numberOfLines={2}>{item.name}</GarageName>
                  <MetaLine>
                    {score ? (
                      <RatingWrap>
                        <Ionicons name="star" size={12} color={GOLD} />
                        <RatingValue>
                          {score.rating.toFixed(1).replace(".", ",")}
                        </RatingValue>
                        <RatingCount>
                          {t("garageReviewCount", { count: score.ratingCount })}
                        </RatingCount>
                      </RatingWrap>
                    ) : (
                      /* No stars rather than 0,0: never rated is not badly
                         rated, and the two must not look the same. */
                      <NoRating>{t("garageNoRating")}</NoRating>
                    )}
                    {rateLabel ? <RateBadge>{rateLabel}</RateBadge> : null}
                  </MetaLine>
                </CardTopCol>
                {item.isSample ? (
                  <SampleBadge>
                    <SampleBadgeLabel>{t("garageSampleTag")}</SampleBadgeLabel>
                  </SampleBadge>
                ) : item.sellerVerified ? (
                  <VerifiedBadge>
                    <Ionicons
                      name="shield-checkmark"
                      size={11}
                      color={EMERALD}
                    />
                    <VerifiedLabel>{t("garageVerified")}</VerifiedLabel>
                  </VerifiedBadge>
                ) : null}
              </CardTop>

              {item.openNow != null || item.place ? (
                <StatusRow>
                  {item.openNow != null ? (
                    <OpenWrap>
                      <OpenDot open={item.openNow} />
                      <OpenLabel open={item.openNow}>
                        {item.openNow
                          ? t("garageOpenUntil", { time: item.closeTime })
                          : t("garageClosed")}
                      </OpenLabel>
                    </OpenWrap>
                  ) : null}
                  {item.place ? (
                    <PlaceWrap>
                      <Ionicons
                        name="location-outline"
                        size={12}
                        color={colors.textMuted}
                      />
                      <PlaceLabel numberOfLines={1}>
                        {item.distanceKm != null
                          ? `${item.place} · ${item.distanceKm.toFixed(1).replace(".", ",")} km`
                          : item.place}
                      </PlaceLabel>
                    </PlaceWrap>
                  ) : null}
                </StatusRow>
              ) : null}

              {item.specialties.length > 0 ? (
                <PillRow>
                  {item.specialties.slice(0, 3).map((key) => (
                    <SpecPill key={key}>
                      <SpecPillLabel>
                        {getGarageSpecialtyLabel(key, language)}
                      </SpecPillLabel>
                    </SpecPill>
                  ))}
                  {item.specialties.length > 3 ? (
                    <SpecPill>
                      <SpecPillLabel>
                        +{item.specialties.length - 3}
                      </SpecPillLabel>
                    </SpecPill>
                  ) : null}
                </PillRow>
              ) : null}

              <ActionRow>
                {/* Deliberately dead on a sample, and drawn as dead: there
                    is no number behind it, and a button that opens an empty
                    sheet is worse than one that plainly cannot be used. */}
                <CallButton
                  onPress={
                    item.isSample ? explainSample : () => setContactFor(item)
                  }
                  disabled={!item.isSample && !item.phone && !item.whatsapp}
                  muted={item.isSample || (!item.phone && !item.whatsapp)}
                >
                  <Ionicons name="call-outline" size={14} color="#ffffff" />
                  <CallLabel>{t("garageContact")}</CallLabel>
                </CallButton>
                <GhostButton
                  onPress={
                    item.isSample
                      ? explainSample
                      : () =>
                          navigation.navigate("ProductDetail", {
                            listing: item,
                          })
                  }
                  muted={item.isSample}
                >
                  <GhostLabel muted={item.isSample}>
                    {t("garageViewListing")}
                  </GhostLabel>
                </GhostButton>
              </ActionRow>
            </GarageCard>
          );
        })}

        {visible.length === 0 ? (
          <EmptyWrap>
            <EmptyIcon>
              <Ionicons name="construct-outline" size={26} color={EMERALD} />
            </EmptyIcon>
            {/* Names the trade that was asked for. Arriving from
                "Batterie" at a generic "no garage here" reads as a dead
                end; naming it confirms the choice registered and that the
                answer is simply nobody yet. */}
            <EmptyTitle>
              {specialty
                ? t("garageEmptyTradeTitle", {
                    trade: getGarageSpecialtyLabel(specialty, language),
                  })
                : t("garageEmptyTitle")}
            </EmptyTitle>
            {/* Two different situations, two different sentences: nobody has
                published this trade yet, versus your filters excluded them. */}
            <EmptyCopy>
              {pool.length === 0
                ? t("garageEmptyNone")
                : t("garageEmptyFiltered")}
            </EmptyCopy>
            {pool.length > 0 ? (
              <EmptyAction
                onPress={() => {
                  setSpecialty(null);
                  setFilters({});
                  setSearch("");
                }}
              >
                <EmptyActionLabel>{t("garageEmptyReset")}</EmptyActionLabel>
              </EmptyAction>
            ) : null}
          </EmptyWrap>
        ) : null}

        <SafetyNote>
          <Ionicons name="shield-outline" size={15} color="#8a6415" />
          <SafetyText>{t("garageSafetyNote")}</SafetyText>
        </SafetyNote>

        {/* Without this the screen is a directory with no door. A garage
            owner had no way in from here, and — unlike restaurants, which
            is a category you pick — a garage is placed by what it writes.
            Someone who posts "Réparation toutes marques" names no trade,
            so they are not listed and have no way to find out why. The copy
            says what to write, which is the part they cannot guess.

            Goes to Post-a-Listing rather than the ad flow: the ad flow
            sells a promo banner, and an owner tapping this wants to be
            listed, not to buy an advert. Nested twice because the Sell tab
            opens the dashboard — naming the inner screen is what carries
            the category through to the form. */}
        <OwnerHeading>{t("garageOwnerTitle")}</OwnerHeading>
        <OwnerCard onPress={startPosting}>
          <OwnerIcon>
            <Ionicons name="build" size={21} color={GOLD} />
          </OwnerIcon>
          <OwnerBody>
            <OwnerCardTitle>{t("garageOwnerCardTitle")}</OwnerCardTitle>
            <OwnerCopy>{t("garageOwnerCopy")}</OwnerCopy>
          </OwnerBody>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </OwnerCard>
      </ScrollView>

      <Modal
        visible={Boolean(symptom)}
        transparent
        animationType="slide"
        onRequestClose={() => setSymptomKey(null)}
      >
        <SheetBackdrop onPress={() => setSymptomKey(null)}>
          <Sheet
            onStartShouldSetResponder={() => true}
            bottomInset={insets.bottom}
          >
            <SheetHandle />
            <SheetTitle>
              {symptom
                ? language === "en"
                  ? symptom.labelEn
                  : symptom.labelFr
                : ""}
            </SheetTitle>
            {/* Said before the list, not after it: these are the common
                causes, not a diagnosis. */}
            <SheetCopy>{t("garageCauseCopy")}</SheetCopy>
            {(symptom?.causes ?? []).map((cause) => (
              <CauseRow
                key={`${cause.specialty}-${cause.labelEn}`}
                onPress={() => {
                  setSymptomKey(null);
                  chooseSpecialty(cause.specialty);
                }}
              >
                <CauseIcon>
                  <Ionicons
                    name={
                      getGarageSpecialty(cause.specialty)?.icon ??
                      "construct-outline"
                    }
                    size={16}
                    color={EMERALD}
                  />
                </CauseIcon>
                <CauseCol>
                  <CauseLabel>
                    {language === "en" ? cause.labelEn : cause.labelFr}
                  </CauseLabel>
                  <CauseTrade>
                    {getGarageSpecialtyLabel(cause.specialty, language)}
                  </CauseTrade>
                </CauseCol>
                <Ionicons
                  name="chevron-forward"
                  size={15}
                  color={colors.textMuted}
                />
              </CauseRow>
            ))}
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={Boolean(contactFor)}
        transparent
        animationType="slide"
        onRequestClose={() => setContactFor(null)}
      >
        <SheetBackdrop onPress={() => setContactFor(null)}>
          <Sheet
            onStartShouldSetResponder={() => true}
            bottomInset={insets.bottom}
          >
            <SheetHandle />
            <SheetTitle>{t("garageContactSheetTitle")}</SheetTitle>
            {contactFor?.phone ? (
              <ContactRow
                onPress={() => {
                  call(contactFor.phone);
                  setContactFor(null);
                }}
              >
                <ContactIcon>
                  <Ionicons name="call-outline" size={17} color={EMERALD} />
                </ContactIcon>
                <ContactCol>
                  <ContactValue>{contactFor.phone}</ContactValue>
                  <ContactHint>{t("garageContactCall")}</ContactHint>
                </ContactCol>
              </ContactRow>
            ) : null}
            {contactFor?.whatsapp ? (
              <ContactRow
                onPress={() => {
                  openWhatsapp(contactFor.whatsapp);
                  setContactFor(null);
                }}
              >
                <ContactIcon>
                  <Ionicons name="logo-whatsapp" size={17} color={EMERALD} />
                </ContactIcon>
                <ContactCol>
                  <ContactValue>WhatsApp</ContactValue>
                  <ContactHint>{t("garageContactWhatsapp")}</ContactHint>
                </ContactCol>
              </ContactRow>
            ) : null}
            <SheetWarn>
              <Ionicons name="alert-circle-outline" size={14} color="#8a6415" />
              <SheetWarnText>{t("garageContactWarn")}</SheetWarnText>
            </SheetWarn>
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
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 24px;
  line-height: 29px;
  color: #ffffff;
  margin-bottom: 6px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.72);
  max-width: 310px;
`;

// Sits inside the hero rather than below it, so the first thing on the
// screen is a way to say what you are looking for.
const HeroSearch = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
  padding: 0 14px;
  height: 46px;
  border-radius: 16px;
  background-color: rgba(255, 255, 255, 0.13);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.2);
`;

const HeroInput = styled(TextInput)`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 14px;
  color: #ffffff;
  padding: 0px;
`;

const TriagePanel = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.primaryLight};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

const TriageTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const TriageCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const SymptomRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  padding: 12px 14px;
  margin-bottom: 8px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SymptomLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const SosCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(193, 81, 45, 0.25);
  margin-bottom: ${spacing.lg}px;
  ${shadow.card}
`;

const SosIcon = styled.View`
  width: 46px;
  height: 46px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: rgba(193, 81, 45, 0.09);
`;

const SosCol = styled.View`
  flex: 1;
`;

const SosTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const SosCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 3px;
`;

const TyreLink = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 13px 14px;
  margin-bottom: ${spacing.lg}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.28);
`;

const TyreLinkIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const TyreLinkCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const TyreLinkTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const TyreLinkCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 10px;
`;

const SpecialtyRail = styled.ScrollView`
  margin: 0px -${spacing.md}px ${spacing.lg}px 0px;
`;

const SpecialtyItem = styled(Pressable)`
  width: 68px;
  align-items: center;
  gap: 7px;
`;

const SpecialtyDisc = styled.View`
  width: 54px;
  height: 54px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const SpecialtyLabel = styled.Text`
  font-family: ${(props) =>
    props.active ? fontFamily.bold : fontFamily.medium};
  font-size: 10.5px;
  text-align: center;
  color: ${(props) => (props.active ? EMERALD : props.theme.textMuted)};
`;

const FilterScroll = styled.ScrollView`
  margin: 0px -${spacing.md}px ${spacing.md}px 0px;
`;

const FilterChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 11px 16px;
  border-radius: 14px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const FilterChipLabel = styled.Text`
  font-family: ${(props) =>
    props.active ? fontFamily.bold : fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const SortRow = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  border-radius: 15px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.md}px;
`;

const SortTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 10px 4px;
  border-radius: 12px;
  background-color: ${(props) =>
    props.active ? props.theme.surface : "transparent"};
`;

const SortLabel = styled.Text`
  font-family: ${(props) =>
    props.active ? fontFamily.bold : fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => (props.active ? EMERALD : props.theme.textMuted)};
`;

const CountRow = styled.View`
  margin-bottom: ${spacing.sm}px;
`;

const CountText = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const CountHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 4px;
`;

// Rows are spaced by the card's own gap rather than each row carrying a
// bottom margin. A margin belongs to the row above it, so a card whose
// provider published no hours, no quartier and no trades still paid for
// three gaps that separated nothing — the card ended in dead space. With a
// gap, a row that does not render contributes nothing at all, and every
// card is exactly as tall as it has content.
const GarageCard = styled(Pressable)`
  gap: 12px;
  padding: ${spacing.md}px;
  border-radius: 24px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
  ${shadow.card}
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
`;

const Monogram = styled.View`
  width: 46px;
  height: 46px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PhotoWrap = styled.View`
  width: 46px;
  height: 46px;
  border-radius: 15px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  padding: 3px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const Photo = styled(Image)`
  width: 100%;
  height: 100%;
`;

const MonogramText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${EMERALD};
`;

const CardTopCol = styled.View`
  flex: 1;
`;

const GarageName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  line-height: 20px;
  color: ${(props) => props.theme.text};
`;

const MetaLine = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
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

const RatingCount = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const NoRating = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const RateBadge = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
  background-color: ${(props) => props.theme.surfaceAlt};
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
`;

const VerifiedBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const VerifiedLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${EMERALD};
`;

const StatusRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
`;

const OpenWrap = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const OpenDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => (props.open ? EMERALD : props.theme.textMuted)};
`;

const OpenLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  color: ${(props) => (props.open ? EMERALD : props.theme.textMuted)};
`;

const PlaceWrap = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 1;
`;

const PlaceLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
`;

const PillRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 7px;
`;

const SpecPill = styled.View`
  padding: 6px 11px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const SpecPillLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11px;
  color: ${(props) => props.theme.text};
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: 8px;
`;

// Muted rather than hidden when there is no number: the card still says how
// to reach them (open the listing), and a button that quietly vanishes on
// some cards and not others is harder to read than one that is plainly off.
const CallButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  border-radius: 15px;
  background-color: ${(props) => (props.muted ? props.theme.textMuted : EMERALD)};
  opacity: ${(props) => (props.muted ? 0.45 : 1)};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

const GhostButton = styled(Pressable)`
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: 15px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) =>
    props.muted ? props.theme.border : "rgba(11, 110, 79, 0.28)"};
  opacity: ${(props) => (props.muted ? 0.45 : 1)};
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.muted ? props.theme.textMuted : EMERALD)};
`;

const EmptyWrap = styled.View`
  align-items: center;
  padding: 30px 22px 26px;
  border-radius: 26px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const EmptyIcon = styled.View`
  width: 60px;
  height: 60px;
  border-radius: 22px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
  margin-bottom: ${spacing.md}px;
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
  margin-bottom: 8px;
  text-align: center;
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 19px;
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  max-width: 264px;
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

const SafetyNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
  margin-top: ${spacing.lg}px;
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;

const SampleNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.primaryLight};
  margin-bottom: ${spacing.md}px;
`;

const SampleNoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
`;

// Deliberately not the emerald of the verified badge it replaces: an
// example must not borrow the colour the app uses for "we checked this".
const SampleBadge = styled.View`
  padding: 5px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SampleBadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
`;

const OwnerHeading = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin: ${spacing.lg}px 0px 10px;
`;

// Dashed rather than solid: this is an invitation to add something, not a
// record of something that exists — the same distinction the restaurants
// owner card draws.
const OwnerCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-style: dashed;
  border-color: rgba(11, 110, 79, 0.35);
`;

const OwnerIcon = styled.View`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: rgba(217, 164, 65, 0.16);
`;

const OwnerBody = styled.View`
  flex: 1;
`;

const OwnerCardTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const OwnerCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 3px;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: ${(props) => props.theme.scrim};
`;

const Sheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  padding: 10px ${spacing.md}px ${(props) => props.bottomInset + spacing.lg}px;
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
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const SheetCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const CauseRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  padding: 11px 13px;
  margin-bottom: 8px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const CauseIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const CauseCol = styled.View`
  flex: 1;
`;

const CauseLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const CauseTrade = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const ContactRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  padding: 13px 14px;
  margin-bottom: 10px;
  border-radius: ${radius.lg}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const ContactIcon = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const ContactCol = styled.View`
  flex: 1;
`;

const ContactValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const ContactHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const SheetWarn = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 13px 14px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
`;

const SheetWarnText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;
