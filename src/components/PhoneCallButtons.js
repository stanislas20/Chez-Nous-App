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
//
// `fit` sizes the single-number button to its label instead of letting it
// stretch. A plain View column stretches its children, which turned a 14px
// "Appeler" into a full-card slab of green with the words marooned in the
// middle — it reads as a loading placeholder rather than something to press.
//
// `flow` drops the wrapper entirely and returns the buttons as siblings, for
// a caller whose own wrapping row should lay them out alongside its other
// actions. Tanguiéta prints three numbers: they wrapped 2 + 1, and because
// "Obtenir l'itinéraire" lived in a different container it could not rise
// into the gap beside the third chip, so the card carried an empty half-row
// and then a half-empty one. Sharing one row lets the button take that space.
//
// `itemStyle` is applied to each button rather than to a wrapper, so a caller
// laying them out as a grid can give every one the same flex basis. The point
// is that a two-up row is two equal halves: sized by their own labels, a
// six-digit chip and "Obtenir l'itinéraire" sit side by side at obviously
// different widths and the row reads as ragged rather than arranged.
export function PhoneCallButtons({
  phone,
  size = 'md',
  style,
  fit = false,
  flow = false,
  itemStyle,
}) {
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
      <CallButton
        size={size}
        fit={fit}
        style={[style, itemStyle]}
        onPress={() => call(numbers[0])}
        hitSlop={6}
      >
        <Ionicons name="call" size={size === 'lg' ? 18 : 14} color={colors.textInverse} />
        <CallButtonLabel size={size}>{t('callButtonLabel')}</CallButtonLabel>
      </CallButton>
    );
  }

  const chips = numbers.map((number) => (
    <CallChip
      key={number}
      size={size}
      style={itemStyle}
      onPress={() => call(number)}
      hitSlop={6}
    >
      <Ionicons name="call" size={size === 'lg' ? 15 : 12} color={colors.textInverse} />
      <CallChipLabel size={size}>{number}</CallChipLabel>
    </CallChip>
  ));

  // No wrapper: the caller's own row is the wrapping context, so its other
  // actions can share a line with the last chip instead of starting a new one.
  if (flow) return <>{chips}</>;

  return <ChipsRow style={style}>{chips}</ChipsRow>;
}

const CallButton = styled(Pressable)`
  ${(props) => (props.fit ? 'align-self: flex-start;' : '')}
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

// Stretch stated rather than inherited. It is what a default View parent
// gives this anyway, but the pharmacy cards now set align-items: flex-start
// so their buttons stop stretching — and a wrapping row that shrink-wraps
// lays every number on one line and runs off the edge of the card.
const ChipsRow = styled.View`
  align-self: stretch;
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.xs}px;
`;

const CallChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  /* A no-op while the chip is sized by its own label; it centres the digits
     when a caller gives every button an equal share of the row instead. */
  justify-content: center;
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
