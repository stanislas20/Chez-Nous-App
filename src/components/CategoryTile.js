import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';

export function CategoryTile({ icon, label, onPress, large, wide }) {
  const { colors } = useTheme();
  return (
    <Tile onPress={onPress} large={large} wide={wide}>
      <Ionicons name={icon} size={24} color={colors.primary} />
      <Label large={large} numberOfLines={large ? 1 : 2}>
        {label}
      </Label>
    </Tile>
  );
}

// A "large" tile is the lone leftover in a row (remainder 1): spans the full
// row width as a horizontal icon+label button. A "wide" tile is one of a
// leftover pair (remainder 2): each takes half the row instead of a third.
// Both preserve the same height as normal tiles via matching aspect-ratio.
const WIDTH_PERCENT = { large: 100, wide: 48, normal: 31 };

function widthPercent(props) {
  if (props.large) return WIDTH_PERCENT.large;
  if (props.wide) return WIDTH_PERCENT.wide;
  return WIDTH_PERCENT.normal;
}

const Tile = styled.Pressable`
  width: ${(props) => widthPercent(props)}%;
  aspect-ratio: ${(props) => widthPercent(props) / WIDTH_PERCENT.normal};
  flex-direction: ${(props) => (props.large ? 'row' : 'column')};
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  padding: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  gap: ${(props) => (props.large ? spacing.sm : spacing.xs)}px;
  ${shadow.card}
`;

const Label = styled.Text`
  ${(props) => (props.large ? type.bodyMedium : type.caption)}
  color: ${(props) => props.theme.text};
  text-align: center;
`;
