import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useCategoryListings } from "../hooks/useCategoryListings";
import { useAuth } from "../auth/AuthContext";
import { canPublish } from "../utils/canPublish";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useBannerStatusBar } from "../hooks/useBannerStatusBar";
import {
  getServiceTradeLabelKey,
  serviceFamilies,
  serviceTrades,
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
import { countContact } from "../utils/contactCount";
import { ScreenFooter } from "../components/ScreenFooter";
import { ListingMedia } from "../components/ListingMedia";

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
  // One category, bounded in the query. Every filter below already narrowed
  // to this category in JavaScript after downloading the whole catalogue.
  const { listings: listings } = useCategoryListings("services");
  const { user } = useAuth();
  useBannerStatusBar();

  // Publishing is Bénin-only, and this screen was inviting everybody.
  //
  // Somebody signed in on a foreign number saw "Publier mon service" on the
  // banner and a whole tab telling them how to price their work, and only
  // found out at the form that the account cannot post at all. An offer
  // withdrawn after it is accepted is worse than one never made.
  //
  // Signed out is not the same as barred: a person with no account may well
  // have a Bénin number, so they keep the invitation and meet the account
  // gate, which is a door rather than a wall. Same rule as the Events and
  // Garages screens, read from the same helper.
  const mayPublish = !user || canPublish(user);

  const [mode, setMode] = useState("find");
  const [family, setFamily] = useState("building");
  const [trade, setTrade] = useState(null);
  const [where, setWhere] = useState("any");
  const [allTrades, setAllTrades] = useState(false);
  const [query, setQuery] = useState("");

  // Two words is where a search stops matching everything. Below that the
  // list is not narrowed, it is shuffled.
  const searching = query.trim().length >= 2;
  const [offerTrade, setOfferTrade] = useState(null);
  const [offerRate, setOfferRate] = useState(null);

  const showOffer = mode === "offer" && mayPublish;

  // Everything published before the form started saving the trade.
  //
  // `trade` was only ever used to pick a worked example and was thrown
  // away, so every service listing that existed this morning carries none —
  // and a directory that groups by trade shows exactly none of them. Each
  // family read "0 prestataires" over a category with live listings in it,
  // which is the most confident way an app can lie.
  //
  // So they get a shelf of their own, last in the grid: no trade declared,
  // still somebody's business. It empties itself as providers republish.
  const UNTYPED = "untyped";
  const knownTrades = useMemo(
    () => new Set(serviceTrades.map((item) => item.key)),
    [],
  );

  const familyTrades = useMemo(
    () => (family === UNTYPED ? [] : serviceTradesInFamily(family)),
    [family],
  );
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
    // A search looks at the whole directory.
    //
    // Somebody typing a name is not browsing a family — they are looking
    // for a person they have heard of, and honouring the family filter
    // would answer "no such provider" about somebody the app is holding.
    // So the controls step aside while there is a query.
    if (searching) {
      const needle = query.trim().toLowerCase();
      const haystack = (item) =>
        [
          item.name,
          item.trade ? t(getServiceTradeLabelKey(item.trade)) : null,
          item.place,
          item.city,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
      return providers
        .filter((item) => haystack(item).includes(needle))
        .sort((a, b) => rank(a) - rank(b));
    }

    return providers
      .filter((item) => {
        if (trade) return item.trade === trade;
        if (family === UNTYPED) return !knownTrades.has(item.trade);
        return familyKeys.has(item.trade);
      })
      .filter(matchesWhere)
      .sort((a, b) => rank(a) - rank(b));
  }, [providers, trade, family, familyKeys, knownTrades, where, searching, query, t]);

  // What the query means, if it means a trade.
  //
  // "plomb" is not a provider's name, it is somebody reaching for
  // Plombier — and a directory that answers "no results" to that is being
  // obtuse about a word it knows. These become chips: one tap moves them
  // out of a text search and into the filtered list, which is the better
  // tool for what they were actually doing.
  const tradeMatches = useMemo(() => {
    if (!searching) return [];
    const needle = query.trim().toLowerCase();
    return serviceTrades
      .filter((item) => t(item.labelKey).toLowerCase().includes(needle))
      .slice(0, 4);
  }, [searching, query, t]);

  const ratings = useSellerRatings(
    useMemo(() => visible.map((item) => item.sellerId), [visible]),
  );

  // Every route out of this screen to a provider's phone goes through
  // countContact first — a tap on Appeler is the closest thing the app has
  // to a result, and it was not being recorded anywhere.
  const call = (listing, number) => {
    if (!number) return;
    countContact(listing);
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  // Through buildLinkUrl for the same reason Garages does it: providers type
  // a Bénin number the way it is written here, and wa.me needs it in
  // international form.
  const openWhatsapp = (listing, value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    countContact(listing);
    Linking.openURL(url).catch(() => {});
  };

  // Both questions answered. Never a gate on publishing — the form asks
  // everything again and properly — only a way to say back what has been
  // chosen so far.
  const offerReady = Boolean(offerTrade && offerRate);

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
      {/* Fixed, and paying for it by being short.
      
          A tall banner that stays costs the same height on every screen of
          the list, which is why the events screen let its own scroll away.
          This one keeps only what has to be permanent — where you are, and
          the one action a provider came for — and hands the sentence
          explaining the screen to the top of the scrolling body, where it
          is read once and then out of the way. */}
      <Hero
          colors={["#93583A", "#7A4A2E", "#452818"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + spacing.sm }}
        >
          {/* The watermark the proposed design puts behind every one of
              its banners, and the same one the events screen already
              carries: the trade's own tool, oversized, cropped by the
              corner, at a tenth of full white. It says which room you are
              in before a word is read, and at that opacity it never
              competes with the words for it. */}
          <HeroMark pointerEvents="none">
            <Ionicons
              name="construct-outline"
              size={170}
              color="rgba(255,255,255,0.1)"
            />
          </HeroMark>
          <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroKicker>{t("servicesKicker")}</HeroKicker>
          <HeroRow>
            <HeroTitle numberOfLines={2}>{t("servicesHeroTitle")}</HeroTitle>

          {/* The one action this screen wants from a provider, where the
              Events banner puts its own: on the gradient, white on clay so
              it is the brightest thing on the screen, and reachable on
              arrival rather than after scrolling past every trade.
          
              It is a shortcut into the form, not a second copy of the
              offer tab: the tab is where somebody who is browsing decides
              to publish, this is for somebody who came to publish. Both
              end in the same place. */}
            {mayPublish ? (
              <HeroPostButton onPress={publish} hitSlop={6}>
                <Ionicons name="add" size={16} color={CLAY} />
                <HeroPostLabel>{t("servicesOfferCtaShort")}</HeroPostLabel>
              </HeroPostButton>
            ) : null}
          </HeroRow>

          {/* In the banner, so it is reachable from anywhere in the list
              rather than only from the top — which is the whole reason the
              banner stopped scrolling. */}
          <SearchField>
            <Ionicons name="search" size={17} color="rgba(255,255,255,0.7)" />
            <SearchInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("servicesSearchPlaceholder")}
              placeholderTextColor="rgba(255,255,255,0.6)"
              returnKeyType="search"
              autoCorrect={false}
            />
            {query.length ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={17} color="rgba(255,255,255,0.7)" />
              </Pressable>
            ) : null}
          </SearchField>
        </Hero>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Body>
          <Lede>{t("servicesHeroCopy")}</Lede>
          <ModeRow>
            {/* The offer tab goes with it. Leaving it up would move the
                same dead end one tap further in. */}
            {[
              { key: "find", labelKey: "servicesModeFind", hintKey: "servicesModeFindHint" },
              ...(mayPublish
                ? [
                    {
                      key: "offer",
                      labelKey: "servicesModeOffer",
                      hintKey: "servicesModeOfferHint",
                    },
                  ]
                : []),
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

          {/* "Quel métier" is a question to somebody searching; to somebody
              publishing it is "votre métier". Same picker, different
              sentence, because the second person is describing themselves
              rather than looking for someone. */}
          {searching ? (
            <SearchHeader>
              <SearchScope numberOfLines={1}>
                {t("servicesSearchScope", { query: query.trim() })}
              </SearchScope>
              <ClearButton onPress={() => setQuery("")} hitSlop={8}>
                <ClearLabel>{t("servicesSearchClear")}</ClearLabel>
              </ClearButton>
            </SearchHeader>
          ) : null}

          {tradeMatches.length ? (
            <ChipWrap>
              {tradeMatches.map((item) => (
                <Chip
                  key={item.key}
                  on={false}
                  onPress={() => {
                    setFamily(item.family);
                    setTrade(item.key);
                    setAllTrades(false);
                    setQuery("");
                  }}
                >
                  <ChipLabel on={false} numberOfLines={1}>
                    {t(item.labelKey)}
                  </ChipLabel>
                </Chip>
              ))}
            </ChipWrap>
          ) : null}

          {searching ? null : (
            <>
          <StepRow>
            <StepMark>
              <StepNumber>1</StepNumber>
            </StepMark>
            <SectionLabel>
              {showOffer
                ? t("servicesOfferTradeLabel")
                : t("servicesFamilyLabel")}
            </SectionLabel>
          </StepRow>
          <FamilyGrid>
            {[
              ...serviceFamilies,
              {
                key: UNTYPED,
                icon: "ellipsis-horizontal-circle-outline",
                labelKey: "servicesFamilyUntyped",
              },
            ].map((item) => {
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
            </>
          )}

          {familyTrades.length && !searching ? (
          <ChipWrap>
            {shownTrades.map((item) => {
              const on =
                showOffer ? offerTrade === item.key : trade === item.key;
              return (
                <Chip
                  key={item.key}
                  on={on}
                  onPress={() => {
                    if (!showOffer) {
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
          ) : null}

          {!showOffer ? (
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
                    <CardRail
                      tone={
                        heavy
                          ? "#E0A415"
                          : depositLabel
                            ? EMERALD
                            : "rgba(0,0,0,0.08)"
                      }
                    />
                    {/* The work, at a size somebody can judge it by.
                    
                        It was a 46px square beside the name — big enough to
                        prove a photo exists and too small to show what was
                        built, sewn or repaired. For a trade that is the
                        whole pitch: nobody hires a carreleur from a
                        thumbnail of a floor.
                    
                        Through ListingMedia, which is what knows a cover can
                        be a video, that <Image> draws an .mp4 as nothing,
                        and which of the two stored copies to fetch. A
                        provider with no photo gets no empty grey band —
                        their card simply starts at their name. */}
                    {item.photoUrl ? (
                      <CardCover>
                        <ListingMedia listing={item} size="card" />
                      </CardCover>
                    ) : null}
                    <CardBody>
                    <CardTop>
                      <Monogram>
                        <MonogramText>
                          {(item.name ?? "").trim().charAt(0).toUpperCase() || "?"}
                        </MonogramText>
                      </Monogram>
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
                        onPress={() => call(item, item.phone)}
                      >
                        <Ionicons name="call" size={16} color="#ffffff" />
                        <CallLabel>{t("callButtonLabel")}</CallLabel>
                      </CallButton>
                      {item.whatsapp ? (
                        <WhatsappButton onPress={() => openWhatsapp(item, item.whatsapp)}>
                          <Ionicons
                          name="logo-whatsapp"
                          size={17}
                          color="#0b6b38"
                        />
                          <WhatsappLabel>WhatsApp</WhatsappLabel>
                        </WhatsappButton>
                      ) : null}
                    </ActionRow>
                    </CardBody>
                  </Card>
                );
              })}

              {visible.length === 0 ? (
                <Empty>
                  {searching
                    ? t("servicesSearchEmpty", { query: query.trim() })
                    : t("servicesEmpty")}
                </Empty>
              ) : null}

              <SafetyNote>
                <Ionicons name="alert-circle-outline" size={15} color="#8a6415" />
                <SafetyText>{t("servicesSafety")}</SafetyText>
              </SafetyNote>
            </>
          ) : (
            <>
              {/* Two questions and one action, in that order and looking
                  like it.
              
                  Before this, the trade chips, the rate chips, two
                  paragraphs of small print and the button were laid out as
                  one continuous column of things — a filter's shape used
                  for what is actually the first half of a form. Nothing
                  said how many questions there were, which had been
                  answered, or what the button would do with them. */}
              <StepRow>
                <StepMark>
                  <StepNumber>2</StepNumber>
                </StepMark>
                <SectionLabel>{t("servicesOfferBillLabel")}</SectionLabel>
              </StepRow>
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

              <OfferCard>
                {/* What the two answers add up to, said back. Somebody
                    scrolling past the grid to the button has no other way
                    to check what they picked. */}
                <SummaryRow>
                  <Ionicons
                    name={offerReady ? "checkmark-circle" : "ellipse-outline"}
                    size={17}
                    color={offerReady ? EMERALD : colors.textMuted}
                  />
                  <SummaryText numberOfLines={2}>
                    {offerReady
                      ? `${t(getServiceTradeLabelKey(offerTrade))} · ${getServiceRateLabel(offerRate, language)}`
                      : t("servicesOfferPending")}
                  </SummaryText>
                </SummaryRow>

                {/* A trade nobody listed is still a trade: the form takes a
                    custom category, so somebody whose métier is not in the
                    grid publishes anyway rather than bouncing off it. */}
                <OfferNote>{t("servicesOfferOther")}</OfferNote>
                <OfferNote>{t("servicesOfferNote")}</OfferNote>

                <PublishButton onPress={publish}>
                  <Ionicons name="add" size={17} color="#ffffff" />
                  <PublishLabel>{t("servicesOfferCta")}</PublishLabel>
                </PublishButton>
              </OfferCard>
            </>
          )}
        </Body>

        <ScreenFooter />
      </ScrollView>
    </Container>
  );
}

// react-native-safe-area-context's SafeAreaView, not React Native's.
//
// RN's own SafeAreaView takes the top inset on iOS and does nothing at all
// on Android — so this screen looked right on the phone I was testing and
// wrong on an iPhone: the banner started below the status bar, leaving a
// pale strip above it, while the hero also paid insets.top itself. The top
// inset can only be spent once, which is the same fault
// check-banner-top-inset.js was written for on the tab screens.
//
// This one honours `edges`, so the screen keeps the sides and the bottom
// and leaves the top to the banner.
const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  overflow: hidden;
  padding: ${spacing.md}px ${spacing.md}px ${spacing.lg}px;
  z-index: 2;
  shadow-color: #2a1409;
  shadow-offset: 0px 3px;
  shadow-opacity: 0.18;
  shadow-radius: 8px;
  elevation: 6;
`;

// Title and action on one line: the title says where you are, the button is
// why a provider opened the screen, and neither needs a paragraph between
// them to be understood.
const HeroMark = styled.View`
  position: absolute;
  right: -30px;
  bottom: -46px;
`;

const HeroRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
`;

const SearchField = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 46px;
  margin-top: ${spacing.md}px;
  padding: 0 ${spacing.md}px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.16);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.24);
`;

const SearchInput = styled(TextInput)`
  flex: 1;
  padding: 0;
  font-family: ${fontFamily.regular};
  font-size: 15px;
  color: #ffffff;
`;

const Lede = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 15px;
  line-height: 21px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
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
  font-size: 12px;
  letter-spacing: 1.6px;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  margin-bottom: ${spacing.sm}px;
`;

const HeroTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.bold};
  font-size: 24px;
  line-height: 30px;
  color: #ffffff;
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
  font-size: 15px;
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
  font-size: 15px;
  color: ${(props) => (props.on ? props.theme.text : props.theme.textMuted)};
`;

const ModeHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  margin-top: 2px;
  color: ${(props) => (props.on ? CLAY : props.theme.textMuted)};
`;

// A numbered step, because two questions in a row with no numbering read
// as two more filters. The number is the cheapest thing that says "there
// are a fixed few of these and you are on the first".
const StepRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;

const StepMark = styled.View`
  width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background-color: rgba(122, 74, 46, 0.1);
`;

const StepNumber = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${CLAY};
`;

const OfferCard = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card};
`;

const SummaryRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-bottom: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SummaryText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const SearchHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const SearchScope = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const ClearButton = styled(Pressable)`
  padding: ${spacing.xs}px ${spacing.sm}px;
  border-radius: ${radius.sm}px;
  background-color: rgba(122, 74, 46, 0.07);
`;

const ClearLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${CLAY};
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
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
  font-size: 13px;
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
  font-size: 14px;
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
  font-size: 14px;
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
  font-size: 13.5px;
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
  font-size: 14px;
  color: ${(props) => props.theme.textMuted};
`;

const SortNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  color: ${(props) => props.theme.textMuted};
`;

// A card has to look like it is on top of the page, not printed on it.
//
// White on off-white, a hairline border and the standard card shadow put
// three weak signals in the same place and produced one weak result: at
// arm's length the providers read as paragraphs of a single document. A
// border AND a shadow is also muddled — either the card is a sheet above
// the page or a region drawn on it, and it should pick one.
//
// It picks the sheet: no border, a deeper shadow, a wider corner, and more
// air inside. The rail down the left is the deposit — green for none,
// amber for half or more — so the thing this whole screen is ordered by can
// be scanned without reading a word.
const Card = styled(Pressable)`
  border-radius: 20px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
  margin-bottom: ${spacing.md}px;
  shadow-color: #2a1409;
  shadow-offset: 0px 6px;
  shadow-opacity: 0.1;
  shadow-radius: 16px;
  elevation: 4;
`;

const CardCover = styled.View`
  height: 180px;
  background-color: ${(props) => props.theme.background};
`;

const CardBody = styled.View`
  padding: ${spacing.md}px;
`;

const CardRail = styled.View`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 4px;
  background-color: ${(props) => props.tone};
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;



const Monogram = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: rgba(122, 74, 46, 0.09);
`;

const MonogramText = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 18px;
  color: ${CLAY};
`;

const CardTopCol = styled.View`
  flex: 1;
`;

const ProviderName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 17px;
  line-height: 22px;
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
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const RatingCount = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  color: ${(props) => props.theme.textMuted};
`;

const NoRating = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  color: ${(props) => props.theme.textMuted};
`;

const TradeTag = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
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
  font-size: 12px;
  color: ${(props) => (props.heavy ? "#8a6415" : EMERALD)};
`;

const UnknownPill = styled.View`
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.045);
`;

const UnknownLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const RatePill = styled.Text`
  padding: 5px 10px;
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.045);
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
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
  font-size: 14px;
  line-height: 20px;
  color: ${(props) => props.theme.textMuted};
`;

const HeavyNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: #8a6415;
  background-color: rgba(224, 164, 21, 0.09);
  padding: ${spacing.sm}px;
  border-radius: ${radius.md}px;
  margin: 4px 0 ${spacing.sm}px;
`;

// Two ways to reach somebody, and they are not equal.
//
// They were drawn as equals — same width, same weight, one filled and one
// outlined in the same clay — so the row read as a choice to be made rather
// than an action to be taken, and the second-most-likely thing on the card
// was as loud as the first. Calling is what most people here do, and the
// button says so: it takes the width it needs and keeps the accent.
//
// WhatsApp keeps its own green rather than borrowing the screen's brown. It
// is a recognised mark and people find it by colour, not by reading — which
// is also why it can afford to be an icon and a short word.
//
// The row sits on a hairline above it, separated from the facts. Buttons
// pressed against the text they belong to read as part of the paragraph.
const ActionRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.sm}px;
  padding-top: ${spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const CallButton = styled(Pressable)`
  flex: 1.6;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  min-height: 48px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.muted ? props.theme.border : CLAY)};
  shadow-color: #2a1409;
  shadow-offset: 0px 4px;
  shadow-opacity: ${(props) => (props.muted ? 0 : 0.22)};
  shadow-radius: 10px;
  elevation: ${(props) => (props.muted ? 0 : 3)};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: #ffffff;
`;

const WhatsappButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  min-height: 48px;
  border-radius: ${radius.pill}px;
  background-color: rgba(37, 211, 102, 0.1);
`;

const WhatsappLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #0b6b38;
`;

const Empty = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 15px;
  line-height: 22px;
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
  font-size: 13px;
  line-height: 19px;
  color: #6b5a2e;
`;

const OfferNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 14px;
  line-height: 20px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const PublishButton = styled(Pressable)`
  flex-direction: row;
  min-height: 52px;
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
  font-size: 16px;
  color: #ffffff;
`;
