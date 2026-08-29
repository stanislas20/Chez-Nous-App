import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
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
import { SellerInsightsScreen } from "../screens/SellerInsightsScreen";
import { categories } from "../data/categories";

const Stack = createNativeStackNavigator();

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
            // No navigation header: the dashboard's own emerald banner runs
            // to the top of the screen, and a white bar above it split the
            // two. Logout moved into the account sheet behind the gear,
            // where it already had a row.
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CompanyProfileEdit"
            component={CompanyProfileEditScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CreateListing"
            component={CreateListingScreen}
            // The screen draws its own header row, so the navigator's would
            // be a second title bar with a second back arrow above it. Two
            // arrows is one too many to explain, and the screen's own can
            // follow the category as it changes.
            options={{ headerShown: false }}
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
            name="SellerInsights"
            component={SellerInsightsScreen}
            options={{ title: t("sellerInsightsTitle") }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
