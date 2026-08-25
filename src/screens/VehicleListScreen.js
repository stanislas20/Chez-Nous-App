import { useMemo, useState } from "react";
import { FlatList, Image, Modal, Pressable } from "react-native";
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
import { SearchBar } from "../components/SearchBar";
import { useApprovedListings } from "../hooks/useApprovedListings";
import { getCarPark, operatorsForPark } from "../data/carParks";
import { buildVehicleView } from "./CarsScreen";
import {
  VEHICLE_BUDGET_BANDS,
  VEHICLE_YEAR_FLOOR,
  getVehicleColorLabel,
  getVehicleCustoms,
  getVehicleCustomsLabel,
  getVehicleDeal,
  getVehicleDealLabel,
  getVehicleFeatureLabel,
  getVehicleFuelLabel,
  getVehicleTransmissionLabel,
  vehicleBrandTint,
  vehicleBrands,
  vehicleColors,
  vehicleFeatures,
  vehicleFuels,
  vehicleMonogram,
  vehicleTransmissions,
} from "../data/vehicles";
import { carParks } from "../data/carParks";
import { useDirectory } from "../hooks/useDirectory";
import { modelsForBrand } from "../data/vehicleModels";
import { brandLogo, isWideLogo } from "../data/vehicleBrandLogos";
import { isLastRowOrphan } from "../utils/gridWidth";
import { useAuth } from "../auth/AuthContext";
import { canPublish } from "../utils/canPublish";
import { rootRouteName } from "../utils/openAccountGate";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
// Buying bands: this screen never shows rentals, so the per-day ladder does
// not apply.
const BANDS = VEHICLE_BUDGET_BANDS.buy;
// Nine plus the leading "all" chip fills five even two-column rows with no
// straggler. The rest live behind "Tout voir".
const RAIL_MODELS = 9;

// Icon badge, title, and a subtitle that carries the fact the section would
// otherwise need a paragraph for. The bar-and-bold version this replaces was
// the default any screen gets for free; the icon badges are the language the
// refine cards and the quick tiles already speak, so the headings now belong
// to the same screen as everything under them.
function SectionHeader({ icon, title, subtitle, right, flush }) {
  return (
    <SectionHead flush={flush}>
      <SectionIcon>
        <Ionicons name={icon} size={16} color={EMERALD} />
      </SectionIcon>
      <SectionCol>
        <SectionHeadTitle>{title}</SectionHeadTitle>
        {subtitle ? (
          <SectionSub numberOfLines={1}>{subtitle}</SectionSub>
        ) : null}
      </SectionCol>
      {right}
    </SectionHead>
  );
}

// One screen, several entry points. It pins ONE axis — a marque, a deal such
// as Occasion/Neuf, or a sales park — and lets everything else be narrowed
// down. Near-identical screens per axis would have drifted apart the first
// time a filter changed.
export function VehicleListScreen({ navigation, route }) {
  const { user } = useAuth();
  const parks = useDirectory("carParks", carParks, { approvedOnly: true });
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const listings = useApprovedListings();
  const fixedBrand = route?.params?.brand ?? null;
  const fixedDeal = route?.params?.deal ?? null;
  const fixedPark = route?.params?.park ?? null;
  const park = fixedPark ? getCarPark(fixedPark) : null;
  const brand = fixedBrand ?? "";

  // Only offered when the marque is not the pinned axis.
  const [make, setMake] = useState(null);
  const [model, setModel] = useState(null);
  // A floor rather than an exact year: "depuis 2015" is how a used car is
  // actually shopped for, and an exact match on a small market returns
  // nothing.
  const [minYear, setMinYear] = useState(null);
  const [color, setColor] = useState(null);
  const [band, setBand] = useState(null);
  const [gear, setGear] = useState(null);
  const [fuel, setFuel] = useState(null);
  // Every ticked feature must be present, not any of them — someone asking
  // for leather AND a reverse camera wants both.
  const [wanted, setWanted] = useState([]);
  // Collapsed by default: three panels of controls used to sit between the
  // hero and the first vehicle, so the screen opened on filters rather than
  // on stock. Nothing is hidden — the bar names what is active.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [sheetSearch, setSheetSearch] = useState("");

  const openSheet = (key) => {
    setSheetSearch("");
    setSheet(key);
  };

  const closeSheet = () => {
    setSheetSearch("");
    setSheet(null);
  };

  const ofBrand = useMemo(
    () =>
      (listings ?? [])
        .filter(
          (item) =>
            item.categoryKey === "vehicles" &&
            !["tyre", "battery"].includes(item.partType),
        )
        .filter((item) => (fixedBrand ? item.brand === fixedBrand : true))
        // A listing published before vehicleDeal existed counts as a used car
        // for sale — the same fallback the browse screen uses, so a legacy
        // row is not invisible on both sides.
        .filter((item) =>
          fixedDeal ? (item.vehicleDeal ?? "used") === fixedDeal : true,
        )
        .filter((item) => (fixedPark ? item.carPark === fixedPark : true))
        .filter((item) => (make ? item.brand === make : true)),
    [listings, fixedBrand, fixedDeal, fixedPark, make],
  );

  // With a marque pinned, the catalogue is the right source: a buyer wants to
  // see that Corolla and RAV4 exist here even before one is listed, and the
  // empty result is itself the answer. Without a marque there is no catalogue
  // to draw on, so the models come from what is actually published.
  const models = useMemo(() => {
    const catalogue = modelsForBrand(fixedBrand ?? make);
    if (catalogue.length) return catalogue;
    const set = new Set();
    for (const item of ofBrand) if (item.model) set.add(String(item.model));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [ofBrand, fixedBrand, make]);

  const years = useMemo(() => {
    const newest = new Date().getFullYear() + 1;
    const list = [];
    for (let year = newest; year >= VEHICLE_YEAR_FLOOR; year -= 1)
      list.push(year);
    return list;
  }, []);

  const results = useMemo(
    () =>
      ofBrand
        .filter((item) => (model ? item.model === model : true))
        .filter((item) => (minYear ? Number(item.year) >= minYear : true))
        .filter((item) => (color ? item.color === color : true))
        .filter((item) => (gear ? item.transmission === gear : true))
        .filter((item) => (fuel ? item.fuel === fuel : true))
        .filter((item) => {
          if (!band) return true;
          const def = BANDS.find((b) => b.key === band);
          if (!def) return true;
          const price = Number(item.price) || 0;
          if (def.min != null && price < def.min) return false;
          if (def.max != null && price >= def.max) return false;
          return true;
        })
        .filter((item) =>
          wanted.every((key) => (item.features ?? []).includes(key)),
        ),
    [ofBrand, model, minYear, color, gear, fuel, band, wanted],
  );

  const views = useMemo(
    () =>
      results.map((item) => ({
        listing: item,
        view: buildVehicleView(item, language, t),
      })),
    [results, language, t],
  );

  const hasFilters = !!(
    make ||
    model ||
    minYear ||
    color ||
    gear ||
    fuel ||
    band ||
    wanted.length
  );

  const activeCount =
    (make ? 1 : 0) +
    (model ? 1 : 0) +
    (minYear ? 1 : 0) +
    (color ? 1 : 0) +
    (gear ? 1 : 0) +
    (fuel ? 1 : 0) +
    (band ? 1 : 0) +
    wanted.length;

  // Just the refine cards — the equipment ticks clear from their own header.
  const clearRefine = () => {
    setMake(null);
    setModel(null);
    setMinYear(null);
    setColor(null);
    setBand(null);
    setGear(null);
    setFuel(null);
  };

  const clearFilters = () => {
    setMake(null);
    setModel(null);
    setMinYear(null);
    setColor(null);
    setBand(null);
    setGear(null);
    setFuel(null);
    setWanted([]);
  };

  const toggleFeature = (key) =>
    setWanted((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );

  // Signed out is a door the Sell tab's own gate opens; signed in on a
  // number that cannot publish is a wall. Same rule as every other
  // posting entry point in the app.
  const mayPublish = !user || canPublish(user);

  // Publishing lives in the Sell tab and needs an account, so this goes
  // through the same gate the rest of the app uses.
  const goSell = () =>
    navigation.navigate("MainTabs", {
      screen: "Sell",
      params: {
        screen: "CreateListing",
        // initial: false, and this is the whole of why the back arrow was
        // dead. A nested navigate into a tab that has not been opened yet sets
        // the child stack's state to exactly the screen named — so
        // CreateListing became the only route in SellStack, with no dashboard
        // beneath it and nothing for goBack to pop. This keeps the stack's own
        // initial route underneath, which is what makes the arrow work.
        initial: false,
        params: {
          // So the form's back arrow returns here rather than to the
          // seller dashboard the Sell tab opens on.
          originName: rootRouteName(navigation),
          categoryKey: "vehicles",
          isPromoted: false,
          vehiclePurpose: "sell",
        },
      },
    });

  // One sheet, three pickers. Each returns rows of {key,label} plus an
  // "any" row that clears it.
  const activeSheet = useMemo(() => {
    if (sheet === "make")
      return {
        title: t("brandFilterMake"),
        anyLabel: t("brandAnyMake"),
        value: make,
        onSelect: (next) => {
          setMake(next);
          // The chosen model belongs to the old marque.
          setModel(null);
        },
        options: vehicleBrands.map((item) => ({ key: item, label: item })),
      };
    if (sheet === "model")
      return {
        title: t("brandFilterModel"),
        anyLabel: t("brandAnyModel"),
        empty: t("brandNoModels"),
        searchable: true,
        searchPlaceholder: t("brandModelSearch"),
        value: model,
        onSelect: setModel,
        options: models.map((item) => ({ key: item, label: item })),
      };
    if (sheet === "year")
      return {
        title: t("brandFilterYear"),
        anyLabel: t("brandAnyYear"),
        value: minYear,
        onSelect: setMinYear,
        options: years.map((year) => ({
          key: year,
          label: t("carsYearFrom", { year }),
        })),
      };
    if (sheet === "band")
      return {
        title: t("brandFilterBudget"),
        anyLabel: t("brandAnyBudget"),
        value: band,
        onSelect: setBand,
        options: BANDS.map((item) => ({
          key: item.key,
          label: language === "fr" ? item.labelFr : item.labelEn,
        })),
      };
    if (sheet === "gear")
      return {
        title: t("brandFilterGear"),
        anyLabel: t("brandAnyGear"),
        value: gear,
        onSelect: setGear,
        options: vehicleTransmissions.map((item) => ({
          key: item.key,
          label: getVehicleTransmissionLabel(item.key, language),
        })),
      };
    if (sheet === "fuel")
      return {
        title: t("brandFilterFuel"),
        anyLabel: t("brandAnyFuel"),
        value: fuel,
        onSelect: setFuel,
        options: vehicleFuels.map((item) => ({
          key: item.key,
          label: getVehicleFuelLabel(item.key, language),
        })),
      };
    if (sheet === "color")
      return {
        title: t("brandFilterColor"),
        anyLabel: t("brandAnyColor"),
        value: color,
        onSelect: setColor,
        options: vehicleColors.map((item) => ({
          key: item.key,
          label: getVehicleColorLabel(item.key, language),
          swatch: item.swatch,
        })),
      };
    return null;
  }, [
    sheet,
    make,
    model,
    minYear,
    color,
    band,
    gear,
    fuel,
    models,
    years,
    language,
    t,
  ]);

  // The refine grid from the design: four cards, each opening the shared
  // sheet. Marque joins them only when it is not the pinned axis.
  const refine = [
    ...(fixedBrand
      ? []
      : [
          {
            key: "make",
            icon: "car-sport-outline",
            label: t("brandFilterMake"),
            value: make ?? t("brandAnyMake"),
            on: !!make,
          },
        ]),
    {
      key: "year",
      icon: "calendar-outline",
      label: t("brandFilterYear"),
      value: minYear ? t("carsYearFrom", { year: minYear }) : t("brandAnyYear"),
      on: !!minYear,
    },
    {
      key: "band",
      icon: "cash-outline",
      label: t("brandFilterBudget"),
      value: band
        ? (() => {
            const def = BANDS.find((b) => b.key === band);
            return language === "fr" ? def?.labelFr : def?.labelEn;
          })()
        : t("brandAnyBudget"),
      on: !!band,
    },
    {
      key: "gear",
      icon: "cog-outline",
      label: t("brandFilterGear"),
      value: gear
        ? getVehicleTransmissionLabel(gear, language)
        : t("brandAnyGear"),
      on: !!gear,
    },
    {
      key: "fuel",
      icon: "water-outline",
      label: t("brandFilterFuel"),
      value: fuel ? getVehicleFuelLabel(fuel, language) : t("brandAnyFuel"),
      on: !!fuel,
    },
    {
      key: "color",
      icon: "color-palette-outline",
      label: t("brandFilterColor"),
      value: color ? getVehicleColorLabel(color, language) : t("brandAnyColor"),
      on: !!color,
    },
  ];

  // Names the active filters rather than counting them: "Sienna · Depuis 2018"
  // explains a short list, where "3 filtres" only says one exists.
  const filterSummary = [
    model,
    ...refine.filter((item) => item.on).map((item) => item.value),
    ...wanted.map((key) => getVehicleFeatureLabel(key, language)),
  ]
    .filter(Boolean)
    .join(" · ");

  // Nine is what fits before the grid becomes a scroll nobody finishes.
  // A model picked from the sheet is spliced in, or choosing "Land Cruiser"
  // from the full list would leave the rail looking untouched.
  const railModels = useMemo(() => {
    const head = models.slice(0, RAIL_MODELS);
    if (model && !head.includes(model)) return [model, ...head.slice(0, -1)];
    return head;
  }, [models, model]);

  const sheetOptions = useMemo(() => {
    const all = activeSheet?.options ?? [];
    const term = sheetSearch.trim().toLowerCase();
    if (!activeSheet?.searchable || !term) return all;
    return all.filter((item) =>
      String(item.label).toLowerCase().includes(term),
    );
  }, [activeSheet, sheetSearch]);

  // The last card spans the row when the count is odd. Flagged here so the
  // card, its label row and its value row all read the same fact instead of
  // each recomputing it.
  refine.forEach((item, index) => {
    item.full = isLastRowOrphan(index, refine.length, 2);
  });

  // Other marques to try, ordered by the catalogue, never by an invented
  // count.
  const parkCounts = useMemo(() => {
    const tally = new Map();
    for (const item of listings ?? []) {
      if (item.categoryKey !== "vehicles" || !item.carPark) continue;
      tally.set(item.carPark, (tally.get(item.carPark) ?? 0) + 1);
    }
    return tally;
  }, [listings]);

  const nearbyMakes = useMemo(
    () => vehicleBrands.filter((item) => item !== fixedBrand).slice(0, 6),
    [fixedBrand],
  );

  // A real mark when one has been added to assets/brands/, the monogram
  // plate otherwise. See vehicleBrandLogos.js for why this is not generated.
  const logo = fixedBrand ? brandLogo(fixedBrand) : null;
  const wideLogo = fixedBrand ? isWideLogo(fixedBrand) : false;
  const dealDef = fixedDeal ? getVehicleDeal(fixedDeal) : null;
  const tint = fixedBrand
    ? vehicleBrandTint(brand)
    : fixedPark
      ? EMERALD
      : (dealDef?.color ?? EMERALD);
  // Three modes: pinned to a deal, pinned to a marque, or pinned to nothing
  // at all — the "Toutes" tile, where every filter is available.
  const heroTitle = fixedPark
    ? (park?.name ?? "")
    : fixedDeal
      ? getVehicleDealLabel(fixedDeal, language)
      : fixedBrand
        ? brand
        : t("vehicleListAllTitle");

  // Specs and facts arrive as two lists that overlap; the card shows the
  // first few of the union so a listing never repeats "Diesel" twice.
  const cardFacts = (view) => {
    const seen = new Set();
    return [...(view.facts ?? []), ...(view.specChips ?? [])]
      .filter((fact) => fact && !seen.has(fact) && seen.add(fact))
      .slice(0, 4);
  };

  const renderCard = ({ item }) => {
    const { listing, view } = item;
    return (
      <Card onPress={() => navigation.navigate("ProductDetail", { listing })}>
        <Cover>
          {view.cover ? (
            <CoverImage source={{ uri: view.cover }} resizeMode="cover" />
          ) : (
            <CoverFallback
              colors={[tint, "#07362A"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <CoverGlow
                colors={["rgba(224, 176, 76, 0.32)", "rgba(224, 176, 76, 0)"]}
                locations={[0, 0.72]}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                pointerEvents="none"
              />
              <Monogram>{view.monogram}</Monogram>
            </CoverFallback>
          )}
          {/* Customs first: on a market fed by the port, "dédouané" or not
              is the difference between the price shown and the price paid.
              Declared by the seller, like everything else here. */}
          {listing.customs ? (
            <CoverCustoms tone={getVehicleCustoms(listing.customs)?.color}>
              {getVehicleCustomsLabel(listing.customs, language)}
            </CoverCustoms>
          ) : null}
        </Cover>
        {/* Price beside the place rather than over the photo: nothing is
            printed on the car, and the two facts that decide whether to
            open a listing sit on one line. */}
        <CardFoot>
          <FootCol>
            {view.title ? (
              <FootTitle numberOfLines={1}>{view.title}</FootTitle>
            ) : null}
            <FootText numberOfLines={1}>
              {[...cardFacts(view), view.placeLine]
                .filter(Boolean)
                .join("  ·  ")}
            </FootText>
          </FootCol>
          {/* "prix total" is only worth the line when there is something to
              contrast it with — a rent per day or per month. On a sale it
              restated what a bare price already means. */}
          <FootPriceRow>
            <FootPrice>{view.priceLabel}</FootPrice>
            {view.unitLabel && view.unitLabel !== t("carsUnitTotal") ? (
              <FootUnit>{view.unitLabel}</FootUnit>
            ) : null}
          </FootPriceRow>
        </CardFoot>
      </Card>
    );
  };

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={[tint, "#07362A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>
            {/* Three modes, three eyebrows. "Type de véhicule" over the
                unpinned list was wrong — nothing is pinned there. */}
            {fixedPark
              ? (park?.commune ?? t("carParksTitle"))
              : fixedBrand
                ? t("brandEyebrow")
                : fixedDeal
                  ? t("vehicleListDealEyebrow")
                  : t("vehicleListAllEyebrow")}
          </HeroEyebrow>
        </HeroTop>
        {/* The banner's corner light, at screen scale. Same clipping rule:
            overflow hidden, or iOS paints the square. */}
        <HeroGlow
          colors={["rgba(224, 176, 76, 0.5)", "rgba(224, 176, 76, 0)"]}
          locations={[0, 0.7]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <HeroRow>
          <HeroBadge plain={!fixedBrand} wide={wideLogo}>
            {fixedBrand ? (
              logo ? (
                <HeroLogo source={logo} wide={wideLogo} resizeMode="contain" />
              ) : (
                <HeroMonogram tone={tint}>
                  {vehicleMonogram(brand)}
                </HeroMonogram>
              )
            ) : (
              <Ionicons
                name={
                  fixedPark
                    ? "location"
                    : fixedDeal
                      ? (dealDef?.icon ?? "car-outline")
                      : "apps-outline"
                }
                size={24}
                color="#ffffff"
              />
            )}
          </HeroBadge>
          <HeroCol>
            <HeroTitle>{heroTitle}</HeroTitle>
            <HeroCount>
              {listings === null
                ? t("carsLoading")
                : t("carsCount", { count: views.length })}
            </HeroCount>
          </HeroCol>
        </HeroRow>
      </Hero>

      <FlatList
        data={views}
        keyExtractor={(item) => item.listing.id}
        renderItem={renderCard}
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <FilterBar>
              <FilterToggle
                open={filtersOpen}
                onPress={() => setFiltersOpen((value) => !value)}
              >
                <Ionicons
                  name="options-outline"
                  size={15}
                  color={filtersOpen ? "#ffffff" : EMERALD}
                />
                <FilterToggleLabel open={filtersOpen}>
                  {t("brandFiltersLabel")}
                </FilterToggleLabel>
                {activeCount ? (
                  <FilterBadge open={filtersOpen}>
                    <FilterBadgeText open={filtersOpen}>
                      {activeCount}
                    </FilterBadgeText>
                  </FilterBadge>
                ) : null}
                <Ionicons
                  name={filtersOpen ? "chevron-up" : "chevron-down"}
                  size={13}
                  color={filtersOpen ? "rgba(255, 255, 255, 0.75)" : EMERALD}
                />
              </FilterToggle>
              <CountText>
                {listings === null
                  ? t("carsLoading")
                  : t("carsCount", { count: views.length })}
              </CountText>
            </FilterBar>

            {/* Active filters stay named even while the panels are shut, so
                an empty result never looks like empty stock. */}
            {!filtersOpen && hasFilters ? (
              <SummaryRow>
                <SummaryText numberOfLines={1}>{filterSummary}</SummaryText>
                <ClearLink onPress={clearFilters} hitSlop={8}>
                  <ClearLabel>{t("realEstateClearFilters")}</ClearLabel>
                </ClearLink>
              </SummaryRow>
            ) : null}

            {filtersOpen ? (
              <>
                {/* Models first: with a marque pinned this is the catalogue, so
                the row shows what exists rather than only what is in stock. */}
                {models.length ? (
                  <FilterPanel>
                    <SectionHeader
                      flush
                      icon="car-sport-outline"
                      title={t("brandModelsLabel")}
                      subtitle={t("brandModelsCount", { count: models.length })}
                      right={
                        models.length > RAIL_MODELS ? (
                          <SectionLink
                            onPress={() => openSheet("model")}
                            hitSlop={8}
                          >
                            <SectionLinkLabel>
                              {t("carsSeeAll")}
                            </SectionLinkLabel>
                          </SectionLink>
                        ) : null
                      }
                    />
                    {/* Wrapped, not a scroller. A horizontal rail showed four
                    models out of twenty-six and hid the rest behind a swipe
                    nobody makes; wrapping puts a dozen on screen at once and
                    the header's "Tout voir" holds the remainder. */}
                    <ModelWrap>
                      {/* Leading "all" chip, like the marque rail. Re-tapping the
                      selected pill also clears it, but that is invisible to
                      anyone who has not tried it. */}
                      <ModelChip on={!model} onPress={() => setModel(null)}>
                        <ModelChipLabel on={!model}>
                          {t("brandAnyModel")}
                        </ModelChipLabel>
                      </ModelChip>
                      {railModels.map((item) => {
                        const on = model === item;
                        return (
                          <ModelChip
                            key={item}
                            on={on}
                            onPress={() => setModel(on ? null : item)}
                          >
                            {on ? (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color="#ffffff"
                              />
                            ) : null}
                            <ModelChipLabel on={on}>{item}</ModelChipLabel>
                          </ModelChip>
                        );
                      })}
                    </ModelWrap>
                  </FilterPanel>
                ) : null}

                <FilterPanel>
                  <SectionHeader
                    flush
                    icon="options-outline"
                    title={t("brandRefineLabel")}
                    subtitle={t("brandRefineSub")}
                    right={
                      /* Counts only the refine cards, not the equipment ticks —
                   those have their own clear below. */
                      refine.some((item) => item.on) ? (
                        <SectionLink onPress={clearRefine} hitSlop={8}>
                          <SectionLinkLabel>
                            {t("brandRefineOn", {
                              count: refine.filter((item) => item.on).length,
                            })}
                          </SectionLinkLabel>
                        </SectionLink>
                      ) : null
                    }
                  />

                  <RefineGrid>
                    {refine.map((item) => (
                      <RefineCard
                        key={item.key}
                        on={item.on}
                        /* An odd count used to leave a hole in the last row.
                     The straggler now spans the width instead. */
                        full={item.full}
                        onPress={() => openSheet(item.key)}
                      >
                        <RefineTop full={item.full}>
                          <RefineIcon on={item.on}>
                            <Ionicons
                              name={item.icon}
                              size={15}
                              color={item.on ? "#ffffff" : colors.textMuted}
                            />
                          </RefineIcon>
                          <RefineLabel>{item.label}</RefineLabel>
                        </RefineTop>
                        <RefineValueRow full={item.full}>
                          {/* Two variants rather than one component with an
                        interpolated flex: the full-width value must size to
                        its own text so the chevron sits beside it, and the
                        half-width one must stretch so the chevron pins to
                        the right edge. */}
                          {item.full ? (
                            <RefineValueCentred on={item.on} numberOfLines={1}>
                              {item.value}
                            </RefineValueCentred>
                          ) : (
                            <RefineValue on={item.on} numberOfLines={1}>
                              {item.value}
                            </RefineValue>
                          )}
                          <Ionicons
                            name="chevron-down"
                            size={15}
                            color={item.on ? EMERALD : colors.textMuted}
                          />
                        </RefineValueRow>
                      </RefineCard>
                    ))}
                  </RefineGrid>
                </FilterPanel>

                <FilterPanel>
                  <SectionHeader
                    flush
                    icon="sparkles-outline"
                    title={t("sellFieldFeatures")}
                    subtitle={t("brandFeaturesSub")}
                    right={
                      wanted.length ? (
                        <SectionLink onPress={() => setWanted([])} hitSlop={8}>
                          <SectionLinkLabel>
                            {t("brandFeaturesOn", { count: wanted.length })}
                          </SectionLinkLabel>
                        </SectionLink>
                      ) : null
                    }
                  />
                  {/* Multi-select, unlike everything above it — so each one carries
                a box that fills, rather than only tinting like the
                single-choice pills. Ticking three means all three must be
                present, which the note below says out loud. */}
                  <FeatureWrap>
                    {vehicleFeatures.map((item, index) => {
                      const on = wanted.includes(item.key);
                      return (
                        <FeatureChip
                          key={item.key}
                          on={on}
                          /* Same odd-one-out rule as the refine grid: content-width
                       chips left a ragged edge, and an odd count would leave
                       a hole. Two columns, last one spans when it is alone. */
                          full={isLastRowOrphan(
                            index,
                            vehicleFeatures.length,
                            2,
                          )}
                          onPress={() => toggleFeature(item.key)}
                        >
                          <FeatureBox on={on}>
                            {on ? (
                              <Ionicons
                                name="checkmark"
                                size={12}
                                color="#ffffff"
                              />
                            ) : null}
                          </FeatureBox>
                          <Ionicons
                            name={item.icon}
                            size={15}
                            color={on ? EMERALD : colors.textMuted}
                          />
                          <FeatureChipLabel on={on}>
                            {getVehicleFeatureLabel(item.key, language)}
                          </FeatureChipLabel>
                        </FeatureChip>
                      );
                    })}
                  </FeatureWrap>
                </FilterPanel>

                <ClearRow>
                  {hasFilters ? (
                    <ClearLink onPress={clearFilters} hitSlop={8}>
                      <ClearLabel>{t("realEstateClearFilters")}</ClearLabel>
                    </ClearLink>
                  ) : null}
                </ClearRow>
              </>
            ) : null}
          </>
        }
        ListEmptyComponent={
          listings === null ? null : (
            <>
              <EmptyCard>
                <EmptyIcon>
                  <Ionicons
                    name="car-sport-outline"
                    size={26}
                    color={EMERALD}
                  />
                </EmptyIcon>
                <EmptyTitle>
                  {fixedPark
                    ? t("carsEmptyParkTitle", { park: park?.name ?? "" })
                    : fixedBrand
                      ? t("brandEmptyTitle", { brand })
                      : t("carsEmptyTitle")}
                </EmptyTitle>
                <EmptyCopy>
                  {hasFilters
                    ? t("brandEmptyFiltered")
                    : fixedPark
                      ? t("carsEmptyParkCopy")
                      : fixedBrand
                        ? t("brandEmptyCopy")
                        : t("carsEmptyCopy")}
                </EmptyCopy>

                {/* Every button here does something today. The design's
                    "prévenez-moi dès qu'une arrive" is deliberately absent:
                    storing the request is easy, but delivering the alert
                    needs a function that fires on approval, and a button
                    that promises a notification nobody will send is worse
                    than no button. */}
                <EmptyActions>
                  {hasFilters ? (
                    <EmptyPrimary onPress={clearFilters}>
                      <EmptyPrimaryLabel>
                        {t("realEstateClearFilters")}
                      </EmptyPrimaryLabel>
                    </EmptyPrimary>
                  ) : null}
                  <EmptyRow>
                    <EmptyGhost
                      onPress={() => navigation.navigate("VehicleList", {})}
                    >
                      <EmptyGhostLabel>{t("brandAllMakes")}</EmptyGhostLabel>
                    </EmptyGhost>
                    {mayPublish ? (
                      <EmptyGhost onPress={goSell}>
                        <EmptyGhostLabel numberOfLines={1}>
                          {fixedBrand
                            ? t("brandSellMine", { brand })
                            : t("carsSellCta")}
                        </EmptyGhostLabel>
                      </EmptyGhost>
                    ) : null}
                  </EmptyRow>
                </EmptyActions>
              </EmptyCard>

              {/* Other marques, and the physical market — the two things that
                  are actually useful when this list is empty. */}
              <SectionHeader
                icon="grid-outline"
                title={t("brandNearbyMakes")}
                subtitle={t("brandNearbySub")}
              />
              <FilterRow
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={filterRowStyle}
              >
                {nearbyMakes.map((item) => (
                  <MakeCard
                    key={item}
                    onPress={() =>
                      navigation.push("VehicleList", { brand: item })
                    }
                  >
                    {/* The real mark where there is one — the hero at the
                        top of this very screen shows it, so a monogram down
                        here read as a different, lesser catalogue. The
                        monogram plate stays for the three marques with no
                        public-domain logo. */}
                    {brandLogo(item) ? (
                      <MakePlate wide={isWideLogo(item)}>
                        <MakeLogo
                          source={brandLogo(item)}
                          wide={isWideLogo(item)}
                          resizeMode="contain"
                        />
                      </MakePlate>
                    ) : (
                      <MakeDisc
                        colors={[vehicleBrandTint(item), "#07362A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <MakeDiscText>{vehicleMonogram(item)}</MakeDiscText>
                      </MakeDisc>
                    )}
                    <MakeName numberOfLines={1}>{item}</MakeName>
                  </MakeCard>
                ))}
              </FilterRow>

              <SectionHeader
                icon="location-outline"
                title={t("brandParksToVisit")}
                subtitle={t("brandParksSub", { count: parks.length })}
                right={
                  <SectionLink
                    onPress={() => navigation.navigate("CarParks")}
                    hitSlop={8}
                  >
                    <SectionLinkLabel>{t("carsSeeMap")}</SectionLinkLabel>
                  </SectionLink>
                }
              />
              {/* A grid, not a third horizontal rail: these cards carry an
                  operator name and a count, which a scroller would clip. Same
                  odd-one-out rule as the filters above. */}
              <ParkGrid>
                {parks.map((item, index) => {
                  const count = parkCounts.get(item.key) ?? 0;
                  const named = operatorsForPark(item.key);
                  return (
                    <ParkCard
                      key={item.key}
                      full={isLastRowOrphan(index, parks.length, 2)}
                      onPress={() =>
                        navigation.push("VehicleList", { park: item.key })
                      }
                    >
                      <ParkTop>
                        <ParkPin>
                          <Ionicons name="location" size={14} color={EMERALD} />
                        </ParkPin>
                        {count > 0 ? <ParkCount>{count}</ParkCount> : null}
                      </ParkTop>
                      <ParkName numberOfLines={1}>{item.name}</ParkName>
                      <ParkPlace numberOfLines={1}>{item.commune}</ParkPlace>
                      {/* The named business on that stretch, where one is
                          published. Nothing invented when none is. */}
                      {named.length ? (
                        <ParkOperator numberOfLines={1}>
                          {named[0].name}
                        </ParkOperator>
                      ) : null}
                    </ParkCard>
                  );
                })}
              </ParkGrid>
            </>
          )
        }
        ListFooterComponent={
          views.length ? (
            <SafetyNote>
              <Ionicons
                name="shield-checkmark-outline"
                size={14}
                color={GOLD}
              />
              <SafetyText>{t("carsSafetyNote")}</SafetyText>
            </SafetyNote>
          ) : null
        }
      />

      <Modal
        visible={!!activeSheet}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <SheetBackdrop onPress={closeSheet}>
          <Sheet
            onStartShouldSetResponder={() => true}
            bottomInset={insets.bottom}
          >
            <SheetHandle />
            <SheetTitle>{activeSheet?.title}</SheetTitle>
            {activeSheet?.searchable ? (
              <SearchBar
                value={sheetSearch}
                onChangeText={setSheetSearch}
                placeholder={activeSheet.searchPlaceholder}
              />
            ) : null}
            {/* keyboardShouldPersistTaps: the field above holds the keyboard,
                and without this the first tap only dismisses it. */}
            <SheetList keyboardShouldPersistTaps="handled">
              <SheetRow
                onPress={() => {
                  activeSheet?.onSelect(null);
                  closeSheet();
                }}
              >
                <SheetRowLabel active={!activeSheet?.value}>
                  {activeSheet?.anyLabel}
                </SheetRowLabel>
                {!activeSheet?.value ? (
                  <Ionicons name="checkmark" size={16} color={EMERALD} />
                ) : null}
              </SheetRow>
              {activeSheet?.options.length === 0 ? (
                <SheetEmpty>{activeSheet?.empty}</SheetEmpty>
              ) : null}
              {sheetOptions.map((option) => (
                <SheetRow
                  key={String(option.key)}
                  onPress={() => {
                    activeSheet.onSelect(option.key);
                    closeSheet();
                  }}
                >
                  {option.swatch ? <Swatch tone={option.swatch} /> : null}
                  <SheetRowLabel active={activeSheet.value === option.key}>
                    {option.label}
                  </SheetRowLabel>
                  {activeSheet.value === option.key ? (
                    <Ionicons name="checkmark" size={16} color={EMERALD} />
                  ) : null}
                </SheetRow>
              ))}
            </SheetList>
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const filterRowStyle = {
  paddingHorizontal: spacing.md,
  gap: 8,
  paddingVertical: spacing.md,
};

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  padding: ${(props) => props.topInset + spacing.md}px ${spacing.md}px
    ${spacing.xl}px;
  overflow: hidden;
`;

const HeroGlow = styled(LinearGradient)`
  position: absolute;
  top: -60px;
  right: -60px;
  width: 260px;
  height: 260px;
  border-radius: 130px;
  overflow: hidden;
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
  gap: 14px;
`;

const HeroBadge = styled.View`
  /* Wordmarks are around 7:1 and were rendering a few pixels tall inside a
     square. The plate takes its shape from the asset — see isWideLogo. */
  width: ${(props) => (props.wide ? 132 : 76)}px;
  height: 76px;
  border-radius: 24px;
  align-items: center;
  justify-content: center;
  /* Near-white rather than translucent: a marque badge reads as a plate on
     the grille, and white lettering on a tinted square read as a gap in the
     design rather than an emblem. */
  background-color: ${(props) =>
    props.plain ? "rgba(255, 255, 255, 0.18)" : "#ffffff"};
  ${shadow.card}
`;

const HeroLogo = styled(Image)`
  width: ${(props) => (props.wide ? 108 : 52)}px;
  height: 52px;
`;

const HeroMonogram = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 21px;
  letter-spacing: 0.8px;
  color: ${(props) => props.tone ?? EMERALD};
`;

const HeroCol = styled.View`
  flex: 1;
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 28px;
  color: #ffffff;
`;

const HeroCount = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  margin-top: 3px;
  color: rgba(255, 255, 255, 0.72);
`;

const FilterRow = styled.ScrollView`
  flex-grow: 0;
`;

const ModelWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;

// flex-grow inside a wrapping row: Yoga resolves flex line by line, so each
// Two equal columns, matching the refine and equipment grids above and below
// it — one column rhythm for the whole panel stack. Content-width chips that
// grew to fill their line were uniform per row but never uniform down the
// page, so the same tap target changed size depending on its neighbours.
// Two columns rather than three because "Land Cruiser Prado" fits on one
// line at this width and would wrap at a third of the panel.
const ModelChip = styled(Pressable)`
  width: 48.4%;
  min-height: 46px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: ${radius.pill}px;
  /* Flat, and filled with the page ground rather than the panel's white:
     a control reads as inset into its panel, not stacked on top of it. */
  background-color: ${(props) => (props.on ? EMERALD : props.theme.background)};
  border-width: 1px;
  border-color: ${(props) => (props.on ? EMERALD : props.theme.border)};
`;

const ModelChipLabel = styled.Text`
  font-family: ${(props) => (props.on ? fontFamily.bold : fontFamily.semiBold)};
  font-size: 13px;
  text-align: center;
  color: ${(props) => (props.on ? "#ffffff" : props.theme.text)};
`;

// Two columns of small cards rather than a row of pills: each carries a label
// AND its current value, which a pill cannot do without becoming unreadable
// once six of them are set.
const RefineGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
`;

// `full` is the odd-one-out rule: with five filters the last would otherwise
// sit beside a hole. It takes the whole row instead, which reads as intent
// rather than as a layout that ran out of items.
const RefineCard = styled(Pressable)`
  width: ${(props) => (props.full ? "100%" : "48.4%")};
  padding: 13px 14px 14px;
  border-radius: 20px;
  background-color: ${(props) =>
    props.on ? "rgba(11, 110, 79, 0.07)" : props.theme.background};
  border-width: 1px;
  border-color: ${(props) =>
    props.on ? "rgba(11, 110, 79, 0.4)" : props.theme.border};
`;

const RefineTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  /* Left-aligned in a half-width card, centred when it spans the row —
     otherwise the value and the chevron end up at opposite edges with a
     gap of dead space between them. */
  justify-content: ${(props) => (props.full ? "center" : "flex-start")};
`;

const RefineIcon = styled.View`
  width: 26px;
  height: 26px;
  border-radius: 9px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.on ? EMERALD : props.theme.background)};
`;

const RefineLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
`;

const RefineValueRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: ${(props) => (props.full ? "center" : "space-between")};
  gap: 8px;
  margin-top: 9px;
`;

const RefineValue = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.on ? EMERALD : props.theme.text)};
`;

// No flex at all: it sizes to its text so the centred row can place it and
// the chevron together. An earlier attempt interpolated flex on one shared
// component, and React Native reads flex 0 as flex-basis 0 — the value
// collapsed to zero width and vanished from the card.
const RefineValueCentred = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.on ? EMERALD : props.theme.text)};
`;

// One row where three panels used to be. Everything below it is stock.
const FilterBar = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.md}px;
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const FilterToggle = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  padding: 9px 13px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.open ? EMERALD : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) =>
    props.open ? EMERALD : "rgba(11, 110, 79, 0.35)"};
`;

const FilterToggleLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${(props) => (props.open ? "#ffffff" : EMERALD)};
`;

const FilterBadge = styled.View`
  min-width: 19px;
  height: 19px;
  border-radius: 10px;
  padding-horizontal: 5px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.open ? "rgba(255, 255, 255, 0.26)" : EMERALD};
`;

const FilterBadgeText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  color: #ffffff;
`;

const SummaryRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const SummaryText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const CountText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

// `flush` for headers that sit inside a FilterPanel, which supplies its own
// padding — otherwise the header indents twice and floats off its controls.
const SectionHead = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 11px;
  padding-horizontal: ${(props) => (props.flush ? 0 : spacing.md)}px;
  margin-top: ${(props) => (props.flush ? 0 : spacing.lg)}px;
  margin-bottom: ${(props) => (props.flush ? 13 : 12)}px;
`;

// Controls live on a panel; content sits bare on the ground. That is the
// whole elevation rule for this screen. Everything used to be a white
// shadowed card on a near-white ground — chips, filter cards, equipment
// boxes alike — so eighteen loose lozenges competed at one weight and none
// of them read as belonging to a section.
const FilterPanel = styled.View`
  margin-horizontal: ${spacing.md}px;
  margin-top: ${spacing.md}px;
  padding: 15px 14px 16px;
  border-radius: 26px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const SectionIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.09);
`;

const SectionCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const SectionSub = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionHeadTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16.5px;
  letter-spacing: -0.2px;
  color: ${(props) => props.theme.text};
`;

const SectionLink = styled(Pressable)``;

const SectionLinkLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${EMERALD};
`;

const MakeCard = styled(Pressable)`
  width: 92px;
  align-items: center;
  padding: 12px 6px 13px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const MakeDisc = styled(LinearGradient)`
  width: 46px;
  height: 46px;
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  margin-bottom: 9px;
`;

// Aspect-aware like every other plate in the vertical: the wordmarks run
// about 7:1 and render a few pixels tall inside a square.
const MakePlate = styled.View`
  width: ${(props) => (props.wide ? 68 : 46)}px;
  height: 46px;
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  margin-bottom: 9px;
  background-color: #ffffff;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const MakeLogo = styled(Image)`
  width: ${(props) => (props.wide ? 54 : 30)}px;
  height: 30px;
`;

const MakeDiscText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  letter-spacing: 0.6px;
  color: #ffffff;
`;

const MakeName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const ParkGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  padding-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
`;

const ParkCard = styled(Pressable)`
  width: ${(props) => (props.full ? "100%" : "48.4%")};
  padding: 14px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const ParkTop = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
`;

const ParkPin = styled.View`
  width: 32px;
  height: 32px;
  border-radius: 11px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.1);
`;

const ParkCount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
  color: #ffffff;
  background-color: ${EMERALD};
`;

const ParkName = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const ParkPlace = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 3px;
  color: ${(props) => props.theme.textMuted};
`;

const ParkOperator = styled.Text`
  align-self: flex-start;
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  padding: 4px 9px;
  margin-top: 10px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
  color: ${EMERALD};
  background-color: rgba(11, 110, 79, 0.09);
`;

const EmptyCard = styled.View`
  align-items: center;
  padding: 26px 22px 24px;
  margin: 0px ${spacing.md}px;
  border-radius: 26px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const EmptyIcon = styled.View`
  width: 60px;
  height: 60px;
  border-radius: 22px;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  background-color: rgba(11, 110, 79, 0.07);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.16);
`;

const EmptyActions = styled.View`
  align-self: stretch;
  margin-top: ${spacing.md}px;
`;

const EmptyPrimary = styled(Pressable)`
  align-items: center;
  padding-vertical: 14px;
  border-radius: 18px;
  margin-bottom: 9px;
  background-color: ${EMERALD};
`;

const EmptyPrimaryLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: #ffffff;
`;

const EmptyRow = styled.View`
  flex-direction: row;
  gap: 9px;
`;

const EmptyGhost = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding-vertical: 12px;
  border-radius: 16px;
  background-color: ${(props) => props.theme.background};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const EmptyGhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const FeatureWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;

const FeatureChip = styled(Pressable)`
  width: ${(props) => (props.full ? "100%" : "48.4%")};
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 12px 11px;
  border-radius: 16px;
  background-color: ${(props) =>
    props.on ? "rgba(11, 110, 79, 0.07)" : props.theme.background};
  border-width: 1px;
  border-color: ${(props) =>
    props.on ? "rgba(11, 110, 79, 0.4)" : props.theme.border};
`;

const FeatureBox = styled.View`
  width: 18px;
  height: 18px;
  border-radius: 6px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.on ? EMERALD : "transparent")};
  border-width: 1.5px;
  border-color: ${(props) => (props.on ? EMERALD : props.theme.border)};
`;

const FeatureChipLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const ClearRow = styled.View`
  align-items: flex-end;
  padding-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const ClearLink = styled(Pressable)``;

const ClearLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${EMERALD};
`;

const Card = styled(Pressable)`
  border-radius: 24px;
  overflow: hidden;
  margin: 0px ${spacing.md}px ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

// 4:3 and cropped, the way Facebook Marketplace and every car site frame a
// thumbnail. Two reasons it does not decapitate cars: 4:3 is the native
// ratio of a phone camera, so a landscape shot fills the frame with no crop
// at all; and the detail screen shows the photo whole. Letterboxing the
// odd portrait shot instead cost every listing its width.
const Cover = styled.View`
  width: 100%;
  aspect-ratio: 1.3333;
  position: relative;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const CoverImage = styled.Image`
  width: 100%;
  height: 100%;
`;

const CoverFallback = styled(LinearGradient)`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

// Top-right rather than in the body: it is the first thing a buyer here
// checks, and on the photo it is read before the price rather than after.
const CoverCustoms = styled.Text`
  position: absolute;
  top: 12px;
  right: 12px;
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
  color: #ffffff;
  background-color: ${(props) => props.tone ?? "rgba(0, 0, 0, 0.5)"};
`;

const CardFoot = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 10px 14px 11px;
`;

const FootCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const FootTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const FootText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

// One line and sized to its text, never flexed: stacking the unit under the
// price doubled the height of the whole row, and a flexed price would shrink
// because a place name is long.
const FootPriceRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
`;

const FootPrice = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const FootUnit = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${EMERALD};
`;

const CoverGlow = styled(LinearGradient)`
  position: absolute;
  left: -50px;
  bottom: -70px;
  width: 220px;
  height: 220px;
  border-radius: 110px;
  overflow: hidden;
`;

const Monogram = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 30px;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.9);
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  text-align: center;
  margin-top: 6px;
  color: ${(props) => props.theme.textMuted};
`;

const SafetyNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  margin-horizontal: ${spacing.md}px;
  border-radius: 18px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.42);
`;

const Sheet = styled.View`
  padding: 10px ${spacing.md}px ${(props) => props.bottomInset + spacing.md}px;
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  background-color: ${(props) => props.theme.surface};
`;

const SheetHandle = styled.View`
  width: 40px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.border};
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  margin-bottom: 4px;
  color: ${(props) => props.theme.text};
`;

const SheetList = styled.ScrollView`
  max-height: 380px;
`;

const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding-vertical: 13px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SheetRowLabel = styled.Text`
  flex: 1;
  font-family: ${(props) =>
    props.active ? fontFamily.semiBold : fontFamily.regular};
  font-size: 14px;
  color: ${(props) => (props.active ? EMERALD : props.theme.text)};
`;

const SheetEmpty = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  padding-vertical: ${spacing.md}px;
  color: ${(props) => props.theme.textMuted};
`;

const Swatch = styled.View`
  width: 18px;
  height: 18px;
  border-radius: 9px;
  background-color: ${(props) => props.tone};
  border-width: 1px;
  border-color: rgba(0, 0, 0, 0.14);
`;
