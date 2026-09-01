import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import styled from "styled-components/native";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { useI18n } from "../i18n/I18nContext";
import { useTheme } from "../theme/ThemeContext";
import { openListing } from "../utils/openListing";
import { type } from "../theme/typography";
import { spacing } from "../theme/colors";

// Where a shared link lands.
//
// A share carries an id — `cheznous://l/GAxYmhcj…`, from the page at
// benin-marketplace-3eb04.web.app — and every detail screen in this app
// wants a whole listing object, because that is what a tap on a card has to
// hand. Something has to stand between the two, and this is it: it reads
// the document, then replaces itself with the right screen through
// openListing, so a property opens the property screen and a job opens the
// job screen exactly as they would from the grid.
//
// It replaces rather than pushes. Somebody who arrives from WhatsApp and
// presses back wants to leave, not to find a spinner they already passed.
//
// Nothing here is allowed to leave the reader stuck: an id that no longer
// exists, a listing a moderator has since refused, and a failed read all
// end the same way — a sentence, and a way back to the app.
export function ListingLinkScreen({ route, navigation }) {
  const { id } = route.params ?? {};
  const { t, language } = useI18n();
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
        const snapshot = await getDoc(doc(firestore, "listings", id));
        if (cancelled) return;
        // Same rule the public page follows: only an approved listing is
        // reachable by link. A pending one is not public yet, and the
        // reader is told the listing is unavailable rather than shown it.
        if (!snapshot.exists() || snapshot.data()?.status !== "approved") {
          setFailed(true);
          return;
        }
        const listing = { id: snapshot.id, ...snapshot.data(), createdAt: null };
        navigation.replace("MainTabs");
        openListing(navigation, listing, t, language);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [id, language, navigation, t]);

  return (
    <Center>
      {failed ? (
        <>
          <Message>{t("listingLinkUnavailable")}</Message>
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
