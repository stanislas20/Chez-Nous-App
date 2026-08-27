import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { firestore } from "../config/firebase";

// Report a distributor the directory is missing.
//
// The screen has promised this in prose since it shipped — "vous en
// connaissez un qui manque ? signalez-le et nous l'ajouterons" — with nothing
// anywhere to tap. This is the missing half.
//
// Where it does NOT write is the point. `dealershipSuggestions` is a
// collection no screen in the app reads: what arrives here cannot appear as a
// distributor by any path, not even a buggy one. That is deliberate and it is
// the difference between this and the car-park flow, which writes a pending
// row into the directory it will eventually join. A park is a place, and
// saying one exists is a weak claim. "Official Toyota distributor" is a claim
// about a franchise, made in the app's voice, about a company that never
// signed up and cannot correct it — so a person verifies it against a
// published source and writes the real row with scripts/addDealership.js.
//
// Which means the honest thing to say here is that this will not appear
// straight away, and the intro says exactly that rather than letting someone
// go looking for their submission tomorrow.
export function SubmitDealershipScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [brands, setBrands] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) {
      Alert.alert(t("dealerSubmitTitle"), t("dealerSubmitNameRequired"));
      return;
    }
    // Asked for because a name and a city alone cannot be checked against
    // anything: the marque is what makes a distributor verifiable.
    if (!brands.trim()) {
      Alert.alert(t("dealerSubmitTitle"), t("dealerSubmitBrandsRequired"));
      return;
    }
    setIsSaving(true);
    try {
      await addDoc(collection(firestore, "dealershipSuggestions"), {
        name: name.trim(),
        city: city.trim(),
        // Free text, not the array the directory stores. Somebody typing
        // "toyota et suzuki" is telling us something useful, and splitting it
        // into marques the app pretends to recognise would invent a precision
        // the tip does not have. The admin canonicalises it against
        // vehicles.js when the row is actually written.
        brands: brands.trim(),
        note: note.trim() || null,
        status: "pending",
        submittedBy: user.uid,
        createdAt: serverTimestamp(),
      });
      Alert.alert(t("dealerSubmitTitle"), t("dealerSubmitThanks"), [
        { text: t("continue"), onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert(t("dealerSubmitTitle"), t("errorGeneric"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container edges={["left", "right", "bottom"]}>
      {/* "padding" on both platforms: app.json sets softwareKeyboardLayoutMode
          to "pan", so "height" would measure a box the keyboard never
          changed and the last field would stay hidden under it. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <Intro>{t("dealerSubmitIntro")}</Intro>

          <Label>{t("dealerSubmitNameLabel")}</Label>
          <Field
            value={name}
            onChangeText={setName}
            placeholder={t("dealerSubmitNamePlaceholder")}
            placeholderTextColor={colors.textMuted}
            maxLength={80}
          />

          <Label>{t("dealerSubmitCityLabel")}</Label>
          <Field
            value={city}
            onChangeText={setCity}
            placeholder={t("dealerSubmitCityPlaceholder")}
            placeholderTextColor={colors.textMuted}
            maxLength={80}
          />

          <Label>{t("dealerSubmitBrandsLabel")}</Label>
          <Field
            value={brands}
            onChangeText={setBrands}
            placeholder={t("dealerSubmitBrandsPlaceholder")}
            placeholderTextColor={colors.textMuted}
            maxLength={200}
          />

          <Label>{t("dealerSubmitNoteLabel")}</Label>
          <Field
            value={note}
            onChangeText={setNote}
            placeholder={t("dealerSubmitNotePlaceholder")}
            placeholderTextColor={colors.textMuted}
            maxLength={400}
            multiline
          />

          <SubmitButton onPress={submit} disabled={isSaving}>
            <SubmitLabel>
              {isSaving ? t("adUploadingLabel") : t("dealerSubmitAction")}
            </SubmitLabel>
          </SubmitButton>

          {/* Why the list is short, said here rather than left to look like
              neglect. */}
          <Hint>{t("dealerSubmitModerationNote")}</Hint>
        </ScrollView>
      </KeyboardAvoidingView>
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

const Hint = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.md}px;
`;

const SubmitButton = styled(Pressable)`
  align-items: center;
  padding: 15px;
  margin-top: ${spacing.sm}px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.primary};
  opacity: ${(props) => (props.disabled ? 0.6 : 1)};
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;
