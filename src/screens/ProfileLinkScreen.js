import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import styled from "styled-components/native";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { useI18n } from "../i18n/I18nContext";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { spacing } from "../theme/colors";

// Where a shared profile lands, the counterpart of ListingLinkScreen.
//
// SellerProfileScreen wants a name to render its header before its own
// subscription arrives, and a share carries only a uid — so this reads the
// public projection first and hands the name over, rather than opening a
// profile headed "undefined" for the half-second before the data lands.
//
// It reads sellerStats and not sellers, the same rule the web page follows:
// the private document holds a phone number that the app keeps behind a
// sign-in, and nothing reached by a link should be the thing that leaks it.
//
// It replaces rather than pushes. Somebody arriving from WhatsApp who
// presses back wants to leave, not to find a spinner they already passed.
export function ProfileLinkScreen({ route, navigation }) {
  const { id } = route.params ?? {};
  const { t } = useI18n();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!isFirebaseConfigured || !id) {
        setFailed(true);
        return;
      }
      try {
        const snapshot = await getDoc(doc(firestore, "sellerStats", id));
        if (cancelled) return;
        if (!snapshot.exists()) {
          setFailed(true);
          return;
        }
        const stats = snapshot.data() ?? {};
        navigation.replace("MainTabs");
        navigation.navigate("SellerProfile", {
          sellerId: id,
          sellerName: stats.displayName ?? t("chatUnknownParticipant"),
          sellerPhotoUrl: stats.photoUrl ?? null,
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [id, navigation, t]);

  return (
    <Center>
      {failed ? (
        <>
          <Message>{t("profileLinkUnavailable")}</Message>
          <Action onPress={() => navigation.replace("MainTabs")}>
            <ActionLabel>{t("listingLinkBrowse")}</ActionLabel>
          </Action>
        </>
      ) : (
        <ActivityIndicator color={colors.primary} size="large" />
      )}
    </Center>
  );
}

const Center = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.lg}px;
  background-color: ${(props) => props.theme.background};
`;

const Message = styled.Text`
  ${type.body};
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-bottom: ${spacing.md}px;
`;

const Action = styled.Pressable`
  padding: ${spacing.sm}px ${spacing.lg}px;
  border-radius: 999px;
  background-color: ${(props) => props.theme.primary};
`;

const ActionLabel = styled.Text`
  ${type.button};
  color: ${(props) => props.theme.textInverse};
`;
