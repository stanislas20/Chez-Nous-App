import styled from 'styled-components/native';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';

export function LanguageSwitch() {
  const { colors } = useTheme();
  const { language, setLanguage } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'fr' : 'en');
  };

  return (
    <Button onPress={toggleLanguage}>
      <Label>{language === 'en' ? 'FR' : 'EN'}</Label>
    </Button>
  );
}

const Button = styled.Pressable`
  margin-right: ${spacing.md}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 4px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const Label = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primaryDark};
`;
