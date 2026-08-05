import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';

export function NotificationsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Container edges={['left', 'right', 'bottom']}>
      <Ionicons name="notifications-outline" size={40} color={colors.textMuted} />
      <Title>{t('notificationsEmptyTitle')}</Title>
      <Subtitle>{t('notificationsEmptySubtitle')}</Subtitle>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-horizontal: ${spacing.xl}px;
  background-color: ${(props) => props.theme.background};
`;

const Title = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.md}px;
  text-align: center;
`;

const Subtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
  text-align: center;
`;
