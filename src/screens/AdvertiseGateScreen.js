import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';

export function AdvertiseGateScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Container>
      <IconWrap>
        <Ionicons name="megaphone-outline" size={40} color={colors.primary} />
      </IconWrap>
      <Title>{t('advertiseGateTitle')}</Title>
      <Subtitle>{t('advertiseGateSubtitle')}</Subtitle>

      <PrimaryButton onPress={() => navigation.navigate('AdvertiseSignUp')}>
        <PrimaryButtonLabel>{t('advertiseGateSignUpButton')}</PrimaryButtonLabel>
      </PrimaryButton>

      <SecondaryButton onPress={() => navigation.navigate('AdvertiseLogin')}>
        <SecondaryButtonLabel>{t('advertiseGateLoginButton')}</SecondaryButtonLabel>
      </SecondaryButton>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl}px;
`;

const IconWrap = styled.View`
  width: 84px;
  height: 84px;
  border-radius: 42px;
  background-color: ${(props) => props.theme.primaryLight};
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.lg}px;
`;

const Title = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
  text-align: center;
`;

const Subtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: ${spacing.sm}px;
  margin-bottom: ${spacing.xl}px;
`;

const PrimaryButton = styled(Pressable)`
  width: 100%;
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  margin-bottom: ${spacing.md}px;
`;

const PrimaryButtonLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const SecondaryButton = styled(Pressable)`
  width: 100%;
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SecondaryButtonLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.text};
`;
