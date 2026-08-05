import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';

export function SearchBar({ value, onChangeText, placeholder }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Container>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('searchPlaceholder')}
        placeholderTextColor={colors.textMuted}
      />
    </Container>
  );
}

const Container = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding-horizontal: ${spacing.md}px;
  height: 46px;
  margin-horizontal: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
  gap: ${spacing.sm}px;
  ${shadow.card}
`;

const Input = styled.TextInput`
  flex: 1;
  ${type.body}
  color: ${(props) => props.theme.text};
`;
