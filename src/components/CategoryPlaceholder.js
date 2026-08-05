import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { shadow } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

const SIZES = {
  card: { badge: 64, icon: 28 },
  hero: { badge: 96, icon: 44 },
};

export function CategoryPlaceholder({ icon, size = 'card' }) {
  const { colors } = useTheme();
  const { badge, icon: iconSize } = SIZES[size] ?? SIZES.card;

  return (
    <Container>
      <DecorCircleLarge />
      <DecorCircleSmall />
      <Badge style={{ width: badge, height: badge, borderRadius: badge / 2 }}>
        <Ionicons name={icon} size={iconSize} color={colors.textInverse} />
      </Badge>
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

const Badge = styled.View`
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primary};
  ${shadow.card}
`;
