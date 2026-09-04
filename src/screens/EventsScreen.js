import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { setStatusBarStyle } from "expo-status-bar";
import { doc, increment, updateDoc } from "firebase/firestore";
import styled from "styled-components/native";
import { firestore } from "../config/firebase";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import {
  festivalPhoto,
  festivalRecurrence,
  festivalWhat,
  festivalsFromNow,
} from "../data/beninFestivals";
import { cities } from "../data/cities";
import { RailChip } from "../components/RailChip";
import { usePressScale } from "../components/Tappable";
import { SearchBar } from "../components/SearchBar";
import { useAuth } from "../auth/AuthContext";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useBannerStatusBar } from "../hooks/useBannerStatusBar";
import { useEvents } from "../hooks/useEvents";
import { useEventReactions } from "../hooks/useEventReactions";
import { openAccountGate } from "../utils/openAccountGate";
import { openListing } from "../utils/openListing";
import { withListingLink } from "../utils/listingLink";
import { ListingMedia } from "../components/ListingMedia";
import { nearestKnownCity } from "../utils/nearestCity";
import { canPublish } from "../utils/canPublish";
import {
  EVENT_ACCENT,
  eventKinds,
  eventReactions,
  eventWindows,
  eventWindowSubLabel,
  getEventKindIcon,
  getEventKindLabel,
  getEventKindTint,
  getEventPayLabel,
} from "../data/events";

const MONTHS = {
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const WEEKDAYS = {
  fr: ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"],
  en: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
};

const formatAmount = (value) =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// Everything the card says about money, in the order somebody deciding
// actually needs it: what it costs to commit now, then what it costs to
// turn up without having.
function priceLines(event, t) {
  const { known, free, advance, gate, dearerAtGate } = event.pricing;
  if (!known) return { headline: t("eventPriceUnknown"), detail: null };
  if (free) return { headline: t("eventPriceFree"), detail: null };
  if (advance === 0 && gate > 0) {
    return {
      headline: t("eventPriceFreeAdvance"),
      detail: t("eventPriceAtGate", { amount: formatAmount(gate) }),
    };
  }
  return {
    headline: `${formatAmount(advance ?? gate)} FCFA`,
    detail: dearerAtGate
      ? t("eventPriceAdvanceThenGate", { amount: formatAmount(gate) })
      : t("eventPriceSingle"),
  };
}

export function EventsScreen({ navigation, route }) {
  const { colors, scheme } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { coords } = useCurrentLocation();
  const insets = useSafeAreaInsets();
  // The app's own press spring, not a new one — the same movement every
  // other primary button on this app makes.
  const { scale: postScale, pressProps: postPressProps } = usePressScale(0.97);

  // null means "nobody has chosen yet", which is not the same as choosing
  // the weekend — and the difference is the whole of this bug.
  //
  // The screen opened on Ce week-end whatever was in it. Somebody with one
  // event, on a Friday three weeks out, opened Événements and was told
  // nothing was on: the event was under Plus tard, and there was no reason
  // to go looking for it there when the screen had just said the place was
  // empty. An empty default tab in front of a non-empty screen is
  // indistinguishable from no events at all.
  //
  // So the opening tab is the soonest one that actually holds something.
  // A tap still wins over it, permanently — once somebody has chosen a
  // window the screen stops second-guessing them, including when they
  // choose an empty one on purpose.
  const [chosenWindow, setChosenWindow] = useState(null);
  const [kind, setKind] = useState(null);
  const [freeOnly, setFreeOnly] = useState(false);
  // Reached from a place — "Concerts et sorties" on the Tourisme screen,
  // where the reader has already said which town they mean — this opens
  // on that town instead of on the whole country. Same rule as Hôtels and
  // Restaurants; an unknown name falls back to everywhere rather than
  // filtering to nothing.
  const requestedCity = route?.params?.city ?? null;
  const [selectedCity, setSelectedCity] = useState(
    requestedCity && cities.includes(requestedCity) ? requestedCity : null,
  );
  // Ordered from this month, so the next one to come is at the top.
  const festivals = useMemo(() => festivalsFromNow(), []);

  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  // The city sheet is anchored to the bottom of the screen, which is
  // exactly where the keyboard appears — so typing a city name buried the
  // field you were typing into. The window's own pan mode does not reach
  // inside a Modal, so the height is measured and the sheet is lifted by
  // it. Nothing else on this screen needs the keyboard, hence local state
  // rather than a shared hook.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const shown = Keyboard.addListener(showEvent, (event) =>
      setKeyboardHeight(event.endCoordinates?.height ?? 0),
    );
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // What the banner is talking about. The city they chose wins over the
  // one they are standing in — picking Parakou and being told "around
  // Cotonou" would be the screen arguing with its own filter.
  //
  // nearestKnownCity is the app's existing guess, radius and all: it
  // returns null rather than naming a town 12 000 km away, and the kicker
  // then says nothing about where anybody is.
  const aroundCity = selectedCity ?? nearestKnownCity(coords);

  const events = useEvents(coords);

  // How many events each window holds, with every OTHER filter applied.
  //
  // This screen has two filter rows and only one of them says "Tout". That
  // word belongs to the kinds, not to the dates, so somebody with Tout
  // selected and Ce week-end above it is looking at a filtered list that
  // claims to be unfiltered — and concludes the app has nothing when it
  // has something next month. A number on each tab is the shortest way to
  // say where things actually are.
  const windowCounts = useMemo(() => {
    const passesOtherFilters = (event) =>
      (!kind || event.kind === kind) &&
      (!freeOnly || event.pricing.free) &&
      (!selectedCity || event.city === selectedCity);

    const counts = {};
    eventWindows.forEach((item) => {
      counts[item.key] = events.filter(
        (event) => event.windows.includes(item.key) && passesOtherFilters(event),
      ).length;
    });
    return counts;
  }, [events, kind, freeOnly, selectedCity]);

  const firstWindowWithEvents = useMemo(() => {
    const soonestFirst = eventWindows.map((item) => item.key);
    return (
      soonestFirst.find((key) =>
        events.some((event) => event.windows.includes(key)),
      ) ?? "weekend"
    );
  }, [events]);

  const window = chosenWindow ?? firstWindowWithEvents;
  const setWindow = setChosenWindow;
  // White glyphs while the banner is under them — dark icons on #8A3A6B are
  // not dim, they are gone. useBannerStatusBar sets that on focus and hands
  // the default back on the way out.
  useBannerStatusBar();
  // And back to dark once the banner has scrolled away, or the clock is
  // white on a white list. Tracked in a ref and only set when it flips, so
  // this costs nothing per scroll frame.
  const glyphsAreLight = useRef(true);
  // How far the banner reaches, measured rather than guessed: it grows with
  // the city name and the hero copy, both of which are translated.
  const heroHeight = useRef(0);
  const [tabsAreFloating, setTabsAreFloating] = useState(false);
  const onScroll = useCallback(
    (event) => {
      // Half the banner is enough: by then what is under the status bar is
      // the list, not the gradient.
      const y = event.nativeEvent.contentOffset.y;

      // The tabs stay reachable after the banner has gone: they are how
      // this screen is navigated, and scrolling back up to reach "Ce soir"
      // is a worse answer than a bar that follows.
      const floating = heroHeight.current > 0 && y > heroHeight.current - 8;
      setTabsAreFloating((was) => (was === floating ? was : floating));

      const light = y < 90;
      if (light === glyphsAreLight.current) return;
      glyphsAreLight.current = light;
      setStatusBarStyle(light ? "light" : scheme === "dark" ? "light" : "dark");
    },
    [scheme],
  );
  const { likedIds, myReactions, reactionCounts, toggleLike, setReaction } =
    useEventReactions(user?.uid);

  const mayPublish = !user || canPublish(user);

  const visible = useMemo(
    () =>
      events
        .filter((event) => event.windows.includes(window))
        .filter((event) => !kind || event.kind === kind)
        .filter((event) => !freeOnly || event.pricing.free)
        .filter((event) => !selectedCity || event.city === selectedCity),
    [events, window, kind, freeOnly, selectedCity],
  );

  // Every city, and a dot against the ones with something on.
  //
  // This first offered only cities that already had an event, to save
  // somebody picking a quiet town and seeing nothing. With no events posted
  // that left the picker completely empty — a sheet containing a search box
  // and nothing to search. Listing them all and marking the live ones gives
  // the same steer without the dead end.
  const citiesWithEvents = useMemo(
    () => new Set(events.map((event) => event.city)),
    [events],
  );

  const filteredCities = useMemo(() => {
    const needle = citySearch.trim().toLowerCase();
    if (!needle) return cities;
    return cities.filter((city) => city.toLowerCase().includes(needle));
  }, [citySearch]);

  const chooseCity = (city) => {
    setSelectedCity(city);
    setCitySheetOpen(false);
    setCitySearch("");
    Keyboard.dismiss();
  };

  // The soonest matching event is given the large card. Not an editorial
  // pick and not a paid slot — just the next thing happening, which is what
  // somebody opening this screen on a Friday evening is looking for.
  const [featured, ...rest] = visible;

  // Windows other than the one being shown that do hold something.
  const elsewhere = eventWindows.filter(
    (item) => item.key !== window && windowCounts[item.key] > 0,
  );

  const requireAccount = (action) => () => {
    if (!user) {
      openAccountGate(navigation);
      return;
    }
    action();
  };

  // A refused write used to reject into nothing, so a tap on J’aime looked
  // like a button that was not wired up. Say what happened instead.
  const announceFailure = (error) => {
    Alert.alert(
      t("eventActionFailedTitle"),
      __DEV__ && error?.code
        ? `${t("eventActionFailedMessage")} (${error.code})`
        : t("eventActionFailedMessage"),
    );
  };

  const postEvent = () => {
    if (!user) {
      openAccountGate(navigation);
      return;
    }
    navigation.navigate("CreateListing", {
      categoryKey: "events",
      isPromoted: false,
    });
  };

  const shareEvent = async (event) => {
    const title = language === "en" ? event.titleEn : event.titleFr;
    try {
      const message = event.venue
        ? t("shareEventMessage", { title, venue: event.venue })
        : t("shareEventMessageNoVenue", { title });
      const result = await Share.share({
        message: withListingLink(message, event),
      });
      if (result?.action !== Share.sharedAction || !event.id) return;
      updateDoc(doc(firestore, "listings", event.id), {
        shareCount: increment(1),
      }).catch(() => {
        // Non-critical — a missed count must never break sharing.
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const renderCard = (event, isFeatured) => {
    const title = language === "en" ? event.titleEn : event.titleFr;
    const price = priceLines(event, t);
    const date = new Date(event.eventDateMs);
    const tint = getEventKindTint(event.kind);
    const counts = reactionCounts.get(event.id) ?? {};
    const mine = myReactions.get(event.id) ?? null;
    const liked = likedIds.has(event.id);
    const payLabel = getEventPayLabel(event.payMode, language);

    // The card opens the listing, which it did not do at all: every other
    // card in the app is a way in to its own detail, and this one was a
    // poster you could look at and nothing else. The reaction chips claim
    // the responder themselves, so tapping a glyph does not also open it.
    return (
      <Card
        key={event.id}
        featured={isFeatured}
        onPress={() => openListing(navigation, event, t, language)}
      >
        <Media tint={tint} featured={isFeatured}>
          {/* Was a bare Image on event.mediaUrl. A listing whose media is a
              video has a video URL there, and an Image renders that as
              nothing — a blank panel where the flyer should be.
              ListingMedia knows the difference, and brings the photo
              swipe with it. */}
          <MediaFill>
            {event.mediaUrl || event.media?.length ? (
              <ListingMedia listing={event} size="card" />
            ) : (
              <MediaMark>
                <Ionicons
                  name={getEventKindIcon(event.kind)}
                  size={isFeatured ? 92 : 66}
                  color="rgba(255,255,255,0.14)"
                />
              </MediaMark>
            )}
          </MediaFill>
          <MediaScrim
            colors={["rgba(20,6,15,0)", "rgba(20,6,15,0.82)"]}
            pointerEvents="none"
          />

          <DateBadge>
            <DateDay>{WEEKDAYS[language][date.getDay()]}</DateDay>
            <DateNum>{date.getDate()}</DateNum>
            <DateMonth>{MONTHS[language][date.getMonth()]}</DateMonth>
          </DateBadge>

          <KindTag>
            <KindTagLabel>
              {getEventKindLabel(event.kind, language) ?? ""}
            </KindTagLabel>
          </KindTag>

          {isFeatured ? (
            <FeaturedOverlay>
              <FeaturedKicker>{t("eventFeaturedKicker")}</FeaturedKicker>
              <FeaturedTitle numberOfLines={2}>{title}</FeaturedTitle>
            </FeaturedOverlay>
          ) : null}
        </Media>

        <Body>
          {isFeatured ? null : (
            <CardTitle numberOfLines={2}>{title}</CardTitle>
          )}

          <PriceRow>
            <PriceHeadline free={event.pricing.free}>
              {price.headline}
            </PriceHeadline>
            {price.detail ? <PriceDetail>{price.detail}</PriceDetail> : null}
          </PriceRow>

          {event.hours.hasAny ? (
            <Fact>
              <Ionicons name="time-outline" size={14} color={EVENT_ACCENT} />
              <FactText>
                {event.hours.starts
                  ? t("eventHoursDoorsThenStart", {
                      doors: event.hours.doors,
                      start: event.hours.starts,
                    })
                  : t("eventHoursAt", { time: event.hours.doors })}
              </FactText>
            </Fact>
          ) : null}

          <Fact>
            <Ionicons name="location-outline" size={14} color={EVENT_ACCENT} />
            <FactText>
              {[
                event.venue,
                event.quartier,
                event.city,
                event.distanceKm != null
                  ? t("eventDistanceAway", {
                      // One decimal close by, whole kilometres beyond ten.
                      // Unrounded, this printed "9538,111843743536 km" —
                      // twelve digits of precision on a number nobody reads
                      // past the first two.
                      km: (event.distanceKm < 10
                        ? event.distanceKm.toFixed(1)
                        : String(Math.round(event.distanceKm))
                      ).replace(".", ","),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </FactText>
          </Fact>

          {payLabel ? (
            <Fact>
              <Ionicons name="card-outline" size={14} color={colors.textMuted} />
              <FactMuted>{payLabel}</FactMuted>
            </Fact>
          ) : null}

          <MetaRow>
            {event.organiser ? (
              <MetaText numberOfLines={1}>{event.organiser}</MetaText>
            ) : null}
            {event.capacityNote ? (
              <CapacityPill>
                <CapacityLabel>{event.capacityNote}</CapacityLabel>
              </CapacityPill>
            ) : null}
          </MetaRow>

          {/* Reacting, liking and sharing sit together because they are the
              three things you can do about an event without leaving the
              list. The reaction bar is first: it is the only one of the
              three that says anything to the organiser. */}
          <ReactionBar>
            {eventReactions.map((reaction) => {
              const count = counts[reaction.key] ?? 0;
              const isMine = mine === reaction.key;
              return (
                <ReactionChip
                  key={reaction.key}
                  mine={isMine}
                  onPress={requireAccount(() =>
                    setReaction(event.id, reaction.key).catch(announceFailure),
                  )}
                  onStartShouldSetResponder={() => true}
                  hitSlop={4}
                >
                  <ReactionGlyph>{reaction.glyph}</ReactionGlyph>
                  {count > 0 ? (
                    <ReactionCount mine={isMine}>{count}</ReactionCount>
                  ) : null}
                </ReactionChip>
              );
            })}
          </ReactionBar>

          <ActionRow>
            <ActionButton
              liked={liked}
              onPress={requireAccount(() =>
                toggleLike(event.id).catch(announceFailure),
              )}
            >
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={17}
                color={liked ? "#fff" : EVENT_ACCENT}
              />
              <ActionLabel liked={liked}>
                {liked ? t("eventLiked") : t("eventLike")}
              </ActionLabel>
            </ActionButton>

            <ShareButton onPress={() => shareEvent(event)}>
              <Ionicons name="share-social-outline" size={17} color={EVENT_ACCENT} />
              <ShareLabel>{t("eventShare")}</ShareLabel>
            </ShareButton>
          </ActionRow>
        </Body>
      </Card>
    );
  };

  // Drawn twice: once in the list header, and once in the bar that floats
  // at the top of the screen after the banner has scrolled away. Same
  // element, so the two can never drift apart.
  const windowTabs = (
    <>
    {/* Two lines per tab, as the design has it. The second is not
        decoration: "tonight" and "this weekend" both look obvious and
        neither says which days it means. */}
    <WindowRow>
      {eventWindows.map((item) => {
        const on = window === item.key;
        return (
          <WindowTab key={item.key} on={on} onPress={() => setWindow(item.key)}>
            <WindowLabel on={on}>
              {language === "en" ? item.labelEn : item.labelFr}
            </WindowLabel>
            <WindowSub on={on}>
              {eventWindowSubLabel(item.key, language)}
            </WindowSub>
            {windowCounts[item.key] > 0 ? (
              <WindowCount on={on}>
                <WindowCountLabel on={on}>
                  {windowCounts[item.key]}
                </WindowCountLabel>
              </WindowCount>
            ) : null}
          </WindowTab>
        );
      })}
    </WindowRow>
    </>
  );

  const header = (
    <>
      <Hero
        colors={["#8A3A6B", "#6D2C55", "#3E1830"]}
        style={{ paddingTop: insets.top + spacing.sm }}
        onLayout={(event) => {
          heroHeight.current = event.nativeEvent.layout.height;
        }}
      >
        <BackButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </BackButton>
        <HeroMark pointerEvents="none">
          <Ionicons name="ticket-outline" size={150} color="rgba(255,255,255,0.10)" />
        </HeroMark>
        <HeroKicker>
          {aroundCity
            ? t("eventsHeroKickerNear", { city: aroundCity.toUpperCase() })
            : t("eventsHeroKicker")}
        </HeroKicker>
        <HeroTitle>{t("eventsHeroTitle")}</HeroTitle>
        <HeroCopy>{t("eventsHeroCopy")}</HeroCopy>

        {/* In the banner, where every other vertical puts the place it is
            talking about — the hero says "Cotonou and around", so the
            control that changes it belongs beside that claim, not below
            the fold in the body. */}
        <HeroActions>
          <HeroCityPill onPress={() => setCitySheetOpen(true)}>
            <Ionicons name="location-outline" size={16} color="#ffffff" />
            <HeroCityLabel numberOfLines={1}>
              {selectedCity ?? t("eventsAllCities")}
            </HeroCityLabel>
            <Ionicons
              name="chevron-down"
              size={14}
              color="rgba(255,255,255,0.75)"
            />
          </HeroCityPill>

          {/* The same action as the bar at the foot of the screen, offered
              where somebody is still reading rather than only after they
              have scrolled past everything. It is the shorter label of the
              two on purpose: down there it is the only thing to press and
              can afford a sentence, up here it sits beside the city and has
              to earn its width. */}
          {mayPublish ? (
            <HeroPostButton onPress={postEvent}>
              <Ionicons name="add" size={16} color={EVENT_ACCENT} />
              <HeroPostLabel>{t("eventsPostShort")}</HeroPostLabel>
            </HeroPostButton>
          ) : null}
        </HeroActions>
      </Hero>

      {windowTabs}

      {/* The app's one chip, in this screen's colour. These were three
          hand-rolled pills with three different paddings before. */}
      <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
        <RailChip
          icon="pricetag-outline"
          label={t("eventFilterFree")}
          selected={freeOnly}
          accent={EVENT_ACCENT}
          onPress={() => setFreeOnly(!freeOnly)}
        />
        <RailChip
          icon="apps-outline"
          label={t("eventFilterAll")}
          selected={!kind}
          accent={EVENT_ACCENT}
          onPress={() => setKind(null)}
        />
        {eventKinds.map((item) => (
          <RailChip
            key={item.key}
            icon={item.icon}
            label={language === "en" ? item.labelEn : item.labelFr}
            selected={kind === item.key}
            accent={EVENT_ACCENT}
            onPress={() => setKind(kind === item.key ? null : item.key)}
          />
        ))}
      </ChipScroll>

      {visible.length > 0 ? (
        <CountRow>
          <CountText>
            {t("eventsCount", { count: String(visible.length) })}
          </CountText>
          <SortNote>{t("eventsSortByDate")}</SortNote>
        </CountRow>
      ) : null}

      {featured ? renderCard(featured, true) : null}
    </>
  );

  return (
    <Container edges={["left", "right"]}>
      {/* No fixed bar above the list.
      
          There was one, in the banner's colour, and it was worse than the
          pale band it replaced: it never moved, so the moment anything was
          scrolled its bottom edge cut across whatever was passing under
          it — a plum block, then a card with its top sliced off mid-word.
          A shadow made the cut deliberate without making it pleasant.
      
          So the banner scrolls, all of it, and the back button rides on it
          the way the buttons on a listing ride on its photograph. The list
          then owns the top of the screen, which is what it looked like it
          wanted to do all along. */}

      {tabsAreFloating ? (
        <FloatingTabs style={{ paddingTop: insets.top + spacing.xs }}>
          {windowTabs}
        </FloatingTabs>
      ) : null}

      <FlatList
        data={rest}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderCard(item, false)}
        ListHeaderComponent={header}
        contentContainerStyle={listContentStyle}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          featured ? null : (
            <EmptyState>
              <Ionicons name="ticket-outline" size={40} color={colors.textMuted} />
              <EmptyTitle>{t("eventsEmptyTitle")}</EmptyTitle>
              {/* "Nothing here" and "nothing anywhere" are different
                  answers, and only one of them is a dead end. If the other
                  tabs hold something, this says which and offers to go —
                  rather than letting an empty week stand in for an empty
                  app. */}
              {elsewhere.length ? (
                <>
                  <EmptySubtitle>{t("eventsEmptyButElsewhere")}</EmptySubtitle>
                  <JumpRow>
                    {elsewhere.map((item) => (
                      <JumpButton
                        key={item.key}
                        onPress={() => setWindow(item.key)}
                      >
                        <JumpLabel>
                          {language === "en" ? item.labelEn : item.labelFr}
                        </JumpLabel>
                        <JumpCount>{windowCounts[item.key]}</JumpCount>
                      </JumpButton>
                    ))}
                  </JumpRow>
                </>
              ) : (
                <EmptySubtitle>{t("eventsEmptySubtitle")}</EmptySubtitle>
              )}
            </EmptyState>
          )
        }
        ListFooterComponent={
          <Footer>
            {/* The country's own calendar, under whatever people have
                posted and visibly not part of it.

                This screen ships no sample events on purpose — see the
                note at the top of data/events.js — and that rule is right
                for a concert at a maquis and wrong for the Vodun Days. Nobody is going to "post" a national
                holiday, and somebody asking what is on in January should
                not be told nothing is.

                Dates are not given, because they move: Vodun Days grew
                from the 10 January holiday into three days, Nonvitcha
                follows Pentecost, and the Gaani follows the Muslim
                calendar and slides through the seasons. Each says when it
                usually falls and which edition was last announced. */}
            <FestivalHead>{t("festivalsTitle")}</FestivalHead>
            <FestivalIntro>{t("festivalsIntro")}</FestivalIntro>
            {festivals.map((festival) => (
              <FestivalCard
                key={festival.key}
                onPress={() =>
                  navigation.navigate("FestivalDetail", { festival })
                }
              >
                {/* A picture of the thing, so the calendar reads as five
                    happenings rather than five paragraphs. Where Commons
                    has none, the card keeps its coloured ground rather
                    than borrowing a photograph of something else. */}
                {festivalPhoto(festival) ? (
                  <FestivalBanner>
                    <FestivalImage
                      source={{ uri: festivalPhoto(festival).url }}
                      resizeMode="cover"
                    />
                    <FestivalScrim
                      colors={["transparent", "rgba(0,0,0,0.55)"]}
                      pointerEvents="none"
                    />
                    <FestivalCredit numberOfLines={1}>
                      {t("tourismPhotoCredit", {
                        author: festivalPhoto(festival).author,
                        licence: festivalPhoto(festival).licence,
                      })}
                    </FestivalCredit>
                  </FestivalBanner>
                ) : null}
                <FestivalTop>
                  <FestivalDot tint={getEventKindTint(festival.kind) ?? EVENT_ACCENT} />
                  <FestivalName numberOfLines={1}>{festival.name}</FestivalName>
                  <FestivalCity numberOfLines={1}>
                    {festival.venue
                      ? `${festival.venue} · ${festival.city}`
                      : festival.city}
                  </FestivalCity>
                </FestivalTop>
                <FestivalWhat numberOfLines={3}>
                  {festivalWhat(festival, language)}
                </FestivalWhat>
                <FestivalWhen numberOfLines={2}>
                  {t("festivalsUsually")} · {festivalRecurrence(festival, language)}
                </FestivalWhen>
                {festival.lastConfirmedEdition ? (
                  <FestivalEdition numberOfLines={1}>
                    {t("festivalsLastEdition", {
                      edition: festival.lastConfirmedEdition,
                    })}
                  </FestivalEdition>
                ) : null}
              </FestivalCard>
            ))}
            <SafetyNote>
              <Ionicons name="shield-checkmark-outline" size={16} color="#8a6415" />
              <SafetyText>{t("eventsSafetyNote")}</SafetyText>
            </SafetyNote>
          </Footer>
        }
      />

      {/* Anybody can run something. The button is always visible rather than
          hidden behind an empty list, because the most useful thing this
          screen can do while it has nothing in it is get the first event
          posted. */}
      <Modal
        visible={citySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCitySheetOpen(false)}
      >
        {/* The backdrop is a sibling of the sheet, not its parent.
            Wrapping the sheet in the dismiss-Pressable meant a tap on the
            search field was still a tap inside the backdrop: the sheet shut
            the moment you tried to type in it, so whatever you typed was
            never on screen long enough to read. Nothing can dismiss it now
            except the area beside it. */}
        <SheetRoot>
          <SheetBackdrop onPress={() => setCitySheetOpen(false)} />
          <Sheet style={{ marginBottom: keyboardHeight }}>
            <SheetHandle />
            <SheetTitle>{t("chooseCityTitle")}</SheetTitle>
            <SearchBar
              value={citySearch}
              onChangeText={setCitySearch}
              placeholder={t("searchCityPlaceholder")}
            />
            <SheetScroll
              style={keyboardHeight > 0 ? { maxHeight: 190 } : null}
              keyboardShouldPersistTaps="handled"
            >
              <SheetRow onPress={() => chooseCity(null)}>
                <SheetRowLabel>{t("eventsAllCities")}</SheetRowLabel>
                {!selectedCity ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null}
              </SheetRow>
              {filteredCities.map((city) => (
                <SheetRow key={city} onPress={() => chooseCity(city)}>
                  <SheetRowLabel>{city}</SheetRowLabel>
                  {citiesWithEvents.has(city) ? <LiveDot /> : null}
                  {selectedCity === city ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </SheetRow>
              ))}
              {filteredCities.length === 0 ? (
                <SheetEmpty>{t("eventsNoCityMatch")}</SheetEmpty>
              ) : null}
            </SheetScroll>
          </Sheet>
        </SheetRoot>
      </Modal>

      {mayPublish ? (
        <PostBar style={{ paddingBottom: spacing.sm + insets.bottom }}>
          <PostPress
            {...postPressProps}
            onPress={postEvent}
            style={{ transform: [{ scale: postScale }] }}
          >
            <PostButton
              colors={["#8A3A6B", "#6D2C55", "#55203F"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <PostGlyph>
                <Ionicons name="add" size={18} color="#ffffff" />
              </PostGlyph>
              <PostLabel>{t("eventsPostCta")}</PostLabel>
            </PostButton>
          </PostPress>
        </PostBar>
      ) : null}
    </Container>
  );
}

const listContentStyle = { paddingBottom: 96 };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;


// On the banner, not in a bar: absolutely placed so the hero's own padding
// does not have to make room for it.
const BackButton = styled(Pressable)`
  align-self: flex-start;
  margin-bottom: ${spacing.xs}px;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;


// The tab row, over the list, once the banner it normally sits under has
// scrolled away. Absolute rather than a sticky header index: this list has
// one header component holding the banner and the tabs together, and
// splitting it into a sticky section would mean giving up the single
// header the rest of the screen is built around.
const FloatingTabs = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  padding: 0 ${spacing.md}px ${spacing.xs}px;
  background-color: ${(props) => props.theme.background};
  shadow-color: #2a0f20;
  shadow-offset: 0px 3px;
  shadow-opacity: 0.16;
  shadow-radius: 8px;
  elevation: 6;
`;

const Hero = styled(LinearGradient)`
  padding: ${spacing.lg}px ${spacing.md}px ${spacing.lg}px;
  margin-bottom: ${spacing.md}px;
  overflow: hidden;
`;

const HeroMark = styled.View`
  position: absolute;
  right: -26px;
  bottom: -34px;
`;

const HeroKicker = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  color: rgba(255, 255, 255, 0.62);
  margin-bottom: ${spacing.sm}px;
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 25px;
  line-height: 30px;
  color: #ffffff;
  margin-bottom: ${spacing.sm}px;
`;

const HeroCopy = styled.Text`
  font-size: 13px;
  line-height: 20px;
  color: rgba(255, 255, 255, 0.76);
`;

const HeroActions = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
`;

const HeroCityPill = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  flex-shrink: 1;
  gap: 8px;
  padding: 9px 14px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.16);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.26);
`;

const HeroCityLabel = styled.Text`
  flex-shrink: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: #ffffff;
`;

// Solid white on the plum, where the city pill is translucent — one of the
// two is a filter and the other starts something, and they should not look
// like the same kind of control just because they sit together.
const HeroPostButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: ${radius.pill}px;
  background-color: #ffffff;
`;

const HeroPostLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13.5px;
  color: ${EVENT_ACCENT};
`;

const SheetRoot = styled.View`
  flex: 1;
  justify-content: flex-end;
`;

const SheetBackdrop = styled(Pressable)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.35);
`;

const Sheet = styled.View`
  max-height: 72%;
  padding: ${spacing.sm}px ${spacing.md}px ${spacing.lg}px;
  border-top-left-radius: ${radius.xl}px;
  border-top-right-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.background};
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${radius.pill}px;
  align-self: center;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.border};
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

// Bounded on purpose. A ScrollView takes its height from its parent, and
// this one's parent is a sheet sized by its own contents — so it resolved
// to zero and the whole city list rendered as nothing at all. The sheet
// opened showing a search box above empty space.
const SheetScroll = styled.ScrollView`
  max-height: 340px;
  margin-top: ${spacing.sm}px;
`;

// Marks a city that has something on, so the list still steers without
// hiding anywhere.
const LiveDot = styled.View`
  width: 7px;
  height: 7px;
  margin-left: auto;
  margin-right: ${spacing.sm}px;
  border-radius: ${radius.pill}px;
  background-color: ${EVENT_ACCENT};
`;

const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 14px 4px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SheetRowLabel = styled.Text`
  flex: 1;
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const SheetEmpty = styled.Text`
  padding: ${spacing.lg}px ${spacing.xs}px;
  text-align: center;
  font-size: 13px;
  color: ${(props) => props.theme.textMuted};
`;

const WindowRow = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 5px;
  margin: 0 ${spacing.md}px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

// The selected tab was a white pill with a dark label — the same pill the
// rest of the app uses for anything at all. On a plum screen it read as
// unfinished, so the selection now carries the screen's colour: a tinted
// ground, a plum label and a hairline of the accent around it.
const WindowTab = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 11px 6px 12px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.on ? props.theme.surface : "transparent"};
  border-width: 1px;
  border-color: ${(props) => (props.on ? "rgba(109,44,85,0.34)" : "transparent")};
  ${(props) => (props.on ? shadow.card : "")}
`;

const WindowLabel = styled.Text`
  font-family: ${(props) =>
    props.on ? fontFamily.bold : fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.on ? EVENT_ACCENT : props.theme.textMuted)};
`;

const WindowCount = styled.View`
  margin-top: 4px;
  min-width: 20px;
  padding: 1px 6px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.on ? EVENT_ACCENT : props.theme.border};
`;

const WindowCountLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  text-align: center;
  color: ${(props) => (props.on ? "#ffffff" : props.theme.textMuted)};
`;

const JumpRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
`;

const JumpButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  padding: 10px 15px;
  border-radius: ${radius.pill}px;
  background-color: rgba(109, 44, 85, 0.08);
  border-width: 1.5px;
  border-color: rgba(109, 44, 85, 0.3);
`;

const JumpLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  color: ${EVENT_ACCENT};
`;

const JumpCount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  color: rgba(109, 44, 85, 0.7);
`;

const WindowSub = styled.Text`
  margin-top: 3px;
  font-size: 10px;
  color: ${(props) =>
    props.on ? "rgba(109,44,85,0.72)" : props.theme.textMuted};
`;

const ChipScroll = styled.ScrollView.attrs({
  contentContainerStyle: {
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
})``;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 ${spacing.md}px ${spacing.sm}px;
`;

const CountText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SortNote = styled.Text`
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Card = styled(Pressable)`
  margin: 0 ${spacing.md}px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

// Everything inside is absolutely positioned over the picture, which is
// the point of the picture being here at all.
//
// The featured overlay was an ordinary child, so it and the full-height
// media sat one after the other: the flyer got its 190px, the title got a
// solid band of its own underneath, and the card grew to fit both. It read
// as a photo with a coloured strip stapled to the bottom rather than a
// caption on an image.
const Media = styled.View`
  position: relative;
  height: ${(props) => (props.featured ? 190 : 128)}px;
  background-color: ${(props) => props.tint};
  overflow: hidden;
`;

const MediaFill = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

const MediaMark = styled.View`
  position: absolute;
  right: -14px;
  bottom: -20px;
`;

const MediaScrim = styled(LinearGradient)`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 60%;
`;

const DateBadge = styled.View`
  position: absolute;
  top: 12px;
  left: 12px;
  width: 50px;
  padding: 6px 0 7px;
  align-items: center;
  border-radius: ${radius.md}px;
  background-color: rgba(255, 255, 255, 0.95);
`;

const DateDay = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 9.5px;
  letter-spacing: 0.6px;
  color: ${EVENT_ACCENT};
`;

const DateNum = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 19px;
  line-height: 21px;
  color: #1c1c1e;
`;

const DateMonth = styled.Text`
  font-size: 9.5px;
  color: #5b5b5e;
`;

const KindTag = styled.View`
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 5px 11px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.18);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.28);
`;

const KindTagLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10px;
  letter-spacing: 0.5px;
  color: #ffffff;
`;

const FeaturedOverlay = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 ${spacing.md}px ${spacing.md}px;
`;

const FeaturedKicker = styled.Text`
  align-self: flex-start;
  font-family: ${fontFamily.semiBold};
  font-size: 10px;
  letter-spacing: 1px;
  color: #ffffff;
  padding: 5px 11px;
  margin-bottom: ${spacing.sm}px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.18);
  overflow: hidden;
`;

const FeaturedTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 19px;
  line-height: 24px;
  color: #ffffff;
`;

const Body = styled.View`
  padding: ${spacing.md}px;
`;

const CardTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  line-height: 20px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: ${spacing.sm}px;
`;

const PriceHeadline = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 18px;
  color: ${(props) => (props.free ? props.theme.primary : props.theme.text)};
`;

const PriceDetail = styled.Text`
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Fact = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 5px;
`;

const FactText = styled.Text`
  flex: 1;
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
`;

const FactMuted = styled.Text`
  flex: 1;
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: ${spacing.xs}px;
`;

const MetaText = styled.Text`
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const CapacityPill = styled.View`
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: rgba(224, 164, 21, 0.13);
`;

const CapacityLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: #8a6415;
`;

const ReactionBar = styled.View`
  flex-direction: row;
  gap: 7px;
  margin-top: ${spacing.md}px;
`;

// A real target rather than a bare glyph, on the same 36px floor the rest
// of the app's small controls use. The one you chose is ringed in the
// accent so a row of four still reads at a glance.
const ReactionChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.mine ? "rgba(109, 44, 85, 0.12)" : props.theme.surfaceAlt};
  border-width: 1.5px;
  border-color: ${(props) =>
    props.mine ? "rgba(109, 44, 85, 0.5)" : "transparent"};
`;

const ReactionGlyph = styled.Text`
  font-size: 15px;
`;

const ReactionCount = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => (props.mine ? EVENT_ACCENT : props.theme.textMuted)};
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-top: ${spacing.sm}px;
`;

// Pill-shaped and equal-weight, so Like and Share read as one pair of
// choices rather than a button and an afterthought. Liked fills solid —
// the state is worth seeing from across the card.
const ActionButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.liked ? EVENT_ACCENT : "rgba(109, 44, 85, 0.07)"};
  border-width: 1.5px;
  border-color: ${(props) =>
    props.liked ? EVENT_ACCENT : "rgba(109, 44, 85, 0.24)"};
`;

const ActionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13.5px;
  color: ${(props) => (props.liked ? "#ffffff" : EVENT_ACCENT)};
`;

const ShareButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
`;

const ShareLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13.5px;
  color: ${EVENT_ACCENT};
`;

const Footer = styled.View`
  padding: ${spacing.xs}px ${spacing.md}px 0;
`;

const SafetyNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  background-color: rgba(224, 164, 21, 0.1);
  border-width: 1px;
  border-color: rgba(224, 164, 21, 0.28);
`;

const SafetyText = styled.Text`
  flex: 1;
  font-size: 11.5px;
  line-height: 18px;
  color: #6b5a2e;
`;

const EmptyState = styled.View`
  align-items: center;
  padding: ${spacing.xl}px ${spacing.lg}px;
`;

const EmptyTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.md}px;
  text-align: center;
`;

const EmptySubtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
  text-align: center;
`;

// Absolutely positioned, so the container's own bottom safe-area edge
// never reaches it — on a phone with gesture navigation the button sat
// under the system bar and its label was cut in half. The inset is applied
// inline instead, where it can be read at runtime.
const PostBar = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: ${spacing.sm}px ${spacing.md}px;
  background-color: ${(props) => props.theme.background};
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

// The one button on the screen that starts something, so it is the one
// that is allowed to be loud: a diagonal of the hero's own plums, lifted
// off the bar with a shadow tinted to match rather than the usual grey.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PostPress = styled(AnimatedPressable)`
  border-radius: ${radius.xl}px;
  shadow-color: #4A1A38;
  shadow-opacity: 0.42;
  shadow-radius: 18px;
  shadow-offset: 0px 10px;
  elevation: 9;
`;

const PostButton = styled(LinearGradient)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 54px;
  border-radius: ${radius.xl}px;
`;

// The plus sits in its own disc rather than loose beside the words — it
// reads as an action rather than punctuation.
const PostGlyph = styled.View`
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.2);
`;

const PostLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15.5px;
  letter-spacing: 0.2px;
  color: #ffffff;
`;

const FestivalHead = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.lg}px;
`;

const FestivalIntro = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 4px;
  margin-bottom: ${spacing.md}px;
`;

const FestivalCard = styled(Pressable)`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  overflow: hidden;
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const FestivalTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
`;

const FestivalDot = styled.View`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${(props) => props.tint};
`;

const FestivalName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex-shrink: 1;
`;

const FestivalCity = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  flex: 1;
  text-align: right;
`;

const FestivalWhat = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
  margin-top: 6px;
  line-height: 18px;
`;

const FestivalWhen = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
  margin-top: 6px;
`;

const FestivalEdition = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const FestivalBanner = styled.View`
  height: 132px;
  margin: -${spacing.md}px -${spacing.md}px ${spacing.sm}px;
  background-color: #1b1b1d;
`;

const FestivalImage = styled(Image)`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
`;

const FestivalScrim = styled(LinearGradient)`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 56px;
`;

const FestivalCredit = styled.Text`
  position: absolute;
  left: ${spacing.sm}px;
  right: ${spacing.sm}px;
  bottom: 6px;
  ${type.caption}
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
`;
