import { useMemo, useState } from "react";
import { Alert, Image, Linking, Modal, Pressable } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  PROMOTION_DAYS,
  isPromotionLive,
  promotionDaysLeft,
  promotionExpiry,
} from "../data/promotion";
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
import {
  categoryLabelFor,
  customCategoriesFrom,
} from "../data/customCategories";
import { useApprovedListings } from "../hooks/useApprovedListings";

const EMERALD = "#0B6E4F";
const TERRACOTTA = "#C1512D";
// Ink, for the same reason: the app's terracotta on its own tint is 4.1:1,
// and this is the button that rejects somebody's listing — not a place for
// text that is nearly readable.
const TERRACOTTA_INK = "#A8421F";

// Approving a listing without seeing it is a coin toss, so this screen exists
// to show the thing being judged before the decision is offered.
//
// The whole listing, not a summary: the photos, the price, the city, the
// phone that will end up on a Contacter button, and the seller's own words.
// The three faults worth catching — a wrong category, an unreachable number,
// a description that is really an advert for something else — are all
// invisible in a title.
// The fields the card already shows in its own words, plus the plumbing a
// moderator has no use for: ids, timestamps, counters, search indexes.
// Everything not named here is content somebody typed, and content somebody
// typed is what moderation is for.
const SHOWN_ABOVE = new Set([
  "id",
  "titleEn",
  "titleFr",
  "descriptionEn",
  "descriptionFr",
  "price",
  "phone",
  "city",
  "categoryKey",
  "sellerName",
  "media",
  "mediaUrl",
  "mediaPath",
  "mediaType",
]);

const PLUMBING = new Set([
  "status",
  "sellerId",
  "sellerUid",
  "sellerPhotoUrl",
  "sellerVerified",
  "createdAt",
  "updatedAt",
  "approvedAt",
  "expiresAt",
  "moderatedAt",
  "moderatedBy",
  "moderationNote",
  "viewCount",
  "viewCountToday",
  "viewCountDate",
  "shareCount",
  "searchTokens",
  "lat",
  "lng",
]);

// Firestore hands back Timestamps, arrays and nested objects; all three have
// to survive being put inside a <Text>. An empty string, an empty array and
// null are dropped rather than printed as a row of dashes — a moderator
// scanning for what a seller actually declared should not have to read past
// forty blanks to find it.
function printable(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => printable(item) ?? "?").join(", ")
      : null;
  }
  if (typeof value === "boolean") return value ? "oui / yes" : "non / no";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  // A Firestore Timestamp, or any other object worth seeing at all.
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function extraFields(item) {
  return Object.entries(item)
    .filter(([key]) => !SHOWN_ABOVE.has(key) && !PLUMBING.has(key))
    .map(([key, value]) => [key, printable(value)])
    .filter(([, value]) => value !== null)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export function ModerationScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const isModerator = useIsModerator(user);
  const {
    pending,
    loading,
    error: queueError,
  } = useModerationQueue(isModerator);

  // Which words sellers keep reaching for, over every approved listing.
  //
  // A label here is not a category — it has no icon, no screen and no filter
  // beyond the chips on the Autre aisle. Making one real is a code change,
  // so it cannot happen automatically; what can happen is knowing which one
  // has earned it, which is otherwise invisible until somebody thinks to
  // count by hand.
  const approvedListings = useApprovedListings();
  const customTally = useMemo(
    () => customCategoriesFrom(approvedListings).slice(0, 8),
    [approvedListings],
  );

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
    const label = language === "en" ? found.labelEn : found.labelFr;
    // The moderator is the one person who has to see the word the seller
    // typed, because approving the listing is what puts it in front of the
    // next seller as a suggestion.
    const custom = categoryLabelFor(item, null);
    return custom ? `${label} · ${custom}` : label;
  };

  const goBackSafely = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("MainTabs");
  };

  const decide = async (item, status) => {
    setBusyId(item.id);
    try {
      // Only the fields the rules allow. approvedAt is stamped by
      // notifyListingModerated on the way past, but writing it here too means
      // the list re-sorts immediately instead of after a round trip.
      //
      // moderatedBy is required by the rules and checked against the signed-in
      // uid there, so it cannot be set to somebody else — the audit line is
      // written by the same act it records.
      await updateDoc(doc(firestore, "listings", item.id), {
        status,
        moderationNote: note.trim() || null,
        moderatedBy: user.uid,
        moderatedAt: serverTimestamp(),
        ...(status === "approved" ? { approvedAt: serverTimestamp() } : {}),
      });
      setRejectFor(null);
      setNote("");
      setOpenId(null);
    } catch (error) {
      // Every failure used to read "your token is stale", which was a guess
      // dressed as a diagnosis — and the wrong guess for the commonest
      // case, which is the rule refusing a moderator their own listing.
      // The code is shown because a moderator who cannot see it has nothing
      // to report and nothing to try.
      Alert.alert(
        t("moderationTitle"),
        `${t("moderationFailed")}\n\n${error?.code ?? error?.message ?? "unknown"}`,
      );
    } finally {
      setBusyId(null);
    }
  };

  // Granting a promotion, which nobody but a moderator can do.
  //
  // It rides on the same rule as a decision, so it has to carry the same
  // audit fields — status is written back unchanged, and moderatedBy is
  // checked against the signed-in uid there. That is deliberate: being
  // featured is a decision about somebody's listing, and it should leave
  // the same trace as approving one.
  //
  // The end date is written now rather than left open. A grant nobody
  // renews lapses by itself; the rules cap any single one at ninety days.
  const setPromotion = async (item, promote) => {
    setBusyId(item.id);
    try {
      await updateDoc(doc(firestore, "listings", item.id), {
        status: item.status,
        isPromoted: promote,
        promotedUntil: promote ? promotionExpiry(PROMOTION_DAYS) : null,
        moderatedBy: user.uid,
        moderatedAt: serverTimestamp(),
      });
      setOpenId(null);
    } catch (error) {
      Alert.alert(
        t("moderationTitle"),
        `${t("moderationFailed")}\n\n${error?.code ?? error?.message ?? "unknown"}`,
      );
    } finally {
      setBusyId(null);
    }
  };

  const confirmPromote = (item) => {
    const live = isPromotionLive(item);
    Alert.alert(
      t(live ? "moderationUnpromoteTitle" : "moderationPromoteTitle"),
      live
        ? t("moderationUnpromoteBody", { title: titleOf(item) })
        : t("moderationPromoteBody", {
            title: titleOf(item),
            days: PROMOTION_DAYS,
          }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t(live ? "moderationUnpromote" : "moderationPromote"),
          onPress: () => setPromotion(item, !live),
        },
      ],
    );
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
    // The rules refuse any decision by the seller on their own listing —
    // deliberately, so that a second moderator cannot wave their own work
    // through. The queue does not filter these out, because a moderator
    // should still see what is waiting; what was wrong was offering the
    // buttons and letting the write be refused, then blaming the token.
    const isOwn = !!user && item.sellerId === user.uid;
    // mediaUrl, which is what the posting form writes and what every other
    // screen reads. This read `asset.url ?? asset.uri` — neither of which
    // exists on a stored asset — so every source came out undefined. The
    // array was still non-empty, so the "no photograph" line never showed
    // either: a moderator got a row of blank boxes and no way to tell
    // whether the listing had photos or the screen had failed.
    //
    // The two fallbacks stay for the local shape the picker produces before
    // upload, which does use `uri`.
    const assets = (
      item.media?.length
        ? item.media
        : item.mediaUrl
          ? [{ mediaUrl: item.mediaUrl }]
          : []
    )
      .map((asset) => ({
        ...asset,
        url: asset.mediaUrl ?? asset.url ?? asset.uri ?? null,
      }))
      .filter((asset) => asset.url);

    // A video URL in an <Image> is another blank box. Counted and named
    // instead, because "this listing is a video" is exactly the kind of
    // thing a moderator needs to know before approving it.
    const media = assets.filter((asset) => asset.mediaType !== "video");
    const videoCount = assets.length - media.length;

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
                    key={`${asset.url}-${index}`}
                    source={{ uri: asset.url }}
                    resizeMode="cover"
                  />
                ))}
              </PhotoRow>
            ) : null}
            {videoCount ? (
              <NoPhoto>
                {t("moderationVideoCount", { count: videoCount })}
              </NoPhoto>
            ) : null}
            {!media.length && !videoCount ? (
              // Said rather than left blank: for most categories a listing
              // with no photograph is the thing to send back.
              <NoPhoto>{t("moderationNoPhoto")}</NoPhoto>
            ) : null}

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

            {/* Everything else the listing carries.
            
                The card showed a price, a phone and a description, which is
                a summary — and this screen's own opening comment says it
                exists to show the whole listing rather than a summary. A
                moderator judging a car advert could not see the year, the
                mileage or the make; judging a flat, not the rooms or the
                deal. All three are exactly where a wrong category or an
                invented spec would show.
            
                Rendered from whatever the document happens to hold rather
                than from a hand-kept list, so a field added to the posting
                form appears here the day it ships instead of the day
                somebody remembers this file. Raw field names on purpose:
                this is an internal tool, and the moderator wants to see
                what is stored, not a friendly paraphrase of it. */}
            {extraFields(item).length ? (
              <>
                <FieldsLabel>{t("moderationAllFields")}</FieldsLabel>
                {extraFields(item).map(([key, value]) => (
                  <FieldRow key={key}>
                    <FieldKey>{key}</FieldKey>
                    <FieldValue>{value}</FieldValue>
                  </FieldRow>
                ))}
              </>
            ) : null}

            {isOwn ? (
              <OwnNote>{t("moderationOwnListing")}</OwnNote>
            ) : (
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
            )}

            {/* Only on a listing that is already public. Featuring
                something still pending would put it in the slot before
                anybody had judged it, and rejecting it afterwards would
                leave the promotion behind. */}
            {!isOwn && item.status === "approved" ? (
              <PromoteRow>
                <PromoteButton
                  onPress={() => confirmPromote(item)}
                  disabled={busyId === item.id}
                  live={isPromotionLive(item)}
                >
                  <Ionicons
                    name="megaphone-outline"
                    size={15}
                    color={isPromotionLive(item) ? colors.accentDark : colors.primary}
                  />
                  <PromoteLabel live={isPromotionLive(item)}>
                    {isPromotionLive(item)
                      ? t("moderationPromotedFor", {
                          days: promotionDaysLeft(item),
                        })
                      : item.promotionRequested
                        ? t("moderationPromoteRequested")
                        : t("moderationPromote")}
                  </PromoteLabel>
                </PromoteButton>
              </PromoteRow>
            ) : null}
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
          {/* This screen is reachable from a push notification, which on a
              cold start can leave it with nothing beneath it — and goBack on
              an empty stack does nothing at all while logging a warning
              nobody sees in production. Falls through to the tabs, so the
              arrow always moves. */}
          <BackButton onPress={goBackSafely} hitSlop={12}>
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
        ) : queueError ? (
          /* A refused or failed read is not an empty queue, and must never
             look like one — that is exactly how a listing sat waiting behind
             a screen saying "Rien en attente". */
          <ErrorCard>
            <ErrorTitle>{t("moderationQueueFailed")}</ErrorTitle>
            <EmptyCopy>{t("moderationQueueFailedCopy")}</EmptyCopy>
            <ErrorCode>{queueError}</ErrorCode>
          </ErrorCard>
        ) : null}

        {isModerator && !queueError && customTally.length ? (
          <TallyCard>
            <TallyTitle>{t("moderationCustomTallyTitle")}</TallyTitle>
            <TallyCopy>{t("moderationCustomTallyCopy")}</TallyCopy>
            {customTally.map((entry) => (
              <TallyRow key={entry.key}>
                <TallyLabel numberOfLines={1}>{entry.label}</TallyLabel>
                <TallyCount>
                  <TallyCountLabel>{entry.count}</TallyCountLabel>
                </TallyCount>
              </TallyRow>
            ))}
          </TallyCard>
        ) : null}

        {!isModerator || queueError ? null : pending.length === 0 &&
          !loading ? (
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

const FieldsLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  margin-top: ${spacing.md}px;
  margin-bottom: 6px;
  color: ${(props) => props.theme.textMuted};
`;

const FieldRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  padding-vertical: 5px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

// Fixed width so the values line up in a column and a missing one is
// obvious. Raw field names, so they are also searchable against the form.
const FieldKey = styled.Text`
  width: 132px;
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const FieldValue = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

// Not a warning: a moderator seeing their own listing in the queue is the
// system working. It is only the buttons that must not be there.
const OwnNote = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  line-height: 18px;
  margin-top: ${spacing.md}px;
  padding: 11px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  color: ${(props) => props.theme.textMuted};
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

// The promotion control sits on its own line under the decision buttons.
// It is not a third verdict — the listing is already approved by the time
// this appears — and putting it in the same row would read as one.
// A tally, not a control. Nothing here is tappable, because promoting a
// label to a real category means writing an icon, a colour and a screen —
// it is a code change, and a button implying otherwise would be lying.
const TallyCard = styled.View`
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const TallyTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const TallyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin: 4px 0 ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const TallyRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 7px 0;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const TallyLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const TallyCount = styled.View`
  padding: 2px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const TallyCountLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const PromoteRow = styled.View`
  margin-top: ${spacing.sm}px;
`;

const PromoteButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px;
  border-radius: ${radius.md}px;
  border-width: 1px;
  border-color: ${(props) =>
    props.live ? props.theme.accentDark : props.theme.border};
  background-color: ${(props) =>
    props.live ? props.theme.accentLight : props.theme.surface};
`;

const PromoteLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) =>
    props.live ? props.theme.accentDark : props.theme.primary};
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
  color: ${TERRACOTTA_INK};
`;

const ErrorCard = styled.View`
  padding: ${spacing.lg}px ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: rgba(193, 81, 45, 0.08);
  border-width: 1px;
  border-color: rgba(193, 81, 45, 0.3);
  margin-bottom: ${spacing.md}px;
`;

const ErrorTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${TERRACOTTA_INK};
  margin-bottom: 6px;
`;

// The raw code, on purpose. "permission-denied" and "failed-precondition"
// mean completely different things — the first is a claim that has not
// arrived, the second a missing index — and a friendly message that hides
// which one costs an hour of guessing.
const ErrorCode = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 8px;
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
