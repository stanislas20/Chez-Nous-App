import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { gridItemWidth } from "../utils/gridWidth";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useSellerStats } from "../hooks/useSellerStats";
import { formatCount, statLabelKey } from "../utils/formatCount";
import { guessContentType } from "../utils/uploadContentType";
import { useAuth } from "../auth/AuthContext";
import { useMyListings } from "../hooks/useMyListings";
import { useConversations } from "../hooks/useConversations";
import { storage, firestore } from "../config/firebase";
import { openListing } from "../utils/openListing";
import {
  getListingExpiresAtTimestamp,
  getTodayDateString,
  isListingExpired,
  isListingExpiringSoon,
} from "../utils/listingLifecycle";
import { withViewHeat } from "../utils/viewHeat";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const STATS_COLUMNS = 3;
const priceFormatter = new Intl.NumberFormat("fr-FR");
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const scrollContentStyle = { padding: spacing.md, paddingTop: spacing.lg };
const listingsRowWrapStyle = { marginBottom: spacing.lg };
// The card's drop shadow (shadow-offset 0px 4px, 10px blur) bleeds a few
// px below its own layout box — without bottom padding here, the
// horizontal ScrollView's tightly auto-sized height clips that bleed off,
// same root cause as the earlier similar-listings clipping fix.
const listingsRowStyle = {
  paddingRight: spacing.md,
  paddingBottom: spacing.md,
};
const quickActionsGridStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
};

export function SellerDashboardScreen({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { language, t, resetLanguage } = useI18n();
  const { user, sellerProfile, logOut } = useAuth();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  const listings = useMyListings(user?.uid);
  const conversations = useConversations(user?.uid);

  const pickAvatar = async () => {
    // No permission gate: the docs for this SDK say the library picker
    // needs none, and asking here meant one "Deny" locked someone out of
    // ever changing their picture again.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      // No forced crop: a wide logo squared off at pick time loses its
      // sides permanently. Kept whole and fitted with `contain` on display.
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setIsUploadingAvatar(true);
    try {
      const extension = asset.uri.split(".").pop().split("?")[0];
      const fileName = `${Date.now()}.${extension}`;
      const avatarPath = `sellers/${user.uid}/${fileName}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, avatarPath);
      // storage.rules gates on contentType; an RN blob has none.
      const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType: guessContentType(asset.uri),
      });
      await new Promise((resolve, reject) => {
        uploadTask.on("state_changed", null, reject, resolve);
      });
      const photoUrl = await getDownloadURL(storageRef);

      // No explicit refresh needed — AuthContext subscribes to this doc,
      // so the new photo lands through the same listener.
      await setDoc(
        doc(firestore, "sellers", user.uid),
        { photoUrl },
        { merge: true },
      );
    } catch (error) {
      Alert.alert(t("sellerDashboardTitle"), t("errorUploadFailed"));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleLogout = () => {
    setAccountSheetOpen(false);
    Alert.alert(t("logoutConfirmTitle"), t("logoutConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("logoutButton"),
        style: "destructive",
        onPress: () => {
          logOut();
          resetLanguage();
        },
      },
    ]);
  };

  const handleRenewListing = (listing) => {
    const title = language === "en" ? listing.titleEn : listing.titleFr;
    Alert.alert(
      t("dashboardRenewConfirmTitle"),
      t("dashboardRenewConfirmMessage", { title }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("dashboardRenewButton"),
          onPress: () => {
            updateDoc(doc(firestore, "listings", listing.id), {
              // Renewing extends by the seller's own entitlement, so a
              // verified company gets its 90 days back rather than dropping
              // to the individual's 30 on every renewal.
              expiresAt: getListingExpiresAtTimestamp(
                Date.now(),
                sellerProfile,
              ),
            }).catch(() => {
              Alert.alert(t("sellerDashboardTitle"), t("errorGeneric"));
            });
          },
        },
      ],
    );
  };

  const stats = useMemo(() => {
    const items = listings ?? [];
    const today = getTodayDateString();
    return {
      total: items.length,
      active: items.filter(
        (item) => item.status === "approved" && item.saleStatus !== "sold",
      ).length,
      sold: items.filter((item) => item.saleStatus === "sold").length,
      views: items.reduce((sum, item) => sum + (item.viewCount ?? 0), 0),
      viewsToday: items.reduce(
        (sum, item) =>
          sum + (item.viewCountDate === today ? (item.viewCountToday ?? 0) : 0),
        0,
      ),
      messages: conversations?.length ?? 0,
    };
  }, [listings, conversations]);

  const statCards = [
    {
      key: "total",
      value: stats.total,
      label: t("dashboardStatTotal"),
      onPress: () => navigation.navigate("MyListings", { filter: "all" }),
    },
    {
      key: "active",
      value: stats.active,
      label: t("dashboardStatActive"),
      onPress: () => navigation.navigate("MyListings", { filter: "active" }),
    },
    {
      key: "sold",
      value: stats.sold,
      label: t("dashboardStatSold"),
      onPress: () => navigation.navigate("MyListings", { filter: "sold" }),
    },
    {
      key: "views",
      value: stats.views,
      label: t("dashboardStatViews"),
      onPress: () => navigation.navigate("MyListings", { filter: "all" }),
    },
    {
      key: "messages",
      value: stats.messages,
      label: t("tabChat"),
      onPress: () => navigation.navigate("Messages"),
    },
  ];

  // Every item here is a real, computed condition — never a placeholder
  // count. Mirrors the same heuristics SellerInsightsScreen already uses
  // (unread messages, stale listings, low-photo listings), so a seller
  // never sees a "to do" that doesn't correspond to something real.
  const ownStats = useSellerStats(user?.uid);

  // A company can't reach its own public profile from here, so the share
  // action it would find there lives on the dashboard instead.
  const handleShareProfile = async () => {
    const name = sellerProfile?.companyName || sellerProfile?.fullName || "";
    try {
      await Share.share({
        message: t(
          sellerProfile?.verificationStatus === "verified"
            ? "shareCompanyProfileMessage"
            : "shareSellerProfileMessage",
          { name },
        ),
      });
    } catch {
      // dismissed the share sheet — nothing to do
    }
  };
  const isCompanyAccount =
    sellerProfile?.accountType === "company" || !!sellerProfile?.companyName;

  const todoItems = useMemo(() => {
    const items = listings ?? [];
    const now = Date.now();
    const result = [];

    // A company with no logo shows two grey initials wherever its brand
    // appears — including the verified strip on the home feed. The upload
    // control is an unlabelled avatar, so nothing otherwise tells them that
    // is fixable, or that it is worth fixing.
    if (isCompanyAccount && !sellerProfile?.photoUrl) {
      result.push({
        key: "logo",
        icon: "image-outline",
        text: t("dashboardTodoAddLogo"),
        onPress: pickAvatar,
      });
    }

    // The only route into the company profile — without an entry point the
    // screen may as well not exist, and every field on it was previously
    // write-once at signup.
    if (isCompanyAccount) {
      result.push({
        key: "companyProfile",
        icon: "business-outline",
        text: t("companyEditAction"),
        onPress: () => navigation.navigate("CompanyProfileEdit"),
      });
    }

    const unreadTotal = (conversations ?? []).reduce(
      (sum, conversation) => sum + (conversation.unreadCount?.[user?.uid] ?? 0),
      0,
    );
    if (unreadTotal > 0) {
      result.push({
        key: "unread",
        icon: "chatbubble-ellipses-outline",
        text: t("dashboardTodoUnreadMessages", { count: unreadTotal }),
        onPress: () => navigation.navigate("Messages"),
      });
    }

    const pendingCount = items.filter(
      (item) => item.status === "pending",
    ).length;
    if (pendingCount > 0) {
      result.push({
        key: "pending",
        icon: "time-outline",
        text: t("dashboardTodoPendingApproval", { count: pendingCount }),
        onPress: () => navigation.navigate("MyListings", { filter: "pending" }),
      });
    }

    const expiredListing = items.find(
      (item) =>
        item.status === "approved" &&
        item.saleStatus !== "sold" &&
        isListingExpired(item, now),
    );
    const expiringSoonListing = !expiredListing
      ? items.find(
          (item) =>
            item.status === "approved" &&
            item.saleStatus !== "sold" &&
            isListingExpiringSoon(item, now),
        )
      : null;
    if (expiredListing) {
      const title =
        language === "en" ? expiredListing.titleEn : expiredListing.titleFr;
      result.push({
        key: "expired",
        icon: "alert-circle-outline",
        text: t("dashboardTodoListingExpired", { title }),
        onPress: () => handleRenewListing(expiredListing),
      });
    } else if (expiringSoonListing) {
      const title =
        language === "en"
          ? expiringSoonListing.titleEn
          : expiringSoonListing.titleFr;
      const daysLeft = Math.max(
        1,
        Math.ceil(
          (expiringSoonListing.expiresAt.toMillis() - now) /
            (24 * 60 * 60 * 1000),
        ),
      );
      result.push({
        key: "expiringSoon",
        icon: "hourglass-outline",
        text: t("dashboardTodoListingExpiringSoon", { title, days: daysLeft }),
        onPress: () => handleRenewListing(expiringSoonListing),
      });
    }

    const staleListing = items.find((item) => {
      if (item.saleStatus === "sold" || item.status !== "approved")
        return false;
      const createdDate = item.createdAt?.toDate?.();
      return createdDate && now - createdDate.getTime() > FOURTEEN_DAYS_MS;
    });
    if (staleListing) {
      const title =
        language === "en" ? staleListing.titleEn : staleListing.titleFr;
      result.push({
        key: "stale",
        icon: "refresh-outline",
        text: t("insightsTipStaleListing", { title }),
        onPress: () =>
          navigation.navigate("EditListing", { listing: staleListing }),
      });
    }

    const lowPhotoListing = items.find(
      (item) =>
        item.saleStatus !== "sold" &&
        (item.media?.length ?? (item.mediaUrl ? 1 : 0)) <= 1,
    );
    if (lowPhotoListing) {
      const title =
        language === "en" ? lowPhotoListing.titleEn : lowPhotoListing.titleFr;
      result.push({
        key: "photos",
        icon: "camera-outline",
        text: t("insightsTipMorePhotos", { title }),
        onPress: () =>
          navigation.navigate("EditListing", { listing: lowPhotoListing }),
      });
    }

    if (stats.viewsToday > 0) {
      result.push({
        key: "viewsToday",
        icon: "eye-outline",
        text: t("dashboardTodoViewsToday", { count: stats.viewsToday }),
        onPress: () => navigation.navigate("MyListings", { filter: "all" }),
      });
    }

    return result.slice(0, 4);
  }, [
    listings,
    conversations,
    stats.viewsToday,
    user?.uid,
    language,
    t,
    navigation,
    handleRenewListing,
    sellerProfile,
    pickAvatar,
  ]);

  const recentListings = (listings ?? []).slice(0, 10);

  const quickActions = [
    {
      key: "listings",
      icon: "list-outline",
      label: t("myListingsLink"),
      onPress: () => navigation.navigate("MyListings"),
    },
    {
      key: "jobApplications",
      icon: "mail-open-outline",
      label: t("dashboardApplicationsTile"),
      onPress: () => navigation.navigate("JobApplications"),
    },
    {
      key: "parkStock",
      icon: "layers-outline",
      label: t("dashboardParkStockTile"),
      onPress: () => navigation.navigate("ParkInventory"),
    },
    {
      key: "messages",
      icon: "chatbubbles-outline",
      label: t("tabChat"),
      onPress: () => navigation.navigate("Messages"),
    },
    {
      key: "insights",
      icon: "stats-chart-outline",
      label: t("sellerInsightsLink"),
      onPress: () => navigation.navigate("SellerInsights"),
    },
    {
      key: "profile",
      icon: "person-outline",
      label: t("dashboardQuickProfile"),
      onPress: () => setProfileSheetOpen(true),
    },
    {
      key: "shareProfile",
      icon: "share-social-outline",
      label: t("profileShareAction"),
      onPress: handleShareProfile,
    },
    {
      key: "promote",
      icon: "megaphone-outline",
      label: t("promoteListingTileLabel"),
      onPress: () =>
        navigation.navigate("CreateListing", {
          categoryKey: null,
          isPromoted: true,
        }),
    },
  ];

  const sellerInitial = sellerProfile?.fullName
    ? sellerProfile.fullName.trim().charAt(0).toUpperCase()
    : null;
  const memberSinceDate = sellerProfile?.createdAt?.toDate?.() ?? null;
  const memberSinceLabel = memberSinceDate
    ? t("dashboardMemberSince", {
        date: new Intl.DateTimeFormat(language === "en" ? "en-US" : "fr-FR", {
          month: "long",
          year: "numeric",
        }).format(memberSinceDate),
      })
    : null;

  const isVerifiedCompany =
    isCompanyAccount && sellerProfile?.verificationStatus === "verified";
  const isPendingCompany =
    isCompanyAccount && sellerProfile?.verificationStatus === "pending";
  // Without its own branch a rejected company saw a completely ordinary
  // dashboard — while a push had just told them the review came back. The
  // reason the reviewer recorded is shown with it, since being refused
  // without being told why leaves nothing to act on.
  const isRejectedCompany =
    isCompanyAccount && sellerProfile?.verificationStatus === "rejected";

  return (
    <Container edges={["left", "right", "bottom"]}>
      <Header>
        <HeaderRow>
          <AvatarButton onPress={pickAvatar} disabled={isUploadingAvatar}>
            {sellerProfile?.photoUrl ? (
              <Avatar
                source={{ uri: sellerProfile.photoUrl }}
                resizeMode="cover"
              />
            ) : (
              <AvatarGradient colors={[EMERALD, GOLD]}>
                <AvatarLabel>
                  {sellerInitial ?? (
                    <Ionicons name="person" size={18} color="#fff" />
                  )}
                </AvatarLabel>
              </AvatarGradient>
            )}
          </AvatarButton>
          <GreetingCol>
            <GreetingLineRow>
              <GreetingLine numberOfLines={1}>
                {t("homeGreeting", { name: sellerProfile?.fullName ?? "" })}
              </GreetingLine>
              {isVerifiedCompany ? (
                <Ionicons name="checkmark-circle" size={15} color={EMERALD} />
              ) : null}
            </GreetingLineRow>
            <GreetingSub numberOfLines={1}>
              {isCompanyAccount
                ? sellerProfile.companyName
                : t("dashboardGreetingSubtitle")}
            </GreetingSub>
          </GreetingCol>
          <SettingsButton onPress={() => setAccountSheetOpen(true)} hitSlop={8}>
            <Ionicons name="settings-outline" size={19} color={colors.text} />
          </SettingsButton>
        </HeaderRow>

        {/* The same three numbers visitors see, on the screen the owner
            actually lands on. The public profile is reachable only from a
            listing or the verified strip — neither is somewhere a company
            goes to check on itself. */}
        <OwnStatRow>
          <OwnStatCell>
            <OwnStatValue>
              {formatCount(ownStats?.following ?? 0, language)}
            </OwnStatValue>
            <OwnStatLabel>
              {t(
                statLabelKey(
                  "profileStatFollowing",
                  ownStats?.following ?? 0,
                  language,
                ),
              )}
            </OwnStatLabel>
          </OwnStatCell>
          <OwnStatSeparator />
          <OwnStatCell>
            <OwnStatValue>
              {formatCount(ownStats?.followers ?? 0, language)}
            </OwnStatValue>
            <OwnStatLabel>
              {t(
                statLabelKey(
                  "profileStatFollowers",
                  ownStats?.followers ?? 0,
                  language,
                ),
              )}
            </OwnStatLabel>
          </OwnStatCell>
          <OwnStatSeparator />
          <OwnStatCell>
            <OwnStatValue>
              {formatCount(ownStats?.likes ?? 0, language)}
            </OwnStatValue>
            <OwnStatLabel>
              {t(
                statLabelKey(
                  "profileStatLikes",
                  ownStats?.likes ?? 0,
                  language,
                ),
              )}
            </OwnStatLabel>
          </OwnStatCell>
        </OwnStatRow>

        <CreateButton
          onPress={() =>
            navigation.navigate("CreateListing", {
              categoryKey: null,
              isPromoted: false,
            })
          }
        >
          <CreateButtonLabel>
            {t("dashboardCreateListingButton")}
          </CreateButtonLabel>
        </CreateButton>
      </Header>

      <ScrollView
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator={false}
      >
        {isPendingCompany ? (
          <PendingBanner>
            <Ionicons name="time-outline" size={18} color={GOLD} />
            <PendingBannerCol>
              <PendingBannerTitle>
                {t("dashboardPendingVerificationTitle")}
              </PendingBannerTitle>
              <PendingBannerCopy>
                {t("dashboardPendingVerificationCopy")}
              </PendingBannerCopy>
            </PendingBannerCol>
          </PendingBanner>
        ) : null}

        {isRejectedCompany ? (
          <RejectedBanner>
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={colors.error}
            />
            <PendingBannerCol>
              <PendingBannerTitle>
                {t("dashboardRejectedVerificationTitle")}
              </PendingBannerTitle>
              <PendingBannerCopy>
                {sellerProfile?.verificationNote ||
                  t("dashboardRejectedVerificationCopy")}
              </PendingBannerCopy>
            </PendingBannerCol>
          </RejectedBanner>
        ) : null}

        {isCompanyAccount ? (
          <RegistryBox>
            <RegistryBoxHeader>
              <RegistryBoxTitle>{t("dashboardRegistryTitle")}</RegistryBoxTitle>
              <RegistryStatusPill
                verified={isVerifiedCompany}
                rejected={isRejectedCompany}
              >
                <Ionicons
                  name={
                    isVerifiedCompany
                      ? "checkmark-circle"
                      : isRejectedCompany
                        ? "close-circle"
                        : "time-outline"
                  }
                  size={12}
                  color={
                    isVerifiedCompany
                      ? EMERALD
                      : isRejectedCompany
                        ? colors.error
                        : GOLD
                  }
                />
                <RegistryStatusPillLabel
                  verified={isVerifiedCompany}
                  rejected={isRejectedCompany}
                >
                  {isVerifiedCompany
                    ? t("dashboardRegistryVerified")
                    : isRejectedCompany
                      ? t("dashboardRegistryRejected")
                      : t("dashboardRegistryPending")}
                </RegistryStatusPillLabel>
              </RegistryStatusPill>
            </RegistryBoxHeader>
            <RegistryRow>
              <RegistryRowLabel>{t("companyFieldRccm")}</RegistryRowLabel>
              <RegistryRowValue numberOfLines={1}>
                {sellerProfile?.rccm}
              </RegistryRowValue>
            </RegistryRow>
            <RegistryRow>
              <RegistryRowLabel>{t("companyFieldIfu")}</RegistryRowLabel>
              <RegistryRowValue numberOfLines={1}>
                {sellerProfile?.ifu}
              </RegistryRowValue>
            </RegistryRow>
            <RegistryRow>
              <RegistryRowLabel>{t("companyFieldRepName")}</RegistryRowLabel>
              <RegistryRowValue numberOfLines={1}>
                {sellerProfile?.repName} ({sellerProfile?.repRole})
              </RegistryRowValue>
            </RegistryRow>
          </RegistryBox>
        ) : null}

        <StatsGrid>
          {statCards.map((card, index) => {
            // Cards in an incomplete trailing row (grid doesn't divide
            // evenly by STATS_COLUMNS) widen to fill that row evenly,
            // instead of staying full-grid-width and leaving dead space.
            const remainder = statCards.length % STATS_COLUMNS;
            const lastRowStart =
              statCards.length - (remainder || STATS_COLUMNS);
            const wide = remainder !== 0 && index >= lastRowStart;
            return (
              <StatCard key={card.key} onPress={card.onPress} wide={wide}>
                <StatValue>{card.value}</StatValue>
                <StatLabel>{card.label}</StatLabel>
              </StatCard>
            );
          })}
        </StatsGrid>

        <SectionTitle>{t("dashboardTodoTitle")}</SectionTitle>
        <TodoList>
          {todoItems.length === 0 ? (
            <TodoEmptyText>{t("dashboardTodoEmpty")}</TodoEmptyText>
          ) : (
            todoItems.map((item) => (
              <TodoRow key={item.key} onPress={item.onPress}>
                <Ionicons name={item.icon} size={16} color={EMERALD} />
                <TodoText numberOfLines={2}>{item.text}</TodoText>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textMuted}
                />
              </TodoRow>
            ))
          )}
        </TodoList>

        <SectionHeadRow>
          <SectionTitle>{t("myListingsLink")}</SectionTitle>
          <Pressable onPress={() => navigation.navigate("MyListings")}>
            <SeeAllLink>{t("dashboardSeeAll")}</SeeAllLink>
          </Pressable>
        </SectionHeadRow>
        {recentListings.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={listingsRowWrapStyle}
            contentContainerStyle={listingsRowStyle}
          >
            {recentListings.map((item) => {
              const title = language === "en" ? item.titleEn : item.titleFr;
              const coverUri = item.mediaUrl ?? item.image;
              const isSold = item.saleStatus === "sold";
              const statusLabel = isSold
                ? t("saleStatusSold")
                : item.status === "approved"
                  ? t("listingStatusApproved")
                  : t("listingStatusPending");
              return (
                <ListingCardTouch
                  key={item.id}
                  onPress={() => openListing(navigation, item, t, language)}
                >
                  <ListingCardInner>
                    <ListingImageWrap>
                      {coverUri ? (
                        <ListingImage
                          source={{ uri: coverUri }}
                          resizeMode="cover"
                        />
                      ) : null}
                      <ListingStatusBadge
                        sold={isSold}
                        pending={item.status !== "approved"}
                      >
                        <ListingStatusLabel
                          sold={isSold}
                          pending={item.status !== "approved"}
                        >
                          {statusLabel}
                        </ListingStatusLabel>
                      </ListingStatusBadge>
                    </ListingImageWrap>
                    <ListingBody>
                      <ListingTitle numberOfLines={1}>{title}</ListingTitle>
                      <ListingPrice>
                        {priceFormatter.format(item.price)} FCFA
                      </ListingPrice>
                      {item.status === "approved" ? (
                        <ListingViewsRow>
                          <Ionicons
                            name="eye-outline"
                            size={11}
                            color={colors.textMuted}
                          />
                          <ListingViewsLabel>
                            {/* Same badge the buyer sees on the listing, so
                                a seller learns which of theirs is running
                                hot without opening each one. */}
                            {withViewHeat(item.viewCount, item.viewCount ?? 0)}
                          </ListingViewsLabel>
                          {/* Reach, next to attention. A listing shared ten
                              times and viewed twelve is a different story
                              from one viewed twelve times and shared none. */}
                          {item.shareCount ? (
                            <>
                              <Ionicons
                                name="share-social-outline"
                                size={11}
                                color={colors.textMuted}
                              />
                              <ListingViewsLabel>
                                {item.shareCount}
                              </ListingViewsLabel>
                            </>
                          ) : null}
                        </ListingViewsRow>
                      ) : null}
                    </ListingBody>
                  </ListingCardInner>
                </ListingCardTouch>
              );
            })}
          </ScrollView>
        ) : (
          <EmptyListingsText>{t("myListingsEmptyMessage")}</EmptyListingsText>
        )}

        <SectionTitle>{t("dashboardQuickActionsTitle")}</SectionTitle>
        <QuickActionsGrid style={quickActionsGridStyle}>
          {quickActions.map((action, index) => {
            const isAccent = action.key === "promote";
            return (
              <QuickActionCard
                key={action.key}
                onPress={action.onPress}
                style={{
                  width: gridItemWidth(index, quickActions.length),
                }}
              >
                <QuickActionIconBadge accent={isAccent}>
                  <Ionicons
                    name={action.icon}
                    size={19}
                    color={isAccent ? colors.accentDark : colors.primary}
                  />
                </QuickActionIconBadge>
                <QuickActionLabel numberOfLines={2}>
                  {action.label}
                </QuickActionLabel>
              </QuickActionCard>
            );
          })}
        </QuickActionsGrid>
      </ScrollView>

      <Modal
        visible={accountSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAccountSheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setAccountSheetOpen(false)}>
          <AccountSheet
            onStartShouldSetResponder={() => true}
            style={{ paddingBottom: spacing.xl + insets.bottom }}
          >
            <SheetHandle />
            <AccountRow
              onPress={() => {
                setAccountSheetOpen(false);
                setProfileSheetOpen(true);
              }}
            >
              <AccountRowLabel>{t("dashboardQuickProfile")}</AccountRowLabel>
            </AccountRow>
            <AccountRow
              onPress={() => {
                setAccountSheetOpen(false);
                navigation.navigate("More");
              }}
            >
              <AccountRowLabel>
                {t("dashboardAccountSettingsRow")}
              </AccountRowLabel>
            </AccountRow>
            <AccountRow
              onPress={() =>
                Alert.alert(
                  t("dashboardAccountHelpRow"),
                  t("dashboardHelpComingSoon"),
                )
              }
            >
              <AccountRowLabel>{t("dashboardAccountHelpRow")}</AccountRowLabel>
            </AccountRow>
            <AccountRow onPress={handleLogout} last>
              <AccountRowLabel destructive>{t("logoutButton")}</AccountRowLabel>
            </AccountRow>
          </AccountSheet>
        </SheetBackdrop>
      </Modal>

      <Modal
        visible={profileSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileSheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setProfileSheetOpen(false)}>
          <AccountSheet
            onStartShouldSetResponder={() => true}
            style={{ paddingBottom: spacing.xl + insets.bottom }}
          >
            <SheetHandle />
            <ProfileSheetHeaderRow>
              <ProfileSheetTitle>
                {t("dashboardQuickProfile")}
              </ProfileSheetTitle>
              <Pressable onPress={() => setProfileSheetOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </ProfileSheetHeaderRow>

            <ProfileAvatarSection>
              <AvatarButton onPress={pickAvatar} disabled={isUploadingAvatar}>
                {sellerProfile?.photoUrl ? (
                  <Avatar
                    source={{ uri: sellerProfile.photoUrl }}
                    resizeMode="cover"
                  />
                ) : (
                  <AvatarGradient colors={[EMERALD, GOLD]}>
                    <AvatarLabel>
                      {sellerInitial ?? (
                        <Ionicons name="person" size={18} color="#fff" />
                      )}
                    </AvatarLabel>
                  </AvatarGradient>
                )}
                <AvatarEditBadge>
                  {isUploadingAvatar ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="camera-outline" size={12} color="#ffffff" />
                  )}
                </AvatarEditBadge>
              </AvatarButton>
              <Pressable
                onPress={pickAvatar}
                disabled={isUploadingAvatar}
                hitSlop={8}
              >
                <ProfileChangePhotoLabel>
                  {t("dashboardChangePhoto")}
                </ProfileChangePhotoLabel>
              </Pressable>
            </ProfileAvatarSection>

            <ProfileFieldRow>
              <Ionicons
                name="person-outline"
                size={16}
                color={colors.textMuted}
              />
              <ProfileFieldText>
                {sellerProfile?.fullName || "—"}
              </ProfileFieldText>
            </ProfileFieldRow>
            <ProfileFieldRow>
              <Ionicons
                name="call-outline"
                size={16}
                color={colors.textMuted}
              />
              <ProfileFieldText>{sellerProfile?.phone || "—"}</ProfileFieldText>
            </ProfileFieldRow>
            {memberSinceLabel ? (
              <ProfileFieldRow>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={colors.textMuted}
                />
                <ProfileFieldText>{memberSinceLabel}</ProfileFieldText>
              </ProfileFieldRow>
            ) : null}
          </AccountSheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  padding: ${spacing.md}px ${spacing.md}px ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  ${shadow.card}
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const AvatarButton = styled(Pressable)`
  width: 46px;
  height: 46px;
`;

const Avatar = styled(Image)`
  width: 46px;
  height: 46px;
  border-radius: ${radius.md}px;
`;

const AvatarGradient = styled.View`
  width: 46px;
  height: 46px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${EMERALD};
`;

const AvatarLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: #ffffff;
`;

const AvatarEditBadge = styled.View`
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background-color: ${EMERALD};
  align-items: center;
  justify-content: center;
  border-width: 2px;
  border-color: ${(props) => props.theme.surface};
`;

const ProfileSheetHeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${spacing.lg}px;
  margin-bottom: ${spacing.md}px;
`;

const ProfileSheetTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const ProfileAvatarSection = styled.View`
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

const ProfileChangePhotoLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const ProfileFieldRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.lg}px;
  padding-vertical: 11px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const ProfileFieldText = styled.Text`
  ${type.body}
  flex: 1;
  color: ${(props) => props.theme.text};
`;

const GreetingCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const GreetingLineRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const GreetingLine = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  flex-shrink: 1;
`;

const GreetingSub = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const PendingBanner = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.12);
  margin-bottom: ${spacing.lg}px;
`;

const RejectedBanner = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.errorLight};
  margin-bottom: ${spacing.lg}px;
`;

const PendingBannerCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const PendingBannerTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
  margin-bottom: 2px;
`;

const PendingBannerCopy = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  line-height: 17px;
`;

// Mirrors the mockup's coRegistryBox — but deliberately shows only what
// was actually submitted plus ONE real overall status, not a per-field
// checklist of individually "passed" checks. The mockup's version (RCCM
// found / IFU active / rep matching, each with its own checkmark) implies
// three separate automated lookups that don't exist — this app has no API
// to run them (see the company signup flow's own reasoning) and the real
// process is one person manually reviewing the whole submission at once.
const RegistryBox = styled.View`
  padding: 16px 16px 8px;
  border-radius: ${radius.xl}px;
  background-color: rgba(11, 110, 79, 0.05);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.14);
  margin-bottom: ${spacing.lg}px;
`;

const RegistryBoxHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing.sm}px;
`;

const RegistryBoxTitle = styled.Text`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: ${EMERALD};
`;

const RegistryStatusPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.rejected
      ? props.theme.errorLight
      : props.verified
        ? "rgba(11, 110, 79, 0.12)"
        : "rgba(217, 164, 65, 0.18)"};
`;

const RegistryStatusPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => (props.rejected ? props.theme.error : props.verified ? EMERALD : "#8a6415")};
`;

const RegistryRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;

const RegistryRowLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 0;
`;

const RegistryRowValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  flex-shrink: 1;
  text-align: right;
`;

const SettingsButton = styled(Pressable)`
  width: 38px;
  height: 38px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

// Matches the card on the public profile, so the owner recognises the same
// three figures in the same shape wherever they see them.
const OwnStatRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${spacing.md}px;
  padding: ${spacing.md}px ${spacing.xs}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const OwnStatSeparator = styled.View`
  width: 1px;
  height: 30px;
  background-color: ${(props) => props.theme.border};
`;

const OwnStatCell = styled.View`
  flex: 1;
  align-items: center;
`;

const OwnStatValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 21px;
  letter-spacing: -0.3px;
  color: ${(props) => props.theme.text};
`;

const OwnStatLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  margin-top: 4px;
  color: ${(props) => props.theme.textMuted};
`;

const CreateButton = styled(Pressable)`
  background-color: ${EMERALD};
  border-radius: ${radius.lg}px;
  padding-vertical: 15px;
  align-items: center;
  ${shadow.card}
`;

const CreateButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #ffffff;
`;

const StatsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

const StatCard = styled(Pressable)`
  width: ${(props) => (props.wide ? "48%" : "30.5%")};
  align-items: center;
  padding-vertical: ${spacing.sm}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  ${shadow.card}
`;

const StatValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 19px;
  color: ${(props) => props.theme.text};
`;

const StatLabel = styled.Text`
  font-size: 9.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 3px;
  text-align: center;
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const SectionHeadRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const SeeAllLink = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
`;

const TodoList = styled.View`
  gap: ${spacing.xs}px;
  margin-bottom: ${spacing.lg}px;
`;

const TodoRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 13px 14px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surface};
  ${shadow.card}
`;

const TodoText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const TodoEmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  padding: ${spacing.sm}px 0px;
`;

// Shadow and overflow-clipping deliberately live on two separate layers:
// overflow:hidden and shadow-* on the SAME view silently kill the shadow
// on iOS (overflow clips it away since the shadow renders outside the
// view's own bounds). Same split already used in ListingCard's Card/
// CardInner pair — the outer view owns the shadow + background-color
// (required for the shadow to render on iOS at all), the inner view owns
// the border-radius clipping for the image's corners.
const ListingCardTouch = styled(Pressable)`
  width: 150px;
  margin-right: ${spacing.sm}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  ${shadow.card}
`;

const ListingCardInner = styled.View`
  border-radius: ${radius.lg}px;
  overflow: hidden;
`;

const ListingImageWrap = styled.View`
  height: 100px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ListingImage = styled.Image`
  width: 100%;
  height: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ListingStatusBadge = styled.View`
  position: absolute;
  top: 8px;
  left: 8px;
  background-color: ${(props) => (props.sold ? props.theme.errorLight : props.pending ? props.theme.accentLight : props.theme.primaryLight)};
  border-radius: ${radius.pill}px;
  padding-horizontal: 8px;
  padding-vertical: 2px;
`;

const ListingStatusLabel = styled.Text`
  font-size: 9.5px;
  font-family: ${fontFamily.semiBold};
  color: ${(props) => (props.sold ? props.theme.error : props.pending ? props.theme.accentDark : props.theme.primaryDark)};
`;

const ListingBody = styled.View`
  padding: 9px 10px 11px;
`;

const ListingTitle = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
  margin-bottom: 3px;
`;

const ListingPrice = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const ListingViewsRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 3px;
  margin-top: 3px;
`;

const ListingViewsLabel = styled.Text`
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
`;

const EmptyListingsText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.lg}px;
`;

const QuickActionsGrid = styled.View`
  margin-bottom: ${spacing.md}px;
`;

const QuickActionCard = styled(Pressable)`
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  padding: ${spacing.md}px ${spacing.xs}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const QuickActionIconBadge = styled.View`
  width: 42px;
  height: 42px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.accent ? props.theme.accentLight : props.theme.primaryLight)};
`;

const QuickActionLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
  text-align: center;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const AccountSheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: ${spacing.sm}px 0px ${spacing.xl}px;
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.border};
  align-self: center;
  margin-bottom: ${spacing.md}px;
`;

const AccountRow = styled(Pressable)`
  padding: 15px ${spacing.lg}px;
  border-top-width: ${(props) => (props.last ? "1px" : "0px")};
  border-top-color: ${(props) => props.theme.border};
  margin-top: ${(props) => (props.last ? spacing.xs : 0)}px;
`;

const AccountRowLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => (props.destructive ? props.theme.error : props.theme.text)};
`;
