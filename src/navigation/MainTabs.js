import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { canPublish } from "../utils/canPublish";
import { useNotificationCenter } from "../hooks/useNotificationCenter";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { FloatingTabBar } from "./FloatingTabBar";
import { SellStack } from "./SellStack";
import { ForYouScreen } from "../screens/ForYouScreen";
import { LocalScreen } from "../screens/LocalScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { ChatListScreen } from "../screens/ChatListScreen";

const Tab = createBottomTabNavigator();

export function MainTabs() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const { unreadMessageCount, badgeCount } = useNotificationCenter(user?.uid);
  // An account that cannot publish is not looking for somewhere to sell.
  const mayPublish = canPublish(user);

  return (
    <Tab.Navigator
      initialRouteName="ForYou"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ navigation }) => ({
        headerRight: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => navigation.navigate("More")} hitSlop={8}>
              <Ionicons name="menu-outline" size={24} color={colors.text} />
            </Pressable>
            <LanguageSwitch />
          </View>
        ),
        headerTitleStyle: {
          fontFamily: fontFamily.semiBold,
          color: colors.text,
        },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen
        name="Sell"
        component={SellStack}
        options={({ route }) => ({
          // An account that cannot publish is not shopping for a place to
          // sell — calling the tab "Vendre" invites it into a form it will
          // be turned away from. Same tab, same stack: the dashboard behind
          // it is a buyer's home for those accounts.
          title: mayPublish ? t("tabSell") : t("tabBuy"),
          headerShown: false,
          // Password recovery is a task you finish or abandon, not a tab you
          // browse from — and the code keypad needs the full height the bar
          // would otherwise take.
          tabBarStyle:
            getFocusedRouteNameFromRoute(route) === "ForgotPassword"
              ? { display: "none" }
              : undefined,
        })}
      />
      <Tab.Screen
        name="ForYou"
        component={ForYouScreen}
        options={{ title: t("tabForYou"), headerShown: false }}
      />
      <Tab.Screen
        name="Local"
        component={LocalScreen}
        options={{ title: t("tabLocal"), headerShown: false }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: t("notificationsTitle"),
          tabBarBadge: badgeCount > 0 ? badgeCount : undefined,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={ChatListScreen}
        options={{
          title: t("tabChat"),
          tabBarBadge: unreadMessageCount > 0 ? unreadMessageCount : undefined,
        }}
      />
    </Tab.Navigator>
  );
}
