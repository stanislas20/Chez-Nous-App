import { useState } from "react";
import { ActivityIndicator, Alert, Modal } from "react-native";
import styled from "styled-components/native";
import { spacing, radius } from "../theme/colors";
import { type } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/I18nContext";
import {
  deleteOwnAccount,
  mapDeleteAccountErrorToKey,
} from "../auth/deleteAccount";
import { reportNonFatal } from "../utils/reportError";

// The confirmation for the one action in this app that cannot be undone.
//
// Three things it does that a plain "are you sure" does not, and each exists
// because the alternative is somebody losing something they did not expect to
// lose:
//
//   it LISTS what goes, in the person's own terms — their listings, their
//     saved items, their applications — rather than saying "your data";
//
//   it says plainly what does NOT go, because conversations are shared and
//     the other person keeps their copy. Somebody deleting an account to
//     erase an argument should learn that here and not afterwards;
//
//   it asks for the password. The server requires a sign-in from the last
//     five minutes, and this is where that proof comes from — a phone on a
//     table holds a signed-in session for weeks.
export function DeleteAccountSheet({ visible, onClose, onDeleted }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setPassword("");
    onClose?.();
  };

  const handleDelete = async () => {
    if (busy || !password) return;
    setBusy(true);
    try {
      await deleteOwnAccount({ password });
      setPassword("");
      onClose?.();
      onDeleted?.();
      Alert.alert(t("deleteAccountDoneTitle"), t("deleteAccountDoneMessage"));
    } catch (error) {
      // Reported so a systematic failure is visible — a deletion that keeps
      // failing is somebody unable to leave, which is exactly the kind of
      // thing nobody files a support ticket about.
      reportNonFatal("deleteAccount", error);
      Alert.alert(
        t("deleteAccountTitle"),
        t(mapDeleteAccountErrorToKey(error)),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <Backdrop>
        <Sheet>
          <SheetTitle>{t("deleteAccountTitle")}</SheetTitle>
          {/* The consequence first, in one sentence, before the list. Somebody
              who reads only the first line should still learn the thing that
              matters: the account goes and they cannot sign in again. */}
          <SheetBody>{t("deleteAccountWhatGoes")}</SheetBody>
          <SheetList>{t("deleteAccountWhatGoesList")}</SheetList>
          {/* And what does NOT go, because it is the half people are
              surprised by. Somebody deleting an account to erase a
              conversation should learn here that the other person keeps
              their copy, not afterwards. */}
          <SheetNote>{t("deleteAccountWhatStays")}</SheetNote>

          <FieldLabel>{t("deleteAccountPasswordLabel")}</FieldLabel>
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
            placeholder={t("deleteAccountPasswordLabel")}
            placeholderTextColor={colors.textMuted}
          />

          <ConfirmButton
            onPress={handleDelete}
            disabled={busy || password.length === 0}
            dimmed={busy || password.length === 0}
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <ConfirmLabel>{t("deleteAccountConfirmButton")}</ConfirmLabel>
            )}
          </ConfirmButton>
          <CancelButton onPress={close} disabled={busy}>
            <CancelLabel>{t("cancel")}</CancelLabel>
          </CancelButton>
        </Sheet>
      </Backdrop>
    </Modal>
  );
}

const Backdrop = styled.View`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.45);
`;

const Sheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: ${radius.lg}px;
  border-top-right-radius: ${radius.lg}px;
  padding: ${spacing.lg}px ${spacing.md}px ${spacing.xl}px;
  gap: ${spacing.sm}px;
`;

const SheetTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
`;

const SheetBody = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.text};
`;

const SheetList = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
`;

const SheetNote = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const FieldLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const PasswordInput = styled.TextInput`
  ${type.body}
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.background};
  border: 1px solid ${(props) => props.theme.border};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px ${spacing.md}px;
`;

const ConfirmButton = styled.Pressable`
  background-color: ${(props) => props.theme.error};
  opacity: ${(props) => (props.dimmed ? 0.5 : 1)};
  border-radius: 999px;
  padding-vertical: ${spacing.sm}px;
  align-items: center;
  margin-top: ${spacing.sm}px;
`;

const ConfirmLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;

const CancelButton = styled.Pressable`
  padding-vertical: ${spacing.sm}px;
  align-items: center;
`;

const CancelLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textMuted};
`;
