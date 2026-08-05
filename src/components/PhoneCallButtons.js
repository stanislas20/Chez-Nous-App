import { Alert, Linking, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';

export function splitPhoneNumbers(phone) {
  return (phone ?? '')
    .split('/')
    .map((number) => number.trim())
    .filter(Boolean);
}

// Renders a pharmacy's phone number(s) as individually tappable call buttons.
// A single number gets one full "Appeler" button; multiple slash-separated
// numbers (e.g. "0198677272/0157281097") each get their own button showing
// the actual digits, since the user needs to pick which one to dial.
export function PhoneCallButtons({ phone, size = 'md', style }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const numbers = splitPhoneNumbers(phone);
  if (numbers.length === 0) return null;

  // iOS already shows its own native "Call {number}?" confirmation before
  // dialing a tel: link, but Android jumps straight to the call screen — so
  // we render our own confirmation there (which, as an in-app dialog, also
  // correctly follows the app's language setting, unlike the native one).
  const call = (number) => {
    if (Platform.OS !== 'android') {
      Linking.openURL(`tel:${number}`);
      return;
    }
    Alert.alert(t('confirmCallTitle', { phone: number }), t('confirmCallMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('callButtonLabel'), onPress: () => Linking.openURL(`tel:${number}`) },
    ]);
  };

  if (numbers.length === 1) {
    return (
      <CallButton size={size} style={style} onPress={() => call(numbers[0])} hitSlop={6}>
        <Ionicons name="call" size={size === 'lg' ? 18 : 14} color={colors.textInverse} />
        <CallButtonLabel size={size}>{t('callButtonLabel')}</CallButtonLabel>
      </CallButton>
    );
  }

  return (
    <ChipsRow style={style}>
      {numbers.map((number) => (
        <CallChip key={number} size={size} onPress={() => call(number)} hitSlop={6}>
          <Ionicons name="call" size={size === 'lg' ? 15 : 12} color={colors.textInverse} />
          <CallChipLabel size={size}>{number}</CallChipLabel>
        </CallChip>
      ))}
    </ChipsRow>
  );
}

const CallButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${(props) => (props.size === 'lg' ? spacing.md : spacing.sm)}px;
  padding-horizontal: ${spacing.md}px;
`;

const CallButtonLabel = styled.Text`
  ${(props) => (props.size === 'lg' ? type.button : type.captionMedium)}
  color: ${(props) => props.theme.textInverse};
`;

const ChipsRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.xs}px;
`;

const CallChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: ${(props) => (props.size === 'lg' ? spacing.sm : 6)}px;
`;

const CallChipLabel = styled.Text`
  ${(props) => (props.size === 'lg' ? type.bodyMedium : type.captionMedium)}
  color: ${(props) => props.theme.textInverse};
`;
