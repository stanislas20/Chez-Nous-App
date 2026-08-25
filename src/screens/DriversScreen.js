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
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useSellerRatings } from "../hooks/useSellerRatings";
import { useDrivers } from "../hooks/useDrivers";
import { buildLinkUrl } from "../data/restaurantLinks";
import {
  driverAvailability,
  driverLanguages,
  driverNeeds,
  driverSafetyChecks,
  driverVehicleModes,
  getAvailabilityLabel,
  getExperienceLabel,
  getLanguageLabel,
  getPermitLabel,
  getVehicleModeLabel,
  permitCategories,
} from "../data/drivers";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

export function DriversScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  const [need, setNeed] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [permit, setPermit] = useState(null);
  const [vehicleMode, setVehicleMode] = useState(null);
  const [spokenLanguage, setSpokenLanguage] = useState(null);

  const drivers = useDrivers(coords);
  const ratings = useSellerRatings(drivers.map((item) => item.sellerId));

  const scrollRef = useRef(null);
  const listY = useRef(0);

  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  // Four filters, each of which a driver either declared or did not.
  //
  // Undeclared is not the same as "no": somebody who wrote a good advert and
  // skipped the pickers should not vanish the moment a filter is touched, so
  // an undeclared field never excludes. It costs some precision and it is the
  // honest reading of an empty field — we know nothing, not nothing-is-true.
  const matching = useMemo(() => {
    const keep = (declared, wanted) =>
      !wanted || declared.length === 0 || declared.includes(wanted);

    return [...drivers]
      .filter((item) => keep(item.availability, availability))
      .filter((item) => keep(item.permits, permit))
      .filter((item) => keep(item.languages, spokenLanguage))
      .filter(
        (item) =>
          !vehicleMode || !item.vehicleMode || item.vehicleMode === vehicleMode,
      )
      .sort((a, b) => {
        // Whoever declared most comes first. It is not a quality judgement —
        // it is that a card answering four questions is more use than one
        // answering none, and the reader can always keep scrolling.
        const declaredness = (item) =>
          item.permits.length +
          item.availability.length +
          item.languages.length +
          (item.vehicleMode ? 1 : 0) +
          (item.experience ? 1 : 0);
        const byDeclared = declaredness(b) - declaredness(a);
        if (byDeclared !== 0) return byDeclared;
        if (a.distanceKm != null && b.distanceKm != null) {
          return a.distanceKm - b.distanceKm;
        }
        return 0;
      });
  }, [drivers, availability, permit, spokenLanguage, vehicleMode]);

  // Counted from the listings, never asserted.
  const countFor = (field, key) =>
    drivers.filter((item) => (item[field] ?? []).includes(key)).length;

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const openWhatsapp = (value) => {
    const url = buildLinkUrl("whatsapp", value);
    if (!url) return;
    const chosenNeed = driverNeeds.find((item) => item.key === need);
    const message = [
      t("driverQuoteOpen"),
      chosenNeed
        ? t("driverQuoteNeed", {
            need: language === "en" ? chosenNeed.labelEn : chosenNeed.labelFr,
          })
        : null,
      t("driverQuoteAsk"),
    ]
      .filter(Boolean)
      .join(" ");
    Linking.openURL(
      `${url}${url.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`,
    ).catch(() => {});
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
        params: { categoryKey: "services", trade: "driver" },
      },
    });

  const { remember } = useAccountGateIntent(user, openPostForm);

  const startPosting = () => {
    if (!user) {
      remember();
      openAccountGate(navigation);
      return;
    }
    openPostForm();
  };

  const selectNeed = (item) => {
    const next = need === item.key ? null : item.key;
    setNeed(next);
    setAvailability(next ? item.availability : null);
    if (!next) return;
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({
        y: Math.max(0, listY.current - spacing.md),
        animated: true,
      }),
    );
  };

  const clearFilters = () => {
    setNeed(null);
    setAvailability(null);
    setPermit(null);
    setVehicleMode(null);
    setSpokenLanguage(null);
  };

  const activeFilters = [
    availability && getAvailabilityLabel(availability, language),
    permit && getPermitLabel(permit, language),
    vehicleMode && getVehicleModeLabel(vehicleMode, language),
    spokenLanguage && getLanguageLabel(spokenLanguage, language),
  ].filter(Boolean);

  const renderChipRow = (items, selected, onSelect, labelOf, field) => (
    <ChipWrap>
      {items.map((item) => {
        const active = selected === item.key;
        const count = field ? countFor(field, item.key) : null;
        return (
          <FilterChip
            key={item.key}
            active={active}
            onPress={() => onSelect(active ? null : item.key)}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={13}
                color={active ? "#ffffff" : EMERALD}
              />
            ) : null}
            <FilterChipLabel active={active}>{labelOf(item)}</FilterChipLabel>
            {count ? <ChipCount active={active}>{count}</ChipCount> : null}
          </FilterChip>
        );
      })}
    </ChipWrap>
  );

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
          <HeroEyebrow>{t("driverEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("driverTitle")}</HeroTitle>
        <HeroCopy>{t("driverIntro")}</HeroCopy>

        {/* Said in the banner, not buried at the bottom. Somebody arriving
            from a tile called "Chauffeur" may be expecting to order a ride,
            and the sooner they know this is a directory the less time they
            waste looking for a button that is not there. */}
        <HeroNote>
          <Ionicons
            name="information-circle-outline"
            size={15}
            color="rgba(255,255,255,0.8)"
          />
          <HeroNoteText>{t("driverNotRideHailing")}</HeroNoteText>
        </HeroNote>
      </Hero>

      <Scroll
        ref={scrollRef}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>{t("driverNeedLabel")}</SectionLabel>
        <NeedGrid>
          {driverNeeds.map((item) => {
            const active = need === item.key;
            return (
              <NeedTile
                key={item.key}
                active={active}
                onPress={() => selectNeed(item)}
              >
                <NeedIcon active={active}>
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={active ? "#ffffff" : EMERALD}
                  />
                </NeedIcon>
                <NeedLabel active={active} numberOfLines={1}>
                  {language === "en" ? item.labelEn : item.labelFr}
                </NeedLabel>
                <NeedHint active={active} numberOfLines={2}>
                  {language === "en" ? item.hintEn : item.hintFr}
                </NeedHint>
              </NeedTile>
            );
          })}
        </NeedGrid>

        <SectionLabel>{t("driverFilterLabel")}</SectionLabel>
        <PanelCard>
          <FilterTitle>{t("driverFilterPermit")}</FilterTitle>
          {renderChipRow(
            permitCategories,
            permit,
            setPermit,
            (item) => (language === "en" ? item.labelEn : item.labelFr),
            "permits",
          )}

          <FilterTitle>{t("driverFilterAvailability")}</FilterTitle>
          {renderChipRow(
            driverAvailability,
            availability,
            setAvailability,
            (item) => (language === "en" ? item.labelEn : item.labelFr),
            "availability",
          )}

          <FilterTitle>{t("driverFilterVehicle")}</FilterTitle>
          {renderChipRow(
            driverVehicleModes,
            vehicleMode,
            setVehicleMode,
            (item) => (language === "en" ? item.labelEn : item.labelFr),
            null,
          )}

          {/* The filter nothing else in the app captures, and the one a
              diaspora client hiring for a relative chooses on. */}
          <FilterTitle>{t("driverFilterLanguage")}</FilterTitle>
          {renderChipRow(
            driverLanguages,
            spokenLanguage,
            setSpokenLanguage,
            (item) => (language === "en" ? item.labelEn : item.labelFr),
            "languages",
          )}

          {activeFilters.length ? (
            <ClearButton onPress={clearFilters}>
              <Ionicons name="close" size={14} color={colors.textMuted} />
              <ClearLabel>{t("driverClearFilters")}</ClearLabel>
            </ClearButton>
          ) : null}
        </PanelCard>

        {/* Before the list, because it is advice for the moment of choosing,
            not a footnote to read afterwards. */}
        <SectionLabel>{t("driverSafetyLabel")}</SectionLabel>
        <SafetyCard>
          <SafetyTitle>{t("driverSafetyTitle")}</SafetyTitle>
          <SafetyCopy>{t("driverSafetyCopy")}</SafetyCopy>
          {driverSafetyChecks.map((item) => (
            <SafetyRow key={item.key}>
              <Ionicons name={item.icon} size={15} color="#8a6415" />
              <SafetyText>
                {language === "en" ? item.labelEn : item.labelFr}
              </SafetyText>
            </SafetyRow>
          ))}
        </SafetyCard>

        <ListAnchor
          onLayout={(event) => {
            listY.current = event.nativeEvent.layout.y;
          }}
        />
        <SectionLabel>{t("driverListLabel")}</SectionLabel>
        {activeFilters.length ? (
          <FilterSummary>
            {t("driverFilterSummary", {
              count: matching.length,
              filters: activeFilters.join(" · "),
            })}
          </FilterSummary>
        ) : null}

        {matching.map((item) => {
          const score = ratings[item.sellerId];
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
                  <DriverName numberOfLines={1}>{title(item)}</DriverName>
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
                {item.experience ? (
                  <FactPill>
                    <FactPillLabel>
                      {getExperienceLabel(item.experience, language)}
                    </FactPillLabel>
                  </FactPill>
                ) : null}
                {item.vehicleMode ? (
                  <FactPill>
                    <FactPillLabel>
                      {getVehicleModeLabel(item.vehicleMode, language)}
                    </FactPillLabel>
                  </FactPill>
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

              {/* Permit categories, marked as the declaration they are. */}
              {item.permits.length ? (
                <DeclaredRow>
                  <DeclaredLabel>{t("driverCardPermit")}</DeclaredLabel>
                  <DeclaredValue>
                    {item.permits
                      .map((key) => getPermitLabel(key, language))
                      .filter(Boolean)
                      .join(" · ")}
                  </DeclaredValue>
                </DeclaredRow>
              ) : null}
              {item.languages.length ? (
                <DeclaredRow>
                  <DeclaredLabel>{t("driverCardLanguages")}</DeclaredLabel>
                  <DeclaredValue>
                    {item.languages
                      .map((key) => getLanguageLabel(key, language))
                      .filter(Boolean)
                      .join(" · ")}
                  </DeclaredValue>
                </DeclaredRow>
              ) : null}
              {item.availability.length ? (
                <DeclaredRow>
                  <DeclaredLabel>{t("driverCardAvailability")}</DeclaredLabel>
                  <DeclaredValue>
                    {item.availability
                      .map((key) => getAvailabilityLabel(key, language))
                      .filter(Boolean)
                      .join(" · ")}
                  </DeclaredValue>
                </DeclaredRow>
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
              {activeFilters.length
                ? t("driverNoneMatching")
                : t("driverNoDrivers")}
            </EmptyTitle>
            <EmptyCopy>{t("driverNoDriversCopy")}</EmptyCopy>
          </EmptyCard>
        ) : null}

        {/* Both halves of this market, since a driver looking for work and an
            employer looking to hire arrive on the same screen from opposite
            directions. */}
        <PostCard onPress={startPosting}>
          <PostIcon>
            <Ionicons name="car-outline" size={20} color={EMERALD} />
          </PostIcon>
          <PostCol>
            <PostTitle>{t("driverPostTitle")}</PostTitle>
            <PostCopy>{t("driverPostCopy")}</PostCopy>
          </PostCol>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </PostCard>

        <JobsLink
          onPress={() =>
            navigation.navigate("MainTabs", {
              screen: "ForYou",
              // Transport, not every field: this link exists to answer
              // "where are the driving jobs", and landing on all seventeen
              // would be the same as not filtering at all.
              params: { chip: "jobs", jobCategory: "transport" },
            })
          }
        >
          <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
          <PostCol>
            <PostTitle>{t("driverJobsLinkTitle")}</PostTitle>
            <PostCopy>{t("driverJobsLinkCopy")}</PostCopy>
          </PostCol>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </JobsLink>
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

const HeroNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  margin-top: ${spacing.md}px;
  padding: 10px 12px;
  border-radius: 14px;
  background-color: rgba(255, 255, 255, 0.12);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.2);
`;

const HeroNoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: rgba(255, 255, 255, 0.8);
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

const NeedGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: ${spacing.md}px;
`;

const NeedTile = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 46%;
  min-height: 96px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const NeedIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  background-color: ${(props) =>
    props.active ? "rgba(255, 255, 255, 0.2)" : props.theme.primaryLight};
`;

const NeedLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const NeedHint = styled.Text`
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
  gap: 8px;
`;

const FilterTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  margin-top: 4px;
`;

const ChipWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 7px;
`;

const FilterChip = styled(Pressable)`
  flex-grow: 1;
  flex-basis: auto;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0px 12px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const FilterChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const ChipCount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) =>
    props.active ? "rgba(255,255,255,0.8)" : props.theme.textMuted};
`;

const ClearButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  margin-top: 4px;
  border-radius: 14px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ClearLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SafetyCard = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.3);
  margin-bottom: ${spacing.md}px;
  gap: 8px;
`;

const SafetyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: #8a6415;
`;

const SafetyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: #8a6415;
`;

const SafetyRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.text};
`;

const ListAnchor = styled.View`
  height: 0px;
`;

const FilterSummary = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
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

const DriverName = styled.Text`
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

const FactPill = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const FactPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => props.theme.text};
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

const DeclaredRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
`;

const DeclaredLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  width: 74px;
  margin-top: 2px;
`;

const DeclaredValue = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
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
  flex-grow: 1;
  flex-basis: 45%;
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
  margin-bottom: ${spacing.sm}px;
`;

const JobsLink = styled(PostCard)``;

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
