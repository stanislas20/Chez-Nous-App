import styled from "styled-components/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useI18n } from "../i18n/I18nContext";
import { CONNECTION, useConnectionState } from "../hooks/useConnectionState";

// One line, at the top of the app, only while it is true.
//
// The audit's network finding was not that the app crashes offline — it does
// not — but that it says nothing. A feed that will not load, a message that
// will not send and a listing that will not publish all failed with the same
// generic sentence, and none of them mentioned the connection. So somebody on
// a Bénin mobile connection in a bad minute could not tell a broken app from
// a broken signal, and the app never got the benefit of the doubt.
//
// Deliberately not a full-screen state and not a blocking modal. Reading
// works offline for as long as the in-memory cache holds what is on screen,
// so taking the screen away would remove something that still works. It says
// what is true and gets out of the way.
export function OfflineBanner() {
  const connection = useConnectionState();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  // UNKNOWN is not offline. It is the state before the first snapshot lands,
  // and showing the banner there would flash it on every cold start.
  if (connection !== CONNECTION.OFFLINE) return null;

  // The bar is the first thing inside NavigationContainer, so it starts at
  // y=0 — underneath the clock, the battery and the signal icons. On the
  // test handset the sentence ran straight through the status bar and the
  // half of it behind the icons was unreadable, which is a poor showing for
  // the one line whose entire job is to be read.
  //
  // Padded rather than wrapped in a SafeAreaView: the inset belongs to this
  // bar only, and a SafeAreaView here would also claim the bottom edge and
  // push the navigator up by the home-indicator height on every screen.
  return (
    <Bar style={{ paddingTop: insets.top + 4 }}>
      <Ionicons name="cloud-offline" size={14} color={colors.textInverse} />
      <BarText numberOfLines={1}>{t("connectionOffline")}</BarText>
    </Bar>
  );
}

const Bar = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  padding-vertical: ${spacing.xs}px;
  padding-horizontal: ${spacing.md}px;
  background-color: ${(props) => props.theme.textMuted};
`;

const BarText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textInverse};
`;
