import { useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import {
  carDealerships,
  dealerAccent,
  dealerBrandKey,
  dealerEmblem,
} from "../data/carDealerships";
import { brandLogo, isWideLogo } from "../data/vehicleBrandLogos";
import { useDirectory } from "../hooks/useDirectory";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// The official distributors, as a directory you can actually work: filter by
// the marque you are shopping for, then read each firm as a record — who they
// are, what they carry, where they are, how to reach them.
//
// Two things this deliberately does NOT have, because the data does not:
//
//   - a "Contacter" call button. carDealerships.js carries no phone numbers
//     on purpose — Bénin moved to ten-digit numbering in 2020 and much of
//     what is still printed online is the dead eight-digit form. A button
//     that dials nothing is worse than no button, so the distributor's own
//     site is the contact.
//   - a per-firm list of services. We publish only what each company
//     publishes about itself, and "atelier agréé / garantie constructeur"
//     is not in that set for most of them. Inventing a services list would
//     be inventing a commercial promise.
export function CarDealershipsScreen({ navigation }) {
  const dealerships = useDirectory("dealerships", carDealerships);
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [brandFilter, setBrandFilter] = useState(null);

  // Every marque any listed distributor publishes, alphabetical. Built from
  // the data rather than hardcoded so a dealership added from the console
  // brings its marques into the filter with it.
  const brandChips = useMemo(
    () =>
      [...new Set(dealerships.flatMap((item) => item.brands ?? []))].sort(
        (a, b) => a.localeCompare(b, "fr"),
      ),
    [dealerships],
  );

  const visible = brandFilter
    ? dealerships.filter((item) => item.brands?.includes(brandFilter))
    : dealerships;

  const open = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  // A maps search on the published address, not a pin: we hold no
  // coordinates for these firms, and a search for "Carrefour Vèdoko,
  // Cotonou" lands where a fabricated pin would not.
  const openDirections = (item) => {
    const address = [item.area, item.city, "Bénin"].filter(Boolean).join(", ");
    open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${item.name} ${address}`,
      )}`,
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
          <HeroEyebrow>{t("carsDealershipsEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("carsDealershipsTitle")}</HeroTitle>
        <HeroCopy>{t("carsDealershipsIntro")}</HeroCopy>
      </Hero>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <FilterLabel>{t("dealerFilterLabel")}</FilterLabel>
        <FilterScroll
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: spacing.md }}
        >
          <FilterChip
            active={!brandFilter}
            onPress={() => setBrandFilter(null)}
          >
            <FilterChipLabel active={!brandFilter}>
              {t("dealerFilterAll")}
            </FilterChipLabel>
          </FilterChip>
          {brandChips.map((brand) => {
            const active = brandFilter === brand;
            return (
              <FilterChip
                key={brand}
                active={active}
                onPress={() => setBrandFilter(active ? null : brand)}
              >
                <FilterChipLabel active={active}>{brand}</FilterChipLabel>
              </FilterChip>
            );
          })}
        </FilterScroll>

        <CountRow>
          {visible.length === 1
            ? t("dealerCountLabelOne")
            : t("dealerCountLabel", { count: visible.length })}
        </CountRow>

        {visible.map((item) => {
          const siteCount = 1 + (item.alsoIn?.length ?? 0);
          const brandCount = item.brands?.length ?? 0;
          return (
            <DealerCard key={item.key}>
              {/* The firm's own name on a tint that differentiates and claims
                  nothing — we hold no logo or brand colour for these
                  companies, and a firm's identity is not ours to invent. */}
              <DealerBand
                colors={[dealerAccent(item.key), "#0B1A16"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <BandTop>
                  <BandCol>
                    <DealerEmblem numberOfLines={1}>
                      {dealerEmblem(item.name)}
                    </DealerEmblem>
                    <DealerName numberOfLines={2}>{item.name}</DealerName>
                    {item.group ? (
                      <DealerGroup numberOfLines={1}>{item.group}</DealerGroup>
                    ) : null}
                  </BandCol>
                  {/* Facts, not a rating: both numbers are counted from the
                      row itself, so neither can drift from what is shown
                      below. */}
                  <BandMeta>
                    {siteCount > 1
                      ? t("dealerMetaLabel", {
                          brands: brandCount,
                          sites: siteCount,
                        })
                      : t("dealerMetaLabelOneSite", { brands: brandCount })}
                  </BandMeta>
                </BandTop>
              </DealerBand>

              <DealerBody>
                {brandCount ? (
                  <Section>
                    <FieldLabel>{t("carsDealershipsBrands")}</FieldLabel>
                    {/* Real manufacturer marks, then the full list as
                        tappable pills. The logos identify the distributor at
                        a glance; the pills are what keeps the marques with no
                        public-domain logo — Yamaha, Fuso, Sinotruk — from
                        disappearing, and each one opens that marque. */}
                    <LogoRow>
                      {item.brands
                        .map(dealerBrandKey)
                        .filter((brand) => brandLogo(brand))
                        .map((brand) => (
                          <LogoPlate key={brand} wide={isWideLogo(brand)}>
                            <LogoImage
                              source={brandLogo(brand)}
                              wide={isWideLogo(brand)}
                              resizeMode="contain"
                            />
                          </LogoPlate>
                        ))}
                    </LogoRow>
                    <BrandRow>
                      {item.brands.map((name) => (
                        <BrandTag
                          key={name}
                          onPress={() =>
                            navigation.navigate("VehicleList", {
                              brand: dealerBrandKey(name),
                            })
                          }
                        >
                          <BrandTagLabel>{name}</BrandTagLabel>
                        </BrandTag>
                      ))}
                    </BrandRow>
                  </Section>
                ) : null}

                <Section>
                  <FieldLabel>{t("dealerAddressesLabel")}</FieldLabel>
                  <PlaceRow>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={colors.textMuted}
                    />
                    <PlaceText>
                      {[item.area, item.city].filter(Boolean).join(" — ")}
                    </PlaceText>
                  </PlaceRow>
                  {item.alsoIn?.map((city) => (
                    <PlaceRow key={city}>
                      <Ionicons
                        name="location-outline"
                        size={13}
                        color={colors.textMuted}
                      />
                      <PlaceText>{city}</PlaceText>
                    </PlaceRow>
                  ))}
                </Section>

                <Divider />

                <ActionRow>
                  <DirectionsButton onPress={() => openDirections(item)}>
                    <Ionicons name="navigate-outline" size={15} color="#fff" />
                    <DirectionsLabel>{t("dealerDirections")}</DirectionsLabel>
                  </DirectionsButton>
                  {/* No phone number by design — see the note at the top of
                      this file. The site is the one contact that stays
                      correct. */}
                  {item.website ? (
                    <SiteButton onPress={() => open(item.website)}>
                      <Ionicons name="open-outline" size={14} color={EMERALD} />
                      <SiteLabel>{t("carsDealershipWebsite")}</SiteLabel>
                    </SiteButton>
                  ) : null}
                </ActionRow>
              </DealerBody>
            </DealerCard>
          );
        })}

        {visible.length === 0 ? (
          <EmptyText>{t("dealerFilterEmpty")}</EmptyText>
        ) : null}

        {/* Said plainly, because the count above is the size of this list and
            nothing more. The trade directories carry names that are not
            here. */}
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("carsDealershipsPartial")}</NoteText>
        </Note>

        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("carsDealershipsNote")}</NoteText>
        </Note>
      </ScrollView>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// Three stops rather than two: the depth the Cars hero gets from its glow
// has to come from the gradient here, because a plain View cannot blur in
// React Native and a hard-edged circle reads as a rendering fault, not light.
const Hero = styled(LinearGradient)`
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
  max-width: 310px;
`;

const FilterLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  margin-bottom: 10px;
  color: ${(props) => props.theme.textMuted};
`;

const FilterScroll = styled.ScrollView`
  margin: 0px -${spacing.md}px 0px 0px;
`;

// Rounded rectangles at the same 14 the budget filters on the Cars screen
// use, so a filter control looks like a filter control across the section.
// The lozenge shape is left to the brand pills inside the cards: those are
// tags you follow, these are a state you set, and the two should not be the
// same object.
const FilterChip = styled(Pressable)`
  padding: 11px 16px;
  border-radius: 14px;
  background-color: ${(props) =>
    props.active ? EMERALD : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const FilterChipLabel = styled.Text`
  font-family: ${(props) =>
    props.active ? fontFamily.bold : fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const CountRow = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  margin: ${spacing.md}px 0px ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const DealerCard = styled.View`
  border-radius: 22px;
  /* The band runs to the card's edge, and on iOS a border-radius does not
     clip drawn content on its own. */
  overflow: hidden;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const DealerBand = styled(LinearGradient)`
  padding: 16px 16px 14px;
`;

const BandTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
`;

const BandCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const BandMeta = styled.Text`
  flex-shrink: 0;
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  text-align: right;
  max-width: 96px;
  color: rgba(255, 255, 255, 0.7);
`;

const DealerEmblem = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 22px;
  letter-spacing: 0.4px;
  color: #ffffff;
`;

const DealerName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  margin-top: 3px;
  color: rgba(255, 255, 255, 0.88);
`;

const DealerGroup = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.66);
`;

const DealerBody = styled.View`
  padding: 14px 16px 16px;
`;

const Section = styled.View`
  margin-bottom: 14px;
`;

const LogoRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 10px;
`;

const LogoPlate = styled.View`
  width: ${(props) => (props.wide ? 50 : 34)}px;
  height: 34px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const LogoImage = styled(Image)`
  width: ${(props) => (props.wide ? 40 : 23)}px;
  height: 23px;
`;

const FieldLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-bottom: 8px;
  color: ${(props) => props.theme.textMuted};
`;

const BrandRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
`;

const BrandTag = styled(Pressable)`
  padding: 6px 11px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.08);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.16);
`;

const BrandTagLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${EMERALD};
`;

const PlaceRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 7px;
  margin-bottom: 6px;
`;

const PlaceText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const Divider = styled.View`
  height: 1px;
  margin-bottom: 14px;
  background-color: ${(props) => props.theme.border};
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const DirectionsButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  border-radius: 15px;
  background-color: ${EMERALD};
`;

const DirectionsLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

const SiteButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  border-radius: 15px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.28);
`;

const SiteLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${EMERALD};
`;

const EmptyText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 20px;
  text-align: center;
  padding: ${spacing.xl}px ${spacing.md}px;
  color: ${(props) => props.theme.textMuted};
`;

const Note = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  border-radius: 18px;
  margin-top: ${spacing.sm}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
`;

const NoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;
