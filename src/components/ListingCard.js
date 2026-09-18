import { memo, useRef } from "react";
import { Animated, Pressable, Share } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { withListingLink } from "../utils/listingLink";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { saleStatusLabelKey } from "../data/saleStatuses";
import { isPromotionLive } from "../data/promotion";
import { useAuth } from "../auth/AuthContext";
import { getCategoryIcon } from "../data/categories";
import { listingBadgeLabel } from "../data/listingBadge";
import { listingPrice, listingPriceText } from "../utils/listingPrice";
import { openChat } from "../utils/openChat";
import { openListing } from "../utils/openListing";
import { getDutyLabel } from "../utils/pharmacyDuty";
import { ListingMedia } from "./ListingMedia";

const saleStatusTint = (theme) => ({
  pending: theme.accent,
  negotiating: theme.skyBlue,
  sold: theme.error,
});


// `flush` is the Marketplace layout: two near-touching columns, square
// corners, and a photo tall enough to carry the card.
//
// A prop rather than a second component, and opt-in rather than the
// default, because this card renders on nine screens — Pour vous,
// Enregistrées, the seller dashboard, a profile — and only the Local grid
// was asked to change. Making it global would have restyled eight screens
// nobody mentioned.
// `full` is the lone-card case: a section holding exactly one listing.
//
// The grid is two columns of 47% in a space-between row, so a single listing
// sat on the left with more than half the row empty beside it — which reads
// as a layout that failed rather than as a category with one thing in it.
// Only a section of ONE takes this; a trailing odd card in a longer section
// is the ordinary end of a grid and keeps its column width.
function ListingCardBase({
  listing,
  style,
  isFavorite,
  onToggleFavorite,
  flush = false,
  full = false,
}) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const navigation = useNavigation();
  const { user } = useAuth();
  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const categoryIcon = getCategoryIcon(listing.categoryKey);
  const badgeLabel = listingBadgeLabel(listing, language);
  const isOwner = !!user && user.uid === listing.sellerId;
  const isPharmacy = listing.categoryKey === "pharmacyOnDuty";
  const isJobs = listing.categoryKey === "jobs";
  const duty = isPharmacy ? getDutyLabel(listing, language, t) : null;
  // null when the seller gave no price: nothing is printed rather than a
  // formatted zero.
  const price = listingPrice(listing, t, language);
  const priceText = listingPriceText(listing, t, language);
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const handleShare = async () => {
    try {
      const message = isPharmacy
        ? t("shareDutyPharmacyMessage", { title, phone: listing.phone ?? "" })
        : isJobs
          ? t("shareJobMessage", { title, company: listing.company ?? "" })
          : priceText
            ? t("shareListingMessage", { title, price: priceText })
            : t("shareListingMessageNoPrice", { title });
      // A pharmacy on duty comes from the roster, not from listings, so it
      // has no page to link to — withListingLink returns the sentence alone.
      await Share.share({ message: withListingLink(message, listing) });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const handleChat = () => {
    openChat({ listing, listingTitle: title, user, navigation, t });
  };

  return (
    <Card
      flush={flush}
      full={full}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => openListing(navigation, listing, t, language)}
    >
      <CardInner flush={flush}>
        <Thumbnail flush={flush} full={full}>
          {/* Everything, including video, goes through one component.
              This used to branch: a video cover got a private player that
              never called play(), so it sat on its first frame under a play
              badge — a still with a button over it that did nothing when
              tapped. ListingMedia plays it, muted and looping, and shows the
              rest of the seller's photographs on the same swipe. */}
          <ListingMedia listing={listing} size="card" />
          {isPromotionLive(listing) ? (
            <PromotedBadge>
              <PromotedBadgeLabel>{t("sponsoredLabel")}</PromotedBadgeLabel>
            </PromotedBadge>
          ) : listing.popular ? (
            <PopularBadge>
              <Ionicons name="flame" size={13} color={colors.accentDark} />
            </PopularBadge>
          ) : null}
          {onToggleFavorite ? (
            <FavButton onPress={onToggleFavorite} hitSlop={10}>
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={15}
                color={isFavorite ? colors.error : colors.textInverse}
              />
            </FavButton>
          ) : null}
          {/* Icon plus word. The icon alone was a shape you had to already
              know to read; a wall of cards is scanned by its words. */}
          <CategoryBadge>
            <Ionicons
              name={categoryIcon}
              size={12}
              color={colors.textInverse}
            />
            {badgeLabel ? (
              <CategoryBadgeLabel numberOfLines={1}>
                {badgeLabel}
              </CategoryBadgeLabel>
            ) : null}
          </CategoryBadge>
          {listing.saleStatus && listing.saleStatus !== "available" ? (
            <SaleStatusBadge saleStatus={listing.saleStatus}>
              <SaleStatusBadgeLabel>
                {t(saleStatusLabelKey(listing.categoryKey, listing.saleStatus))}
              </SaleStatusBadgeLabel>
            </SaleStatusBadge>
          ) : null}
        </Thumbnail>
        <Details flush={flush}>
          <PriceRow>
            {isPharmacy ? (
              <DutyBadge>
                <Ionicons
                  name="time-outline"
                  size={13}
                  color={duty.isStale ? colors.accentDark : colors.error}
                />
                <DutyBadgeLabel stale={duty.isStale} numberOfLines={2}>
                  {duty.text}
                </DutyBadgeLabel>
              </DutyBadge>
            ) : isJobs ? (
              <DutyBadge>
                <Ionicons
                  name="business-outline"
                  size={13}
                  color={colors.textMuted}
                />
                <CompanyLabel numberOfLines={1}>{listing.company}</CompanyLabel>
              </DutyBadge>
            ) : price?.kind === "amount" ? (
              <PriceGroup>
                <PriceAmount>{price.amount}</PriceAmount>
                {/* A rental in the grid read as an outright price. The
                    suffix is what separates 150 000 a month from 150 000
                    for the house. */}
                <PriceCurrency>{price.suffix}</PriceCurrency>
              </PriceGroup>
            ) : price ? (
              // Sur devis, in the muted weight — it is an answer, not an
              // amount, and setting it in the price face would make the eye
              // read it as one.
              <PriceWords numberOfLines={1}>{price.text}</PriceWords>
            ) : (
              // Nothing at all. A restaurant, a community notice and a job
              // never had a price to show, and the row simply closes up —
              // the share and chat buttons keep their place because the row
              // is spaced from its ends, not from this child.
              <PriceSpacer />
            )}
            <IconButtonRow>
              {isOwner ? null : (
                <ChatIconButton onPress={handleChat} hitSlop={8}>
                  <Ionicons
                    name="chatbubble-ellipses"
                    size={14}
                    color={colors.textInverse}
                  />
                </ChatIconButton>
              )}
              <ShareIconButton onPress={handleShare} hitSlop={8}>
                <Ionicons
                  name="share-social-outline"
                  size={16}
                  color={colors.textMuted}
                />
              </ShareIconButton>
            </IconButtonRow>
          </PriceRow>
          <Title numberOfLines={2}>{title}</Title>
          <CityRow>
            <Ionicons
              name="location-outline"
              size={13}
              color={colors.textMuted}
            />
            <City>{listing.city}</City>
          </CityRow>
        </Details>
      </CardInner>
    </Card>
  );
}

// How much of the row a `flush` card takes. Two of them plus the 2px gutter
// fill the grid, which is where the odd-looking 0.496 comes from.
//
// Exported because the horizontal rails on Pour vous cannot use a
// percentage — their parent is the scroll content, not the screen — so they
// multiply this by the window width instead. It was written down twice
// before, as "49.6%" here and a flat 168px there, and the two drifted: the
// same listing was 190px in the grid and 168px in the rail directly above
// it. One number, one place.
export const FLUSH_CARD_WIDTH_RATIO = 0.496;

const Card = styled(Animated.createAnimatedComponent(Pressable))`
  width: ${(props) =>
    props.full
      ? "100%"
      : props.flush
        ? `${FLUSH_CARD_WIDTH_RATIO * 100}%`
        : "47%"};
  border-radius: ${(props) => (props.flush ? 0 : radius.xl)}px;
  margin-bottom: ${(props) => (props.flush ? 2 : spacing.lg)}px;
  background-color: ${(props) => props.theme.surface};
  /* The shadow goes with the rounding. Square cards two pixels apart read
     as one sheet, and a drop shadow in that gap turns the seam into a
     smudge — so the flush variant separates with a hairline border and its
     own surface colour instead of with depth. */
  ${(props) =>
    props.flush
      ? `border-width: 1px; border-color: ${props.theme.border};`
      : `shadow-color: #000000;
         shadow-offset: 0px 3px;
         shadow-opacity: 0.16;
         shadow-radius: 8px;
         elevation: 5;`}
`;

const CardInner = styled.View`
  border-radius: ${(props) => (props.flush ? 0 : radius.xl)}px;
  overflow: hidden;
`;

const Thumbnail = styled.View`
  /* Square rather than 4:3 landscape, which left a third of the card to
     text. On Marketplace the photograph is the listing and the words are a
     caption under it.

     Except at full width, where square is wrong: a 1:1 photograph across the
     whole screen is as tall as the screen is wide, and the card stops being a
     card. 16:9 keeps a lone listing prominent without it filling the view. */
  aspect-ratio: ${(props) =>
    props.full ? "16 / 9" : props.flush ? "1 / 1" : "4 / 3"};
  background-color: ${(props) => props.theme.surfaceAlt};
`;



const PopularBadge = styled.View`
  position: absolute;
  bottom: ${spacing.sm}px;
  left: ${spacing.sm}px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background-color: ${(props) => props.theme.accentLight};
  align-items: center;
  justify-content: center;
`;

const PromotedBadge = styled.View`
  position: absolute;
  bottom: ${spacing.sm}px;
  left: ${spacing.sm}px;
  background-color: ${(props) => props.theme.accent};
  border-radius: ${radius.pill}px;
  padding-horizontal: 7px;
  padding-vertical: 3px;
`;

const PromotedBadgeLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 9.5px;
  color: ${(props) => props.theme.accentDark};
`;

const FavButton = styled(Pressable)`
  position: absolute;
  top: ${spacing.sm}px;
  right: ${spacing.sm}px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.28);
  z-index: 10;
  elevation: 10;
`;

// Top-left, which is where the eye lands first on a card and so where the
// word saying what the thing IS belongs.
//
// Not the right: the badge is as wide as its word, and on the right it grew
// towards the favourite heart and collided with it. Sponsorisé and the
// popular flame moved down to the corner this vacated — they are the rarer
// marks, and neither is what somebody is scanning a grid for.
const CategoryBadge = styled.View`
  position: absolute;
  top: ${spacing.sm}px;
  left: ${spacing.sm}px;
  max-width: 82%;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.scrim};
`;

const CategoryBadgeLabel = styled.Text`
  flex-shrink: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => props.theme.textInverse};
`;

const SaleStatusBadge = styled.View`
  position: absolute;
  bottom: ${spacing.sm}px;
  left: ${spacing.sm}px;
  background-color: ${(props) => saleStatusTint(props.theme)[props.saleStatus]};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 3px;
`;

const SaleStatusBadgeLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
  font-size: 11px;
`;

const Details = styled.View`
  padding: ${(props) => (props.flush ? "6px 8px 9px" : "10px 12px 12px")};
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const IconButtonRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const ShareIconButton = styled(Pressable)`
  padding: 2px;
`;

// Filled, colored — unlike the plain share icon, this is the primary way to
// reach the seller from the grid, so it needs to read as a real button, not
// just another muted glyph a buyer would skim past.
const ChatIconButton = styled(Pressable)`
  width: 24px;
  height: 24px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primary};
`;

// Takes the space the amount would have had, so the share and chat buttons
// stay pinned to the right of a row laid out with space-between.
const PriceSpacer = styled.View`
  flex: 1;
`;

const PriceWords = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.textMuted};
`;

const PriceGroup = styled.View`
  flex-direction: row;
  align-items: baseline;
`;

const DutyBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 1;
`;

const DutyBadgeLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.stale ? props.theme.accentDark : props.theme.error)};
`;

const CompanyLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  flex-shrink: 1;
`;

const PriceAmount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  line-height: 18px;
  color: ${(props) => props.theme.text};
`;

const PriceCurrency = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const Title = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  line-height: 17px;
  color: ${(props) => props.theme.text};
  margin-top: 4px;
`;

const CityRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 2px;
  margin-top: ${spacing.xs}px;
`;

const City = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 10.5px;
  line-height: 14px;
  color: ${(props) => props.theme.textMuted};
`;

// Memoised, because this is the component every list in the app renders and
// none of them were memoising it.
//
// The cost it removes is specific: a browse screen re-renders on every
// keystroke in its search field, every filter chip, every arriving page and —
// on ForYou — every tick of the five-minute interval that re-evaluates the
// sold-listing cutoff. Each of those rebuilt every visible card and every
// styled-component inside it, for data that had not changed.
//
// The comparison is written out rather than left to the default shallow one
// for one reason: `onToggleFavorite` is an inline arrow at most call sites,
// so it is a new function identity on every parent render and the default
// comparison would never match. Comparing the listing by identity and the two
// booleans by value is what makes the memo actually hold.
//
// `listing` is compared by reference, which is correct here: the objects come
// from a Firestore snapshot and are rebuilt only when the document changes.
export const ListingCard = memo(ListingCardBase, (prev, next) => {
  return (
    prev.listing === next.listing &&
    prev.isFavorite === next.isFavorite &&
    prev.flush === next.flush &&
    prev.style === next.style
  );
});
