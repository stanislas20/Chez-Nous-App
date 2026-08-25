import { useMemo, useRef, useState } from "react";
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
import { openAccountGate, rootRouteKey } from "../utils/openAccountGate";
import { canPublish } from "../utils/canPublish";
import { openChat } from "../utils/openChat";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useElectricProviders } from "../hooks/useElectricProviders";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  electricAccessories,
  electricDiagnostics,
  electricLighting,
  electricProblemsFor,
  electricScopes,
  electricServicesFor,
  electricSolar,
  getElectricServiceLabel,
} from "../data/carElectrics";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const TERRACOTTA = "#C1512D";

export function ElectricScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [scope, setScope] = useState("car");
  // One filter, set from two places. A symptom tile and a service tile both
  // mean "show me who does this", so they write to the same value rather than
  // to two that could disagree about what the list below is showing.
  const [service, setService] = useState(null);
  const [problemKey, setProblemKey] = useState(null);

  // Same anchors as Carrosserie, for the same reason: a symptom tile at the
  // top of a ten-tile grid changes a card and a list that are both off
  // screen, so without this the tap looks inert.
  const scrollRef = useRef(null);
  const listY = useRef(0);
  const urgentY = useRef(0);

  const providers = useElectricProviders(coords);
  const ratings = useSellerRatings(providers.map((item) => item.sellerId));

  const problems = electricProblemsFor(scope);
  const services = electricServicesFor(scope);
  const problem = problems.find((item) => item.key === problemKey) ?? null;

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  // A provider who declared nothing still belongs in the unfiltered list —
  // their own words are why they are here — but they cannot honestly answer
  // a filter for a named service.
  const matchingProviders = useMemo(() => {
    const list = service
      ? providers.filter((item) => item.electricServices.includes(service))
      : providers;
    return [...list].sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return 0;
    });
  }, [providers, service]);

  // How many professionals declare each service, computed from the listings
  // themselves. A tile shows a number only when there is one to show — a
  // hard-coded "12 pros" would be the easiest lie on the screen.
  const serviceCounts = useMemo(() => {
    const counts = new Map();
    providers.forEach((item) => {
      item.electricServices.forEach((key) =>
        counts.set(key, (counts.get(key) ?? 0) + 1),
      );
    });
    return counts;
  }, [providers]);

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const openWhatsapp = (value, shop) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const message = [
      t("electricQuoteOpen"),
      problem
        ? t("electricQuoteProblem", {
            problem: language === "en" ? problem.labelEn : problem.labelFr,
          })
        : service
          ? t("electricQuoteService", {
              service: getElectricServiceLabel(service, language),
            })
          : null,
      t("electricQuoteScope", {
        scope:
          language === "en"
            ? scope === "moto"
              ? "motorbike"
              : "car"
            : scope === "moto"
              ? "moto"
              : "voiture",
      }),
      t("electricQuoteAsk"),
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

  // A photo of a dashboard light, delivered where it can actually arrive:
  // the chat thread for the provider you picked. A standalone "montrer mon
  // problème" button would have no recipient, and a photo with no recipient
  // goes nowhere.
  const sendPhoto = (item) =>
    openChat({
      listing: item,
      listingTitle: title(item),
      user,
      navigation,
      t,
      attachOnOpen: true,
    });

  // The one path that leaves this screen for Dépannage, and only for the
  // faults that genuinely strand a vehicle. A klaxon does not, and sending
  // somebody to a recovery truck for one would cost them money for nothing.
  const goToBreakdown = () =>
    navigation.navigate("Breakdown", {
      problem: problem?.roadside ?? "electrical",
    });

  const findDiagnostics = () =>
    navigation.navigate("Garages", { specialty: "diag" });

  const search = (query) =>
    navigation.navigate("CategoryListings", {
      categoryKey: "vehicles",
      labelEn: "Vehicles",
      labelFr: "Véhicules",
      initialQuery: query,
    });

  const openEntry = (entry) => {
    if (entry.route) {
      navigation.navigate(entry.route, entry.params);
      return;
    }
    search(entry.query);
  };

  const openPostForm = () =>
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
          originKey: rootRouteKey(navigation),
          categoryKey: "services",
          trade: "electric",
        },
      },
    });

  const { remember } = useAccountGateIntent(user, openPostForm);

  // Signed out is a door, and the gate below opens it. Signed in on a
  // number that cannot publish is a wall, and offering to walk into it
  // is the dead promise the dashboard already stopped making.
  const mayPublish = !user || canPublish(user);

  const startPosting = () => {
    if (!user) {
      remember();
      openAccountGate(navigation);
      return;
    }
    openPostForm();
  };

  const selectProblem = (item) => {
    const next = problemKey === item.key ? null : item.key;
    setProblemKey(next);
    setService(next ? item.service : null);
    if (!next) return;
    const target = item.roadside ? urgentY : listY;
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({
        y: Math.max(0, target.current - spacing.md),
        animated: true,
      }),
    );
  };

  const selectService = (key) => {
    const next = service === key ? null : key;
    setService(next);
    // The symptom no longer describes what the list is showing, so it stops
    // claiming to.
    if (problem && problem.service !== next) setProblemKey(null);
  };

  const switchScope = (key) => {
    if (key === scope) return;
    setScope(key);
    // A car symptom means nothing on a motorbike, and a stator means nothing
    // on a car. Carrying either across would leave the list filtered by
    // something the grid above no longer offers.
    setProblemKey(null);
    setService(null);
  };

  const filterLabel = service
    ? getElectricServiceLabel(service, language)
    : null;

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
          <HeroEyebrow>{t("electricEyebrow")}</HeroEyebrow>
        </HeroTop>

        <HeroRow>
          <HeroCol>
            <HeroTitle>{t("electricTitle")}</HeroTitle>
            <HeroCopy>{t("electricIntro")}</HeroCopy>
          </HeroCol>

          {/* Drawn, not photographed. A stock photo of somebody else's
              workshop on a marketplace hero reads as a claim about a
              business that is not ours. */}
          <SparkArt>
            <SparkRing>
              <Ionicons name="flash" size={26} color={GOLD} />
            </SparkRing>
            <WireRow>
              <Wire />
              <Wire short />
              <Wire />
            </WireRow>
          </SparkArt>
        </HeroRow>

        {/* Cars and motorbikes do not share a fault list, and in Cotonou the
            second is not a minority case. */}
        <ScopeRow>
          {electricScopes.map((option) => {
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
        ref={scrollRef}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* The symptom first. Nobody arrives here asking for an alternator
            diagnostic; they arrive because the lights went dim. */}
        <SectionLabel>{t("electricProblemLabel")}</SectionLabel>
        <ProblemGrid>
          {problems.map((item) => {
            const active = problemKey === item.key;
            return (
              <ProblemTile
                key={item.key}
                active={active}
                onPress={() => selectProblem(item)}
              >
                <ProblemIcon active={active}>
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={active ? "#ffffff" : EMERALD}
                  />
                </ProblemIcon>
                <ProblemLabel active={active} numberOfLines={1}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </ProblemLabel>
                <ProblemHint active={active} numberOfLines={2}>
                  {language === "en" ? item.hintEn : item.hintFr}
                </ProblemHint>
              </ProblemTile>
            );
          })}
        </ProblemGrid>

        <OtherButton onPress={findDiagnostics}>
          <Ionicons
            name="help-circle-outline"
            size={16}
            color={colors.textMuted}
          />
          <OtherLabel>{t("electricOtherProblem")}</OtherLabel>
        </OtherButton>

        <UrgentAnchor
          onLayout={(event) => {
            urgentY.current = event.nativeEvent.layout.y;
          }}
        />
        {/* Only for the faults that actually immobilise a vehicle. */}
        {problem?.roadside ? (
          <UrgentCard onPress={goToBreakdown}>
            <UrgentIcon>
              <Ionicons name="warning-outline" size={20} color={TERRACOTTA} />
            </UrgentIcon>
            <UrgentCol>
              <UrgentTitle>{t("electricUrgentTitle")}</UrgentTitle>
              <UrgentCopy>{t("electricUrgentCopy")}</UrgentCopy>
            </UrgentCol>
            <Ionicons name="chevron-forward" size={18} color={TERRACOTTA} />
          </UrgentCard>
        ) : null}

        <SectionLabel>{t("electricServicesLabel")}</SectionLabel>
        <ServiceGrid>
          {services.map((item) => {
            const active = service === item.key;
            const count = serviceCounts.get(item.key) ?? 0;
            return (
              <ServiceTile
                key={item.key}
                active={active}
                onPress={() => selectService(item.key)}
              >
                <ServiceTop>
                  <ServiceIcon active={active}>
                    <Ionicons
                      name={item.icon}
                      size={17}
                      color={active ? "#ffffff" : EMERALD}
                    />
                  </ServiceIcon>
                  {/* Only ever a number we counted. */}
                  {count > 0 ? (
                    <CountPill active={active}>
                      <CountLabel active={active}>{count}</CountLabel>
                    </CountPill>
                  ) : null}
                </ServiceTop>
                <ServiceLabel active={active} numberOfLines={2}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </ServiceLabel>
                <ServiceDetail active={active} numberOfLines={2}>
                  {language === "en" ? item.detailEn : item.detailFr}
                </ServiceDetail>
              </ServiceTile>
            );
          })}
        </ServiceGrid>

        {/* Diagnostics get their own card because the answer is a workshop
            with a reader, not a mechanic with an opinion. */}
        <SectionLabel>{t("electricDiagLabel")}</SectionLabel>
        <PanelCard>
          <PanelTitle>{t("electricDiagTitle")}</PanelTitle>
          <PanelCopy>{t("electricDiagCopy")}</PanelCopy>
          <ChipWrap>
            {electricDiagnostics.map((item) => (
              <StaticChip key={item.labelEn}>
                <StaticChipLabel>
                  {language === "en" ? item.labelEn : item.labelFr}
                </StaticChipLabel>
              </StaticChip>
            ))}
          </ChipWrap>
          <PanelButton onPress={findDiagnostics}>
            <PanelButtonLabel>{t("electricDiagButton")}</PanelButtonLabel>
            <Ionicons name="chevron-forward" size={15} color="#ffffff" />
          </PanelButton>
        </PanelCard>

        {/* Lighting is the most-asked electrical job, and the one where the
            part is as often the answer as the labour — so both are here. */}
        <SectionLabel>{t("electricLightLabel")}</SectionLabel>
        <PanelCard>
          <PanelCopy>{t("electricLightCopy")}</PanelCopy>
          <ChipWrap>
            {electricLighting.map((item) => (
              <ActionChip key={item.key} onPress={() => search(item.query)}>
                <Ionicons name="search" size={12} color={EMERALD} />
                <ActionChipLabel>
                  {language === "en" ? item.labelEn : item.labelFr}
                </ActionChipLabel>
              </ActionChip>
            ))}
          </ChipWrap>
          <PanelGhost onPress={() => selectService("light")}>
            <Ionicons name="construct-outline" size={15} color={EMERALD} />
            <PanelGhostLabel>{t("electricLightFit")}</PanelGhostLabel>
          </PanelGhost>
        </PanelCard>

        <SectionLabel>{t("electricAccessoriesLabel")}</SectionLabel>
        <PanelCard>
          <PanelCopy>{t("electricAccessoriesCopy")}</PanelCopy>
          <ChipWrap>
            {electricAccessories.map((item) => (
              <ActionChip key={item.key} onPress={() => search(item.query)}>
                <Ionicons name="search" size={12} color={EMERALD} />
                <ActionChipLabel>
                  {language === "en" ? item.labelEn : item.labelFr}
                </ActionChipLabel>
              </ActionChip>
            ))}
          </ChipWrap>
          {/* The half that usually goes missing: an Android screen nobody
              can fit is a screen that goes back in the box. */}
          <PanelGhost onPress={() => selectService("install")}>
            <Ionicons name="construct-outline" size={15} color={EMERALD} />
            <PanelGhostLabel>{t("electricAccessoriesFit")}</PanelGhostLabel>
          </PanelGhost>
        </PanelCard>

        <SectionLabel>{t("electricSolarLabel")}</SectionLabel>
        <PanelCard>
          <PanelCopy>{t("electricSolarCopy")}</PanelCopy>
          <ChipWrap>
            {electricSolar.map((item) => (
              <ActionChip key={item.key} onPress={() => openEntry(item)}>
                <Ionicons
                  name={item.route ? "arrow-forward" : "search"}
                  size={12}
                  color={EMERALD}
                />
                <ActionChipLabel>
                  {language === "en" ? item.labelEn : item.labelFr}
                </ActionChipLabel>
              </ActionChip>
            ))}
          </ChipWrap>
        </PanelCard>

        <ListAnchor
          onLayout={(event) => {
            listY.current = event.nativeEvent.layout.y;
          }}
        />
        <SectionLabel>{t("electricProsLabel")}</SectionLabel>

        {/* What the list below is showing, and one tap to stop showing it. */}
        {filterLabel ? (
          <FilterRow>
            <FilterPill onPress={() => selectService(null)}>
              <FilterPillLabel>{filterLabel}</FilterPillLabel>
              <Ionicons name="close" size={13} color={EMERALD} />
            </FilterPill>
            <FilterCount>
              {t("electricProsCount", {
                count: matchingProviders.length,
              })}
            </FilterCount>
          </FilterRow>
        ) : null}

        {matchingProviders.map((shop) => {
          const score = ratings[shop.sellerId];
          const declared = shop.electricServices
            .map((key) => getElectricServiceLabel(key, language))
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

              {declared ? <DeclaredText>{declared}</DeclaredText> : null}

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
                      openWhatsapp(shop.whatsapp || shop.phone, shop)
                    }
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

              {/* A dashboard light is far easier to show than to describe,
                  and this is the only place a photo has somewhere to go. */}
              <PhotoButton onPress={() => sendPhoto(shop)}>
                <Ionicons name="camera-outline" size={16} color={EMERALD} />
                <PhotoCol>
                  <PhotoLabel>{t("electricSendPhoto")}</PhotoLabel>
                  <PhotoHint>{t("electricSendPhotoHint")}</PhotoHint>
                </PhotoCol>
                <Ionicons
                  name="chevron-forward"
                  size={15}
                  color={colors.textMuted}
                />
              </PhotoButton>
            </Card>
          );
        })}

        {matchingProviders.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>
              {filterLabel
                ? t("electricNoneService", { service: filterLabel })
                : t("electricNoPros")}
            </EmptyTitle>
            <EmptyCopy>{t("electricNoProsCopy")}</EmptyCopy>
          </EmptyCard>
        ) : null}

        {mayPublish ? (
          <PostCard onPress={startPosting}>
            <PostIcon>
              <Ionicons name="flash-outline" size={20} color={EMERALD} />
            </PostIcon>
            <PostCol>
              <PostTitle>{t("electricPostTitle")}</PostTitle>
              <PostCopy>{t("electricPostCopy")}</PostCopy>
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

const SparkArt = styled.View`
  width: 72px;
  align-items: center;
  gap: 8px;
`;

const SparkRing = styled.View`
  width: 52px;
  height: 52px;
  border-radius: 26px;
  align-items: center;
  justify-content: center;
  background-color: rgba(217, 164, 65, 0.16);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.45);
`;

const WireRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 6px;
`;

const Wire = styled.View`
  width: 3px;
  height: ${(props) => (props.short ? 10 : 16)}px;
  border-radius: 2px;
  background-color: rgba(255, 255, 255, 0.28);
`;

const ScopeRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
`;

const ScopeTab = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  border-radius: 14px;
  background-color: ${(props) =>
    props.active ? "#ffffff" : "rgba(255, 255, 255, 0.12)"};
  border-width: 1px;
  border-color: ${(props) =>
    props.active ? "#ffffff" : "rgba(255, 255, 255, 0.2)"};
`;

const ScopeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
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

const ProblemGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
`;

// flex-basis a shade under half, so two sit per row and the last one on an
// odd row grows to fill instead of leaving a gap beside it.
const ProblemTile = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 46%;
  min-height: 92px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const ProblemIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  background-color: ${(props) =>
    props.active ? "rgba(255, 255, 255, 0.2)" : props.theme.primaryLight};
`;

const ProblemLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const ProblemHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 15px;
  margin-top: 3px;
  color: ${(props) =>
    props.active ? "rgba(255,255,255,0.75)" : props.theme.textMuted};
`;

const OtherButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  margin-top: 10px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const OtherLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.textMuted};
`;

// Zero-height markers reporting where a section starts, so a tap can move
// the screen to the thing it changed.
const UrgentAnchor = styled.View`
  height: 0px;
`;

const ListAnchor = styled.View`
  height: 0px;
`;

const UrgentCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 14px 15px;
  margin-top: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: rgba(193, 81, 45, 0.08);
  border-width: 1px;
  border-color: rgba(193, 81, 45, 0.25);
`;

const UrgentIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: rgba(193, 81, 45, 0.12);
`;

const UrgentCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const UrgentTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const UrgentCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const ServiceGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
`;

const ServiceTile = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 46%;
  min-height: 108px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const ServiceTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const ServiceIcon = styled.View`
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
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.active ? "rgba(255, 255, 255, 0.22)" : props.theme.surfaceAlt};
`;

const CountLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.textMuted)};
`;

const ServiceLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const ServiceDetail = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 15px;
  margin-top: 3px;
  color: ${(props) =>
    props.active ? "rgba(255,255,255,0.75)" : props.theme.textMuted};
`;

const PanelCard = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
  gap: 10px;
`;

const PanelTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const PanelCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const ChipWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 7px;
`;

const StaticChip = styled.View`
  flex-grow: 1;
  flex-basis: auto;
  align-items: center;
  padding: 8px 11px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const StaticChipLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

// Grows to fill its row, matching the parts chips on Carrosserie.
//
// Three sections use these — lighting, accessories, 12V — and the widest
// label is four times the narrowest ("GPS" against "Capteurs de
// stationnement"), so wrapping at natural widths produced a different ragged
// edge in each section of the same screen.
const ActionChip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: auto;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  gap: 6px;
  padding: 8px 12px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.07);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.22);
`;

const ActionChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${EMERALD};
`;

const PanelButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  border-radius: 15px;
  background-color: ${EMERALD};
`;

const PanelButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
`;

const PanelGhost = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  border-radius: 15px;
  background-color: rgba(11, 110, 79, 0.07);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.22);
`;

const PanelGhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const FilterRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const FilterPill = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: ${radius.pill}px;
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

const DeclaredText = styled.Text`
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

const PhotoButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 10px 12px;
  border-radius: 14px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const PhotoCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const PhotoLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const PhotoHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 1px;
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
