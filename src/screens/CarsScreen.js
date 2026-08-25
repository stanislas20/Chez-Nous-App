import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
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
import { SearchBar } from "../components/SearchBar";
import { AdBanner } from "../components/AdBanner";
import { selectionTick } from "../utils/haptics";
import { queryMatches } from "../utils/search";
import { useApprovedListings } from "../hooks/useApprovedListings";
import { useApprovedAds } from "../hooks/useApprovedAds";
import { useAuth } from "../auth/AuthContext";
import { carParks } from "../data/carParks";
import {
  carHelpOptions,
  carServicesMore,
  carServicesPrimary,
} from "../data/carServiceCategories";
import { cities } from "../data/cities";
import {
  carDealerships,
  dealerAccent,
  dealerBrandKey,
  dealerEmblem,
} from "../data/carDealerships";
import { useDirectory } from "../hooks/useDirectory";
import { gridItemWidth } from "../utils/gridWidth";
import { brandLogo, isWideLogo } from "../data/vehicleBrandLogos";
import { buildLinkUrl } from "../data/restaurantLinks";
import { openAccountGate, rootRouteKey } from "../utils/openAccountGate";
import { canPublish } from "../utils/canPublish";
import {
  VEHICLE_BUDGET_BANDS,
  dealsForIntent,
  getVehicleBodyTypeLabel,
  getVehicleDealLabel,
  getVehicleDocuments,
  getVehicleDocumentsLabel,
  getVehicleFuelLabel,
  getVehicleIntentLabel,
  getVehicleSellerKind,
  getVehicleSellerKindLabel,
  getVehicleTransmissionLabel,
  isBeyondImportAge,
  resolveVehicleDocuments,
  vehicleBrandTint,
  vehicleBrands,
  vehicleIntents,
  vehicleMonogram,
  vehiclePricePer,
} from "../data/vehicles";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
// How far the intent track rides up onto the banner, and how much banner is
// left under the stats row. The gap the user sees between the stats and the
// track is HERO_FOOT - TRACK_OVERLAP, so these two move together: raising
// the overlap alone would eventually slide the track over the stats.
// How many marques get a tile before the rest go behind the sheet.
const RAIL_BRANDS = 8;

// Quick-access families. Emerald is the app's selection colour and does not
// appear here — a tile is a destination, not a chosen state, and when one
// green meant "selected", "link", "brand" and "primary" at once, none of
// those roles read as distinct. These three hues are the customs palette
// (see vehicleCustoms in data/vehicles.js), reused rather than invented.
const STOCK_INK = "#0B6E4F";
const STOCK_TINT = "rgba(11, 110, 79, 0.1)";
const PLACE_INK = "#A0522D";
const PLACE_TINT = "rgba(160, 82, 45, 0.1)";
const TIME_INK = "#9A7B33";
const TIME_TINT = "rgba(154, 123, 51, 0.12)";
const SUPPORT_INK = "#55636B";
const SUPPORT_TINT = "rgba(85, 99, 107, 0.1)";
const TRACK_OVERLAP = 40;
const HERO_FOOT = spacing.lg + 42;

// The intent track comes out visibly smaller on iOS than on Android at the
// same numbers — different default text metrics and no font padding — so it
// gets its own size rather than one value that splits the difference and
// suits neither platform.
const IOS = Platform.OS === "ios";
const TAB_PAD_V = IOS ? 14 : 11;
const TAB_GAP = IOS ? 7 : 6;
const TAB_LABEL = IOS ? 14.5 : 13;
const TAB_GLYPH = IOS ? 15 : 13;

// All three intents share the track. Acheter and Louer filter the list;
// Vendre swaps it for what publishing will ask, then hands over to the sell
// flow — the same three-way choice the design asks for.
const INTENTS = vehicleIntents;

function fcfa(value) {
  return Number(value || 0)
    .toLocaleString("fr-FR")
    .replace(/ | /g, " ");
}

// Everything the card and the detail screen show, derived once so both agree.
export function buildVehicleView(listing, language, t) {
  const deal = listing.vehicleDeal;
  const per = vehiclePricePer(deal);
  const sellerKind = getVehicleSellerKind(listing.sellerKind);
  const brand = listing.brand ?? "";

  return {
    id: listing.id,
    title:
      [brand, listing.model, listing.year].filter(Boolean).join(" ").trim() ||
      listing.title,
    priceLabel: `${fcfa(listing.price)} FCFA`,
    // Per day, per month or a flat price — the same per-listing unit switch
    // the commercial property types use.
    unitLabel:
      per === "day"
        ? t("carsUnitPerDay")
        : per === "month"
          ? t("carsUnitPerMonth")
          : t("carsUnitTotal"),
    monogram: vehicleMonogram(brand) || "🚗",
    // The photo is the product. The monogram is only what shows when there
    // isn't one yet.
    cover:
      listing.mediaUrl ??
      (listing.media ?? []).find((item) => item.mediaType !== "video")
        ?.mediaUrl ??
      null,
    facts: [
      Number(listing.mileage) > 0
        ? t("carsFactMileage", { km: fcfa(listing.mileage) })
        : null,
      listing.year ? String(listing.year) : null,
      getVehicleFuelLabel(listing.fuel, language) || null,
      getVehicleTransmissionLabel(listing.transmission, language) || null,
      getVehicleBodyTypeLabel(listing.bodyType, language) || null,
    ].filter(Boolean),
    placeLine: [listing.quartier, listing.city].filter(Boolean).join(", "),
    // The three specs that go over the photo. Body/gearbox/fuel rather than
    // year and mileage, which already lead the fact row underneath.
    specChips: [
      getVehicleBodyTypeLabel(listing.bodyType, language),
      getVehicleTransmissionLabel(listing.transmission, language),
      getVehicleFuelLabel(listing.fuel, language),
    ].filter(Boolean),
    dealLabel: getVehicleDealLabel(deal, language),
    sellerLabel: getVehicleSellerKindLabel(listing.sellerKind, language),
    sellerColor: sellerKind?.color ?? "#4d4d4f",
    // Declared, never verified: the seller ticked a box. The app's own checks
    // (phone, company registry) are shown separately and say so.
    // null when the seller never answered — which is most legacy rows, and
    // must not read as "no papers". See resolveVehicleDocuments.
    documents: resolveVehicleDocuments(listing),
    // Only for importers, and only when the year puts it past the cap — a
    // warning on every old car would be noise.
    importAgeWarning:
      listing.sellerKind === "importer" && isBeyondImportAge(listing.year),
    phone: listing.phone ?? null,
    // Most of this trade is actually conducted over WhatsApp here, so it gets
    // an action of its own rather than hiding behind a phone number the buyer
    // has to copy out.
    whatsapp: buildLinkUrl("whatsapp", listing.phone),
  };
}

// Rendered twice — once under the banner, once in the collapsing bar — so it
// owns its own measured width and thumb animation. Both instances read the
// same `intent` prop, so there is no state to keep in sync between them.
const TRACK_PADDING = 4;
const TRACK_GAP = 4;
// A stable identity for "no rows": a fresh [] each render makes FlatList
// think its data changed on every keystroke.
const EMPTY_ROWS = [];

function IntentSwitch({ intent, onSelect, language, compact }) {
  const index = Math.max(
    0,
    INTENTS.findIndex((item) => item.key === intent),
  );
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbX = useRef(new Animated.Value(0)).current;
  const settled = useRef(false);
  const thumbWidth =
    trackWidth > 0
      ? (trackWidth - TRACK_PADDING * 2 - TRACK_GAP * (INTENTS.length - 1)) /
        INTENTS.length
      : 0;

  useEffect(() => {
    if (thumbWidth <= 0) return;
    const target = index * (thumbWidth + TRACK_GAP);
    // No animation on the first layout, or the thumb slides in from the left
    // every time the bar mounts.
    if (!settled.current) {
      thumbX.setValue(target);
      settled.current = true;
      return;
    }
    Animated.spring(thumbX, {
      toValue: target,
      useNativeDriver: true,
      friction: 11,
      tension: 90,
    }).start();
  }, [index, thumbWidth, thumbX]);

  return (
    <IntentTrack
      compact={compact}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {thumbWidth > 0 ? (
        <IntentThumb
          style={{ width: thumbWidth, transform: [{ translateX: thumbX }] }}
        />
      ) : null}
      {INTENTS.map((item, i) => (
        <IntentTab
          key={item.key}
          compact={compact}
          onPress={() => onSelect(item.key)}
        >
          <IntentGlyph compact={compact}>{item.glyph}</IntentGlyph>
          <IntentLabel compact={compact}>
            {getVehicleIntentLabel(item.key, language)}
          </IntentLabel>
          <IntentActiveLayer
            pointerEvents="none"
            style={{
              opacity: thumbX.interpolate({
                inputRange: [
                  (i - 0.6) * (thumbWidth + TRACK_GAP),
                  i * (thumbWidth + TRACK_GAP),
                  (i + 0.6) * (thumbWidth + TRACK_GAP),
                ],
                outputRange: [0, 1, 0],
                extrapolate: "clamp",
              }),
            }}
          >
            <IntentGlyph compact={compact}>{item.glyph}</IntentGlyph>
            <IntentLabel compact={compact} active>
              {getVehicleIntentLabel(item.key, language)}
            </IntentLabel>
          </IntentActiveLayer>
        </IntentTab>
      ))}
    </IntentTrack>
  );
}

export function CarsScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  // Live rows when the console has any, the bundled seed until then.
  const dealerships = useDirectory("dealerships", carDealerships);
  const [showMoreServices, setShowMoreServices] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const parks = useDirectory("carParks", carParks, { approvedOnly: true });

  const insets = useSafeAreaInsets();
  const listings = useApprovedListings();
  const ads = useApprovedAds();
  const { user } = useAuth();

  const [intent, setIntent] = useState("buy");
  const [deal, setDeal] = useState(null);
  const [brand, setBrand] = useState(null);
  const [band, setBand] = useState(null);
  const [search, setSearch] = useState("");
  // The banner's location pill. Null means the whole country rather than a
  // default city — picking one for the user would quietly hide listings
  // everywhere else.
  const [city, setCity] = useState(null);
  // One bottom sheet serves both the city picker and the full marque list.
  const [activeSheet, setActiveSheet] = useState(null);
  const [sheetSearch, setSheetSearch] = useState("");

  // Collapse state. scrollY drives the bar on the native driver; `stuck` is
  // the JS mirror used only for pointerEvents, so it is set from a listener
  // rather than read off the animated value during render.
  const [heroHeight, setHeroHeight] = useState(0);
  const [stuck, setStuck] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const onHeroLayout = (event) =>
    setHeroHeight(event.nativeEvent.layout.height);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );

  // Falls back to a sane distance until the banner has been measured, so the
  // interpolation below always has an increasing input range.
  const trigger = heroHeight > 0 ? heroHeight : 320;

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      setStuck((prev) => {
        // Hysteresis: without the gap the bar flickers between states when a
        // scroll settles right on the threshold.
        const next = prev ? value > trigger - 100 : value > trigger - 60;
        return next === prev ? prev : next;
      });
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, trigger]);

  const stickyOpacity = scrollY.interpolate({
    inputRange: [trigger - 60, trigger - 10],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const stickyShift = scrollY.interpolate({
    inputRange: [trigger - 60, trigger - 10],
    outputRange: [-14, 0],
    extrapolate: "clamp",
  });

  const selectIntent = (key) => {
    if (key === intent) return;
    selectionTick();
    setIntent(key);
    // Deals and budget bands are per-intent; one chosen under "buy" would
    // silently filter everything out under "rent".
    setDeal(null);
    setBand(null);
  };

  const deals = dealsForIntent(intent);
  const bands = VEHICLE_BUDGET_BANDS[intent] ?? [];

  const results = useMemo(() => {
    const selectedBand = bands.find((item) => item.key === band);
    const intentDeals = new Set(deals.map((item) => item.key));

    return (
      (listings ?? [])
        // A tyre is filed under Vehicles — the category is "cars, motorbikes,
        // parts" — but it is not a car, and showing one here as a vehicle with
        // no year and no mileage is how a list stops being trustworthy.
        .filter(
          (item) =>
            item.categoryKey === "vehicles" &&
            !["tyre", "battery"].includes(item.partType),
        )
        .filter((item) => {
          // Vehicles published before vehicleDeal existed — and any that got
          // through while the form's validation was unreachable — carry no
          // deal at all. Matched literally they belong to no intent, so they
          // are invisible under Acheter AND Louer while still being counted
          // as online. Treating a missing deal as a used car for sale puts
          // them where a buyer would look for them.
          const itemDeal = item.vehicleDeal ?? "used";
          return deal ? itemDeal === deal : intentDeals.has(itemDeal);
        })
        .filter((item) => (brand ? item.brand === brand : true))
        .filter((item) => (city ? item.city === city : true))
        .filter((item) => {
          if (!selectedBand) return true;
          const price = Number(item.price) || 0;
          if (selectedBand.min != null && price < selectedBand.min)
            return false;
          if (selectedBand.max != null && price >= selectedBand.max)
            return false;
          return true;
        })
        .filter((item) =>
          search.trim()
            ? queryMatches(
                search,
                item.brand,
                item.model,
                item.title,
                item.city,
                item.quartier,
              )
            : true,
        )
    );
  }, [listings, intent, deal, brand, band, bands, deals, search, city]);

  const views = useMemo(
    () =>
      results.map((item) => ({
        listing: item,
        view: buildVehicleView(item, language, t),
      })),
    [results, language, t],
  );

  const isLoading = listings === null;
  const hasFilters = !!(deal || brand || band || search.trim() || city);

  // Every one of these is counted, not declared. The parks and the concessions
  // are the length of lists that exist; the vehicle figure is how many are
  // actually published. The design's "1 240 véhicules" would be a lie today.
  const vehicleTotal = useMemo(
    () =>
      (listings ?? []).filter(
        (item) =>
          item.categoryKey === "vehicles" &&
          !["tyre", "battery"].includes(item.partType),
      ).length,
    [listings],
  );

  const clearFilters = () => {
    setDeal(null);
    setBrand(null);
    setBand(null);
    setSearch("");
    setCity(null);
  };

  const sellFields = [
    t("sellFieldBrand"),
    t("sellFieldModel"),
    t("sellFieldYear"),
    t("sellFieldMileage"),
    t("sellFieldFuel"),
    t("sellFieldTransmission"),
    t("sellFieldBodyType"),
    t("sellFieldSellerKind"),
    t("carsSellFieldPhotos"),
    t("sellFieldPrice"),
  ];

  // Publishing lives in the Sell tab and needs an account, so someone without
  // one goes through the same neutral gate the rest of the app uses rather
  // than hitting a dead button.
  // Signed out is a door the account gate opens; signed in on a number
  // that cannot publish is a wall. Same rule as every other posting
  // entry point in the app.
  const mayPublish = !user || canPublish(user);

  const startSelling = () => {
    if (!user) {
      openAccountGate(navigation);
      return;
    }
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
        // Arriving from Vendre, so the form opens on the sale side and never
        // offers a rental deal to someone selling their car.
        params: {
          // So the form's back arrow returns here rather than to the
          // seller dashboard the Sell tab opens on.
          originKey: rootRouteKey(navigation),
          categoryKey: "vehicles",
          isPromoted: false,
          vehiclePurpose: "sell",
        },
      },
    });
  };

  // A park operator has stock, not a listing. They get the repeat form,
  // where the stand and the phone number are typed once for the whole row
  // of cars instead of once per car.
  const startStock = () => {
    if (!user) {
      openAccountGate(navigation);
      return;
    }
    navigation.navigate("MainTabs", {
      screen: "Sell",
      params: { screen: "ParkInventory" },
    });
  };

  // The field lives in the banner now, which means it is also on screen under
  // Vendre — where there is no list for it to filter. Typing there moves the
  // intent to Acheter rather than leaving a search box that does nothing.
  const onSearchChange = (next) => {
    setSearch(next);
    if (next.trim() && intent === "sell") {
      setIntent("buy");
      setDeal(null);
      setBand(null);
    }
  };

  const openLink = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  // A tile sets the intent and its deal together. Going through selectIntent
  // would clear the deal it is trying to set.
  const jumpTo = (intentKey, dealKey) => {
    selectionTick();
    setIntent(intentKey);
    setDeal(dealKey ?? null);
    setBand(null);
  };

  // The trades around the car are ordinary Services listings, so a tile opens
  // that category with its search already filled in rather than pointing at a
  // hand-kept directory that would go stale.
  const openService = (service) => {
    navigation.navigate("CategoryListings", {
      categoryKey: "services",
      labelEn: "Services",
      labelFr: "Services",
      initialQuery: service?.query ?? "",
    });
  };

  // One dispatcher for every tile, because the hub mixes three kinds of
  // destination: a search in Services, a screen that already exists, and —
  // once — a phone call. Keeping the difference in the data rather than in
  // the markup is what lets the tail be reordered without touching the grid.
  const openServiceEntry = (entry) => {
    setHelpOpen(false);
    if (entry.tel) {
      Linking.openURL(`tel:${entry.tel}`).catch(() => {});
      return;
    }
    if (entry.route) {
      // The specialty travels with the route so a tile lands on the trade it
      // names — tapping "Pneus" opens the garages already filtered to tyre
      // fitters, rather than the full list with the work left to the user.
      // Whatever the tile already knows travels with it, so the next screen
      // opens on the thing the tile named rather than at its own front door:
      // a specialty for Garages, a problem for Dépannage.
      const params = {
        ...(entry.specialty ? { specialty: entry.specialty } : {}),
        ...(entry.problem ? { problem: entry.problem } : {}),
      };
      navigation.navigate(
        entry.route,
        Object.keys(params).length ? params : undefined,
      );
      return;
    }
    openService(entry);
  };

  // The doc's À LA UNE carries a park card and a concession card. Promoted
  // vehicles go in front of them when a seller has actually paid to feature
  // one — isPromoted already exists on every listing.
  const featuredVehicles = useMemo(
    () =>
      (listings ?? [])
        .filter(
          (item) =>
            item.categoryKey === "vehicles" &&
            !["tyre", "battery"].includes(item.partType) &&
            !["tyre", "battery"].includes(item.partType) &&
            item.isPromoted,
        )
        .slice(0, 4),
    [listings],
  );

  // The floor an actual listing sets, never a headline figure.
  const driverRentalFrom = useMemo(() => {
    const prices = (listings ?? [])
      .filter(
        (item) =>
          item.categoryKey === "vehicles" &&
          item.vehicleDeal === "rentalDriver" &&
          Number(item.price) > 0,
      )
      .map((item) => Number(item.price));
    return prices.length ? Math.min(...prices) : null;
  }, [listings]);

  // The rail shows the makes worth a tile; the rest live in the sheet behind
  // "Voir tout". Ordered by what is actually published, falling back to the
  // curated order in vehicles.js — which is itself ordered by what circulates
  // in the parks, so the fallback is not arbitrary.
  const railBrands = useMemo(() => {
    const counts = new Map();
    for (const item of listings ?? []) {
      if (item.categoryKey !== "vehicles" || !item.brand) continue;
      counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
    }
    // Array#sort is stable, so equal counts keep the curated order.
    return [...vehicleBrands]
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
      .slice(0, RAIL_BRANDS);
  }, [listings]);

  // One slot, one ad — the most recent approved one. Not a carousel: several
  // AdBanners on screen means several muted videos competing for playback,
  // and this screen already asks a lot of the scroller.
  //
  // Rendered only when an ad exists. An empty ad frame tells a buyer the app
  // is waiting for advertisers, which is nobody's business but ours.
  const ad = (ads ?? [])[0] ?? null;

  const quickAccess = [
    // Occasion and Neuf open their own list rather than setting a chip on
    // this screen — that chip row was saying the same thing twice.
    //
    // Four families, not six one-off hues. A tile's colour says what kind of
    // destination it is, so a repeated hue is the point rather than a clash:
    // green for stock you buy, laterite for places you physically go, gold
    // for a deal measured in time, slate for support. The three colours are
    // the customs palette from vehicles.js — already earned elsewhere in the
    // vertical rather than invented for this grid.
    // `ink` is the glyph, `tint` the same hue at about a tenth strength.
    {
      key: "used",
      icon: "car-sport-outline",
      ink: STOCK_INK,
      tint: STOCK_TINT,
      onPress: () => navigation.navigate("VehicleList", { deal: "used" }),
    },
    {
      key: "new",
      icon: "sparkles-outline",
      ink: STOCK_INK,
      tint: STOCK_TINT,
      onPress: () => navigation.navigate("VehicleList", { deal: "new" }),
    },
    {
      key: "dealerships",
      icon: "business-outline",
      ink: PLACE_INK,
      tint: PLACE_TINT,
      onPress: () => navigation.navigate("CarDealerships"),
    },
    {
      key: "parks",
      icon: "location-outline",
      ink: PLACE_INK,
      tint: PLACE_TINT,
      onPress: () => navigation.navigate("CarParks"),
    },
    {
      key: "rent",
      icon: "key-outline",
      ink: TIME_INK,
      tint: TIME_TINT,
      onPress: () => jumpTo("rent", null),
    },
    {
      key: "services",
      icon: "construct-outline",
      ink: SUPPORT_INK,
      tint: SUPPORT_TINT,
      onPress: () => openService(null),
    },
  ];

  const renderCard = ({ item }) => {
    const { listing, view } = item;
    return (
      <Card onPress={() => navigation.navigate("ProductDetail", { listing })}>
        <Cover>
          {view.cover ? (
            <CoverImage source={{ uri: view.cover }} resizeMode="cover" />
          ) : (
            <CoverFallback
              colors={["#0B6E4F", "#07362A"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Monogram>{view.monogram}</Monogram>
            </CoverFallback>
          )}
          {view.dealLabel ? <CoverTag>{view.dealLabel}</CoverTag> : null}
          {/* Declared by the seller, never checked by the app — but the one
              flag worth carrying onto the photo, since it changes what the
              buyer has to do before paying anything. Silence shows nothing:
              only an explicit answer earns a badge, and only the two that
              cost the buyer something are worth the corner. */}
          {view.documents === "no" || view.documents === "pending" ? (
            <CoverWarn tone={getVehicleDocuments(view.documents)?.color}>
              {getVehicleDocumentsLabel(view.documents, language)}
            </CoverWarn>
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
              {[...view.facts, view.placeLine, view.sellerLabel]
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
        {view.importAgeWarning ? (
          <ImportFoot>
            <Ionicons name="alert-circle-outline" size={13} color={GOLD} />
            <ImportNoteText>{t("carsImportAgeWarning")}</ImportNoteText>
          </ImportFoot>
        ) : null}
      </Card>
    );
  };

  // Concessions and services sit under every tab — someone selling a car
  // needs the panel beater as much as someone buying one does.
  const bottomBlock = (
    <>
      <SectionHead>
        <SectionHeadTitle>{t("carsDealershipsTitle")}</SectionHeadTitle>
        <SectionLink
          onPress={() => navigation.navigate("CarDealerships")}
          hitSlop={8}
        >
          <SectionLinkLabel>{t("carsSeeAll")}</SectionLinkLabel>
        </SectionLink>
      </SectionHead>
      <FilterScroll
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={chipRowStyle}
      >
        {dealerships.map((item) => (
          <DealerCard
            key={item.key}
            onPress={() => navigation.navigate("CarDealerships")}
          >
            {/* The band carries the distributor's own name as its emblem
                and a tint that is only ever an app-side differentiator —
                we hold no logo or brand colour for these companies, and a
                firm's identity is not something to invent. */}
            <DealerBand
              colors={[dealerAccent(item.key), "#0B1A16"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <DealerEmblem numberOfLines={1}>
                {dealerEmblem(item.name)}
              </DealerEmblem>
              {item.group ? (
                <DealerGroup numberOfLines={1}>{item.group}</DealerGroup>
              ) : null}
            </DealerBand>

            <DealerBody>
              <DealerName numberOfLines={2}>{item.name}</DealerName>
              {/* The real marks of the marques this distributor actually
                  carries. That is both accurate and the thing a buyer is
                  scanning for — it tells CFAO from SONAEC faster than any
                  wordmark would. Marques with no public-domain logo simply
                  do not appear, and the count below still names them all. */}
              <DealerLogoRow>
                {item.brands
                  .map(dealerBrandKey)
                  .filter((brand) => brandLogo(brand))
                  .slice(0, 4)
                  .map((brand) => (
                    <DealerLogoPlate key={brand} wide={isWideLogo(brand)}>
                      <DealerLogo
                        source={brandLogo(brand)}
                        wide={isWideLogo(brand)}
                        resizeMode="contain"
                      />
                    </DealerLogoPlate>
                  ))}
              </DealerLogoRow>
              <DealerBrands numberOfLines={2}>
                {item.brands.join(" · ")}
              </DealerBrands>
              <DealerTag>{item.city}</DealerTag>
            </DealerBody>
          </DealerCard>
        ))}
      </FilterScroll>

      <SectionHead>
        <SectionHeadTitle>{t("carsServicesTitle")}</SectionHeadTitle>
      </SectionHead>

      {/* Above the grid, because the person who needs it is standing on the
          roadside and should not have to scan twenty-five tiles to find it. */}
      <HelpButton onPress={() => setHelpOpen(true)}>
        <HelpFill
          colors={["#C2452F", "#7E2A1C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <HelpIcon>
          <Ionicons name="alert-circle" size={19} color="#ffffff" />
        </HelpIcon>
        <HelpCol>
          <HelpEyebrow>{t("carsHelpEyebrow")}</HelpEyebrow>
          <HelpTitle>{t("carsHelpButton")}</HelpTitle>
          <HelpSub numberOfLines={1}>{t("carsHelpButtonSub")}</HelpSub>
        </HelpCol>
        <HelpChevron>
          <Ionicons name="chevron-forward" size={15} color="#ffffff" />
        </HelpChevron>
      </HelpButton>

      <ServiceGrid>
        {carServicesPrimary.map((item, index) => (
          <ServiceTile
            key={item.key}
            width={gridItemWidth(index, carServicesPrimary.length, 3)}
            onPress={() => openServiceEntry(item)}
          >
            <ServiceIcon>
              <Ionicons name={item.icon} size={17} color={EMERALD} />
            </ServiceIcon>
            <ServiceName numberOfLines={2}>
              {t(`carsService_${item.key}`)}
            </ServiceName>
          </ServiceTile>
        ))}
      </ServiceGrid>

      {/* The long tail, ranked below rather than removed. Twelve covers most
          of why this screen gets opened; the other thirteen are real needs
          that would drown the first twelve if they shared the fold. */}
      {showMoreServices ? (
        <ServiceGrid>
          {carServicesMore.map((item, index) => (
            <ServiceTile
              key={item.key}
              width={gridItemWidth(index, carServicesMore.length, 3)}
              onPress={() => openServiceEntry(item)}
            >
              <ServiceIcon>
                <Ionicons name={item.icon} size={17} color={EMERALD} />
              </ServiceIcon>
              <ServiceName numberOfLines={2}>
                {t(`carsService_${item.key}`)}
              </ServiceName>
            </ServiceTile>
          ))}
        </ServiceGrid>
      ) : null}

      <MoreServicesButton
        onPress={() => setShowMoreServices((value) => !value)}
      >
        <MoreServicesLabel>
          {showMoreServices ? t("carsServicesLess") : t("carsServicesMore")}
        </MoreServicesLabel>
        <Ionicons
          name={showMoreServices ? "chevron-up" : "chevron-down"}
          size={15}
          color={EMERALD}
        />
      </MoreServicesButton>

      <SafetyNote>
        <Ionicons name="shield-checkmark-outline" size={14} color={GOLD} />
        <SafetyText>{t("carsSafetyNote")}</SafetyText>
      </SafetyNote>
    </>
  );

  const heroBlock = (
    <Hero
      colors={["#0B6E4F", "#07362A"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      topInset={insets.top}
    >
      {/* The warm corner light from the design. expo-linear-gradient has no
            radial mode, so this is a diagonal gold-to-transparent fade
            clipped to a circle and hung off the corner — the visible part is
            the falloff, which reads as a glow. First child, so everything
            below paints over it. */}
      <HeroGlow
        colors={[
          "rgba(224, 176, 76, 0.55)",
          "rgba(224, 176, 76, 0.22)",
          "rgba(224, 176, 76, 0)",
        ]}
        locations={[0, 0.35, 0.7]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />
      <HeroTop>
        <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </BackButton>
        <HeroEyebrow>{t("carsEyebrow")}</HeroEyebrow>
      </HeroTop>
      <CityPill onPress={() => setActiveSheet("city")} hitSlop={6}>
        <Ionicons name="location-outline" size={13} color="#ffffff" />
        <CityPillLabel>{city ?? t("carsCityAll")}</CityPillLabel>
        <Ionicons name="chevron-down" size={13} color="#ffffff" />
      </CityPill>

      <HeroTitle>{t("carsTitle")}</HeroTitle>
      <HeroCopy>{t("carsIntro")}</HeroCopy>

      <HeroSearch>
        <SearchBar
          onDark
          value={search}
          onChangeText={onSearchChange}
          placeholder={t("carsSearchPlaceholder")}
        />
      </HeroSearch>

      {/* Counted, never declared: published vehicles, the parks this app
            knows, the distributors it lists. */}
      <StatRow>
        <StatCol>
          <StatValue>{isLoading ? "—" : fcfa(vehicleTotal)}</StatValue>
          {/* French takes the singular after 0 and 1, so a fixed plural
                label reads as a typo on exactly the counts a new market
                spends most of its time showing. */}
          <StatLabel>
            {t(vehicleTotal > 1 ? "carsStatVehicles" : "carsStatVehiclesOne")}
          </StatLabel>
        </StatCol>
        <StatDivider />
        <StatCol>
          <StatValue>{parks.length}</StatValue>
          <StatLabel>{t("carsStatParks")}</StatLabel>
        </StatCol>
        <StatDivider />
        <StatCol>
          <StatValue>{dealerships.length}</StatValue>
          <StatLabel>{t("carsStatDealerships")}</StatLabel>
        </StatCol>
      </StatRow>
    </Hero>
  );

  // One scroll container for all three intents. Vendre used to own a second
  // ScrollView, which meant the banner and the collapsing bar would have had
  // to exist twice; feeding the list no rows and putting the sell panel in
  // its empty slot keeps one scroller and one header.
  const isSell = intent === "sell";

  const sellBlock = (
    <>
      <SellCard>
        <SellTitle>{t("carsSellTitle")}</SellTitle>
        <SellCopy>{t("carsSellCopy")}</SellCopy>
        {sellFields.map((field) => (
          <SellFieldRow key={field}>
            <Ionicons name="checkmark" size={13} color={EMERALD} />
            <SellFieldLabel>{field}</SellFieldLabel>
          </SellFieldRow>
        ))}
        {mayPublish ? (
          <SellCta onPress={startSelling}>
            <SellCtaLabel>{t("carsSellCta")}</SellCtaLabel>
          </SellCta>
        ) : null}
      </SellCard>
      <SafetyNote>
        <Ionicons name="shield-checkmark-outline" size={14} color={GOLD} />
        <SafetyText>{t("carsSellSafety")}</SafetyText>
      </SafetyNote>
      <StockCard onPress={startStock}>
        <StockTop>
          <StockIcon>
            <Ionicons name="layers-outline" size={17} color={EMERALD} />
          </StockIcon>
          <StockCol>
            <StockTitle>{t("carsStockTitle")}</StockTitle>
            <StockCopy>{t("carsStockCopy")}</StockCopy>
          </StockCol>
        </StockTop>
        <StockCtaRow>
          <StockCtaLabel>{t("carsStockCta")}</StockCtaLabel>
          <Ionicons name="chevron-forward" size={15} color={EMERALD} />
        </StockCtaRow>
      </StockCard>
    </>
  );

  return (
    <Container edges={["left", "right"]}>
      <Animated.FlatList
        data={isSell ? EMPTY_ROWS : views}
        keyExtractor={(item) => item.listing.id}
        renderItem={renderCard}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={onScroll}
        /* Passed as an element, not a function: a new component type each
           render would remount everything in here on every keystroke. */
        ListHeaderComponent={
          <>
            <HeroMeasure onLayout={onHeroLayout}>
              {heroBlock}
              <IntentSwitch
                intent={intent}
                onSelect={selectIntent}
                language={language}
              />
            </HeroMeasure>
            {/* Editorial, not a menu. It used to carry permanent cards for
                Parcs, Mobilité and Concessions — all three of which already
                have a tile in Accès rapide below and a section of their own,
                so the screen was showing the same six destinations three
                times over. What belongs here is what is notable right now,
                which means promoted listings; with none, the section is not
                rendered at all rather than padded with evergreen links. */}
            {featuredVehicles.length ? (
              <>
                <SectionLabel>{t("carsFeaturedLabel")}</SectionLabel>
                <FilterScroll
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={chipRowStyle}
                >
                  {featuredVehicles.map((item) => {
                    const view = buildVehicleView(item, language, t);
                    return (
                      <FeaturePress
                        key={item.id}
                        onPress={() =>
                          navigation.navigate("ProductDetail", {
                            listing: item,
                          })
                        }
                      >
                        <FeatureCard
                          colors={["#0B6E4F", "#07362A"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <FeatureGlow
                            colors={[
                              "rgba(255,255,255,0.22)",
                              "rgba(255,255,255,0)",
                            ]}
                            locations={[0, 0.72]}
                            start={{ x: 1, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            pointerEvents="none"
                          />
                          <FeatureWatermark pointerEvents="none">
                            <Ionicons
                              name="car-sport"
                              size={132}
                              color="rgba(255,255,255,0.13)"
                            />
                          </FeatureWatermark>
                          <FeatureTag>{t("carsFeaturedTag")}</FeatureTag>
                          <FeatureTitle numberOfLines={1}>
                            {view.title}
                          </FeatureTitle>
                          <FeatureSub numberOfLines={2}>
                            {`${view.priceLabel} ${view.unitLabel}`.trim()}
                          </FeatureSub>
                          <FeatureCtaRow>
                            <FeatureCtaLabel>
                              {t("carsViewCta")}
                            </FeatureCtaLabel>
                            <FeatureArrow>
                              <Ionicons
                                name="arrow-forward"
                                size={13}
                                color="#ffffff"
                              />
                            </FeatureArrow>
                          </FeatureCtaRow>
                        </FeatureCard>
                      </FeaturePress>
                    );
                  })}
                </FilterScroll>
              </>
            ) : null}

            <SectionLabel>{t("carsQuickLabel")}</SectionLabel>
            <QuickGrid>
              {quickAccess.map((item) => (
                <QuickTile key={item.key} onPress={item.onPress}>
                  <QuickIcon tint={item.tint}>
                    <Ionicons name={item.icon} size={20} color={item.ink} />
                  </QuickIcon>
                  <QuickLabel numberOfLines={1}>
                    {t(`carsQuick_${item.key}`)}
                  </QuickLabel>
                </QuickTile>
              ))}
            </QuickGrid>

            {/* Seen on the way past the menu, never between a filter and its
                result — someone who has just set a budget is mid-task. */}
            {ad ? (
              <AdSlot>
                <AdBanner ad={ad} isActive style={adBannerStyle} />
              </AdSlot>
            ) : null}

            {/* Browse filters — park, marque, budget, then the result count.
                Vendre has no list for any of them to act on, and its budget
                bands are empty, so the label used to render over nothing. */}
            {!isSell ? (
              <>
                {intent === "rent" ? (
                  <BundleCard>
                    <BundleTitle>{t("carsBundleTitle")}</BundleTitle>
                    <BundleCopy>{t("carsBundleCopy")}</BundleCopy>
                    <BundleRow>
                      <BundleCta onPress={() => jumpTo("rent", "rentalDriver")}>
                        <Ionicons
                          name="person-outline"
                          size={13}
                          color="#ffffff"
                        />
                        <BundleCtaLabel>{t("carsBundleCarCta")}</BundleCtaLabel>
                      </BundleCta>
                      <BundleGhost
                        onPress={() => navigation.navigate("RealEstate")}
                      >
                        <BundleGhostLabel>
                          {t("carsBundleStayCta")}
                        </BundleGhostLabel>
                      </BundleGhost>
                    </BundleRow>
                  </BundleCard>
                ) : null}
                {/* Only under Louer. Occasion and Neuf already have their
                    own tiles in Accès rapide, so repeating them here was
                    saying the same thing twice; the rental types have no
                    other home. */}
                {intent === "rent" ? (
                  <FilterScroll
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={chipRowStyle}
                  >
                    {deals.map((item) => {
                      const active = deal === item.key;
                      return (
                        <Chip
                          key={item.key}
                          active={active}
                          accent={item.color}
                          onPress={() => setDeal(active ? null : item.key)}
                        >
                          <ChipLabel active={active}>
                            {getVehicleDealLabel(item.key, language)}
                          </ChipLabel>
                        </Chip>
                      );
                    })}
                  </FilterScroll>
                ) : null}
                <SectionHead>
                  <SectionHeadTitle>{t("carsBrandsLabel")}</SectionHeadTitle>
                  <SectionLink
                    onPress={() => setActiveSheet("brand")}
                    hitSlop={8}
                  >
                    <SectionLinkLabel>{t("carsSeeAll")}</SectionLinkLabel>
                  </SectionLink>
                </SectionHead>
                {/* A tile per marque, opening that marque's own screen where
                    model, year, colour and equipment can be narrowed down.
                    No counts: every one would read zero until the first
                    listings arrive, and a wall of zeroes advertises an empty
                    market. */}
                {/* Wrapped, not a rail. Three tiles were visible out of
                    nine and the rest sat behind a sideways swipe, which is
                    the one gesture nobody makes on a section they are still
                    reading. Three columns of three fills the width evenly. */}
                <BrandGrid>
                  <BrandTile
                    onPress={() => navigation.navigate("VehicleList", {})}
                  >
                    <BrandBadge
                      colors={["#4C5A63", "#26313A"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Ionicons name="apps-outline" size={20} color="#ffffff" />
                    </BrandBadge>
                    <BrandTileLabel numberOfLines={1}>
                      {t("carsBrandAll")}
                    </BrandTileLabel>
                  </BrandTile>
                  {railBrands.map((item) => (
                    <BrandTile
                      key={item}
                      onPress={() =>
                        navigation.navigate("VehicleList", { brand: item })
                      }
                    >
                      {/* The real mark where we have one, the monogram plate
                          otherwise. White plate either way, so a rail of
                          mixed makes stays even. */}
                      {brandLogo(item) ? (
                        <BrandPlate wide={isWideLogo(item)}>
                          <BrandLogo
                            source={brandLogo(item)}
                            wide={isWideLogo(item)}
                            resizeMode="contain"
                          />
                        </BrandPlate>
                      ) : (
                        <BrandBadge
                          colors={[vehicleBrandTint(item), "#07362A"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <BrandMonogram>{vehicleMonogram(item)}</BrandMonogram>
                        </BrandBadge>
                      )}
                      <BrandTileLabel numberOfLines={1}>{item}</BrandTileLabel>
                    </BrandTile>
                  ))}
                </BrandGrid>
                <SectionHead>
                  <SectionTitleRow>
                    <SectionHeadTitle>{t("carsBudgetLabel")}</SectionHeadTitle>
                    {/* The unit belongs to the whole scale, so it is said
                        once here rather than repeated under every tier. */}
                    <SectionUnit>
                      {vehiclePricePer(deal) === "day"
                        ? t("carsUnitPerDay")
                        : vehiclePricePer(deal) === "month"
                          ? t("carsUnitPerMonth")
                          : "FCFA"}
                    </SectionUnit>
                  </SectionTitleRow>
                  {band ? (
                    <SectionLink onPress={() => setBand(null)} hitSlop={8}>
                      <SectionLinkLabel>{t("carsClearPark")}</SectionLinkLabel>
                    </SectionLink>
                  ) : null}
                </SectionHead>
                <FilterScroll
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={chipRowStyle}
                >
                  {/* An explicit way back to everything. Re-tapping the
                      active chip also clears it, but that is invisible to
                      anyone who has not tried it. */}
                  <BudgetChip active={!band} onPress={() => setBand(null)}>
                    {!band ? (
                      <BudgetFill
                        colors={[EMERALD, "#0A5C42"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      />
                    ) : null}
                    <BudgetChipLabel active={!band}>
                      {t("carsBudgetAll")}
                    </BudgetChipLabel>
                  </BudgetChip>
                  {bands.map((item, index) => {
                    const active = band === item.key;
                    return (
                      <BudgetChip
                        key={item.key}
                        active={active}
                        onPress={() => setBand(active ? null : item.key)}
                      >
                        {/* The selected pill is filled rather than tinted —
                            a flat block of green among flat outlines was
                            legible but inert. */}
                        {active ? (
                          <BudgetFill
                            colors={[EMERALD, "#0A5C42"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                          />
                        ) : null}
                        {/* A dot that darkens as the tiers climb. This is
                            what is left of the stepped bar chart the cards
                            used to carry: it says the row is an ordered
                            scale rather than a set of unrelated options,
                            and costs no height doing it. */}
                        <BudgetDot
                          active={active}
                          level={(index + 1) / bands.length}
                        />
                        <BudgetChipLabel active={active}>
                          {language === "fr" ? item.labelFr : item.labelEn}
                        </BudgetChipLabel>
                      </BudgetChip>
                    );
                  })}
                </FilterScroll>
                <CountRow>
                  <CountText>
                    {isLoading
                      ? t("carsLoading")
                      : t("carsCount", { count: views.length })}
                  </CountText>
                  {hasFilters ? (
                    <ClearLink onPress={clearFilters} hitSlop={8}>
                      <ClearLabel>{t("realEstateClearFilters")}</ClearLabel>
                    </ClearLink>
                  ) : null}
                </CountRow>
              </>
            ) : null}
          </>
        }
        ListEmptyComponent={
          isSell ? (
            sellBlock
          ) : isLoading ? null : (
            <Empty>
              <EmptyGlyph>🚗</EmptyGlyph>
              <EmptyTitle>{t("carsEmptyTitle")}</EmptyTitle>
              <EmptyCopy>{t("carsEmptyCopy")}</EmptyCopy>
            </Empty>
          )
        }
        ListFooterComponent={bottomBlock}
      />

      {/* The collapsing bar. It carries the two controls that stay useful
          while browsing — the mode switch and the city — plus a way back,
          since the banner's own arrow has scrolled away by the time this
          appears. pointerEvents comes off state rather than the animated
          value: an invisible bar left interactive would swallow every tap
          across the top of the list. */}
      <StickyBar
        topInset={insets.top}
        pointerEvents={stuck ? "auto" : "none"}
        style={{
          opacity: stickyOpacity,
          transform: [{ translateY: stickyShift }],
        }}
      >
        <StickyRow>
          <StickyBack onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </StickyBack>
          <StickyCity onPress={() => setActiveSheet("city")} hitSlop={6}>
            <Ionicons name="location-outline" size={13} color={EMERALD} />
            <StickyCityLabel numberOfLines={1}>
              {city ?? t("carsCityAll")}
            </StickyCityLabel>
          </StickyCity>
        </StickyRow>
        <IntentSwitch
          intent={intent}
          onSelect={selectIntent}
          language={language}
          compact
        />
      </StickyBar>

      <Modal
        visible={helpOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setHelpOpen(false)}
      >
        <SheetBackdrop onPress={() => setHelpOpen(false)}>
          <Sheet
            onStartShouldSetResponder={() => true}
            bottomInset={insets.bottom}
          >
            <SheetHandle />
            <SheetTitle>{t("carsHelpSheetTitle")}</SheetTitle>
            {carHelpOptions.map((item) => (
              <HelpSheetRow
                key={item.key}
                onPress={() => openServiceEntry(item)}
              >
                <HelpSheetIcon urgent={item.urgent}>
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={item.urgent ? "#b3402f" : EMERALD}
                  />
                </HelpSheetIcon>
                <HelpSheetLabel urgent={item.urgent}>
                  {t(`carsService_${item.key}`)}
                </HelpSheetLabel>
                <Ionicons
                  name="chevron-forward"
                  size={15}
                  color={colors.textMuted}
                />
              </HelpSheetRow>
            ))}
            {/* Said before anyone taps: this finds people, it does not send
                them. The only line that summons help is 112. */}
            <HelpDisclaimer>{t("carsHelpDisclaimer")}</HelpDisclaimer>
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={activeSheet === "brand"}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveSheet(null)}
      >
        <SheetBackdrop onPress={() => setActiveSheet(null)}>
          <Sheet
            onStartShouldSetResponder={() => true}
            bottomInset={insets.bottom}
          >
            <SheetHandle />
            <SheetTitle>{t("carsBrandsSheetTitle")}</SheetTitle>
            <SearchBar
              value={sheetSearch}
              onChangeText={setSheetSearch}
              placeholder={t("carsBrandsSearch")}
            />
            {/* The same marks the grid above uses. The sheet was drawing
                monograms while the grid two centimetres away showed real
                logos, so the full list looked like a different, lesser
                catalogue — and a wall of 24 coloured initials is exactly the
                undifferentiated list the badges exist to avoid. */}
            <CityList keyboardShouldPersistTaps="handled">
              {vehicleBrands
                .filter((item) =>
                  sheetSearch.trim()
                    ? item
                        .toLowerCase()
                        .includes(sheetSearch.trim().toLowerCase())
                    : true,
                )
                .map((item) => (
                  <CityRow
                    key={item}
                    onPress={() => {
                      setSheetSearch("");
                      setActiveSheet(null);
                      navigation.navigate("VehicleList", { brand: item });
                    }}
                  >
                    {brandLogo(item) ? (
                      <SheetLogoPlate wide={isWideLogo(item)}>
                        <SheetLogo
                          source={brandLogo(item)}
                          wide={isWideLogo(item)}
                          resizeMode="contain"
                        />
                      </SheetLogoPlate>
                    ) : (
                      <SheetMonogram
                        colors={[vehicleBrandTint(item), "#07362A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <SheetMonogramText>
                          {vehicleMonogram(item)}
                        </SheetMonogramText>
                      </SheetMonogram>
                    )}
                    <CityRowLabel>{item}</CityRowLabel>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color={colors.textMuted}
                    />
                  </CityRow>
                ))}
            </CityList>
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={activeSheet === "city"}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveSheet(null)}
      >
        <SheetBackdrop onPress={() => setActiveSheet(null)}>
          <Sheet
            onStartShouldSetResponder={() => true}
            bottomInset={insets.bottom}
          >
            <SheetHandle />
            <SheetTitle>{t("carsCityTitle")}</SheetTitle>
            <SearchBar
              value={sheetSearch}
              onChangeText={setSheetSearch}
              placeholder={t("searchCityPlaceholder")}
            />
            {/* keyboardShouldPersistTaps: the field above keeps the keyboard
                up, and without this the first tap only dismisses it. */}
            <CityList keyboardShouldPersistTaps="handled">
              <CityRow
                onPress={() => {
                  setCity(null);
                  setSheetSearch("");
                  setActiveSheet(null);
                }}
              >
                <CityRowLabel active={!city}>{t("carsCityAll")}</CityRowLabel>
                {!city ? (
                  <Ionicons name="checkmark" size={16} color={EMERALD} />
                ) : null}
              </CityRow>
              {cities
                .filter((item) =>
                  sheetSearch.trim()
                    ? item
                        .toLowerCase()
                        .includes(sheetSearch.trim().toLowerCase())
                    : true,
                )
                .map((item) => (
                  <CityRow
                    key={item}
                    onPress={() => {
                      setCity(item);
                      setSheetSearch("");
                      setActiveSheet(null);
                    }}
                  >
                    <CityRowLabel active={city === item}>{item}</CityRowLabel>
                    {city === item ? (
                      <Ionicons name="checkmark" size={16} color={EMERALD} />
                    ) : null}
                  </CityRow>
                ))}
            </CityList>
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const chipRowStyle = {
  paddingHorizontal: spacing.md,
  gap: 8,
  paddingBottom: spacing.sm,
};

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// Wraps the banner and the in-flow track so one onLayout measures the exact
// distance the collapsing bar has to wait for.
const HeroMeasure = styled.View``;

// Sits above the list rather than in it: a sticky list header would push the
// rows down, and this needs to float over them.
const StickyBar = styled(Animated.View)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  padding: ${(props) => props.topInset + 6}px ${spacing.md}px 10px;
  background-color: ${(props) => props.theme.surface};
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const StickyRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-bottom: 9px;
`;

const StickyBack = styled(Pressable)`
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
`;

const StickyCity = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.09);
`;

const StickyCityLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${EMERALD};
`;

const Hero = styled(LinearGradient)`
  /* The extra bottom padding is the half of the intent track that overlaps
     the banner — without it the track would sit on top of the stats row. */
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px
    ${HERO_FOOT}px;
  /* Belt and braces for the same iOS behaviour: the glow is hung off the
     corner on purpose, and this keeps the overhang inside the banner. */
  overflow: hidden;
`;

// The gradient axis runs corner to corner — gold at the box's top-right,
// transparent at its bottom-left — so the strong end lands in the banner's
// top-right corner. Only a modest bleed off-screen: hung too far out, the
// whole bright half falls outside the viewport and all that is left on
// screen is the faint tail. The visible part of the circle is only its
// lower-left arc, which sits around 0.75 along that axis — so the fade has
// to reach zero by 0.7, not at the far corner. Ending it at 1.0 left ~10%
// alpha all along that arc, which drew the circle's outline across the
// banner as a hard curve.
const HeroGlow = styled(LinearGradient)`
  position: absolute;
  top: -60px;
  right: -60px;
  width: 320px;
  height: 320px;
  border-radius: 160px;
  /* Required, and iOS-specific in effect: there, border-radius does not
     clip a view's own drawn content, so without this the gradient paints
     as the full 320x320 SQUARE and washes gold across the whole banner.
     Android clips it to the circle either way, which is why it looked
     right on one platform and broken on the other. */
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

const CityPill = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  padding: 7px 13px;
  margin-bottom: 12px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.16);
`;

const CityPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

const CityList = styled.ScrollView`
  max-height: 360px;
  margin-top: ${spacing.sm}px;
`;

const CityRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding-vertical: 12px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SheetMonogram = styled(LinearGradient)`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
`;

// Same aspect-aware plate the grid uses, at row scale: the wordmarks are
// about 7:1 and would render a few pixels tall inside a square.
const SheetLogoPlate = styled.View`
  width: ${(props) => (props.wide ? 54 : 36)}px;
  height: 36px;
  border-radius: 11px;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SheetLogo = styled(Image)`
  width: ${(props) => (props.wide ? 44 : 24)}px;
  height: 24px;
`;

const SheetMonogramText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 0.4px;
  color: #ffffff;
`;

const CityRowLabel = styled.Text`
  flex: 1;
  font-family: ${(props) =>
    props.active ? fontFamily.semiBold : fontFamily.regular};
  font-size: 14px;
  color: ${(props) => (props.active ? EMERALD : props.theme.text)};
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
  color: rgba(255, 255, 255, 0.72);
  max-width: 290px;
`;

// Lifted so it straddles the banner's bottom edge, the way the design has
// it: half on the gradient, half on the page. It needs its own opaque
// surface and a shadow to read as sitting above the banner rather than
// being cut out of it.
const IntentTrack = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  margin: ${(props) => (props.compact ? 0 : -TRACK_OVERLAP)}px
    ${(props) => (props.compact ? 0 : spacing.md)}px
    ${(props) => (props.compact ? 0 : spacing.md)}px;
  border-radius: 18px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const IntentThumb = styled(Animated.View)`
  position: absolute;
  left: 4px;
  top: 4px;
  bottom: 4px;
  border-radius: 14px;
  background-color: ${EMERALD};
  shadow-color: #0b1f16;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.22;
  shadow-radius: 6px;
  elevation: 3;
`;

const IntentTab = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${TAB_GAP}px;
  padding-vertical: ${(props) => (props.compact ? TAB_PAD_V - 3 : TAB_PAD_V)}px;
  border-radius: 14px;
`;

const IntentActiveLayer = styled(Animated.View)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${TAB_GAP}px;
`;

const IntentGlyph = styled.Text`
  font-size: ${(props) => (props.compact ? TAB_GLYPH - 1 : TAB_GLYPH)}px;
`;

const IntentLabel = styled.Text`
  font-family: ${(props) => (props.active ? fontFamily.bold : fontFamily.medium)};
  font-size: ${(props) => (props.compact ? TAB_LABEL - 1 : TAB_LABEL)}px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.textMuted)};
`;

const HeroSearch = styled.View`
  margin-top: ${spacing.md}px;
`;

const FilterScroll = styled.ScrollView`
  flex-grow: 0;
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  padding-horizontal: ${spacing.md}px;
  /* One rhythm for every section eyebrow — À la une, Accès rapide, Marque,
     Budget. What precedes each one differs (a track with its own margin, a
     horizontal scroller with padding), so a shared top margin is what keeps
     the gaps looking equal down the page. */
  margin-top: ${spacing.lg}px;
  margin-bottom: 10px;
`;

const Chip = styled(Pressable)`
  padding: 9px 15px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.active ? props.accent : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? props.accent : props.theme.border)};
`;

const ChipLabel = styled.Text`
  font-family: ${(props) => (props.active ? fontFamily.bold : fontFamily.medium)};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const BrandGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 9px;
  padding-horizontal: ${spacing.md}px;
  padding-bottom: ${spacing.sm}px;
`;

// Three per row rather than four: at a quarter of the width the wordmark
// plates (around 7:1) run to the tile edge and "Volkswagen" truncates.
const BrandTile = styled(Pressable)`
  width: 31.5%;
  align-items: center;
  padding: 12px 6px 13px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const BrandBadge = styled(LinearGradient)`
  width: 46px;
  height: 46px;
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  margin-bottom: 9px;
`;

// Wordmarks are around 7:1; emblems are square. Squeezing both into one
// square plate rendered the wordmarks a few pixels tall. The plate takes its
// shape from the asset instead — see isWideLogo, which reads the real
// dimensions off the bundled file rather than guessing per marque.
const BrandPlate = styled.View`
  width: ${(props) => (props.wide ? 72 : 50)}px;
  height: 50px;
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  margin-bottom: 9px;
  background-color: #ffffff;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const BrandLogo = styled(Image)`
  width: ${(props) => (props.wide ? 58 : 32)}px;
  height: 32px;
`;

const BrandMonogram = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  letter-spacing: 0.6px;
  color: #ffffff;
`;

const BrandTileLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

// Pills, not cards. Five 108px tiles with a stepped bar-chart glyph and a
// repeated "FCFA" underneath took a third of the fold to say what five short
// labels say in one line — and the bars only restated an order the labels
// already carry when they sit in a row.
const BudgetChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  padding: 11px 16px;
  /* A rounded rectangle, not a pill. Directly above this row sit the
     marque tiles at radius 20 and the logo plates at 16 — a lozenge in
     between read as borrowed from the filter chips on other screens
     rather than as part of this one. */
  border-radius: 14px;
  /* overflow hidden so the gradient keeps the pill's shape: on iOS a
     border-radius does not clip drawn content on its own. */
  overflow: hidden;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
  ${(props) => (props.active ? shadow.card : "")}
`;

const BudgetFill = styled(LinearGradient)`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const BudgetDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) =>
    props.active
      ? "rgba(255, 255, 255, 0.9)"
      : `rgba(11, 110, 79, ${0.25 + props.level * 0.6})`};
`;

const BudgetChipLabel = styled.Text`
  font-family: ${(props) =>
    props.active ? fontFamily.bold : fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;

const CountText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const ClearLink = styled(Pressable)``;

const ClearLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${EMERALD};
`;

const Card = styled(Pressable)`
  border-radius: 24px;
  overflow: hidden;
  margin-bottom: ${spacing.md}px;
  margin-horizontal: ${spacing.md}px;
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
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
`;

const Monogram = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 42px;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.16);
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

const ImportFoot = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 7px;
  margin: 0px 14px 14px;
  padding: 10px 12px;
  border-radius: 14px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.3);
`;

const CoverWarn = styled.Text`
  position: absolute;
  top: 12px;
  right: 12px;
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 0.4px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
  color: #ffffff;
  background-color: ${(props) => props.tone ?? "rgba(217, 164, 65, 0.94)"};
`;

const CoverTag = styled.Text`
  position: absolute;
  top: 12px;
  left: 12px;
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #07362a;
  background-color: rgba(255, 255, 255, 0.94);
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
`;

const ImportNoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 16px;
  color: #6b5a2e;
`;

const Empty = styled.View`
  align-items: center;
  padding: ${spacing.xl}px ${spacing.lg}px;
`;

const EmptyGlyph = styled.Text`
  font-size: 34px;
  margin-bottom: ${spacing.sm}px;
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
  max-width: 280px;
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
  margin-top: ${spacing.xs}px;
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;

const StatRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${spacing.lg}px;
`;

const StatCol = styled.View`
  flex: 1;
`;

const StatDivider = styled.View`
  width: 1px;
  height: 32px;
  margin-horizontal: ${spacing.md}px;
  background-color: rgba(255, 255, 255, 0.18);
`;

const StatValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 19px;
  line-height: 24px;
  color: #ffffff;
`;

const StatLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 15px;
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.66);
`;

const FeaturePress = styled(Pressable)`
  margin-right: 10px;
`;

// Fixed height, not content height: a one-line subtitle next to a two-line
// one made neighbouring cards different sizes in the same row. The CTA is
// pushed to the bottom so it lines up across all of them.
const FeatureCard = styled(LinearGradient)`
  width: 250px;
  height: 190px;
  padding: 16px;
  border-radius: 22px;
  /* Clips the corner glow and the oversized watermark below. */
  overflow: hidden;
`;

// The banner's corner-light trick at card scale: a diagonal white fade that
// reaches zero well before the card's own edge, so it reads as light falling
// across the surface rather than a second rectangle sitting on top.
const FeatureGlow = styled(LinearGradient)`
  position: absolute;
  top: -40px;
  right: -50px;
  width: 190px;
  height: 190px;
  border-radius: 95px;
`;

// An oversized glyph bled off the bottom-right corner. A flat colour panel
// reads as a placeholder; something with a subject in it reads as a card.
const FeatureWatermark = styled.View`
  position: absolute;
  right: -26px;
  bottom: -34px;
`;

const FeatureArrow = styled.View`
  width: 24px;
  height: 24px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.2);
`;

const FeatureTag = styled.Text`
  align-self: flex-start;
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  padding: 5px 10px;
  margin-bottom: 12px;
  border-radius: ${radius.pill}px;
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.18);
  overflow: hidden;
`;

const FeatureTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 18.5px;
  line-height: 23px;
  color: #ffffff;
`;

const FeatureSub = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.72);
`;

const FeatureCtaRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
`;

const FeatureCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

// The component is sized for a horizontal rail (280px wide). A lone slot
// wants the full column instead.
const adBannerStyle = { width: "100%", height: 158 };

const AdSlot = styled.View`
  padding-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
`;

const QuickGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 9px;
  padding-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
`;

const QuickTile = styled(Pressable)`
  width: 31.5%;
  align-items: center;
  padding: 16px 6px 14px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

// A soft tinted square with a line glyph in the matching ink. The gradient
// badges this replaced were legible but loud — six saturated blocks in one
// grid is the thing that makes an app look cheap rather than considered.
// Colour still separates the six, just quietly.
const QuickIcon = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  margin-bottom: 9px;
  background-color: ${(props) => props.tint};
`;

const QuickLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const SectionHead = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${spacing.md}px;
  margin-top: ${spacing.lg}px;
  margin-bottom: 10px;
`;

const SectionTitleRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 7px;
`;

const SectionUnit = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionHeadTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const SectionLink = styled(Pressable)``;

// Slate, not emerald. "Tout voir" sat in the same green as the selected
// Acheter pill and the selected budget card, so the eye could not tell a
// chosen state from a way out of the section.
const SectionLinkLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${SUPPORT_INK};
`;

const DealerCard = styled(Pressable)`
  width: 214px;
  border-radius: 18px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const DealerBand = styled(LinearGradient)`
  padding: 14px 14px 12px;
`;

const DealerEmblem = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 19px;
  letter-spacing: 0.4px;
  color: #ffffff;
`;

const DealerGroup = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.75);
`;

const DealerBody = styled.View`
  padding: 12px 14px 14px;
`;

const DealerLogoRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin: 9px 0px 8px;
`;

const DealerLogoPlate = styled.View`
  width: ${(props) => (props.wide ? 42 : 28)}px;
  height: 28px;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const DealerLogo = styled(Image)`
  width: ${(props) => (props.wide ? 34 : 19)}px;
  height: 19px;
`;

const DealerName = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const DealerBrands = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  margin-top: 4px;
  color: ${(props) => props.theme.textMuted};
`;

const DealerTag = styled.Text`
  align-self: flex-start;
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  margin-top: 9px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  color: ${EMERALD};
  background-color: rgba(11, 110, 79, 0.09);
  overflow: hidden;
`;

// The one control on this screen someone might reach for one-handed at the
// roadside, so it is the one thing here allowed to be loud: its own red
// against a screen that is otherwise entirely emerald.
//
// Inset to the same gutter as the grid below it — run to both screen edges
// and it reads as a banner to scroll past rather than the first item in the
// section. The gradient sits in an absolutely-positioned child rather than
// on the Pressable itself, because a Pressable cannot be a LinearGradient
// without losing its press handling.
const HelpButton = styled(Pressable)`
  position: relative;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  padding: 13px 14px;
  margin: 0px ${spacing.md}px ${spacing.md}px;
  border-radius: 18px;
  ${shadow.card}
`;

const HelpFill = styled(LinearGradient)`
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const HelpIcon = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.17);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.25);
`;

const HelpEyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  margin-bottom: 3px;
  color: rgba(255, 255, 255, 0.72);
`;

const HelpChevron = styled.View`
  width: 26px;
  height: 26px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.16);
`;

const HelpCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const HelpTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14.5px;
  letter-spacing: -0.2px;
  color: #ffffff;
`;

const HelpSub = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.82);
`;

const MoreServicesButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  margin-top: ${spacing.sm}px;
  border-radius: 14px;
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.35);
`;

const MoreServicesLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const HelpSheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 14px 4px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const HelpSheetIcon = styled.View`
  width: 36px;
  height: 36px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.urgent ? "rgba(179, 64, 47, 0.12)" : "rgba(11, 110, 79, 0.08)"};
`;

const HelpSheetLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => (props.urgent ? "#b3402f" : props.theme.text)};
`;

const HelpDisclaimer = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  margin-top: ${spacing.md}px;
  color: ${(props) => props.theme.textMuted};
`;

// Three across, not two. Two columns suited six tiles; at twelve it became
// six rows of billboards you had to scroll past rather than a hub you can
// take in at once.
const ServiceGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  padding-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const ServiceTile = styled(Pressable)`
  width: ${(props) => props.width ?? "31.6%"};
  align-items: center;
  padding: 13px 6px 12px;
  border-radius: 16px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const ServiceIcon = styled.View`
  margin-bottom: 8px;
  width: 32px;
  height: 32px;
  border-radius: 11px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  background-color: rgba(11, 110, 79, 0.1);
`;

const ServiceName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  line-height: 15px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const BundleCard = styled.View`
  padding: 16px;
  margin: 0px ${spacing.md}px ${spacing.md}px;
  border-radius: 20px;
  background-color: rgba(11, 110, 79, 0.07);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.18);
`;

const BundleTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const BundleCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  margin-top: 5px;
  color: ${(props) => props.theme.textMuted};
`;

const BundleRow = styled.View`
  flex-direction: row;
  gap: 9px;
  margin-top: 13px;
`;

const BundleCta = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-vertical: 11px;
  border-radius: 14px;
  background-color: ${EMERALD};
`;

const BundleCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

const BundleGhost = styled(Pressable)`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-vertical: 11px;
  border-radius: 14px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const BundleGhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const StockCard = styled(Pressable)`
  padding: 16px;
  margin: ${spacing.md}px ${spacing.md}px 0px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.28);
`;

const StockTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
`;

const StockIcon = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.1);
`;

const StockCol = styled.View`
  flex: 1;
`;

const StockTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const StockCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  margin-top: 4px;
  color: ${(props) => props.theme.textMuted};
`;

const StockCtaRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 13px;
  padding-top: 13px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const StockCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${EMERALD};
`;

const SellCard = styled.View`
  padding: 18px;
  margin-horizontal: ${spacing.md}px;
  border-radius: 22px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const SellTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
  margin-bottom: 7px;
`;

const SellCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 19px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 14px;
`;

const SellFieldRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding-vertical: 9px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const SellFieldLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const SellCta = styled(Pressable)`
  margin-top: 16px;
  padding: 15px;
  border-radius: 18px;
  align-items: center;
  background-color: ${EMERALD};
`;

const SellCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #ffffff;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const Sheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  padding: ${spacing.sm}px ${spacing.md}px
    ${(props) => props.bottomInset + spacing.lg}px;
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.border};
  align-self: center;
  margin-bottom: ${spacing.md}px;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.md}px;
`;
