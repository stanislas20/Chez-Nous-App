import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { AdvertiseGateScreen } from '../screens/AdvertiseGateScreen';
import { AdvertiseLoginScreen } from '../screens/AdvertiseLoginScreen';
import { AdvertiseSignUpScreen } from '../screens/AdvertiseSignUpScreen';
import { AdvertiserOnboardingScreen } from '../screens/AdvertiserOnboardingScreen';
import { AdSubmitScreen } from '../screens/AdSubmitScreen';

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
    Alert.alert(t('logoutConfirmTitle'), t('logoutConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logoutButton'), style: 'destructive', onPress: handleLogout },
    ]);
  };

  return (
    <Pressable onPress={handlePress} hitSlop={8} style={{ marginRight: spacing.md }}>
      <Ionicons name="log-out-outline" size={22} color={colors.primary} />
    </Pressable>
  );
}

// The entry screen of this nested stack (AdvertiseGate, or whichever screen
// ends up first depending on auth state) never gets an automatic back
// button from native-stack, since it only looks at history within this
// navigator — not the parent RootNavigator it was pushed from. Render one
// explicitly so the user can always leave without signing up/in.
function BackButton({ navigation }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={{ marginLeft: -spacing.xs }}>
      <Ionicons name="arrow-back" size={24} color={colors.primary} />
    </Pressable>
  );
}

export function AdvertiseStack() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user, advertiserProfile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontFamily: fontFamily.semiBold, color: colors.text },
        headerShadowVisible: false,
        headerLeft: () => <BackButton navigation={navigation} />,
        headerRight: () => <LanguageSwitch />,
      })}
    >
      {!user ? (
        <>
          <Stack.Screen
            name="AdvertiseGate"
            component={AdvertiseGateScreen}
            options={{ title: t('advertiseGateTitle') }}
          />
          <Stack.Screen
            name="AdvertiseLogin"
            component={AdvertiseLoginScreen}
            options={{ title: t('advertiserLoginTitle') }}
          />
          <Stack.Screen
            name="AdvertiseSignUp"
            component={AdvertiseSignUpScreen}
            options={{ title: t('advertiserSignUpTitle') }}
          />
        </>
      ) : !advertiserProfile ? (
        <Stack.Screen
          name="AdvertiserOnboarding"
          component={AdvertiserOnboardingScreen}
          options={{ title: t('advertiserSignUpTitle'), headerRight: () => <LogoutButton /> }}
        />
      ) : (
        <Stack.Screen
          name="AdSubmit"
          component={AdSubmitScreen}
          options={{ title: t('adSubmitFormTitle'), headerRight: () => <LogoutButton /> }}
        />
      )}
    </Stack.Navigator>
  );
}
