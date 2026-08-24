import { ActivityIndicator, Pressable, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { LanguageSelectScreen } from "../screens/LanguageSelectScreen";
import { MainTabs } from "./MainTabs";
import { AdvertiseStack } from "./AdvertiseStack";
import { CategoryListingsScreen } from "../screens/CategoryListingsScreen";
import { ProductDetailScreen } from "../screens/ProductDetailScreen";
import { JobDetailScreen } from "../screens/JobDetailScreen";
import { JobApplicationsScreen } from "../screens/JobApplicationsScreen";
import { SellerProfileScreen } from "../screens/SellerProfileScreen";
import { FollowListScreen } from "../screens/FollowListScreen";
import { SubmitCarParkScreen } from "../screens/SubmitCarParkScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { SavedListingsScreen } from "../screens/SavedListingsScreen";
import { RecentlyViewedScreen } from "../screens/RecentlyViewedScreen";
import { BanksScreen } from "../screens/BanksScreen";
import { RestaurantsScreen } from "../screens/RestaurantsScreen";
import { RealEstateScreen } from "../screens/RealEstateScreen";
import { CarsScreen } from "../screens/CarsScreen";
import { CarParksScreen } from "../screens/CarParksScreen";
import { CarDealershipsScreen } from "../screens/CarDealershipsScreen";
import { TyresScreen } from "../screens/TyresScreen";
import { BatteryScreen } from "../screens/BatteryScreen";
import { ElectricScreen } from "../screens/ElectricScreen";
import { BodyworkScreen } from "../screens/BodyworkScreen";
import { ModerationScreen } from "../screens/ModerationScreen";
import { GaragesScreen } from "../screens/GaragesScreen";
import { BreakdownScreen } from "../screens/BreakdownScreen";
import { VehicleListScreen } from "../screens/VehicleListScreen";
import { RealEstateDetailScreen } from "../screens/RealEstateDetailScreen";
import { ReportListingScreen } from "../screens/ReportListingScreen";
import { ScreenErrorBoundary } from "../components/ScreenErrorBoundary";
import { AccountTypeScreen } from "../screens/AccountTypeScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { ForgotPasswordScreen } from "../screens/ForgotPasswordScreen";
import { PharmacyDetailScreen } from "../screens/PharmacyDetailScreen";
import { TourismScreen } from "../screens/TourismScreen";
import { EventsScreen } from "../screens/EventsScreen";

const Stack = createNativeStackNavigator();

// Native-stack's own auto-generated back button has been observed to stop
// responding to touch on iOS (confirmed: same screens work fine on
// Android, and everything else on the same iOS screens — scrolling,
// tapping list items — stays responsive; it's isolated to that one native
// control). Swapping it for a plain JS Pressable sidesteps whatever native
// UIKit issue that is, and matches the custom back buttons already used
// elsewhere in the app (LocalScreen, MoreScreen, ProductDetailScreen),
// which have never had this problem on either platform.
function renderHeaderBackButton(navigation, color) {
  return () => (
    <Pressable
      onPress={() => navigation.goBack()}
      hitSlop={12}
      style={backButtonStyle}
    >
      <Ionicons name="chevron-back" size={26} color={color} />
    </Pressable>
  );
}

const backButtonStyle = { paddingRight: 12, paddingVertical: 4 };

// Temporary: the Restaurants search crash could not be reproduced on the
// dev device, so the screen reports its own render errors rather than
// disappearing. Remove once the cause is known.
function GuardedRestaurants(props) {
  return (
    <ScreenErrorBoundary label="Restaurants — render error">
      <RestaurantsScreen {...props} />
    </ScreenErrorBoundary>
  );
}

export function RootNavigator() {
  const { colors } = useTheme();
  const { language, isLoading, t } = useI18n();

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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!language ? (
        <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} />
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Advertise" component={AdvertiseStack} />
          <Stack.Screen
            name="More"
            component={MoreScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Banks"
            component={BanksScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PharmacyDetail"
            component={PharmacyDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Restaurants"
            component={GuardedRestaurants}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="RealEstate"
            component={RealEstateScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Cars"
            component={CarsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CarParks"
            component={CarParksScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CarDealerships"
            component={CarDealershipsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Garages"
            component={GaragesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Tyres"
            component={TyresScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Battery"
            component={BatteryScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Electric"
            component={ElectricScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Bodywork"
            component={BodyworkScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Moderation"
            component={ModerationScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Breakdown"
            component={BreakdownScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="VehicleList"
            component={VehicleListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="RealEstateDetail"
            component={RealEstateDetailScreen}
            options={{ headerShown: false }}
          />
          {/* The same auth screens SellStack owns, pushed here instead so
              the screen that needed an account stays underneath. */}
          <Stack.Screen
            name="AuthAccountType"
            component={AccountTypeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AuthSignUp"
            component={SignUpScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AuthLogin"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AuthForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ReportListing"
            component={ReportListingScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Tourism"
            component={TourismScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Events"
            component={EventsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Saved"
            component={SavedListingsScreen}
            options={({ navigation }) => ({
              headerShown: true,
              title: t("savedScreenTitle"),
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: {
                fontFamily: fontFamily.semiBold,
                color: colors.text,
              },
              headerShadowVisible: false,
              headerLeft: renderHeaderBackButton(navigation, colors.primary),
            })}
          />
          <Stack.Screen
            name="RecentlyViewed"
            component={RecentlyViewedScreen}
            options={({ navigation }) => ({
              headerShown: true,
              title: t("recentlyViewedScreenTitle"),
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: {
                fontFamily: fontFamily.semiBold,
                color: colors.text,
              },
              headerShadowVisible: false,
              headerLeft: renderHeaderBackButton(navigation, colors.primary),
            })}
          />
          <Stack.Screen
            name="CategoryListings"
            component={CategoryListingsScreen}
            options={({ navigation }) => ({
              headerShown: true,
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: {
                fontFamily: fontFamily.semiBold,
                color: colors.text,
              },
              headerShadowVisible: false,
              headerLeft: renderHeaderBackButton(navigation, colors.primary),
            })}
          />
          <Stack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="JobDetail"
            component={JobDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="JobApplications"
            component={JobApplicationsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SubmitCarPark"
            component={SubmitCarParkScreen}
            options={{
              headerShown: true,
              title: t("parkSubmitTitle"),
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: {
                fontFamily: fontFamily.semiBold,
                color: colors.text,
              },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="FollowList"
            component={FollowListScreen}
            options={({ route }) => ({
              headerShown: true,
              title: t(
                route.params?.kind === "followers"
                  ? "followListFollowersTitle"
                  : "followListFollowingTitle",
              ),
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: {
                fontFamily: fontFamily.semiBold,
                color: colors.text,
              },
              headerShadowVisible: false,
            })}
          />
          <Stack.Screen
            name="SellerProfile"
            component={SellerProfileScreen}
            options={({ route, navigation }) => ({
              headerShown: true,
              title: route.params?.sellerName ?? t("sellerProfileTitle"),
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: {
                fontFamily: fontFamily.semiBold,
                color: colors.text,
              },
              headerShadowVisible: false,
              headerLeft: renderHeaderBackButton(navigation, colors.primary),
            })}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={({ navigation }) => ({
              headerShown: true,
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: {
                fontFamily: fontFamily.semiBold,
                color: colors.text,
              },
              headerShadowVisible: false,
              headerLeft: renderHeaderBackButton(navigation, colors.primary),
            })}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
