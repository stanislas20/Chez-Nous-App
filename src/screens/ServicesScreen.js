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
  serviceRateTypesForTrade,
} from "../data/serviceRateTypes";
import {
  getServiceDepositBand,
  getServiceDepositLabel,
  getServiceWorkPlaceLabel,
  isHeavyDeposit,
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
  const [allTrades, setAllTrades] = useState(false);
  const [offerTrade, setOfferTrade] = useState(null);
  const [offerRate, setOfferRate] = useState(null);

  const familyTrades = useMemo(() => serviceTradesInFamily(family), [family]);
  // Two rows, then a way to ask for the rest.
  //
  // Families are not the same size: Beauté has five trades and Véhicules
  // sixteen. Wrapping all of them put six rows of chips between the
  // question and its answer — the count, the providers, the whole reason
  // the screen exists — so choosing Véhicules pushed the results off the
  // bottom of the phone. A filter that hides what it filters is not a
  // filter.
  //
  // Six is what fits in two rows at these widths. The rest are one tap
  // away and the tap says how many are behind it, which is the difference
  // between a control that admits it is truncating and one that quietly
  // stops.
  const TRADES_SHOWN = 6;
  const shownTrades = allTrades
    ? familyTrades
    : familyTrades.slice(0, TRADES_SHOWN);
  const hiddenTradeCount = familyTrades.length - shownTrades.length;
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
          {/* The one action this screen wants from a provider, where the
              Events banner puts its own: on the gradient, white on clay so
              it is the brightest thing on the screen, and reachable on
              arrival rather than after scrolling past every trade.
          
              It is a shortcut into the form, not a second copy of the
              offer tab: the tab is where somebody who is browsing decides
              to publish, this is for somebody who came to publish. Both
              end in the same place. */}
          <HeroActions>
            <HeroPostButton onPress={publish} hitSlop={6}>
              <Ionicons name="add" size={16} color={CLAY} />
              <HeroPostLabel>{t("servicesOfferCta")}</HeroPostLabel>
            </HeroPostButton>
          </HeroActions>
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
                    setAllTrades(false);
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

          <ChipWrap>
            {shownTrades.map((item) => {
              const on =
                mode === "find" ? trade === item.key : offerTrade === item.key;
              return (
                <Chip
                  key={item.key}
                  on={on}
                  onPress={() => {
                    if (mode === "find") {
                      setTrade(on ? null : item.key);
                      return;
                    }
                    setOfferTrade(on ? null : item.key);
                    // A rate belongs to the trade it was chosen for. Keeping
                    // "au m²" while the seller switches from carreleur to
                    // mécanicien publishes a listing priced by a unit that
                    // is no longer offered anywhere.
                    setOfferRate(null);
                  }}
                >
                  <ChipLabel on={on} numberOfLines={1}>
                    {t(item.labelKey)}
                  </ChipLabel>
                </Chip>
              );
            })}
            {hiddenTradeCount > 0 || allTrades ? (
              <MoreChip onPress={() => setAllTrades((prev) => !prev)}>
                <MoreChipLabel numberOfLines={1}>
                  {allTrades
                    ? t("servicesTradesLess")
                    : t("servicesTradesMore", { count: hiddenTradeCount })}
                </MoreChipLabel>
              </MoreChip>
            ) : null}
          </ChipWrap>

          {mode === "find" ? (
            <>
              <WhereRow>
                {/* Short forms here, the full sentence on the card. Three
                    tabs across a phone gives each about a hundred points,
                    and "Se déplace chez vous" was arriving as "Se déplace
                    chez v…" — a label whose end is cut off is a label the
                    reader has to guess at. */}
                {[
                  { key: "any", label: t("servicesWhereAny") },
                  { key: "onsite", label: t("servicesWhereOnsiteShort") },
                  { key: "workshop", label: t("servicesWhereWorkshopShort") },
                ]
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
              <ChipWrap>
                {/* Only the rates this trade could actually use. */}
                {serviceRateTypesForTrade(offerTrade).map((item) => {
                  const on = offerRate === item.key;
                  return (
                    <Chip
                      key={item.key}
                      on={on}
                      onPress={() => setOfferRate(on ? null : item.key)}
                    >
                      <ChipLabel on={on} numberOfLines={1}>
                        {getServiceRateLabel(item.key, language)}
                      </ChipLabel>
                    </Chip>
                  );
                })}
              </ChipWrap>

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

const HeroActions = styled.View`
  flex-direction: row;
  margin-top: ${spacing.md}px;
`;

// White on the gradient rather than an outline: this is the primary action
// of the screen, and an outlined button on a photograph-dark banner reads
// as secondary no matter what the label says.
const HeroPostButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 ${spacing.md}px;
  border-radius: ${radius.pill}px;
  background-color: #ffffff;
`;

const HeroPostLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13.5px;
  color: ${CLAY};
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

// Sized by the row rather than by a fixed 31%.
//
// Ten families over three columns leaves one tile alone on the last row,
// and at a fixed width it sat in the left third with two tile-shaped holes
// beside it, which reads as something failing to load. flex-basis sets the
// three-per-row rhythm and flex-grow spends whatever is left, so the last
// row's tile takes the full width and a row of two splits it in half. The
// same rule then survives a family being added or removed, which a
// hardcoded percentage does not.
const FamilyTile = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 28%;
  ${shadow.card};
  align-items: center;
  gap: 6px;
  padding: ${spacing.sm}px ${spacing.xs}px;
  border-radius: ${radius.lg}px;
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

// Wrapped, not scrolled sideways.
//
// Bâtiment has eight trades and Événements six. In a horizontal strip the
// first four fit and the fifth is sliced down the middle at the screen
// edge — which is the only hint that the rest exist, and it reads as a
// rendering fault rather than as an invitation to swipe. Somebody looking
// for a soudeur concluded there was no soudeur.
//
// Wrapping costs two lines of height and shows every trade at once, which
// is the whole job of a picker.
const ChipWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: ${spacing.md}px;
`;

// A filter, drawn as one.
//
// Three rows of controls doing three different jobs — navigate, filter,
// toggle — were arriving as one wall of identical white rectangles.
// Nothing told the eye which row was the subject and which were its
// qualifiers, so every visit meant reading all three to find out what they
// were. That is the cost of consistency applied where a difference
// belongs.
//
// So the trade chips step back: a tint instead of a border, no shadow, and
// shorter than the tiles above. They are the second question and they look
// like it.
//
// A rounded rectangle, not a pill.
//
// Pills are for chips that sit in a scrolling strip at their natural
// width. These fill their row, and a full-width pill reads as a submit
// button — the shape promises an action rather than a choice. The corner
// is one step tighter than the tiles above (12 against 16) because a
// smaller box wants a smaller radius; matching them exactly makes the
// chips look swollen.
//
// 44px minimum height is the smallest thing a thumb hits reliably, and it
// also makes every row the same height, which is what turns nine chips
// into a set rather than a heap.
//
// Sized by its row, like the family tiles above it.
//
// Packed by content alone, a wrapped row ends wherever the last chip
// happens to fall — "Conseil en image" sat alone against a third of a line
// of empty space, and each row broke at a different place, so nine chips
// read as a heap rather than a set. flex-grow hands the leftover width
// back to whichever chips are on that line, so every row finishes flush
// and the shape survives a trade being added or a word being longer in
// English than in French.
const Chip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: auto;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: ${spacing.xs}px ${spacing.sm}px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) =>
    props.on ? CLAY : "rgba(122, 74, 46, 0.07)"};
`;

const ChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  text-align: center;
  color: ${(props) => (props.on ? "#ffffff" : CLAY)};
`;

// Reveals the rest of the family rather than choosing anything, so it is
// not drawn as a choice: dashed, unfilled, the same height as the chips it
// stands among. Filled, it read as a fourteenth trade called "+10 autres".
const MoreChip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: auto;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: ${spacing.xs}px ${spacing.sm}px;
  border-radius: ${radius.sm}px;
  border-width: 1px;
  border-style: dashed;
  border-color: rgba(122, 74, 46, 0.32);
`;

const MoreChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  text-align: center;
  color: ${CLAY};
`;

// Three fixed answers to one question, one of them always true — which is
// what a segmented control is for, and why this is a single track with the
// answer sitting inside it rather than three more buttons.
//
// I had made it match the chips. That was the wrong kind of tidy: it made
// a toggle look like a filter, and left the eye no way to tell that
// choosing here replaces the last answer instead of adding to it.
const WhereRow = styled.View`
  flex-direction: row;
  gap: 3px;
  padding: 4px;
  border-radius: ${radius.md}px;
  background-color: rgba(0, 0, 0, 0.05);
  margin-bottom: ${spacing.md}px;
`;

const WhereTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: ${spacing.xs}px 4px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) =>
    props.on ? props.theme.surface : "transparent"};
`;

const WhereLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  text-align: center;
  color: ${(props) => (props.on ? CLAY : props.theme.textMuted)};
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
