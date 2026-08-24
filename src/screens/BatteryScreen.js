import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Modal, Pressable } from "react-native";
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
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useBatteryOffers } from "../hooks/useBatteryOffers";
import { useBatteryProviders } from "../hooks/useBatteryProviders";
import { useBatteryProfile } from "../hooks/useBatteryProfile";
import { buildLinkUrl } from "../data/restaurantLinks";
import { queryMatches } from "../utils/search";
import { brandLogo, isWideLogo } from "../data/vehicleBrandLogos";
import {
  batteryCategories,
  batteryServices,
  batteryVehicleMakes,
  batteryVehicleModels,
  batteryVehicleSpecsFor,
  BATTERY_SUSPECT_YEARS,
  formatBatterySpec,
  getBatteryFittingLabel,
  getBatteryServiceLabel,
  getBatteryTechLabel,
  getBatteryTerminalLabel,
  getBatteryWarrantyLabel,
  tradeInLabel,
} from "../data/batteries";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const TERRACOTTA = "#C1512D";

// One icon per declared service, so a tile is recognisable before it is
// read — the labels are the longest thing on the screen.
const SERVICE_ICONS = {
  test: "speedometer-outline",
  boost: "flash-outline",
  install: "construct-outline",
  recycle: "refresh-outline",
  charge: "battery-charging-outline",
  mobile: "navigate-outline",
};

// The marques most cars here wear, in front of the alphabet — the same
// ordering the tyre picker uses, for the same reason.
const COMMON_MAKES = [
  "Toyota",
  "Peugeot",
  "Hyundai",
  "Kia",
  "Nissan",
  "Honda",
  "Mercedes",
  "Renault",
  "Ford",
  "Suzuki",
];

export function BatteryScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [category, setCategory] = useState("car");
  const [capacityFilter, setCapacityFilter] = useState(null);
  const [service, setService] = useState(null);
  const [testOpen, setTestOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleMake, setVehicleMake] = useState(null);
  const [vehicleModel, setVehicleModel] = useState(null);
  const [vehicleSpec, setVehicleSpec] = useState(null);
  const [vehicleQuery, setVehicleQuery] = useState("");

  const offers = useBatteryOffers(coords);
  const providers = useBatteryProviders(coords);
  const { profile, rememberVehicle, rememberTest } = useBatteryProfile();

  const ratings = useSellerRatings(
    useMemo(() => providers.map((item) => item.sellerId), [providers]),
  );

  const title = (item) => (language === "en" ? item.titleEn : item.titleFr);

  // Cheapest first. A listing with no price goes last, where an unknown
  // belongs — it is not free.
  const matchingOffers = useMemo(
    () =>
      offers
        .filter((offer) => (offer.batteryCategory ?? "car") === category)
        .filter(
          (offer) =>
            !capacityFilter || Number(offer.batteryAh) === capacityFilter,
        )
        .sort((a, b) => {
          const priceA = a.price > 0 ? a.price : null;
          const priceB = b.price > 0 ? b.price : null;
          if (priceA == null && priceB == null) return 0;
          if (priceA == null) return 1;
          if (priceB == null) return -1;
          return priceA - priceB;
        }),
    [offers, category, capacityFilter],
  );

  // Open first, then nearest — a shut counter cannot test a battery this
  // afternoon. "Not declared" sits between open and closed, because unknown
  // is not the same as shut.
  const matchingProviders = useMemo(() => {
    const rank = (item) => {
      if (item.openNow === true) return 0;
      if (item.openNow == null) return 1;
      return 2;
    };
    return providers
      .filter(
        (provider) => !service || provider.batteryServices.includes(service),
      )
      .sort((a, b) => {
        const byOpen = rank(a) - rank(b);
        if (byOpen !== 0) return byOpen;
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
  }, [providers, service]);

  const mobileProviders = useMemo(
    () => providers.filter((provider) => provider.mobile),
    [providers],
  );

  // The capacities somebody could actually be shown right now, rather than a
  // fixed list of "common" sizes that may lead to another empty screen.
  const availableCapacities = useMemo(() => {
    const counts = new Map();
    offers
      .filter((offer) => (offer.batteryCategory ?? "car") === category)
      .forEach((offer) => {
        const ah = Number(offer.batteryAh);
        counts.set(ah, (counts.get(ah) ?? 0) + 1);
      });
    return [...counts.keys()].sort((a, b) => a - b);
  }, [offers, category]);

  // A saved vehicle earns its keep on the NEXT visit: the list opens on the
  // capacity that fits it. Once only, and into an untouched filter — never
  // over a choice the reader has just made — and the pill above the list
  // says what is being filtered and clears in one tap.
  const hasVehicle = Boolean(profile?.make && profile?.model);

  const appliedSavedSpec = useRef(false);
  useEffect(() => {
    if (appliedSavedSpec.current) return;
    if (!profile?.spec?.ah) return;
    appliedSavedSpec.current = true;
    setCapacityFilter((prev) => prev ?? profile.spec.ah);
  }, [profile?.spec?.ah]);

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  // The message a buyer would otherwise recite down the phone to every shop
  // in turn, while the app is already holding it.
  //
  // Composed from fragments rather than picked from a handful of finished
  // sentences, so that only what is actually known gets said: no saved
  // vehicle means no vehicle line, never a blank for the seller to puzzle
  // over. It prefills WhatsApp's compose box and stops there — nothing is
  // sent on anyone's behalf, and the buyer can rewrite every word of it.
  const quoteMessage = (offer) => {
    // The vehicle's own pair when there is one, because the amps belong to
    // that vehicle; a bare filter says nothing about cranking.
    const spec =
      hasVehicle && profile?.spec
        ? formatBatterySpec(profile.spec.ah, profile.spec.a, language)
        : capacityFilter
          ? `${capacityFilter} Ah`
          : null;

    return [
      t("batteryQuoteOpen"),
      // An offer states its own capacity, so repeating it back is noise —
      // which listing it is about is the useful part instead.
      offer ? t("batteryQuoteAbout", { title: title(offer) }) : null,
      hasVehicle
        ? t("batteryQuoteVehicle", {
            vehicle: `${profile.make} ${profile.model}`,
          })
        : null,
      !offer && spec ? t("batteryQuoteNeed", { spec }) : null,
      t("batteryQuoteAsk"),
    ]
      .filter(Boolean)
      .join(" ");
  };

  const openWhatsapp = (value, offer) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const text = encodeURIComponent(quoteMessage(offer ?? null));
    Linking.openURL(`${url}${url.includes("?") ? "&" : "?"}text=${text}`).catch(
      () => {},
    );
  };

  const openDirections = (item) => {
    const query = encodeURIComponent(
      [title(item), item.place, item.city].filter(Boolean).join(" "),
    );
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${query}`,
    ).catch(() => {});
  };

  // A flat battery is a roadside problem, so it hands over to Dépannage with
  // the problem already chosen rather than asking again.
  const goToBreakdown = () =>
    navigation.navigate("Breakdown", { problem: "battery" });

  const vehicleSpecOptions = batteryVehicleSpecsFor(vehicleMake, vehicleModel);

  const applyVehicleSpec = () => {
    if (!vehicleSpec) return;
    rememberVehicle(vehicleMake, vehicleModel, vehicleSpec);
    setCategory("car");
    setCapacityFilter(vehicleSpec.ah);
    setVehicleOpen(false);
    setVehicleQuery("");
  };

  const makeList = useMemo(() => {
    const all = batteryVehicleMakes();
    if (vehicleQuery.trim()) {
      return {
        common: [],
        rest: all.filter((make) => queryMatches(vehicleQuery, make)),
      };
    }
    const common = COMMON_MAKES.filter((make) => all.includes(make));
    return { common, rest: all.filter((make) => !common.includes(make)) };
  }, [vehicleQuery]);

  const modelList = useMemo(() => {
    if (!vehicleMake) return [];
    const all = batteryVehicleModels(vehicleMake);
    if (!vehicleQuery.trim()) return all;
    return all.filter((model) => queryMatches(vehicleQuery, model));
  }, [vehicleMake, vehicleQuery]);

  // "Testée il y a 3 mois" — the only status the app can honestly show,
  // because it is the one the owner typed. Everything else about a battery's
  // health needs a meter on the terminals.
  const testedLabel = useMemo(() => {
    if (!profile?.testedAt) return null;
    const days = Math.floor((Date.now() - profile.testedAt) / 86400000);
    if (days < 1) return t("batteryTestedToday");
    if (days < 31) return t("batteryTestedDays", { count: days });
    const months = Math.max(1, Math.round(days / 30));
    return t("batteryTestedMonths", { count: months });
  }, [profile?.testedAt, t]);

  const openPostForm = () =>
    navigation.navigate("MainTabs", {
      screen: "Sell",
      params: {
        screen: "CreateListing",
        params: { categoryKey: "vehicles", trade: "battery" },
      },
    });

  const { remember } = useAccountGateIntent(user, openPostForm);

  const startPosting = () => {
    if (!user) {
      remember();
      openAccountGate(navigation);
      return;
    }
    openPostForm();
  };

  const renderMakeChip = (make) => {
    const logo = brandLogo(make);
    return (
      <GridChip
        key={make}
        onPress={() => {
          setVehicleMake(make);
          setVehicleModel(null);
          setVehicleSpec(null);
          setVehicleQuery("");
        }}
      >
        {logo ? (
          <BrandMark
            source={logo}
            resizeMode="contain"
            wide={isWideLogo(make)}
          />
        ) : null}
        <GridChipLabel numberOfLines={1}>{make}</GridChipLabel>
      </GridChip>
    );
  };

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
          <HeroEyebrow>{t("batteryEyebrow")}</HeroEyebrow>
        </HeroTop>

        <HeroRow>
          <HeroCol>
            <HeroTitle>{t("batteryTitle")}</HeroTitle>
            <HeroCopy>{t("batteryIntro")}</HeroCopy>
          </HeroCol>

          {/* Drawn rather than photographed: we have no battery artwork, and
              a stock photo of somebody else's product on a marketplace hero
              is a small lie. The cell, its terminals and its charge bars are
              built from views, so it is ours and it scales cleanly. */}
          <BatteryArt>
            <BatteryTerminalRow>
              <BatteryTerminal />
              <BatteryTerminal small />
            </BatteryTerminalRow>
            <BatteryBody>
              <BatteryCell filled />
              <BatteryCell filled />
              <BatteryCell />
              <BatteryBolt>
                <Ionicons name="flash" size={18} color="#07362A" />
              </BatteryBolt>
            </BatteryBody>
          </BatteryArt>
        </HeroRow>

        {/* The one honest status line: what the owner told us, and when. */}
        {/* Pressable, because the line it shows when nothing is saved is
            otherwise a dead end: it names an absence and offers no way to
            fix it. Tapping opens the same finder as the card below. */}
        {/* Two different things wear two different skins. Empty, this is a
            prompt and belongs to the banner, so it stays a tint of it.
            Filled, it is the reader's own vehicle, and it takes the gold
            accent to separate it from both the gradient and the white
            button below. */}
        <StatusCard saved={hasVehicle} onPress={() => setVehicleOpen(true)}>
          <StatusIcon saved={hasVehicle}>
            <Ionicons
              name={hasVehicle ? "car-sport" : "battery-half-outline"}
              size={20}
              color={hasVehicle ? "#07362A" : "#ffffff"}
            />
          </StatusIcon>
          <StatusCol>
            <StatusVehicle saved={hasVehicle} numberOfLines={1}>
              {hasVehicle
                ? `${profile.make} ${profile.model}`
                : t("batteryNoVehicle")}
            </StatusVehicle>
            <StatusMeta saved={hasVehicle} numberOfLines={2}>
              {profile?.spec
                ? `${formatBatterySpec(profile.spec.ah, profile.spec.a, language)} · ${testedLabel ?? t("batteryNeverTested")}`
                : t("batterySaveHint")}
            </StatusMeta>
          </StatusCol>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={
              hasVehicle ? "rgba(217,164,65,0.75)" : "rgba(255,255,255,0.55)"
            }
          />
        </StatusCard>

        <TestButton onPress={() => setTestOpen(true)}>
          <Ionicons name="flash-outline" size={16} color={EMERALD} />
          <TestButtonLabel>{t("batteryTestButton")}</TestButtonLabel>
        </TestButton>
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Urgent first. Somebody whose car will not start is not browsing. */}
        <SectionLabel>{t("batteryUrgentLabel")}</SectionLabel>
        <UrgentCard onPress={goToBreakdown}>
          <UrgentIcon>
            <Ionicons name="warning-outline" size={20} color={TERRACOTTA} />
          </UrgentIcon>
          <UrgentCol>
            <UrgentTitle>{t("batteryUrgentFlatTitle")}</UrgentTitle>
            <UrgentCopy>{t("batteryUrgentFlatCopy")}</UrgentCopy>
          </UrgentCol>
          <Ionicons name="chevron-forward" size={18} color={TERRACOTTA} />
        </UrgentCard>

        <UrgentCard onPress={goToBreakdown}>
          <UrgentIcon>
            <Ionicons name="flash-outline" size={20} color={TERRACOTTA} />
          </UrgentIcon>
          <UrgentCol>
            <UrgentTitle>{t("batteryUrgentBoostTitle")}</UrgentTitle>
            <UrgentCopy>
              {t("batteryUrgentBoostCopy", {
                count: mobileProviders.length,
              })}
            </UrgentCopy>
          </UrgentCol>
          <Ionicons name="chevron-forward" size={18} color={TERRACOTTA} />
        </UrgentCard>

        {/* Finding the right one. Sits above the list because a capacity is
            what makes the list mean anything. */}
        <FinderCard onPress={() => setVehicleOpen(true)}>
          <FinderIcon>
            <Ionicons name="car-outline" size={20} color={EMERALD} />
          </FinderIcon>
          <FinderCol>
            <FinderTitle>{t("batteryFinderTitle")}</FinderTitle>
            <FinderCopy>{t("batteryFinderCopy")}</FinderCopy>
          </FinderCol>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FinderCard>

        <SectionLabel>{t("batteryOffersLabel")}</SectionLabel>
        <Segment>
          {batteryCategories.map((option) => {
            const active = category === option.key;
            return (
              <SegmentTab
                key={option.key}
                active={active}
                onPress={() => {
                  setCategory(option.key);
                  setCapacityFilter(null);
                }}
              >
                <SegmentLabel active={active} numberOfLines={1}>
                  {language === "en" ? option.labelEn : option.labelFr}
                </SegmentLabel>
              </SegmentTab>
            );
          })}
        </Segment>

        {capacityFilter ? (
          <FilterPill onPress={() => setCapacityFilter(null)}>
            <FilterPillLabel>{capacityFilter} Ah</FilterPillLabel>
            <Ionicons name="close" size={13} color={EMERALD} />
          </FilterPill>
        ) : availableCapacities.length > 1 ? (
          <ChipRow horizontal showsHorizontalScrollIndicator={false}>
            {availableCapacities.map((ah) => (
              <Chip key={ah} onPress={() => setCapacityFilter(ah)}>
                <ChipLabel>{ah} Ah</ChipLabel>
              </Chip>
            ))}
          </ChipRow>
        ) : null}

        <CountRow>
          <CountText>
            {capacityFilter
              ? t("batteryCountCapacity", {
                  count: matchingOffers.length,
                  ah: String(capacityFilter),
                })
              : t("batteryCount", { count: matchingOffers.length })}
          </CountText>
          {matchingOffers.length > 1 ? (
            <SortNote>{t("batterySortCheapest")}</SortNote>
          ) : null}
        </CountRow>

        {matchingOffers.map((offer) => {
          const spec = formatBatterySpec(
            offer.batteryAh,
            offer.batteryAmps,
            language,
          );
          const warranty = getBatteryWarrantyLabel(
            offer.batteryWarranty,
            language,
          );
          const fitting = getBatteryFittingLabel(
            offer.batteryFitting,
            language,
          );
          const tech = getBatteryTechLabel(offer.batteryTech, language);
          const terminal = getBatteryTerminalLabel(
            offer.batteryTerminal,
            language,
          );
          const tradeIn = tradeInLabel(offer.batteryTradeIn, language);
          return (
            <Card
              key={offer.id}
              onPress={() =>
                navigation.navigate("ProductDetail", { listing: offer })
              }
            >
              <CardTop>
                <CardTitleCol>
                  <OfferBrand numberOfLines={1}>
                    {offer.batteryBrand || title(offer)}
                  </OfferBrand>
                  <OfferModel numberOfLines={1}>
                    {[offer.batteryModel, tech].filter(Boolean).join(" · ")}
                  </OfferModel>
                </CardTitleCol>
                {offer.price > 0 ? (
                  <PriceValue>
                    {offer.price.toLocaleString("fr-FR")} FCFA
                  </PriceValue>
                ) : null}
              </CardTop>

              <SpecRow>
                <SpecValue>{spec}</SpecValue>
                {warranty ? (
                  <Badge>
                    <BadgeLabel>{warranty}</BadgeLabel>
                  </Badge>
                ) : null}
                {offer.batteryStock ? (
                  <MetaText>
                    {t("batteryStock", { count: offer.batteryStock })}
                  </MetaText>
                ) : null}
              </SpecRow>

              {/* The trade-in is both the cheapest way to buy and the only
                  responsible way to get rid of the old one, so it is stated
                  in money rather than left as a vague "reprise possible". */}
              {tradeIn ? <TradeIn>{tradeIn}</TradeIn> : null}

              {terminal || fitting ? (
                <FittingText>
                  {[terminal, fitting].filter(Boolean).join(" · ")}
                </FittingText>
              ) : null}

              <MetaRow>
                {offer.place ? (
                  <MetaItem>
                    <Ionicons
                      name="location-outline"
                      size={11}
                      color={colors.textMuted}
                    />
                    <MetaText numberOfLines={1}>
                      {offer.distanceKm != null
                        ? `${offer.place} · ${offer.distanceKm.toFixed(1)} km`
                        : offer.place}
                    </MetaText>
                  </MetaItem>
                ) : null}
                {offer.sellerName ? (
                  <MetaText numberOfLines={1}>{offer.sellerName}</MetaText>
                ) : null}
                {offer.sellerVerified ? (
                  <VerifiedBadge>
                    <VerifiedLabel>{t("garageVerified")}</VerifiedLabel>
                  </VerifiedBadge>
                ) : null}
              </MetaRow>

              <ActionRow>
                <CallButton
                  onPress={() => call(offer.phone)}
                  disabled={!offer.phone}
                >
                  <Ionicons name="call" size={15} color="#ffffff" />
                  <CallLabel>{t("garageContactCall")}</CallLabel>
                </CallButton>
                {offer.whatsapp || offer.phone ? (
                  <GhostButton
                    onPress={() =>
                      openWhatsapp(offer.whatsapp || offer.phone, offer)
                    }
                  >
                    <Ionicons name="logo-whatsapp" size={15} color={EMERALD} />
                    <GhostLabel>WhatsApp</GhostLabel>
                  </GhostButton>
                ) : null}
              </ActionRow>
            </Card>
          );
        })}

        {matchingOffers.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>
              {capacityFilter
                ? t("batteryNoneCapacity", { ah: String(capacityFilter) })
                : t("batteryNone")}
            </EmptyTitle>
            <EmptyCopy>{t("batteryNoneHint")}</EmptyCopy>
          </EmptyCard>
        ) : null}

        {/* Where to have it tested or fitted. The hero's own button leads
            here, so this section cannot be optional. */}
        <SectionLabel>{t("batteryProsLabel")}</SectionLabel>
        {/* Two columns rather than a horizontal rail. Six services with
            labels as long as "Démarrage / booster" made a scroller whose
            last two options nobody ever saw, and each chip was too small a
            target for a label that wraps. Filling the row gives every one
            the same weight and puts them all on screen at once. */}
        <ServiceGrid>
          {batteryServices.map((option) => {
            const active = service === option.key;
            return (
              <ServiceTile
                key={option.key}
                active={active}
                onPress={() => setService(active ? null : option.key)}
              >
                <ServiceIcon active={active}>
                  <Ionicons
                    name={SERVICE_ICONS[option.key]}
                    size={17}
                    color={active ? "#ffffff" : EMERALD}
                  />
                </ServiceIcon>
                <ServiceLabel active={active} numberOfLines={2}>
                  {language === "en" ? option.labelEn : option.labelFr}
                </ServiceLabel>
              </ServiceTile>
            );
          })}
        </ServiceGrid>

        <CountRow>
          <CountText>
            {service
              ? t("batteryProCountService", {
                  count: matchingProviders.length,
                  service: getBatteryServiceLabel(service, language),
                })
              : t("batteryProCount", { count: matchingProviders.length })}
          </CountText>
          {matchingProviders.length > 1 ? (
            <SortNote>{t("tyreSortOpenFirst")}</SortNote>
          ) : null}
        </CountRow>

        {matchingProviders.map((shop) => {
          const score = ratings?.[shop.sellerId] ?? null;
          const declared = shop.batteryServices
            .map((key) => getBatteryServiceLabel(key, language))
            .filter(Boolean)
            .join(" · ");
          return (
            <Card
              key={shop.id}
              closed={shop.openNow === false}
              onPress={() =>
                navigation.navigate("ProductDetail", { listing: shop })
              }
            >
              <CardTop>
                <Monogram>
                  <MonogramLabel>
                    {(title(shop) || "?").slice(0, 2).toUpperCase()}
                  </MonogramLabel>
                </Monogram>
                <CardTitleCol>
                  <ShopName numberOfLines={1}>{title(shop)}</ShopName>
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
                    {shop.sellerVerified ? (
                      <VerifiedBadge>
                        <VerifiedLabel>{t("garageVerified")}</VerifiedLabel>
                      </VerifiedBadge>
                    ) : null}
                  </RatingRow>
                </CardTitleCol>
              </CardTop>

              <MetaRow>
                {shop.openNow != null ? (
                  <OpenPill open={shop.openNow}>
                    <OpenDot open={shop.openNow} />
                    <OpenLabel open={shop.openNow}>
                      {!shop.openNow
                        ? t("garageClosed")
                        : shop.closeTime
                          ? t("garageOpenUntil", { time: shop.closeTime })
                          : t("tyreOpenNow")}
                    </OpenLabel>
                  </OpenPill>
                ) : null}
                {shop.place ? (
                  <MetaItem>
                    <Ionicons
                      name="location-outline"
                      size={11}
                      color={colors.textMuted}
                    />
                    <MetaText numberOfLines={1}>
                      {shop.distanceKm != null
                        ? `${shop.place} · ${shop.distanceKm.toFixed(1)} km`
                        : shop.place}
                    </MetaText>
                  </MetaItem>
                ) : null}
                {shop.mobile ? (
                  <MobilePill>
                    <MobileLabel>{t("tyreMobilePill")}</MobileLabel>
                  </MobilePill>
                ) : null}
              </MetaRow>

              {declared ? <FittingText>{declared}</FittingText> : null}

              <ActionRow>
                <CallButton
                  onPress={() => call(shop.phone)}
                  disabled={!shop.phone}
                >
                  <Ionicons name="call" size={15} color="#ffffff" />
                  <CallLabel>{t("garageContactCall")}</CallLabel>
                </CallButton>
                {shop.whatsapp || shop.phone ? (
                  <GhostButton
                    onPress={() => openWhatsapp(shop.whatsapp || shop.phone)}
                  >
                    <Ionicons name="logo-whatsapp" size={15} color={EMERALD} />
                    <GhostLabel>WhatsApp</GhostLabel>
                  </GhostButton>
                ) : null}
                <IconButton onPress={() => openDirections(shop)}>
                  <Ionicons
                    name="navigate-outline"
                    size={16}
                    color={colors.textMuted}
                  />
                </IconButton>
              </ActionRow>
            </Card>
          );
        })}

        {matchingProviders.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>{t("batteryNoPros")}</EmptyTitle>
            <EmptyCopy>{t("batteryNoProsHint")}</EmptyCopy>
          </EmptyCard>
        ) : null}

        <SafetyNote>
          <Ionicons name="alert-circle-outline" size={16} color="#8a6415" />
          <SafetyText>{t("batteryRecycleSafety")}</SafetyText>
        </SafetyNote>

        <OwnerCard onPress={startPosting}>
          <OwnerIcon>
            <Ionicons
              name="battery-charging-outline"
              size={20}
              color={EMERALD}
            />
          </OwnerIcon>
          <OwnerCol>
            <OwnerCardTitle>{t("batteryOwnerTitle")}</OwnerCardTitle>
            <OwnerCopy>{t("batteryOwnerCopy")}</OwnerCopy>
          </OwnerCol>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </OwnerCard>
      </Scroll>

      {/* What a test is, and what the warning signs are. The last row is the
          only "status" the app can keep: the owner tells it they had one
          done, and it dates that claim. */}
      <Modal
        visible={testOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTestOpen(false)}
      >
        <Backdrop onPress={() => setTestOpen(false)}>
          <Pressable onPress={() => {}}>
            <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
              <SheetHandle />
              <SheetTitle>{t("batteryTestSheetTitle")}</SheetTitle>
              <HelpRow>
                <Ionicons name="time-outline" size={16} color={EMERALD} />
                <HelpText>{t("batteryTestWhat")}</HelpText>
              </HelpRow>
              <HelpRow>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={EMERALD}
                />
                <HelpText>
                  {t("batteryTestSigns", {
                    years: String(BATTERY_SUSPECT_YEARS),
                  })}
                </HelpText>
              </HelpRow>
              <HelpRow>
                <Ionicons name="location-outline" size={16} color={EMERALD} />
                <HelpText>{t("batteryTestWhere")}</HelpText>
              </HelpRow>

              <ApplyButton
                onPress={() => {
                  setTestOpen(false);
                  setService("test");
                }}
              >
                <ApplyLabel>{t("batteryTestSeePros")}</ApplyLabel>
              </ApplyButton>
              <SecondaryButton
                onPress={() => {
                  rememberTest();
                  setTestOpen(false);
                }}
              >
                <SecondaryLabel>{t("batteryTestDone")}</SecondaryLabel>
              </SecondaryButton>
              <SheetNote>{t("batteryTestDoneNote")}</SheetNote>
            </Sheet>
          </Pressable>
        </Backdrop>
      </Modal>

      <Modal
        visible={vehicleOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVehicleOpen(false)}
      >
        <Backdrop onPress={() => setVehicleOpen(false)}>
          <Pressable onPress={() => {}}>
            <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
              <SheetHandle />
              <SheetTitle>{t("batteryVehicleSheetTitle")}</SheetTitle>

              <SheetScroll
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* One step at a time, each answered step collapsing to a
                    line — otherwise the confirm button sits below the fold
                    and choosing a capacity looks like it did nothing. */}
                {vehicleMake ? (
                  <StepRow>
                    <StepLabel>{t("tyreVehicleMake")}</StepLabel>
                    <StepValue numberOfLines={1}>{vehicleMake}</StepValue>
                    <StepChange
                      onPress={() => {
                        setVehicleMake(null);
                        setVehicleModel(null);
                        setVehicleSpec(null);
                      }}
                      hitSlop={8}
                    >
                      <StepChangeLabel>
                        {t("tyreVehicleChange")}
                      </StepChangeLabel>
                    </StepChange>
                  </StepRow>
                ) : (
                  <>
                    <SearchRow>
                      <Ionicons
                        name="search"
                        size={16}
                        color={colors.textMuted}
                      />
                      <SearchInput
                        value={vehicleQuery}
                        onChangeText={setVehicleQuery}
                        placeholder={t("tyreVehicleSearchMake")}
                        placeholderTextColor={colors.textMuted}
                        autoCorrect={false}
                        returnKeyType="search"
                      />
                      {vehicleQuery ? (
                        <Pressable
                          onPress={() => setVehicleQuery("")}
                          hitSlop={10}
                        >
                          <Ionicons
                            name="close-circle"
                            size={17}
                            color={colors.textMuted}
                          />
                        </Pressable>
                      ) : null}
                    </SearchRow>

                    {makeList.common.length ? (
                      <>
                        <SheetLabel>{t("tyreVehicleCommon")}</SheetLabel>
                        <WrapGrid>
                          {makeList.common.map((make) => renderMakeChip(make))}
                        </WrapGrid>
                      </>
                    ) : null}
                    {makeList.rest.length ? (
                      <>
                        <SheetLabel>
                          {vehicleQuery.trim()
                            ? t("tyreVehicleMake")
                            : t("tyreVehicleAllMakes")}
                        </SheetLabel>
                        <WrapGrid>
                          {makeList.rest.map((make) => renderMakeChip(make))}
                        </WrapGrid>
                      </>
                    ) : null}
                    {!makeList.common.length && !makeList.rest.length ? (
                      <ResultHint>{t("tyreVehicleNoMatch")}</ResultHint>
                    ) : null}
                  </>
                )}

                {vehicleMake && vehicleModel ? (
                  <StepRow>
                    <StepLabel>{t("tyreVehicleModel")}</StepLabel>
                    <StepValue numberOfLines={1}>{vehicleModel}</StepValue>
                    <StepChange
                      onPress={() => {
                        setVehicleModel(null);
                        setVehicleSpec(null);
                      }}
                      hitSlop={8}
                    >
                      <StepChangeLabel>
                        {t("tyreVehicleChange")}
                      </StepChangeLabel>
                    </StepChange>
                  </StepRow>
                ) : vehicleMake ? (
                  <>
                    <SheetLabel>{t("tyreVehicleModel")}</SheetLabel>
                    <WrapGrid>
                      {modelList.map((model) => (
                        <GridChip
                          key={model}
                          onPress={() => {
                            setVehicleModel(model);
                            setVehicleSpec(null);
                          }}
                        >
                          <GridChipLabel numberOfLines={1}>
                            {model}
                          </GridChipLabel>
                        </GridChip>
                      ))}
                    </WrapGrid>
                    {modelList.length ? null : (
                      <ResultHint>{t("tyreVehicleNoMatch")}</ResultHint>
                    )}
                  </>
                ) : null}

                {vehicleSpecOptions.length ? (
                  <>
                    <SheetLabel>{t("batteryCapacityLabel")}</SheetLabel>
                    <WrapGrid>
                      {vehicleSpecOptions.map((option) => {
                        const active = vehicleSpec?.ah === option.ah;
                        return (
                          <GridChip
                            key={option.ah}
                            active={active}
                            onPress={() => setVehicleSpec(option)}
                          >
                            <GridChipLabel active={active} numberOfLines={1}>
                              {formatBatterySpec(option.ah, option.a, language)}
                            </GridChipLabel>
                          </GridChip>
                        );
                      })}
                    </WrapGrid>
                    <ResultHint>{t("batteryCapacityHint")}</ResultHint>
                    {/* Before the button, not after: this is a shortlist to
                        check against the label on the battery you already
                        have, and a caveat met after acting is not a caveat. */}
                    <CaveatText>{t("batteryCapacityCaveat")}</CaveatText>
                    <ApplyButton
                      onPress={applyVehicleSpec}
                      disabled={!vehicleSpec}
                    >
                      <ApplyLabel>
                        {vehicleSpec
                          ? t("batteryCapacityApply", {
                              ah: String(vehicleSpec.ah),
                            })
                          : t("tyreVehiclePickSize")}
                      </ApplyLabel>
                    </ApplyButton>
                  </>
                ) : null}
              </SheetScroll>
            </Sheet>
          </Pressable>
        </Backdrop>
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

const HeroRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
`;

const HeroCol = styled.View`
  flex: 1;
  min-width: 0px;
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
`;

const BatteryArt = styled.View`
  width: 84px;
  align-items: center;
`;

const BatteryTerminalRow = styled.View`
  flex-direction: row;
  align-items: flex-end;
  gap: 22px;
  margin-bottom: 2px;
`;

const BatteryTerminal = styled.View`
  width: ${(props) => (props.small ? 12 : 16)}px;
  height: ${(props) => (props.small ? 7 : 10)}px;
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  background-color: rgba(255, 255, 255, 0.5);
`;

const BatteryBody = styled.View`
  width: 84px;
  height: 62px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px;
  border-radius: 12px;
  background-color: rgba(255, 255, 255, 0.13);
  border-width: 1.5px;
  border-color: rgba(255, 255, 255, 0.3);
`;

const BatteryCell = styled.View`
  flex: 1;
  height: 100%;
  border-radius: 4px;
  background-color: ${(props) =>
    props.filled ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.14)"};
`;

const BatteryBolt = styled.View`
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 30px;
  height: 30px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: ${GOLD};
`;

const StatusCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
  padding: 13px 14px;
  border-radius: 18px;
  /* Gold, not white: the button underneath is already the white block in
     this banner, and two stacked white blocks read as one control split in
     half. Gold is the app's accent for something that belongs to the
     reader, and it is the only warm note on a green gradient — so the card
     is unmistakable without shouting over the button below it. */
  background-color: ${(props) =>
    props.saved ? "rgba(217, 164, 65, 0.18)" : "rgba(255, 255, 255, 0.12)"};
  border-width: 1px;
  border-color: ${(props) =>
    props.saved ? "rgba(217, 164, 65, 0.55)" : "rgba(255, 255, 255, 0.2)"};
`;

const StatusIcon = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.saved ? GOLD : "rgba(255, 255, 255, 0.14)"};
`;

const StatusCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const StatusVehicle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: #ffffff;
`;

const StatusMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => (props.saved ? "#F0CE8E" : "rgba(255, 255, 255, 0.65)")};
  margin-top: 3px;
`;

const TestButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  margin-top: ${spacing.sm}px;
  border-radius: 16px;
  background-color: #ffffff;
`;

const TestButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
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
`;

const UrgentCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 14px 15px;
  margin-bottom: 10px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: rgba(193, 81, 45, 0.28);
`;

const UrgentIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: rgba(193, 81, 45, 0.09);
`;

const UrgentCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const UrgentTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const UrgentCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const FinderCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 15px 16px;
  margin: ${spacing.sm}px 0px ${spacing.lg}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const FinderIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const FinderCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const FinderTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const FinderCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 3px;
`;

const Segment = styled.View`
  flex-direction: row;
  gap: 3px;
  padding: 4px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.sm}px;
`;

const SegmentTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 9px 4px;
  border-radius: 14px;
  background-color: ${(props) =>
    props.active ? props.theme.surface : "transparent"};
`;

const SegmentLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => (props.active ? props.theme.text : props.theme.textMuted)};
`;

const FilterPill = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: 7px;
  padding: 7px 12px;
  margin-bottom: ${spacing.sm}px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.07);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.2);
`;

const FilterPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${EMERALD};
`;

const ServiceGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const ServiceTile = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 44%;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 10px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const ServiceIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.active ? "rgba(255, 255, 255, 0.18)" : props.theme.primaryLight};
`;

const ServiceLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  line-height: 16px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const ChipRow = styled.ScrollView`
  margin: 0px -${spacing.md}px ${spacing.sm}px 0px;
`;

const Chip = styled(Pressable)`
  margin-right: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  padding: 9px 14px;
  border-radius: ${radius.pill}px;
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
  margin-bottom: ${spacing.sm}px;
`;

const CountText = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
`;

const SortNote = styled.Text`
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
  gap: 10px;
  opacity: ${(props) => (props.closed ? 0.68 : 1)};
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
`;

const CardTitleCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const Monogram = styled.View`
  width: 46px;
  height: 46px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const MonogramLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${EMERALD};
`;

const OfferBrand = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const OfferModel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
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
  margin-top: 5px;
`;

const RatingValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const PriceValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${EMERALD};
`;

const SpecRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
`;

const SpecValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const Badge = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const BadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${EMERALD};
`;

const TradeIn = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${EMERALD};
`;

const FittingText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
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
  flex-shrink: 1;
`;

const VerifiedBadge = styled.View`
  padding: 4px 8px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.1);
`;

const VerifiedLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: ${EMERALD};
`;

const OpenPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.open ? "rgba(11, 110, 79, 0.1)" : props.theme.surfaceAlt};
`;

const OpenDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => (props.open ? EMERALD : "#B0B0B4")};
`;

const OpenLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => (props.open ? EMERALD : props.theme.textMuted)};
`;

const MobilePill = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: rgba(217, 164, 65, 0.14);
`;

const MobileLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: #8a6415;
`;

const ActionRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
`;

const CallButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  border-radius: 15px;
  background-color: ${(props) => (props.disabled ? "#9CA3AF" : EMERALD)};
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
  gap: 6px;
  min-height: 44px;
  border-radius: 15px;
  background-color: rgba(11, 110, 79, 0.07);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.22);
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const IconButton = styled(Pressable)`
  width: 44px;
  height: 44px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.surfaceAlt};
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

const SafetyNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
  margin-top: ${spacing.sm}px;
`;

const SafetyText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
  flex: 1;
`;

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
  margin-top: ${spacing.lg}px;
`;

const OwnerIcon = styled.View`
  width: 42px;
  height: 42px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const OwnerCol = styled.View`
  flex: 1;
  min-width: 0px;
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
  margin-top: 2px;
`;

const Backdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.35);
`;

const Sheet = styled.View`
  padding: 10px ${spacing.md}px ${spacing.md}px;
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  background-color: ${(props) => props.theme.surface};
  max-height: 560px;
`;

const SheetScroll = styled.ScrollView`
  max-height: 430px;
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
  margin-bottom: ${spacing.md}px;
`;

const SheetNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: ${spacing.sm}px;
`;

const SheetLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const SearchRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  height: 46px;
  padding: 0px 14px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SearchInput = styled.TextInput`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  padding: 0px;
`;

const WrapGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const GridChip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 28%;
  min-height: 46px;
  gap: 5px;
  padding: 9px 12px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const BrandMark = styled.Image`
  width: ${(props) => (props.wide ? 46 : 20)}px;
  height: ${(props) => (props.wide ? 13 : 20)}px;
`;

const GridChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  text-align: center;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const StepRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 12px 14px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const StepLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const StepValue = styled.Text`
  flex: 1;
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const StepChange = styled(Pressable)`
  min-height: 32px;
  justify-content: center;
`;

const StepChangeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${EMERALD};
`;

const HelpRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
`;

const HelpText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.text};
`;

const ResultHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const CaveatText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 16px;
  color: #8a6415;
  margin-top: 12px;
`;

const ApplyButton = styled(Pressable)`
  align-items: center;
  justify-content: center;
  min-height: 48px;
  margin-top: 14px;
  border-radius: 18px;
  background-color: ${(props) => (props.disabled ? "#C9CBC6" : EMERALD)};
`;

const ApplyLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: #ffffff;
`;

const SecondaryButton = styled(Pressable)`
  align-items: center;
  justify-content: center;
  min-height: 46px;
  margin-top: ${spacing.sm}px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SecondaryLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;
