import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ensureCameraAccess } from "../utils/mediaAccess";
import { useVideoPlayer, VideoView } from "expo-video";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { isLastRowOrphan } from "../utils/gridWidth";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { storage, firestore } from "../config/firebase";
import { categories } from "../data/categories";
import { communityTypes, getCommunityTypeLabel } from "../data/communityTypes";
import {
  babyKinds,
  getBabyDetailKind,
  getBabyKindLabel,
} from "../data/babyKinds";
import {
  getOpeningDayLabel,
  normaliseTime,
  openingDays,
} from "../data/openingDays";
import { getLinkKindLabel, restaurantLinkKinds } from "../data/restaurantLinks";
import {
  getCuisineLabel,
  getPriceBandHint,
  getPriceBandLabel,
  priceBands,
  restaurantCuisines,
} from "../data/restaurantCuisines";
import {
  BATH_COUNTS,
  getAmenityLabel,
  getPropertyTypeLabel,
  getRealEstateDealLabel,
  propertyTypes,
  commercialTypes,
  getCommercialTypeLabel,
  commercialPricePer,
  realEstateHasCapacity,
  amenitiesFor,
  ROOM_COUNTS,
  realEstateDeals,
  realEstateHasDeposit,
  realEstateShowsAmenities,
  realEstateHasAvance,
  landDocuments,
  getLandDocumentLabel,
  getLandDocumentTier,
  listerKinds,
  getListerKindLabel,
  realEstateHasFurnished,
  realEstateHasRooms,
  realEstatePriceSuffixKey,
} from "../data/realEstate";
import {
  dealsForIntent,
  getVehicleBodyTypeLabel,
  getVehicleDeal,
  getVehicleDealLabel,
  getVehicleFuelLabel,
  getVehicleSellerKindLabel,
  getVehicleTransmissionLabel,
  isBeyondImportAge,
  vehicleBodyTypes,
  vehicleBrands,
  vehicleFuels,
  getVehicleColorLabel,
  getVehicleCustomsHint,
  getVehicleCustomsLabel,
  getVehicleDocumentsHint,
  getVehicleDocumentsLabel,
  getVehicleDrivetrainLabel,
  getVehicleFeatureLabel,
  getVehicleHistoryLabel,
  getVehiclePlateLabel,
  VEHICLE_SEAT_OPTIONS,
  vehicleColors,
  vehicleCustoms,
  vehicleDocuments,
  vehicleDrivetrains,
  vehicleFeatures,
  vehicleHistories,
  vehiclePlates,
  vehicleSellerKinds,
  vehicleTransmissions,
} from "../data/vehicles";
import { carParks } from "../data/carParks";
import { modelsForBrand } from "../data/vehicleModels";
import {
  getSportsKindLabel,
  sportsKindNeedsSize,
  sportsKinds,
} from "../data/sportsKinds";
import {
  agricultureKindHasCondition,
  agricultureKinds,
  getAgricultureKindLabel,
  getAgricultureUnitLabel,
  getAgricultureUnitsFor,
} from "../data/agricultureKinds";
import {
  getServiceRateLabel,
  serviceRateNeedsAmount,
  serviceRateTypes,
} from "../data/serviceRateTypes";
import { sectorTint } from "../data/companySectors";
import { getQuartiers } from "../data/quartiers";
import {
  getEquipmentLabel,
  roadsideEquipment,
  roadsideResponseTimes,
} from "../data/roadside";
import {
  formatTyreSize,
  isValidTyreSize,
  parseTyreSize,
  tyreConditions,
  tyreDotYears,
  tyreFittingModes,
  tyreServices,
} from "../data/tyres";
import {
  garageSpecialtiesFor,
  getGarageSpecialtyLabel,
  matchesGarageSpecialty,
  mentionsVehicle,
} from "../data/garageSpecialties";
import {
  batteryCategories,
  batteryFittingModes,
  batteryNeedsCrankingAmps,
  batteryServices,
  batteryTechnologies,
  batteryTerminals,
  batteryWarranties,
  isValidBatteryCapacity,
  isValidCrankingAmps,
} from "../data/batteries";
import { nearestKnownCity } from "../utils/nearestCity";
import { postingTitleKey } from "../data/postingTitles";
import { accountCountry, canPublish } from "../utils/canPublish";
import { POSTING_DIAL } from "../data/countries";
import { electricServices } from "../data/carElectrics";
import { bodyworkServices } from "../data/bodywork";
import {
  driverAvailability,
  driverExperience,
  driverLanguages,
  driverVehicleModes,
  isDriverListing,
  permitCategories,
} from "../data/drivers";
import { guessContentType } from "../utils/uploadContentType";
import {
  experienceLevels,
  getExperienceAccent,
  getExperienceLabel,
  getExperienceTint,
} from "../data/jobExperience";
import { jobCategories } from "../data/jobCategories";
import { cities } from "../data/cities";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "../utils/geo";
import { getListingExpiresAtTimestamp } from "../utils/listingLifecycle";
import { SearchBar } from "../components/SearchBar";
import { ListingCard } from "../components/ListingCard";

const EMERALD = "#0B6E4F";
const FLAG_GREEN = "#008751";
const FLAG_YELLOW = "#FCD116";
const FLAG_RED = "#E8112D";

// Same 3:2 flag chip the account-type and company sign-up screens open
// with. Posting a listing is the other half of that flow, so it should
// look like it belongs to the same app rather than a plain form.
function BeninFlag() {
  return (
    <FlagWrap>
      <FlagGreenBand />
      <FlagRightCol>
        <FlagYellowBand />
        <FlagRedBand />
      </FlagRightCol>
    </FlagWrap>
  );
}
// Two-column grid: an odd count would otherwise leave the last card sitting
// alone beside a gap. Giving it the full row makes the block read as
// finished rather than as a card that failed to load.
function isPickerCardFull(index, total) {
  return isLastRowOrphan(index, total, 2);
}

function getPickerCardWidth(index, total) {
  return isPickerCardFull(index, total) ? "100%" : "47.5%";
}

// The title and description hints are the form's only worked examples, and
// a single generic pair ("ex. iPhone 12…", "Décrivez votre article") was
// actively unhelpful outside electronics — it told someone posting a lost
// dog or a plumbing service to describe their "article".
//
// Explicit maps rather than a key built from the category at runtime:
// t() falls back to the key itself when one is missing, so a typo would
// render "sellTitleHint_vehicles" on screen instead of an example.
// A trade named by whatever sent the seller here, when the category alone is
// too broad to write a useful example. "Services" covers plumbers, hair-
// dressers and mechanics, so its generic hint ("ex. Plombier — dépannage et
// installation") is actively wrong for someone who arrived by tapping "Faire
// figurer mon garage".
const TRADE_HINT_KEYS = {
  garage: "sellTitleHint_garage",
  tyres: "sellTitleHint_tyres",
  battery: "sellTitleHint_battery",
  electric: "sellTitleHint_electric",
  bodywork: "sellTitleHint_bodywork",
  driver: "sellTitleHint_driver",
};

// The car trades that have a screen of their own, offered inside the form
// so they are reachable without walking back out to Voitures. Ordered by how
// often somebody publishes one, not alphabetically.
//
// "tyres" and "battery" are the same trade keys the Pneus and Batterie
// screens pass, deliberately: under Vehicles they mean somebody selling a
// tyre, and under Services the same key means somebody who fits one. The
// examples differ by category rather than by inventing two more keys that
// every downstream test would then have to know about.
const SERVICE_TRADES = [
  { key: "garage", icon: "construct-outline", labelKey: "sellTradeGarage" },
  {
    key: "bodywork",
    icon: "color-fill-outline",
    labelKey: "sellTradeBodywork",
  },
  { key: "driver", icon: "person-outline", labelKey: "sellTradeDriver" },
  { key: "electric", icon: "flash-outline", labelKey: "sellTradeElectric" },
  { key: "tyres", icon: "disc-outline", labelKey: "sellTradeTyres" },
  {
    key: "battery",
    icon: "battery-charging-outline",
    labelKey: "sellTradeBattery",
  },
];

// Under Services these two keys describe a workshop, not a product, so the
// examples cannot be the ones the Pneus and Batterie screens use.
const SERVICE_TRADE_HINT_KEYS = {
  tyres: "sellTitleHint_tyreShop",
  battery: "sellTitleHint_batteryShop",
};

// The trades whose placement is decided by their own words. Each of these
// arrives from a screen that filters by what the listing says, so the seller
// has to be told on the field it applies to — not only on the card that sent
// them here, which they may never read again. Without this an electrician
// landed on the generic Services form and was shown a plumber as the
// example, which is how a specialist form comes to look like the wrong one.
const TRADE_NOTE_KEYS = {
  garage: "sellTitleNote_garage",
  electric: "sellTitleNote_electric",
  bodywork: "sellTitleNote_bodywork",
  tyres: "sellTitleNote_garage",
  battery: "sellTitleNote_garage",
};

// The description example matters as much as the title one: "ce que vous
// faites et votre zone d'intervention" is right for a hairdresser and
// useless to somebody who needs to say they own an OBD reader.
const TRADE_DESC_HINT_KEYS = {
  electric: "sellDescHint_electric",
  bodywork: "sellDescHint_bodywork",
  driver: "sellDescHint_driver",
};

// Vehicles covers "cars, motorbikes, parts", and a part is not a car: asking
// a tyre seller for a gearbox and a number of doors produced listings whose
// every answer was "—". The pick is first because it decides the rest of the
// form.
const PART_TYPES = [
  {
    key: "vehicle",
    icon: "car-sport-outline",
    labelKey: "sellPartTypeVehicle",
    color: "#2F6BB5",
  },
  {
    key: "tyre",
    icon: "disc-outline",
    labelKey: "sellPartTypeTyre",
    color: "#0B6E4F",
  },
  {
    key: "battery",
    icon: "battery-charging-outline",
    labelKey: "sellPartTypeBattery",
    color: "#D9A441",
  },
];

const TITLE_HINT_KEYS = {
  vehicles: "sellTitleHint_vehicles",
  realEstate: "sellTitleHint_realEstate",
  electronics: "sellTitleHint_electronics",
  fashion: "sellTitleHint_fashion",
  homeGarden: "sellTitleHint_homeGarden",
  furniture: "sellTitleHint_furniture",
  babyKids: "sellTitleHint_babyKids",
  sports: "sellTitleHint_sports",
  agriculture: "sellTitleHint_agriculture",
  services: "sellTitleHint_services",
  community: "sellTitleHint_community",
  pharmacyOnDuty: "sellTitleHint_pharmacyOnDuty",
  jobs: "sellFieldTitlePlaceholderJobs",
  restaurants: "sellTitleHint_restaurants",
};

// Only the categories whose description genuinely differs — the goods
// categories all share the default, and inventing five near-identical
// variants of "describe your item" would be noise.
const DESC_HINT_KEYS = {
  jobs: "sellDescHint_jobs",
  services: "sellDescHint_services",
  community: "sellDescHint_community",
  agriculture: "sellDescHint_agriculture",
  pharmacyOnDuty: "sellDescHint_pharmacyOnDuty",
  restaurants: "sellDescHint_restaurants",
};

// Ten, because that is the shot list a vehicle actually needs — front and
// rear three-quarter, both sides, interior front and rear, the dashboard
// with the odometer, engine bay, tyres, and the carte grise. At six a
// seller cannot show the two things buyers here ask for before travelling
// (odometer and papers) and still show the car. The old value was a
// scaffold default with nothing downstream enforcing it: storage.rules
// caps file size, never count.
const MAX_MEDIA_ITEMS = 10;
const MEDIA_TILE_SIZE = 92;
const TOTAL_STEPS = 6;

// Every seller-selectable category except the ONPB-managed on-duty pharmacy
// roster — that data comes exclusively from the verified sync pipeline
// (see chez-nous-pharmacy-sync), and letting an ordinary seller post their
// own "pharmacy on duty" entry would let a fake one sit next to the real,
// safety-critical ones.
const SELLABLE_CATEGORIES = categories.filter(
  (category) => category.key !== "pharmacyOnDuty",
);

// Icon and colour per condition, so État reads as the same kind of choice
// as every other picker in this form rather than four identical grey pills.
// The colours run green → blue → gold → terracotta, which is the order the
// options already had: they degrade, and the ramp says so without needing
// to read the labels.
const CONDITIONS = [
  {
    key: "new",
    labelKey: "conditionNew",
    icon: "sparkles-outline",
    color: "#12876A",
  },
  {
    key: "likeNew",
    labelKey: "conditionLikeNew",
    icon: "ribbon-outline",
    color: "#2F6BB5",
  },
  {
    key: "good",
    labelKey: "conditionGood",
    icon: "thumbs-up-outline",
    color: "#B98A2A",
  },
  {
    key: "fair",
    labelKey: "conditionFair",
    icon: "build-outline",
    color: "#D2603A",
  },
];

// Icon + colour per type so these read as cards you pick between rather
// than four identical text pills — the shape of the work is the first real
// decision in a job post, and it deserves more than a segmented control.
const JOB_TYPES = [
  {
    key: "fullTime",
    labelKey: "jobTypeFullTime",
    icon: "briefcase-outline",
    color: "#12876A",
  },
  {
    key: "partTime",
    labelKey: "jobTypePartTime",
    icon: "time-outline",
    color: "#2F6BB5",
  },
  {
    key: "contract",
    labelKey: "jobTypeContract",
    icon: "document-text-outline",
    color: "#B98A2A",
  },
  {
    key: "gig",
    labelKey: "jobTypeGig",
    icon: "flash-outline",
    color: "#EC8B2B",
  },
];

function VideoTile({ uri }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    // Muted decorative preview — it must never claim the iOS audio session.
    // The default ('auto') still activates one in playback mode, and a held
    // playback session is why voice search failed with `audio-capture` /
    // "Session activation failed": the recogniser could not activate a
    // recording session while these were on screen. A silent thumbnail has
    // no audio to protect, so it mixes.
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });
  return (
    <TileVideo player={player} contentFit="cover" nativeControls={false} />
  );
}

export function CreateListingScreen({ route, navigation }) {
  const { colors } = useTheme();
  const {
    categoryKey: initialCategoryKey,
    isPromoted,
    trade: initialTrade,
    listing: editing,
  } = route.params ?? {};

  // Editing runs the real posting form rather than a second cut-down one.
  //
  // The old Modifier screen could change a title, a price, a phone and a
  // city — nothing else. So a seller who mistyped a tyre size, sold their
  // stock, changed their opening hours or picked the wrong fuel had one
  // option: delete the listing and post it again, losing its age, its views
  // and its place in every saved list. Every field on this form is now
  // editable because it is the same form.
  //
  // Seeds are read from the listing and fall back to the same default a new
  // listing gets, so a field the listing never had simply starts empty.
  const seed = (field, fallback) => {
    if (!editing) return fallback;
    const value = editing[field];
    return value === undefined || value === null ? fallback : value;
  };
  // Numbers are held as strings by the inputs.
  const seedText = (field, fallback = "") => {
    const value = seed(field, null);
    return value === null || value === "" ? fallback : String(value);
  };
  const { t, language } = useI18n();
  const { user, sellerProfile } = useAuth();
  const {
    status: locationStatus,
    coords,
    requestLocation,
  } = useCurrentLocation({ enabled: false });
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const presetCategory =
    categories.find((category) => category.key === initialCategoryKey) ?? null;

  const [title, setTitle] = useState(seedText("titleFr", ""));
  const [price, setPrice] = useState(seedText("price", ""));
  const [phone, setPhone] = useState(seedText("phone", ""));
  const [dutyHours, setDutyHours] = useState(seedText("dutyHours", ""));
  const [description, setDescription] = useState(seedText("descriptionFr", ""));
  const [condition, setCondition] = useState(seed("condition", null));
  const [communityType, setCommunityType] = useState(
    seed("communityType", null),
  );
  const [serviceRateType, setServiceRateType] = useState(
    seed("serviceRateType", null),
  );
  // Roadside declarations. All optional: a hairdresser answers none of them
  // and loses nothing, a recovery truck answers all four and its card on
  // Dépannage can finally say what a stranded person needs to know.
  const [responseTime, setResponseTime] = useState(seed("responseTime", null));
  const [equipment, setEquipment] = useState(seed("equipment", []));
  const [coverageZones, setCoverageZones] = useState(
    seedText("coverageZones", ""),
  );
  const [agricultureKind, setAgricultureKind] = useState(
    seed("agricultureKind", null),
  );
  const [agricultureUnit, setAgricultureUnit] = useState(
    seed("agricultureUnit", null),
  );
  const [sportsKind, setSportsKind] = useState(seed("sportsKind", null));
  const [sportsSize, setSportsSize] = useState(seedText("sportsSize", ""));
  const [babyKind, setBabyKind] = useState(seed("babyKind", null));
  const [babyDetail, setBabyDetail] = useState(seedText("babyDetail", ""));
  const [realEstateDeal, setRealEstateDeal] = useState(
    seed("realEstateDeal", null),
  );
  const [commercialType, setCommercialType] = useState(
    seed("commercialType", null),
  );
  const [vehicleDeal, setVehicleDeal] = useState(seed("vehicleDeal", null));
  // Preset when the seller arrived from a route that already knows — the
  // Vendre tab's "Publier mon véhicule", for instance.
  const [vehiclePurpose, setVehiclePurpose] = useState(
    seed("vehiclePurpose", route.params?.vehiclePurpose ?? null),
  );
  const [brand, setBrand] = useState(seed("brand", null));
  const [model, setModel] = useState(seedText("model", ""));
  // A tyre is not a car, and the vehicle form asks a car's questions —
  // mileage, gearbox, number of doors. Same category (its own description is
  // "cars, motorbikes, parts"), different set of facts.
  // initialTrade, not the `trade` state below it: this runs once at mount,
  // and reading the state variable from here would be a use-before-declare.
  // It is also the right value — the in-form trade picker only appears for
  // Services, so it can never mean to change a part type.
  const [partType, setPartType] = useState(
    editing?.partType ??
      (initialTrade === "tyres"
        ? "tyre"
        : initialTrade === "battery"
          ? "battery"
          : "vehicle"),
  );
  const [batteryCategory, setBatteryCategory] = useState(
    seed("batteryCategory", "car"),
  );
  const [batteryBrand, setBatteryBrand] = useState(
    seedText("batteryBrand", ""),
  );
  const [batteryModel, setBatteryModel] = useState(
    seedText("batteryModel", ""),
  );
  const [batteryAh, setBatteryAh] = useState(seedText("batteryAh", ""));
  const [batteryAmps, setBatteryAmps] = useState(seedText("batteryAmps", ""));
  const [batteryTech, setBatteryTech] = useState(seed("batteryTech", null));
  const [batteryTerminal, setBatteryTerminal] = useState(
    seed("batteryTerminal", null),
  );
  const [batteryWarranty, setBatteryWarranty] = useState(
    seed("batteryWarranty", null),
  );
  const [batteryStock, setBatteryStock] = useState(
    seedText("batteryStock", ""),
  );
  const [batteryFitting, setBatteryFitting] = useState(
    seed("batteryFitting", null),
  );
  const [batteryTradeIn, setBatteryTradeIn] = useState(
    seedText("batteryTradeIn", ""),
  );
  // Declared by a battery professional rather than a battery seller.
  const [batteryServiceKeys, setBatteryServiceKeys] = useState(
    seed("batteryServices", []),
  );
  // Declared by an auto electrician. One vocabulary for cars and bikes,
  // because a listing is written once and whoever rewinds a stator usually
  // also fixes a car alternator.
  const [electricServiceKeys, setElectricServiceKeys] = useState(
    seed("electricServices", []),
  );
  // Declared by a carrossier. "Devis sur photos" sits in this list rather
  // than being assumed of everyone: plenty of body shops will only price a
  // job with the car in front of them, and a Devis button on their card has
  // to mean what it says.
  const [bodyworkServiceKeys, setBodyworkServiceKeys] = useState(
    seed("bodyworkServices", []),
  );
  // Declared by a chauffeur. Every one of these is a fact they hold about
  // themselves — a permit category, who owns the car, which languages they
  // speak — and none of it is verified by the app, which the Chauffeurs
  // screen says out loud rather than implying otherwise here.
  const [driverPermits, setDriverPermits] = useState(seed("driverPermits", []));
  const [driverAvailabilityKeys, setDriverAvailabilityKeys] = useState(
    seed("driverAvailability", []),
  );
  const [driverLanguageKeys, setDriverLanguageKeys] = useState(
    seed("driverLanguages", []),
  );
  const [driverVehicleMode, setDriverVehicleMode] = useState(
    seed("driverVehicleMode", null),
  );
  const [driverExperienceKey, setDriverExperienceKey] = useState(
    seed("driverExperience", null),
  );
  const [tyreBrand, setTyreBrand] = useState(seedText("tyreBrand", ""));
  const [tyreModel, setTyreModel] = useState(seedText("tyreModel", ""));
  const [tyreWidth, setTyreWidth] = useState(seedText("tyreWidth", ""));
  const [tyreRatio, setTyreRatio] = useState(seedText("tyreRatio", ""));
  const [tyreDiameter, setTyreDiameter] = useState(
    seedText("tyreDiameter", ""),
  );
  const [tyreCondition, setTyreCondition] = useState(
    seed("tyreCondition", "new"),
  );
  const [tyreDotYear, setTyreDotYear] = useState(seed("tyreDotYear", null));
  const [tyreTreadMm, setTyreTreadMm] = useState(seedText("tyreTreadMm", ""));
  const [tyreStock, setTyreStock] = useState(seedText("tyreStock", ""));
  const [tyreFitting, setTyreFitting] = useState(seed("tyreFitting", null));

  // Declared by a tyre professional rather than a tyre seller: what they can
  // do to a wheel, which sizes they keep, and which brands they carry.
  const [tyreServiceKeys, setTyreServiceKeys] = useState(
    seed("tyreServices", []),
  );
  const [tyreSizes, setTyreSizes] = useState(seed("tyreSizes", []));
  const [tyreSizeDraft, setTyreSizeDraft] = useState("");
  const [tyreBrands, setTyreBrands] = useState(seedText("tyreBrands", ""));

  const [year, setYear] = useState(seedText("year", ""));
  const [mileage, setMileage] = useState(seedText("mileage", ""));
  const [fuel, setFuel] = useState(seed("fuel", null));
  const [transmission, setTransmission] = useState(seed("transmission", null));
  const [bodyType, setBodyType] = useState(seed("bodyType", null));
  const [sellerKind, setSellerKind] = useState(seed("sellerKind", null));
  const [documents, setDocuments] = useState(seed("documents", null));
  const [carPark, setCarPark] = useState(seed("carPark", null));
  const [color, setColor] = useState(seed("color", null));
  const [drivetrain, setDrivetrain] = useState(seed("drivetrain", null));
  const [seats, setSeats] = useState(seed("seats", null));
  // Bénin-specific and consequential: whether duty is paid decides what the
  // buyer actually hands over.
  const [customs, setCustoms] = useState(seed("customs", null));
  const [plate, setPlate] = useState(seed("plate", null));
  const [history, setHistory] = useState(seed("history", null));
  // Declared equipment, as a set of keys. Absent means "not stated", which is
  // not the same as absent from the car — the browse filters only ever match
  // on what a seller ticked, never on what they left blank.
  const [features, setFeatures] = useState(seed("features", []));
  const [capacity, setCapacity] = useState(seedText("capacity", ""));
  const [propertyType, setPropertyType] = useState(seed("propertyType", null));
  const [surfaceArea, setSurfaceArea] = useState(seedText("surfaceArea", ""));
  const [bedrooms, setBedrooms] = useState(seed("bedrooms", null));
  const [bathrooms, setBathrooms] = useState(seed("bathrooms", null));
  const [isFurnished, setIsFurnished] = useState(seed("isFurnished", false));
  const [depositMonths, setDepositMonths] = useState(
    seedText("depositMonths", ""),
  );
  const [avanceMonths, setAvanceMonths] = useState(
    seedText("avanceMonths", ""),
  );
  const [landDocument, setLandDocument] = useState(seed("landDocument", null));
  const [quartier, setQuartier] = useState(seed("quartier", null));
  const [isLotti, setIsLotti] = useState(seed("isLotti", false));
  const [listerKind, setListerKind] = useState(seed("listerKind", null));
  const [amenities, setAmenities] = useState(seed("amenities", []));
  const [cuisine, setCuisine] = useState(seed("cuisine", null));
  const [area, setArea] = useState(seedText("area", ""));
  const [priceBand, setPriceBand] = useState(seed("priceBand", null));
  const [hasDelivery, setHasDelivery] = useState(seed("hasDelivery", false));
  const [openDays, setOpenDays] = useState(seed("openDays", []));
  const [openTime, setOpenTime] = useState(seedText("openTime", ""));
  const [closeTime, setCloseTime] = useState(seedText("closeTime", ""));
  // One optional field per channel, kept flat rather than nested so a
  // listing document stays queryable.
  const [links, setLinks] = useState(seed("links", {}));
  // Optional, one item per line. The detail screen has always had these
  // three sections but only the sample postings could fill them — a real
  // employer had no field to write them in, so the sections silently
  // vanished on every genuine job.
  const [responsibilities, setResponsibilities] = useState(
    seed("responsibilities", ""),
  );
  const [requirements, setRequirements] = useState(seed("requirements", ""));
  const [jobBenefits, setJobBenefits] = useState(seed("benefits", ""));
  const [negotiable, setNegotiable] = useState(seed("negotiable", false));
  const [company, setCompany] = useState(seedText("company", ""));
  const [jobType, setJobType] = useState(seed("jobType", null));
  const [jobCategory, setJobCategory] = useState(seed("jobCategory", null));
  const [salary, setSalary] = useState(seedText("salary", ""));
  // Replaces a yes/no "no experience" checkbox. A band is what the home
  // feed colours by, and a poster who had only a checkbox could say
  // "experience needed" without ever saying how much.
  const [experienceLevel, setExperienceLevel] = useState(
    seed("experienceLevel", null),
  );
  const [selectedCategory, setSelectedCategory] = useState(
    seed("categoryKey", initialCategoryKey ?? null),
  );
  // Which trade a Services listing is, when nothing navigated here to say.
  //
  // Every specialist door — Garages, Pneus, Batterie, Électricité,
  // Carrosserie — passes a trade, so those sellers get their own examples
  // and their own service picker. Somebody who starts from the dashboard
  // passes nothing, lands on the form written for a plumber, and has no way
  // to say otherwise. This is that way: the same answer, asked here instead
  // of inferred from the route.
  const [trade, setTrade] = useState(initialTrade ?? null);

  const [selectedCity, setSelectedCity] = useState(seed("city", null));
  const [assets, setAssets] = useState(
    editing?.media?.length
      ? editing.media.map((item) => ({
          uri: item.mediaUrl,
          type: item.mediaType === "video" ? "video" : "image",
          published: item,
        }))
      : [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  // Opens on the category when nothing chose one for us.
  //
  // Arriving from the dashboard, the first thing on screen was an empty form
  // with a "Catégorie" row you had to know to tap — so somebody looking for
  // Services concluded the app had none. Every other way in (Garages, Pneus,
  // Carrosserie, the Voitures tiles) already arrives with a category, and
  // those must not be interrupted; nor must editing, where the category is
  // already settled.
  const openedOnCategory = !initialCategoryKey && !editing;
  const [categorySheetOpen, setCategorySheetOpen] = useState(openedOnCategory);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const isPharmacy = selectedCategory === "pharmacyOnDuty";
  const isJobs = selectedCategory === "jobs";
  // Community posts aren't for sale. Without this the form fell through to
  // the generic branch and demanded a price, a photo and a condition.
  const isCommunity = selectedCategory === "community";
  // A service isn't an object: it has no condition, and it's usually priced
  // by the hour or quoted after contact rather than sold for a fixed sum.
  const isServices = selectedCategory === "services";
  // Mixed category: equipment is a second-hand good, produce and livestock
  // are not. What's asked for depends on which.
  const isAgriculture = selectedCategory === "agriculture";
  // Genuinely second-hand goods, so condition and price stay — what was
  // missing is what KIND of gear it is, and the size when that matters.
  const isSports = selectedCategory === "sports";
  // Second-hand goods like sports, so condition and price stay — the gap is
  // the age or size the item is for.
  const isBabyKids = selectedCategory === "babyKids";
  // Renting and selling are different transactions sharing one category —
  // the deal type decides the price unit and which fields apply.
  const isRealEstate = selectedCategory === "realEstate";
  // A restaurant is a place, not an item: it has no price, no condition and
  // nothing to negotiate. What it needs is how to find it and how to reach
  // it, which is closer to the pharmacy branch than to the goods form.
  const isRestaurant = selectedCategory === "restaurants";
  const VEHICLE_PURPOSES = [
    {
      key: "sell",
      labelKey: "sellVehicleDealSale",
      icon: "car-outline",
      color: "#0B6E4F",
    },
    {
      key: "rent",
      labelKey: "sellVehicleDealRental",
      icon: "key-outline",
      color: "#D9A441",
    },
  ];

  const selectVehiclePurpose = (key) => {
    if (key === vehiclePurpose) return;
    setVehiclePurpose(key);
    // The chosen deal belongs to the old purpose, and a rental deal on a
    // sale would price the car per day.
    selectVehicleDeal(null);
  };

  const isVehicle = selectedCategory === "vehicles";
  const isTyreOffer = isVehicle && partType === "tyre";
  const isBatteryOffer = isVehicle && partType === "battery";
  const isPartOffer = isTyreOffer || isBatteryOffer;

  // The tyre questions appear for a service when the seller's own words are
  // about tyres — asked of a hairdresser they would be noise, and guessing
  // from the category alone is not possible because a garage and a tyre
  // fitter are both "Services".
  const mentionsTyres =
    isServices &&
    (trade === "tyres" ||
      matchesGarageSpecialty(`${title} ${description}`, "pneu"));

  // Same rule for batteries: the block appears because the seller's own
  // words are about batteries, not because we guessed from the category.
  const mentionsBattery =
    isServices &&
    (trade === "battery" ||
      matchesGarageSpecialty(`${title} ${description}`, "batt"));

  // And the same rule again for electrics. Both trades count: the workshop
  // with the OBD reader is as often filed under "diagnostic" as under
  // "électricité", and a listing that says either is describing this work.
  const mentionsElectric =
    isServices &&
    (trade === "electric" ||
      matchesGarageSpecialty(`${title} ${description}`, "elec") ||
      matchesGarageSpecialty(`${title} ${description}`, "diag"));

  // The warning that only the words can trigger.
  //
  // Nothing in the app asks a provider to tick "I am a carrossier": the
  // Garages, Pneus, Batterie, Électricité and Carrosserie screens are all
  // built from what the listing itself says. So somebody can write
  // "Je répare les voitures accidentées", publish successfully, and appear
  // on none of them — with no error, because nothing is wrong. This is the
  // one moment we can say so: the listing is plainly about vehicles and
  // still lands in no trade.
  //
  // Deliberately a note and never a block. It is a guess about somebody
  // else's business, and being told your own listing is invalid because a
  // keyword list disagrees would be worse than being under-listed.
  // Publishing is Bénin-only. Read from the account's own number here so the
  // screen can explain itself offline; the database checks the verified claim
  // and is the one that actually decides.
  const blockedFromPosting = Boolean(user) && !canPublish(user);
  const accountCountryName = blockedFromPosting
    ? (accountCountry(user)?.name ??
      (language === "en"
        ? accountCountry(user)?.nameEn
        : accountCountry(user)?.nameFr))
    : null;

  // Dismissing the sheet the form opened itself leaves the form.
  //
  // A Modal draws above the navigator header, so while this sheet is up the
  // back arrow is visible, dimmed and untappable — somebody trying to leave
  // taps it and nothing happens. When the sheet is the first thing on screen
  // it is not a detail of the form, it IS the first step, so backing out of
  // it has to back out of the form. Reopened later by tapping the category
  // row, it is just a picker again and closes to the form as before.
  // The arrow must always move. initial:false fixes the push, but a deep
  // link or a notification can still land this screen with an empty stack,
  // and an arrow that silently does nothing is worse than one that goes
  // somewhere sensible.
  // Back to where they actually came from.
  //
  // This screen lives in the Sell tab, so popping the stack lands on the
  // seller dashboard — correct for the stack, wrong for the person, who
  // tapped "Vous êtes chauffeur ?" on Chauffeurs and expects Chauffeurs
  // back. Every entry point now sends the key of the screen it was on, and
  // navigating to a key returns there from anywhere, however many navigators
  // are in between. Same mechanism the account gate already used.
  const leaveForm = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("MainTabs");
  };

  const dismissCategorySheet = () => {
    setCategorySheetOpen(false);
    if (openedOnCategory && !selectedCategory) leaveForm();
  };

  // Follows the category actually chosen, not the one the route arrived
  // with — picking Services from the sheet used to leave "Vendre un article"
  // above a form about a service.
  const formTitle = editing
    ? t("editFormTitle")
    : t(postingTitleKey(selectedCategory, { isPromoted }));

  const serviceText = `${title} ${description}`;
  const serviceTrades = isServices ? garageSpecialtiesFor(serviceText) : [];
  const unplacedTrade =
    isServices &&
    title.trim().length > 3 &&
    mentionsVehicle(serviceText) &&
    serviceTrades.length === 0;

  // And when it does land somewhere, say where — the same words that can
  // strand a listing are invisible when they work, so the provider never
  // learns which ones did it.
  const placedTradeLabels = serviceTrades
    .map((key) => getGarageSpecialtyLabel(key, language))
    .filter(Boolean)
    .join(" · ");

  // And once more for bodywork.
  const mentionsBodywork =
    isServices &&
    (trade === "bodywork" ||
      matchesGarageSpecialty(`${title} ${description}`, "carro"));

  // And once more for chauffeurs, using the same rule: their own words, or
  // the trade they arrived with.
  const mentionsDriver =
    isServices &&
    (trade === "driver" || isDriverListing(`${title} ${description}`));

  // A chauffeur is not a dépanneur, so the roadside pair is dropped for
  // them — unless their own words say they do both, which some do.
  const showRoadsideFields =
    !mentionsDriver ||
    matchesGarageSpecialty(`${title} ${description}`, "depan");

  const tyreSizeValid = isValidTyreSize(tyreWidth, tyreRatio, tyreDiameter);

  // Same three-boxes-one-number problem as the search on the Pneus screen:
  // each box hands over when it is full, and the last one closes the
  // keyboard rather than leaving it over the rest of the form.
  const tyreWidthRef = useRef(null);
  const tyreRatioRef = useRef(null);
  const tyreDiameterRef = useRef(null);

  // Same rule backwards: an empty box sends the backspace to the box before
  // it, and deletes there, so one press does one visible thing.
  const tyreBackspaceTo = (ref, value, setValue) => (event) => {
    if (event.nativeEvent.key !== "Backspace") return;
    if (value.length > 0) return;
    ref.current?.focus();
    setValue((prev) => prev.slice(0, -1));
  };

  const addTyreSize = () => {
    const parsed = parseTyreSize(tyreSizeDraft);
    if (!parsed) return;
    const formatted = formatTyreSize(
      parsed.width,
      parsed.ratio,
      parsed.diameter,
    );
    setTyreSizes((prev) =>
      prev.includes(formatted) ? prev : [...prev, formatted],
    );
    setTyreSizeDraft("");
  };

  // Who keeps stock on a park. A private owner does not, so the park picker
  // never appears for them.
  const STOCK_SELLER_KINDS = ["carPark", "reseller", "importer"];

  const selectSellerKind = (key) => {
    const next = sellerKind === key ? null : key;
    setSellerKind(next);
    // The park field is hidden for anyone else, and a hidden field that still
    // submits its value is how a private sale ends up filed under Sèkandji.
    if (!STOCK_SELLER_KINDS.includes(next)) setCarPark(null);
  };
  const vehiclePricePerUnit = getVehicleDeal(vehicleDeal)?.pricePer ?? "total";
  const vehiclePriceSuffix = !isVehicle
    ? "FCFA"
    : vehiclePricePerUnit === "day"
      ? t("sellPriceSuffix_perDay")
      : vehiclePricePerUnit === "month"
        ? t("sellPriceSuffix_perMonth")
        : "FCFA";
  const selectedCategoryDef =
    categories.find((category) => category.key === selectedCategory) ?? null;

  // A GPS fix fills the city in ONCE, and only when the seller has not
  // answered the question themselves.
  //
  // It used to run on every change of `coords` with no guard at all, which
  // made the picker unusable: choosing a city, or even just opening the
  // sheet, was undone by the next fix — the list snapped back to whichever
  // city the phone thought was nearest and closed itself. On an inaccurate
  // fix that was Tanguiéta, hundreds of kilometres from anyone who
  // reported it, and there was no way to overrule it.
  //
  // Worse, it did not know it was editing. Reopening an existing listing to
  // fix a typo would quietly move it to wherever the phone happened to be,
  // and the seller would have had no reason to look.
  const autoCityDone = useRef(false);

  useEffect(() => {
    if (!coords) return;
    if (autoCityDone.current) return;
    // Their own answer wins, whether it came from this form or from the
    // listing being edited.
    if (selectedCity) {
      autoCityDone.current = true;
      return;
    }

    // null when the fix is nowhere near any city we know — see the radius
    // in nearestCity.js. No guess is better than a confident wrong one.
    const nearest = nearestKnownCity(coords);
    if (!nearest) return;

    autoCityDone.current = true;
    setSelectedCity(nearest.city);
    // The sheet is not closed here. It is only ever open because somebody
    // opened it, and shutting it under them was how this became impossible
    // to argue with.
  }, [coords, selectedCity]);

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA_ITEMS,
    });
    if (!result.canceled && result.assets?.length) {
      setAssets((prev) =>
        [...prev, ...result.assets].slice(0, MAX_MEDIA_ITEMS),
      );
    }
  };

  const takePhoto = async () => {
    const allowed = await ensureCameraAccess({ t, title: t("sellFormTitle") });
    if (!allowed) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets?.length) {
      setAssets((prev) =>
        [...prev, ...result.assets].slice(0, MAX_MEDIA_ITEMS),
      );
    }
  };

  // Grouped digits echoed back under the field. Not decoration: a car is
  // priced in millions here and a dropped or doubled zero is a million-CFA
  // typo that reads identically in a bare input. Formatted with fr-FR
  // spacing, which is how prices are written in Bénin.
  const priceEcho = (() => {
    const digits = price.replace(/[^0-9]/g, "");
    if (!digits) return null;
    return `${new Intl.NumberFormat("fr-FR").format(Number(digits))} FCFA`;
  })();

  const pickMedia = () => {
    Alert.alert(t("sellFieldMediaLabel"), undefined, [
      { text: t("takePhotoOption"), onPress: takePhoto },
      { text: t("chooseFromLibraryOption"), onPress: pickFromLibrary },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  const removeAsset = (index) => {
    setAssets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (
      !title.trim() ||
      !description.trim() ||
      !selectedCategory ||
      !selectedCity
    ) {
      Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
      return;
    }
    // A job post has nothing to photograph the way a physical item does —
    // a company logo is a nice-to-have, not something to block on.
    if (!assets.length && !isJobs && !isCommunity && !isServices) {
      Alert.alert(t("sellFormTitle"), t("errorMediaRequired"));
      return;
    }

    // A tyre with no size cannot be matched to a car, so it would sit in
    // the Vehicles list being scrolled past forever. Refusing it here is
    // kinder than publishing something that can never be found.
    if (isTyreOffer && !tyreSizeValid) {
      Alert.alert(t("sellFormTitle"), t("errorTyreSize"));
      return;
    }
    if (isBatteryOffer && !isValidBatteryCapacity(batteryAh)) {
      Alert.alert(t("sellFormTitle"), t("errorBatteryCapacity"));
      return;
    }
    if (isBatteryOffer && !isValidCrankingAmps(batteryAmps)) {
      Alert.alert(t("sellFormTitle"), t("errorBatteryAmps"));
      return;
    }
    if (isPartOffer && !phone.trim()) {
      Alert.alert(t("sellFormTitle"), t("errorPhoneRequired"));
      return;
    }

    let numericPrice = 0;
    let numericDutyHours = 0;
    if (isPharmacy) {
      if (!phone.trim()) {
        Alert.alert(t("sellFormTitle"), t("errorPhoneRequired"));
        return;
      }
      numericDutyHours = Number(dutyHours);
      if (
        !dutyHours.trim() ||
        Number.isNaN(numericDutyHours) ||
        numericDutyHours <= 0
      ) {
        Alert.alert(t("sellFormTitle"), t("errorInvalidDutyHours"));
        return;
      }
    } else if (isJobs) {
      if (!company.trim() || !jobType || !jobCategory) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
    } else if (isCommunity) {
      if (!communityType) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
    } else if (isRestaurant) {
      if (!cuisine || !area.trim() || !phone.trim()) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
      // Hours are optional — plenty of places would rather say nothing than
      // commit. But half a pair, or something unreadable as a time, would
      // publish an "Ouvert" badge built on nothing, so that is rejected.
      const hasAnyHours =
        openTime.trim() || closeTime.trim() || openDays.length > 0;
      if (hasAnyHours) {
        if (
          !openDays.length ||
          !normaliseTime(openTime) ||
          !normaliseTime(closeTime)
        ) {
          Alert.alert(t("sellFormTitle"), t("errorOpeningHours"));
          return;
        }
      }
      // No price on a place — the listing carries a band instead.
      numericPrice = 0;
    } else if (isVehicle && !isPartOffer) {
      // A car without a deal, a make or a year cannot be filtered, compared
      // or trusted — those three are the minimum that makes a listing
      // usable. A missing vehicleDeal is worse than incomplete: the browse
      // screen matches on the deals belonging to the current intent, so the
      // listing would be invisible under both Acheter and Louer.
      // Papers decide whether a sale can legally complete, so this is as
      // required as the make: an unanswered carte grise used to publish as
      // a warning badge the seller never chose.
      if (!vehicleDeal || !brand || !String(year).trim() || !documents) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
      numericPrice = Number(price);
      if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
        Alert.alert(t("sellFormTitle"), t("errorInvalidPrice"));
        return;
      }
    } else if (isRealEstate) {
      if (realEstateDeal === "commercial" && !commercialType) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
      if (
        !realEstateDeal ||
        (realEstateHasRooms(realEstateDeal) && !propertyType)
      ) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
      numericPrice = Number(price);
      if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
        Alert.alert(t("sellFormTitle"), t("errorInvalidPrice"));
        return;
      }
    } else if (isBabyKids) {
      if (!babyKind) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
      numericPrice = Number(price);
      if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
        Alert.alert(t("sellFormTitle"), t("errorInvalidPrice"));
        return;
      }
    } else if (isSports) {
      if (!sportsKind) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
      numericPrice = Number(price);
      if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
        Alert.alert(t("sellFormTitle"), t("errorInvalidPrice"));
        return;
      }
    } else if (isAgriculture) {
      if (!agricultureKind || !agricultureUnit) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
      numericPrice = Number(price);
      if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
        Alert.alert(t("sellFormTitle"), t("errorInvalidPrice"));
        return;
      }
    } else if (isServices) {
      if (!serviceRateType) {
        Alert.alert(t("sellFormTitle"), t("errorRequiredFields"));
        return;
      }
      // A trade nobody can reach is not a listing. Restaurants have always
      // required a number; a plumber or a garage needs one for the same
      // reason, and without it their card carries a Contacter button that
      // cannot do anything.
      if (!phone.trim()) {
        Alert.alert(t("sellFormTitle"), t("errorPhoneRequired"));
        return;
      }
      // Hours stay optional — plenty would rather say nothing than commit —
      // but half a pair would publish an "Ouvert" badge built on nothing.
      // Same rule, and the same words, as the restaurant branch above.
      const hasAnyServiceHours =
        openTime.trim() || closeTime.trim() || openDays.length > 0;
      if (hasAnyServiceHours) {
        if (
          !openDays.length ||
          !normaliseTime(openTime) ||
          !normaliseTime(closeTime)
        ) {
          Alert.alert(t("sellFormTitle"), t("errorOpeningHours"));
          return;
        }
      }
      // "Sur devis" is the one rate with no number behind it yet.
      if (serviceRateNeedsAmount(serviceRateType)) {
        numericPrice = Number(price);
        if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
          Alert.alert(t("sellFormTitle"), t("errorInvalidPrice"));
          return;
        }
      }
    } else {
      numericPrice = Number(price);
      if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
        Alert.alert(t("sellFormTitle"), t("errorInvalidPrice"));
        return;
      }
    }

    setIsSubmitting(true);
    setProgress(0);
    try {
      const media = [];
      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i];
        // Already uploaded: carried through untouched, keeping its storage
        // path so nothing is re-uploaded and nothing is orphaned.
        if (asset.published) {
          media.push(asset.published);
          setProgress((i + 1) / assets.length);
          continue;
        }
        const mediaType = asset.type === "video" ? "video" : "image";
        const extension = asset.uri.split(".").pop().split("?")[0];
        const fileName = `${Date.now()}-${i}.${extension}`;
        const mediaPath = `listings/${user.uid}/${fileName}`;

        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const storageRef = ref(storage, mediaPath);
        // storage.rules requires contentType to match image/* or video/*,
        // and a blob built from a file:// URI on React Native carries no
        // type at all — so without this the rule rejects every upload and
        // the seller only ever sees "Upload failed".
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: guessContentType(asset.uri, mediaType),
        });

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) =>
              setProgress(
                (i + snapshot.bytesTransferred / snapshot.totalBytes) /
                  assets.length,
              ),
            reject,
            resolve,
          );
        });

        const mediaUrl = await getDownloadURL(storageRef);
        media.push({ mediaType, mediaUrl, mediaPath });
      }

      const cover = media[0] ?? null;
      const coordsForCity = cityCoordinates[selectedCity] ?? null;

      const data = {
        sellerId: user.uid,
        sellerName: sellerProfile?.fullName ?? "",
        // Denormalized like sellerName — lets ProductDetailScreen and
        // SellerProfileScreen show "member since" for the seller without a
        // separate read of the private sellers/{uid} doc (which is
        // rules-locked to the owner only).
        sellerMemberSince: sellerProfile?.createdAt ?? null,
        // Same reason again: a buyer cannot read sellers/{uid} to fetch the
        // seller's photo, so the listing carries a copy. A seller who
        // changes their picture later keeps the old one on listings already
        // published — the same staleness sellerName has always accepted.
        sellerPhotoUrl: sellerProfile?.photoUrl ?? null,
        // Also denormalized rather than joined live — a company only
        // reaches 'verified' via manual review (see firestore.rules), so
        // this is exactly as trustworthy as reading their profile
        // directly, without a read a buyer's client isn't allowed to make.
        // A listing posted before verification stays stamped false even
        // after the seller later gets verified — same staleness tradeoff
        // sellerName/sellerMemberSince already accept.
        sellerVerified: Boolean(
          sellerProfile?.accountType === "company" &&
          sellerProfile?.verificationStatus === "verified",
        ),
        titleEn: title.trim(),
        titleFr: title.trim(),
        descriptionEn: description.trim(),
        descriptionFr: description.trim(),
        price: numericPrice,
        ...(isPharmacy
          ? {
              phone: phone.trim(),
              dutyUntil: Timestamp.fromMillis(
                Date.now() + numericDutyHours * 60 * 60 * 1000,
              ),
            }
          : isJobs
            ? {
                company: company.trim(),
                jobType,
                jobCategory,
                salary: salary.trim() || null,
                // Mirrors sellerVerified above — only a company that's
                // actually been through manual review gets this badge on
                // its job postings; an individual or a still-pending
                // company always posts unverified.
                verified: Boolean(
                  sellerProfile?.accountType === "company" &&
                  sellerProfile?.verificationStatus === "verified",
                ),
                // Stored under both language keys, like title and
                // description: one author, one language, and the reader's
                // locale picks a key that always resolves.
                responsibilitiesEn: toLines(responsibilities),
                responsibilitiesFr: toLines(responsibilities),
                requirementsEn: toLines(requirements),
                requirementsFr: toLines(requirements),
                benefitsEn: toLines(jobBenefits),
                benefitsFr: toLines(jobBenefits),
                experienceLevel,
                // Kept in sync so the existing "Sans expérience" filters on
                // ForYouScreen and JobsScreen keep working unchanged.
                noExp: experienceLevel === "none",
                expiresAt: getListingExpiresAtTimestamp(
                  Date.now(),
                  sellerProfile,
                ),
              }
            : isRestaurant
              ? // A place, not an item: nothing to grade the condition of,
                // nothing to negotiate, and no date on which it stops
                // existing.
                {}
              : {
                  condition,
                  negotiable: Boolean(negotiable),
                  expiresAt: getListingExpiresAtTimestamp(
                    Date.now(),
                    sellerProfile,
                  ),
                }),
        city: selectedCity,
        latitude: coordsForCity?.latitude ?? null,
        longitude: coordsForCity?.longitude ?? null,
        // Category-specific fields. Each spread is empty unless that
        // category is the one selected, so a listing only ever carries the
        // attributes its own form asked for.
        ...(isCommunity ? { communityType } : {}),
        ...(isServices
          ? {
              serviceRateType,
              // Declared by the provider, never derived. A response window
              // is their own typical, shown as such — not an ETA the app
              // computed from distance and would be blamed for.
              responseTime,
              equipment,
              coverageZones: coverageZones.trim() || null,
            }
          : {}),
        ...(isAgriculture ? { agricultureKind, agricultureUnit } : {}),
        ...(isSports
          ? { sportsKind, sportsSize: sportsSize.trim() || null }
          : {}),
        ...(isBabyKids
          ? { babyKind, babyDetail: babyDetail.trim() || null }
          : {}),
        ...(isRestaurant
          ? {
              cuisine,
              priceBand,
              hasDelivery,
            }
          : {}),
        // How to reach a trade, and when. Restaurants asked for these from
        // the start; services did not, which meant a garage could be listed
        // on the Garages screen with no number to call, no hours, and no
        // WhatsApp — its "Contacter" button could never work and the "Ouvert
        // maintenant" filter could never match. Every service is a business
        // somebody has to reach at a particular time, so the fields belong
        // to both.
        ...(isRestaurant || isServices || isPartOffer
          ? {
              // Where the business actually is. Restaurants were asked from
              // the start; a garage was not, so its listing carried a city
              // and nothing else — and the map on the listing could only
              // point at the middle of that city.
              area: area.trim() || null,
              // Only written when the listing is about tyres; a plumber
              // never sees these fields and never carries an empty array
              // that a filter would later have to second-guess.
              ...(mentionsTyres
                ? {
                    tyreServices: tyreServiceKeys,
                    tyreSizes,
                    tyreBrands: tyreBrands.trim() || null,
                  }
                : {}),
              ...(mentionsBattery
                ? { batteryServices: batteryServiceKeys }
                : {}),
              ...(mentionsElectric
                ? { electricServices: electricServiceKeys }
                : {}),
              ...(mentionsBodywork
                ? { bodyworkServices: bodyworkServiceKeys }
                : {}),
              ...(mentionsDriver
                ? {
                    driverPermits,
                    driverAvailability: driverAvailabilityKeys,
                    driverLanguages: driverLanguageKeys,
                    driverVehicleMode,
                    driverExperience: driverExperienceKey,
                  }
                : {}),
              phone: phone.trim(),
              // Stored normalised so "9h", "9:00" and "09:00" all compare
              // the same way when the directory works out who is open.
              openDays,
              openTime: normaliseTime(openTime),
              closeTime: normaliseTime(closeTime),
              // Stored as typed. Turning "@resto" into a URL happens when
              // something opens it, so nothing is guessed at write time.
              whatsapp: links.whatsapp?.trim() || null,
              website: links.website?.trim() || null,
              facebook: links.facebook?.trim() || null,
              instagram: links.instagram?.trim() || null,
              tiktok: links.tiktok?.trim() || null,
            }
          : {}),
        ...(isRealEstate
          ? {
              realEstateDeal,
              propertyType,
              commercialType,
              // Guests, not square metres: a hall is booked on how many
              // people it seats.
              capacity: Number(capacity) || null,
              surfaceArea: Number(surfaceArea) || null,
              bedrooms,
              bathrooms,
              isFurnished,
              depositMonths: Number(depositMonths) || null,
              // Kept separate from the deposit: together they are what a
              // tenant must actually produce to move in, and the browse
              // screen adds them up.
              avanceMonths: avanceMonths === "" ? null : Number(avanceMonths),
              landDocument,
              listerKind,
              quartier,
              isLotti,
              // Optional, and public when given. Property is the category
              // people actually phone about, but a private landlord's
              // number is personal data — so this is opt-in, and the
              // in-app thread stays the fallback when it is left empty.
              phone: phone.trim() || null,
              amenities,
            }
          : {}),
        ...(isTyreOffer
          ? {
              // What makes the Pneus screen able to match this to a car. A
              // listing without all three numbers is not shown there at
              // all, which is why the form refuses to publish without them.
              partType: "tyre",
              tyreBrand: tyreBrand.trim() || null,
              tyreModel: tyreModel.trim() || null,
              tyreWidth: Number(tyreWidth) || null,
              tyreRatio: Number(tyreRatio) || null,
              tyreDiameter: Number(tyreDiameter) || null,
              tyreCondition,
              // Stamped on the sidewall, so the seller reads it rather than
              // judging it. Only meaningful on a used tyre.
              tyreDotYear: tyreCondition === "used" ? tyreDotYear : null,
              tyreTreadMm:
                tyreCondition === "used" ? Number(tyreTreadMm) || null : null,
              tyreStock: Number(tyreStock) || null,
              tyreFitting,
            }
          : {}),
        ...(isBatteryOffer
          ? {
              // Capacity is the search. Everything else here is what a buyer
              // asks on the phone before driving over: does it fit, is it
              // guaranteed, do you take the old one.
              partType: "battery",
              batteryCategory,
              batteryBrand: batteryBrand.trim() || null,
              batteryModel: batteryModel.trim() || null,
              batteryAh: Number(batteryAh) || null,
              batteryAmps: batteryNeedsCrankingAmps(batteryCategory)
                ? Number(batteryAmps) || null
                : null,
              batteryTech,
              batteryTerminal,
              batteryWarranty,
              batteryStock: Number(batteryStock) || null,
              batteryFitting,
              batteryTradeIn: Number(batteryTradeIn) || null,
            }
          : {}),
        ...(isVehicle && !isPartOffer
          ? {
              vehicleDeal,
              brand,
              model: model.trim() || null,
              year: Number(year) || null,
              mileage: Number(mileage) || null,
              fuel,
              transmission,
              bodyType,
              // Declared by the seller, never verified by the app — the
              // browse card labels it as such.
              sellerKind,
              documents,
              // Kept in sync for anything still reading the old boolean.
              hasDocuments: documents === "yes",
              // Which sales park it stands in, when it stands in one. What
              // makes the parks directory show real vehicles instead of a
              // list of place names.
              carPark,
              color,
              drivetrain,
              seats: Number(seats) || null,
              customs,
              plate,
              history,
              // Stored as a flat array of keys so a query can match one
              // without reading the whole object.
              features,
              phone: phone.trim() || null,
            }
          : {}),
        categoryKey: selectedCategory,
        media,
        mediaType: cover?.mediaType ?? null,
        mediaUrl: cover?.mediaUrl ?? null,
        mediaPath: cover?.mediaPath ?? null,
        isPromoted: !!isPromoted,
        popular: false,
        status: "pending",
        createdAt: serverTimestamp(),
      };

      // Read by the success alert below, which sits outside this branch.
      let backToReview = false;

      if (editing) {
        // What an edit must never rewrite. Identity and provenance belong to
        // the original post; `status` is left alone so correcting a typo
        // does not throw an approved listing back into the queue; and
        // `isPromoted` is dropped because it comes from the route params of
        // whoever opened the form — carrying it in would silently unpromote
        // a paid listing the moment its owner fixed a word.
        const {
          sellerId: _sellerId,
          sellerName: _sellerName,
          sellerMemberSince: _memberSince,
          sellerPhotoUrl: _photo,
          status: _status,
          createdAt: _createdAt,
          isPromoted: _promoted,
          popular: _popular,
          ...editable
        } = data;
        // The price-drop badge, carried over from the old edit screen: a
        // listing that gets cheaper says so on the browse card, and that
        // only works if the previous price is captured at the moment it
        // changes. Losing this would have quietly killed the feature the
        // first time somebody edited a price here.
        // A material edit goes back for review. Fixing a phone number or a
        // closing time does not — sending those to the queue would punish
        // the corrections we want people to make. What counts as material is
        // what a moderator actually looked at: the words, the price, the
        // category, the cover photo and what kind of thing it is.
        const MATERIAL_FIELDS = [
          "titleFr",
          "descriptionFr",
          "price",
          "categoryKey",
          "city",
          "mediaUrl",
          "partType",
        ];
        const changedMaterially = MATERIAL_FIELDS.some(
          (field) => (data[field] ?? null) !== (editing[field] ?? null),
        );
        // Only an approved listing can fall back: one already pending stays
        // pending, and a rejected one is not quietly promoted by an edit.
        backToReview = editing.status === "approved" && changedMaterially;

        const isPriceDrop =
          Number(editing.price) > 0 &&
          data.price > 0 &&
          data.price < editing.price;
        await updateDoc(doc(firestore, "listings", editing.id), {
          ...editable,
          ...(isPriceDrop
            ? {
                previousPrice: editing.price,
                priceDroppedAt: serverTimestamp(),
              }
            : {}),
          ...(backToReview ? { status: "pending" } : {}),
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(firestore, "listings"), data);
      }

      // A verified company's listing is published by the time this alert
      // shows (autoPublishVerifiedCompanyListing), so telling them it's
      // "awaiting review" would be false — and would send them looking for
      // a delay that isn't there.
      const publishesImmediately =
        sellerProfile?.accountType === "company" &&
        sellerProfile?.verificationStatus === "verified";
      // An edit is not a publication: telling a seller their correction is
      // "awaiting review" would send them looking for a delay that is not
      // there, since the edit keeps whatever status the listing already had.
      Alert.alert(
        t(
          editing
            ? backToReview
              ? "editSavedReviewTitle"
              : "editSavedTitle"
            : publishesImmediately
              ? "sellSubmitLiveTitle"
              : "sellSubmitSuccessTitle",
        ),
        t(
          editing
            ? backToReview
              ? "editSavedReviewMessage"
              : "editSavedMessage"
            : publishesImmediately
              ? "sellSubmitLiveMessage"
              : "sellSubmitSuccessMessage",
        ),
        [{ text: t("continue"), onPress: () => navigation.goBack() }],
      );
    } catch (error) {
      Alert.alert(t("sellFormTitle"), t("errorUploadFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const completedFlags = isPharmacy
    ? [
        assets.length > 0,
        title.trim().length > 0,
        !!selectedCategory,
        phone.trim().length > 0 && dutyHours.trim().length > 0,
        true,
        description.trim().length > 0,
      ]
    : isJobs
      ? [
          true, // photo is optional for a job post
          title.trim().length > 0,
          !!selectedCategory,
          company.trim().length > 0 && !!jobType && !!jobCategory,
          true,
          description.trim().length > 0,
        ]
      : isRestaurant
        ? [
            assets.length > 0,
            title.trim().length > 0,
            !!selectedCategory && !!cuisine,
            area.trim().length > 0,
            phone.trim().length > 0,
            description.trim().length > 0,
          ]
        : isRealEstate
          ? [
              assets.length > 0,
              title.trim().length > 0,
              !!selectedCategory && !!realEstateDeal,
              price.trim().length > 0,
              true,
              description.trim().length > 0,
            ]
          : isBabyKids
            ? [
                assets.length > 0,
                title.trim().length > 0,
                !!selectedCategory && !!babyKind,
                price.trim().length > 0,
                true,
                description.trim().length > 0,
              ]
            : isSports
              ? [
                  assets.length > 0,
                  title.trim().length > 0,
                  !!selectedCategory && !!sportsKind,
                  price.trim().length > 0,
                  true,
                  description.trim().length > 0,
                ]
              : isAgriculture
                ? [
                    assets.length > 0,
                    title.trim().length > 0,
                    !!selectedCategory,
                    !!agricultureKind &&
                      !!agricultureUnit &&
                      price.trim().length > 0,
                    true,
                    description.trim().length > 0,
                  ]
                : isServices
                  ? [
                      true, // a service often has nothing to photograph
                      title.trim().length > 0,
                      !!selectedCategory,
                      !!serviceRateType &&
                        (!serviceRateNeedsAmount(serviceRateType) ||
                          price.trim().length > 0),
                      true,
                      description.trim().length > 0,
                    ]
                  : isCommunity
                    ? [
                        true, // a notice or a request often has nothing to photograph
                        title.trim().length > 0,
                        !!selectedCategory,
                        !!communityType,
                        true,
                        description.trim().length > 0,
                      ]
                    : [
                        assets.length > 0,
                        title.trim().length > 0,
                        !!selectedCategory,
                        price.trim().length > 0,
                        true,
                        description.trim().length > 0,
                      ];
  const completedCount = completedFlags.filter(Boolean).length;

  // A unit that isn't offered by the newly chosen kind has to go — leaving
  // "par tête" selected after switching from livestock to seeds would
  // publish a listing priced in a unit the form no longer even shows.
  // Switching to a kind that doesn't use size drops whatever was typed —
  // a bike listing shouldn't carry a leftover shoe size.
  // A kind with no detail field drops whatever was typed — a cot shouldn't
  // carry a leftover clothing size.
  // Changing the deal clears anything the new deal doesn't ask for —
  // otherwise a plot of land could publish carrying "3 chambres, meublé"
  // from a rental the seller started filling in first.
  const selectVehicleDeal = (key) => {
    const next = vehicleDeal === key ? null : key;
    setVehicleDeal(next);
    // Mileage belongs to a used car; a new one or a rental has none to state.
    if (!getVehicleDeal(next)?.hasMileage) setMileage("");
  };

  const selectCommercialType = (key) => {
    const next = commercialType === key ? null : key;
    setCommercialType(next);
    // A hall is booked by the day: no months in advance, and the guest
    // count only applies the other way round.
    if (!realEstateHasAvance("commercial", next)) setAvanceMonths("");
    if (!realEstateHasDeposit("commercial", next)) setDepositMonths("");
    if (!realEstateHasCapacity("commercial", next)) setCapacity("");
  };

  const selectRealEstateDeal = (key) => {
    const next = realEstateDeal === key ? null : key;
    setRealEstateDeal(next);
    if (!realEstateHasRooms(next)) {
      setPropertyType(null);
      setBedrooms(null);
      setBathrooms(null);
      setAmenities([]);
    }
    if (!realEstateHasFurnished(next)) setIsFurnished(false);
    if (!realEstateHasDeposit(next)) setDepositMonths("");
    if (next !== "commercial") {
      setCommercialType(null);
      setCapacity("");
    }
    // Avance depends on the subtype too, so it is settled when that is
    // chosen rather than here.
    if (!realEstateHasAvance(next, null) && next !== "commercial")
      setAvanceMonths("");
    // Paperwork is a land question; carrying a stale answer onto a flat
    // would publish a claim the poster never made for it.
    if (next !== "land") setLandDocument(null);
    // Subdivision is a land question; a flat has no lotissement status.
    if (next !== "land") setIsLotti(false);
  };

  // Blank lines dropped so a stray return doesn't publish an empty bullet.
  const toLines = (value) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const toggleOpenDay = (key) => {
    setOpenDays((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const toggleAmenity = (key) => {
    setAmenities((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const selectBabyKind = (key) => {
    const next = babyKind === key ? null : key;
    setBabyKind(next);
    if (!getBabyDetailKind(next)) setBabyDetail("");
  };

  const selectSportsKind = (key) => {
    const next = sportsKind === key ? null : key;
    setSportsKind(next);
    if (!sportsKindNeedsSize(next)) setSportsSize("");
  };

  const selectAgricultureKind = (key) => {
    const next = agricultureKind === key ? null : key;
    setAgricultureKind(next);
    const allowed = getAgricultureUnitsFor(next).map((unit) => unit.key);
    if (!allowed.includes(agricultureUnit)) setAgricultureUnit(null);
    if (!agricultureKindHasCondition(next)) setCondition(null);
  };

  const filteredCities = cities.filter((city) =>
    city.toLowerCase().includes(citySearch.trim().toLowerCase()),
  );

  // Local asset URIs render fine in <Image>/<VideoView> as-is, so the
  // preview reuses the exact same ListingCard buyers will eventually see —
  // no need to upload anything just to look at it.
  const previewCover = assets[0];
  const previewListing = {
    id: "preview",
    sellerId: user?.uid,
    sellerName: sellerProfile?.fullName ?? "",
    sellerPhotoUrl: sellerProfile?.photoUrl ?? null,
    titleEn: title.trim(),
    titleFr: title.trim(),
    price:
      isPharmacy || isJobs || isCommunity || isRestaurant
        ? 0
        : Number(price) || 0,
    city: selectedCity,
    categoryKey: selectedCategory,
    // Carried so the preview shows the right price unit — without it a
    // rental previews as a flat total, which is not what will publish.
    realEstateDeal: isRealEstate ? realEstateDeal : null,
    commercialType: isRealEstate ? commercialType : null,
    vehicleDeal: isVehicle ? vehicleDeal : null,
    brand: isVehicle ? brand : null,
    model: isVehicle ? model.trim() || null : null,
    year: isVehicle ? Number(year) || null : null,
    mileage: isVehicle ? Number(mileage) || null : null,
    sellerKind: isVehicle ? sellerKind : null,
    documents: isVehicle ? documents : null,
    hasDocuments: isVehicle ? documents === "yes" : false,
    capacity: isRealEstate ? Number(capacity) || null : null,
    media: assets.map((asset) => ({
      mediaType: asset.type === "video" ? "video" : "image",
      mediaUrl: asset.uri,
    })),
    mediaType: previewCover?.type === "video" ? "video" : "image",
    mediaUrl: previewCover?.uri,
    isPromoted: !!isPromoted,
    popular: false,
    saleStatus: "available",
    createdAt: null,
  };
  const previewCardWidth = windowWidth - spacing.md * 2;

  // Every way into this form — the Vendre tab, the dashboard, and the eight
  // "publish your workshop" cards on the trade screens — arrives here, so the
  // rule is stated once, at the only place all of them pass through.
  //
  // It is stated instead of hidden. Buttons that quietly do nothing teach
  // people the app is broken; a sentence explaining that publishing needs a
  // Bénin number lets somebody decide what to do about it. Editing an
  // existing listing is untouched, which is why this guards creation only.
  if (!editing && blockedFromPosting) {
    return (
      <Container edges={["top", "left", "right", "bottom"]}>
        <HeaderRow>
          <BackButton onPress={leaveForm} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </BackButton>
          <HeaderTitle numberOfLines={1}>{formTitle}</HeaderTitle>
        </HeaderRow>

        <BlockedWrap>
          <BlockedIcon>
            <Ionicons name="globe-outline" size={26} color={colors.primary} />
          </BlockedIcon>
          <BlockedTitle>{t("postingCountryTitle")}</BlockedTitle>
          <BlockedCopy>
            {t("postingCountryCopy", { dial: POSTING_DIAL })}
          </BlockedCopy>
          {accountCountryName ? (
            <BlockedAccount>
              {t("postingCountryYourNumber", { country: accountCountryName })}
            </BlockedAccount>
          ) : null}

          {/* What they can still do, said plainly — this is most of the app,
              and somebody told only what is forbidden assumes the rest is
              too. */}
          <BlockedList>
            {[
              "postingCountryCanBrowse",
              "postingCountryCanContact",
              "postingCountryCanSave",
            ].map((key) => (
              <BlockedListRow key={key}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.primary}
                />
                <BlockedListText>{t(key)}</BlockedListText>
              </BlockedListRow>
            ))}
          </BlockedList>

          <BlockedButton onPress={() => navigation.goBack()}>
            <BlockedButtonLabel>{t("postingCountryBrowse")}</BlockedButtonLabel>
          </BlockedButton>
        </BlockedWrap>
      </Container>
    );
  }

  return (
    <Flex behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Container edges={["top", "left", "right", "bottom"]}>
        <HeaderRow>
          <BackButton onPress={leaveForm} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </BackButton>
          <HeaderTitle numberOfLines={1}>{formTitle}</HeaderTitle>
          <DraftLabel>{t("sellDraftLabel")}</DraftLabel>
        </HeaderRow>

        <ProgressWrap>
          <ProgressTrack>
            <ProgressFill
              colors={[FLAG_GREEN, FLAG_YELLOW, FLAG_RED]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: `${(completedCount / TOTAL_STEPS) * 100}%` }}
            />
          </ProgressTrack>
          <ProgressLabel>
            {t("sellStepsCompleted", {
              count: completedCount,
              total: TOTAL_STEPS,
            })}
          </ProgressLabel>
        </ProgressWrap>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          <FlagEyebrowRow>
            <BeninFlag />
            <FlagEyebrowLabel>{t("sellFormEyebrow")}</FlagEyebrowLabel>
          </FlagEyebrowRow>
          <FormHeadline>
            {t(
              isJobs
                ? "sellFormHeadlineJobs"
                : isCommunity
                  ? "sellFormHeadlineCommunity"
                  : isServices
                    ? "sellFormHeadlineServices"
                    : "sellFormHeadline",
            )}
          </FormHeadline>
          <FormCopy>
            {t(
              isJobs
                ? "sellFormCopyJobs"
                : isCommunity
                  ? "sellFormCopyCommunity"
                  : isServices
                    ? "sellFormCopyServices"
                    : isAgriculture
                      ? "sellFormCopyAgriculture"
                      : isSports
                        ? "sellFormCopySports"
                        : isBabyKids
                          ? "sellFormCopyBaby"
                          : isRealEstate
                            ? "sellFormCopyRealEstate"
                            : isRestaurant
                              ? "sellFormCopyRestaurant"
                              : "sellFormCopy",
            )}
          </FormCopy>

          {isPromoted ? (
            <PromotedBanner>
              <Ionicons
                name="megaphone-outline"
                size={16}
                color={colors.accentDark}
              />
              <PromotedBannerLabel>
                {t("promotedFormBanner")}
              </PromotedBannerLabel>
            </PromotedBanner>
          ) : null}

          <Label>{t("sellFieldMediaLabel")}</Label>
          {/* Browse cards frame the first photo at 4:3 and crop the rest.
              A landscape shot from a phone camera is already 4:3, so a car
              framed this way is never cut — which is the whole reason the
              hint exists here rather than a warning appearing later. */}
          {isVehicle ? (
            <FramingHint>
              <Ionicons
                name="phone-landscape-outline"
                size={16}
                color={EMERALD}
              />
              <FramingHintText>
                {/* On a used tyre the sidewall photo IS the evidence: the
                    DOT code and any bulge are what a buyer is told to check,
                    and neither is visible in a photo of the tread. */}
                {isBatteryOffer
                  ? t("sellMediaFramingBattery")
                  : isTyreOffer
                    ? t(
                        tyreCondition === "used"
                          ? "sellMediaFramingTyreUsed"
                          : "sellMediaFramingTyre",
                      )
                    : t("sellMediaFramingCars")}
              </FramingHintText>
            </FramingHint>
          ) : null}
          {assets.length === 0 ? (
            <>
              <MediaEmpty onPress={pickMedia}>
                <Ionicons
                  name="cloud-upload-outline"
                  size={26}
                  color={EMERALD}
                />
                <MediaEmptyText>{t("sellPickMediaButton")}</MediaEmptyText>
                <MediaHintText>
                  {isJobs
                    ? t("sellMediaHintJobs")
                    : isCommunity || isServices
                      ? t("sellMediaHintOptional")
                      : t("sellMediaHint", { max: MAX_MEDIA_ITEMS })}
                </MediaHintText>
              </MediaEmpty>
              <MediaTipText>{t("sellMediaTip")}</MediaTipText>
            </>
          ) : (
            <>
              <MediaRow horizontal showsHorizontalScrollIndicator={false}>
                {assets.map((asset, index) => (
                  <MediaTile key={`${asset.uri}-${index}`}>
                    {asset.type === "video" ? (
                      <VideoTile uri={asset.uri} />
                    ) : (
                      <TileImage
                        source={{ uri: asset.uri }}
                        resizeMode="contain"
                      />
                    )}
                    {index === 0 ? (
                      <PrimaryBadge>
                        <PrimaryBadgeLabel>
                          {t("sellPrimaryBadge")}
                        </PrimaryBadgeLabel>
                      </PrimaryBadge>
                    ) : null}
                    <RemoveTileButton
                      onPress={() => removeAsset(index)}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={12} color="#ffffff" />
                    </RemoveTileButton>
                  </MediaTile>
                ))}
                {assets.length < MAX_MEDIA_ITEMS ? (
                  <AddMoreTile onPress={pickMedia}>
                    <Ionicons name="add" size={24} color={EMERALD} />
                  </AddMoreTile>
                ) : null}
              </MediaRow>
              <MediaHintText>
                {t("sellMediaHint", { max: MAX_MEDIA_ITEMS })}
              </MediaHintText>
            </>
          )}

          <Label>{t("sellFieldTitle")}</Label>
          <InputRow>
            <Ionicons
              name="pricetag-outline"
              size={20}
              color={colors.textMuted}
            />
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder={t(
                (isServices ? SERVICE_TRADE_HINT_KEYS[trade] : null) ??
                  TRADE_HINT_KEYS[trade] ??
                  TITLE_HINT_KEYS[selectedCategory] ??
                  "sellFieldTitlePlaceholder",
              )}
              placeholderTextColor={colors.textMuted}
            />
          </InputRow>
          {/* The one thing a garage cannot guess: the Garages screen places
              a provider by the trades their own words name, so "Réparation
              toutes marques" lists them nowhere in particular. Said here,
              on the field it applies to, rather than only on the card that
              sent them — which they may never have seen. */}
          {TRADE_NOTE_KEYS[trade] ? (
            <FieldNote>{t(TRADE_NOTE_KEYS[trade])}</FieldNote>
          ) : null}

          {unplacedTrade ? (
            <TradeWarning>
              <Ionicons name="alert-circle-outline" size={15} color="#8a6415" />
              <TradeWarningText>{t("sellTradeUnplaced")}</TradeWarningText>
            </TradeWarning>
          ) : null}

          {placedTradeLabels ? (
            <TradePlaced>
              <Ionicons
                name="checkmark-circle-outline"
                size={15}
                color={colors.primary}
              />
              <TradePlacedText>
                {t("sellTradePlaced", { trades: placedTradeLabels })}
              </TradePlacedText>
            </TradePlaced>
          ) : null}

          <Label>{t("sellFieldCategory")}</Label>
          {presetCategory ? (
            <PresetCategoryPill>
              <Ionicons
                name={presetCategory.icon}
                size={16}
                color={colors.primaryDark}
              />
              <PresetCategoryLabel>
                {t("postingInCategoryLabel", {
                  category:
                    language === "en"
                      ? presetCategory.labelEn
                      : presetCategory.labelFr,
                })}
              </PresetCategoryLabel>
            </PresetCategoryPill>
          ) : (
            <SelectorRow onPress={() => setCategorySheetOpen(true)}>
              {/* The chosen category keeps its chip on the closed field, so
                  the choice stays recognisable instead of collapsing into
                  plain text the moment the sheet shuts. */}
              {selectedCategoryDef ? (
                <CategoryIconWrap
                  small
                  tint={sectorTint(selectedCategoryDef.color, 0.12)}
                >
                  <Ionicons
                    name={selectedCategoryDef.icon}
                    size={17}
                    color={selectedCategoryDef.color}
                  />
                </CategoryIconWrap>
              ) : (
                <Ionicons
                  name="apps-outline"
                  size={17}
                  color={colors.textMuted}
                />
              )}
              <SelectorText muted={!selectedCategoryDef}>
                {selectedCategoryDef
                  ? language === "en"
                    ? selectedCategoryDef.labelEn
                    : selectedCategoryDef.labelFr
                  : t("sellFieldCategoryPlaceholder")}
              </SelectorText>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
              />
            </SelectorRow>
          )}

          {/* Services covers plumbers, hairdressers and mechanics alike, so
              the category alone cannot choose an example or a service list.
              Optional on purpose: most services are not car trades, and
              "Autre" is a real answer rather than a way out of the
              question. */}
          {isServices ? (
            <>
              <Label>{t("sellFieldTrade")}</Label>
              <FieldNote>{t("sellFieldTradeHint")}</FieldNote>
              <ChipWrapRow>
                {SERVICE_TRADES.map((option) => {
                  const active = trade === option.key;
                  return (
                    <TradeChip
                      key={option.key}
                      selected={active}
                      onPress={() => setTrade(active ? null : option.key)}
                    >
                      <Ionicons
                        name={option.icon}
                        size={14}
                        color={active ? "#ffffff" : colors.primary}
                      />
                      <TradeChipLabel selected={active}>
                        {t(option.labelKey)}
                      </TradeChipLabel>
                    </TradeChip>
                  );
                })}
                <TradeChip selected={!trade} onPress={() => setTrade(null)}>
                  <TradeChipLabel selected={!trade}>
                    {t("sellTradeOther")}
                  </TradeChipLabel>
                </TradeChip>
              </ChipWrapRow>
            </>
          ) : null}

          {isVehicle ? (
            <>
              <Label>{t("sellFieldPartType")}</Label>
              <PickerGrid>
                {PART_TYPES.map((option, index, list) => {
                  const active = partType === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, list.length)}
                      full={isPickerCardFull(index, list.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() => setPartType(option.key)}
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, list.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {t(option.labelKey)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>
            </>
          ) : null}

          {isRestaurant ? (
            <>
              <Label>{t("sellFieldCuisine")}</Label>
              <PickerGrid>
                {/* "Tous" is a browsing filter, not something you can be —
                    so the picker offers only real cuisines. */}
                {restaurantCuisines
                  .filter((option) => option.key !== "all")
                  .map((option, index, list) => {
                    const active = cuisine === option.key;
                    return (
                      <PickerCard
                        key={option.key}
                        width={getPickerCardWidth(index, list.length)}
                        full={isPickerCardFull(index, list.length)}
                        selected={active}
                        accent={option.color}
                        tint={sectorTint(option.color, 0.09)}
                        onPress={() => setCuisine(active ? null : option.key)}
                      >
                        <CategoryIconWrap
                          small
                          tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                        >
                          <Ionicons
                            name={option.icon}
                            size={17}
                            color={option.color}
                          />
                        </CategoryIconWrap>
                        <PickerCardLabel
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          numberOfLines={2}
                        >
                          {getCuisineLabel(option.key, language)}
                        </PickerCardLabel>
                      </PickerCard>
                    );
                  })}
              </PickerGrid>

              {/* A band, not a menu price: prices change and a stale figure
                  is worse than an honest range. */}
              <Label>{t("sellFieldPriceBand")}</Label>
              <FieldNote>{t("sellPriceBandHint")}</FieldNote>
              {/* Full-width rows rather than pills. Three pills reading
                  ₣ / ₣₣ / ₣₣₣ told the owner nothing about what each one
                  commits them to; a row has space for the name AND the
                  amount it stands for. */}
              {priceBands.map((band) => {
                const active = priceBand === band.key;
                return (
                  <BandRow
                    key={band.key}
                    selected={active}
                    onPress={() => setPriceBand(active ? null : band.key)}
                  >
                    <BandSymbol selected={active}>{band.symbol}</BandSymbol>
                    <BandTextCol>
                      <BandName selected={active}>
                        {getPriceBandLabel(band.key, language)}
                      </BandName>
                      <BandHint>
                        {getPriceBandHint(band.key, language)}
                      </BandHint>
                    </BandTextCol>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={19}
                        color={EMERALD}
                      />
                    ) : null}
                  </BandRow>
                );
              })}

              <NegotiableRow onPress={() => setHasDelivery((prev) => !prev)}>
                <Checkbox checked={hasDelivery}>
                  {hasDelivery ? (
                    <Ionicons name="checkmark" size={13} color="#ffffff" />
                  ) : null}
                </Checkbox>
                <NegotiableLabel>{t("sellFieldHasDelivery")}</NegotiableLabel>
              </NegotiableRow>
            </>
          ) : null}

          {/* Hours, links and a phone number: asked of restaurants, of
              services, and of anyone selling tyres. A plumber or a garage is
              a business somebody has to reach, and asking a restaurant for
              its number while leaving a mechanic without one was an accident
              of the form growing restaurant-first. A tyre seller belongs
              here for the same reason: the Pneus card's first button is
              "Appeler", and a listing with no number cannot answer it. */}
          {isRestaurant || isServices || isPartOffer ? (
            <>
              {/* Asked of services too now. Without it a garage's listing
                  knew only its city, so the map could point nowhere better
                  than the middle of Cotonou. */}
              <Label>{t("sellFieldArea")}</Label>
              <InputRow>
                <Ionicons
                  name="navigate-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <Input
                  value={area}
                  onChangeText={setArea}
                  placeholder={t("sellFieldAreaPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                />
              </InputRow>
              <FieldNote>{t("sellAreaHint")}</FieldNote>

              <Label>{t("sellFieldOpenDays")}</Label>
              {/* One even row of seven rather than wrapped pills: the week
                  is a fixed set that reads left to right, and three days
                  spilling onto a second line broke that shape. */}
              <DayRow>
                {openingDays.map((day) => {
                  const active = openDays.includes(day.key);
                  return (
                    <DayChip
                      key={day.key}
                      selected={active}
                      onPress={() => toggleOpenDay(day.key)}
                    >
                      <DayChipLabel selected={active}>
                        {getOpeningDayLabel(day.key, language)}
                      </DayChipLabel>
                    </DayChip>
                  );
                })}
              </DayRow>

              <Label>{t("sellFieldOpenHours")}</Label>
              <HoursRow>
                <HoursField>
                  <Ionicons
                    name="sunny-outline"
                    size={18}
                    color={colors.textMuted}
                  />
                  <Input
                    value={openTime}
                    onChangeText={setOpenTime}
                    placeholder={t("sellFieldOpenTimePlaceholder")}
                    placeholderTextColor={colors.textMuted}
                  />
                </HoursField>
                <HoursSeparator>—</HoursSeparator>
                <HoursField>
                  <Ionicons
                    name="moon-outline"
                    size={18}
                    color={colors.textMuted}
                  />
                  <Input
                    value={closeTime}
                    onChangeText={setCloseTime}
                    placeholder={t("sellFieldCloseTimePlaceholder")}
                    placeholderTextColor={colors.textMuted}
                  />
                </HoursField>
              </HoursRow>
              <FieldNote>{t("sellOpenHoursHint")}</FieldNote>

              <Label>{t("sellFieldLinks")}</Label>
              <FieldNote>{t("sellLinksHint")}</FieldNote>
              {restaurantLinkKinds.map((kind) => (
                <LinkRow key={kind.key}>
                  <LinkIconWrap tint={sectorTint(kind.color, 0.13)}>
                    <Ionicons name={kind.icon} size={18} color={kind.color} />
                  </LinkIconWrap>
                  <LinkFieldCol>
                    <LinkFieldLabel>
                      {getLinkKindLabel(kind.key, language)}
                    </LinkFieldLabel>
                    <Input
                      value={links[kind.key] ?? ""}
                      onChangeText={(value) =>
                        setLinks((prev) => ({ ...prev, [kind.key]: value }))
                      }
                      placeholder={kind.placeholder}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </LinkFieldCol>
                </LinkRow>
              ))}

              <Label>{t("sellFieldPhone")}</Label>
              <InputRow>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <Input
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t("sellFieldPhonePlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                />
              </InputRow>
            </>
          ) : null}

          {isRealEstate ? (
            <>
              <Label>{t("sellFieldRealEstateDeal")}</Label>
              <PickerGrid>
                {realEstateDeals.map((option, index) => {
                  const active = realEstateDeal === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, realEstateDeals.length)}
                      full={isPickerCardFull(index, realEstateDeals.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() => selectRealEstateDeal(option.key)}
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, realEstateDeals.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {getRealEstateDealLabel(option.key, language)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>

              {realEstateDeal ? (
                <>
                  {/* Land is its own property type, so the picker is skipped
                      rather than offered with nothing sensible to choose. */}
                  {realEstateHasRooms(realEstateDeal) ? (
                    <>
                      <Label>{t("sellFieldPropertyType")}</Label>
                      <PickerGrid>
                        {propertyTypes.map((option, index) => {
                          const active = propertyType === option.key;
                          return (
                            <PickerCard
                              key={option.key}
                              width={getPickerCardWidth(
                                index,
                                propertyTypes.length,
                              )}
                              full={isPickerCardFull(
                                index,
                                propertyTypes.length,
                              )}
                              selected={active}
                              accent={EMERALD}
                              tint={sectorTint(EMERALD, 0.09)}
                              onPress={() =>
                                setPropertyType(active ? null : option.key)
                              }
                            >
                              <CategoryIconWrap
                                small
                                tint={sectorTint(EMERALD, active ? 0.22 : 0.12)}
                              >
                                <Ionicons
                                  name={option.icon}
                                  size={17}
                                  color={EMERALD}
                                />
                              </CategoryIconWrap>
                              <PickerCardLabel
                                full={isPickerCardFull(
                                  index,
                                  propertyTypes.length,
                                )}
                                selected={active}
                                numberOfLines={2}
                              >
                                {getPropertyTypeLabel(option.key, language)}
                              </PickerCardLabel>
                            </PickerCard>
                          );
                        })}
                      </PickerGrid>
                    </>
                  ) : null}

                  {realEstateDeal === "commercial" ? (
                    <>
                      <Label>{t("sellFieldCommercialType")}</Label>
                      <PickerGrid>
                        {commercialTypes.map((option, index) => {
                          const active = commercialType === option.key;
                          return (
                            <PickerCard
                              key={option.key}
                              width={getPickerCardWidth(
                                index,
                                commercialTypes.length,
                              )}
                              full={isPickerCardFull(
                                index,
                                commercialTypes.length,
                              )}
                              selected={active}
                              accent={option.color}
                              tint={sectorTint(option.color, 0.09)}
                              onPress={() => selectCommercialType(option.key)}
                            >
                              <CategoryIconWrap
                                small
                                tint={sectorTint(
                                  option.color,
                                  active ? 0.22 : 0.12,
                                )}
                              >
                                <Ionicons
                                  name={option.icon}
                                  size={17}
                                  color={option.color}
                                />
                              </CategoryIconWrap>
                              <PickerCardLabel
                                full={isPickerCardFull(
                                  index,
                                  commercialTypes.length,
                                )}
                                selected={active}
                                numberOfLines={2}
                              >
                                {getCommercialTypeLabel(option.key, language)}
                              </PickerCardLabel>
                            </PickerCard>
                          );
                        })}
                      </PickerGrid>

                      {realEstateHasCapacity(realEstateDeal, commercialType) ? (
                        <>
                          <Label>{t("sellFieldCapacity")}</Label>
                          <PriceFieldRow>
                            <Ionicons
                              name="people-outline"
                              size={20}
                              color={colors.textMuted}
                            />
                            <Input
                              value={capacity}
                              onChangeText={(value) =>
                                setCapacity(value.replace(/\D/g, ""))
                              }
                              placeholder={t("sellFieldCapacityPlaceholder")}
                              placeholderTextColor={colors.textMuted}
                              keyboardType="numeric"
                            />
                            <CurrencyTag>
                              <CurrencyTagLabel>
                                {t("sellCapacityUnit")}
                              </CurrencyTagLabel>
                            </CurrencyTag>
                          </PriceFieldRow>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  <Label>{t("sellFieldSurfaceArea")}</Label>
                  <PriceFieldRow>
                    <Ionicons
                      name="resize-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={surfaceArea}
                      onChangeText={setSurfaceArea}
                      placeholder={t("sellFieldSurfaceAreaPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                    <CurrencyTag>
                      <CurrencyTagLabel>
                        {t("sellSurfaceUnit")}
                      </CurrencyTagLabel>
                    </CurrencyTag>
                  </PriceFieldRow>

                  {realEstateHasRooms(realEstateDeal) ? (
                    <>
                      <Label>{t("sellFieldBedrooms")}</Label>
                      <ConditionRow>
                        {ROOM_COUNTS.map((count) => (
                          <ConditionPill
                            key={count}
                            selected={bedrooms === count}
                            onPress={() =>
                              setBedrooms(bedrooms === count ? null : count)
                            }
                          >
                            <ConditionPillLabel selected={bedrooms === count}>
                              {count}
                            </ConditionPillLabel>
                          </ConditionPill>
                        ))}
                      </ConditionRow>

                      <Label>{t("sellFieldBathrooms")}</Label>
                      <ConditionRow>
                        {BATH_COUNTS.map((count) => (
                          <ConditionPill
                            key={count}
                            selected={bathrooms === count}
                            onPress={() =>
                              setBathrooms(bathrooms === count ? null : count)
                            }
                          >
                            <ConditionPillLabel selected={bathrooms === count}>
                              {count}
                            </ConditionPillLabel>
                          </ConditionPill>
                        ))}
                      </ConditionRow>
                    </>
                  ) : null}

                  {realEstateHasFurnished(realEstateDeal) ? (
                    <NegotiableRow
                      onPress={() => setIsFurnished((prev) => !prev)}
                    >
                      <Checkbox checked={isFurnished}>
                        {isFurnished ? (
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color="#ffffff"
                          />
                        ) : null}
                      </Checkbox>
                      <NegotiableLabel>
                        {t("sellFieldFurnished")}
                      </NegotiableLabel>
                    </NegotiableRow>
                  ) : null}

                  <Label>{t("sellFieldPrice")}</Label>
                  <MoneyFieldRow>
                    <Ionicons
                      name="cash-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={price}
                      onChangeText={setPrice}
                      placeholder={t("sellFieldPricePlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                    <CurrencyTag>
                      <CurrencyTagLabel>
                        {t(
                          realEstateHasCapacity(realEstateDeal, commercialType)
                            ? "sellPriceSuffix_perDay"
                            : realEstatePriceSuffixKey(realEstateDeal),
                        )}
                      </CurrencyTagLabel>
                    </CurrencyTag>
                  </MoneyFieldRow>
                  {priceEcho ? <PriceEcho>{priceEcho}</PriceEcho> : null}
                  <NegotiableRow onPress={() => setNegotiable((prev) => !prev)}>
                    <Checkbox checked={negotiable}>
                      {negotiable ? (
                        <Ionicons name="checkmark" size={13} color="#ffffff" />
                      ) : null}
                    </Checkbox>
                    <NegotiableLabel>
                      {t("sellFieldNegotiable")}
                    </NegotiableLabel>
                  </NegotiableRow>

                  {realEstateHasDeposit(realEstateDeal, commercialType) ? (
                    <>
                      <Label>{t("sellFieldDeposit")}</Label>
                      <PriceFieldRow>
                        <Ionicons
                          name="wallet-outline"
                          size={20}
                          color={colors.textMuted}
                        />
                        <Input
                          value={depositMonths}
                          onChangeText={setDepositMonths}
                          placeholder={t("sellFieldDepositPlaceholder")}
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                        />
                        <CurrencyTag>
                          <CurrencyTagLabel>
                            {t("sellDepositUnit")}
                          </CurrencyTagLabel>
                        </CurrencyTag>
                      </PriceFieldRow>
                      <FieldNote>{t("sellDepositHint")}</FieldNote>
                    </>
                  ) : null}

                  {realEstateHasAvance(realEstateDeal, commercialType) ? (
                    <>
                      <Label>{t("sellFieldAvance")}</Label>
                      <PriceFieldRow>
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color={colors.textMuted}
                        />
                        <Input
                          value={avanceMonths}
                          onChangeText={setAvanceMonths}
                          placeholder="6"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                        />
                        <CurrencyTag>
                          <CurrencyTagLabel>
                            {t("sellDepositUnit")}
                          </CurrencyTagLabel>
                        </CurrencyTag>
                      </PriceFieldRow>
                      <FieldNote>{t("sellFieldAvanceHint")}</FieldNote>
                    </>
                  ) : null}

                  {/* A commune is too coarse to search property with —
                      Godomey and Calavi centre are the same commune and a
                      different market. Only offered for cities we have
                      quartiers for; elsewhere the city stands alone. */}
                  {getQuartiers(selectedCity).length ? (
                    <>
                      <Label>{t("sellFieldQuartier")}</Label>
                      <PickerGrid>
                        {getQuartiers(selectedCity).map((name, index, list) => {
                          const active = quartier === name;
                          return (
                            <PickerCard
                              key={name}
                              width={getPickerCardWidth(index, list.length)}
                              full={isPickerCardFull(index, list.length)}
                              selected={active}
                              accent={EMERALD}
                              tint={sectorTint(EMERALD, 0.09)}
                              onPress={() => setQuartier(active ? null : name)}
                            >
                              <PickerCardLabel
                                full={isPickerCardFull(index, list.length)}
                                selected={active}
                                numberOfLines={2}
                              >
                                {name}
                              </PickerCardLabel>
                            </PickerCard>
                          );
                        })}
                      </PickerGrid>
                    </>
                  ) : null}

                  {realEstateDeal === "land" ? (
                    <NegotiableRow onPress={() => setIsLotti(!isLotti)}>
                      <Checkbox checked={isLotti}>
                        {isLotti ? (
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color="#ffffff"
                          />
                        ) : null}
                      </Checkbox>
                      <NegotiableLabel>{t("sellFieldLotti")}</NegotiableLabel>
                    </NegotiableRow>
                  ) : null}

                  {/* Land only. The first thing a buyer screens for, and the
                      reason two neighbouring plots differ in price. */}
                  {realEstateDeal === "land" ? (
                    <>
                      <Label>{t("sellFieldLandDocument")}</Label>
                      <PickerGrid>
                        {landDocuments.map((option, index, list) => {
                          const active = landDocument === option.key;
                          return (
                            <PickerCard
                              key={option.key}
                              width={getPickerCardWidth(index, list.length)}
                              full={isPickerCardFull(index, list.length)}
                              selected={active}
                              accent={getLandDocumentTier(option.key).color}
                              tint={sectorTint(
                                getLandDocumentTier(option.key).color,
                                0.09,
                              )}
                              onPress={() =>
                                setLandDocument(active ? null : option.key)
                              }
                            >
                              <CategoryIconWrap
                                small
                                tint={sectorTint(
                                  getLandDocumentTier(option.key).color,
                                  active ? 0.22 : 0.12,
                                )}
                              >
                                <Ionicons
                                  name={option.icon}
                                  size={17}
                                  color={getLandDocumentTier(option.key).color}
                                />
                              </CategoryIconWrap>
                              <PickerCardLabel
                                full={isPickerCardFull(index, list.length)}
                                selected={active}
                                numberOfLines={2}
                              >
                                {getLandDocumentLabel(option.key, language)}
                              </PickerCardLabel>
                            </PickerCard>
                          );
                        })}
                      </PickerGrid>
                      <FieldNote>{t("sellFieldLandDocumentHint")}</FieldNote>
                    </>
                  ) : null}

                  <Label>{t("sellFieldPhoneOptional")}</Label>
                  <PriceFieldRow>
                    <Ionicons
                      name="call-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={phone}
                      onChangeText={setPhone}
                      placeholder={t("sellFieldPhonePlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="phone-pad"
                    />
                  </PriceFieldRow>
                  <FieldNote>{t("sellRealEstatePhoneHint")}</FieldNote>

                  {/* Who is posting. Intermediaries re-list what they don't
                      hold, so letting a browser see this is what makes two
                      near-identical listings comparable. */}
                  <Label>{t("sellFieldListerKind")}</Label>
                  <PickerGrid>
                    {listerKinds.map((option, index, list) => {
                      const active = listerKind === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          accent={EMERALD}
                          tint={sectorTint(EMERALD, 0.09)}
                          onPress={() =>
                            setListerKind(active ? null : option.key)
                          }
                        >
                          <CategoryIconWrap
                            small
                            tint={sectorTint(EMERALD, active ? 0.22 : 0.12)}
                          >
                            <Ionicons
                              name={option.icon}
                              size={17}
                              color={EMERALD}
                            />
                          </CategoryIconWrap>
                          <PickerCardLabel
                            full={isPickerCardFull(index, list.length)}
                            selected={active}
                            numberOfLines={2}
                          >
                            {getListerKindLabel(option.key, language)}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  {realEstateShowsAmenities(realEstateDeal) ? (
                    <>
                      <Label>{t("sellFieldAmenities")}</Label>
                      <PickerGrid>
                        {amenitiesFor(realEstateDeal, commercialType).map(
                          (option, index, list) => {
                            const active = amenities.includes(option.key);
                            return (
                              <PickerCard
                                key={option.key}
                                width={getPickerCardWidth(index, list.length)}
                                full={isPickerCardFull(index, list.length)}
                                selected={active}
                                accent={option.color}
                                tint={sectorTint(option.color, 0.09)}
                                onPress={() => toggleAmenity(option.key)}
                              >
                                <CategoryIconWrap
                                  small
                                  tint={sectorTint(
                                    option.color,
                                    active ? 0.22 : 0.12,
                                  )}
                                >
                                  <Ionicons
                                    name={option.icon}
                                    size={17}
                                    color={option.color}
                                  />
                                </CategoryIconWrap>
                                <PickerCardLabel
                                  full={isPickerCardFull(index, list.length)}
                                  selected={active}
                                  numberOfLines={2}
                                >
                                  {getAmenityLabel(option.key, language)}
                                </PickerCardLabel>
                              </PickerCard>
                            );
                          },
                        )}
                      </PickerGrid>
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {isBabyKids ? (
            <>
              <Label>{t("sellFieldBabyKind")}</Label>
              <PickerGrid>
                {babyKinds.map((option, index) => {
                  const active = babyKind === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, babyKinds.length)}
                      full={isPickerCardFull(index, babyKinds.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() => selectBabyKind(option.key)}
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, babyKinds.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {getBabyKindLabel(option.key, language)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>

              {/* Label and example follow the kind: clothing is sized,
                  a toy carries a recommended age. */}
              {getBabyDetailKind(babyKind) ? (
                <>
                  <Label>
                    {t(
                      getBabyDetailKind(babyKind) === "size"
                        ? "sellFieldBabySize"
                        : "sellFieldBabyAge",
                    )}
                  </Label>
                  <InputRow>
                    <Ionicons
                      name="resize-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={babyDetail}
                      onChangeText={setBabyDetail}
                      placeholder={t(
                        getBabyDetailKind(babyKind) === "size"
                          ? "sellFieldBabySizePlaceholder"
                          : "sellFieldBabyAgePlaceholder",
                      )}
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>
                  <FieldNote>{t("sellBabyDetailHint")}</FieldNote>
                </>
              ) : null}
            </>
          ) : null}

          {isSports ? (
            <>
              <Label>{t("sellFieldSportsKind")}</Label>
              <PickerGrid>
                {sportsKinds.map((option, index) => {
                  const active = sportsKind === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, sportsKinds.length)}
                      full={isPickerCardFull(index, sportsKinds.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() => selectSportsKind(option.key)}
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, sportsKinds.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {getSportsKindLabel(option.key, language)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>

              {sportsKindNeedsSize(sportsKind) ? (
                <>
                  <Label>{t("sellFieldSportsSize")}</Label>
                  <InputRow>
                    <Ionicons
                      name="resize-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={sportsSize}
                      onChangeText={setSportsSize}
                      placeholder={t("sellFieldSportsSizePlaceholder")}
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>
                  <FieldNote>{t("sellSportsSizeHint")}</FieldNote>
                </>
              ) : null}
            </>
          ) : null}

          {selectedCategory &&
          !isPharmacy &&
          !isJobs &&
          !isCommunity &&
          !isServices &&
          !isRealEstate &&
          !isRestaurant &&
          (!isAgriculture || agricultureKindHasCondition(agricultureKind)) ? (
            <>
              <Label>{t("sellFieldCondition")}</Label>
              <PickerGrid>
                {CONDITIONS.map((option, index) => {
                  const active = condition === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, CONDITIONS.length)}
                      full={isPickerCardFull(index, CONDITIONS.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() => setCondition(active ? null : option.key)}
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, CONDITIONS.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {t(option.labelKey)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>
            </>
          ) : null}

          {isPharmacy ? (
            <>
              <Label>{t("sellFieldPhone")}</Label>
              <InputRow>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <Input
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t("sellFieldPhonePlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                />
              </InputRow>

              <Label>{t("sellFieldDutyHours")}</Label>
              <InputRow>
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <Input
                  value={dutyHours}
                  onChangeText={setDutyHours}
                  placeholder={t("sellFieldDutyHoursPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
              </InputRow>
            </>
          ) : isJobs ? (
            <>
              <Label>{t("sellFieldCompany")}</Label>
              <InputRow>
                <Ionicons
                  name="business-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <Input
                  value={company}
                  onChangeText={setCompany}
                  placeholder={t("sellFieldCompanyPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                />
              </InputRow>

              <Label>{t("sellFieldJobType")}</Label>
              <PickerGrid>
                {JOB_TYPES.map((option, index) => {
                  const active = jobType === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, JOB_TYPES.length)}
                      full={isPickerCardFull(index, JOB_TYPES.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() => setJobType(active ? null : option.key)}
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, JOB_TYPES.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {t(option.labelKey)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>

              <Label>{t("sellFieldJobCategory")}</Label>
              <PickerGrid>
                {jobCategories.map((option, index) => {
                  const active = jobCategory === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, jobCategories.length)}
                      full={isPickerCardFull(index, jobCategories.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() => setJobCategory(active ? null : option.key)}
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, jobCategories.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {language === "en" ? option.labelEn : option.labelFr}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>

              <Label>{t("sellFieldSalary")}</Label>
              <InputRow>
                <Ionicons
                  name="cash-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <Input
                  value={salary}
                  onChangeText={setSalary}
                  placeholder={t("sellFieldSalaryPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                />
              </InputRow>
              <Label>{t("sellFieldResponsibilities")}</Label>
              <FieldNote>{t("sellJobListHint")}</FieldNote>
              <TextAreaRow>
                <TextArea
                  value={responsibilities}
                  onChangeText={setResponsibilities}
                  placeholder={t("sellFieldResponsibilitiesPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                />
              </TextAreaRow>

              <Label>{t("sellFieldRequirements")}</Label>
              <TextAreaRow>
                <TextArea
                  value={requirements}
                  onChangeText={setRequirements}
                  placeholder={t("sellFieldRequirementsPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                />
              </TextAreaRow>

              <Label>{t("sellFieldJobBenefits")}</Label>
              <TextAreaRow>
                <TextArea
                  value={jobBenefits}
                  onChangeText={setJobBenefits}
                  placeholder={t("sellFieldJobBenefitsPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </TextAreaRow>

              <Label>{t("sellFieldExperience")}</Label>
              <ExperienceRow>
                {experienceLevels.map((level) => {
                  const selected = experienceLevel === level.key;
                  // Each band selects in its own colour — green, amber, red
                  // — because that colour IS the thing being chosen: it's
                  // what the card will be tinted with in the feed. Selecting
                  // "Plus de 3 ans" and getting a green card taught the
                  // opposite of what the feed then shows.
                  const accent = getExperienceAccent(level.key, colors);
                  return (
                    <ExperienceOption
                      key={level.key}
                      selected={selected}
                      accent={accent}
                      tint={getExperienceTint(level.key, colors)}
                      onPress={() =>
                        setExperienceLevel(selected ? null : level.key)
                      }
                    >
                      <ExperienceDot accent={accent} />
                      <ExperienceLabel
                        selected={selected}
                        accent={accent}
                        numberOfLines={2}
                      >
                        {getExperienceLabel(level.key, language)}
                      </ExperienceLabel>
                    </ExperienceOption>
                  );
                })}
              </ExperienceRow>
            </>
          ) : isAgriculture ? (
            <>
              <Label>{t("sellFieldAgricultureKind")}</Label>
              <PickerGrid>
                {agricultureKinds.map((option, index) => {
                  const active = agricultureKind === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, agricultureKinds.length)}
                      full={isPickerCardFull(index, agricultureKinds.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() => selectAgricultureKind(option.key)}
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, agricultureKinds.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {getAgricultureKindLabel(option.key, language)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>

              {/* Units are offered per kind — "par tête" has no business on
                  a bag of fertiliser. */}
              {agricultureKind ? (
                <>
                  <Label>{t("sellFieldAgricultureUnit")}</Label>
                  <ConditionRow>
                    {getAgricultureUnitsFor(agricultureKind).map((unit) => (
                      <ConditionPill
                        key={unit.key}
                        selected={agricultureUnit === unit.key}
                        onPress={() =>
                          setAgricultureUnit(
                            agricultureUnit === unit.key ? null : unit.key,
                          )
                        }
                      >
                        <ConditionPillLabel
                          selected={agricultureUnit === unit.key}
                        >
                          {getAgricultureUnitLabel(unit.key, language)}
                        </ConditionPillLabel>
                      </ConditionPill>
                    ))}
                  </ConditionRow>

                  <Label>{t("sellFieldPrice")}</Label>
                  <MoneyFieldRow>
                    <Ionicons
                      name="cash-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={price}
                      onChangeText={setPrice}
                      placeholder={t("sellFieldPricePlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                    <CurrencyTag>
                      <CurrencyTagLabel>
                        {agricultureUnit
                          ? t(`sellUnitSuffix_${agricultureUnit}`)
                          : "FCFA"}
                      </CurrencyTagLabel>
                    </CurrencyTag>
                  </MoneyFieldRow>
                  {priceEcho ? <PriceEcho>{priceEcho}</PriceEcho> : null}
                  <NegotiableRow onPress={() => setNegotiable((prev) => !prev)}>
                    <Checkbox checked={negotiable}>
                      {negotiable ? (
                        <Ionicons name="checkmark" size={13} color="#ffffff" />
                      ) : null}
                    </Checkbox>
                    <NegotiableLabel>
                      {t("sellFieldNegotiable")}
                    </NegotiableLabel>
                  </NegotiableRow>
                </>
              ) : null}
            </>
          ) : isServices ? (
            <>
              <Label>{t("sellFieldServiceRate")}</Label>
              <PickerGrid>
                {serviceRateTypes.map((option, index) => {
                  const active = serviceRateType === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, serviceRateTypes.length)}
                      full={isPickerCardFull(index, serviceRateTypes.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() =>
                        setServiceRateType(active ? null : option.key)
                      }
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, serviceRateTypes.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {getServiceRateLabel(option.key, language)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>

              {/* Only asked for once a rate is chosen, and never for "sur
                  devis" — the whole point of that option is that there is no
                  number yet. */}
              {serviceRateNeedsAmount(serviceRateType) ? (
                <>
                  <Label>{t("sellFieldServiceAmount")}</Label>
                  <MoneyFieldRow>
                    <Ionicons
                      name="cash-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={price}
                      onChangeText={setPrice}
                      placeholder={t("sellFieldPricePlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                    <CurrencyTag>
                      <CurrencyTagLabel>
                        {t(`sellRateSuffix_${serviceRateType}`)}
                      </CurrencyTagLabel>
                    </CurrencyTag>
                  </MoneyFieldRow>
                  {priceEcho ? <PriceEcho>{priceEcho}</PriceEcho> : null}
                  <NegotiableRow onPress={() => setNegotiable((prev) => !prev)}>
                    <Checkbox checked={negotiable}>
                      {negotiable ? (
                        <Ionicons name="checkmark" size={13} color="#ffffff" />
                      ) : null}
                    </Checkbox>
                    <NegotiableLabel>
                      {t("sellFieldNegotiable")}
                    </NegotiableLabel>
                  </NegotiableRow>
                </>
              ) : serviceRateType ? (
                <FieldNote>{t("sellServiceQuoteHint")}</FieldNote>
              ) : null}

              {/* Optional, and asked of most services rather than gated on
                  guessing which ones are roadside — a hairdresser leaves it
                  blank and the Dépannage card shows only what was answered.
                  A chauffeur is the one trade where blank is not neutral but
                  wrong: "Que pouvez-vous apporter ?" offers a driver a
                  booster and a compressor for a breakdown they will never
                  attend, and "sous quel délai intervenez-vous" is a
                  dispatch question asked of somebody who is not dispatched.
                  Both are Dépannage vocabulary, so they go with it.

                  Unless the driver also does roadside work, which some do —
                  then their own words say so and they keep the fields. */}
              {showRoadsideFields ? (
                <>
                  <Label>{t("sellFieldResponseTime")}</Label>
                  <FieldNote>{t("sellResponseTimeHint")}</FieldNote>
                  <PickerGrid>
                    {roadsideResponseTimes.map((option, index) => {
                      const active = responseTime === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            roadsideResponseTimes.length,
                          )}
                          full={isPickerCardFull(
                            index,
                            roadsideResponseTimes.length,
                          )}
                          selected={active}
                          onPress={() =>
                            setResponseTime(active ? null : option.key)
                          }
                        >
                          <PickerCardLabel selected={active}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldEquipment")}</Label>
                  <FieldNote>{t("sellEquipmentHint")}</FieldNote>
                  <PickerGrid>
                    {roadsideEquipment.map((option, index) => {
                      const active = equipment.includes(option.key);
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            roadsideEquipment.length,
                          )}
                          full={isPickerCardFull(
                            index,
                            roadsideEquipment.length,
                          )}
                          selected={active}
                          onPress={() =>
                            setEquipment((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((key) => key !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <PickerCardLabel selected={active}>
                            {getEquipmentLabel(option.key, language)}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>
                </>
              ) : null}

              {/* Appears because the seller's own words are about tyres.
                  Everything here is what the Pneus screen filters on, so a
                  blank answer is not neutral — it is work that will not be
                  offered. */}
              {mentionsTyres ? (
                <>
                  <Label>{t("sellFieldTyreServices")}</Label>
                  <FieldNote>{t("sellTyreServicesHint")}</FieldNote>
                  <PickerGrid>
                    {tyreServices.map((option, index) => {
                      const active = tyreServiceKeys.includes(option.key);
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, tyreServices.length)}
                          full={isPickerCardFull(index, tyreServices.length)}
                          selected={active}
                          onPress={() =>
                            setTyreServiceKeys((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((key) => key !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <PickerCardLabel selected={active}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldTyreSizes")}</Label>
                  <TyreSizeRow>
                    <TyreSizeField>
                      <InputRow>
                        <Input
                          value={tyreSizeDraft}
                          onChangeText={setTyreSizeDraft}
                          onSubmitEditing={addTyreSize}
                          returnKeyType="done"
                          placeholder="195/65 R15"
                          placeholderTextColor={colors.textMuted}
                        />
                      </InputRow>
                    </TyreSizeField>
                    <AddSizeButton
                      onPress={addTyreSize}
                      disabled={!parseTyreSize(tyreSizeDraft)}
                    >
                      <AddSizeLabel>{t("sellTyreSizeAdd")}</AddSizeLabel>
                    </AddSizeButton>
                  </TyreSizeRow>
                  {tyreSizes.length ? (
                    <PickerGrid>
                      {tyreSizes.map((value) => (
                        <SizePill
                          key={value}
                          onPress={() =>
                            setTyreSizes((prev) =>
                              prev.filter((entry) => entry !== value),
                            )
                          }
                        >
                          <SizePillLabel>{value}</SizePillLabel>
                          <Ionicons
                            name="close"
                            size={13}
                            color={colors.textMuted}
                          />
                        </SizePill>
                      ))}
                    </PickerGrid>
                  ) : null}
                  <FieldNote>{t("sellTyreSizesHint")}</FieldNote>

                  <Label>{t("sellFieldTyreBrands")}</Label>
                  <InputRow>
                    <Input
                      value={tyreBrands}
                      onChangeText={setTyreBrands}
                      placeholder={t("sellFieldTyreBrandsPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>
                </>
              ) : null}

              {mentionsBattery ? (
                <>
                  <Label>{t("sellFieldBatteryServices")}</Label>
                  <FieldNote>{t("sellBatteryServicesHint")}</FieldNote>
                  <PickerGrid>
                    {batteryServices.map((option, index) => {
                      const active = batteryServiceKeys.includes(option.key);
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            batteryServices.length,
                          )}
                          full={isPickerCardFull(index, batteryServices.length)}
                          selected={active}
                          onPress={() =>
                            setBatteryServiceKeys((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((key) => key !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <PickerCardLabel selected={active} numberOfLines={2}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>
                </>
              ) : null}

              {mentionsDriver ? (
                <>
                  <Label>{t("sellFieldDriverPermits")}</Label>
                  <FieldNote>{t("sellDriverPermitsHint")}</FieldNote>
                  <PickerGrid>
                    {permitCategories.map((option, index) => {
                      const active = driverPermits.includes(option.key);
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            permitCategories.length,
                          )}
                          full={isPickerCardFull(
                            index,
                            permitCategories.length,
                          )}
                          selected={active}
                          onPress={() =>
                            setDriverPermits((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((key) => key !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <PickerCardLabel selected={active} numberOfLines={2}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldDriverVehicle")}</Label>
                  <PickerGrid>
                    {driverVehicleModes.map((option, index) => {
                      const active = driverVehicleMode === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            driverVehicleModes.length,
                          )}
                          full={isPickerCardFull(
                            index,
                            driverVehicleModes.length,
                          )}
                          selected={active}
                          onPress={() =>
                            setDriverVehicleMode(active ? null : option.key)
                          }
                        >
                          <PickerCardLabel selected={active} numberOfLines={2}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldDriverAvailability")}</Label>
                  <PickerGrid>
                    {driverAvailability.map((option, index) => {
                      const active = driverAvailabilityKeys.includes(
                        option.key,
                      );
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            driverAvailability.length,
                          )}
                          full={isPickerCardFull(
                            index,
                            driverAvailability.length,
                          )}
                          selected={active}
                          onPress={() =>
                            setDriverAvailabilityKeys((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((key) => key !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <PickerCardLabel selected={active} numberOfLines={2}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldDriverLanguages")}</Label>
                  <FieldNote>{t("sellDriverLanguagesHint")}</FieldNote>
                  <PickerGrid>
                    {driverLanguages.map((option, index) => {
                      const active = driverLanguageKeys.includes(option.key);
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            driverLanguages.length,
                          )}
                          full={isPickerCardFull(index, driverLanguages.length)}
                          selected={active}
                          onPress={() =>
                            setDriverLanguageKeys((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((key) => key !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <PickerCardLabel selected={active} numberOfLines={2}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldDriverExperience")}</Label>
                  <PickerGrid>
                    {driverExperience.map((option, index) => {
                      const active = driverExperienceKey === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            driverExperience.length,
                          )}
                          full={isPickerCardFull(
                            index,
                            driverExperience.length,
                          )}
                          selected={active}
                          onPress={() =>
                            setDriverExperienceKey(active ? null : option.key)
                          }
                        >
                          <PickerCardLabel selected={active} numberOfLines={2}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>
                </>
              ) : null}

              {mentionsBodywork ? (
                <>
                  <Label>{t("sellFieldBodyworkServices")}</Label>
                  <FieldNote>{t("sellBodyworkServicesHint")}</FieldNote>
                  <PickerGrid>
                    {bodyworkServices.map((option, index) => {
                      const active = bodyworkServiceKeys.includes(option.key);
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            bodyworkServices.length,
                          )}
                          full={isPickerCardFull(
                            index,
                            bodyworkServices.length,
                          )}
                          selected={active}
                          onPress={() =>
                            setBodyworkServiceKeys((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((key) => key !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <PickerCardLabel selected={active} numberOfLines={2}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>
                </>
              ) : null}

              {mentionsElectric ? (
                <>
                  <Label>{t("sellFieldElectricServices")}</Label>
                  <FieldNote>{t("sellElectricServicesHint")}</FieldNote>
                  <PickerGrid>
                    {electricServices.map((option, index) => {
                      const active = electricServiceKeys.includes(option.key);
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(
                            index,
                            electricServices.length,
                          )}
                          full={isPickerCardFull(
                            index,
                            electricServices.length,
                          )}
                          selected={active}
                          onPress={() =>
                            setElectricServiceKeys((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((key) => key !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <PickerCardLabel selected={active} numberOfLines={2}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>
                </>
              ) : null}

              <Label>{t("sellFieldCoverageZones")}</Label>
              <InputRow>
                <Input
                  value={coverageZones}
                  onChangeText={setCoverageZones}
                  placeholder={t("sellFieldCoverageZonesPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                />
              </InputRow>
              <FieldNote>{t("sellCoverageZonesHint")}</FieldNote>
            </>
          ) : isCommunity ? (
            <>
              <Label>{t("sellFieldCommunityType")}</Label>
              <PickerGrid>
                {communityTypes.map((option, index) => {
                  const active = communityType === option.key;
                  return (
                    <PickerCard
                      key={option.key}
                      width={getPickerCardWidth(index, communityTypes.length)}
                      full={isPickerCardFull(index, communityTypes.length)}
                      selected={active}
                      accent={option.color}
                      tint={sectorTint(option.color, 0.09)}
                      onPress={() =>
                        setCommunityType(active ? null : option.key)
                      }
                    >
                      <CategoryIconWrap
                        small
                        tint={sectorTint(option.color, active ? 0.22 : 0.12)}
                      >
                        <Ionicons
                          name={option.icon}
                          size={17}
                          color={option.color}
                        />
                      </CategoryIconWrap>
                      <PickerCardLabel
                        full={isPickerCardFull(index, communityTypes.length)}
                        selected={active}
                        numberOfLines={2}
                      >
                        {getCommunityTypeLabel(option.key, language)}
                      </PickerCardLabel>
                    </PickerCard>
                  );
                })}
              </PickerGrid>
              <FieldNote>{t("sellCommunityTypeHint")}</FieldNote>
            </>
          ) : isRestaurant || isRealEstate ? null : (
            // Real estate renders its own price above, with the per-deal
            // suffix (/mois, /nuit, total) — falling through to here as
            // well put a second Prix field on the same form.
            <>
              {isBatteryOffer ? (
                <>
                  <Label>{t("sellFieldBatteryCategory")}</Label>
                  <PickerGrid>
                    {batteryCategories.map((option, index, list) => {
                      const active = batteryCategory === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          onPress={() => setBatteryCategory(option.key)}
                        >
                          <CategoryIconWrap
                            small
                            tint={sectorTint(EMERALD, active ? 0.22 : 0.12)}
                          >
                            <Ionicons
                              name={option.icon}
                              size={17}
                              color={EMERALD}
                            />
                          </CategoryIconWrap>
                          <PickerCardLabel
                            full={isPickerCardFull(index, list.length)}
                            selected={active}
                            numberOfLines={2}
                          >
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  {/* The capacity is the whole search, so it comes first
                      among the numbers and is the only one that blocks. */}
                  <Label>{t("sellFieldBatteryAh")}</Label>
                  <InputRow>
                    <Input
                      value={batteryAh}
                      onChangeText={(value) =>
                        setBatteryAh(value.replace(/[^0-9]/g, "").slice(0, 3))
                      }
                      keyboardType="number-pad"
                      placeholder="60"
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>
                  <FieldNote>{t("sellBatteryAhHint")}</FieldNote>

                  {/* A solar cell has no starter to turn, so the amps box
                      would only ever be filled with an invented number. */}
                  {batteryNeedsCrankingAmps(batteryCategory) ? (
                    <>
                      <Label>{t("sellFieldBatteryAmps")}</Label>
                      <InputRow>
                        <Input
                          value={batteryAmps}
                          onChangeText={(value) =>
                            setBatteryAmps(
                              value.replace(/[^0-9]/g, "").slice(0, 4),
                            )
                          }
                          keyboardType="number-pad"
                          placeholder="540"
                          placeholderTextColor={colors.textMuted}
                        />
                      </InputRow>
                      <FieldNote>{t("sellBatteryAmpsHint")}</FieldNote>
                    </>
                  ) : null}

                  <Label>{t("sellFieldBatteryBrand")}</Label>
                  <InputRow>
                    <Input
                      value={batteryBrand}
                      onChangeText={setBatteryBrand}
                      placeholder={t("sellFieldBatteryBrandPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>

                  <Label>{t("sellFieldBatteryModel")}</Label>
                  <InputRow>
                    <Input
                      value={batteryModel}
                      onChangeText={setBatteryModel}
                      placeholder={t("sellFieldBatteryModelPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>

                  <Label>{t("sellFieldBatteryTech")}</Label>
                  <PickerGrid>
                    {batteryTechnologies.map((option, index, list) => {
                      const active = batteryTech === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          onPress={() =>
                            setBatteryTech(active ? null : option.key)
                          }
                        >
                          <PickerCardLabel selected={active}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldBatteryTerminal")}</Label>
                  <PickerGrid>
                    {batteryTerminals.map((option, index, list) => {
                      const active = batteryTerminal === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          onPress={() =>
                            setBatteryTerminal(active ? null : option.key)
                          }
                        >
                          <PickerCardLabel
                            full={isPickerCardFull(index, list.length)}
                            selected={active}
                            numberOfLines={2}
                          >
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>
                  <FieldNote>{t("sellBatteryTerminalHint")}</FieldNote>

                  <Label>{t("sellFieldBatteryWarranty")}</Label>
                  <PickerGrid>
                    {batteryWarranties.map((option, index, list) => {
                      const active = batteryWarranty === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          onPress={() =>
                            setBatteryWarranty(active ? null : option.key)
                          }
                        >
                          <PickerCardLabel selected={active}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldBatteryFitting")}</Label>
                  <PickerGrid>
                    {batteryFittingModes.map((option, index, list) => {
                      const active = batteryFitting === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          onPress={() =>
                            setBatteryFitting(active ? null : option.key)
                          }
                        >
                          <PickerCardLabel
                            full={isPickerCardFull(index, list.length)}
                            selected={active}
                            numberOfLines={2}
                          >
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  <Label>{t("sellFieldBatteryStock")}</Label>
                  <InputRow>
                    <Input
                      value={batteryStock}
                      onChangeText={(value) =>
                        setBatteryStock(
                          value.replace(/[^0-9]/g, "").slice(0, 3),
                        )
                      }
                      keyboardType="number-pad"
                      placeholder="4"
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>

                  {/* An amount, not a promise: "reprise possible" tells a
                      buyer nothing they can compare. */}
                  <Label>{t("sellFieldBatteryTradeIn")}</Label>
                  <InputRow>
                    <Input
                      value={batteryTradeIn}
                      onChangeText={(value) =>
                        setBatteryTradeIn(
                          value.replace(/[^0-9]/g, "").slice(0, 7),
                        )
                      }
                      keyboardType="number-pad"
                      placeholder="8000"
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>
                  <FieldNote>{t("sellBatteryTradeInHint")}</FieldNote>
                </>
              ) : null}

              {isTyreOffer ? (
                <>
                  {/* The three numbers, first and on their own line. Every
                      other field on this form is a nice-to-have next to
                      this one: a tyre nobody can match to a car is a tyre
                      nobody will ever call about. */}
                  <Label>{t("sellFieldTyreSize")}</Label>
                  <TyreSizeRow>
                    <TyreSizeField>
                      <InputRow>
                        <Input
                          ref={tyreWidthRef}
                          value={tyreWidth}
                          onChangeText={(value) => {
                            const digits = value
                              .replace(/[^0-9]/g, "")
                              .slice(0, 3);
                            setTyreWidth(digits);
                            if (digits.length === 3) {
                              tyreRatioRef.current?.focus();
                            }
                          }}
                          keyboardType="number-pad"
                          maxLength={3}
                          returnKeyType="next"
                          placeholder="195"
                          placeholderTextColor={colors.textMuted}
                        />
                      </InputRow>
                    </TyreSizeField>
                    <TyreSizeSeparator>/</TyreSizeSeparator>
                    <TyreSizeField>
                      <InputRow>
                        <Input
                          ref={tyreRatioRef}
                          value={tyreRatio}
                          onChangeText={(value) => {
                            const digits = value
                              .replace(/[^0-9]/g, "")
                              .slice(0, 2);
                            setTyreRatio(digits);
                            if (digits.length === 2) {
                              tyreDiameterRef.current?.focus();
                            }
                          }}
                          onKeyPress={tyreBackspaceTo(
                            tyreWidthRef,
                            tyreRatio,
                            setTyreWidth,
                          )}
                          keyboardType="number-pad"
                          maxLength={2}
                          returnKeyType="next"
                          placeholder="65"
                          placeholderTextColor={colors.textMuted}
                        />
                      </InputRow>
                    </TyreSizeField>
                    <TyreSizeSeparator>R</TyreSizeSeparator>
                    <TyreSizeField>
                      <InputRow>
                        <Input
                          ref={tyreDiameterRef}
                          value={tyreDiameter}
                          onChangeText={(value) => {
                            const digits = value
                              .replace(/[^0-9]/g, "")
                              .slice(0, 2);
                            setTyreDiameter(digits);
                            if (digits.length === 2) Keyboard.dismiss();
                          }}
                          onKeyPress={tyreBackspaceTo(
                            tyreRatioRef,
                            tyreDiameter,
                            setTyreRatio,
                          )}
                          keyboardType="number-pad"
                          maxLength={2}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                          placeholder="15"
                          placeholderTextColor={colors.textMuted}
                        />
                      </InputRow>
                    </TyreSizeField>
                  </TyreSizeRow>
                  <FieldNote>{t("sellTyreSizeHint")}</FieldNote>

                  <Label>{t("sellFieldTyreCondition")}</Label>
                  <PickerGrid>
                    {tyreConditions.map((option, index, list) => {
                      const active = tyreCondition === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          onPress={() => setTyreCondition(option.key)}
                        >
                          <PickerCardLabel selected={active}>
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  {/* Only for a used tyre. A new one's DOT year is the year
                      it was made and tells a buyer nothing they need. */}
                  {tyreCondition === "used" ? (
                    <>
                      <Label>{t("sellFieldTyreDot")}</Label>
                      <PickerGrid>
                        {tyreDotYears().map((option, index, list) => {
                          const active = tyreDotYear === option;
                          return (
                            <PickerCard
                              key={option}
                              width={getPickerCardWidth(index, list.length)}
                              full={isPickerCardFull(index, list.length)}
                              selected={active}
                              onPress={() =>
                                setTyreDotYear(active ? null : option)
                              }
                            >
                              <PickerCardLabel selected={active}>
                                {option}
                              </PickerCardLabel>
                            </PickerCard>
                          );
                        })}
                      </PickerGrid>
                      <FieldNote>{t("sellTyreDotHint")}</FieldNote>

                      <Label>{t("sellFieldTyreTread")}</Label>
                      <InputRow>
                        <Input
                          value={tyreTreadMm}
                          onChangeText={(value) =>
                            setTyreTreadMm(value.replace(/[^0-9.,]/g, ""))
                          }
                          keyboardType="decimal-pad"
                          placeholder="6"
                          placeholderTextColor={colors.textMuted}
                        />
                      </InputRow>
                    </>
                  ) : null}

                  <Label>{t("sellFieldTyreBrand")}</Label>
                  <InputRow>
                    <Input
                      value={tyreBrand}
                      onChangeText={setTyreBrand}
                      placeholder={t("sellFieldTyreBrandPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>

                  <Label>{t("sellFieldTyreModel")}</Label>
                  <InputRow>
                    <Input
                      value={tyreModel}
                      onChangeText={setTyreModel}
                      placeholder={t("sellFieldTyreModelPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>

                  <Label>{t("sellFieldTyreStock")}</Label>
                  <InputRow>
                    <Input
                      value={tyreStock}
                      onChangeText={(value) =>
                        setTyreStock(value.replace(/[^0-9]/g, "").slice(0, 3))
                      }
                      keyboardType="number-pad"
                      placeholder="4"
                      placeholderTextColor={colors.textMuted}
                    />
                  </InputRow>

                  <Label>{t("sellFieldTyreFitting")}</Label>
                  <PickerGrid>
                    {tyreFittingModes.map((option, index, list) => {
                      const active = tyreFitting === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          onPress={() =>
                            setTyreFitting(active ? null : option.key)
                          }
                        >
                          <PickerCardLabel
                            full={isPickerCardFull(index, list.length)}
                            selected={active}
                            numberOfLines={2}
                          >
                            {language === "en"
                              ? option.labelEn
                              : option.labelFr}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>
                  <FieldNote>{t("sellTyreFittingHint")}</FieldNote>
                </>
              ) : null}

              {isVehicle && !isTyreOffer ? (
                <>
                  {/* Asked first, because the answer decides which deals
                      even exist. Previously all five were listed under one
                      neutral question, so someone selling a car was offered
                      "Avec chauffeur" — a rental arrangement that cannot be
                      a sale. Nothing downstream can repair that: the deal
                      sets the price unit, the mileage field and the card's
                      buttons. */}
                  <Label>{t("sellFieldVehiclePurpose")}</Label>
                  <PickerGrid>
                    {VEHICLE_PURPOSES.map((option, index, list) => {
                      const active = vehiclePurpose === option.key;
                      return (
                        <PickerCard
                          key={option.key}
                          width={getPickerCardWidth(index, list.length)}
                          full={isPickerCardFull(index, list.length)}
                          selected={active}
                          accent={option.color}
                          tint={sectorTint(option.color, 0.09)}
                          onPress={() => selectVehiclePurpose(option.key)}
                        >
                          <CategoryIconWrap
                            small
                            tint={sectorTint(
                              option.color,
                              active ? 0.22 : 0.12,
                            )}
                          >
                            <Ionicons
                              name={option.icon}
                              size={17}
                              color={option.color}
                            />
                          </CategoryIconWrap>
                          <PickerCardLabel
                            full={isPickerCardFull(index, list.length)}
                            selected={active}
                            numberOfLines={2}
                          >
                            {t(option.labelKey)}
                          </PickerCardLabel>
                        </PickerCard>
                      );
                    })}
                  </PickerGrid>

                  {vehiclePurpose ? (
                    <>
                      <Label>{t("sellFieldVehicleDeal")}</Label>
                      <PickerGrid>
                        {dealsForIntent(
                          vehiclePurpose === "rent" ? "rent" : "buy",
                        ).map((option, index, list) => {
                          const active = vehicleDeal === option.key;
                          return (
                            <PickerCard
                              key={option.key}
                              width={getPickerCardWidth(index, list.length)}
                              full={isPickerCardFull(index, list.length)}
                              selected={active}
                              accent={option.color}
                              tint={sectorTint(option.color, 0.09)}
                              onPress={() => selectVehicleDeal(option.key)}
                            >
                              <CategoryIconWrap
                                small
                                tint={sectorTint(
                                  option.color,
                                  active ? 0.22 : 0.12,
                                )}
                              >
                                <Ionicons
                                  name={option.icon}
                                  size={17}
                                  color={option.color}
                                />
                              </CategoryIconWrap>
                              <PickerCardLabel
                                full={isPickerCardFull(index, list.length)}
                                selected={active}
                                numberOfLines={2}
                              >
                                {getVehicleDealLabel(option.key, language)}
                              </PickerCardLabel>
                            </PickerCard>
                          );
                        })}
                      </PickerGrid>
                    </>
                  ) : null}

                  <Label>{t("sellFieldBrand")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleBrands.map((option) => (
                      <ScrollChip
                        key={option}
                        selected={brand === option}
                        onPress={() =>
                          setBrand(brand === option ? null : option)
                        }
                      >
                        <ScrollChipLabel selected={brand === option}>
                          {option}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>

                  {/* The catalogue for the chosen marque. Typing stays
                      available underneath: 290 models is thorough, not
                      exhaustive, and a seller with a nameplate we do not
                      list must still be able to publish. */}
                  {modelsForBrand(brand).length ? (
                    <>
                      <Label>{t("sellFieldModel")}</Label>
                      <ChipScroll
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        {modelsForBrand(brand).map((option) => (
                          <ScrollChip
                            key={option}
                            selected={model === option}
                            onPress={() =>
                              setModel(model === option ? "" : option)
                            }
                          >
                            <ScrollChipLabel selected={model === option}>
                              {option}
                            </ScrollChipLabel>
                          </ScrollChip>
                        ))}
                      </ChipScroll>
                      <FieldNote>{t("sellModelHint")}</FieldNote>
                    </>
                  ) : null}

                  <Label>{t("sellFieldModel")}</Label>
                  <PriceFieldRow>
                    <Ionicons
                      name="pricetag-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={model}
                      onChangeText={setModel}
                      placeholder={t("sellFieldModelPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                    />
                  </PriceFieldRow>

                  <Label>{t("sellFieldYear")}</Label>
                  <PriceFieldRow>
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color={colors.textMuted}
                    />
                    <Input
                      value={year}
                      onChangeText={(value) =>
                        setYear(value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder={t("sellFieldYearPlaceholder")}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                    />
                  </PriceFieldRow>

                  {getVehicleDeal(vehicleDeal)?.hasMileage ? (
                    <>
                      <Label>{t("sellFieldMileage")}</Label>
                      <PriceFieldRow>
                        <Ionicons
                          name="speedometer-outline"
                          size={20}
                          color={colors.textMuted}
                        />
                        <Input
                          value={mileage}
                          onChangeText={(value) =>
                            setMileage(value.replace(/\D/g, ""))
                          }
                          placeholder={t("sellFieldMileagePlaceholder")}
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                        />
                        <CurrencyTag>
                          <CurrencyTagLabel>km</CurrencyTagLabel>
                        </CurrencyTag>
                      </PriceFieldRow>
                    </>
                  ) : null}

                  <Label>{t("sellFieldFuel")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleFuels.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={fuel === option.key}
                        onPress={() =>
                          setFuel(fuel === option.key ? null : option.key)
                        }
                      >
                        <ScrollChipLabel selected={fuel === option.key}>
                          {getVehicleFuelLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>

                  <Label>{t("sellFieldTransmission")}</Label>
                  <ConditionRow>
                    {vehicleTransmissions.map((option) => (
                      <ConditionPill
                        key={option.key}
                        selected={transmission === option.key}
                        onPress={() =>
                          setTransmission(
                            transmission === option.key ? null : option.key,
                          )
                        }
                      >
                        <ConditionPillLabel
                          selected={transmission === option.key}
                        >
                          {getVehicleTransmissionLabel(option.key, language)}
                        </ConditionPillLabel>
                      </ConditionPill>
                    ))}
                  </ConditionRow>

                  <Label>{t("sellFieldBodyType")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleBodyTypes.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={bodyType === option.key}
                        onPress={() =>
                          setBodyType(
                            bodyType === option.key ? null : option.key,
                          )
                        }
                      >
                        <ScrollChipLabel selected={bodyType === option.key}>
                          {getVehicleBodyTypeLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>

                  <Label>{t("sellFieldColor")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleColors.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={color === option.key}
                        onPress={() =>
                          setColor(color === option.key ? null : option.key)
                        }
                      >
                        {/* The swatch does the work; the word is there for
                            anyone who cannot tell two greys apart. */}
                        <ColorSwatch tone={option.swatch} />
                        <ScrollChipLabel selected={color === option.key}>
                          {getVehicleColorLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>

                  <Label>{t("sellFieldFeatures")}</Label>
                  <FeatureWrap>
                    {vehicleFeatures.map((option) => {
                      const on = features.includes(option.key);
                      return (
                        <FeatureChip
                          key={option.key}
                          selected={on}
                          onPress={() =>
                            setFeatures((prev) =>
                              prev.includes(option.key)
                                ? prev.filter((item) => item !== option.key)
                                : [...prev, option.key],
                            )
                          }
                        >
                          <Ionicons
                            name={option.icon}
                            size={14}
                            color={on ? "#ffffff" : colors.textMuted}
                          />
                          <FeatureChipLabel selected={on}>
                            {getVehicleFeatureLabel(option.key, language)}
                          </FeatureChipLabel>
                        </FeatureChip>
                      );
                    })}
                  </FeatureWrap>
                  <FieldNote>{t("sellFeaturesHint")}</FieldNote>

                  <Label>{t("sellFieldDrivetrain")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleDrivetrains.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={drivetrain === option.key}
                        onPress={() =>
                          setDrivetrain(
                            drivetrain === option.key ? null : option.key,
                          )
                        }
                      >
                        <ScrollChipLabel selected={drivetrain === option.key}>
                          {getVehicleDrivetrainLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>

                  <Label>{t("sellFieldSeats")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {VEHICLE_SEAT_OPTIONS.map((option) => (
                      <ScrollChip
                        key={option}
                        selected={seats === option}
                        onPress={() =>
                          setSeats(seats === option ? null : option)
                        }
                      >
                        <ScrollChipLabel selected={seats === option}>
                          {option}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>

                  {/* The field with the most money attached to it. */}
                  <Label>{t("sellFieldCustoms")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleCustoms.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={customs === option.key}
                        onPress={() =>
                          setCustoms(customs === option.key ? null : option.key)
                        }
                      >
                        <ScrollChipLabel selected={customs === option.key}>
                          {getVehicleCustomsLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>
                  {customs ? (
                    <FieldNote>
                      {getVehicleCustomsHint(customs, language)}
                    </FieldNote>
                  ) : (
                    <FieldNote>{t("sellCustomsHint")}</FieldNote>
                  )}

                  <Label>{t("sellFieldPlate")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehiclePlates.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={plate === option.key}
                        onPress={() =>
                          setPlate(plate === option.key ? null : option.key)
                        }
                      >
                        <ScrollChipLabel selected={plate === option.key}>
                          {getVehiclePlateLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>

                  <Label>{t("sellFieldHistory")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleHistories.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={history === option.key}
                        onPress={() =>
                          setHistory(history === option.key ? null : option.key)
                        }
                      >
                        <ScrollChipLabel selected={history === option.key}>
                          {getVehicleHistoryLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>
                  <FieldNote>{t("sellHistoryHint")}</FieldNote>

                  <Label>{t("sellFieldSellerKind")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleSellerKinds.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={sellerKind === option.key}
                        onPress={() => selectSellerKind(option.key)}
                      >
                        <ScrollChipLabel selected={sellerKind === option.key}>
                          {getVehicleSellerKindLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>
                  <FieldNote>{t("sellSellerKindHint")}</FieldNote>

                  {/* The park picker follows the seller type and only exists
                      for sellers who actually keep stock on one. Most people
                      publishing here are individuals selling one car from
                      home: six park chips are noise to them, and worse, an
                      invitation to tag the nearest park by mistake — which
                      would put private cars in a directory of trading parks
                      and make its counts meaningless. */}
                  {STOCK_SELLER_KINDS.includes(sellerKind) ? (
                    <>
                      <Label>{t("sellFieldCarPark")}</Label>
                      <ChipScroll
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        {carParks.map((option) => (
                          <ScrollChip
                            key={option.key}
                            selected={carPark === option.key}
                            onPress={() =>
                              setCarPark(
                                carPark === option.key ? null : option.key,
                              )
                            }
                          >
                            <ScrollChipLabel selected={carPark === option.key}>
                              {option.name}
                            </ScrollChipLabel>
                          </ScrollChip>
                        ))}
                      </ChipScroll>
                      <FieldNote>{t("sellCarParkHint")}</FieldNote>
                    </>
                  ) : null}

                  {/* Only when it matters: an importer listing a car already
                      past the cap. On any other listing this would be noise. */}
                  {sellerKind === "importer" && isBeyondImportAge(year) ? (
                    <FieldNote>{t("sellImportAgeHint")}</FieldNote>
                  ) : null}

                  {/* Three states, one of which must be chosen. The old
                      unticked checkbox made "never answered" and "no papers"
                      publish identically. */}
                  <Label>{t("sellFieldDocuments")}</Label>
                  <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                    {vehicleDocuments.map((option) => (
                      <ScrollChip
                        key={option.key}
                        selected={documents === option.key}
                        onPress={() =>
                          setDocuments(
                            documents === option.key ? null : option.key,
                          )
                        }
                      >
                        <ScrollChipLabel selected={documents === option.key}>
                          {getVehicleDocumentsLabel(option.key, language)}
                        </ScrollChipLabel>
                      </ScrollChip>
                    ))}
                  </ChipScroll>
                  <FieldNote>
                    {documents
                      ? getVehicleDocumentsHint(documents, language)
                      : t("sellDocumentsHint")}
                  </FieldNote>
                </>
              ) : null}

              <Label>{t("sellFieldPrice")}</Label>
              <MoneyFieldRow>
                <Ionicons
                  name="cash-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <Input
                  value={price}
                  onChangeText={setPrice}
                  placeholder={t("sellFieldPricePlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
                <CurrencyTag>
                  {/* Per day for a rental, per month for a long lease, a flat
                      price for a sale — the unit follows the deal. */}
                  <CurrencyTagLabel>{vehiclePriceSuffix}</CurrencyTagLabel>
                </CurrencyTag>
              </MoneyFieldRow>
              {priceEcho ? <PriceEcho>{priceEcho}</PriceEcho> : null}
              <NegotiableRow onPress={() => setNegotiable((prev) => !prev)}>
                <Checkbox checked={negotiable}>
                  {negotiable ? (
                    <Ionicons name="checkmark" size={13} color="#ffffff" />
                  ) : null}
                </Checkbox>
                <NegotiableLabel>{t("sellFieldNegotiable")}</NegotiableLabel>
              </NegotiableRow>
            </>
          )}

          <Label>{t("sellFieldLocation")}</Label>
          <SelectorRow onPress={() => setLocationSheetOpen(true)}>
            <Ionicons
              name="location-outline"
              size={17}
              color={colors.textMuted}
            />
            <SelectorText muted={!selectedCity}>
              {selectedCity ?? t("sellFieldLocationPlaceholder")}
            </SelectorText>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </SelectorRow>

          <Label>{t("sellFieldDescription")}</Label>
          <TextAreaRow>
            <TextArea
              value={description}
              onChangeText={setDescription}
              placeholder={t(
                TRADE_DESC_HINT_KEYS[trade] ??
                  DESC_HINT_KEYS[selectedCategory] ??
                  "sellFieldDescriptionPlaceholder",
              )}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
            />
          </TextAreaRow>
        </ScrollView>

        <PublishDock>
          <PreviewButton
            onPress={() => setPreviewOpen(true)}
            disabled={assets.length === 0 && !isJobs}
          >
            <Ionicons name="eye-outline" size={16} color={EMERALD} />
            <PreviewButtonLabel>{t("sellPreviewButton")}</PreviewButtonLabel>
          </PreviewButton>
          <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
            <SubmitLabel>
              {isSubmitting
                ? `${t("adUploadingLabel")} ${Math.round(progress * 100)}%`
                : t(editing ? "editSaveButton" : "sellSubmitButton")}
            </SubmitLabel>
          </SubmitButton>
        </PublishDock>
      </Container>

      <Modal
        visible={categorySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={dismissCategorySheet}
      >
        <SheetBackdrop onPress={dismissCategorySheet}>
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetHandle />
            <SheetTitle>{t("sellChooseCategoryTitle")}</SheetTitle>
            <SheetScroll
              contentContainerStyle={{
                paddingBottom: spacing.lg + insets.bottom,
              }}
            >
              {SELLABLE_CATEGORIES.map((category) => {
                const selected = selectedCategory === category.key;
                return (
                  <SheetRow
                    key={category.key}
                    selected={selected}
                    tint={sectorTint(category.color, 0.09)}
                    onPress={() => {
                      setSelectedCategory(category.key);
                      setCategorySheetOpen(false);
                    }}
                  >
                    <CategoryIconWrap
                      tint={sectorTint(category.color, selected ? 0.2 : 0.12)}
                    >
                      <Ionicons
                        name={category.icon}
                        size={20}
                        color={category.color}
                      />
                    </CategoryIconWrap>
                    <SheetRowCol>
                      <SheetRowLabel selected={selected}>
                        {language === "en"
                          ? category.labelEn
                          : category.labelFr}
                      </SheetRowLabel>
                      {/* What actually belongs in it. The label alone left
                          Déco and Meubles overlapping in people's heads. */}
                      <SheetRowHint numberOfLines={1}>
                        {language === "en" ? category.hintEn : category.hintFr}
                      </SheetRowHint>
                    </SheetRowCol>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color={category.color}
                      />
                    ) : null}
                  </SheetRow>
                );
              })}
            </SheetScroll>
          </Sheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={locationSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setLocationSheetOpen(false)}
      >
        <SheetRoot>
          <SheetDismissArea onPress={() => setLocationSheetOpen(false)} />
          <Sheet>
            <SheetHandle />
            <SheetTitle>{t("sellChooseLocationTitle")}</SheetTitle>
            <CurrentLocationRow
              onPress={requestLocation}
              disabled={locationStatus === "locating"}
            >
              <CategoryIconWrap small tint={sectorTint(EMERALD, 0.12)}>
                {locationStatus === "locating" ? (
                  <ActivityIndicator size="small" color={EMERALD} />
                ) : (
                  <Ionicons name="locate" size={17} color={EMERALD} />
                )}
              </CategoryIconWrap>
              <CurrentLocationCol>
                <CurrentLocationLabel>
                  {t("sellUseCurrentLocation")}
                </CurrentLocationLabel>
                <CurrentLocationHint>
                  {t("sellUseCurrentLocationHint")}
                </CurrentLocationHint>
              </CurrentLocationCol>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
              />
            </CurrentLocationRow>
            {locationStatus === "denied" ? (
              <LocationErrorText>
                {t("nearestPharmacyPermissionDenied")}
              </LocationErrorText>
            ) : locationStatus === "error" ? (
              <LocationErrorText>
                {t("nearestPharmacyUnavailable")}
              </LocationErrorText>
            ) : null}
            <SearchBar value={citySearch} onChangeText={setCitySearch} />
            <SheetScroll
              contentContainerStyle={{
                paddingBottom: spacing.lg + insets.bottom,
              }}
            >
              {filteredCities.map((city) => (
                <SheetRow
                  key={city}
                  selected={selectedCity === city}
                  onPress={() => {
                    // Their answer, final: no later fix may overwrite it.
                    autoCityDone.current = true;
                    setSelectedCity(city);
                    setLocationSheetOpen(false);
                    setCitySearch("");
                  }}
                >
                  <CategoryIconWrap
                    small
                    tint={sectorTint(
                      EMERALD,
                      selectedCity === city ? 0.2 : 0.1,
                    )}
                  >
                    <Ionicons name="location" size={16} color={EMERALD} />
                  </CategoryIconWrap>
                  <SheetRowLabel selected={selectedCity === city}>
                    {city}
                  </SheetRowLabel>
                  {selectedCity === city ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={21}
                      color={colors.primary}
                    />
                  ) : null}
                </SheetRow>
              ))}
            </SheetScroll>
          </Sheet>
        </SheetRoot>
      </Modal>

      <Modal
        visible={previewOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPreviewOpen(false)}
      >
        <SheetBackdrop onPress={() => setPreviewOpen(false)}>
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetHandle />
            <PreviewHeaderRow>
              <PreviewTitleText>{t("sellPreviewButton")}</PreviewTitleText>
              <Pressable onPress={() => setPreviewOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </PreviewHeaderRow>
            <PreviewSubtitle>{t("sellPreviewSubtitle")}</PreviewSubtitle>
            <PreviewCardWrap style={{ width: previewCardWidth }}>
              <ListingCard listing={previewListing} />
            </PreviewCardWrap>
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Flex>
  );
}

// The longest form in the app, and until now nothing lifted it: on iOS the
// keyboard simply covered whichever field was being typed into, from the
// description downwards. It was already wrapped — the wrapper just was not
// doing anything.
const Flex = styled.KeyboardAvoidingView`
  flex: 1;
`;

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-top: ${spacing.xs}px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  margin-left: -${spacing.xs}px;
`;

const HeaderTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const DraftLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const ProgressWrap = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-top: ${spacing.sm}px;
`;

const ProgressTrack = styled.View`
  flex: 1;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.12);
  overflow: hidden;
`;

// Tri-colour rather than flat emerald, matching the sign-up wizard's bar —
// progress through the flag reads as progress through something official,
// and it ties the two halves of the seller journey together.
const ProgressFill = styled(LinearGradient)`
  height: 100%;
  border-radius: ${radius.pill}px;
`;

const FlagWrap = styled.View`
  width: 27px;
  height: 18px;
  border-radius: 3px;
  overflow: hidden;
  flex-direction: row;
  flex-shrink: 0;
`;

const FlagGreenBand = styled.View`
  width: 40%;
  background-color: ${FLAG_GREEN};
`;

const FlagRightCol = styled.View`
  flex: 1;
`;

const FlagYellowBand = styled.View`
  flex: 1;
  background-color: ${FLAG_YELLOW};
`;

const FlagRedBand = styled.View`
  flex: 1;
  background-color: ${FLAG_RED};
`;

const FlagEyebrowRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: ${spacing.md}px;
`;

const FlagEyebrowLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.3px;
  color: ${(props) => props.theme.textMuted};
`;

const FormHeadline = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 27px;
  line-height: 32px;
  color: ${(props) => props.theme.text};
  margin-bottom: 10px;
`;

const FormCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 14px;
  line-height: 21px;
  color: ${(props) => props.theme.textMuted};
  max-width: 320px;
  margin-bottom: ${spacing.lg}px;
`;

const ProgressLabel = styled.Text`
  font-size: 11px;
  font-family: ${fontFamily.semiBold};
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 0;
`;

const PromotedBanner = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  background-color: ${(props) => props.theme.accentLight};
  border-radius: ${radius.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const PromotedBannerLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.accentDark};
`;

// Matches the sign-up wizard's field label: darker and heavier than the
// muted caption this was, so a label reads as the name of the thing you're
// filling in rather than as hint text hovering above it.
const Label = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.lg}px;
  margin-bottom: 8px;
`;

// Its own row rather than a bare InputRow: these four stack, and InputRow
// carries no bottom margin, so they sat flush against one another as a
// single tall slab. The channel name moves above the field so the
// placeholder can show the format instead of repeating the label.
const LinkRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 62px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding: 8px 12px;
  margin-bottom: ${spacing.sm}px;
`;

const LinkIconWrap = styled.View`
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.tint};
`;

const LinkFieldCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const LinkFieldLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

const InputRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 54px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: 15px;
`;

const Input = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const PriceFieldRow = styled(InputRow)``;

// The one field on the form that decides whether anybody calls. It gets a
// taller box, a tinted border and numerals big enough to re-read before
// publishing — the generic PriceFieldRow above stays plain because it is
// also used for mileage, surface area and a phone number.
const MoneyFieldRow = styled(InputRow)`
  min-height: 62px;
  border-color: rgba(11, 110, 79, 0.4);
  background-color: rgba(11, 110, 79, 0.05);
`;

const PriceEcho = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  margin-top: 6px;
  margin-left: 4px;
  color: ${EMERALD};
`;

const CurrencyTag = styled.View`
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.sm}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 5px;
`;

const CurrencyTagLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

// Three tappable bands rather than a segmented control: the labels are
// long in French ("Sans expérience", "Plus de 3 ans") and a segmented
// control would either truncate them or force a font size nobody can read.
// Tapping the selected band again clears it — the field is optional, and a
// poster who picked one by accident needs a way back out.
// Shared by job type and job category: a two-column grid of real cards,
// each carrying its own colour. Both lists were flat text pills that filled
// solid emerald when picked, so every selection looked the same and the
// colour told you nothing about what you'd chosen.
// Multi-select, so these are chips rather than cards: an amenity is a yes
// or no you tick several of, not one choice among alternatives.

const DayRow = styled.View`
  flex-direction: row;
  gap: 5px;
`;

// Squared off, not a pill: seven circles in a row read as toggles floating
// loose, where a rounded square reads as a day in a week strip.
const DayChip = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 11px 0;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => (props.selected ? props.theme.primaryLight : props.theme.surface)};
  border-width: 1.5px;
  border-color: ${(props) => (props.selected ? EMERALD : props.theme.border)};
`;

const DayChipLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 12px;
  color: ${(props) => (props.selected ? props.theme.primaryDark : props.theme.text)};
`;

const HoursRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const HoursField = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  padding: 0 12px;
  height: 52px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const HoursSeparator = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 14px;
  color: ${(props) => props.theme.textMuted};
`;

const FieldNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 8px;
`;

// Amber, not red: the listing is publishable and this is advice about where
// it will be found, not an error about what is in it.
const BlockedWrap = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.lg}px ${spacing.md}px;
  gap: 12px;
`;

const BlockedIcon = styled.View`
  width: 64px;
  height: 64px;
  border-radius: 24px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
  margin-bottom: 4px;
`;

const BlockedTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 19px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const BlockedCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 20px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
`;

const BlockedAccount = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
`;

const BlockedList = styled.View`
  gap: 9px;
  margin-top: 6px;
  align-self: stretch;
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const BlockedListRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 9px;
`;

const BlockedListText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const BlockedButton = styled(Pressable)`
  align-self: stretch;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  margin-top: 6px;
  border-radius: 16px;
  background-color: ${(props) => props.theme.primary};
`;

const BlockedButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: #ffffff;
`;

const ChipWrapRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
`;

// flex-grow with an automatic basis, rather than a fixed percentage: these
// labels differ in length by a factor of three ("Batterie" against
// "Électricité auto"), so a column width picked in advance is either too
// wide for one or too narrow for the other. Growing lets each row share out
// exactly the space it has, which leaves no gap at the end of any of them —
// including the last, where a lone chip becomes full width.
const TradeChip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: auto;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0px 13px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.selected ? props.theme.primary : props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) =>
    props.selected ? props.theme.primary : props.theme.border};
`;

const TradeChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.selected ? "#ffffff" : props.theme.text)};
`;

const TradeWarning = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: rgba(217, 164, 65, 0.12);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.35);
`;

const TradeWarningText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #8a6415;
  flex-shrink: 1;
`;

const TradePlaced = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
`;

const TradePlacedText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
`;

const AddSizeButton = styled(Pressable)`
  min-height: 54px;
  padding: 0px 16px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.disabled ? props.theme.surfaceAlt : props.theme.primary};
`;

const AddSizeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
`;

const SizePill = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SizePillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const TyreSizeRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
`;

const TyreSizeField = styled.View`
  flex: 1;
`;

const TyreSizeSeparator = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const PickerGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
`;

// A full-width card centres its contents. Left-aligned, the icon and label
// sit in the corner of a row-wide card with dead space trailing off to the
// right, which reads as a layout mistake rather than a deliberate span.
const PickerCard = styled(Pressable)`
  width: ${(props) => props.width ?? "47.5%"};
  flex-direction: row;
  align-items: center;
  justify-content: ${(props) => (props.full ? "center" : "flex-start")};
  gap: 10px;
  padding: 11px 12px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.selected ? props.tint : props.theme.surface)};
  border-width: 1.5px;
  border-color: ${(props) => (props.selected ? props.accent : props.theme.border)};
`;

const PickerCardLabel = styled.Text`
  ${(props) => (props.full ? "" : "flex: 1;")}
  text-align: ${(props) => (props.full ? "center" : "left")};
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 12.5px;
  line-height: 16px;
  color: ${(props) => props.theme.text};
`;

const ExperienceRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const ExperienceOption = styled(Pressable)`
  flex: 1;
  align-items: center;
  gap: 6px;
  padding: 12px 6px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.selected ? props.tint : props.theme.surface)};
  border-width: 1.5px;
  border-color: ${(props) => (props.selected ? props.accent : props.theme.border)};
`;

// The same green/amber/red the home feed tints its cards with, so the
// choice made here is visibly the thing that shows up there.
const ExperienceDot = styled.View`
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background-color: ${(props) => props.accent};
`;

const ExperienceLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 12px;
  text-align: center;
  color: ${(props) => (props.selected ? props.accent : props.theme.text)};
`;

const NegotiableRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.sm}px;
`;

const Checkbox = styled.View`
  width: 20px;
  height: 20px;
  border-radius: 6px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.checked ? EMERALD : "transparent")};
  border-width: 1.5px;
  border-color: ${(props) => (props.checked ? EMERALD : props.theme.border)};
`;

const NegotiableLabel = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.text};
`;

const TextAreaRow = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  padding-top: ${spacing.md}px;
  ${shadow.card}
`;

const TextArea = styled.TextInput`
  height: 100px;
  text-align-vertical: top;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const SelectorRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: 15px;
  height: 54px;
`;

const SelectorText = styled.Text`
  flex: 1;
  ${type.body}
  color: ${(props) => (props.muted ? props.theme.textMuted : props.theme.text)};
`;

const PresetCategoryPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  align-self: flex-start;
  background-color: ${(props) => props.theme.primaryLight};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
`;

const PresetCategoryLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primaryDark};
`;

// A horizontal rail for the long option lists — twenty-four marques would
// take five rows as a wrapping grid and bury the fields under them.
const ChipScroll = styled.ScrollView.attrs({
  contentContainerStyle: { gap: 8, paddingRight: spacing.md },
})`
  flex-grow: 0;
  margin-bottom: ${spacing.md}px;
`;

const ScrollChip = styled(Pressable)`
  padding: 9px 15px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.selected ? EMERALD : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? EMERALD : props.theme.border)};
`;

const ScrollChipLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.bold : fontFamily.medium)};
  font-size: 12.5px;
  color: ${(props) => (props.selected ? "#ffffff" : props.theme.text)};
`;

const ConditionRow = styled.View`
  flex-direction: row;
  gap: ${spacing.xs}px;
`;

const BandRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 12px 14px;
  border-radius: ${radius.lg}px;
  margin-bottom: ${spacing.xs}px;
  background-color: ${(props) => (props.selected ? props.theme.primaryLight : props.theme.surface)};
  border-width: 1.5px;
  border-color: ${(props) => (props.selected ? EMERALD : props.theme.border)};
`;

const BandSymbol = styled.Text`
  width: 34px;
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => (props.selected ? EMERALD : props.theme.textMuted)};
`;

const BandTextCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const BandName = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const BandHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const ConditionPill = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding-vertical: 10px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => (props.selected ? EMERALD : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? EMERALD : props.theme.border)};
`;

const ConditionPillLabel = styled.Text`
  font-size: 11.5px;
  font-family: ${fontFamily.semiBold};
  color: ${(props) => (props.selected ? "#ffffff" : props.theme.text)};
  text-align: center;
`;

const MediaEmpty = styled(Pressable)`
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 130px;
  border-radius: ${radius.lg}px;
  border-width: 1.5px;
  border-color: rgba(11, 110, 79, 0.3);
  border-style: dashed;
  background-color: rgba(11, 110, 79, 0.04);
  padding-horizontal: ${spacing.lg}px;
`;

const MediaEmptyText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const MediaHintText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 6px;
  text-align: center;
`;

const FramingHint = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: 10px 12px;
  margin-bottom: ${spacing.sm}px;
  border-radius: ${radius.md}px;
  background-color: rgba(11, 110, 79, 0.07);
`;

const FramingHintText = styled.Text`
  flex: 1;
  ${type.caption}
  color: ${(props) => props.theme.text};
`;

const MediaTipText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
`;

const MediaRow = styled.ScrollView`
  flex-direction: row;
`;

const MediaTile = styled.View`
  width: ${MEDIA_TILE_SIZE}px;
  height: ${MEDIA_TILE_SIZE}px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  margin-right: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const TileImage = styled.Image`
  width: 100%;
  height: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const TileVideo = styled(VideoView)`
  width: 100%;
  height: 100%;
`;

const PrimaryBadge = styled.View`
  position: absolute;
  bottom: 5px;
  left: 5px;
  background-color: rgba(0, 0, 0, 0.55);
  border-radius: ${radius.pill}px;
  padding-horizontal: 6px;
  padding-vertical: 2px;
`;

const PrimaryBadgeLabel = styled.Text`
  font-size: 8.5px;
  font-family: ${fontFamily.semiBold};
  color: #ffffff;
`;

const RemoveTileButton = styled(Pressable)`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 9px;
  background-color: rgba(0, 0, 0, 0.55);
  align-items: center;
  justify-content: center;
`;

const AddMoreTile = styled(Pressable)`
  width: ${MEDIA_TILE_SIZE}px;
  height: ${MEDIA_TILE_SIZE}px;
  border-radius: ${radius.md}px;
  border-width: 1.5px;
  border-color: rgba(11, 110, 79, 0.3);
  border-style: dashed;
  align-items: center;
  justify-content: center;
`;

// No bottom padding at all: Container is a SafeAreaView with "bottom" among
// its edges, so the home-indicator inset already sits underneath this and
// supplies the clearance. Anything added here stacks on top of that inset
// and pushes the buttons up off the bottom of the screen.
const PublishDock = styled.View`
  padding: ${spacing.sm}px ${spacing.md}px 0px;
  gap: ${spacing.sm}px;
`;

const PreviewButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-vertical: 11px;
  border-radius: ${radius.md}px;
  border-width: 1px;
  border-color: ${EMERALD};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const PreviewButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const PreviewHeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${spacing.lg}px;
  margin-bottom: 4px;
`;

const PreviewTitleText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const PreviewSubtitle = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  padding-horizontal: ${spacing.lg}px;
  margin-bottom: ${spacing.md}px;
`;

const PreviewCardWrap = styled.View`
  align-self: center;
  padding-bottom: ${spacing.md}px;
`;

const SubmitButton = styled(Pressable)`
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};
  ${shadow.card}
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

// The dimmed area is a SIBLING of the sheet here, not its parent.
//
// It used to wrap it, which made every tap inside the sheet also a tap
// inside a Pressable that closes the modal — so the sheet fought that off
// with `onStartShouldSetResponder={() => true}`. That claims the touch
// responder for the sheet container itself, and a control inside it that
// needs its own responder (the search bar's mic) can end up never getting
// one. As a sibling there's no conflict and no need for the hack: a tap on
// the sheet simply isn't a tap on the backdrop any more.
const SheetRoot = styled.View`
  flex: 1;
  justify-content: flex-end;
`;

const SheetDismissArea = styled(Pressable)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  background-color: rgba(0, 0, 0, 0.4);
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const Sheet = styled.View`
  max-height: 80%;
  background-color: ${(props) => props.theme.background};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding-top: ${spacing.sm}px;
  padding-bottom: ${spacing.lg}px;
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
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  padding-horizontal: ${spacing.lg}px;
  margin-bottom: ${spacing.sm}px;
`;

// keyboardShouldPersistTaps: the sheet's own search field puts the keyboard
// up, and the default ("never") makes the next tap anywhere in this scroll
// get eaten dismissing it — so selecting a city while typing silently
// needed two taps. "handled" lets the row take the tap on the first try and
// still dismisses the keyboard.
// flex-shrink, and it is not cosmetic.
//
// The sheet around this is capped at 80% of the screen. A ScrollView with no
// shrink lays itself out at its full content height, is then clipped by that
// cap, and believes its viewport is as tall as its content — so it never
// scrolls, and everything past the fold is simply unreachable. Thirteen
// categories do not fit on a phone, which is how Services and Communauté and
// Emplois came to be missing from a list they were always in.
//
// The same sheet holds the 61-city picker, so that list was cut off too.
const SheetScroll = styled.ScrollView.attrs(() => ({
  keyboardShouldPersistTaps: "handled",
}))`
  flex-shrink: 1;
  padding-horizontal: ${spacing.md}px;
`;

// Selected state is the category's own colour at low alpha, not a generic
// emerald wash — the row that's chosen should look like the thing chosen.
const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 14px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 11px;
  border-radius: ${radius.md}px;
  background-color: ${(props) =>
    props.selected ? (props.tint ?? props.theme.primaryLight) : "transparent"};
`;

const CategoryIconWrap = styled.View`
  width: ${(props) => (props.small ? 32 : 40)}px;
  height: ${(props) => (props.small ? 32 : 40)}px;
  border-radius: ${(props) => (props.small ? 11 : 14)}px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: ${(props) => props.tint};
`;

const SheetRowCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const SheetRowHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const SheetRowLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

// A card rather than a bordered row: "use my current location" is the fast
// path through this sheet and should look like the recommended action, not
// like the first entry in the city list.
const CurrentLocationRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  margin: 0px ${spacing.md}px ${spacing.sm}px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.primaryLight};
  border-width: 1.5px;
  border-color: ${EMERALD};
`;

const CurrentLocationCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const CurrentLocationHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const CurrentLocationLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${EMERALD};
`;

const LocationErrorText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.error};
  padding-horizontal: ${spacing.lg}px;
  margin-bottom: ${spacing.xs}px;
`;

const ColorSwatch = styled.View`
  width: 14px;
  height: 14px;
  border-radius: 7px;
  margin-right: 7px;
  background-color: ${(props) => props.tone};
  border-width: 1px;
  border-color: rgba(0, 0, 0, 0.14);
`;

const FeatureWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;

// Same treatment as the trade chips above: amenity labels run from "Wifi"
// to "Groupe électrogène", so they fill their rows rather than being sized
// to a guess.
const FeatureChip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: auto;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 14px;
  min-height: 40px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.selected ? props.theme.primary : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) =>
    props.selected ? props.theme.primary : props.theme.border};
`;

const FeatureChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) =>
    props.selected ? props.theme.textInverse : props.theme.text};
`;
