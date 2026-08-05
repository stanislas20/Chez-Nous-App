import { css } from 'styled-components/native';

export const lightColors = {
  primary: '#0F7A4A',
  primaryDark: '#0A5C38',
  primaryLight: '#E3F5EC',
  accent: '#E8A33D',
  accentDark: '#9C6A1F',
  accentLight: '#FBF0DC',
  error: '#D64545',
  errorLight: '#FBEAEA',
  background: '#F6F8F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F2EE',
  border: '#E3E6EA',
  text: '#14171A',
  textMuted: '#6B7280',
  textInverse: '#FFFFFF',
  scrim: 'rgba(10, 22, 16, 0.55)',
  flagRed: '#D64545',
  skyBlue: '#5BC0EB',
  skyGrey: '#B7C0C7',
  scheme: 'light',
};

export const darkColors = {
  primary: '#22B26A',
  primaryDark: '#0F7A4A',
  primaryLight: '#123526',
  accent: '#F0B559',
  accentDark: '#E8A33D',
  accentLight: '#3A2C14',
  error: '#F17070',
  errorLight: '#3A1A1A',
  background: '#10140F',
  surface: '#1A211B',
  surfaceAlt: '#212A22',
  border: '#2B342C',
  text: '#F1F4EF',
  textMuted: '#98A39C',
  textInverse: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.7)',
  flagRed: '#D64545',
  skyBlue: '#5BC0EB',
  skyGrey: '#B7C0C7',
  scheme: 'dark',
};

// Back-compat default for any file not yet converted to useTheme() — always
// resolves to the light palette rather than crashing.
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const shadow = {
  card: css`
    shadow-color: #0b1f16;
    shadow-offset: 0px 4px;
    shadow-opacity: 0.1;
    shadow-radius: 10px;
    elevation: 3;
  `,
};
