import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';

// Deliberately no mock event listings here (unlike Banks/Tourism, which use
// real, verifiable institution/landmark names) — a fabricated concert or
// match with a specific date is a false, actionable claim someone could show
// up for, not just placeholder UI. This stays an honest empty state until
// there's a real events data source to back it.
export function EventsScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Container edges={['top', 'left', 'right', 'bottom']}>
      <Header>
        <BackButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </BackButton>
        <HeaderTitle>{t('menuEventsRow')}</HeaderTitle>
      </Header>

      <Body>
        <EmptyState>
          <Ionicons name="ticket-outline" size={40} color={colors.textMuted} />
          <EmptyTitle>{t('eventsEmptyTitle')}</EmptyTitle>
          <EmptySubtitle>{t('eventsEmptySubtitle')}</EmptySubtitle>
        </EmptyState>
      </Body>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const Body = styled.View`
  flex: 1;
  padding: ${spacing.md}px;
`;

const EmptyState = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl}px;
`;

const EmptyTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.md}px;
  text-align: center;
`;

const EmptySubtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
  text-align: center;
`;
