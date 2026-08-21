import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { SellGateScreen } from "../screens/SellGateScreen";
import { AccountTypeScreen } from "../screens/AccountTypeScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { ForgotPasswordScreen } from "../screens/ForgotPasswordScreen";
import { SellerDashboardScreen } from "../screens/SellerDashboardScreen";
import { CreateListingScreen } from "../screens/CreateListingScreen";
import { CompanyProfileEditScreen } from "../screens/CompanyProfileEditScreen";
import { MyListingsScreen } from "../screens/MyListingsScreen";
import { ParkInventoryScreen } from "../screens/ParkInventoryScreen";
import { EditListingScreen } from "../screens/EditListingScreen";
import { SellerInsightsScreen } from "../screens/SellerInsightsScreen";
import { categories } from "../data/categories";

const Stack = createNativeStackNavigator();

function LogoutButton() {
  const { colors } = useTheme();
  const { t, resetLanguage } = useI18n();
  const { logOut } = useAuth();

  // Resetting the language sends the user back to LanguageSelectScreen —
  // RootNavigator swaps its whole tree to it whenever no language is set,
  // so logout lands on the app's actual first landing screen instead of
  // leaving them on a gated/empty version of the current tab.
  const handleLogout = () => {
    logOut();
    resetLanguage();
  };

  const handlePress = () => {
    Alert.alert(t("logoutConfirmTitle"), t("logoutConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("logoutButton"), style: "destructive", onPress: handleLogout },
    ]);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={{ marginRight: spacing.md }}
    >
      <Ionicons name="log-out-outline" size={22} color={colors.primary} />
    </Pressable>
  );
}

export function SellStack() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: {
          fontFamily: fontFamily.semiBold,
          color: colors.text,
        },
        headerShadowVisible: false,
        headerRight: () => <LanguageSwitch />,
      }}
    >
      {!user ? (
        <>
          <Stack.Screen
            name="SellGate"
            component={SellGateScreen}
            options={{ title: t("tabSell") }}
          />
          <Stack.Screen
            name="AccountType"
            component={AccountTypeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SellLogin"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SellSignUp"
            component={SignUpScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="SellerDashboard"
            component={SellerDashboardScreen}
            options={{
              title: t("sellerDashboardTitle"),
              headerRight: () => <LogoutButton />,
            }}
          />
          <Stack.Screen
            name="CompanyProfileEdit"
            component={CompanyProfileEditScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CreateListing"
            component={CreateListingScreen}
            options={({ route }) => {
              const category = categories.find(
                (item) => item.key === route.params?.categoryKey,
              );
              const title = category
                ? language === "en"
                  ? category.labelEn
                  : category.labelFr
                : route.params?.isPromoted
                  ? t("promoteListingTileLabel")
                  : t("sellTitle");
              return { title };
            }}
          />
          <Stack.Screen
            name="MyListings"
            component={MyListingsScreen}
            options={{ title: t("myListingsTitle") }}
          />
          <Stack.Screen
            name="ParkInventory"
            component={ParkInventoryScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EditListing"
            component={EditListingScreen}
            options={{ title: t("editListingTitle") }}
          />
          <Stack.Screen
            name="SellerInsights"
            component={SellerInsightsScreen}
            options={{ title: t("sellerInsightsTitle") }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
