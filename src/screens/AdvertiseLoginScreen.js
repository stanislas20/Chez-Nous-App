import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { isValidPhone, mapAuthErrorToKey } from '../auth/phoneAuth';

const contentContainerStyle = { padding: spacing.lg };

export function AdvertiseLoginScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { logInAdvertiser } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!phone.trim() || !password) {
      Alert.alert(t('advertiserLoginTitle'), t('errorRequiredFields'));
      return;
    }
    if (!isValidPhone(phone)) {
      Alert.alert(t('advertiserLoginTitle'), t('errorInvalidPhone'));
      return;
    }

    setIsSubmitting(true);
    try {
      await logInAdvertiser({ phone, password });
    } catch (error) {
      Alert.alert(t('advertiserLoginTitle'), t(mapAuthErrorToKey(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Container edges={['left', 'right', 'bottom']}>
        <Content contentContainerStyle={contentContainerStyle} keyboardShouldPersistTaps="handled">
          <Title>{t('advertiserLoginTitle')}</Title>
          <Subtitle>{t('advertiserLoginSubtitle')}</Subtitle>

          <Label>{t('fieldPhone')}</Label>
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder={t('fieldPhonePlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={10}
            autoCapitalize="none"
          />

          <Label>{t('fieldPassword')}</Label>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder={t('fieldPasswordPlaceholder')}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />

          <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <SubmitLabel>{t('loginButton')}</SubmitLabel>
            )}
          </SubmitButton>

          <FooterRow>
            <FooterText>{t('noAccountYet')} </FooterText>
            <Pressable onPress={() => navigation.replace('AdvertiseSignUp')}>
              <FooterLink>{t('goToSignUp')}</FooterLink>
            </Pressable>
          </FooterRow>
        </Content>
      </Container>
    </Flex>
  );
}

const Flex = styled.KeyboardAvoidingView`
  flex: 1;
`;

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Content = styled.ScrollView``;

const Title = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
`;

const Subtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
  margin-bottom: ${spacing.lg}px;
`;

const Label = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.xs}px;
  margin-top: ${spacing.md}px;
`;

const Input = styled.TextInput`
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  ${type.body}
  color: ${(props) => props.theme.text};
`;

const SubmitButton = styled(Pressable)`
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  margin-top: ${spacing.xl}px;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const FooterRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-top: ${spacing.lg}px;
`;

const FooterText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
`;

const FooterLink = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.primary};
`;
