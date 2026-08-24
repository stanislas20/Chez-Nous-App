import { useState } from "react";
import { Alert, Image, Linking, Modal, Pressable } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import styled from "styled-components/native";
import { firestore } from "../config/firebase";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { useIsModerator } from "../hooks/useIsModerator";
import { useModerationQueue } from "../hooks/useModerationQueue";
import { categories } from "../data/categories";

const EMERALD = "#0B6E4F";
const TERRACOTTA = "#C1512D";

// Approving a listing without seeing it is a coin toss, so this screen exists
// to show the thing being judged before the decision is offered.
//
// The whole listing, not a summary: the photos, the price, the city, the
// phone that will end up on a Contacter button, and the seller's own words.
// The three faults worth catching — a wrong category, an unreachable number,
// a description that is really an advert for something else — are all
// invisible in a title.
export function ModerationScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const isModerator = useIsModerator(user);
  const { pending, loading } = useModerationQueue(isModerator);

  const [openId, setOpenId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState(null);

  const titleOf = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr || "—";
  const descriptionOf = (item) =>
    (language === "en" ? item.descriptionEn : item.descriptionFr) ||
    item.descriptionFr ||
    "";

  const categoryOf = (item) => {
    const found = categories.find((entry) => entry.key === item.categoryKey);
    if (!found) return item.categoryKey ?? "—";
    return language === "en" ? found.labelEn : found.labelFr;
  };

  const decide = async (item, status) => {
    setBusyId(item.id);
    try {
      // Only the three fields the rules allow. approvedAt is stamped by
      // notifyListingModerated on the way past, but writing it here too means
      // the list re-sorts immediately instead of after a round trip.
      await updateDoc(doc(firestore, "listings", item.id), {
        status,
        moderationNote: note.trim() || null,
        ...(status === "approved" ? { approvedAt: serverTimestamp() } : {}),
      });
      setRejectFor(null);
      setNote("");
      setOpenId(null);
    } catch (error) {
      // Almost always a stale token that has not picked up the claim yet.
      Alert.alert(t("moderationTitle"), t("moderationFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const confirmApprove = (item) =>
    Alert.alert(
      t("moderationApproveConfirmTitle"),
      t("moderationApproveConfirmBody", { title: titleOf(item) }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("moderationApprove"),
          onPress: () => decide(item, "approved"),
        },
      ],
    );

  const call = (number) => {
    if (!number) return;
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  const renderCard = (item) => {
    const expanded = openId === item.id;
    const media = item.media?.length
      ? item.media
      : item.mediaUrl
        ? [{ url: item.mediaUrl }]
        : [];

    return (
      <Card key={item.id}>
        <CardHead onPress={() => setOpenId(expanded ? null : item.id)}>
          <HeadCol>
            <CardTitle numberOfLines={2}>{titleOf(item)}</CardTitle>
            <CardMeta numberOfLines={1}>
              {[categoryOf(item), item.city, item.sellerName]
                .filter(Boolean)
                .join(" · ")}
            </CardMeta>
          </HeadCol>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        </CardHead>

        {expanded ? (
          <>
            {media.length ? (
              <PhotoRow horizontal showsHorizontalScrollIndicator={false}>
                {media.map((asset, index) => (
                  <Photo
                    key={`${asset.url ?? asset.uri}-${index}`}
                    source={{ uri: asset.url ?? asset.uri }}
                    resizeMode="cover"
                  />
                ))}
              </PhotoRow>
            ) : (
              // Said rather than left blank: for most categories a listing
              // with no photograph is the thing to send back.
              <NoPhoto>{t("moderationNoPhoto")}</NoPhoto>
            )}

            <FactGrid>
              <Fact>
                <FactLabel>{t("moderationFactPrice")}</FactLabel>
                <FactValue>
                  {item.price
                    ? `${Number(item.price).toLocaleString("fr-FR")} FCFA`
                    : "—"}
                </FactValue>
              </Fact>
              <Fact>
                <FactLabel>{t("moderationFactPhone")}</FactLabel>
                {item.phone ? (
                  <PhoneValue onPress={() => call(item.phone)}>
                    {item.phone}
                  </PhoneValue>
                ) : (
                  <FactValue>—</FactValue>
                )}
              </Fact>
            </FactGrid>

            {descriptionOf(item) ? (
              <Description>{descriptionOf(item)}</Description>
            ) : null}

            <ActionRow>
              <RejectButton
                onPress={() => {
                  setRejectFor(item);
                  setNote("");
                }}
                disabled={busyId === item.id}
              >
                <RejectLabel>{t("moderationReject")}</RejectLabel>
              </RejectButton>
              <ApproveButton
                onPress={() => confirmApprove(item)}
                disabled={busyId === item.id}
              >
                <ApproveLabel>{t("moderationApprove")}</ApproveLabel>
              </ApproveButton>
            </ActionRow>
          </>
        ) : null}
      </Card>
    );
  };

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#0B6E4F", "#07362A", "#05261D"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("moderationEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("moderationTitle")}</HeroTitle>
        <HeroCopy>
          {loading
            ? t("moderationLoading")
            : t("moderationWaiting", { count: pending.length })}
        </HeroCopy>
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!isModerator ? (
          <EmptyCard>
            <EmptyTitle>{t("moderationNotAllowed")}</EmptyTitle>
            <EmptyCopy>{t("moderationNotAllowedCopy")}</EmptyCopy>
          </EmptyCard>
        ) : pending.length === 0 && !loading ? (
          <EmptyCard>
            <EmptyTitle>{t("moderationEmpty")}</EmptyTitle>
            <EmptyCopy>{t("moderationEmptyCopy")}</EmptyCopy>
          </EmptyCard>
        ) : (
          pending.map(renderCard)
        )}
      </Scroll>

      {/* Rejecting asks for a reason, because the seller is told it. A
          rejection with no explanation produces a second identical listing
          and a person who thinks the app is broken. */}
      <Modal
        visible={Boolean(rejectFor)}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectFor(null)}
      >
        <Backdrop onPress={() => setRejectFor(null)}>
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetTitle>{t("moderationRejectTitle")}</SheetTitle>
            <SheetCopy>{t("moderationRejectCopy")}</SheetCopy>
            <NoteInput
              value={note}
              onChangeText={setNote}
              placeholder={t("moderationRejectPlaceholder")}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
            <SheetActions>
              <GhostButton onPress={() => setRejectFor(null)}>
                <GhostLabel>{t("cancel")}</GhostLabel>
              </GhostButton>
              <RejectButton
                onPress={() => decide(rejectFor, "rejected")}
                disabled={busyId === rejectFor?.id}
              >
                <RejectLabel>{t("moderationReject")}</RejectLabel>
              </RejectButton>
            </SheetActions>
          </Sheet>
        </Backdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Hero = styled(LinearGradient)`
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px
    ${spacing.lg}px;
`;

const HeroTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.16);
`;

const HeroEyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 24px;
  color: #ffffff;
  margin-bottom: 6px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const Card = styled.View`
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
  padding: ${spacing.md}px;
  gap: 10px;
`;

const CardHead = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
`;

const HeadCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const CardTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const CardMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 3px;
`;

const PhotoRow = styled.ScrollView`
  flex-grow: 0;
`;

const Photo = styled(Image)`
  width: 128px;
  height: 96px;
  border-radius: ${radius.lg}px;
  margin-right: 8px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const NoPhoto = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #8a6415;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: rgba(217, 164, 65, 0.14);
`;

const FactGrid = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
`;

const Fact = styled.View`
  flex-grow: 1;
  flex-basis: 30%;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const FactLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
`;

const FactValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
  margin-top: 3px;
`;

const PhoneValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
  margin-top: 3px;
`;

const Description = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: ${(props) => props.theme.text};
`;

const ActionRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
`;

const ApproveButton = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  border-radius: 15px;
  background-color: ${(props) => (props.disabled ? "#9CA3AF" : EMERALD)};
`;

const ApproveLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: #ffffff;
`;

const RejectButton = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  border-radius: 15px;
  background-color: rgba(193, 81, 45, 0.1);
  border-width: 1px;
  border-color: rgba(193, 81, 45, 0.3);
`;

const RejectLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${TERRACOTTA};
`;

const EmptyCard = styled.View`
  padding: ${spacing.lg}px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: ${(props) => props.theme.textMuted};
`;

const Backdrop = styled(Pressable)`
  flex: 1;
  justify-content: center;
  padding: ${spacing.md}px;
  background-color: rgba(0, 0, 0, 0.45);
`;

const Sheet = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  gap: 10px;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const SheetCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const NoteInput = styled.TextInput`
  min-height: 76px;
  padding: 12px;
  border-radius: 14px;
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.surfaceAlt};
  text-align-vertical: top;
`;

const SheetActions = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
`;

const GhostButton = styled(Pressable)`
  flex-grow: 1;
  flex-basis: 45%;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  border-radius: 15px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const GhostLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.textMuted};
`;
