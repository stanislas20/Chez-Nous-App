import { useMemo, useState } from "react";
import { Linking, Pressable } from "react-native";
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
import { canPublish } from "../utils/canPublish";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { filterPartsSellers, usePartsSellers } from "../hooks/usePartsSellers";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  commonPartSearches,
  getPartCategoryExample,
  getPartCategoryLabel,
  getPartQualityLabel,
  getPartQualityNote,
  getPartSellerKind,
  getPartSellerKindLabel,
  partCategoriesFor,
  partQualities,
  partScopes,
} from "../data/vehicleParts";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// Tints for the kind of business, which is a fact about the shop rather than
// a quality judgement — so they read as labels, not as scores.
const KIND_TINTS = {
  emerald: { bg: "rgba(11,110,79,0.09)", fg: EMERALD },
  gold: { bg: "rgba(217,164,65,0.13)", fg: "#8a6415" },
  blue: { bg: "rgba(18,60,120,0.08)", fg: "#123A6B" },
  neutral: { bg: "rgba(0,0,0,0.05)", fg: "#6B6B6E" },
};

// Where to buy a part. Not which part fits — see vehicleParts.js.
export function PartsScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [scope, setScope] = useState("car");
  const [category, setCategory] = useState(null);
  const [quality, setQuality] = useState("all");
  const [query, setQuery] = useState("");

  const sellers = usePartsSellers(coords);
  const ratings = useSellerRatings(sellers.map((item) => item.sellerId));

  const isMoto = scope === "moto";
  const searching = query.trim().length >= 2;

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  const matching = useMemo(
    () => filterPartsSellers(sellers, { scope, category, quality, query }),
    [sellers, scope, category, quality, query],
  );

  // Counted from the listings themselves, never asserted — and counted within
  // the current scope, so a motorbike family never advertises a number that
  // came from car shops.
  const inScope = useMemo(
    () => filterPartsSellers(sellers, { scope, quality: "all", query: "" }),
    [sellers, scope],
  );
  const countFor = (key) =>
    inScope.filter((item) => (item.partCategories ?? []).includes(key)).length;

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const message = [
      t("partsQuoteOpen"),
      searching
        ? t("partsQuoteItem", { item: query.trim() })
        : category
          ? t("partsQuoteCategory", {
              category: getPartCategoryLabel(category, language),
            })
          : null,
      quality !== "all"
        ? t("partsQuoteQuality", {
            quality: getPartQualityLabel(quality, language),
          })
        : null,
      t("partsQuoteAsk"),
    ]
      .filter(Boolean)
      .join(" ");
    Linking.openURL(
      `${url}${url.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`,
    ).catch(() => {});
  };

  const openPostForm = () =>
    navigation.navigate("CreateListing", {
      categoryKey: "services",
      trade: "parts",
    });

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

  const switchScope = (key) => {
    if (key === scope) return;
    setScope(key);
    // A chain and sprockets mean nothing on a car, so a family chosen for one
    // must not survive into the other.
    setCategory(null);
  };

  return (
    <Container edges={["left", "right"]}>
      {/* Charcoal rather than the app's emerald.
          Every other car screen opens green; this one is the workshop shelf,
          and the darker ground is what makes the search field read as the
          first thing to use rather than one more banner. */}
      <Hero
        colors={["#2A3038", "#171C22", "#0D1116"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("partsEyebrow")}</HeroEyebrow>
        </HeroTop>

        <HeroTitle>{isMoto ? t("partsTitleMoto") : t("partsTitle")}</HeroTitle>
        <HeroCopy>{isMoto ? t("partsIntroMoto") : t("partsIntro")}</HeroCopy>

        <SearchField>
          <Ionicons name="search" size={17} color="rgba(255,255,255,0.6)" />
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("partsSearchPlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.45)"
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons
                name="close-circle"
                size={17}
                color="rgba(255,255,255,0.6)"
              />
            </Pressable>
          ) : null}
        </SearchField>
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScopeRow>
          {partScopes.map((option) => {
            const active = scope === option.key;
            return (
              <ScopeTab
                key={option.key}
                active={active}
                onPress={() => switchScope(option.key)}
              >
                <Ionicons
                  name={option.icon}
                  size={15}
                  color={active ? colors.text : colors.textMuted}
                />
                <ScopeLabel active={active}>
                  {language === "en" ? option.labelEn : option.labelFr}
                </ScopeLabel>
              </ScopeTab>
            );
          })}
        </ScopeRow>

        <SectionTitle>{t("partsFamiliesLabel")}</SectionTitle>
        <Grid>
          {partCategoriesFor(scope).map((item) => {
            const active = category === item.key;
            const count = countFor(item.key);
            return (
              <Tile
                key={item.key}
                active={active}
                onPress={() => setCategory(active ? null : item.key)}
              >
                <TileTop>
                  <Ionicons
                    name={item.icon}
                    size={17}
                    color={active ? EMERALD : colors.textMuted}
                  />
                  {count > 0 ? <TileCount>{count}</TileCount> : null}
                </TileTop>
                <TileLabel active={active} numberOfLines={1}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </TileLabel>
                <TileExample numberOfLines={2}>
                  {getPartCategoryExample(item, scope, language)}
                </TileExample>
              </Tile>
            );
          })}
        </Grid>

        <SectionTitle>{t("partsQualityLabel")}</SectionTitle>
        <SegmentRow>
          {partQualities.map((item) => {
            const active = quality === item.key;
            return (
              <Segment
                key={item.key}
                active={active}
                onPress={() => setQuality(item.key)}
              >
                <SegmentLabel active={active}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </SegmentLabel>
              </Segment>
            );
          })}
        </SegmentRow>
        {/* The note changes with the choice. "Adaptable" and "occasion" are
            not interchangeable and the difference is rarely explained at the
            counter — this is the one place the app can explain it. */}
        <QualityNote>{getPartQualityNote(quality, language)}</QualityNote>

        <CountRow>
          <CountText numberOfLines={2}>
            {searching
              ? t("partsCountSearch", {
                  count: matching.length,
                  item: query.trim(),
                })
              : category
                ? t("partsCountCategory", {
                    count: matching.length,
                    category: getPartCategoryLabel(category, language),
                  })
                : t("partsCountAll", {
                    count: matching.length,
                    scope: isMoto ? t("partsScopeMoto") : t("partsScopeCar"),
                  })}
          </CountText>
          <SortNote>{t("partsOpenFirst")}</SortNote>
        </CountRow>

        {searching ? <SearchNote>{t("partsSearchNote")}</SearchNote> : null}

        {matching.map((item) => {
          const score = ratings[item.sellerId];
          const kind = getPartSellerKind(item.partSellerKind);
          const tint = KIND_TINTS[kind?.tint ?? "neutral"];
          const qualityLine = item.partQualities
            .map((key) => getPartQualityLabel(key, language))
            .filter(Boolean)
            .join(" · ");
          return (
            <Card
              key={item.id}
              onPress={() =>
                navigation.navigate("ProductDetail", { listing: item })
              }
            >
              <CardTop>
                <Monogram>
                  <MonogramLabel>
                    {(title(item) || "?").slice(0, 2).toUpperCase()}
                  </MonogramLabel>
                </Monogram>
                <CardTitleCol>
                  <ShopName numberOfLines={1}>{title(item)}</ShopName>
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
                    {item.sellerVerified ? (
                      <VerifiedBadge>
                        <VerifiedLabel>{t("garageVerified")}</VerifiedLabel>
                      </VerifiedBadge>
                    ) : null}
                  </RatingRow>
                </CardTitleCol>
              </CardTop>

              <MetaRow>
                {kind ? (
                  <KindPill bg={tint.bg}>
                    <KindLabel fg={tint.fg}>
                      {getPartSellerKindLabel(kind.key, language)}
                    </KindLabel>
                  </KindPill>
                ) : null}
                {item.openNow != null ? (
                  <OpenPill open={item.openNow}>
                    <OpenDot open={item.openNow} />
                    <OpenLabel open={item.openNow}>
                      {!item.openNow
                        ? t("garageClosed")
                        : item.closeTime
                          ? t("garageOpenUntil", { time: item.closeTime })
                          : t("tyreOpenNow")}
                    </OpenLabel>
                  </OpenPill>
                ) : null}
                {item.place ? (
                  <MetaItem>
                    <Ionicons
                      name="location-outline"
                      size={11}
                      color={colors.textMuted}
                    />
                    <MetaText numberOfLines={1}>
                      {item.distanceKm != null
                        ? `${item.place} · ${item.distanceKm.toFixed(1)} km`
                        : item.place}
                    </MetaText>
                  </MetaItem>
                ) : null}
              </MetaRow>

              {/* Only what the shop actually declared. A blank line is left
                  out rather than filled with "non précisé", which would read
                  as a fact about the shop rather than about the form. */}
              {qualityLine || item.partBrands ? (
                <QualityTag numberOfLines={2}>
                  {[qualityLine, item.partBrands].filter(Boolean).join(" · ")}
                </QualityTag>
              ) : null}
              {item.partWarranty ? (
                <DetailLine numberOfLines={2}>{item.partWarranty}</DetailLine>
              ) : null}
              {item.partDelivery ? (
                <MutedLine numberOfLines={2}>{item.partDelivery}</MutedLine>
              ) : null}

              {item.partChecksFit ? (
                <FitPill>
                  <Ionicons name="checkmark" size={11} color={EMERALD} />
                  <FitLabel>{t("partsChecksFit")}</FitLabel>
                </FitPill>
              ) : null}

              <ActionRow>
                <CallButton
                  onPress={() => call(item.phone)}
                  disabled={!item.phone}
                >
                  <Ionicons name="call" size={15} color="#ffffff" />
                  <CallLabel>{t("garageContactCall")}</CallLabel>
                </CallButton>
                {item.whatsapp || item.phone ? (
                  <GhostButton
                    onPress={() => openWhatsapp(item.whatsapp || item.phone)}
                  >
                    <Ionicons name="logo-whatsapp" size={15} color={EMERALD} />
                    <GhostLabel>WhatsApp</GhostLabel>
                  </GhostButton>
                ) : null}
              </ActionRow>
            </Card>
          );
        })}

        {matching.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>
              {searching
                ? t("partsNoneForSearch", { item: query.trim() })
                : category || quality !== "all"
                  ? t("partsNoneMatching")
                  : t("partsNoSellers")}
            </EmptyTitle>
            <EmptyCopy>
              {searching
                ? t("partsNoneForSearchCopy")
                : t("partsNoSellersCopy")}
            </EmptyCopy>
            {/* Offered on an empty search, because a misspelling is the
                commonest reason for one and retyping is the last thing
                somebody wants to do. */}
            {searching ? (
              <>
                <SuggestLabel>{t("partsSuggestLabel")}</SuggestLabel>
                <SuggestRow>
                  {commonPartSearches[scope].map((item) => (
                    <SuggestChip key={item} onPress={() => setQuery(item)}>
                      <SuggestChipLabel>{item}</SuggestChipLabel>
                    </SuggestChip>
                  ))}
                </SuggestRow>
              </>
            ) : null}
          </EmptyCard>
        ) : null}

        {/* The advice the mockup ends on, kept as advice for the moment of
            buying: none of it is a check we performed. */}
        <SafetyCard>
          <Ionicons name="alert-circle-outline" size={15} color="#8a6415" />
          <SafetyText>{t("partsSafetyNote")}</SafetyText>
        </SafetyCard>

        {mayPublish ? (
          <PostCard onPress={startPosting}>
            <PostIcon>
              <Ionicons name="cog-outline" size={20} color={EMERALD} />
            </PostIcon>
            <PostCol>
              <PostTitle>{t("partsPostTitle")}</PostTitle>
              <PostCopy>{t("partsPostCopy")}</PostCopy>
            </PostCol>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
            />
          </PostCard>
        ) : null}
      </Scroll>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px
    ${spacing.md}px;
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
  background-color: rgba(255, 255, 255, 0.14);
`;

const HeroEyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 24px;
  color: #ffffff;
  margin-bottom: 6px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: ${spacing.md}px;
`;

const SearchField = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 50px;
  padding: 0px 15px;
  border-radius: ${radius.lg}px;
  background-color: rgba(255, 255, 255, 0.1);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.16);
`;

const SearchInput = styled.TextInput`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: #ffffff;
  padding: 0px;
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const ScopeRow = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.md}px;
`;

const ScopeTab = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 42px;
  border-radius: ${radius.md}px;
  background-color: ${(props) =>
    props.active ? props.theme.surface : "transparent"};
`;

const ScopeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.active ? props.theme.text : props.theme.textMuted)};
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-bottom: 11px;
  margin-top: ${spacing.sm}px;
`;

const Grid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: ${spacing.md}px;
`;

const Tile = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 46%;
  min-height: 92px;
  padding: 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? "rgba(11,110,79,0.06)" : props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) =>
    props.active ? "rgba(11,110,79,0.45)" : props.theme.border};
`;

const TileTop = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
`;

const TileCount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

const TileLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.active ? EMERALD : props.theme.text)};
`;

const TileExample = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 15px;
  margin-top: 3px;
  color: ${(props) => props.theme.textMuted};
`;

const SegmentRow = styled.View`
  flex-direction: row;
  gap: 3px;
  padding: 4px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: 10px;
`;

const Segment = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 22%;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => (props.active ? EMERALD : "transparent")};
`;

const SegmentLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.textMuted)};
`;

const QualityNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  margin-bottom: 10px;
`;

const CountText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SortNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 0;
`;

const SearchNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const Card = styled(Pressable)`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
  gap: 9px;
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

const ShopName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const RatingRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
  flex-wrap: wrap;
`;

const RatingValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
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

const KindPill = styled.View`
  padding: 5px 10px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.bg};
`;

const KindLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: ${(props) => props.fg};
`;

const VerifiedBadge = styled.View`
  padding: 4px 8px;
  border-radius: ${radius.md}px;
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
  padding: 5px 10px;
  border-radius: ${radius.md}px;
  background-color: ${(props) =>
    props.open ? "rgba(11, 110, 79, 0.09)" : props.theme.surfaceAlt};
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

const QualityTag = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${EMERALD};
`;

const DetailLine = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
`;

const MutedLine = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const FitPill = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  padding: 5px 10px;
  border-radius: ${radius.md}px;
  background-color: rgba(11, 110, 79, 0.08);
`;

const FitLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${EMERALD};
`;

const ActionRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
`;

const CallButton = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.disabled ? "#9CA3AF" : EMERALD)};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
`;

const GhostButton = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 46px;
  border-radius: ${radius.lg}px;
  background-color: rgba(11, 110, 79, 0.07);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.22);
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
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

const SuggestLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.md}px;
  margin-bottom: 8px;
`;

const SuggestRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;

const SuggestChip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: auto;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SuggestChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const SafetyCard = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
  margin-bottom: ${spacing.md}px;
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 18px;
  color: ${(props) => props.theme.text};
`;

const PostCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 14px 15px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PostIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const PostCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const PostTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const PostCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;
