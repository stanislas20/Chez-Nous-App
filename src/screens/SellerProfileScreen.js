import { useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { ListingCard } from "../components/ListingCard";
import { useSellerListings } from "../hooks/useSellerListings";
import { buildLinkUrl } from "../data/restaurantLinks";
import { useSellerStats } from "../hooks/useSellerStats";
import {
  useMyRating,
  useRatings,
  submitRating,
  removeRating,
} from "../hooks/useRatings";
import { useFollow } from "../hooks/useFollow";
import { formatCount, statLabelKey } from "../utils/formatCount";
import { useAuth } from "../auth/AuthContext";

const EMERALD = "#0B6E4F";

// The flag of Bénin: green, yellow, red.
//
// Washed back to roughly a tenth of their strength. At full saturation the
// name, the sector line and the counts all sit on shifting hues and none of
// them stay readable — the flag ends up costing the screen its content. At
// this weight it reads as a national tint behind the page while every card
// on top keeps its own opaque surface.
const BENIN_GREEN = "rgba(0, 135, 81, 0.16)";
const BENIN_YELLOW = "rgba(252, 209, 22, 0.13)";
const BENIN_RED = "rgba(232, 17, 45, 0.11)";
const beninFlagWash = [BENIN_GREEN, BENIN_YELLOW, BENIN_RED];

// One fixed square, filled edge to edge — the same avatar on every profile,
// at a size that reads from arm's length.
//
// Measuring each image and matching its shape was tried first and looked
// worse in practice: what people actually upload is a full phone
// screenshot, and honouring 9:19.5 gave a 78px-wide sliver. A wordmark does
// lose its ends to the crop, which is the accepted cost of a consistent
// avatar; the fix for that is a tighter crop before uploading.
const PHOTO_SIZE = 156;

const listContentStyle = { padding: spacing.md };
const rowStyle = { justifyContent: "space-between" };

export function SellerProfileScreen({ route, navigation }) {
  // sellerSector/sellerCity arrive only when this was opened from the
  // "Entreprises vérifiées" row, where the company's public projection has
  // them. A profile reached from a listing has neither, so both render
  // conditionally rather than leaving an empty line.
  const {
    sellerId,
    sellerName,
    memberSince,
    sellerVerified,
    sellerSector,
    sellerCity,
    sellerPhotoUrl,
    sellerPhone,
  } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();
  const { language, t } = useI18n();
  const listings = useSellerListings(sellerId);

  // Every listing a seller posts carries the same sellerMemberSince value
  // (denormalized at creation from their real profile), so the current
  // listing's copy of it is exactly as accurate as fetching the seller's
  // own doc — without needing a read the security rules don't allow (a
  // buyer can't read another user's private sellers/{uid} profile).
  const memberSinceDate = memberSince?.toDate?.() ?? null;
  const memberSinceLabel = memberSinceDate
    ? t("dashboardMemberSince", {
        date: new Intl.DateTimeFormat(language === "en" ? "en-US" : "fr-FR", {
          month: "long",
          year: "numeric",
        }).format(memberSinceDate),
      })
    : null;

  const initial = sellerName ? sellerName.trim().charAt(0).toUpperCase() : "?";

  const openRating = () => {
    // Pre-filled when editing, so someone revising a review starts from
    // what they said rather than from blank.
    setStars(myRating?.stars ?? 0);
    setComment(myRating?.comment ?? "");
    setRateOpen(true);
  };

  const saveRating = async () => {
    if (!stars) {
      Alert.alert(t("ratingSheetTitle"), t("ratingNeedStars"));
      return;
    }
    const ok = await submitRating({
      ratedId: sellerId,
      userId: user?.uid,
      stars,
      comment,
      isEdit: !!myRating,
    });
    setRateOpen(false);
    Alert.alert(
      t("ratingSheetTitle"),
      ok ? t("ratingSaved") : t("errorGeneric"),
    );
  };

  const deleteRating = async () => {
    const ok = await removeRating({ ratedId: sellerId, userId: user?.uid });
    setRateOpen(false);
    Alert.alert(
      t("ratingSheetTitle"),
      ok ? t("ratingRemoved") : t("errorGeneric"),
    );
  };
  const stats = useSellerStats(sellerId);
  const ratings = useRatings(sellerId);
  const {
    canRate,
    isReady: ratingReady,
    myRating,
  } = useMyRating(sellerId, user?.uid);
  const [rateOpen, setRateOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  // Viewing your own profile: the actions that only make sense pointed at
  // someone else are dropped rather than left to no-op.
  const isOwnProfile = Boolean(user?.uid && sellerId && user.uid === sellerId);

  // Unlike calling or following, sharing your own profile is exactly what an
  // owner wants to do, so this one stays visible on every profile.
  const handleShare = async () => {
    try {
      await Share.share({
        message: t(
          sellerVerified
            ? "shareCompanyProfileMessage"
            : "shareSellerProfileMessage",
          {
            name: sellerName ?? "",
          },
        ),
      });
    } catch {
      // dismissed the share sheet — nothing to do
    }
  };
  const { isFollowing, isReady, canFollow, toggleFollow } = useFollow(
    sellerId,
    user?.uid,
    { followerName: user?.displayName ?? null, sellerName: sellerName ?? null },
  );

  const openFollowList = (kind) =>
    navigation.navigate("FollowList", { uid: sellerId, kind, sellerName });

  return (
    <Container edges={["left", "right", "bottom"]}>
      {/* Behind the list rather than around it, so scrolling doesn't drag
          the tint with it. Verified companies only — an individual's profile
          has no claim to fly the flag. */}
      {sellerVerified ? (
        <FlagWash
          colors={beninFlagWash}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.35, y: 1 }}
        />
      ) : null}
      <FlatList
        data={listings ?? []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={rowStyle}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Header>
            {sellerPhotoUrl ? (
              <AvatarPhoto
                source={{ uri: sellerPhotoUrl }}
                resizeMode="cover"
              />
            ) : (
              <Avatar>
                <AvatarLabel>{initial}</AvatarLabel>
              </Avatar>
            )}
            <SellerName numberOfLines={2}>{sellerName}</SellerName>

            {sellerVerified ? (
              <VerifiedPill>
                <Ionicons
                  name="checkmark-circle"
                  size={13}
                  color={colors.primary}
                />
                <VerifiedPillLabel>
                  {t("companyVerifiedBadge")}
                </VerifiedPillLabel>
              </VerifiedPill>
            ) : null}

            {sellerSector || sellerCity ? (
              <CompanyMetaRow>
                <Ionicons
                  name="location-outline"
                  size={12}
                  color={colors.textMuted}
                />
                <CompanyMetaText numberOfLines={1}>
                  {[sellerSector, sellerCity].filter(Boolean).join(" · ")}
                </CompanyMetaText>
              </CompanyMetaRow>
            ) : null}
            {memberSinceLabel ? (
              <MemberSince>{memberSinceLabel}</MemberSince>
            ) : null}

            {/* Zeroes are shown rather than hidden: "0 abonnés" is a real
                answer, and a row that appears only once populated makes the
                profile jump as the counts arrive. */}
            <StatRow>
              {/* The two counts that stand for people are now doors to
                  them; likes stays a number because there is no list of
                  who liked what — favourites are private per user. */}
              <StatCellButton onPress={() => openFollowList("following")}>
                <StatValue>
                  {formatCount(stats?.following ?? 0, language)}
                </StatValue>
                <StatLabel>
                  {t(
                    statLabelKey(
                      "profileStatFollowing",
                      stats?.following ?? 0,
                      language,
                    ),
                  )}
                </StatLabel>
              </StatCellButton>
              <StatSeparator />
              <StatCellButton onPress={() => openFollowList("followers")}>
                <StatValue>
                  {formatCount(stats?.followers ?? 0, language)}
                </StatValue>
                <StatLabel>
                  {t(
                    statLabelKey(
                      "profileStatFollowers",
                      stats?.followers ?? 0,
                      language,
                    ),
                  )}
                </StatLabel>
              </StatCellButton>
              <StatSeparator />
              <StatCell>
                <StatValue>
                  {formatCount(stats?.likes ?? 0, language)}
                </StatValue>
                <StatLabel>
                  {t(
                    statLabelKey(
                      "profileStatLikes",
                      stats?.likes ?? 0,
                      language,
                    ),
                  )}
                </StatLabel>
              </StatCell>
            </StatRow>

            {/* Follow is hidden on your own profile and while signed out,
                rather than shown as a button whose press can only fail.
                Share always shows, so the row never collapses to nothing. */}
            <ActionRow>
              {canFollow && isReady ? (
                <FollowButton
                  following={isFollowing}
                  onPress={async () => {
                    const ok = await toggleFollow();
                    if (!ok) Alert.alert(sellerName ?? "", t("errorGeneric"));
                  }}
                >
                  <Ionicons
                    name={isFollowing ? "checkmark" : "person-add-outline"}
                    size={16}
                    color={isFollowing ? colors.text : "#ffffff"}
                  />
                  <FollowLabel following={isFollowing}>
                    {t(
                      isFollowing
                        ? "profileFollowingAction"
                        : "profileFollowAction",
                    )}
                  </FollowLabel>
                </FollowButton>
              ) : null}
              <ShareButton solo={!canFollow || !isReady} onPress={handleShare}>
                <Ionicons
                  name="share-social-outline"
                  size={16}
                  color={colors.text}
                />
                <ShareLabel>{t("profileShareAction")}</ShareLabel>
              </ShareButton>
            </ActionRow>

            {/* A profile that proves a business is real and then offers no
                way to reach it sends the visitor back out to hunt through
                its listings for a contact. Published numbers only, so this
                shows for verified companies and never for an individual.
                Hidden on your own profile — a company has no reason to be
                offered a button that phones itself. */}
            {sellerPhone && !isOwnProfile ? (
              <ContactRow>
                <ContactButton
                  primary
                  onPress={() => Linking.openURL(`tel:${sellerPhone}`)}
                >
                  <Ionicons name="call" size={16} color={colors.textInverse} />
                  <ContactLabel primary>{t("callButtonLabel")}</ContactLabel>
                </ContactButton>
                {buildLinkUrl("whatsapp", sellerPhone) ? (
                  <ContactButton
                    onPress={() =>
                      Linking.openURL(buildLinkUrl("whatsapp", sellerPhone))
                    }
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                    <ContactLabel>WhatsApp</ContactLabel>
                  </ContactButton>
                ) : null}
              </ContactRow>
            ) : null}

            <SectionRow>
              <SectionTitle>{t("ratingSectionTitle")}</SectionTitle>
              {stats?.ratingCount ? (
                <SectionMeta>
                  <Ionicons name="star" size={13} color="#D9A441" />
                  <SectionMetaLabel>
                    {stats.rating.toFixed(1).replace(".", ",")} ·{" "}
                    {t("ratingCount", { count: stats.ratingCount })}
                  </SectionMetaLabel>
                </SectionMeta>
              ) : null}
            </SectionRow>

            {/* Shown only to someone who has actually messaged this
                person — the same gate the rules enforce. Everyone else is
                told why rather than shown a button that would fail. */}
            {!isOwnProfile && ratingReady ? (
              canRate ? (
                <RateButton onPress={openRating}>
                  <Ionicons name="star-outline" size={15} color={EMERALD} />
                  <RateButtonLabel>
                    {t(myRating ? "ratingEditAction" : "ratingRateAction")}
                  </RateButtonLabel>
                </RateButton>
              ) : (
                <RatingLockedHint>{t("ratingLockedHint")}</RatingLockedHint>
              )
            ) : null}

            {ratings?.length ? (
              ratings.map((item) => (
                <ReviewCard key={item.id}>
                  <ReviewStars>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons
                        key={n}
                        name={n <= item.stars ? "star" : "star-outline"}
                        size={13}
                        color="#D9A441"
                      />
                    ))}
                    {item.raterId === user?.uid ? (
                      <ReviewMine>{t("ratingYou")}</ReviewMine>
                    ) : null}
                  </ReviewStars>
                  {item.comment ? (
                    <ReviewComment>{item.comment}</ReviewComment>
                  ) : null}
                </ReviewCard>
              ))
            ) : (
              <RatingEmpty>{t("ratingNone")}</RatingEmpty>
            )}

            <ListingsHeading>
              {t("sellerProfileActiveListings", {
                count: listings?.length ?? 0,
              })}
            </ListingsHeading>
          </Header>
        }
        ListEmptyComponent={
          listings !== null ? (
            <EmptyState>
              <EmptyText>{t("sellerProfileEmptyListings")}</EmptyText>
            </EmptyState>
          ) : null
        }
        renderItem={({ item }) => <ListingCard listing={item} />}
      />
      <Modal
        visible={rateOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRateOpen(false)}
      >
        <SheetBackdrop onPress={() => setRateOpen(false)}>
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetHandle />
            <ScrollView showsVerticalScrollIndicator={false}>
              <SheetTitle>{t("ratingSheetTitle")}</SheetTitle>

              <FieldLabel>{t("ratingStarsLabel")}</FieldLabel>
              <StarRow>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
                    <Ionicons
                      name={n <= stars ? "star" : "star-outline"}
                      size={30}
                      color="#D9A441"
                    />
                  </Pressable>
                ))}
              </StarRow>

              <FieldLabel>{t("ratingCommentLabel")}</FieldLabel>
              <CommentBox>
                <CommentInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder={t("ratingCommentPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  // Matches the 500-character ceiling the rules enforce, so
                  // a long review is trimmed here rather than rejected
                  // silently on write.
                  maxLength={500}
                />
              </CommentBox>

              <SubmitButton onPress={saveRating}>
                <SubmitLabel>{t("ratingSubmit")}</SubmitLabel>
              </SubmitButton>

              {myRating ? (
                <DeleteRow onPress={deleteRating}>
                  <DeleteLabel>{t("ratingDelete")}</DeleteLabel>
                </DeleteRow>
              ) : null}
            </ScrollView>
          </Sheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const FlagWash = styled(LinearGradient)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

// contain, not cover: a company logo cropped to a circle loses its name.
const ContactRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.md}px;
  width: 100%;
`;

const ContactButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 12px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.primary ? props.theme.primary : props.theme.surface)};
  border-width: 1.5px;
  border-color: ${(props) => (props.primary ? props.theme.primary : props.theme.border)};
`;

const ContactLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.primary ? props.theme.textInverse : props.theme.text)};
`;

const AvatarPhoto = styled.Image`
  width: ${PHOTO_SIZE}px;
  height: ${PHOTO_SIZE}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

// Three equal columns, no rules between them — the numbers are far enough
// apart to read as separate figures, and dividers made a five-item stack
// (photo, name, badge, meta, stats) look like a table.
// The three figures sit in their own card rather than floating in the
// header stack: they're a different kind of information from the name and
// badge above them, and without an edge they read as a fourth line of the
// identity block instead of a summary of the account.
const StatRow = styled.View`
  flex-direction: row;
  align-self: stretch;
  align-items: center;
  margin-top: ${spacing.lg}px;
  padding: ${spacing.md}px ${spacing.xs}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

// Inside a bounded card the hairlines help rather than hurt — they divide
// three figures, where before they were drawing a table around a whole
// header.
const StatSeparator = styled.View`
  width: 1px;
  height: 30px;
  background-color: ${(props) => props.theme.border};
`;

const StatCell = styled.View`
  flex: 1;
  align-items: center;
`;

const StatCellButton = styled(Pressable)`
  flex: 1;
  align-items: center;
`;

const StatValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 21px;
  letter-spacing: -0.3px;
  color: ${(props) => props.theme.text};
`;

const StatLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  margin-top: 4px;
  color: ${(props) => props.theme.textMuted};
`;

const ActionRow = styled.View`
  flex-direction: row;
  align-self: stretch;
  gap: ${spacing.sm}px;
  /* Clears the stat card above it. On Android that card's elevation shadow
     paints below its own bounds, so a token gap here reads as none at all. */
  margin-top: ${spacing.md}px;
`;

const FollowButton = styled(Pressable)`
  flex: 1.4;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 13px 0;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.following ? props.theme.surfaceAlt : EMERALD)};
  border-width: 1px;
  border-color: ${(props) => (props.following ? props.theme.border : EMERALD)};
`;

const FollowLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => (props.following ? props.theme.text : "#ffffff")};
`;

// Sits beside Follow, and takes the full width on your own profile where
// there is no Follow button to share the row with.
const ShareButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 13px 0;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const ShareLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const VerifiedPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  padding: 5px 11px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const VerifiedPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => props.theme.primaryDark};
`;

const CompanyMetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
`;

const CompanyMetaText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const Header = styled.View`
  position: relative;
  align-items: center;
  padding: ${spacing.lg}px ${spacing.md}px ${spacing.md}px;
`;

const Avatar = styled.View`
  width: ${PHOTO_SIZE}px;
  height: ${PHOTO_SIZE}px;
  border-radius: ${radius.xl}px;
  background-color: ${EMERALD};
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.sm}px;
`;

const AvatarLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 24px;
  color: #ffffff;
`;

const SellerName = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 21px;
  line-height: 26px;
  color: ${(props) => props.theme.text};
  text-align: center;
`;

const MemberSince = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.35);
`;

const Sheet = styled.View`
  max-height: 78%;
  padding: ${spacing.sm}px ${spacing.md}px ${spacing.xl}px;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  background-color: ${(props) => props.theme.background};
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.border};
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  margin-bottom: ${spacing.md}px;
  color: ${(props) => props.theme.text};
`;

const FieldLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  margin-bottom: ${spacing.sm}px;
  color: ${(props) => props.theme.text};
`;

const StarRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const CommentBox = styled.View`
  padding: 12px 14px;
  border-radius: ${radius.lg}px;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const CommentInput = styled(TextInput)`
  min-height: 84px;
  font-family: ${fontFamily.regular};
  font-size: 14px;
  text-align-vertical: top;
  color: ${(props) => props.theme.text};
`;

const SubmitButton = styled(Pressable)`
  padding: 15px;
  border-radius: ${radius.lg}px;
  align-items: center;
  background-color: ${EMERALD};
`;

const SubmitLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #ffffff;
`;

const DeleteRow = styled(Pressable)`
  padding: 14px;
  align-items: center;
`;

const DeleteLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.error};
`;

const SectionRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  align-self: stretch;
  margin-top: ${spacing.lg}px;
  margin-bottom: ${spacing.sm}px;
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const SectionMeta = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const SectionMetaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const RateButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  align-self: stretch;
  padding: 12px;
  border-radius: ${radius.pill}px;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${EMERALD};
`;

const RateButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const RatingLockedHint = styled.Text`
  align-self: stretch;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-bottom: ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const RatingEmpty = styled.Text`
  align-self: stretch;
  font-family: ${fontFamily.regular};
  font-size: 13px;
  color: ${(props) => props.theme.textMuted};
`;

const ReviewCard = styled.View`
  align-self: stretch;
  padding: 12px 14px;
  border-radius: ${radius.lg}px;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const ReviewStars = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 2px;
`;

const ReviewMine = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  margin-left: 6px;
  color: ${(props) => props.theme.primaryDark};
`;

const ReviewComment = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  margin-top: 6px;
  color: ${(props) => props.theme.text};
`;

const ListingsHeading = styled.Text`
  align-self: flex-start;
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.lg}px;
`;

const EmptyState = styled.View`
  padding: ${spacing.xl}px ${spacing.md}px;
  align-items: center;
`;

const EmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;
