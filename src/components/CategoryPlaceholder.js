import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { fontFamily } from '../theme/typography';
import { useTheme } from '../theme/ThemeContext';

// `thumb` is for the 110px square on Mes annonces, where a 64px badge and a
// caption would fill the whole tile.
const SIZES = {
  thumb: { badge: 40, icon: 19, label: false },
  card: { badge: 60, icon: 27, label: true },
  hero: { badge: 96, icon: 44, label: true },
};

// What a listing with no photograph shows.
//
// It used to be nothing at all on most cards — a bare grey panel, which at
// the old 64px thumbnail size read as a loading state and at the new square
// size reads as a broken image. Only the shared ListingCard drew this.
//
// `label` names the category, so a card without a picture still says what it
// is rather than only that something is missing. Optional, because the
// smallest sizes have no room for it.
export function CategoryPlaceholder({ icon, label, size = 'card' }) {
  const { colors } = useTheme();
  const spec = SIZES[size] ?? SIZES.card;
  const { badge, icon: iconSize } = spec;

  return (
    <Container>
      <DecorCircleLarge />
      <DecorCircleSmall />
      <Badge style={{ width: badge, height: badge, borderRadius: badge / 2 }}>
        <Ionicons name={icon} size={iconSize} color={colors.textInverse} />
      </Badge>
      {label && spec.label ? (
        <Label numberOfLines={1}>{label}</Label>
      ) : null}
    </Container>
  );
}

const Container = styled.View`
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
  overflow: hidden;
`;

const DecorCircleLarge = styled.View`
  position: absolute;
  top: -30%;
  right: -20%;
  width: 70%;
  height: 70%;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.35);
`;

const DecorCircleSmall = styled.View`
  position: absolute;
  bottom: -15%;
  left: -10%;
  width: 40%;
  height: 40%;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.25);
`;

// No drop shadow. It read as a raised button on the old rounded card and
// looks wrong on a flat square one, where nothing else casts a shadow.
const Badge = styled.View`
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primary};
`;

const Label = styled.Text`
  margin-top: 8px;
  padding: 0 10px;
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  letter-spacing: 0.3px;
  text-align: center;
  color: ${(props) => props.theme.primaryDark};
`;
