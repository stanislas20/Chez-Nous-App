import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useConversations } from '../hooks/useConversations';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { SellStack } from './SellStack';
import { ForYouScreen } from '../screens/ForYouScreen';
import { LocalScreen } from '../screens/LocalScreen';
import { JobsScreen } from '../screens/JobsScreen';
import { ChatListScreen } from '../screens/ChatListScreen';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Sell: 'pricetag-outline',
  ForYou: 'home-outline',
  Local: 'location-outline',
  Jobs: 'briefcase-outline',
  Messages: 'chatbubbles-outline',
};

export function MainTabs() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const conversations = useConversations(user?.uid);
  const unreadCount = (conversations ?? []).reduce(
    (sum, conversation) => sum + (conversation.unreadCount?.[user?.uid] ?? 0),
    0,
  );

  return (
    <Tab.Navigator
      initialRouteName="ForYou"
      screenOptions={({ route, navigation }) => ({
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => navigation.navigate('More')} hitSlop={8}>
              <Ionicons name="menu-outline" size={24} color={colors.text} />
            </Pressable>
            <LanguageSwitch />
          </View>
        ),
        headerTitleStyle: { fontFamily: fontFamily.semiBold, color: colors.text },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarIcon: ({ focused, color, size }) => (
          <View
            style={{
              width: size + 24,
              height: size + 14,
              borderRadius: (size + 14) / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: focused ? colors.primaryLight : 'transparent',
            }}
          >
            <Ionicons name={TAB_ICONS[route.name]} color={color} size={size} />
          </View>
        ),
        tabBarLabel: ({ focused, color, children }) => (
          <Text
            style={{
              color,
              fontSize: 11,
              marginTop: 2,
              fontFamily: focused ? fontFamily.semiBold : fontFamily.medium,
            }}
          >
            {children}
          </Text>
        ),
      })}
    >
      <Tab.Screen
        name="Sell"
        component={SellStack}
        options={{ title: t('tabSell'), headerShown: false }}
      />
      <Tab.Screen
        name="ForYou"
        component={ForYouScreen}
        options={{ title: t('tabForYou'), headerShown: false }}
      />
      <Tab.Screen name="Local" component={LocalScreen} options={{ title: t('tabLocal') }} />
      <Tab.Screen name="Jobs" component={JobsScreen} options={{ title: t('tabJobs') }} />
      <Tab.Screen
        name="Messages"
        component={ChatListScreen}
        options={{
          title: t('tabChat'),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.error },
        }}
      />
    </Tab.Navigator>
  );
}
