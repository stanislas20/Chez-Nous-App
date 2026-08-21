import { useState } from "react";
import { Alert, Pressable, ScrollView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { firestore } from "../config/firebase";

// One screen for every kind of listing — goods, jobs, property. The two
// detail screens each carried their own copy of a report sheet, which is
// how they drifted apart: the job one was wired to nothing at all.
const REPORT_REASONS = [
  { key: "spam", icon: "megaphone-outline", labelKey: "productDetailReportReasonSpam" },
  { key: "prohibited", icon: "ban-outline", labelKey: "productDetailReportReasonProhibited" },
  { key: "scam", icon: "warning-outline", labelKey: "productDetailReportReasonScam" },
  { key: "other", icon: "ellipsis-horizontal-outline", labelKey: "productDetailReportReasonOther" },
];

const scrollStyle = { padding: spacing.md, paddingBottom: spacing.xl };

export function ReportListingScreen({ route, navigation }) {
  const { listingId, listingTitle } = route.params ?? {};
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submit = async () => {
    if (!reason || isSending) return;
    setIsSending(true);
    try {
      // Keyed by listing + reporter, so reporting the same listing twice
      // amends one report instead of filing a second. That is what makes
      // `reportCount` on the listing mean "how many different people",
      // which is the only version of that number worth acting on.
      await setDoc(
        doc(firestore, "reports", `${listingId}_${user.uid}`),
        {
          listingId: listingId ?? null,
          listingTitle: listingTitle ?? "",
          // firestore.rules requires this to equal the caller's uid.
          reporterId: user.uid,
          reason,
          details: details.trim().slice(0, 500),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      Alert.alert(t("productDetailReportLink"), t("productDetailReportSuccessMessage"), [
        { text: t("ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert(t("productDetailReportLink"), t("errorGeneric"));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Container edges={["top", "left", "right", "bottom"]}>
      <Header>
        <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </BackButton>
        <HeaderTitle numberOfLines={1}>{t("productDetailReportLink")}</HeaderTitle>
      </Header>

      <ScrollView contentContainerStyle={scrollStyle} showsVerticalScrollIndicator={false}>
        {listingTitle ? <ListingTitle numberOfLines={2}>{listingTitle}</ListingTitle> : null}
        <Intro>{t("productDetailReportConfirmMessage")}</Intro>

        <FieldLabel>{t("productDetailReportConfirmTitle")}</FieldLabel>
        {REPORT_REASONS.map((item) => {
          const active = reason === item.key;
          return (
            <ReasonCard key={item.key} active={active} onPress={() => setReason(item.key)}>
              <ReasonIcon active={active}>
                <Ionicons
                  name={item.icon}
                  size={17}
                  color={active ? "#ffffff" : colors.textMuted}
                />
              </ReasonIcon>
              <ReasonLabel active={active}>{t(item.labelKey)}</ReasonLabel>
              {active ? <Ionicons name="checkmark-circle" size={20} color={EMERALD} /> : null}
            </ReasonCard>
          );
        })}

        <FieldLabel>{t("reportDetailsLabel")}</FieldLabel>
        <DetailsBox>
          <DetailsInput
            value={details}
            onChangeText={setDetails}
            placeholder={t("reportDetailsPlaceholder")}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
          />
        </DetailsBox>

        <SubmitButton disabled={!reason || isSending} onPress={submit}>
          <SubmitLabel>{t("reportSubmit")}</SubmitLabel>
        </SubmitButton>

        <Footnote>{t("reportFootnote")}</Footnote>
      </ScrollView>
    </Container>
  );
}

const EMERALD = "#0B6E4F";

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const ListingTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const Intro = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  margin-top: 6px;
  color: ${(props) => props.theme.textMuted};
`;

const FieldLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-top: ${spacing.lg}px;
  margin-bottom: ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const ReasonCard = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: ${radius.lg}px;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => (props.active ? props.theme.primaryLight : props.theme.surface)};
  border-width: 1.5px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const ReasonIcon = styled.View`
  width: 36px;
  height: 36px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.active ? EMERALD : props.theme.surfaceAlt)};
`;

const ReasonLabel = styled.Text`
  flex: 1;
  font-family: ${(props) => (props.active ? fontFamily.semiBold : fontFamily.medium)};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const DetailsBox = styled.View`
  padding: 12px 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const DetailsInput = styled(TextInput)`
  min-height: 96px;
  font-family: ${fontFamily.regular};
  font-size: 14px;
  text-align-vertical: top;
  color: ${(props) => props.theme.text};
`;

const SubmitButton = styled(Pressable)`
  padding: 16px;
  border-radius: ${radius.lg}px;
  align-items: center;
  margin-top: ${spacing.lg}px;
  background-color: ${(props) => (props.disabled ? props.theme.border : EMERALD)};
`;

const SubmitLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #ffffff;
`;

const Footnote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  margin-top: ${spacing.md}px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
`;
