import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
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
import { useTyreOffers } from "../hooks/useTyreOffers";
import { useTyreProviders } from "../hooks/useTyreProviders";
import { useSavedTyreSize } from "../hooks/useSavedTyreSize";
import { buildLinkUrl } from "../data/restaurantLinks";
import { brandLogo, isWideLogo } from "../data/vehicleBrandLogos";
import { queryMatches } from "../utils/search";
import {
  formatTyreSize,
  getTyreConditionLabel,
  getTyreFittingLabel,
  getTyreServiceLabel,
  getTyreSosNeed,
  stockAgeLabel,
  isValidTyreSize,
  TYRE_AGE_WARN_YEARS,
  tyreConditions,
  tyreModes,
  tyreServices,
  tyreSosNeeds,
  tyreVehicleMakes,
  tyreVehicleModels,
  tyreVehicleSizesFor,
} from "../data/tyres";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const TERRACOTTA = "#C1512D";

const QUANTITIES = [1, 2, 4];

// The marques that fill the roads here, put in front of the alphabet so the
// common answer is the first thing on screen. Not a ranking of anything —
// just the order that saves the most scrolling.
const COMMON_MAKES = [
  "Toyota",
  "Peugeot",
  "Hyundai",
  "Kia",
  "Nissan",
  "Honda",
  "Mercedes",
  "Renault",
  "Volkswagen",
  "Ford",
  "Suzuki",
  "Mitsubishi",
];

export function TyresScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [mode, setMode] = useState("buy");
  const [width, setWidth] = useState("");
  const [ratio, setRatio] = useState("");
  const [diameter, setDiameter] = useState("");
  const [condition, setCondition] = useState(null);
  const [service, setService] = useState(null);
  const [sosNeed, setSosNeed] = useState(null);
  const [quantity, setQuantity] = useState(4);
  const [helpOpen, setHelpOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [vehicleMake, setVehicleMake] = useState(null);
  const [vehicleModel, setVehicleModel] = useState(null);
  const [vehicleSize, setVehicleSize] = useState(null);
  const [vehicleQuery, setVehicleQuery] = useState("");

  // Three boxes that are really one number. Typing 195 and then having to
  // aim at the next box is the kind of friction that makes people give up on
  // a search box, so each box hands over as soon as it is full — and the
  // last one puts the keyboard away, because the results it just produced
  // are behind it.
  const widthRef = useRef(null);
  const ratioRef = useRef(null);
  const diameterRef = useRef(null);

  // Backspace in an empty box goes back to the previous one and takes its
  // last digit with it. Moving the focus alone would look like nothing
  // happened — the reader would have to press twice and guess why — so the
  // press does the visible thing it was aimed at.
  const backspaceTo = (ref, value, setValue) => (event) => {
    if (event.nativeEvent.key !== "Backspace") return;
    if (value.length > 0) return;
    ref.current?.focus();
    setValue((prev) => prev.slice(0, -1));
  };

  const onWidthChange = (value) => {
    const digits = value.replace(/[^0-9]/g, "").slice(0, 3);
    setWidth(digits);
    if (digits.length === 3) ratioRef.current?.focus();
  };

  const onRatioChange = (value) => {
    const digits = value.replace(/[^0-9]/g, "").slice(0, 2);
    setRatio(digits);
    if (digits.length === 2) diameterRef.current?.focus();
  };

  const onDiameterChange = (value) => {
    const digits = value.replace(/[^0-9]/g, "").slice(0, 2);
    setDiameter(digits);
    if (digits.length === 2) Keyboard.dismiss();
  };

  const {
    saved: savedSize,
    loaded: savedLoaded,
    remember: rememberSize,
  } = useSavedTyreSize();

  const offers = useTyreOffers(coords);
  const providers = useTyreProviders(coords);

  // The three numbers only mean something together, so the screen treats
  // them as one value: either there is a size or there is not, and an
  // incomplete or out-of-range entry is called out rather than quietly
  // returning nothing (which is indistinguishable from "no stock").
  const sizeEntered = Boolean(width || ratio || diameter);
  const sizeValid = isValidTyreSize(width, ratio, diameter);
  const size = sizeValid ? formatTyreSize(width, ratio, diameter) : null;

  // Filled in from last time, once, and only into empty boxes — a size the
  // reader is halfway through typing is never overwritten.
  useEffect(() => {
    if (!savedLoaded || !savedSize) return;
    setWidth((prev) => prev || savedSize.split("/")[0]);
    setRatio((prev) => prev || savedSize.split("/")[1].split(" ")[0]);
    setDiameter((prev) => prev || savedSize.split("R")[1]);
  }, [savedLoaded, savedSize]);

  // Kept the moment a complete size exists, so the next visit opens ready.
  useEffect(() => {
    if (size && size !== savedSize) rememberSize(size);
  }, [size, savedSize, rememberSize]);

  const ratings = useSellerRatings(
    useMemo(() => providers.map((item) => item.sellerId), [providers]),
  );

  // Cheapest first, because that is what somebody buying four of the same
  // thing is doing. A listing with no price is not "free" — it goes last,
  // where an unknown belongs.
  const matchingOffers = useMemo(() => {
    if (!size) return [];
    return offers
      .filter((offer) => offer.size === size)
      .filter((offer) => !condition || offer.tyreCondition === condition)
      .sort((a, b) => {
        const priceA = a.price > 0 ? a.price : null;
        const priceB = b.price > 0 ? b.price : null;
        if (priceA == null && priceB == null) return 0;
        if (priceA == null) return 1;
        if (priceB == null) return -1;
        return priceA - priceB;
      });
  }, [offers, size, condition]);

  // Professionals who say they keep this size but have not published a
  // priced listing for it. Worth a call, but shown apart from the offers so
  // "available" is never mistaken for "at this price".
  const stockingProviders = useMemo(() => {
    if (!size) return [];
    return providers.filter((provider) => provider.tyreSizes.includes(size));
  }, [providers, size]);

  // The sizes somebody could actually be shown right now. Offered instead of
  // a fixed list of "popular" sizes: a suggestion that leads to another
  // empty screen is worse than no suggestion.
  const availableSizes = useMemo(() => {
    const counts = new Map();
    offers.forEach((offer) => {
      counts.set(offer.size, (counts.get(offer.size) ?? 0) + 1);
    });
    providers.forEach((provider) => {
      provider.tyreSizes.forEach((declared) => {
        counts.set(declared, (counts.get(declared) ?? 0) + 1);
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value]) => value)
      .filter((value) => value !== size)
      .slice(0, 6);
  }, [offers, providers, size]);

  // Open shops first, then nearest. A closed shop two streets away is no use
  // to somebody who needs a wheel balanced this afternoon; "not declared"
  // sits between open and closed, because unknown is not the same as shut.
  const matchingShops = useMemo(() => {
    const rank = (item) => {
      if (item.openNow === true) return 0;
      if (item.openNow == null) return 1;
      return 2;
    };
    return providers
      .filter((provider) => !service || provider.tyreServices.includes(service))
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

  const title = (item) => (language === "en" ? item.titleEn : item.titleFr);

  // Written once and used by both make groups. The marque's own mark where
  // we have one — the public-domain files the vehicle screens already use.
  // The makes without one show their name alone: a placeholder box would be
  // worse than an honest gap.
  const renderMakeChip = (make) => {
    const logo = brandLogo(make);
    return (
      <GridChip
        key={make}
        onPress={() => {
          setVehicleMake(make);
          setVehicleModel(null);
          setVehicleSize(null);
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

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  // The message a buyer would have to type four times over to compare four
  // sellers. Prefilling it is the whole of "faire jouer la concurrence" that
  // the app can honestly do: it never sends anything on anyone's behalf, and
  // it never claims a request was received.
  const quoteMessage = () =>
    size
      ? t("tyreQuoteMessage", { quantity: String(quantity), size })
      : t("tyreQuoteMessageNoSize");

  const openWhatsapp = (value, withQuote) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const full = withQuote
      ? `${url}${url.includes("?") ? "&" : "?"}text=${encodeURIComponent(quoteMessage())}`
      : url;
    Linking.openURL(full).catch(() => {});
  };

  const openDirections = (item) => {
    const query = encodeURIComponent(
      [title(item), item.place, item.city].filter(Boolean).join(" "),
    );
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${query}`,
    ).catch(() => {});
  };

  // One place that turns "195/65 R15" into the three boxes, used by the
  // vehicle sheet and by the suggested-size chips alike.
  const applySize = (value) => {
    const [front, rear] = value.split("/");
    setWidth(front);
    setRatio(rear.split(" ")[0]);
    setDiameter(rear.split("R")[1]);
  };

  const applyVehicleSize = () => {
    if (!vehicleSize) return;
    applySize(vehicleSize);
    setVehicleOpen(false);
  };

  // Handing over to Dépannage with the problem already chosen. Somebody at
  // the roadside has answered this question once; asking it again on the
  // next screen is how a flow starts feeling like paperwork.
  const startSos = () => {
    const need = getTyreSosNeed(sosNeed);
    if (!need) return;
    navigation.navigate("Breakdown", { problem: need.breakdownProblem });
  };

  const openPostForm = () =>
    navigation.navigate("MainTabs", {
      screen: "Sell",
      params: {
        screen: "CreateListing",
        params: { categoryKey: "vehicles", trade: "tyres" },
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

  const heroTitle =
    mode === "buy"
      ? t("tyresTitleBuy")
      : mode === "services"
        ? t("tyresTitleServices")
        : t("tyresTitleSos");
  const heroCopy =
    mode === "buy"
      ? t("tyresIntroBuy")
      : mode === "services"
        ? t("tyresIntroServices")
        : t("tyresIntroSos");

  const vehicleSizeOptions = tyreVehicleSizesFor(vehicleMake, vehicleModel);

  // Fifty-five makes is nineteen rows of scrolling before Volvo, and Toyota
  // alone carries thirty-five models. Two ways out, because they suit
  // different people: the marques most cars here actually wear come first so
  // most readers never scroll at all, and a search box for everyone else.
  const vehicleMakeList = useMemo(() => {
    const all = tyreVehicleMakes();
    if (vehicleQuery.trim()) {
      return {
        common: [],
        rest: all.filter((make) => queryMatches(vehicleQuery, make)),
      };
    }
    const common = COMMON_MAKES.filter((make) => all.includes(make));
    return { common, rest: all.filter((make) => !common.includes(make)) };
  }, [vehicleQuery]);

  const vehicleModelList = useMemo(() => {
    if (!vehicleMake) return [];
    const all = tyreVehicleModels(vehicleMake);
    if (!vehicleQuery.trim()) return all;
    return all.filter((model) => queryMatches(vehicleQuery, model));
  }, [vehicleMake, vehicleQuery]);

  return (
    // The size boxes sit in the hero, so the keyboard never covers what is
    // being typed — it covers the answer. Lifting the page keeps the count
    // row and the first offer visible while the number is still being
    // entered, which is when someone checks they typed it right.
    <Flex behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
            <HeroEyebrow>{t("tyresEyebrow")}</HeroEyebrow>
          </HeroTop>
          <HeroTitle>{heroTitle}</HeroTitle>
          <HeroCopy>{heroCopy}</HeroCopy>

          {/* The size box lives in the hero only while buying: in the other two
            modes it would be the largest thing on screen and answer neither
            question. */}
          {mode === "buy" ? (
            <>
              <SizeCard>
                <SizeInput
                  ref={widthRef}
                  value={width}
                  onChangeText={onWidthChange}
                  keyboardType="number-pad"
                  maxLength={3}
                  returnKeyType="next"
                  placeholder="195"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                />
                <SizeSeparator>/</SizeSeparator>
                <SizeInput
                  ref={ratioRef}
                  value={ratio}
                  onChangeText={onRatioChange}
                  onKeyPress={backspaceTo(widthRef, ratio, setWidth)}
                  keyboardType="number-pad"
                  maxLength={2}
                  returnKeyType="next"
                  placeholder="65"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                />
                <SizeSeparator>R</SizeSeparator>
                <SizeInput
                  ref={diameterRef}
                  value={diameter}
                  onChangeText={onDiameterChange}
                  onKeyPress={backspaceTo(ratioRef, diameter, setRatio)}
                  keyboardType="number-pad"
                  maxLength={2}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  placeholder="15"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                />
              </SizeCard>
              <HelpLink onPress={() => setHelpOpen(true)} hitSlop={8}>
                <Ionicons
                  name="help-circle-outline"
                  size={14}
                  color="#8FD9BE"
                />
                <HelpLinkLabel>{t("tyreSizeHelpLink")}</HelpLinkLabel>
              </HelpLink>
            </>
          ) : null}
        </Hero>

        <Scroll
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: insets.bottom + spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <ModeRow>
            {tyreModes.map((option) => {
              const active = mode === option.key;
              return (
                <ModeTab
                  key={option.key}
                  active={active}
                  onPress={() => setMode(option.key)}
                >
                  <ModeLabel active={active}>
                    {language === "en" ? option.labelEn : option.labelFr}
                  </ModeLabel>
                  <ModeHint active={active} numberOfLines={1}>
                    {language === "en" ? option.hintEn : option.hintFr}
                  </ModeHint>
                </ModeTab>
              );
            })}
          </ModeRow>

          {mode === "buy" ? (
            <>
              <VehicleLink onPress={() => setVehicleOpen(true)}>
                <Ionicons name="car-outline" size={16} color={EMERALD} />
                <VehicleLinkLabel>{t("tyreVehicleLink")}</VehicleLinkLabel>
              </VehicleLink>

              <Segment>
                <SegmentTab
                  active={condition === null}
                  onPress={() => setCondition(null)}
                >
                  <SegmentLabel active={condition === null}>
                    {t("tyreConditionAll")}
                  </SegmentLabel>
                </SegmentTab>
                {tyreConditions.map((option) => (
                  <SegmentTab
                    key={option.key}
                    active={condition === option.key}
                    onPress={() => setCondition(option.key)}
                  >
                    <SegmentLabel active={condition === option.key}>
                      {language === "en" ? option.labelEn : option.labelFr}
                    </SegmentLabel>
                  </SegmentTab>
                ))}
              </Segment>

              {/* Nothing below can be true without a size, so the screen says
                what it needs instead of showing an empty list that looks
                like an empty market. */}
              {!sizeValid ? (
                <PromptCard>
                  <PromptTitle>
                    {sizeEntered ? t("tyreSizeInvalid") : t("tyreNeedSize")}
                  </PromptTitle>
                  <PromptCopy>
                    {sizeEntered
                      ? t("tyreSizeInvalidHint")
                      : t("tyreNeedSizeHint")}
                  </PromptCopy>
                  {availableSizes.length ? (
                    <>
                      <PromptLabel>{t("tyreSizesAround")}</PromptLabel>
                      <SizeChipRow>
                        {availableSizes.map((value) => (
                          <SizeChip
                            key={value}
                            onPress={() => applySize(value)}
                          >
                            <SizeChipLabel>{value}</SizeChipLabel>
                          </SizeChip>
                        ))}
                      </SizeChipRow>
                    </>
                  ) : null}
                </PromptCard>
              ) : (
                <>
                  <CountRow>
                    <CountText>
                      {t("tyreOfferCount", {
                        count: matchingOffers.length,
                        size,
                      })}
                    </CountText>
                    {matchingOffers.length > 1 ? (
                      <SortNote>{t("tyreSortCheapest")}</SortNote>
                    ) : null}
                  </CountRow>

                  {matchingOffers.map((offer) => {
                    const conditionLabel = getTyreConditionLabel(
                      offer.tyreCondition,
                      language,
                    );
                    const fittingLabel = getTyreFittingLabel(
                      offer.tyreFitting,
                      language,
                    );
                    return (
                      <Card
                        key={offer.id}
                        onPress={() =>
                          navigation.navigate("ProductDetail", {
                            listing: offer,
                          })
                        }
                      >
                        <CardTop>
                          <CardTitleCol>
                            <OfferBrand numberOfLines={1}>
                              {offer.tyreBrand || title(offer)}
                            </OfferBrand>
                            <OfferModel numberOfLines={1}>
                              {[offer.tyreModel, offer.size]
                                .filter(Boolean)
                                .join(" · ")}
                            </OfferModel>
                          </CardTitleCol>
                          {offer.price > 0 ? (
                            <PriceCol>
                              <PriceValue>
                                {offer.price.toLocaleString("fr-FR")} FCFA
                              </PriceValue>
                              <PriceUnit>{t("tyrePricePerTyre")}</PriceUnit>
                            </PriceCol>
                          ) : null}
                        </CardTop>

                        <BadgeRow>
                          {conditionLabel ? (
                            <Badge used={offer.tyreCondition === "used"}>
                              <BadgeLabel used={offer.tyreCondition === "used"}>
                                {conditionLabel}
                              </BadgeLabel>
                            </Badge>
                          ) : null}
                          {offer.tyreDotYear &&
                          offer.tyreCondition === "used" ? (
                            <AgeBadge aged={offer.isAged}>
                              <Ionicons
                                name="time-outline"
                                size={11}
                                color={offer.isAged ? "#8a6415" : EMERALD}
                              />
                              <AgeLabel aged={offer.isAged}>
                                {t("tyreDotAge", {
                                  year: String(offer.tyreDotYear),
                                  years: String(offer.ageYears ?? 0),
                                })}
                              </AgeLabel>
                            </AgeBadge>
                          ) : null}
                          {offer.tyreTreadMm ? (
                            <MetaText>
                              {t("tyreTread", {
                                depth: String(offer.tyreTreadMm),
                              })}
                            </MetaText>
                          ) : null}
                          {offer.tyreStock ? (
                            <MetaText>
                              {t("tyreStock", { count: offer.tyreStock })}
                              {stockAgeLabel(offer.createdAt, language)
                                ? ` · ${t("tyreStockAge", {
                                    ago: stockAgeLabel(
                                      offer.createdAt,
                                      language,
                                    ),
                                  })}`
                                : ""}
                            </MetaText>
                          ) : null}
                        </BadgeRow>

                        {fittingLabel ? (
                          <FittingText>{fittingLabel}</FittingText>
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
                            <MetaText numberOfLines={1}>
                              {offer.sellerName}
                            </MetaText>
                          ) : null}
                          {offer.sellerVerified ? (
                            <VerifiedBadge>
                              <VerifiedLabel>
                                {t("garageVerified")}
                              </VerifiedLabel>
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
                                openWhatsapp(
                                  offer.whatsapp || offer.phone,
                                  true,
                                )
                              }
                            >
                              <Ionicons
                                name="logo-whatsapp"
                                size={15}
                                color={EMERALD}
                              />
                              <GhostLabel>WhatsApp</GhostLabel>
                            </GhostButton>
                          ) : null}
                        </ActionRow>

                        {!offer.phone ? (
                          <NoPhoneNote>{t("tyreNoPhone")}</NoPhoneNote>
                        ) : null}
                      </Card>
                    );
                  })}

                  {matchingOffers.length === 0 ? (
                    <EmptyCard>
                      <EmptyTitle>{t("tyreNoOffers", { size })}</EmptyTitle>
                      <EmptyCopy>{t("tyreNoOffersHint")}</EmptyCopy>
                      {availableSizes.length ? (
                        <>
                          <PromptLabel>{t("tyreSizesAround")}</PromptLabel>
                          <SizeChipRow>
                            {availableSizes.map((value) => (
                              <SizeChip
                                key={value}
                                onPress={() => applySize(value)}
                              >
                                <SizeChipLabel>{value}</SizeChipLabel>
                              </SizeChip>
                            ))}
                          </SizeChipRow>
                        </>
                      ) : null}
                    </EmptyCard>
                  ) : null}

                  {stockingProviders.length ? (
                    <>
                      <SectionLabel>{t("tyreAlsoAt")}</SectionLabel>
                      <SectionNote>{t("tyreAlsoAtHint")}</SectionNote>
                      {stockingProviders.map((provider) => (
                        <SlimCard key={provider.id}>
                          <SlimCol>
                            <SlimName numberOfLines={1}>
                              {title(provider)}
                            </SlimName>
                            <MetaText numberOfLines={1}>
                              {[
                                provider.place,
                                provider.distanceKm != null
                                  ? `${provider.distanceKm.toFixed(1)} km`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </MetaText>
                          </SlimCol>
                          <SlimAction
                            onPress={() =>
                              openWhatsapp(
                                provider.whatsapp || provider.phone,
                                true,
                              )
                            }
                          >
                            <Ionicons
                              name="logo-whatsapp"
                              size={16}
                              color={EMERALD}
                            />
                          </SlimAction>
                          <SlimAction onPress={() => call(provider.phone)}>
                            <Ionicons name="call" size={15} color={EMERALD} />
                          </SlimAction>
                        </SlimCard>
                      ))}
                    </>
                  ) : null}

                  {/* Only shown when there is somebody to ask. A "compare
                    prices" card above an empty list is an instruction that
                    cannot be followed. */}
                  {matchingOffers.length + stockingProviders.length > 0 ? (
                    <QuoteCard>
                      <QuoteTitle>{t("tyreQuoteTitle")}</QuoteTitle>
                      <QuoteCopy>{t("tyreQuoteCopy")}</QuoteCopy>
                      <QuantityRow>
                        <QuantityLabel>{t("tyreQuantity")}</QuantityLabel>
                        {QUANTITIES.map((value) => (
                          <QuantityChip
                            key={value}
                            active={quantity === value}
                            onPress={() => setQuantity(value)}
                          >
                            <QuantityChipLabel active={quantity === value}>
                              {value}
                            </QuantityChipLabel>
                          </QuantityChip>
                        ))}
                      </QuantityRow>
                      <QuoteButton onPress={() => setQuoteOpen(true)}>
                        <Ionicons
                          name="paper-plane-outline"
                          size={16}
                          color="#ffffff"
                        />
                        <QuoteButtonLabel>
                          {t("tyreQuoteButton", {
                            quantity: String(quantity),
                            size,
                          })}
                        </QuoteButtonLabel>
                      </QuoteButton>
                    </QuoteCard>
                  ) : null}
                </>
              )}

              <SafetyNote>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color="#8a6415"
                />
                <SafetyText>
                  {t("tyreUsedSafety", { years: String(TYRE_AGE_WARN_YEARS) })}
                </SafetyText>
              </SafetyNote>
            </>
          ) : null}

          {mode === "services" ? (
            <>
              <SectionLabel>{t("tyreServicesLabel")}</SectionLabel>
              <ChipRow horizontal showsHorizontalScrollIndicator={false}>
                {tyreServices.map((option) => {
                  const active = service === option.key;
                  return (
                    <Chip
                      key={option.key}
                      active={active}
                      onPress={() => setService(active ? null : option.key)}
                    >
                      <ChipLabel active={active}>
                        {language === "en" ? option.labelEn : option.labelFr}
                      </ChipLabel>
                    </Chip>
                  );
                })}
              </ChipRow>

              <CountRow>
                <CountText>
                  {service
                    ? t("tyreShopCountService", {
                        count: matchingShops.length,
                        service: getTyreServiceLabel(service, language),
                      })
                    : t("tyreShopCount", { count: matchingShops.length })}
                </CountText>
                {matchingShops.length > 1 ? (
                  <SortNote>{t("tyreSortOpenFirst")}</SortNote>
                ) : null}
              </CountRow>

              {matchingShops.map((shop) => {
                const score = ratings?.[shop.sellerId] ?? null;
                const declared = shop.tyreServices
                  .map((key) => getTyreServiceLabel(key, language))
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
                                {t("garageReviewCount", {
                                  count: score.ratingCount,
                                })}
                              </MetaText>
                            </>
                          ) : (
                            <MetaText>{t("garageNoRating")}</MetaText>
                          )}
                          {shop.sellerVerified ? (
                            <VerifiedBadge>
                              <VerifiedLabel>
                                {t("garageVerified")}
                              </VerifiedLabel>
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
                    {shop.tyreBrands ? (
                      <MetaText numberOfLines={2}>{shop.tyreBrands}</MetaText>
                    ) : null}

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
                          onPress={() =>
                            openWhatsapp(shop.whatsapp || shop.phone, false)
                          }
                        >
                          <Ionicons
                            name="logo-whatsapp"
                            size={15}
                            color={EMERALD}
                          />
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

              {matchingShops.length === 0 ? (
                <EmptyCard>
                  <EmptyTitle>{t("tyreNoShops")}</EmptyTitle>
                  <EmptyCopy>{t("tyreNoShopsHint")}</EmptyCopy>
                </EmptyCard>
              ) : null}
            </>
          ) : null}

          {mode === "sos" ? (
            <>
              <SectionLabel>{t("tyreSosQuestion")}</SectionLabel>
              {tyreSosNeeds.map((option) => {
                const active = sosNeed === option.key;
                return (
                  <NeedRow
                    key={option.key}
                    active={active}
                    onPress={() => setSosNeed(active ? null : option.key)}
                  >
                    <Radio active={active}>
                      {active ? <RadioDot /> : null}
                    </Radio>
                    <NeedCol>
                      <NeedLabel>
                        {language === "en" ? option.labelEn : option.labelFr}
                      </NeedLabel>
                      <NeedHint>
                        {language === "en" ? option.hintEn : option.hintFr}
                      </NeedHint>
                    </NeedCol>
                  </NeedRow>
                );
              })}

              <MobileCount>
                {t("tyreMobileCount", { count: mobileProviders.length })}
              </MobileCount>

              <SosButton onPress={startSos} disabled={!sosNeed}>
                <Ionicons name="navigate" size={17} color="#ffffff" />
                <SosLabel>{t("tyreSosButton")}</SosLabel>
              </SosButton>

              <SafetyNote>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color="#8a6415"
                />
                <SafetyText>{t("tyreFlatSafety")}</SafetyText>
              </SafetyNote>
            </>
          ) : null}

          <OwnerCard onPress={startPosting}>
            <OwnerIcon>
              <Ionicons name="disc-outline" size={20} color={EMERALD} />
            </OwnerIcon>
            <OwnerCol>
              <OwnerCardTitle>{t("tyreOwnerTitle")}</OwnerCardTitle>
              <OwnerCopy>{t("tyreOwnerCopy")}</OwnerCopy>
            </OwnerCol>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </OwnerCard>
        </Scroll>

        {/* Where the numbers are written. The single most common reason
          somebody buys the wrong tyre is reading the wrong three numbers off
          the sidewall. */}
        <Modal
          visible={helpOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setHelpOpen(false)}
        >
          <Backdrop onPress={() => setHelpOpen(false)}>
            <Pressable onPress={() => {}}>
              <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
                <SheetHandle />
                <SheetTitle>{t("tyreHelpTitle")}</SheetTitle>
                <Diagram>
                  <DiagramNumber>195</DiagramNumber>
                  <DiagramSlash>/</DiagramSlash>
                  <DiagramNumber>65</DiagramNumber>
                  <DiagramSlash>R</DiagramSlash>
                  <DiagramNumber>15</DiagramNumber>
                </Diagram>
                <HelpRow>
                  <HelpKey>195</HelpKey>
                  <HelpText>{t("tyreHelpWidth")}</HelpText>
                </HelpRow>
                <HelpRow>
                  <HelpKey>65</HelpKey>
                  <HelpText>{t("tyreHelpRatio")}</HelpText>
                </HelpRow>
                <HelpRow>
                  <HelpKey>R15</HelpKey>
                  <HelpText>{t("tyreHelpDiameter")}</HelpText>
                </HelpRow>
                <HelpRow>
                  <Ionicons
                    name="information-circle-outline"
                    size={15}
                    color={EMERALD}
                  />
                  <HelpText>{t("tyreHelpWhere")}</HelpText>
                </HelpRow>
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
          {/* A Modal sits outside the screen's KeyboardAvoidingView, so the
              sheet needs its own — without it the keyboard covers the very
              grid the search box is filtering. */}
          <SheetKeyboard
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Backdrop onPress={() => setVehicleOpen(false)}>
              <Pressable onPress={() => {}}>
                <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
                  <SheetHandle />
                  <SheetTitle>{t("tyreVehicleSheetTitle")}</SheetTitle>

                  <SheetScroll
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {/* One step at a time. Fourteen makes and eight models
                      shown at once pushed the confirm button below the fold,
                      so picking a size looked like it did nothing — the
                      thing that would have used it was off-screen. An
                      answered step collapses to one line, which both clears
                      the wall of brands and lifts the button into view. */}
                    {vehicleMake ? (
                      <StepRow>
                        <StepLabel>{t("tyreVehicleMake")}</StepLabel>
                        <StepValue numberOfLines={1}>{vehicleMake}</StepValue>
                        <StepChange
                          onPress={() => {
                            setVehicleMake(null);
                            setVehicleModel(null);
                            setVehicleSize(null);
                            setVehicleQuery("");
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
                        {/* Typing here beats scrolling for anyone whose car
                          is not in the common group, and costs nothing to
                          everyone who ignores it. */}
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

                        {vehicleMakeList.common.length ? (
                          <>
                            <SheetLabel>{t("tyreVehicleCommon")}</SheetLabel>
                            <WrapGrid>
                              {vehicleMakeList.common.map((make) =>
                                renderMakeChip(make),
                              )}
                            </WrapGrid>
                          </>
                        ) : null}

                        {vehicleMakeList.rest.length ? (
                          <>
                            <SheetLabel>
                              {vehicleQuery.trim()
                                ? t("tyreVehicleMake")
                                : t("tyreVehicleAllMakes")}
                            </SheetLabel>
                            <WrapGrid>
                              {vehicleMakeList.rest.map((make) =>
                                renderMakeChip(make),
                              )}
                            </WrapGrid>
                          </>
                        ) : null}

                        {!vehicleMakeList.common.length &&
                        !vehicleMakeList.rest.length ? (
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
                            setVehicleSize(null);
                            setVehicleQuery("");
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
                        <SearchRow>
                          <Ionicons
                            name="search"
                            size={16}
                            color={colors.textMuted}
                          />
                          <SearchInput
                            value={vehicleQuery}
                            onChangeText={setVehicleQuery}
                            placeholder={t("tyreVehicleSearchModel")}
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
                        <SheetLabel>{t("tyreVehicleModel")}</SheetLabel>
                        <WrapGrid>
                          {vehicleModelList.map((model) => (
                            <GridChip
                              key={model}
                              onPress={() => {
                                setVehicleModel(model);
                                setVehicleSize(null);
                                setVehicleQuery("");
                              }}
                            >
                              <GridChipLabel numberOfLines={1}>
                                {model}
                              </GridChipLabel>
                            </GridChip>
                          ))}
                        </WrapGrid>
                        {vehicleModelList.length ? null : (
                          <ResultHint>{t("tyreVehicleNoMatch")}</ResultHint>
                        )}
                      </>
                    ) : null}

                    {/* Several sizes, not one. A model built across three
                      generations wore different wheels in each, so handing
                      back a single confident answer would be wrong for most
                      of the cars carrying that badge. The reader picks the
                      one on their own sidewall. */}
                    {vehicleSizeOptions.length ? (
                      <>
                        <SheetLabel>{t("tyreVehicleSizeLabel")}</SheetLabel>
                        <WrapGrid>
                          {vehicleSizeOptions.map((option) => {
                            const active = vehicleSize === option;
                            return (
                              <GridChip
                                key={option}
                                active={active}
                                onPress={() => setVehicleSize(option)}
                              >
                                <GridChipLabel
                                  active={active}
                                  numberOfLines={1}
                                >
                                  {option}
                                </GridChipLabel>
                              </GridChip>
                            );
                          })}
                        </WrapGrid>
                        <ResultHint>{t("tyreVehicleResultHint")}</ResultHint>
                        {/* Said before the button, not after: the whole point
                          is that this is a starting point to check, and a
                          caveat the reader meets only once they have already
                          acted is not a caveat. */}
                        <CaveatText>{t("tyreVehicleCaveat")}</CaveatText>
                        <ApplyButton
                          onPress={applyVehicleSize}
                          disabled={!vehicleSize}
                        >
                          <ApplyLabel>
                            {vehicleSize
                              ? t("tyreVehicleApply", { size: vehicleSize })
                              : t("tyreVehiclePickSize")}
                          </ApplyLabel>
                        </ApplyButton>
                      </>
                    ) : null}
                  </SheetScroll>
                </Sheet>
              </Pressable>
            </Backdrop>
          </SheetKeyboard>
        </Modal>

        {/* Sending the same question to several sellers, one tap each. The app
          never sends on anyone's behalf, so nothing here can claim a request
          was received — the reader can see exactly what went where. */}
        <Modal
          visible={quoteOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setQuoteOpen(false)}
        >
          <Backdrop onPress={() => setQuoteOpen(false)}>
            <Pressable onPress={() => {}}>
              <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
                <SheetHandle />
                <SheetTitle>{t("tyreQuoteSheetTitle")}</SheetTitle>
                <SheetNote>{t("tyreQuoteSheetNote")}</SheetNote>
                <MessagePreview>
                  <MessageText>{quoteMessage()}</MessageText>
                </MessagePreview>
                <QuoteList showsVerticalScrollIndicator={false}>
                  {[...matchingOffers, ...stockingProviders].map((item) => (
                    <QuoteRow key={`quote-${item.id}`}>
                      <QuoteRowCol>
                        <QuoteRowName numberOfLines={1}>
                          {item.tyreBrand || item.sellerName || title(item)}
                        </QuoteRowName>
                        <MetaText numberOfLines={1}>
                          {item.place ?? item.city ?? ""}
                        </MetaText>
                      </QuoteRowCol>
                      {item.whatsapp || item.phone ? (
                        <SlimAction
                          onPress={() =>
                            openWhatsapp(item.whatsapp || item.phone, true)
                          }
                        >
                          <Ionicons
                            name="logo-whatsapp"
                            size={16}
                            color={EMERALD}
                          />
                        </SlimAction>
                      ) : null}
                      {item.phone ? (
                        <SlimAction onPress={() => call(item.phone)}>
                          <Ionicons name="call" size={15} color={EMERALD} />
                        </SlimAction>
                      ) : null}
                    </QuoteRow>
                  ))}
                </QuoteList>
              </Sheet>
            </Pressable>
          </Backdrop>
        </Modal>
      </Container>
    </Flex>
  );
}

const Flex = styled.KeyboardAvoidingView`
  flex: 1;
`;

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

const SizeCard = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
  padding: 12px 14px;
  border-radius: 18px;
  background-color: rgba(255, 255, 255, 0.12);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.2);
`;

const SizeInput = styled(TextInput)`
  width: 62px;
  text-align: center;
  padding: 8px 0px;
  border-radius: 13px;
  background-color: rgba(255, 255, 255, 0.14);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.22);
  font-family: ${fontFamily.bold};
  font-size: 18px;
  color: #ffffff;
`;

const SizeSeparator = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
`;

const HelpLink = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  align-self: center;
  gap: 6px;
  margin-top: 12px;
  min-height: 32px;
`;

const HelpLinkLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: #8fd9be;
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const ModeRow = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.md}px;
`;

const ModeTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 10px 6px 11px;
  border-radius: 16px;
  background-color: ${(props) =>
    props.active ? props.theme.surface : "transparent"};
`;

const ModeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.active ? props.theme.text : props.theme.textMuted)};
`;

const ModeHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10px;
  margin-top: 2px;
  color: ${(props) => (props.active ? EMERALD : props.theme.textMuted)};
`;

const VehicleLink = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.sm}px;
`;

const VehicleLinkLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${EMERALD};
`;

const Segment = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.md}px;
`;

const SegmentTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 9px 6px;
  border-radius: 14px;
  background-color: ${(props) =>
    props.active ? props.theme.surface : "transparent"};
`;

const SegmentLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.active ? props.theme.text : props.theme.textMuted)};
`;

const PromptCard = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.primaryLight};
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.16);
  margin-bottom: ${spacing.md}px;
`;

const PromptTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const PromptCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const PromptLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const SizeChipRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
`;

const SizeChip = styled(Pressable)`
  padding: 8px 13px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SizeChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
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

const PriceCol = styled.View`
  align-items: flex-end;
`;

const PriceValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${EMERALD};
`;

const PriceUnit = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const BadgeRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
`;

const Badge = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.used ? props.theme.surfaceAlt : props.theme.primaryLight};
`;

const BadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${(props) => (props.used ? props.theme.textMuted : EMERALD)};
`;

const AgeBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.aged ? "rgba(217, 164, 65, 0.16)" : "rgba(11, 110, 79, 0.1)"};
`;

const AgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => (props.aged ? "#8a6415" : EMERALD)};
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

const NoPhoneNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 10px;
`;

const SectionNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: -4px;
  margin-bottom: ${spacing.sm}px;
`;

const ChipRow = styled.ScrollView`
  margin: 0px -${spacing.md}px ${spacing.md}px 0px;
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

// Chips that share out the row rather than pack to the left. With 48 makes
// a left-packed cloud ends every row on a ragged gap; growing them to fill
// makes the picker read as a grid and the sheet a good deal shorter.
const SheetKeyboard = styled.KeyboardAvoidingView`
  flex: 1;
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

const SearchInput = styled(TextInput)`
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

const BrandMark = styled(Image)`
  width: ${(props) => (props.wide ? 46 : 20)}px;
  height: ${(props) => (props.wide ? 13 : 20)}px;
`;

const GridChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  text-align: center;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const SlimCard = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 12px ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.sm}px;
`;

const SlimCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const SlimName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const SlimAction = styled(Pressable)`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.08);
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

const QuoteCard = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-top: ${spacing.sm}px;
`;

const QuoteTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-bottom: 4px;
`;

const QuoteCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const QuantityRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const QuantityLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const QuantityChip = styled(Pressable)`
  width: 44px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const QuantityChipLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const QuoteButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  min-height: 48px;
  border-radius: 18px;
  background-color: ${EMERALD};
`;

const QuoteButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: #ffffff;
  flex-shrink: 1;
`;

const NeedRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding: 14px 15px;
  border-radius: ${radius.xl}px;
  margin-bottom: 10px;
  background-color: ${(props) =>
    props.active ? "rgba(193, 81, 45, 0.06)" : props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) =>
    props.active ? "rgba(193, 81, 45, 0.5)" : props.theme.border};
`;

const Radio = styled.View`
  width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  border-width: 1.5px;
  border-color: ${(props) => (props.active ? TERRACOTTA : props.theme.border)};
`;

const RadioDot = styled.View`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${TERRACOTTA};
`;

const NeedCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const NeedLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const NeedHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const MobileCount = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const SosButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  min-height: 50px;
  border-radius: 18px;
  background-color: ${(props) => (props.disabled ? "#C9CBC6" : TERRACOTTA)};
`;

const SosLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: #ffffff;
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
  margin-bottom: ${spacing.sm}px;
`;

const SheetNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const SheetLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const Diagram = styled.View`
  flex-direction: row;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  padding: 18px 14px;
  margin-bottom: ${spacing.md}px;
  border-radius: 20px;
  background-color: #1c1c1e;
`;

const DiagramNumber = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 22px;
  color: #ffffff;
`;

const DiagramSlash = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 22px;
  color: rgba(255, 255, 255, 0.5);
`;

const HelpRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 11px;
`;

const HelpKey = styled.Text`
  width: 34px;
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${EMERALD};
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
  margin-bottom: ${spacing.sm}px;
  border-radius: 18px;
  background-color: ${(props) => (props.disabled ? "#C9CBC6" : EMERALD)};
`;

const ApplyLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: #ffffff;
`;

const MessagePreview = styled.View`
  padding: 12px 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.md}px;
`;

const MessageText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.text};
`;

const QuoteList = styled(ScrollView)`
  max-height: 260px;
`;

const QuoteRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 10px 0px;
`;

const QuoteRowCol = styled(View)`
  flex: 1;
  min-width: 0px;
`;

const QuoteRowName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;
