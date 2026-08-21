import { useState } from "react";
import { Alert, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { firestore } from "../config/firebase";
import { useCurrentLocation } from "../hooks/useCurrentLocation";

// Propose a vehicle sales park.
//
// The submission is written straight to `carParks` with status 'pending',
// which firestore.rules pins there: a submitter can create that row and can
// never publish it. Approving is still a flip of `status` from the console,
// the same gate listings go through — so this moves the typing to where the
// park is without moving the trust.
//
// Deliberately short. Every extra field is one more thing to get wrong
// while standing at the roadside, and the person approving can fill in the
// rest from a map.
export function SubmitCarParkScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [commune, setCommune] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // Not requested on mount: asking for GPS before the person has decided to
  // submit anything is how permission prompts get denied for good.
  const { status, coords, requestLocation } = useCurrentLocation({
    enabled: false,
  });

  const submit = async () => {
    if (name.trim().length < 2) {
      Alert.alert(t("parkSubmitTitle"), t("parkSubmitNameRequired"));
      return;
    }
    setIsSaving(true);
    try {
      await addDoc(collection(firestore, "carParks"), {
        name: name.trim(),
        commune: commune.trim(),
        note: note.trim() || null,
        // Only sent when actually captured. The rules accept a park with no
        // coordinates — someone remembering one from yesterday still has
        // something worth telling us.
        ...(coords
          ? { latitude: coords.latitude, longitude: coords.longitude }
          : {}),
        status: "pending",
        submittedBy: user.uid,
        createdAt: serverTimestamp(),
      });
      Alert.alert(t("parkSubmitTitle"), t("parkSubmitThanks"), [
        { text: t("continue"), onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert(t("parkSubmitTitle"), t("errorGeneric"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Intro>{t("parkSubmitIntro")}</Intro>

        <Label>{t("parkSubmitNameLabel")}</Label>
        <Field
          value={name}
          onChangeText={setName}
          placeholder={t("parkSubmitNamePlaceholder")}
          placeholderTextColor={colors.textMuted}
        />

        <Label>{t("parkSubmitCommuneLabel")}</Label>
        <Field
          value={commune}
          onChangeText={setCommune}
          placeholder={t("parkSubmitCommunePlaceholder")}
          placeholderTextColor={colors.textMuted}
        />

        <Label>{t("parkSubmitNoteLabel")}</Label>
        <Field
          value={note}
          onChangeText={setNote}
          placeholder={t("parkSubmitNotePlaceholder")}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {/* The reason this is worth doing from a phone at all. */}
        <PinButton onPress={requestLocation} disabled={status === "locating"}>
          <Ionicons
            name={coords ? "checkmark-circle" : "location-outline"}
            size={17}
            color={colors.primary}
          />
          <PinLabel>
            {coords
              ? t("parkSubmitPinCaptured")
              : status === "locating"
                ? t("parkSubmitPinLocating")
                : t("parkSubmitPinAction")}
          </PinLabel>
        </PinButton>
        {status === "denied" ? (
          <Hint>{t("parkSubmitPinDenied")}</Hint>
        ) : (
          <Hint>{t("parkSubmitPinHint")}</Hint>
        )}

        <SubmitButton onPress={submit} disabled={isSaving}>
          <SubmitLabel>
            {isSaving ? t("adUploadingLabel") : t("parkSubmitAction")}
          </SubmitLabel>
        </SubmitButton>

        {/* Said plainly rather than discovered later: nothing appears until
            someone has checked it. */}
        <Hint>{t("parkSubmitModerationNote")}</Hint>
      </ScrollView>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Intro = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const Label = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const Field = styled.TextInput`
  ${type.body}
  color: ${(props) => props.theme.text};
  min-height: 50px;
  padding: 12px 14px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PinButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  padding: 13px;
  border-radius: ${radius.md}px;
  border-width: 1.5px;
  border-color: ${(props) => props.theme.primary};
`;

const PinLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
`;

const Hint = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
`;

const SubmitButton = styled(Pressable)`
  align-items: center;
  padding: 15px;
  margin-top: ${spacing.lg}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.primary};
  opacity: ${(props) => (props.disabled ? 0.6 : 1)};
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;
