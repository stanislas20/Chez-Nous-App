import { useMemo, useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { queryMatches } from "../utils/search";
import { compareNames } from "../utils/collate";
import {
  bandOf,
  driveHours,
  heritageRank,
  tourismBands,
  tourismOrigins,
  tourismSites,
} from "../data/tourismSites";

// Wikimedia refuses React Native's HTTP client by name.
//
// Android's Image goes out through okhttp, and upload.wikimedia.org
// answers "okhttp/4.9.2" with 403 while giving any browser 200 — their
// user-agent policy, which asks clients to identify themselves and
// contact. Measured, because there is nothing to see otherwise: the URL is
// right, the phone can reach the host, the card draws, the credit under it
// draws, and the photograph is simply absent. It would have shipped.
//
// So every Commons image is requested with a UA that says what this is and
// where to complain. Sending it is also the polite half of the bargain
// that lets an app use their bandwidth for free.
const WIKIMEDIA_UA =
  "ChezNous/1.0 (https://benin-marketplace-3eb04.web.app; marketplace app for Bénin) react-native";

function commonsSource(photo) {
  return { uri: photo.url, headers: { "User-Agent": WIKIMEDIA_UA } };
}

// Laterite, which is the colour of the roads this screen sends people
// down. The design's own accent.
const LATERITE = "#9C4221";
const LATERITE_DEEP = ["#B4551F", "#7C3813", "#47200A", "#2B1206"];

// One tint per category, so a row of cards reads as a row of different
// things rather than a wall of the same brown. Same table idea as
// statTints.js.
const CATEGORY_TINT = {
  heritage: "#B4551F",
  nature: "#2C7A4B",
  beach: "#1D7A94",
  museum: "#6B3A7A",
  worship: "#8A5A2B",
  memory: "#4A4FA6",
  town: "#A8701C",
};

const CATEGORY_ORDER = [
  "all",
  "heritage",
  "nature",
  "beach",
  "museum",
  "worship",
  "memory",
  "town",
];

const CATEGORY_KEY = {
  heritage: "tourismCatHeritage",
  nature: "tourismCatNature",
  beach: "tourismCatBeach",
  museum: "tourismCatMuseum",
  worship: "tourismCatWorship",
  memory: "tourismCatMemory",
  town: "tourismCatTown",
  all: "tourismCatAll",
};

// "8 h", "45 min", "2 h 30" — never "8.0 hours".
function driveLabel(hours) {
  if (hours == null) return null;
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes ? `${whole} h ${minutes}` : `${whole} h`;
}

export function TourismScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("cotonou");
  const [band, setBand] = useState("journee");
  const [category, setCategory] = useState("all");
  const [originSheetOpen, setOriginSheetOpen] = useState(false);
  const [failedPhotos, setFailedPhotos] = useState({});

  const originDef =
    tourismOrigins.find((item) => item.key === origin) ?? tourismOrigins[0];
  const trimmed = query.trim();

  // Everything decorated with what this origin makes of it, once.
  const decorated = useMemo(
    () =>
      tourismSites.map((site) => {
        const hours = driveHours(site, origin);
        return {
          ...site,
          hours,
          band: bandOf(hours),
          driveLabel: driveLabel(hours),
          rank: heritageRank(site),
        };
      }),
    [origin],
  );

  const matched = useMemo(() => {
    const list = decorated
      .filter((site) => (category === "all" ? true : site.category === category))
      .filter((site) => (trimmed ? true : site.band === band))
      .filter((site) =>
        queryMatches(trimmed, site.name, site.nameEn, site.admin, site.summary),
      );
    // Listed heritage first, then the ones with a photograph, then the
    // nearest. Said on screen, because a sort that is not stated is a
    // ranking the reader cannot argue with.
    return list.sort(
      (a, b) =>
        b.rank - a.rank ||
        Number(Boolean(b.photo)) - Number(Boolean(a.photo)) ||
        (a.hours ?? 99) - (b.hours ?? 99) ||
        compareNames(a.name, b.name),
    );
  }, [decorated, category, band, trimmed]);

  const [pick, ...rest] = matched;

  const openMaps = (site) => {
    const target = `${site.latitude},${site.longitude}`;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`,
    );
  };

  const heritageLabel = (site) => {
    if (site.rank === 3) return t("tourismHeritageWorld");
    if (site.rank === 2) return t("tourismHeritageTentative");
    if (site.rank === 1) return t("tourismHeritageRamsar");
    return null;
  };

  const nameOf = (site) =>
    (language === "en" ? site.nameEn : site.name) ?? site.name;

  const renderMedia = (site, tall) => {
    const tint = CATEGORY_TINT[site.category] ?? LATERITE;
    // The gradient is drawn underneath every card, not instead of the
    // photograph. A picture that fails — Commons unreachable, the phone
    // offline, or the 403 below — then leaves a coloured card rather than
    // a black rectangle, and nobody has to notice it failed.
    return (
      <Media tall={tall}>
        <MediaFallback
          colors={[tint, "#1B1B1D"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        {site.photo && !failedPhotos[site.id] ? (
          <MediaPhoto
            source={commonsSource(site.photo)}
            resizeMode="cover"
            onError={() =>
              setFailedPhotos((current) => ({ ...current, [site.id]: true }))
            }
          />
        ) : (
          // No photograph rather than somebody else's. True of the Route
          // des Pêches and 39 others, and of anything Commons refused.
          null
        )}
        <MediaScrim
          colors={["transparent", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.78)"]}
          locations={[0, 0.45, 1]}
          pointerEvents="none"
        />
        <MediaTag tint={tint}>{t(CATEGORY_KEY[site.category])}</MediaTag>
        {heritageLabel(site) ? (
          <HeritageTag numberOfLines={1}>{heritageLabel(site)}</HeritageTag>
        ) : null}
      </Media>
    );
  };

  const renderFacts = (site) => (
    <>
      {site.summary ? (
        <Why numberOfLines={4}>{site.summary}</Why>
      ) : null}
      {/* The figure the design asked for, and the reason there is none.
          Nothing publishes Bénin's entry fees in a form worth repeating,
          and a visitor who drives two hours on a number this app invented
          has been failed by the app. */}
      <NoTariff>
        <Ionicons name="alert-circle-outline" size={14} color="#8a6415" />
        <NoTariffLabel>{t("tourismNoTariff")}</NoTariffLabel>
      </NoTariff>
      <Actions>
        <PrimaryAction onPress={() => openMaps(site)}>
          <Ionicons name="navigate-outline" size={15} color="#ffffff" />
          <PrimaryActionLabel>{t("tourismDirections")}</PrimaryActionLabel>
        </PrimaryAction>
        {site.alongKey === "restaurants" ? (
          <SecondaryAction onPress={() => navigation.navigate("Restaurants")}>
            <Ionicons name="restaurant-outline" size={15} color={colors.primary} />
            <SecondaryActionLabel numberOfLines={1}>
              {t("tourismAlongRestaurants")}
            </SecondaryActionLabel>
          </SecondaryAction>
        ) : site.article ? (
          <SecondaryAction onPress={() => Linking.openURL(site.article)}>
            <Ionicons name="book-outline" size={15} color={colors.primary} />
            <SecondaryActionLabel>{t("tourismReadMore")}</SecondaryActionLabel>
          </SecondaryAction>
        ) : null}
      </Actions>
      {/* CC BY-SA is a licence, not a courtesy: the photographer is named
          on the card that uses their work. */}
      {site.photo && !failedPhotos[site.id] ? (
        <Credit numberOfLines={1}>
          {t("tourismPhotoCredit", {
            author: site.photo.author,
            licence: site.photo.licence,
          })}
        </Credit>
      ) : null}
    </>
  );

  return (
    <Container edges={["left", "right", "bottom"]}>
      <Hero
        colors={LATERITE_DEEP}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + spacing.sm }}
      >
        <HeroMark pointerEvents="none">
          <Ionicons name="compass" size={168} color="rgba(255,255,255,0.09)" />
        </HeroMark>
        <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </BackButton>
        <HeroKicker>{t("tourismKicker")}</HeroKicker>
        <HeroTitle numberOfLines={2}>{t("tourismHeroTitle")}</HeroTitle>
        <HeroCopy>{t("tourismHeroCopy")}</HeroCopy>
        <SearchField>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.7)" />
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("tourismSearchPlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.6)"
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color="rgba(255,255,255,0.7)" />
            </Pressable>
          ) : null}
        </SearchField>
      </Hero>

      <Body
        showsVerticalScrollIndicator={false}
        contentContainerStyle={bodyContentStyle}
        keyboardShouldPersistTaps="handled"
      >
        {/* Where from, before how long. The band a site falls into is
            relative to the reader: from Natitingou the Pendjari is a
            morning out and Ganvié is the expedition. */}
        <OriginRow onPress={() => setOriginSheetOpen(true)}>
          <Ionicons name="location-outline" size={16} color={LATERITE} />
          <OriginCol>
            <OriginTiny>{t("tourismOriginFrom")}</OriginTiny>
            <OriginName numberOfLines={1}>{originDef.label}</OriginName>
          </OriginCol>
          <OriginChange>{t("tourismOriginChange")}</OriginChange>
        </OriginRow>

        <BandRow>
          {tourismBands.map((option) => {
            const active = band === option.key && !trimmed;
            const label = {
              proche: ["tourismBandProche", "tourismBandProcheSub"],
              journee: ["tourismBandJournee", "tourismBandJourneeSub"],
              weekend: ["tourismBandWeekend", "tourismBandWeekendSub"],
            }[option.key];
            return (
              <BandTab
                key={option.key}
                active={active}
                onPress={() => {
                  setQuery("");
                  setBand(option.key);
                }}
              >
                <BandLabel active={active} numberOfLines={1}>
                  {t(label[0])}
                </BandLabel>
                <BandSub active={active} numberOfLines={1}>
                  {t(label[1])}
                </BandSub>
              </BandTab>
            );
          })}
        </BandRow>

        <ChipScroller
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={chipContentStyle}
        >
          {CATEGORY_ORDER.map((key) => {
            const active = category === key;
            return (
              <Chip key={key} active={active} onPress={() => setCategory(key)}>
                <ChipLabel active={active}>{t(CATEGORY_KEY[key])}</ChipLabel>
              </Chip>
            );
          })}
        </ChipScroller>

        <CountRow>
          <CountLabel>{t("tourismCount", { count: matched.length })}</CountLabel>
          <SortNote numberOfLines={1}>{t("tourismSortNote")}</SortNote>
        </CountRow>

        {!matched.length ? (
          <Empty>
            <EmptyText>{t("tourismEmptyBand")}</EmptyText>
            <EmptyHint>{t("tourismEmptyBandHint")}</EmptyHint>
          </Empty>
        ) : (
          <>
            <PickCard>
              {renderMedia(pick, true)}
              <PickOverlay pointerEvents="none">
                <PickKicker>{t("tourismPickKicker")}</PickKicker>
                <PickTitle numberOfLines={2}>{nameOf(pick)}</PickTitle>
                <PickMeta numberOfLines={1}>
                  {[pick.admin, pick.driveLabel && t("tourismDrive", { hours: pick.driveLabel })]
                    .filter(Boolean)
                    .join(" · ")}
                </PickMeta>
              </PickOverlay>
              <CardBody>{renderFacts(pick)}</CardBody>
            </PickCard>

            {rest.map((site) => (
              <Card key={site.id}>
                {renderMedia(site, false)}
                <CardBody>
                  <CardTitle numberOfLines={2}>{nameOf(site)}</CardTitle>
                  <CardMeta numberOfLines={1}>
                    {[site.admin, site.driveLabel && t("tourismDrive", { hours: site.driveLabel })]
                      .filter(Boolean)
                      .join(" · ")}
                  </CardMeta>
                  {renderFacts(site)}
                </CardBody>
              </Card>
            ))}
          </>
        )}

        {/* The two questions a day out raises next, answered by screens
            this app already has rather than by a list of names nobody
            verified. */}
        <CrossRow onPress={() => navigation.navigate("Hotels")}>
          <Ionicons name="bed-outline" size={18} color={colors.primary} />
          <CrossLabel>{t("tourismSleepHere")}</CrossLabel>
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
        </CrossRow>
        <CrossRow onPress={() => navigation.navigate("Events")}>
          <Ionicons name="musical-notes-outline" size={18} color={colors.primary} />
          <CrossLabel>{t("tourismNightOut")}</CrossLabel>
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
        </CrossRow>

        <Footer>{t("tourismDriveIndicative")}</Footer>
        <Footer>{t("tourismGuidePrice")}</Footer>
        <Footer>{t("tourismSourceNote")}</Footer>
      </Body>

      <Modal
        visible={originSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setOriginSheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setOriginSheetOpen(false)}>
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetTitle>{t("tourismOriginTitle")}</SheetTitle>
            {tourismOrigins.map((option) => {
              const active = option.key === origin;
              return (
                <SheetRow
                  key={option.key}
                  active={active}
                  onPress={() => {
                    setOrigin(option.key);
                    setOriginSheetOpen(false);
                  }}
                >
                  <SheetRadio active={active}>
                    {active ? <SheetDot /> : null}
                  </SheetRadio>
                  <SheetCol>
                    <SheetLabel>{option.label}</SheetLabel>
                    <SheetSub>{option.sub}</SheetSub>
                  </SheetCol>
                </SheetRow>
              );
            })}
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const bodyContentStyle = { padding: spacing.md, paddingBottom: spacing.xl };
const chipContentStyle = { gap: spacing.sm, paddingRight: spacing.md };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  padding: 0 ${spacing.md}px ${spacing.md}px;
  border-bottom-left-radius: ${radius.lg}px;
  border-bottom-right-radius: ${radius.lg}px;
  overflow: hidden;
`;

const HeroMark = styled.View`
  position: absolute;
  right: -30px;
  bottom: -36px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  margin-left: -6px;
`;

const HeroKicker = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  letter-spacing: 1.1px;
  color: rgba(255, 255, 255, 0.72);
  margin-top: ${spacing.xs}px;
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 26px;
  line-height: 32px;
  color: #ffffff;
  margin-top: 4px;
`;

const HeroCopy = styled.Text`
  ${type.caption}
  color: rgba(255, 255, 255, 0.82);
  margin-top: 6px;
`;

const SearchField = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 10px ${spacing.md}px;
  margin-top: ${spacing.md}px;
`;

const SearchInput = styled.TextInput`
  flex: 1;
  ${type.body}
  color: #ffffff;
  padding: 0;
`;

const Body = styled.ScrollView`
  flex: 1;
`;

const OriginRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  ${shadow.card}
`;

const OriginCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const OriginTiny = styled.Text`
  ${type.caption}
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

const OriginName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const OriginChange = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
`;

const BandRow = styled.View`
  flex-direction: row;
  gap: 4px;
  background-color: ${(props) => props.theme.surfaceAlt ?? props.theme.surface};
  border-radius: ${radius.md}px;
  padding: 4px;
  margin-top: ${spacing.md}px;
`;

const BandTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: ${spacing.sm}px 4px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) =>
    props.active ? props.theme.background : "transparent"};
`;

const BandLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.active ? props.theme.text : props.theme.textMuted)};
`;

const BandSub = styled.Text`
  ${type.caption}
  font-size: 10px;
  margin-top: 2px;
  color: ${(props) => (props.active ? LATERITE : props.theme.textMuted)};
`;

const ChipScroller = styled.ScrollView`
  margin-top: ${spacing.md}px;
  flex-grow: 0;
`;

const Chip = styled(Pressable)`
  padding: 9px ${spacing.md}px;
  border-radius: 999px;
  border-width: 1px;
  background-color: ${(props) =>
    props.active ? LATERITE : props.theme.surface};
  border-color: ${(props) => (props.active ? LATERITE : props.theme.border)};
`;

const ChipLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const CountLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
`;

const SortNote = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
  margin-left: ${spacing.sm}px;
`;

const Empty = styled.View`
  padding: ${spacing.lg}px 0;
  align-items: center;
`;

const EmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.text};
  text-align: center;
`;

const EmptyHint = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: 6px;
`;

const PickCard = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.lg}px;
  overflow: hidden;
  margin-bottom: ${spacing.md}px;
  ${shadow.card}
`;

const Card = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.lg}px;
  overflow: hidden;
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const Media = styled.View`
  width: 100%;
  height: ${(props) => (props.tall ? 208 : 148)}px;
  background-color: #1b1b1d;
`;

// Pinned to the edges rather than sized at 100%. A percentage height on
// an Image resolves against a parent that RN has not measured yet, and the
// failure is silent: the view is there, the tag on top of it draws, and
// the photograph simply never appears.
const MediaPhoto = styled(Image)`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`;

const MediaFallback = styled(LinearGradient)`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`;

const MediaScrim = styled(LinearGradient)`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
`;

const MediaTag = styled.Text`
  position: absolute;
  top: ${spacing.sm}px;
  left: ${spacing.sm}px;
  ${type.caption}
  font-family: ${fontFamily.semiBold};
  color: #ffffff;
  background-color: ${(props) => props.tint};
  border-radius: 999px;
  padding: 4px 10px;
  overflow: hidden;
`;

const HeritageTag = styled.Text`
  position: absolute;
  top: ${spacing.sm}px;
  right: ${spacing.sm}px;
  ${type.caption}
  font-family: ${fontFamily.semiBold};
  color: #2b1206;
  background-color: #f2c14e;
  border-radius: 999px;
  padding: 4px 10px;
  overflow: hidden;
`;

const PickOverlay = styled.View`
  position: absolute;
  left: ${spacing.md}px;
  right: ${spacing.md}px;
  top: 128px;
`;

const PickKicker = styled.Text`
  ${type.caption}
  font-family: ${fontFamily.semiBold};
  color: rgba(255, 255, 255, 0.82);
  letter-spacing: 0.8px;
`;

const PickTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 20px;
  color: #ffffff;
  margin-top: 2px;
`;

const PickMeta = styled.Text`
  ${type.caption}
  color: rgba(255, 255, 255, 0.86);
  margin-top: 2px;
`;

const CardBody = styled.View`
  padding: ${spacing.md}px;
`;

const CardTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const CardMeta = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
  margin-bottom: 6px;
`;

const Why = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
  line-height: 19px;
`;

const NoTariff = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 6px;
  margin-top: ${spacing.sm}px;
`;

const NoTariffLabel = styled.Text`
  ${type.caption}
  color: #8a6415;
  flex: 1;
`;

const Actions = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
`;

const PrimaryAction = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  background-color: ${LATERITE};
  border-radius: 999px;
  padding: 9px ${spacing.md}px;
`;

const PrimaryActionLabel = styled.Text`
  ${type.captionMedium}
  color: #ffffff;
`;

const SecondaryAction = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 1;
  border-radius: 999px;
  padding: 9px ${spacing.md}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SecondaryActionLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
  flex-shrink: 1;
`;

const Credit = styled.Text`
  ${type.caption}
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.sm}px;
`;

const CrossRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
  ${shadow.card}
`;

const CrossLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const Footer = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.md}px;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.45);
  justify-content: flex-end;
`;

const Sheet = styled.View`
  background-color: ${(props) => props.theme.background};
  border-top-left-radius: ${radius.lg}px;
  border-top-right-radius: ${radius.lg}px;
  padding: ${spacing.lg}px ${spacing.md}px ${spacing.xl}px;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.md}px;
`;

const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.md}px;
  margin-bottom: ${spacing.sm}px;
  border-width: 1.5px;
  background-color: ${(props) => props.theme.surface};
  border-color: ${(props) => (props.active ? LATERITE : props.theme.border)};
`;

const SheetRadio = styled.View`
  width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  border-width: 1.5px;
  border-color: ${(props) => (props.active ? LATERITE : props.theme.border)};
`;

const SheetDot = styled.View`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${LATERITE};
`;

const SheetCol = styled.View`
  flex: 1;
`;

const SheetLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const SheetSub = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;
