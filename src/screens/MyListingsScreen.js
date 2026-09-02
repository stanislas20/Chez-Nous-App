import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, Share } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { ListingMedia } from "../components/ListingMedia";
import { RailChip } from "../components/RailChip";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import {
  getAvailabilityLabel,
  roadsideAvailabilityStates,
} from "../data/roadside";
import { useI18n } from "../i18n/I18nContext";
import { withListingLink } from "../utils/listingLink";
import { saleStatusLabelKey } from "../data/saleStatuses";
import { useAuth } from "../auth/AuthContext";
import { useMyListings } from "../hooks/useMyListings";
import { firestore, storage } from "../config/firebase";
import { getDutyLabel } from "../utils/pharmacyDuty";
import { listingPriceText } from "../utils/listingPrice";
import { openListing } from "../utils/openListing";
import { TabSafeAreaView } from "../components/TabSafeAreaView";

// Two pixels horizontally, like the Local grid, so the rows reach the edges
// and the photograph gets the width. The vertical padding stays: a list
// that starts hard against the header reads as clipped.
const listContentStyle = {
  paddingHorizontal: 2,
  paddingVertical: spacing.md,
};

function getSaleStatuses(colors) {
  return [
    {
      key: "available",
      icon: "pricetag-outline",
      tint: colors.primaryLight,
      iconColor: colors.primary,
    },
    {
      key: "pending",
      icon: "time-outline",
      tint: colors.accentLight,
      iconColor: colors.accentDark,
    },
    {
      key: "negotiating",
      icon: "chatbubbles-outline",
      tint: "rgba(91, 192, 235, 0.18)",
      iconColor: colors.skyBlue,
    },
    {
      key: "sold",
      icon: "checkmark-done-outline",
      tint: colors.errorLight,
      iconColor: colors.error,
    },
  ];
}

const FILTERS = [
  { key: "all", labelKey: "dashboardStatTotal", icon: "albums-outline" },
  { key: "active", labelKey: "dashboardStatActive", icon: "checkmark-circle-outline" },
  { key: "sold", labelKey: "dashboardStatSold", icon: "checkmark-done-outline" },
  { key: "pending", labelKey: "listingStatusPending", icon: "time-outline" },
];

function matchesFilter(item, filter) {
  if (filter === "active")
    return item.status === "approved" && item.saleStatus !== "sold";
  if (filter === "sold") return item.saleStatus === "sold";
  if (filter === "pending") return item.status === "pending";
  return true;
}

export function MyListingsScreen() {
  const { colors } = useTheme();
  const saleStatuses = getSaleStatuses(colors);
  const { language, t } = useI18n();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const listings = useMyListings(user?.uid);
  const [filter, setFilter] = useState(route.params?.filter ?? "all");

  // A count on each tab, which is the summary this screen never had.
  //
  // It answers the question the screen is opened with — how many are
  // waiting, how many are live — without a stats panel above the list
  // repeating what the tabs could have said themselves. Zero is shown
  // rather than hidden: "Vendues 0" is a fact worth reading, and a tab
  // that appears and disappears is harder to aim at than one that stays.
  const filterCounts = useMemo(() => {
    const counts = {};
    FILTERS.forEach((option) => {
      counts[option.key] = (listings ?? []).filter((item) =>
        matchesFilter(item, option.key),
      ).length;
    });
    return counts;
  }, [listings]);

  // The param has to be applied on every arrival, not only the first.
  //
  // useState reads it once, at mount. Anybody who had opened Mes annonces
  // earlier in the session then tapped "1 annonce en attente de validation"
  // arrived at a screen still showing whatever filter they left it on — the
  // row promised a filtered list and delivered the last one.
  useFocusEffect(
    useCallback(() => {
      const wanted = route.params?.filter;
      if (!wanted) return;
      setFilter(wanted);
      navigation.setParams({ filter: undefined });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params?.filter]),
  );
  const [menuItem, setMenuItem] = useState(null);
  const [availabilityItem, setAvailabilityItem] = useState(null);
  const [statusMenuItem, setStatusMenuItem] = useState(null);

  const filteredListings = useMemo(
    () => (listings ?? []).filter((item) => matchesFilter(item, filter)),
    [listings, filter],
  );

  const closeMenu = () => setMenuItem(null);
  const closeStatusMenu = () => setStatusMenuItem(null);
  const menuTitle = menuItem
    ? language === "en"
      ? menuItem.titleEn
      : menuItem.titleFr
    : "";
  const statusMenuTitle = statusMenuItem
    ? language === "en"
      ? statusMenuItem.titleEn
      : statusMenuItem.titleFr
    : "";

  const handleShare = async (item, title) => {
    const priceText = listingPriceText(item, t, language);
    try {
      const message = priceText
        ? t("shareListingMessage", { title, price: priceText })
        : t("shareListingMessageNoPrice", { title });
      // This screen is the one that holds listings a moderator has not
      // approved. Those have no public page, and withListingLink leaves
      // them as a sentence rather than a link that says "no longer online".
      await Share.share({ message: withListingLink(message, item) });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const handleDelete = async (item) => {
    try {
      const paths = [
        item.mediaPath,
        ...(item.media ?? []).map((m) => m.mediaPath),
      ].filter(Boolean);
      await Promise.all(
        [...new Set(paths)].map((path) =>
          deleteObject(ref(storage, path)).catch(() => {}),
        ),
      );
      await deleteDoc(doc(firestore, "listings", item.id));
    } catch {
      Alert.alert(t("myListingsTitle"), t("errorDeleteFailed"));
    }
  };

  const handleSetSaleStatus = async (item, saleStatus) => {
    closeStatusMenu();
    try {
      await updateDoc(doc(firestore, "listings", item.id), {
        saleStatus,
        soldAt: saleStatus === "sold" ? serverTimestamp() : null,
      });
    } catch {
      Alert.alert(t("myListingsTitle"), t("errorSaleStatusFailed"));
    }
  };

  // The one field that has to be set in seconds, from wherever the provider
  // is standing — so it lives on their own listing rather than buried in the
  // posting form. Stamped with the moment it was set, because a declaration
  // from three weeks ago tells a stranded caller nothing: readAvailability
  // expires it on its own after four hours.
  const handleSetAvailability = async (item, key) => {
    setAvailabilityItem(null);
    try {
      await updateDoc(doc(firestore, "listings", item.id), {
        roadsideAvailability: key,
        roadsideAvailabilityAt: serverTimestamp(),
      });
    } catch {
      Alert.alert(t("myListingsTitle"), t("errorSaleStatusFailed"));
    }
  };

  const confirmDelete = (item) => {
    Alert.alert(
      t("deleteListingConfirmTitle"),
      t("deleteListingConfirmMessage"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("deleteButton"),
          style: "destructive",
          onPress: () => handleDelete(item),
        },
      ],
    );
  };

  return (
    <Container edges={["left", "right"]}>
      {/* The app's own chip, so these match the rails on Local, Voitures
          and Événements rather than being a fourth pill shape with its own
          padding. */}
      <FilterRow horizontal showsHorizontalScrollIndicator={false}>
        {FILTERS.map((option) => (
          <RailChip
            key={option.key}
            icon={option.icon}
            label={t(option.labelKey)}
            count={filterCounts[option.key]}
            selected={filter === option.key}
            onPress={() => setFilter(option.key)}
          />
        ))}
      </FilterRow>
      <FlatList
        data={filteredListings}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
          listings !== null ? (
            <EmptyMessage>
              {listings.length > 0
                ? t("categoryListingsNoResults")
                : t("myListingsEmptyMessage")}
            </EmptyMessage>
          ) : null
        }

        renderItem={({ item }) => {
          const title = language === "en" ? item.titleEn : item.titleFr;
          const isApproved = item.status === "approved";
          // Without its own branch a rejected listing renders as "pending",
          // so the seller waits forever on a decision that already came
          // back. The reason moderation recorded is shown with it — being
          // told no without being told why is unactionable.
          const isRejected = item.status === "rejected";
          const isPharmacy = item.categoryKey === "pharmacyOnDuty";
          const dutyLabel = isPharmacy
            ? getDutyLabel(item, language, t).text || item.phone
            : "";

          return (
            <Row
              onPress={() => openListing(navigation, item, t, language)}
              onLongPress={() => setMenuItem(item)}
            >
              {/* Was a bare Image, so a listing with no photo showed an
                  empty panel — the larger the square got, the more it read
                  as a broken image rather than an absent one. */}
              <ThumbnailWrap>
                <ListingMedia listing={item} size="thumb" />
              </ThumbnailWrap>
              <RowBody>
                <RowTitle numberOfLines={1}>{title}</RowTitle>
                <RowPrice>
                  {isPharmacy
                    ? dutyLabel
                    : listingPriceText(item, t, language)}
                </RowPrice>
                <PillRow>
                  <StatusPill approved={isApproved} rejected={isRejected}>
                    <StatusPillLabel
                      approved={isApproved}
                      rejected={isRejected}
                    >
                      {isApproved
                        ? t("listingStatusApproved")
                        : isRejected
                          ? t("listingStatusRejected")
                          : t("listingStatusPending")}
                    </StatusPillLabel>
                  </StatusPill>
                  {!isPharmacy &&
                  item.saleStatus &&
                  item.saleStatus !== "available" ? (
                    <SaleStatusPill saleStatus={item.saleStatus}>
                      <SaleStatusPillLabel saleStatus={item.saleStatus}>
                        {t(
                          saleStatusLabelKey(item.categoryKey, item.saleStatus),
                        )}
                      </SaleStatusPillLabel>
                    </SaleStatusPill>
                  ) : null}
                  {isApproved ? (
                    <ViewCountPill>
                      <Ionicons
                        name="eye-outline"
                        size={11}
                        color={colors.textMuted}
                      />
                      <ViewCountLabel>{item.viewCount ?? 0}</ViewCountLabel>
                    </ViewCountPill>
                  ) : null}
                  {/* Beside the views, because the pair is the whole story
                      and either alone misleads: many views and no calls is
                      a price or a photograph problem, few views and calls
                      on most of them means the listing is fine and nobody
                      is finding it. A seller shown only the first number
                      concludes the wrong thing. */}
                  {isApproved ? (
                    <ContactCountPill>
                      <Ionicons name="call-outline" size={11} color={colors.primary} />
                      <ContactCountLabel>
                        {item.contactCount ?? 0}
                      </ContactCountLabel>
                    </ContactCountPill>
                  ) : null}
                </PillRow>
                {isRejected ? (
                  <>
                    <RejectionNote numberOfLines={3}>
                      {item.moderationNote || t("listingRejectedNoReason")}
                    </RejectionNote>
                    {/* Said every time, not only when moderation left no
                        reason. The sentence used to be the tail of
                        listingRejectedNoReason, so the sellers who were
                        given a reason — the ones who can actually act on
                        it — were the only ones never told what to do with
                        it. */}
                    <RejectionHint>
                      {t("listingRejectedResubmitHint")}
                    </RejectionHint>
                  </>
                ) : null}
              </RowBody>

              {/* Edit, share and delete were reachable only by long-press,
                  which is why the screen carried a line of text explaining
                  that they existed. A control nobody can see is not a
                  feature you can document your way out of — this opens the
                  same sheet, and the sentence is gone. Long-press still
                  works for anybody already used to it. */}
              <MoreButton
                onPress={() => setMenuItem(item)}
                hitSlop={10}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={18}
                  color={colors.textMuted}
                />
              </MoreButton>
            </Row>
          );
        }}
      />

      <Modal
        visible={!!menuItem}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Backdrop onPress={closeMenu}>
          <Pressable onPress={() => {}}>
            <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
              <SheetHandle />
              <SheetTitle numberOfLines={1}>{menuTitle}</SheetTitle>

              <SheetRow
                onPress={() => {
                  closeMenu();
                  navigation.navigate("CreateListing", { listing: menuItem });
                }}
              >
                <SheetIconCircle tint={colors.primaryLight}>
                  <Ionicons
                    name="create-outline"
                    size={20}
                    color={colors.primary}
                  />
                </SheetIconCircle>
                <SheetRowLabel>{t("editButton")}</SheetRowLabel>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </SheetRow>

              {menuItem?.categoryKey === "services" ? (
                <SheetRow
                  onPress={() => {
                    const item = menuItem;
                    setAvailabilityItem(item);
                    closeMenu();
                  }}
                >
                  <SheetIconCircle tint="rgba(11, 110, 79, 0.12)">
                    <Ionicons
                      name="flash-outline"
                      size={20}
                      color={colors.primary}
                    />
                  </SheetIconCircle>
                  <SheetRowLabel>{t("availabilityButton")}</SheetRowLabel>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                </SheetRow>
              ) : null}

              {menuItem?.categoryKey === "pharmacyOnDuty" ? null : (
                <SheetRow
                  onPress={() => {
                    const item = menuItem;
                    setStatusMenuItem(item);
                    closeMenu();
                  }}
                >
                  <SheetIconCircle tint="rgba(91, 192, 235, 0.18)">
                    <Ionicons
                      name="flag-outline"
                      size={20}
                      color={colors.skyBlue}
                    />
                  </SheetIconCircle>
                  <SheetRowLabel>{t("saleStatusButton")}</SheetRowLabel>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                  />
                </SheetRow>
              )}

              <SheetRow
                onPress={() => {
                  const item = menuItem;
                  const title = menuTitle;
                  closeMenu();
                  handleShare(item, title);
                }}
              >
                <SheetIconCircle tint={colors.accentLight}>
                  <Ionicons
                    name="share-social-outline"
                    size={20}
                    color={colors.accentDark}
                  />
                </SheetIconCircle>
                <SheetRowLabel>{t("shareButton")}</SheetRowLabel>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </SheetRow>

              <SheetRow
                last
                onPress={() => {
                  const item = menuItem;
                  closeMenu();
                  confirmDelete(item);
                }}
              >
                <SheetIconCircle tint={colors.errorLight}>
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={colors.error}
                  />
                </SheetIconCircle>
                <SheetRowLabel destructive>{t("deleteButton")}</SheetRowLabel>
              </SheetRow>

              <CancelButton onPress={closeMenu}>
                <CancelLabel>{t("cancel")}</CancelLabel>
              </CancelButton>
            </Sheet>
          </Pressable>
        </Backdrop>
      </Modal>

      <Modal
        visible={!!availabilityItem}
        transparent
        animationType="fade"
        onRequestClose={() => setAvailabilityItem(null)}
      >
        <Backdrop onPress={() => setAvailabilityItem(null)}>
          <Pressable onPress={() => {}}>
            <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
              <SheetHandle />
              <SheetTitle numberOfLines={1}>
                {t("availabilityPickerTitle")}
              </SheetTitle>
              {/* Said on the sheet where the promise is made: this is what a
                  stranded caller will read, and it stops counting after four
                  hours rather than standing until it is corrected. */}
              <SheetNote>{t("availabilityPickerNote")}</SheetNote>

              {roadsideAvailabilityStates.map((option, index) => (
                <SheetRow
                  key={option.key}
                  last={index === roadsideAvailabilityStates.length - 1}
                  onPress={() =>
                    handleSetAvailability(availabilityItem, option.key)
                  }
                >
                  <SheetIconCircle
                    tint={
                      option.key === "now"
                        ? "rgba(11, 110, 79, 0.12)"
                        : option.key === "hour"
                          ? "rgba(217, 164, 65, 0.18)"
                          : "rgba(0, 0, 0, 0.06)"
                    }
                  >
                    <Ionicons
                      name={
                        option.key === "off" ? "moon-outline" : "flash-outline"
                      }
                      size={20}
                      color={
                        option.key === "now"
                          ? colors.primary
                          : option.key === "hour"
                            ? colors.accentDark
                            : colors.textMuted
                      }
                    />
                  </SheetIconCircle>
                  <SheetRowLabel>
                    {getAvailabilityLabel(option.key, language)}
                  </SheetRowLabel>
                </SheetRow>
              ))}
            </Sheet>
          </Pressable>
        </Backdrop>
      </Modal>

      <Modal
        visible={!!statusMenuItem}
        transparent
        animationType="fade"
        onRequestClose={closeStatusMenu}
      >
        <Backdrop onPress={closeStatusMenu}>
          <Pressable onPress={() => {}}>
            <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
              <SheetHandle />
              <SheetTitle numberOfLines={1}>
                {t("saleStatusPickerTitle")} — {statusMenuTitle}
              </SheetTitle>

              {saleStatuses.map((option, index) => (
                <SheetRow
                  key={option.key}
                  last={index === saleStatuses.length - 1}
                  onPress={() =>
                    handleSetSaleStatus(statusMenuItem, option.key)
                  }
                >
                  <SheetIconCircle tint={option.tint}>
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={option.iconColor}
                    />
                  </SheetIconCircle>
                  <SheetRowLabel>
                    {t(
                      saleStatusLabelKey(
                        statusMenuItem?.categoryKey,
                        option.key,
                      ),
                    )}
                  </SheetRowLabel>
                  {(statusMenuItem?.saleStatus ?? "available") ===
                  option.key ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={colors.primary}
                    />
                  ) : null}
                </SheetRow>
              ))}

              <CancelButton onPress={closeStatusMenu}>
                <CancelLabel>{t("cancel")}</CancelLabel>
              </CancelButton>
            </Sheet>
          </Pressable>
        </Backdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(TabSafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const FilterRow = styled.ScrollView.attrs({
  contentContainerStyle: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
})`
  flex-grow: 0;
`;

const FilterChip = styled(Pressable)`
  background-color: ${(props) => (props.selected ? props.theme.primary : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? props.theme.primary : props.theme.border)};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.xs}px;
`;

const FilterChipLabel = styled.Text`
  ${(props) => (props.selected ? type.captionMedium : type.caption)}
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.text)};
`;

// Local's language, applied to a row rather than a grid cell: square
// corners, a 2px seam between rows, and a hairline border instead of a drop
// shadow — square rows two pixels apart read as one sheet, and a shadow in
// that gap turns the seam into a smudge. Same reasoning as ListingCard's
// flush variant, which this is deliberately matching rather than inventing
// a third card style.
//
// The row stays a row. It carries a status pill, a view count and the
// edit and delete actions, none of which a browse card has anywhere to put.
const Row = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: 0px;
  padding: ${spacing.sm}px;
  margin-bottom: 2px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

// 110 rather than 64, and square-cornered. On Local the photograph carries
// the card; at 64px it was a stamp beside the text, which is what made this
// screen look unrelated to the rest of the app.
const ThumbnailWrap = styled.View`
  width: 110px;
  height: 110px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const RowTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const RowPrice = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.primaryDark};
`;

const PillRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.xs}px;
  margin-top: 2px;
`;

const StatusPill = styled.View`
  align-self: flex-start;
  background-color: ${(props) =>
    props.rejected
      ? props.theme.errorLight
      : props.approved
        ? props.theme.primaryLight
        : props.theme.accentLight};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 2px;
`;

const StatusPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) =>
    props.rejected
      ? props.theme.error
      : props.approved
        ? props.theme.primaryDark
        : props.theme.accentDark};
  font-size: 11px;
`;

const RejectionNote = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  font-size: 11.5px;
  line-height: 16px;
  margin-top: ${spacing.xs}px;
`;

// The reason is grey because it is somebody else's verdict; the way out is
// the app's own voice, so it carries the primary colour and the medium
// weight. Two greys stacked would read as one paragraph of bad news.
const RejectionHint = styled.Text`
  ${type.caption}
  font-family: ${fontFamily.medium};
  color: ${(props) => props.theme.primaryDark};
  font-size: 11.5px;
  line-height: 16px;
  margin-top: 2px;
`;

const saleStatusTint = (theme) => ({
  pending: theme.accentLight,
  negotiating: "rgba(91, 192, 235, 0.18)",
  sold: theme.errorLight,
});

const saleStatusTextColor = (theme) => ({
  pending: theme.accentDark,
  negotiating: theme.skyBlue,
  sold: theme.error,
});

const SaleStatusPill = styled.View`
  align-self: flex-start;
  background-color: ${(props) => saleStatusTint(props.theme)[props.saleStatus]};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 2px;
`;

const SaleStatusPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => saleStatusTextColor(props.theme)[props.saleStatus]};
  font-size: 11px;
`;

const ViewCountPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 3px;
  align-self: flex-start;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 2px;
`;

const ContactCountPill = styled(ViewCountPill)`
  background-color: rgba(11, 110, 79, 0.09);
`;

const ViewCountLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  font-size: 11px;
`;

const ContactCountLabel = styled(ViewCountLabel)`
  color: ${(props) => props.theme.primary};
`;

const EmptyMessage = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: ${spacing.xl}px;
`;

const MoreButton = styled(Pressable)`
  width: 40px;
  height: 40px;
  align-self: flex-start;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.pill}px;
`;

const Backdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: ${(props) => props.theme.scrim};
`;

const Sheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: ${radius.xl}px;
  border-top-right-radius: ${radius.xl}px;
  padding: ${spacing.md}px;
  shadow-color: #0b1f16;
  shadow-offset: 0px -4px;
  shadow-opacity: 0.12;
  shadow-radius: 16px;
  elevation: 8;
`;

const SheetNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  padding: 0px ${spacing.md}px ${spacing.sm}px;
`;

const SheetHandle = styled.View`
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

const SheetTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-bottom: ${spacing.sm}px;
`;

const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  border-bottom-width: ${(props) => (props.last ? "0px" : "1px")};
  border-bottom-color: ${(props) => props.theme.border};
`;

const SheetIconCircle = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 19px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.tint};
`;

const SheetRowLabel = styled.Text`
  ${type.bodyMedium}
  flex: 1;
  color: ${(props) => (props.destructive ? props.theme.error : props.theme.text)};
`;

const CancelButton = styled(Pressable)`
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  margin-top: ${spacing.md}px;
`;

const CancelLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.text};
`;
