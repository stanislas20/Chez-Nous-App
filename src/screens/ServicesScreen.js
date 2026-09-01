import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useApprovedListings } from "../hooks/useApprovedListings";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useBannerStatusBar } from "../hooks/useBannerStatusBar";
import {
  getServiceTradeLabelKey,
  serviceFamilies,
  serviceTradesInFamily,
} from "../data/serviceTrades";
import {
  getServiceRateLabel,
  serviceRateTypes,
} from "../data/serviceRateTypes";
import {
  getServiceDepositBand,
  getServiceDepositLabel,
  getServiceWorkPlaceLabel,
  isHeavyDeposit,
  serviceWorkPlaces,
} from "../data/serviceTerms";
import { buildLinkUrl } from "../data/restaurantLinks";
import { ScreenFooter } from "../components/ScreenFooter";

const CLAY = "#7A4A2E";
const GOLD = "#D9A441";
const EMERALD = "#0B6E4F";

// Artisans and providers, ordered by what they ask for before they start.
//
// Built from the proposed design, with the invented parts replaced by real
// ones — the same rule the Garages screen followed:
//
//   - the providers are real approved Services listings, not six hardcoded
//     shops;
//   - ratings come from what people actually left, so somebody nobody has
//     rated shows no stars rather than an invented 4,7;
//   - the advance, where they work and what they guarantee are what the
//     provider declared in the form. Nothing here is inferred.
//
// The ordering is the argument. A price says what a job costs; the advance
// says what you risk before anything exists, and that is where money is
// actually lost in this market. Whoever asks for least is listed first, and
// a provider who declared nothing is listed last rather than shown as
// asking for nothing — an empty field is not a promise.
export function ServicesScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const listings = useApprovedListings();
  useBannerStatusBar();

  const [mode, setMode] = useState("find");
  const [family, setFamily] = useState("building");
  const [trade, setTrade] = useState(null);
  const [where, setWhere] = useState("any");
  const [offerTrade, setOfferTrade] = useState(null);
  const [offerRate, setOfferRate] = useState(null);

  const familyTrades = useMemo(() => serviceTradesInFamily(family), [family]);
  const familyKeys = useMemo(
    () => new Set(familyTrades.map((item) => item.key)),
    [familyTrades],
  );

  const providers = useMemo(() => {
    if (!listings) return [];
    return listings
      .filter((listing) => listing.categoryKey === "services")
      .map((listing) => ({
        ...listing,
        name: language === "en" ? listing.titleEn : listing.titleFr,
        place: listing.quartier || listing.area || listing.city || null,
        photoUrl: listing.mediaUrl ?? null,
      }));
  }, [listings, language]);

  const visible = useMemo(() => {
    const matchesWhere = (item) => {
      if (where === "any") return true;
      // "both" answers either question, so it must survive both filters.
      return item.serviceWorkPlace === where || item.serviceWorkPlace === "both";
    };
    const rank = (item) => {
      const band = getServiceDepositBand(item.serviceDeposit);
      return band ? band.percent : Number.POSITIVE_INFINITY;
    };
    return providers
      .filter((item) => (trade ? item.trade === trade : familyKeys.has(item.trade)))
      .filter(matchesWhere)
      .sort((a, b) => rank(a) - rank(b));
  }, [providers, trade, familyKeys, where]);

  const ratings = useSellerRatings(
    useMemo(() => visible.map((item) => item.sellerId), [visible]),
  );

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  // Through buildLinkUrl for the same reason Garages does it: providers type
  // a Bénin number the way it is written here, and wa.me needs it in
  // international form.
  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const publish = () =>
    navigation.navigate("MainTabs", {
      screen: "Sell",
      params: {
        screen: "CreateListing",
        params: { categoryKey: "services", trade: offerTrade ?? undefined },
      },
    });

  return (
    <Container edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* The banner scrolls, back button and all — the pattern the events
            screen settled on, for the reason it settled on it: a bar fixed
            over a list cuts the list in half the moment anything moves. */}
        <Hero
          colors={["#93583A", "#7A4A2E", "#452818"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + spacing.sm }}
        >
          <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroKicker>{t("servicesKicker")}</HeroKicker>
          <HeroTitle>{t("servicesHeroTitle")}</HeroTitle>
          <HeroCopy>{t("servicesHeroCopy")}</HeroCopy>
        </Hero>

        <Body>
          <ModeRow>
            {[
              { key: "find", labelKey: "servicesModeFind", hintKey: "servicesModeFindHint" },
              { key: "offer", labelKey: "servicesModeOffer", hintKey: "servicesModeOfferHint" },
            ].map((item) => (
              <ModeTab
                key={item.key}
                on={mode === item.key}
                onPress={() => setMode(item.key)}
              >
                <ModeLabel on={mode === item.key}>{t(item.labelKey)}</ModeLabel>
                <ModeHint on={mode === item.key}>{t(item.hintKey)}</ModeHint>
              </ModeTab>
            ))}
          </ModeRow>

          <SectionLabel>{t("servicesFamilyLabel")}</SectionLabel>
          <FamilyGrid>
            {serviceFamilies.map((item) => {
              const on = family === item.key;
              return (
                <FamilyTile
                  key={item.key}
                  on={on}
                  onPress={() => {
                    setFamily(item.key);
                    setTrade(null);
                    setOfferTrade(null);
                  }}
                >
                  <Ionicons
                    name={item.icon}
                    size={19}
                    color={on ? "#ffffff" : colors.textMuted}
                  />
                  <FamilyLabel on={on} numberOfLines={2}>
                    {t(item.labelKey)}
                  </FamilyLabel>
                </FamilyTile>
              );
            })}
          </FamilyGrid>

          <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
            {familyTrades.map((item) => {
              const on =
                mode === "find" ? trade === item.key : offerTrade === item.key;
              return (
                <Chip
                  key={item.key}
                  on={on}
                  onPress={() =>
                    mode === "find"
                      ? setTrade(on ? null : item.key)
                      : setOfferTrade(on ? null : item.key)
                  }
                >
                  <ChipLabel on={on}>{t(item.labelKey)}</ChipLabel>
                </Chip>
              );
            })}
          </ChipScroll>

          {mode === "find" ? (
            <>
              <WhereRow>
                {[{ key: "any", label: t("servicesWhereAny") }]
                  .concat(
                    serviceWorkPlaces
                      .filter((item) => item.key !== "both")
                      .map((item) => ({
                        key: item.key,
                        label: getServiceWorkPlaceLabel(item.key, language),
                      })),
                  )
                  .map((item) => (
                    <WhereTab
                      key={item.key}
                      on={where === item.key}
                      onPress={() => setWhere(item.key)}
                    >
                      <WhereLabel on={where === item.key} numberOfLines={1}>
                        {item.label}
                      </WhereLabel>
                    </WhereTab>
                  ))}
              </WhereRow>

              <CountRow>
                <CountText>
                  {t("servicesCount", { count: visible.length })}
                </CountText>
                <SortNote>{t("servicesSortNote")}</SortNote>
              </CountRow>

              {visible.map((item) => {
                const score = ratings?.[item.sellerId] ?? null;
                const rateLabel = getServiceRateLabel(item.serviceRateType, language);
                const depositLabel = getServiceDepositLabel(item.serviceDeposit, language);
                const whereLabel = getServiceWorkPlaceLabel(item.serviceWorkPlace, language);
                const heavy = isHeavyDeposit(item.serviceDeposit);
                return (
                  <Card
                    key={item.id}
                    onPress={() =>
                      navigation.navigate("ProductDetail", { listing: item })
                    }
                  >
                    <CardTop>
                      {item.photoUrl ? (
                        <PhotoWrap>
                          <Photo source={{ uri: item.photoUrl }} resizeMode="cover" />
                        </PhotoWrap>
                      ) : (
                        <Monogram>
                          <MonogramText>
                            {(item.name ?? "").trim().charAt(0).toUpperCase() || "?"}
                          </MonogramText>
                        </Monogram>
                      )}
                      <CardTopCol>
                        <ProviderName numberOfLines={2}>{item.name}</ProviderName>
                        <MetaLine>
                          {score ? (
                            <RatingWrap>
                              <Ionicons name="star" size={12} color={GOLD} />
                              <RatingValue>
                                {score.rating.toFixed(1).replace(".", ",")}
                              </RatingValue>
                              <RatingCount>
                                {t("garageReviewCount", { count: score.ratingCount })}
                              </RatingCount>
                            </RatingWrap>
                          ) : (
                            /* Never rated is not badly rated, and the two
                               must never look the same. */
                            <NoRating>{t("garageNoRating")}</NoRating>
                          )}
                          {item.trade ? (
                            <TradeTag>{t(getServiceTradeLabelKey(item.trade))}</TradeTag>
                          ) : null}
                        </MetaLine>
                      </CardTopCol>
                    </CardTop>

                    <BadgeRow>
                      {depositLabel ? (
                        <DepositPill heavy={heavy}>
                          <Ionicons
                            name={heavy ? "alert-circle-outline" : "checkmark-circle-outline"}
                            size={12}
                            color={heavy ? "#8a6415" : EMERALD}
                          />
                          <DepositLabel heavy={heavy}>{depositLabel}</DepositLabel>
                        </DepositPill>
                      ) : (
                        /* Said plainly rather than left blank: a provider
                           who did not answer has not promised anything. */
                        <UnknownPill>
                          <UnknownLabel>{t("servicesDepositUnknown")}</UnknownLabel>
                        </UnknownPill>
                      )}
                      {rateLabel ? <RatePill>{rateLabel}</RatePill> : null}
                    </BadgeRow>

                    {whereLabel || item.place ? (
                      <FactRow>
                        <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                        <FactText numberOfLines={1}>
                          {[whereLabel, item.place].filter(Boolean).join(" · ")}
                        </FactText>
                      </FactRow>
                    ) : null}

                    {item.serviceWarranty ? (
                      <FactRow>
                        <Ionicons name="shield-checkmark-outline" size={13} color={EMERALD} />
                        <FactText numberOfLines={2}>{item.serviceWarranty}</FactText>
                      </FactRow>
                    ) : null}

                    {heavy ? <HeavyNote>{t("servicesHeavyNote")}</HeavyNote> : null}

                    <ActionRow>
                      <CallButton
                        disabled={!item.phone}
                        muted={!item.phone}
                        onPress={() => call(item.phone)}
                      >
                        <Ionicons name="call" size={14} color="#ffffff" />
                        <CallLabel>{t("callButtonLabel")}</CallLabel>
                      </CallButton>
                      {item.whatsapp ? (
                        <WhatsappButton onPress={() => openWhatsapp(item.whatsapp)}>
                          <Ionicons name="logo-whatsapp" size={15} color={CLAY} />
                          <WhatsappLabel>WhatsApp</WhatsappLabel>
                        </WhatsappButton>
                      ) : null}
                    </ActionRow>
                  </Card>
                );
              })}

              {visible.length === 0 ? (
                <Empty>{t("servicesEmpty")}</Empty>
              ) : null}

              <SafetyNote>
                <Ionicons name="alert-circle-outline" size={15} color="#8a6415" />
                <SafetyText>{t("servicesSafety")}</SafetyText>
              </SafetyNote>
            </>
          ) : (
            <>
              <SectionLabel>{t("servicesOfferBillLabel")}</SectionLabel>
              <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
                {serviceRateTypes.map((item) => {
                  const on = offerRate === item.key;
                  return (
                    <Chip
                      key={item.key}
                      on={on}
                      onPress={() => setOfferRate(on ? null : item.key)}
                    >
                      <ChipLabel on={on}>
                        {getServiceRateLabel(item.key, language)}
                      </ChipLabel>
                    </Chip>
                  );
                })}
              </ChipScroll>

              {/* A trade nobody listed is still a trade. The form takes a
                  custom category, so somebody whose métier is not in the
                  grid publishes anyway rather than bouncing off it. */}
              <OfferNote>{t("servicesOfferOther")}</OfferNote>
              <OfferNote>{t("servicesOfferNote")}</OfferNote>

              <PublishButton onPress={publish}>
                <Ionicons name="add" size={17} color="#ffffff" />
                <PublishLabel>{t("servicesOfferCta")}</PublishLabel>
              </PublishButton>
            </>
          )}
        </Body>

        <ScreenFooter />
      </ScrollView>
    </Container>
  );
}

const Container = styled.SafeAreaView`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  padding: ${spacing.sm}px ${spacing.md}px ${spacing.lg}px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: flex-start;
  justify-content: center;
  margin-bottom: ${spacing.xs}px;
`;

const HeroKicker = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.6px;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  margin-bottom: ${spacing.xs}px;
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 26px;
  line-height: 31px;
  color: #ffffff;
  margin-bottom: ${spacing.xs}px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.78);
`;

const Body = styled.View`
  padding: ${spacing.md}px;
`;

const ModeRow = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  border-radius: 18px;
  background-color: rgba(0, 0, 0, 0.045);
  margin-bottom: ${spacing.md}px;
`;

const ModeTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: ${spacing.sm}px ${spacing.xs}px;
  border-radius: 15px;
  background-color: ${(props) => (props.on ? props.theme.surface : "transparent")};
`;

const ModeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.on ? props.theme.text : props.theme.textMuted)};
`;

const ModeHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10px;
  margin-top: 2px;
  color: ${(props) => (props.on ? CLAY : props.theme.textMuted)};
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const FamilyGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: ${spacing.md}px;
`;

const FamilyTile = styled(Pressable)`
  width: 31%;
  align-items: center;
  gap: 6px;
  padding: ${spacing.sm}px ${spacing.xs}px;
  border-radius: 18px;
  background-color: ${(props) => (props.on ? CLAY : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.on ? CLAY : props.theme.border)};
`;

const FamilyLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  text-align: center;
  color: ${(props) => (props.on ? "#ffffff" : props.theme.text)};
`;

const ChipScroll = styled.ScrollView.attrs({
  contentContainerStyle: { gap: 8, paddingRight: spacing.md },
})`
  margin-bottom: ${spacing.md}px;
`;

const Chip = styled(Pressable)`
  padding: ${spacing.xs}px ${spacing.sm}px;
  border-radius: 999px;
  background-color: ${(props) => (props.on ? CLAY : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.on ? CLAY : props.theme.border)};
`;

const ChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.on ? "#ffffff" : props.theme.text)};
`;

const WhereRow = styled.View`
  flex-direction: row;
  gap: 3px;
  padding: 4px;
  border-radius: 15px;
  background-color: rgba(0, 0, 0, 0.045);
  margin-bottom: ${spacing.md}px;
`;

const WhereTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: ${spacing.xs}px 4px;
  border-radius: 12px;
  background-color: ${(props) => (props.on ? props.theme.surface : "transparent")};
`;

const WhereLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => (props.on ? props.theme.text : props.theme.textMuted)};
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing.sm}px;
`;

const CountText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SortNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Card = styled(Pressable)`
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
  ${shadow.card};
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;

const PhotoWrap = styled.View`
  width: 46px;
  height: 46px;
  border-radius: 15px;
  overflow: hidden;
  background-color: ${(props) => props.theme.background};
`;

const Photo = styled.Image.attrs({ resizeMethod: "resize" })`
  width: 100%;
  height: 100%;
`;

const Monogram = styled.View`
  width: 46px;
  height: 46px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: rgba(122, 74, 46, 0.09);
`;

const MonogramText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${CLAY};
`;

const CardTopCol = styled.View`
  flex: 1;
`;

const ProviderName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const MetaLine = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 5px;
`;

const RatingWrap = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 3px;
`;

const RatingValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.text};
`;

const RatingCount = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const NoRating = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const TradeTag = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${CLAY};
`;

const BadgeRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: ${spacing.sm}px;
`;

const DepositPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background-color: ${(props) =>
    props.heavy ? "rgba(224, 164, 21, 0.13)" : "rgba(11, 110, 79, 0.08)"};
`;

const DepositLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => (props.heavy ? "#8a6415" : EMERALD)};
`;

const UnknownPill = styled.View`
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.045);
`;

const UnknownLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const RatePill = styled.Text`
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.045);
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => props.theme.text};
`;

const FactRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 7px;
  margin-bottom: 5px;
`;

const FactText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const HeavyNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #8a6415;
  background-color: rgba(224, 164, 21, 0.09);
  padding: ${spacing.sm}px;
  border-radius: ${radius.md}px;
  margin: 4px 0 ${spacing.sm}px;
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-top: 4px;
`;

const CallButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: ${spacing.sm}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => (props.muted ? props.theme.border : CLAY)};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
`;

const WhatsappButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: ${spacing.sm}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(122, 74, 46, 0.28);
`;

const WhatsappLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${CLAY};
`;

const Empty = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 21px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
  padding: ${spacing.lg}px ${spacing.md}px;
`;

const SafetyNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(224, 164, 21, 0.1);
  border-width: 1px;
  border-color: rgba(224, 164, 21, 0.28);
  margin-top: ${spacing.sm}px;
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 18px;
  color: #6b5a2e;
`;

const OfferNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 19px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const PublishButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${CLAY};
  margin-top: ${spacing.xs}px;
`;

const PublishLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #ffffff;
`;
