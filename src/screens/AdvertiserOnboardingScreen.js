import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";

const contentContainerStyle = { padding: spacing.lg };

export function AdvertiserOnboardingScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { completeAdvertiserOnboarding } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      Alert.alert(t("advertiserSignUpTitle"), t("errorRequiredFields"));
      return;
    }

    setIsSubmitting(true);
    try {
      await completeAdvertiserOnboarding({ businessName: businessName.trim() });
    } catch (error) {
      Alert.alert(t("advertiserSignUpTitle"), t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Container edges={["left", "right", "bottom"]}>
        <Content
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Title>{t("advertiserSignUpTitle")}</Title>
          <Subtitle>{t("advertiserSignUpSubtitle")}</Subtitle>

          <Label>{t("fieldBusinessName")}</Label>
          <Input
            value={businessName}
            onChangeText={setBusinessName}
            placeholder={t("fieldBusinessNamePlaceholder")}
            placeholderTextColor={colors.textMuted}
          />

          <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <SubmitLabel>{t("advertiserSignUpButton")}</SubmitLabel>
            )}
          </SubmitButton>
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
