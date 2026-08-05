import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { isValidPhone, mapAuthErrorToKey } from '../auth/phoneAuth';

const contentContainerStyle = { padding: spacing.lg };

export function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { logIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!phone.trim() || !password) {
      Alert.alert(t('loginTitle'), t('errorRequiredFields'));
      return;
    }
    if (!isValidPhone(phone)) {
      Alert.alert(t('loginTitle'), t('errorInvalidPhone'));
      return;
    }

    setIsSubmitting(true);
    try {
      await logIn({ phone, password });
    } catch (error) {
      Alert.alert(t('loginTitle'), t(mapAuthErrorToKey(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Container edges={['left', 'right', 'bottom']}>
        <Content contentContainerStyle={contentContainerStyle} keyboardShouldPersistTaps="handled">
          <HeroImage source={require('../../assets/login.jpg')} resizeMode="cover" />

          <Subtitle>{t('loginSubtitle')}</Subtitle>

          <Label>{t('fieldPhone')}</Label>
          <InputRow>
            <Ionicons name="call-outline" size={20} color={colors.textMuted} />
            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder={t('fieldPhonePlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={10}
              autoCapitalize="none"
            />
          </InputRow>

          <Label>{t('fieldPassword')}</Label>
          <InputRow>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder={t('fieldPasswordPlaceholder')}
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </InputRow>

          <ForgotPasswordRow>
            <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
              <FooterLink>{t('forgotPasswordLink')}</FooterLink>
            </Pressable>
          </ForgotPasswordRow>

          <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <SubmitLabel>{t('loginButton')}</SubmitLabel>
            )}
          </SubmitButton>

          <FooterRow>
            <FooterText>{t('noAccountYet')} </FooterText>
            <Pressable onPress={() => navigation.replace('SellSignUp')}>
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

const HeroImage = styled.Image`
  width: 100%;
  height: 360px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-top: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
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

const InputRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  ${shadow.card}
`;

const Input = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const ForgotPasswordRow = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  margin-top: ${spacing.xs}px;
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
