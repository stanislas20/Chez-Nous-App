import { useState } from "react";
import { Alert, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { categories } from "../data/categories";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import { openAccountGate } from "../utils/openAccountGate";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

const THEME_OPTIONS = [
  { key: "system", labelKey: "themeSystem" },
  { key: "light", labelKey: "themeLight" },
  { key: "dark", labelKey: "themeDark" },
];

const NON_PHARMACY_CATEGORIES = categories.filter((category) => category.key !== "pharmacyOnDuty");
const CATEGORY_EMOJI = {
  vehicles: "🚗",
  realEstate: "🏠",
  electronics: "📱",
  fashion: "👕",
  homeGarden: "🛋️",
  furniture: "🪑",
  babyKids: "🧸",
  sports: "⚽",
  agriculture: "🌾",
  services: "🛠️",
  community: "👥",
  jobs: "💼",
};
const TOP_CATEGORIES = NON_PHARMACY_CATEGORIES.slice(0, 5);
const REMAINING_CATEGORIES = NON_PHARMACY_CATEGORIES.slice(5);

export function MoreScreen({ navigation }) {
  const { colors, preference, setPreference } = useTheme();
  const { language, setLanguage, t, resetLanguage } = useI18n();
  const { user, sellerProfile, advertiserProfile, logOut } = useAuth();
  const [showAllCategories, setShowAllCategories] = useState(false);

  const name = sellerProfile?.fullName || advertiserProfile?.businessName || user?.displayName;
  const initial = name ? name.trim().charAt(0).toUpperCase() : null;

  const goToProfile = () => {
    if (sellerProfile) {
      navigation.navigate("MainTabs", { screen: "Sell" });
    } else if (advertiserProfile) {
      navigation.navigate("Advertise");
    }
  };

  const goToCategory = (category) => {
    navigation.navigate("CategoryListings", {
      categoryKey: category.key,
      labelEn: category.labelEn,
      labelFr: category.labelFr,
    });
  };

  const showComingSoon = (labelKey) => Alert.alert(t(labelKey), t("dashboardHelpComingSoon"));

  const handleLogout = () => {
    Alert.alert(t("logoutConfirmTitle"), t("logoutConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("logoutButton"),
        style: "destructive",
        onPress: () => {
          logOut();
          resetLanguage();
        },
      },
    ]);
  };

  const jobsCategory = categories.find((category) => category.key === "jobs");
  const communityCategory = categories.find((category) => category.key === "community");
  const pharmacyCategory = categories.find((category) => category.key === "pharmacyOnDuty");

  return (
    <Container edges={["top", "left", "right", "bottom"]}>
      <HeaderRow>
        <HeaderIconButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </HeaderIconButton>
        <HeaderTitle>{t("menuTitle")}</HeaderTitle>
        <LangPill onPress={() => setLanguage(language === "en" ? "fr" : "en")}>
          <LangPillLabel>{language === "en" ? "EN" : "FR"}</LangPillLabel>
        </LangPill>
      </HeaderRow>

      <ScrollView contentContainerStyle={scrollContentStyle} showsVerticalScrollIndicator={false}>
        {user ? (
          <AccountRow onPress={goToProfile}>
            <AvatarGradient colors={[EMERALD, GOLD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <AvatarLabel>
                {initial ?? <Ionicons name="person" size={18} color="#fff" />}
              </AvatarLabel>
            </AvatarGradient>
            <AccountCol>
              <AccountName numberOfLines={1}>{name}</AccountName>
              <AccountLink>{t("menuViewProfileLink")}</AccountLink>
            </AccountCol>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </AccountRow>
        ) : (
          <SignInRow onPress={() => openAccountGate(navigation)}>
            <Ionicons name="person-circle-outline" size={34} color={colors.primary} />
            <AccountCol>
              <AccountName numberOfLines={1}>{t("favoritesSignInTitle")}</AccountName>
              <AccountSub numberOfLines={2}>{t("favoritesSignInMessage")}</AccountSub>
            </AccountCol>
          </SignInRow>
        )}

        <QuickGrid>
          <QuickTile onPress={() => navigation.navigate("Saved")}>
            <Ionicons name="heart-outline" size={17} color={EMERALD} />
            <QuickTileLabel>{t("moreSavedTileLabel")}</QuickTileLabel>
          </QuickTile>
          <QuickTile onPress={() => navigation.navigate("RecentlyViewed")}>
            <Ionicons name="time-outline" size={17} color={EMERALD} />
            <QuickTileLabel>{t("recentlyViewedScreenTitle")}</QuickTileLabel>
          </QuickTile>
        </QuickGrid>

        <SectionLabel>{t("menuExploreSectionTitle")}</SectionLabel>
        <RowList>
          {TOP_CATEGORIES.map((category) => (
            <CategoryRow key={category.key} onPress={() => goToCategory(category)}>
              <CategoryIconBadge>
                <CategoryEmoji>{CATEGORY_EMOJI[category.key]}</CategoryEmoji>
              </CategoryIconBadge>
              <CategoryRowLabel>
                {language === "en" ? category.labelEn : category.labelFr}
              </CategoryRowLabel>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </CategoryRow>
          ))}
          {showAllCategories
            ? REMAINING_CATEGORIES.map((category) => (
                <CategoryRow key={category.key} onPress={() => goToCategory(category)}>
                  <CategoryIconBadge>
                    <CategoryEmoji>{CATEGORY_EMOJI[category.key]}</CategoryEmoji>
                  </CategoryIconBadge>
                  <CategoryRowLabel>
                    {language === "en" ? category.labelEn : category.labelFr}
                  </CategoryRowLabel>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </CategoryRow>
              ))
            : null}
        </RowList>
        <SeeAllLink onPress={() => setShowAllCategories((value) => !value)}>
          {showAllCategories ? t("menuSeeLessCategoriesLink") : t("menuSeeAllCategoriesLink")} →
        </SeeAllLink>

        <SectionLabel>{t("menuUsefulServicesSectionTitle")}</SectionLabel>
        <RowList>
          {pharmacyCategory ? (
            <CategoryRow onPress={() => goToCategory(pharmacyCategory)}>
              <CategoryEmoji>💊</CategoryEmoji>
              <CategoryRowLabel>
                {language === "en" ? pharmacyCategory.labelEn : pharmacyCategory.labelFr}
              </CategoryRowLabel>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </CategoryRow>
          ) : null}
          {jobsCategory ? (
            <CategoryRow
              onPress={() =>
                navigation.navigate("MainTabs", { screen: "ForYou", params: { chip: "jobs" } })
              }
            >
              <CategoryEmoji>💼</CategoryEmoji>
              <CategoryRowLabel>
                {language === "en" ? jobsCategory.labelEn : jobsCategory.labelFr}
              </CategoryRowLabel>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </CategoryRow>
          ) : null}
          <CategoryRow onPress={() => navigation.navigate("Restaurants")}>
            <CategoryEmoji>🍽️</CategoryEmoji>
            <CategoryRowLabel>{t("menuRestaurantsRow")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
          <CategoryRow onPress={() => navigation.navigate("Banks")}>
            <CategoryEmoji>🏦</CategoryEmoji>
            <CategoryRowLabel>{t("menuBanksRow")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
          <CategoryRow onPress={() => navigation.navigate("Tourism")}>
            <CategoryEmoji>🏝️</CategoryEmoji>
            <CategoryRowLabel>{t("menuTourismRow")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
          <CategoryRow onPress={() => navigation.navigate("Events")}>
            <CategoryEmoji>🎟️</CategoryEmoji>
            <CategoryRowLabel>{t("menuEventsRow")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
          {communityCategory ? (
            <CategoryRow onPress={() => goToCategory(communityCategory)} last>
              <CategoryEmoji>👥</CategoryEmoji>
              <CategoryRowLabel>
                {language === "en" ? communityCategory.labelEn : communityCategory.labelFr}
              </CategoryRowLabel>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </CategoryRow>
          ) : null}
        </RowList>

        <BusinessCard onPress={() => navigation.navigate("Advertise")}>
          <BusinessGradient
            colors={["rgba(11,110,79,0.08)", "rgba(217,164,65,0.1)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <BusinessKicker>{t("menuBusinessKicker")}</BusinessKicker>
            <BusinessTitle>{t("menuBusinessTitle")}</BusinessTitle>
            <BusinessCopy>{t("menuBusinessCopy")}</BusinessCopy>
            <BusinessCta>{t("menuBusinessCta")} →</BusinessCta>
          </BusinessGradient>
        </BusinessCard>

        <SectionLabel>{t("menuPreferencesSectionTitle")}</SectionLabel>
        <RowList>
          <CategoryRow onPress={() => setLanguage(language === "en" ? "fr" : "en")}>
            <CategoryRowLabel>{t("menuLanguageRow")}</CategoryRowLabel>
            <PrefValue>{language === "en" ? "EN" : "FR"}</PrefValue>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
          <AppearanceRow>
            <CategoryRowLabel>{t("themeSectionTitle")}</CategoryRowLabel>
            <SegControl>
              {THEME_OPTIONS.map((option) => {
                const selected = preference === option.key;
                return (
                  <SegOption
                    key={option.key}
                    selected={selected}
                    onPress={() => setPreference(option.key)}
                  >
                    <SegOptionLabel selected={selected}>{t(option.labelKey)}</SegOptionLabel>
                  </SegOption>
                );
              })}
            </SegControl>
          </AppearanceRow>
          <CategoryRow
            onPress={() => navigation.navigate("MainTabs", { screen: "Notifications" })}
            last
          >
            <CategoryRowLabel>{t("notificationsTitle")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
        </RowList>

        <SectionLabel>{t("menuHelpSafetySectionTitle")}</SectionLabel>
        <RowList>
          <CategoryRow onPress={() => showComingSoon("menuHelpCenterRow")}>
            <CategoryRowLabel>{t("menuHelpCenterRow")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
          <CategoryRow onPress={() => showComingSoon("menuSafetyTipsRow")}>
            <CategoryRowLabel>{t("menuSafetyTipsRow")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
          <CategoryRow onPress={() => showComingSoon("menuPrivacyRow")}>
            <CategoryRowLabel>{t("menuPrivacyRow")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
          <CategoryRow onPress={() => showComingSoon("menuAboutRow")} last>
            <CategoryRowLabel>{t("menuAboutRow")}</CategoryRowLabel>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </CategoryRow>
        </RowList>

        {user ? (
          <SignOutRow onPress={handleLogout}>
            <SignOutLabel>{t("logoutButton")}</SignOutLabel>
          </SignOutRow>
        ) : null}
      </ScrollView>
    </Container>
  );
}

const scrollContentStyle = { paddingHorizontal: spacing.md, paddingBottom: spacing.xl };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
`;

const HeaderIconButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const LangPill = styled(Pressable)`
  background-color: rgba(11, 110, 79, 0.1);
  padding-horizontal: 11px;
  padding-vertical: 7px;
  border-radius: ${radius.pill}px;
`;

const LangPillLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${EMERALD};
`;

const AccountRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px 4px;
  margin-top: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

const AvatarGradient = styled(LinearGradient)`
  width: 46px;
  height: 46px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
`;

const AvatarLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: #ffffff;
`;

const AccountCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const AccountName = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
`;

const AccountLink = styled.Text`
  ${type.captionMedium}
  color: ${EMERALD};
  margin-top: 2px;
`;

const AccountSub = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const SignInRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px 4px;
  margin-top: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

const QuickGrid = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

const QuickTile = styled(Pressable)`
  flex: 1;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surface};
  shadow-color: #000000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.08;
  shadow-radius: 6px;
  elevation: 2;
`;

const QuickTileLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const RowList = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  margin-bottom: ${spacing.sm}px;
  overflow: hidden;
  shadow-color: #000000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.06;
  shadow-radius: 6px;
  elevation: 1;
`;

const CategoryRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 13px ${spacing.md}px;
  border-bottom-width: ${(props) => (props.last ? 0 : 1)}px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const CategoryIconBadge = styled.View`
  width: 36px;
  height: 36px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  align-items: center;
  justify-content: center;
`;

const CategoryEmoji = styled.Text`
  font-size: 18px;
`;

const CategoryRowLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const PrefValue = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const SeeAllLink = styled.Text`
  ${type.captionMedium}
  color: ${EMERALD};
  padding: 4px 4px ${spacing.lg}px;
`;

const BusinessCard = styled(Pressable)`
  border-radius: ${radius.lg}px;
  overflow: hidden;
  margin-bottom: ${spacing.lg}px;
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.1);
`;

const BusinessGradient = styled(LinearGradient)`
  padding: ${spacing.md}px;
`;

const BusinessKicker = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${EMERALD};
  margin-bottom: ${spacing.sm}px;
`;

const BusinessTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.xs}px;
`;

const BusinessCopy = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  line-height: 18px;
  margin-bottom: ${spacing.md}px;
`;

const BusinessCta = styled.Text`
  ${type.captionMedium}
  color: ${EMERALD};
`;

const AppearanceRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  padding: 11px ${spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const SegControl = styled.View`
  flex-direction: row;
  gap: 2px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: 12px;
  padding: 3px;
`;

const SegOption = styled(Pressable)`
  padding: 6px 8px;
  border-radius: 10px;
  background-color: ${(props) => (props.selected ? EMERALD : "transparent")};
`;

const SegOptionLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${(props) => (props.selected ? "#ffffff" : props.theme.textMuted)};
`;

const SignOutRow = styled(Pressable)`
  align-items: center;
  padding: ${spacing.md}px 0 ${spacing.sm}px;
`;

const SignOutLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.error};
`;
