import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeProvider as StyledThemeProvider } from 'styled-components/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from './colors';

const THEME_STORAGE_KEY = 'chez-nous:themePreference';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  // 'system' | 'light' | 'dark'
  const [preference, setPreferenceState] = useState('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = (nextPreference) => {
    setPreferenceState(nextPreference);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  };

  const scheme = preference === 'system' ? (systemScheme ?? 'light') : preference;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({ scheme, preference, setPreference, colors }),
    [scheme, preference, colors],
  );

  return (
    <ThemeContext.Provider value={value}>
      <StyledThemeProvider theme={colors}>{children}</StyledThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
