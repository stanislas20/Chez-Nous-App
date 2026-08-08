import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSelectScreen } from '../screens/LanguageSelectScreen';
import { MainTabs } from './MainTabs';
import { AdvertiseStack } from './AdvertiseStack';
import { CategoryListingsScreen } from '../screens/CategoryListingsScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { SavedListingsScreen } from '../screens/SavedListingsScreen';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { colors } = useTheme();
  const { language, isLoading, t } = useI18n();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
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
            options={{
              headerShown: true,
              title: t('tabMore'),
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: { fontFamily: fontFamily.semiBold, color: colors.text },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="Saved"
            component={SavedListingsScreen}
            options={{
              headerShown: true,
              title: t('savedScreenTitle'),
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: { fontFamily: fontFamily.semiBold, color: colors.text },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{
              headerShown: true,
              title: t('notificationsTitle'),
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: { fontFamily: fontFamily.semiBold, color: colors.text },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="CategoryListings"
            component={CategoryListingsScreen}
            options={{
              headerShown: true,
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: { fontFamily: fontFamily.semiBold, color: colors.text },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{
              headerShown: true,
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: { fontFamily: fontFamily.semiBold, color: colors.text },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{
              headerShown: true,
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.surface },
              headerTitleStyle: { fontFamily: fontFamily.semiBold, color: colors.text },
              headerShadowVisible: false,
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
