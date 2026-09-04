import { useMemo, useState } from "react";
import { Image, Linking, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { companyLogo } from "../data/companyLogos";
import {
  banksReviewedOn,
  banksSource,
  beninBanks,
  bankSearchTerms,
  formerNames,
} from "../data/beninBanks";
import { queryMatches } from "../utils/search";
import { useI18n } from "../i18n/I18nContext";

const EMERALD = "#0B6E4F";
// The hero, in the same family as the mark. Dark enough at every stop that
// white text clears 4.5:1 — check-contrast measures the literal pairs below.
const VAULT = ["#12805F", "#0B6E4F", "#083D2C", "#04211A"];

export function BanksScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  // Built from its parts: `new Date("2026-08-28")` is parsed as UTC midnight
  // and formatted locally, which prints the day before west of Greenwich.
  const reviewed = useMemo(() => {
    const [year, month, day] = banksReviewedOn.split("-").map(Number);
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  }, [language]);

  // Matched on the trading name, the short one people actually say, and any
  // name the bank used to have — somebody holding a Diamond Bank passbook
  // does not know it was bought.
  const banks = useMemo(
    () =>
      beninBanks.filter((bank) => queryMatches(query, ...bankSearchTerms(bank))),
    [query],
  );

  // A search, not a pin, and without a city either.
  //
  // The old list gave each bank one town and had no source for it. A bank has
  // branches in many, and naming one sends everybody else to the wrong place.
  // Searching the name alone lets the map answer with whichever branch is
  // nearest to the person holding the phone.
  const openInMaps = (bank) => {
    const search = encodeURIComponent(`${bank.name} Bénin`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${search}`);
  };

  return (
    <Container edges={["left", "right", "bottom"]}>
      <Hero
        colors={VAULT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + spacing.sm }}
      >
        <HeroMark pointerEvents="none">
          <Ionicons name="business" size={160} color="rgba(255,255,255,0.09)" />
        </HeroMark>
        <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </BackButton>
        <HeroKicker>{t("banksKicker")}</HeroKicker>
        <HeroTitle numberOfLines={2}>{t("banksHeroTitle")}</HeroTitle>
        <HeroCopy>{t("banksHeroCopy")}</HeroCopy>
        <SearchField>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.7)" />
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("banksSearchPlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.6)"
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons
                name="close-circle"
                size={17}
                color="rgba(255,255,255,0.7)"
              />
            </Pressable>
          ) : null}
        </SearchField>
      </Hero>

      <Body
        showsVerticalScrollIndicator={false}
        contentContainerStyle={bodyContentStyle}
        keyboardShouldPersistTaps="handled"
      >
        {/* Counted from the rows actually drawn, so it cannot drift from
            them the way a hard-coded "12 banques" would. */}
        <CountRow>
          <CountLabel>{t("banksCount", { count: banks.length })}</CountLabel>
          <ReviewedLabel numberOfLines={1}>{reviewed}</ReviewedLabel>
        </CountRow>

        {banks.length === 0 ? (
          <EmptyText>{t("banksEmptyResults")}</EmptyText>
        ) : (
          banks.map((bank) => {
            const logo = companyLogo(bank.key);
            const former = formerNames(bank.key);
            return (
              <Row key={bank.key}>
                <RowTop>
                  {/* The bank's own mark where its site publishes one and it
                      was read from a tag meaning "this is our mark" — see
                      companyLogos.js. The rest keep a plate with the short
                      name, which is what people say anyway. A logo found
                      somewhere else is as likely to be a competitor's, and a
                      wrong mark on a bank card is worse than no mark. */}
                  {logo ? (
                    <LogoPlate>
                      <LogoImage source={logo} resizeMode="contain" />
                    </LogoPlate>
                  ) : (
                    <MonogramPlate>
                      <Monogram numberOfLines={1} adjustsFontSizeToFit>
                        {bank.shortName}
                      </Monogram>
                    </MonogramPlate>
                  )}
                  <RowBody>
                    <RowName numberOfLines={2}>{bank.name}</RowName>
                    {/* The old name, shown only where there is one. It is the
                        half a rename loses: a directory that knows only the
                        new name tells the customer their bank does not
                        exist. */}
                    {former.length ? (
                      <FormerName numberOfLines={1}>
                        {t("banksFormerly", { name: former.join(", ") })}
                      </FormerName>
                    ) : null}
                  </RowBody>
                </RowTop>

                <Actions>
                  <PrimaryAction onPress={() => openInMaps(bank)}>
                    <Ionicons name="navigate-outline" size={15} color="#ffffff" />
                    <PrimaryActionLabel>{t("banksFindBranch")}</PrimaryActionLabel>
                  </PrimaryAction>
                  {/* The url was in the data and on no screen: six of these
                      banks had a site somebody opened and confirmed, and the
                      app offered none of them. Where there is none, the
                      reason is said rather than the gap left blank — several
                      of these sites answer a script with 403, so "not
                      verified" is the honest word and "no site" would be a
                      claim we cannot make. */}
                  {bank.url ? (
                    <SecondaryAction onPress={() => Linking.openURL(bank.url)}>
                      <Ionicons name="globe-outline" size={15} color={colors.primary} />
                      <SecondaryActionLabel>
                        {bank.urlScope === "group"
                          ? t("banksGroupSite")
                          : t("banksWebsite")}
                      </SecondaryActionLabel>
                    </SecondaryAction>
                  ) : (
                    <UnverifiedLabel numberOfLines={1}>
                      {t("banksSiteUnverified")}
                    </UnverifiedLabel>
                  )}
                </Actions>
              </Row>
            );
          })
        )}

        {/* Where the list comes from and when it was read. A register is
            only as good as its date, and this one changes. */}
        <SourceNote onPress={() => Linking.openURL(banksSource)}>
          <SourceText>{t("banksSourceNote", { date: reviewed })}</SourceText>
        </SourceNote>
      </Body>
    </Container>
  );
}

const bodyContentStyle = {
  padding: spacing.md,
  paddingBottom: spacing.xl,
};

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  padding: 0 ${spacing.md}px ${spacing.md}px;
  border-bottom-left-radius: ${radius.lg}px;
  border-bottom-right-radius: ${radius.lg}px;
  overflow: hidden;
`;

const HeroMark = styled.View`
  position: absolute;
  right: -28px;
  bottom: -34px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  margin-left: -6px;
`;

const HeroKicker = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  letter-spacing: 1.1px;
  color: rgba(255, 255, 255, 0.72);
  margin-top: ${spacing.xs}px;
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 26px;
  line-height: 32px;
  color: #ffffff;
  margin-top: 4px;
`;

const HeroCopy = styled.Text`
  ${type.caption}
  color: rgba(255, 255, 255, 0.82);
  margin-top: 6px;
`;

const SearchField = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 10px ${spacing.md}px;
  margin-top: ${spacing.md}px;
`;

const SearchInput = styled.TextInput`
  flex: 1;
  ${type.body}
  color: #ffffff;
  padding: 0;
`;

const Body = styled.ScrollView`
  flex: 1;
`;

const CountRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing.sm}px;
`;

const CountLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
`;

const ReviewedLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
  margin-left: ${spacing.sm}px;
`;

const EmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  padding: ${spacing.lg}px 0;
`;

const Row = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.lg}px;
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const RowTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
`;

// White, because a logo is drawn for a white page and several of these are
// dark marks that vanish on a dark surface.
const LogoPlate = styled.View`
  width: 52px;
  height: 52px;
  border-radius: ${radius.md}px;
  background-color: #ffffff;
  align-items: center;
  justify-content: center;
  padding: 6px;
`;

const LogoImage = styled(Image)`
  width: 100%;
  height: 100%;
`;

// The same white plate the logos get, for two reasons. Emerald letters on
// the dark card measured 2.63:1 — under the 4.5:1 floor, and invisible to
// check-contrast because the card colour is a theme value resolved at
// runtime. And a bank with no published mark should not get a visibly
// different kind of row from one that has it.
const MonogramPlate = styled.View`
  width: 52px;
  height: 52px;
  border-radius: ${radius.md}px;
  background-color: #ffffff;
  align-items: center;
  justify-content: center;
  padding: 6px;
`;

const Monogram = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${EMERALD};
`;

const RowBody = styled.View`
  flex: 1;
  min-width: 0px;
`;

const RowName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const FormerName = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const Actions = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
`;

const PrimaryAction = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  background-color: ${EMERALD};
  border-radius: 999px;
  padding: 9px ${spacing.md}px;
`;

const PrimaryActionLabel = styled.Text`
  ${type.captionMedium}
  color: #ffffff;
`;

const SecondaryAction = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 9px ${spacing.md}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

// theme.primary, not the literal: #0B6E4F on the dark card is 2.63:1,
// where the palette's own #22B26A is 5.98:1. The hero and the filled
// button keep the literal because they set their own dark ground.
const SecondaryActionLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
`;

const UnverifiedLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
`;

const SourceNote = styled(Pressable)`
  margin-top: ${spacing.md}px;
`;

const SourceText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;
