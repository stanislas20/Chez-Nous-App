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
import { usePartsSellers } from "../hooks/usePartsSellers";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  getPartCategoryLabel,
  getPartConditionLabel,
  partBuyingTips,
  partCategoriesFor,
  partConditions,
  partScopes,
} from "../data/vehicleParts";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// Where to buy a part. Not which part fits — see vehicleParts.js.
export function PartsScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [scope, setScope] = useState("car");
  const [category, setCategory] = useState(null);
  const [condition, setCondition] = useState(null);

  const sellers = usePartsSellers(coords);
  const ratings = useSellerRatings(sellers.map((item) => item.sellerId));

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  // An undeclared field never excludes: a shop that wrote a good advert and
  // skipped the pickers still sells brake pads. Empty means unknown, not no —
  // the same rule the Chauffeurs filters follow.
  const matching = useMemo(() => {
    const keep = (declared, wanted) =>
      !wanted || declared.length === 0 || declared.includes(wanted);

    return [...sellers]
      .filter((item) => keep(item.partScopes, scope))
      .filter((item) => keep(item.partCategories, category))
      .filter((item) => keep(item.partConditions, condition))
      .sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm != null) return -1;
        if (b.distanceKm != null) return 1;
        return 0;
      });
  }, [sellers, scope, category, condition]);

  // Counted from the listings themselves, never asserted.
  const countFor = (field, key) =>
    sellers.filter((item) => (item[field] ?? []).includes(key)).length;

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const message = [
      t("partsQuoteOpen"),
      category
        ? t("partsQuoteCategory", {
            category: getPartCategoryLabel(category, language),
          })
        : null,
      condition
        ? t("partsQuoteCondition", {
            condition: getPartConditionLabel(condition, language),
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

  const openDirections = (item) => {
    const query = encodeURIComponent(
      [title(item), item.place, item.city].filter(Boolean).join(" "),
    );
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${query}`,
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
    // A chain and sprockets mean nothing on a car, so a filter chosen for one
    // must not survive into the other.
    setCategory(null);
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
          <HeroEyebrow>{t("partsEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroRow>
          <HeroCol>
            <HeroTitle>{t("partsTitle")}</HeroTitle>
            <HeroCopy>{t("partsIntro")}</HeroCopy>
          </HeroCol>

          {/* Drawn, not photographed.
              A stock photo of somebody else's brake disc on a marketplace
              banner reads as a claim about stock we do not have — the same
              reason Batterie draws its cell and Carrosserie draws its panel.
              These are three real parts in outline: a disc with its vents, a
              filter, and a cog behind them. */}
          <PartsArt>
            <BrakeDisc>
              <DiscHub />
              <DiscVent style={{ transform: [{ rotate: "0deg" }] }} />
              <DiscVent style={{ transform: [{ rotate: "60deg" }] }} />
              <DiscVent style={{ transform: [{ rotate: "120deg" }] }} />
            </BrakeDisc>
            <FilterBody>
              <FilterPleat />
              <FilterPleat />
              <FilterPleat />
            </FilterBody>
            <CogBadge>
              <Ionicons name="cog" size={20} color="#07362A" />
            </CogBadge>
          </PartsArt>
        </HeroRow>

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
                  color={active ? EMERALD : "rgba(255,255,255,0.8)"}
                />
                <ScopeLabel active={active}>
                  {language === "en" ? option.labelEn : option.labelFr}
                </ScopeLabel>
              </ScopeTab>
            );
          })}
        </ScopeRow>
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>{t("partsCategoryLabel")}</SectionLabel>
        <Grid>
          {partCategoriesFor(scope).map((item) => {
            const active = category === item.key;
            const count = countFor("partCategories", item.key);
            return (
              <Tile
                key={item.key}
                active={active}
                onPress={() => setCategory(active ? null : item.key)}
              >
                <TileTop>
                  <TileIcon active={active}>
                    <Ionicons
                      name={item.icon}
                      size={17}
                      color={active ? "#ffffff" : EMERALD}
                    />
                  </TileIcon>
                  {count > 0 ? (
                    <CountPill active={active}>
                      <CountLabel active={active}>{count}</CountLabel>
                    </CountPill>
                  ) : null}
                </TileTop>
                <TileLabel active={active} numberOfLines={2}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </TileLabel>
                <TileDetail active={active} numberOfLines={2}>
                  {language === "en" ? item.detailEn : item.detailFr}
                </TileDetail>
              </Tile>
            );
          })}
        </Grid>

        <SectionLabel>{t("partsConditionLabel")}</SectionLabel>
        <Grid>
          {partConditions.map((item) => {
            const active = condition === item.key;
            const count = countFor("partConditions", item.key);
            return (
              <Tile
                key={item.key}
                active={active}
                onPress={() => setCondition(active ? null : item.key)}
              >
                <TileTop>
                  <TileIcon active={active}>
                    <Ionicons
                      name={item.icon}
                      size={17}
                      color={active ? "#ffffff" : EMERALD}
                    />
                  </TileIcon>
                  {count > 0 ? (
                    <CountPill active={active}>
                      <CountLabel active={active}>{count}</CountLabel>
                    </CountPill>
                  ) : null}
                </TileTop>
                <TileLabel active={active} numberOfLines={2}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </TileLabel>
                <TileDetail active={active} numberOfLines={2}>
                  {language === "en" ? item.detailEn : item.detailFr}
                </TileDetail>
              </Tile>
            );
          })}
        </Grid>

        {/* Before the list, because it is advice for the moment of choosing.
            None of it is a check we performed; all of it is one the buyer
            can make before handing over money for a part we have never
            seen. */}
        <SectionLabel>{t("partsTipsLabel")}</SectionLabel>
        <TipsCard>
          {partBuyingTips.map((item) => (
            <TipRow key={item.key}>
              <Ionicons name={item.icon} size={15} color="#8a6415" />
              <TipText>
                {language === "en" ? item.labelEn : item.labelFr}
              </TipText>
            </TipRow>
          ))}
        </TipsCard>

        <SectionLabel>{t("partsSellersLabel")}</SectionLabel>
        {category || condition ? (
          <FilterRow>
            {category ? (
              <FilterPill onPress={() => setCategory(null)}>
                <FilterPillLabel>
                  {getPartCategoryLabel(category, language)}
                </FilterPillLabel>
                <Ionicons name="close" size={13} color={EMERALD} />
              </FilterPill>
            ) : null}
            {condition ? (
              <FilterPill onPress={() => setCondition(null)}>
                <FilterPillLabel>
                  {getPartConditionLabel(condition, language)}
                </FilterPillLabel>
                <Ionicons name="close" size={13} color={EMERALD} />
              </FilterPill>
            ) : null}
            <FilterCount>
              {t("partsSellerCount", { count: matching.length })}
            </FilterCount>
          </FilterRow>
        ) : null}

        {matching.map((item) => {
          const score = ratings[item.sellerId];
          const declared = item.partCategories
            .map((key) => getPartCategoryLabel(key, language))
            .filter(Boolean)
            .join(" · ");
          return (
            <Card
              key={item.id}
              closed={item.openNow === false}
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
                {item.partConditions.map((key) => (
                  <ConditionPill key={key}>
                    <ConditionPillLabel>
                      {getPartConditionLabel(key, language)}
                    </ConditionPillLabel>
                  </ConditionPill>
                ))}
              </MetaRow>

              {declared ? <DeclaredText>{declared}</DeclaredText> : null}

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
                <IconButton onPress={() => openDirections(item)}>
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

        {matching.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>
              {category || condition
                ? t("partsNoneMatching")
                : t("partsNoSellers")}
            </EmptyTitle>
            <EmptyCopy>{t("partsNoSellersCopy")}</EmptyCopy>
          </EmptyCard>
        ) : null}

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
  color: #ffffff;
  margin-bottom: 6px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.72);
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

// Three parts, overlapping the way they would on a counter rather than
// floating in a row: the disc behind, the filter in front of it, the cog
// tucked into the corner.
const PartsArt = styled.View`
  width: 92px;
  height: 82px;
`;

const BrakeDisc = styled.View`
  position: absolute;
  top: 0px;
  right: 4px;
  width: 62px;
  height: 62px;
  border-radius: 31px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.1);
  border-width: 2px;
  border-color: rgba(255, 255, 255, 0.45);
`;

const DiscHub = styled.View`
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background-color: rgba(255, 255, 255, 0.22);
  border-width: 1.5px;
  border-color: rgba(255, 255, 255, 0.5);
`;

// The slots a vented disc actually has, which is what makes the ring read as
// a brake disc rather than as a circle.
const DiscVent = styled.View`
  position: absolute;
  width: 2px;
  height: 44px;
  border-radius: 1px;
  background-color: rgba(255, 255, 255, 0.2);
`;

const FilterBody = styled.View`
  position: absolute;
  bottom: 0px;
  left: 0px;
  width: 40px;
  height: 46px;
  border-radius: 10px;
  padding: 7px 6px;
  gap: 5px;
  background-color: rgba(217, 164, 65, 0.24);
  border-width: 1.5px;
  border-color: rgba(217, 164, 65, 0.7);
`;

const FilterPleat = styled.View`
  height: 3px;
  border-radius: 2px;
  background-color: rgba(255, 255, 255, 0.55);
`;

const CogBadge = styled.View`
  position: absolute;
  bottom: 2px;
  right: 0px;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${GOLD};
`;

const ScopeRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
`;

const ScopeTab = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? "#ffffff" : "rgba(255, 255, 255, 0.12)"};
  border-width: 1px;
  border-color: ${(props) =>
    props.active ? "#ffffff" : "rgba(255, 255, 255, 0.2)"};
`;

const ScopeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.active ? EMERALD : "rgba(255,255,255,0.85)")};
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
  min-height: 110px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const TileTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const TileIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.active ? "rgba(255, 255, 255, 0.2)" : props.theme.primaryLight};
`;

const CountPill = styled.View`
  padding: 3px 8px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? "rgba(255, 255, 255, 0.22)" : props.theme.surfaceAlt};
`;

const CountLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.textMuted)};
`;

const TileLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const TileDetail = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 15px;
  margin-top: 3px;
  color: ${(props) =>
    props.active ? "rgba(255,255,255,0.75)" : props.theme.textMuted};
`;

const TipsCard = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.3);
  margin-bottom: ${spacing.md}px;
  gap: 9px;
`;

const TipRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
`;

const TipText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.text};
`;

const FilterRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const FilterPill = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 0px 12px;
  border-radius: ${radius.lg}px;
  background-color: rgba(11, 110, 79, 0.09);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.25);
`;

const FilterPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${EMERALD};
`;

const FilterCount = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
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

const ConditionPill = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ConditionPillLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => props.theme.text};
`;

const VerifiedBadge = styled.View`
  padding: 4px 8px;
  border-radius: ${radius.lg}px;
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
  border-radius: ${radius.lg}px;
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

const DeclaredText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
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

const IconButton = styled(Pressable)`
  width: 46px;
  height: 46px;
  border-radius: ${radius.lg}px;
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
