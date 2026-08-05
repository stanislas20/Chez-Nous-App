import { Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";

export function SellGateScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Container edges={["left", "right", "bottom"]}>
      <Content>
        <HeroImage
          source={require("../../assets/pexels-ebahir-28482095.jpg")}
          resizeMode="cover"
        />
        <Title>{t("sellGateTitle")}</Title>
        <Subtitle>{t("sellGateSubtitle")}</Subtitle>

        <PrimaryButton onPress={() => navigation.navigate("SellSignUp")}>
          <PrimaryButtonLabel>{t("sellGateSignUpButton")}</PrimaryButtonLabel>
        </PrimaryButton>

        <SecondaryButton onPress={() => navigation.navigate("SellLogin")}>
          <SecondaryButtonLabel>
            {t("sellGateLoginButton")}
          </SecondaryButtonLabel>
        </SecondaryButton>
      </Content>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Content = styled.ScrollView.attrs(() => ({
  contentContainerStyle: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
}))``;

const HeroImage = styled.Image`
  width: 100%;
  height: 360px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-top: ${spacing.xs}px;
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
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  border-width: 1.5px;
  border-color: ${(props) => props.theme.primary};
`;

const SecondaryButtonLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.primary};
`;
