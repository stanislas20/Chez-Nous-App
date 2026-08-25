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
import { openAccountGate } from "../utils/openAccountGate";
import { canPublish } from "../utils/canPublish";
import { openChat } from "../utils/openChat";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useBodyworkProviders } from "../hooks/useBodyworkProviders";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  bodyworkParts,
  bodyworkPhotoTips,
  bodyworkProblems,
  bodyworkServices,
  getBodyworkServiceLabel,
} from "../data/bodywork";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const TERRACOTTA = "#C1512D";

export function BodyworkScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [service, setService] = useState(null);
  const [problemKey, setProblemKey] = useState(null);

  const providers = useBodyworkProviders(coords);
  const ratings = useSellerRatings(providers.map((item) => item.sellerId));

  // The quote panel's button has to move the screen rather than describe
  // something: a photo needs a recipient, and the recipients are below.
  const scrollRef = useRef(null);
  const listY = useRef(0);
  const urgentY = useRef(0);

  const problem = bodyworkProblems.find((item) => item.key === problemKey);
  const primary = bodyworkProblems.filter((item) => item.primary);
  const rest = bodyworkProblems.filter((item) => !item.primary);

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  const matchingProviders = useMemo(() => {
    const list = service
      ? providers.filter((item) => item.bodyworkServices.includes(service))
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

  const serviceCounts = useMemo(() => {
    const counts = new Map();
    providers.forEach((item) => {
      item.bodyworkServices.forEach((key) =>
        counts.set(key, (counts.get(key) ?? 0) + 1),
      );
    });
    return counts;
  }, [providers]);

  // Counted, not claimed. When it is zero the panel says so instead of
  // inviting somebody to photograph damage for nobody.
  const photoQuoteCount = providers.filter(
    (item) => item.quotesFromPhotos,
  ).length;

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const message = [
      t("bodyQuoteOpen"),
      problem
        ? t("bodyQuoteProblem", {
            problem: language === "en" ? problem.labelEn : problem.labelFr,
          })
        : service
          ? t("bodyQuoteService", {
              service: getBodyworkServiceLabel(service, language),
            })
          : null,
      t("bodyQuoteAsk"),
    ]
      .filter(Boolean)
      .join(" ");
    Linking.openURL(
      `${url}${url.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`,
    ).catch(() => {});
  };

  // "Devis" is a photo message to the carrossier you chose, in a thread with
  // their name on it — not a request to Chez-Nous, which cannot look at a
  // dent and cannot price one.
  const askForQuote = (item) =>
    openChat({
      listing: item,
      listingTitle: title(item),
      user,
      navigation,
      t,
      attachOnOpen: true,
    });

  const goToBreakdown = () =>
    navigation.navigate("Breakdown", {
      problem: problem?.roadside ?? "accident",
    });

  const search = (query) =>
    navigation.navigate("CategoryListings", {
      categoryKey: "vehicles",
      labelEn: "Vehicles",
      labelFr: "Véhicules",
      initialQuery: query,
    });

  const openPostForm = () =>
    navigation.navigate("CreateListing", {
      categoryKey: "services",
      trade: "bodywork",
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
    // A collision does not get a second tap. Everything else on this screen
    // is a repair to arrange; this one is somebody standing next to a car
    // that has just been hit, so it opens Dépannage outright.
    if (item.primary) {
      navigation.navigate("Breakdown", { problem: item.roadside });
      return;
    }

    const next = problemKey === item.key ? null : item.key;
    setProblemKey(next);
    setService(next ? item.service : null);
    if (!next) return;

    // Both of the things a tap changes live below the fold: the roadside
    // card sits under eight more tiles, and the filtered list under the
    // whole screen. Selecting one and leaving the view where it was read as
    // a button that did nothing at all.
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
    if (problem && problem.service !== next) setProblemKey(null);
  };

  const scrollToList = () =>
    scrollRef.current?.scrollTo({
      y: Math.max(0, listY.current - spacing.md),
      animated: true,
    });

  const filterLabel = service
    ? getBodyworkServiceLabel(service, language)
    : null;

  const renderProblemTile = (item, full) => {
    const active = problemKey === item.key;
    return (
      <ProblemTile
        key={item.key}
        full={full}
        active={active}
        urgent={Boolean(item.primary)}
        onPress={() => selectProblem(item)}
      >
        <ProblemIcon active={active} urgent={Boolean(item.primary)}>
          <Ionicons
            name={item.icon}
            size={18}
            color={active ? "#ffffff" : item.primary ? TERRACOTTA : EMERALD}
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
          <HeroEyebrow>{t("bodyEyebrow")}</HeroEyebrow>
        </HeroTop>

        <HeroRow>
          <HeroCol>
            <HeroTitle>{t("bodyTitle")}</HeroTitle>
            <HeroCopy>{t("bodyIntro")}</HeroCopy>
          </HeroCol>

          {/* Drawn: a panel and a dent, in flat shapes. A stock photo of a
              body shop would read as a claim about a business. */}
          <PanelArt>
            <PanelSheet>
              <PanelDent />
            </PanelSheet>
            <PanelShadow />
          </PanelArt>
        </HeroRow>
      </Hero>

      <Scroll
        ref={scrollRef}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>{t("bodyProblemLabel")}</SectionLabel>

        {/* Alone and full width. Somebody who has just been hit is not
            choosing between paint finishes. */}
        <ProblemGrid>
          {primary.map((item) => renderProblemTile(item, true))}
          {rest.map((item) => renderProblemTile(item, false))}
        </ProblemGrid>

        <UrgentAnchor
          onLayout={(event) => {
            urgentY.current = event.nativeEvent.layout.y;
          }}
        />
        {problem?.roadside ? (
          <UrgentCard onPress={goToBreakdown}>
            <UrgentIcon>
              <Ionicons name="warning-outline" size={20} color={TERRACOTTA} />
            </UrgentIcon>
            <UrgentCol>
              <UrgentTitle>{t("bodyUrgentTitle")}</UrgentTitle>
              <UrgentCopy>{t("bodyUrgentCopy")}</UrgentCopy>
            </UrgentCol>
            <Ionicons name="chevron-forward" size={18} color={TERRACOTTA} />
          </UrgentCard>
        ) : null}

        {/* The middle of the screen, because in this trade the photographs
            are the conversation. */}
        <SectionLabel>{t("bodyQuoteLabel")}</SectionLabel>
        <PanelCard>
          <PanelTitle>{t("bodyQuoteTitle")}</PanelTitle>
          {/* Says who reads them. Chez-Nous does not look at damage and
              cannot price a repair, so it never says "montrez-nous". */}
          <PanelCopy>{t("bodyQuoteCopy")}</PanelCopy>
          <TipList>
            {bodyworkPhotoTips.map((tip) => (
              <TipRow key={tip.key}>
                <Ionicons name={tip.icon} size={14} color={EMERALD} />
                <TipText>
                  {language === "en" ? tip.labelEn : tip.labelFr}
                </TipText>
              </TipRow>
            ))}
          </TipList>
          {providers.length ? (
            <PanelButton onPress={scrollToList}>
              <Ionicons name="camera-outline" size={16} color="#ffffff" />
              <PanelButtonLabel>{t("bodyQuoteButton")}</PanelButtonLabel>
            </PanelButton>
          ) : (
            <PanelNote>{t("bodyQuoteNoPros")}</PanelNote>
          )}
          {photoQuoteCount > 0 ? (
            <PanelFoot>
              {t("bodyQuoteDeclared", { count: photoQuoteCount })}
            </PanelFoot>
          ) : null}
        </PanelCard>

        <SectionLabel>{t("bodyServicesLabel")}</SectionLabel>
        <ServiceGrid>
          {bodyworkServices.map((item) => {
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

        {/* A carrossier's price often turns on whether the customer brings
            the part, so the two belong on one screen. */}
        <SectionLabel>{t("bodyPartsLabel")}</SectionLabel>
        <PanelCard>
          <PanelCopy>{t("bodyPartsCopy")}</PanelCopy>
          <ChipWrap>
            {bodyworkParts.map((item) => (
              <ActionChip key={item.key} onPress={() => search(item.query)}>
                <Ionicons name="search" size={12} color={EMERALD} />
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
        <SectionLabel>{t("bodyProsLabel")}</SectionLabel>

        {filterLabel ? (
          <FilterRow>
            <FilterPill onPress={() => selectService(null)}>
              <FilterPillLabel>{filterLabel}</FilterPillLabel>
              <Ionicons name="close" size={13} color={EMERALD} />
            </FilterPill>
            <FilterCount>
              {t("bodyProsCount", { count: matchingProviders.length })}
            </FilterCount>
          </FilterRow>
        ) : null}

        {matchingProviders.map((shop) => {
          const score = ratings[shop.sellerId];
          const declared = shop.bodyworkServices
            .map((key) => getBodyworkServiceLabel(key, language))
            .filter(Boolean)
            .join(" · ");
          return (
            <Card
              key={shop.id}
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
                {/* Declared, so it can be said as a fact. */}
                {shop.quotesFromPhotos ? (
                  <QuotePill>
                    <QuoteLabel>{t("bodyPhotoQuotePill")}</QuoteLabel>
                  </QuotePill>
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
                <GhostButton onPress={() => askForQuote(shop)}>
                  <Ionicons name="camera-outline" size={15} color={EMERALD} />
                  <GhostLabel>{t("bodyQuoteAction")}</GhostLabel>
                </GhostButton>
              </ActionRow>

              {shop.whatsapp || shop.phone ? (
                <WhatsappRow
                  onPress={() => openWhatsapp(shop.whatsapp || shop.phone)}
                >
                  <Ionicons name="logo-whatsapp" size={15} color={EMERALD} />
                  <WhatsappLabel>{t("bodyWhatsapp")}</WhatsappLabel>
                </WhatsappRow>
              ) : null}
            </Card>
          );
        })}

        {matchingProviders.length === 0 ? (
          <EmptyCard>
            <EmptyTitle>
              {filterLabel
                ? t("bodyNoneService", { service: filterLabel })
                : t("bodyNoPros")}
            </EmptyTitle>
            <EmptyCopy>{t("bodyNoProsCopy")}</EmptyCopy>
          </EmptyCard>
        ) : null}

        {mayPublish ? (
          <PostCard onPress={startPosting}>
            <PostIcon>
              <Ionicons name="color-fill-outline" size={20} color={EMERALD} />
            </PostIcon>
            <PostCol>
              <PostTitle>{t("bodyPostTitle")}</PostTitle>
              <PostCopy>{t("bodyPostCopy")}</PostCopy>
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

// Curved at the base like every other header in the app.
const Hero = styled(LinearGradient)`
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
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

const PanelArt = styled.View`
  width: 76px;
  align-items: center;
  gap: 6px;
`;

const PanelSheet = styled.View`
  width: 62px;
  height: 46px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.14);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.3);
`;

const PanelDent = styled.View`
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background-color: rgba(217, 164, 65, 0.5);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.8);
`;

const PanelShadow = styled.View`
  width: 46px;
  height: 4px;
  border-radius: 2px;
  background-color: rgba(0, 0, 0, 0.22);
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

const ProblemTile = styled(Pressable)`
  flex-grow: 1;
  flex-basis: ${(props) => (props.full ? "100%" : "46%")};
  min-height: 92px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active
      ? props.urgent
        ? TERRACOTTA
        : EMERALD
      : props.urgent
        ? "rgba(193, 81, 45, 0.08)"
        : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) =>
    props.active
      ? props.urgent
        ? TERRACOTTA
        : EMERALD
      : props.urgent
        ? "rgba(193, 81, 45, 0.25)"
        : props.theme.border};
`;

const ProblemIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  background-color: ${(props) =>
    props.active
      ? "rgba(255, 255, 255, 0.2)"
      : props.urgent
        ? "rgba(193, 81, 45, 0.12)"
        : props.theme.primaryLight};
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

// Zero-height markers whose only job is to report where a section starts,
// so a tap can move the screen to what it changed.
const UrgentAnchor = styled.View`
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

const PanelNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
  font-style: italic;
`;

const PanelFoot = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${EMERALD};
`;

const TipList = styled.View`
  gap: 7px;
`;

const TipRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const TipText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  flex-shrink: 1;
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

const ServiceGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: ${spacing.md}px;
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

const ChipWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 7px;
`;

// Grows to fill its row rather than sizing to its label.
//
// These nine labels run from "Ailes" to "Rétroviseurs", so wrapping them at
// their natural widths left a different ragged gap at the end of every row —
// worst on the last, where two short words sat beside a third of a line of
// nothing. Growing lets each row divide the space it actually has, and a
// chip left alone on the final row takes the full width instead of hanging
// at the left.
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

// Zero-height marker whose only job is to report where the provider list
// starts, so the quote panel's button can scroll to it.
const ListAnchor = styled.View`
  height: 0px;
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

const QuotePill = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.1);
`;

const QuoteLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${EMERALD};
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

const WhatsappRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  border-radius: 14px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const WhatsappLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
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
