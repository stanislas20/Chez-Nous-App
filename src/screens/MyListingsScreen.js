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
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
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
import { useConversations } from "../hooks/useConversations";
// The plural rule and the compact form both already exist for the profile
// stat row, and both are language-dependent in ways worth getting wrong
// only once: French takes the singular at zero ("0 vue"), English does not,
// and 1 200 views should read "1,2 k" on a card this size rather than
// pushing the next figure onto its own line.
import { formatCount, statLabelKey } from "../utils/formatCount";
import { statTints } from "../theme/statTints";
import { firestore } from "../config/firebase";
import { getDutyLabel } from "../utils/pharmacyDuty";
import { listingPriceText } from "../utils/listingPrice";
import { openListing } from "../utils/openListing";
import { TabSafeAreaView } from "../components/TabSafeAreaView";
import { reportNonFatal } from "../utils/reportError";

// No horizontal padding: the cards carry their own margin, which is what
// lets them cast a shadow on both sides. The vertical padding stays — a
// list that starts hard against the header reads as clipped.
const listContentStyle = {
  paddingTop: spacing.md,
  paddingBottom: spacing.md,
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

// How many people wrote about each advert.
//
// Unlike views, calls and saves this needs no counter and no rule: a
// conversation already carries the listingId it was opened from, and the
// seller is already subscribed to all of theirs for the Messages tab. So it
// is a tally of data already on the phone, not a fourth number to write and
// get wrong.
//
// Conversations, not messages. Twenty messages from one person is one
// person interested, and showing "20" beside "3 appels" would invite the
// seller to conclude the advert is doing four times better than it is.
//
// Only threads where they are the seller. Their own enquiries about other
// people's adverts arrive in the same subscription, and a listing of theirs
// must not be credited for a message they sent about somebody else's.
function messagesByListing(conversations, uid) {
  const counts = new Map();
  (conversations ?? []).forEach((conversation) => {
    if (!conversation?.listingId || conversation.sellerId !== uid) return;
    counts.set(
      conversation.listingId,
      (counts.get(conversation.listingId) ?? 0) + 1,
    );
  });
  return counts;
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
  const conversations = useConversations(user?.uid);
  const messageCounts = useMemo(
    () => messagesByListing(conversations, user?.uid),
    [conversations, user?.uid],
  );
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

  // The document, and nothing else.
  //
  // This used to delete the Storage files first and the document second, and
  // both halves were wrong. The order meant a delete that failed after the
  // files had gone left a live listing in the market with broken
  // photographs — the one outcome worse than an orphaned file. And the paths
  // it collected were `mediaPath` and `media[].mediaPath` only, so every
  // thumbnail ever generated survived its listing, unreferenced and
  // therefore unfindable.
  //
  // Both are now cleanupDeletedListingMedia's job (functions/index.js). It
  // fires on the document event, so it also covers the deletions this screen
  // never saw: from the console, from a script, from any future admin tool.
  const handleDelete = async (item) => {
    try {
      await deleteDoc(doc(firestore, "listings", item.id));
    } catch (error) {
      // The alert was already honest. What was missing is anybody knowing:
      // a listing that will not delete is a seller stuck with something they
      // have asked twice to remove, and it is invisible from here.
      reportNonFatal("deleteListing", error, { where: "MyListingsScreen" });
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
          const priceText = isPharmacy
            ? dutyLabel
            : listingPriceText(item, t, language);
          const saleStatusShown =
            !isPharmacy &&
            !!item.saleStatus &&
            item.saleStatus !== "available";
          const dutyLabel = isPharmacy
            ? getDutyLabel(item, language, t).text || item.phone
            : "";

          return (
            <Card
              onPress={() => openListing(navigation, item, t, language)}
              onLongPress={() => setMenuItem(item)}
            >
              <CardTop>
                {/* Was a bare Image, so a listing with no photo showed an
                    empty panel — the larger the square got, the more it
                    read as a broken image rather than an absent one. */}
                <ThumbnailWrap>
                  <ListingMedia listing={item} size="thumb" />
                </ThumbnailWrap>
                <RowBody>
                  <TitleRow>
                    <RowTitle numberOfLines={2}>{title}</RowTitle>
                    {/* Edit, share and delete were reachable only by
                        long-press, which is why the screen carried a line
                        of text explaining that they existed. A control
                        nobody can see is not a feature you can document
                        your way out of — this opens the same sheet.

                        In the title row rather than centred against the
                        whole card: it used to float level with the middle
                        of the photograph, lining up with nothing, and a
                        control that belongs to the whole advert belongs at
                        the top of it. */}
                    <MoreButton onPress={() => setMenuItem(item)} hitSlop={10}>
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={18}
                        color={colors.textMuted}
                      />
                    </MoreButton>
                  </TitleRow>
                  {priceText ? (
                    <RowPrice numberOfLines={1}>{priceText}</RowPrice>
                  ) : null}
                  {/* Where it is. On a screen holding thirteen adverts the
                      photograph and the title are not always enough to tell
                      two of them apart — two rooms in different towns look
                      identical at 96px — and without it the body of the
                      card ran out of things to say halfway up the
                      photograph beside it. */}
                  {item.city ? (
                    <MetaRow>
                      <Ionicons
                        name="location-outline"
                        size={12}
                        color={colors.textMuted}
                      />
                      <MetaLabel numberOfLines={1}>{item.city}</MetaLabel>
                    </MetaRow>
                  ) : null}
                  {/* Only what is not the normal case.
                
                      Every approved listing used to carry a green
                      "Approuvée" pill, so a shop with thirteen live adverts
                      showed thirteen identical green pills and none of them
                      told the seller anything — the word was wallpaper, and
                      it sat in the same row as the states that do need
                      reading. Pending and rejected still show, because
                      those are the ones with something to do about them,
                      and so does a sale status the seller set themselves. */}
                  {!isApproved || saleStatusShown ? (
                    <PillRow>
                      {!isApproved ? (
                        <StatusPill rejected={isRejected}>
                          <StatusPillLabel rejected={isRejected}>
                            {isRejected
                              ? t("listingStatusRejected")
                              : t("listingStatusPending")}
                          </StatusPillLabel>
                        </StatusPill>
                      ) : null}
                      {saleStatusShown ? (
                        <SaleStatusPill saleStatus={item.saleStatus}>
                          <SaleStatusPillLabel saleStatus={item.saleStatus}>
                            {t(
                              saleStatusLabelKey(
                                item.categoryKey,
                                item.saleStatus,
                              ),
                            )}
                          </SaleStatusPillLabel>
                        </SaleStatusPill>
                      ) : null}
                    </PillRow>
                  ) : null}
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
              </CardTop>

              {/* Across the foot of the card rather than tucked beside the
                  text, because these four belong to the advert and not to
                  the paragraph. A tinted panel here would have been a box
                  inside a box; a hairline says the same thing and adds
                  nothing to look at. */}
              {isApproved ? (
                <StatStrip>
                  <Stat>
                    <Ionicons
                      name="eye"
                      size={13}
                      color={statTints.views}
                    />
                    <StatFigure zero={(item.viewCount ?? 0) === 0}>
                      {formatCount(item.viewCount ?? 0, language)}
                    </StatFigure>
                    <StatLabel>
                      {t(
                        statLabelKey(
                          "dashboardStatViews",
                          item.viewCount ?? 0,
                          language,
                        ),
                      )}
                    </StatLabel>
                  </Stat>
                  {/* Between the view and the call on purpose: the row is a
                      funnel, and this is the step where a listing that is
                      seen but never rung tells you which of the two
                      problems it has. Saved and not rung is a price or a
                      missing detail — they want it and something is in the
                      way. Never saved at all is simply not wanted. */}
                  <Stat>
                    <Ionicons
                      name="heart"
                      size={13}
                      color={statTints.saved}
                    />
                    <StatFigure zero={(item.saveCount ?? 0) === 0}>
                      {formatCount(item.saveCount ?? 0, language)}
                    </StatFigure>
                    <StatLabel>
                      {t(
                        statLabelKey(
                          "profileStatSaves",
                          item.saveCount ?? 0,
                          language,
                        ),
                      )}
                    </StatLabel>
                  </Stat>
                  <Stat>
                    <Ionicons
                      name="call"
                      size={13}
                      color={statTints.contacts}
                    />
                    <StatFigure zero={(item.contactCount ?? 0) === 0}>
                      {formatCount(item.contactCount ?? 0, language)}
                    </StatFigure>
                    <StatLabel>
                      {t(
                        statLabelKey(
                          "dashboardStatContacts",
                          item.contactCount ?? 0,
                          language,
                        ),
                      )}
                    </StatLabel>
                  </Stat>
                  <Stat>
                    <Ionicons
                      name="chatbubble"
                      size={13}
                      color={statTints.messages}
                    />
                    <StatFigure zero={(messageCounts.get(item.id) ?? 0) === 0}>
                      {formatCount(messageCounts.get(item.id) ?? 0, language)}
                    </StatFigure>
                    <StatLabel>
                      {t(
                        statLabelKey(
                          "dashboardStatMessages",
                          messageCounts.get(item.id) ?? 0,
                          language,
                        ),
                      )}
                    </StatLabel>
                  </Stat>
                </StatStrip>
              ) : null}
            </Card>
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

// A card, with air around it, on a screen that used to be flush slabs.
//
// The flush idiom is right where it came from: the Local grid tiles
// photographs edge to edge and two pixels of surface between them is a
// seam, not a gap. This screen is not that. Each row here is one advert
// you own and act on — rename it, price it, retire it — and a management
// list wants the object bounded, not tiled. Square-cornered full-width
// slabs with a four-figure footer inside them read as a spreadsheet, and
// the eye cannot find where one advert stops.
const Card = styled(Pressable)`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.lg}px;
  margin-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  padding: ${spacing.sm}px;
  ${shadow.card}
`;

const CardTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
`;

// The title and the control that acts on the whole advert, on one line at
// the top. Baseline-aligned by sitting in the same row rather than by being
// centred against a photograph that is taller than either of them.
const TitleRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.xs}px;
`;

// Rounded now, and clipped to it. A hard square inside a rounded card is
// the detail that makes a layout look assembled rather than drawn.
//
// 84 rather than 96, which is a proportion rather than a preference: a
// title, a price and a town stack about eighty points high, and a square
// taller than that leaves the right half of the card empty from the price
// downwards. It reads as something failing to load. The photograph still
// carries the row — the jump up from 64 was what stopped this screen
// looking unrelated to the rest of the app, and this is nowhere near back.
const ThumbnailWrap = styled.View`
  width: 84px;
  height: 84px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const RowTitle = styled.Text`
  ${type.bodyMedium}
  flex: 1;
  color: ${(props) => props.theme.text};
  line-height: 20px;
`;

// The price was 13px grey-green — smaller than the title and the same
// colour as the status pill under it, on a screen where it is the second
// thing anybody reads. It is money, so it is set like money: the largest
// text on the card, in the text colour rather than the brand's, which the
// buttons and the live-state have more use for.
const RowPrice = styled.Text`
  ${type.bodyMedium}
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-top: 2px;
`;

const PillRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.xs}px;
  margin-top: ${spacing.xs}px;
`;

const StatusPill = styled.View`
  align-self: flex-start;
  background-color: ${(props) =>
    props.rejected ? props.theme.errorLight : props.theme.accentLight};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 3px;
`;

const StatusPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) =>
    props.rejected ? props.theme.error : props.theme.accentDark};
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

// How the advert is doing, across the foot of the card.
//
// Four figures in two columns, separated from the advert above by a
// hairline rather than by a tint. They were on a tinted panel while the
// card itself was a flat slab, which was the only thing giving them an
// edge; inside a card with its own shadow that panel became a box drawn
// inside a box.
const StatStrip = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  row-gap: ${spacing.xs}px;
  margin-top: ${spacing.sm}px;
  padding-top: ${spacing.sm}px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

// Two per line, which is what four figures want at this width. An earlier
// version put all four on one line with rules between them, and a wrap
// breaks between a figure and the rule that follows it — so the first line
// ended in a hairline pointing at nothing. Alignment separates four things
// better than lines do.
const Stat = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  width: 50%;
`;

// A zero is greyed and a real number is not.
//
// Most adverts have a zero in at least one of these, and drawn at full
// weight the four figures all shout equally — the seller has to read every
// one to find the one that happened. This way what happened is the only
// thing dark on the row, and a card with nothing to report goes quiet by
// itself without anything being hidden.
//
// The colour is on the icon and not on the figure, which is what lets both
// rules hold at once: the glyph says which measurement this is, in the same
// colour the dashboard gives it, while the number underneath still says
// whether anything happened. Four differently-coloured numerals would have
// been four things claiming to matter equally, and the greying could not
// have shown through.
const StatFigure = styled.Text`
  ${type.captionMedium}
  font-size: 14px;
  color: ${(props) => (props.zero ? props.theme.textMuted : props.theme.text)};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 3px;
  margin-top: 3px;
`;

const MetaLabel = styled.Text`
  ${type.caption}
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
  flex: 1;
`;

// Named, not implied. A digit on its own is not a measurement.
const StatLabel = styled.Text`
  ${type.caption}
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

const EmptyMessage = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: ${spacing.xl}px;
`;

// 32 rather than 40, and pulled up by the difference between its own
// height and the title's line box, so the dots sit on the first line of the
// title instead of hanging below it. hitSlop keeps the tap target the size
// it was.
const MoreButton = styled(Pressable)`
  width: 32px;
  height: 32px;
  margin-top: -6px;
  margin-right: -6px;
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
