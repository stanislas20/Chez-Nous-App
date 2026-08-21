import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { PinchGestureHandler, State } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import {
  getPropertyTypeLabel,
  getRealEstateDealGlyph,
  getRealEstateDealLabel,
} from "../data/realEstate";
import { buildLinkUrl } from "../data/restaurantLinks";
import { openChat } from "../utils/openChat";
import { useAuth } from "../auth/AuthContext";
import { buildPropertyView } from "./RealEstateScreen";

const EMERALD = "#0B6E4F";
const AMBER_TEXT = "#8A6415";
const WINDOW = Dimensions.get("window");
const HERO_TINT = ["rgba(11, 110, 79, 0.14)", "rgba(217, 164, 65, 0.18)"];

const priceFormatter = new Intl.NumberFormat("fr-FR");
const fcfa = (value) => priceFormatter.format(Math.round(Number(value) || 0));
const scrollContentStyle = { padding: spacing.md, paddingBottom: spacing.xl };

// Pinch-to-zoom without pulling in a gesture/animation library: the
// legacy PinchGestureHandler drives a plain Animated.Value, and the scale
// springs back on release so the pager underneath stays usable.
function ZoomableImage({ uri }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPinch = Animated.event([{ nativeEvent: { scale } }], { useNativeDriver: true });

  const onStateChange = (event) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  return (
    <PinchGestureHandler onGestureEvent={onPinch} onHandlerStateChange={onStateChange}>
      <Animated.Image
        source={{ uri }}
        resizeMode="contain"
        style={{ width: WINDOW.width, height: WINDOW.height * 0.8, transform: [{ scale }] }}
      />
    </PinchGestureHandler>
  );
}

export function RealEstateDetailScreen({ route, navigation }) {
  const { listing } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const { user } = useAuth();
  // Your own listing offers no contact actions: openChat would build a
  // conversation whose two participants are the same person, and the phone
  // sheet would offer to ring yourself.
  const isOwner = Boolean(user?.uid && listing.sellerId && user.uid === listing.sellerId);
  const [contactOpen, setContactOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  // Matches ProductDetailScreen: the slide is full-bleed and its height
  // comes from the first photo's real aspect ratio, so the primary photo
  // shows with no cropping instead of being forced into a fixed box.
  const [galleryRatio, setGalleryRatio] = useState(4 / 3);
  // Clamped, unlike ProductDetail: a phone screenshot is about 9:19.5, and
  // honouring that literally would make one photo more than two screens
  // tall to scroll past.
  const slideHeight = Math.min(windowWidth / galleryRatio, WINDOW.height * 0.62);

  const view = buildPropertyView(listing, language, t);

  const phone = listing.phone ?? listing.sellerPhone ?? null;
  const isLand = view.deal === "land";
  const isRent = view.deal === "rent";
  // See RealEstateScreen: the field is `media`, not `photoUrls`.
  const media = (listing.media ?? []).filter((item) => item.mediaUrl);
  const cover = listing.mediaUrl ?? media[0]?.mediaUrl ?? null;

  // Measure the cover so the frame takes the photo's own proportions,
  // exactly as ProductDetailScreen does. Without this the ratio stays at
  // the 4:3 default and every photo gets the same box back again.
  useEffect(() => {
    if (!cover) return undefined;
    let active = true;
    Image.getSize(
      cover,
      (w, h) => {
        if (active && h > 0) setGalleryRatio(w / h);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [cover]);

  // Every fact the poster actually gave, as a table rather than prose —
  // this is the screen where someone compares two properties line by line.
  const specs = [
    {
      key: "type",
      label: t("realEstateSpecType"),
      value: getRealEstateDealLabel(view.deal, language),
    },
    listing.propertyType && !isLand
      ? {
          key: "propertyType",
          label: t("realEstateSpecPropertyType"),
          value: getPropertyTypeLabel(listing.propertyType, language),
        }
      : null,
    listing.rooms && !isLand
      ? { key: "rooms", label: t("realEstateSpecRooms"), value: String(listing.rooms) }
      : null,
    listing.bathrooms && !isLand
      ? { key: "bathrooms", label: t("realEstateSpecBathrooms"), value: String(listing.bathrooms) }
      : null,
    listing.surface
      ? { key: "surface", label: t("realEstateSpecSurface"), value: `${listing.surface} m²` }
      : null,
    isLand
      ? {
          key: "lotti",
          label: t("realEstateSpecLotti"),
          value: listing.isLotti ? t("realEstateLotti") : t("realEstateNotLotti"),
        }
      : null,
    isRent
      ? { key: "rent", label: t("realEstateSpecRent"), value: `${fcfa(listing.price)} FCFA` }
      : null,
    isRent && Number.isFinite(Number(listing.avanceMonths))
      ? {
          key: "avance",
          label: t("realEstateSpecAvance"),
          value: t("realEstateMonths", { count: Number(listing.avanceMonths) }),
        }
      : null,
    isRent && Number.isFinite(Number(listing.depositMonths))
      ? {
          key: "caution",
          label: t("realEstateSpecCaution"),
          value: t("realEstateMonths", { count: Number(listing.depositMonths) }),
        }
      : null,
    // The line the whole rental screen exists to surface, repeated here in
    // full rather than left as a headline the reader has to trust.
    isRent && view.headlineUnit === t("realEstateUnitMoveIn")
      ? {
          key: "moveIn",
          label: t("realEstateSpecMoveIn"),
          value: `${view.headline} FCFA`,
          strong: true,
        }
      : null,
    view.document
      ? {
          key: "document",
          label: t("realEstateSpecDocument"),
          value:
            view.document.labelFr && language === "en"
              ? view.document.labelEn
              : view.document.labelFr,
        }
      : null,
    view.place ? { key: "place", label: t("realEstateSpecPlace"), value: view.place } : null,
  ].filter(Boolean);

  return (
    <Container edges={["top", "left", "right", "bottom"]}>
      <Header>
        <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="chevron-left" size={21} color={colors.text} />
        </BackButton>
        <HeaderTitle numberOfLines={1}>{t("realEstateDetailTitle")}</HeaderTitle>
      </Header>

      <ScrollView contentContainerStyle={scrollContentStyle} showsVerticalScrollIndicator={false}>
        {media.length > 1 ? (
          // Swipeable, because a property is judged on more than one room.
          <GalleryWrap style={{ width: windowWidth, height: slideHeight }}>
            <FlatList
              data={media}
              keyExtractor={(item, index) => `${item.mediaUrl}-${index}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) =>
                setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / windowWidth))
              }
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => {
                    setViewerIndex(index);
                    setViewerOpen(true);
                  }}
                >
                  <GalleryPhoto
                    style={{ width: windowWidth, height: slideHeight }}
                    source={{ uri: item.mediaUrl }}
                    resizeMode="contain"
                  />
                </Pressable>
              )}
            />
            {/* Nothing about a photo says it is tappable, so the
                affordance has to be stated. */}
            <GalleryHint>
              <Feather name="maximize-2" size={11} color="#ffffff" />
              <GalleryHintLabel>{t("realEstateTapToEnlarge")}</GalleryHintLabel>
            </GalleryHint>
            <GalleryCounter>
              {photoIndex + 1} / {media.length}
            </GalleryCounter>
          </GalleryWrap>
        ) : (
          <Hero
            colors={HERO_TINT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={cover ? { width: windowWidth, height: slideHeight } : undefined}
          >
            {cover ? (
              <Pressable
                onPress={() => setViewerIndex(0)}
                style={{ width: "100%", height: "100%" }}
              >
                <HeroPhoto source={{ uri: cover }} resizeMode="contain" />
              </Pressable>
            ) : (
              <HeroGlyph>{getRealEstateDealGlyph(view.deal)}</HeroGlyph>
            )}
            {cover ? (
              <GalleryHint>
                <Feather name="maximize-2" size={11} color="#ffffff" />
                <GalleryHintLabel>{t("realEstateTapToEnlarge")}</GalleryHintLabel>
              </GalleryHint>
            ) : null}
          </Hero>
        )}

        <HeadlineRow>
          <Headline>{view.headline}</Headline>
          <HeadlineUnit>{view.headlineUnit}</HeadlineUnit>
        </HeadlineRow>
        {view.subPrice ? <SubPrice>{view.subPrice}</SubPrice> : null}
        <Title>{listing.title}</Title>

        <BadgeRow>
          {view.document ? (
            <DocBadge tint={view.tier.color}>
              <Feather name={view.document.feather} size={11} color={view.tier.color} />
              <DocBadgeLabel tint={view.tier.color}>{view.documentBadge}</DocBadgeLabel>
            </DocBadge>
          ) : null}
          {view.listerLabel ? (
            <ListerBadge verified={view.isVerifiedLister}>
              {view.isVerifiedLister ? (
                <Feather name="check-circle" size={11} color={EMERALD} />
              ) : null}
              <ListerBadgeLabel verified={view.isVerifiedLister}>
                {view.listerLabel}
              </ListerBadgeLabel>
            </ListerBadge>
          ) : null}
        </BadgeRow>

        {listing.sellerId ? (
          <AdvertiserRow
            onPress={() =>
              navigation.navigate("SellerProfile", {
                sellerId: listing.sellerId,
                sellerName: listing.sellerName ?? "",
                memberSince: listing.sellerMemberSince ?? null,
                sellerVerified: !!listing.sellerVerified,
                sellerSector: null,
                sellerCity: listing.city ?? null,
                sellerPhotoUrl: null,
                sellerPhone: listing.phone ?? null,
              })
            }
          >
            <AdvertiserAvatar>
              <AdvertiserInitial>
                {(listing.sellerName ?? "?").trim().charAt(0).toUpperCase()}
              </AdvertiserInitial>
            </AdvertiserAvatar>
            <AdvertiserCol>
              <AdvertiserName numberOfLines={1}>{listing.sellerName}</AdvertiserName>
              <AdvertiserMeta>{view.listerLabel ?? t("realEstateSpecPlace")}</AdvertiserMeta>
            </AdvertiserCol>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </AdvertiserRow>
        ) : null}

        <SectionLabel>{t("realEstateSectionSpecs")}</SectionLabel>
        <SpecBox>
          {specs.map((spec, index) => (
            <SpecRow key={spec.key} first={index === 0}>
              <SpecKey>{spec.label}</SpecKey>
              <SpecValue strong={spec.strong}>{spec.value}</SpecValue>
            </SpecRow>
          ))}
        </SpecBox>

        {/* Shown for every land listing that declares a document, whatever
            the tier — a Titre Foncier is still worth verifying, and saying
            so only for the weak tiers would read as endorsing the strong
            one. */}
        {view.document ? (
          <WarnBox>
            <Feather name="shield" size={15} color={AMBER_TEXT} />
            <WarnText>{`${view.documentNote}. ${t("realEstateVerifyDocument")}`}</WarnText>
          </WarnBox>
        ) : null}

        {listing.description ? (
          <>
            <SectionLabel>{t("realEstateSectionDescription")}</SectionLabel>
            <Description>{listing.description}</Description>
          </>
        ) : null}

        <SafetyBox>
          <SafetyTitle>{t("realEstateSafetyTitle")}</SafetyTitle>
          <SafetyRow>
            <SafetyDash>—</SafetyDash>
            <SafetyText>{t("realEstateSafetyVisit")}</SafetyText>
          </SafetyRow>
          <SafetyRow>
            <SafetyDash>—</SafetyDash>
            <SafetyText>{t("realEstateSafetyReceipt")}</SafetyText>
          </SafetyRow>
          <SafetyRow>
            <SafetyDash>—</SafetyDash>
            <SafetyText>{t("realEstateSafetyNoPayment")}</SafetyText>
          </SafetyRow>
        </SafetyBox>
      </ScrollView>

      {isOwner ? (
        <Dock>
          <OwnerNotice>
            <Feather name="info" size={14} color={EMERALD} />
            <OwnerNoticeLabel>{t("realEstateOwnerNotice")}</OwnerNoticeLabel>
          </OwnerNotice>
        </Dock>
      ) : (
        <Dock>
          {/* Two channels, deliberately. A call is what most people here
            actually do, but it leaves no record for either side and
            nothing moderation can look at; the in-app thread does both,
            and it is the only one that works when the advertiser has
            published no number. */}
          <MessageButton
            onPress={() => openChat({ listing, listingTitle: listing.title, user, navigation, t })}
          >
            <Feather name="message-circle" size={17} color={EMERALD} />
            <MessageLabel>{t("realEstateMessageCta")}</MessageLabel>
          </MessageButton>
          <DockButton onPress={() => setContactOpen(true)}>
            <Feather name="phone" size={17} color="#ffffff" />
            <DockLabel>{t("callButtonLabel")}</DockLabel>
          </DockButton>
        </Dock>
      )}

      <Modal visible={viewerOpen} animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <Viewer>
          <FlatList
            data={media.length ? media : [{ mediaUrl: cover }]}
            keyExtractor={(item, index) => `${item.mediaUrl}-${index}`}
            horizontal
            pagingEnabled
            initialScrollIndex={viewerIndex}
            getItemLayout={(_, index) => ({
              length: WINDOW.width,
              offset: WINDOW.width * index,
              index,
            })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) =>
              setViewerIndex(Math.round(event.nativeEvent.contentOffset.x / WINDOW.width))
            }
            renderItem={({ item }) => (
              <ViewerPage>
                <ZoomableImage uri={item.mediaUrl} />
              </ViewerPage>
            )}
          />
          <ViewerClose onPress={() => setViewerOpen(false)} hitSlop={10}>
            <Feather name="x" size={22} color="#ffffff" />
          </ViewerClose>
          <ViewerHint>{t("realEstateZoomHint")}</ViewerHint>
        </Viewer>
      </Modal>

      <Modal
        visible={contactOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setContactOpen(false)}
      >
        <SheetBackdrop onPress={() => setContactOpen(false)}>
          <Sheet
            style={{ paddingBottom: insets.bottom + spacing.md }}
            onStartShouldSetResponder={() => true}
          >
            <SheetHandle />
            <SheetTitle>{t("realEstateContactTitle")}</SheetTitle>
            {phone ? (
              <>
                <ContactRow onPress={() => Linking.openURL(`tel:${phone}`)}>
                  <ContactIcon>
                    <Feather name="phone" size={16} color={EMERALD} />
                  </ContactIcon>
                  <ContactCol>
                    <ContactValue>{phone}</ContactValue>
                    <ContactHint>{t("realEstateContactCallHint")}</ContactHint>
                  </ContactCol>
                </ContactRow>
                {buildLinkUrl("whatsapp", phone) ? (
                  <ContactRow onPress={() => Linking.openURL(buildLinkUrl("whatsapp", phone))}>
                    <ContactIcon>
                      <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                    </ContactIcon>
                    <ContactCol>
                      <ContactValue>WhatsApp</ContactValue>
                      <ContactHint>{t("realEstateContactWhatsappHint")}</ContactHint>
                    </ContactCol>
                  </ContactRow>
                ) : null}
              </>
            ) : (
              <ContactHint>{t("realEstateContactNone")}</ContactHint>
            )}
            <WarnBox>
              <Feather name="shield" size={15} color={AMBER_TEXT} />
              <WarnText>{t("realEstateWarnPayment")}</WarnText>
            </WarnBox>
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

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const Hero = styled(LinearGradient)`
  height: 260px;
  overflow: hidden;
  margin: -${spacing.md}px -${spacing.md}px 0;
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.md}px;
`;

// Full-bleed: pulled out of the page padding so a photo runs edge to edge
// exactly as it does on the product screen.
const GalleryWrap = styled.View`
  overflow: hidden;
  margin: -${spacing.md}px -${spacing.md}px ${spacing.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const GalleryPhoto = styled.Image``;

const Viewer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  background-color: #000000;
`;

const ViewerPage = styled.View`
  width: ${WINDOW.width}px;
  height: ${WINDOW.height}px;
  align-items: center;
  justify-content: center;
`;

const ViewerClose = styled(Pressable)`
  position: absolute;
  top: 48px;
  right: 20px;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  background-color: rgba(255, 255, 255, 0.18);
`;

const ViewerHint = styled.Text`
  position: absolute;
  bottom: 42px;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
`;

const GalleryHint = styled.View`
  position: absolute;
  left: 10px;
  bottom: 10px;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: rgba(0, 0, 0, 0.55);
`;

const GalleryHintLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11px;
  color: #ffffff;
`;

const GalleryCounter = styled.Text`
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 4px 10px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  background-color: rgba(0, 0, 0, 0.55);
  color: #ffffff;
`;

const HeroGlyph = styled.Text`
  font-size: 52px;
`;

const HeroPhoto = styled.Image`
  width: 100%;
  height: 100%;
`;

const HeadlineRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px;
`;

const Headline = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 25px;
  letter-spacing: -0.5px;
  color: ${(props) => props.theme.text};
`;

const HeadlineUnit = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${EMERALD};
`;

const SubPrice = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  margin-top: 4px;
  color: ${(props) => props.theme.textMuted};
`;

const Title = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 16px;
  margin-top: 10px;
  color: ${(props) => props.theme.text};
`;

const BadgeRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
`;

const DocBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.tint};
`;

const DocBadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  color: ${(props) => props.tint};
`;

const ListerBadge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 6px 11px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.verified ? props.theme.primaryLight : props.theme.surfaceAlt};
`;

const ListerBadgeLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  color: ${(props) => (props.verified ? props.theme.primaryDark : props.theme.textMuted)};
`;

const AdvertiserRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border-radius: ${radius.lg}px;
  margin-top: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const AdvertiserAvatar = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${EMERALD};
`;

const AdvertiserInitial = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: #ffffff;
`;

const AdvertiserCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const AdvertiserName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const AdvertiserMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.4px;
  margin-top: ${spacing.lg}px;
  margin-bottom: 10px;
  color: ${(props) => props.theme.textMuted};
`;

const SpecBox = styled.View`
  padding: 4px 16px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SpecRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 0;
  border-top-width: ${(props) => (props.first ? 0 : 1)}px;
  border-top-color: ${(props) => props.theme.border};
`;

const SpecKey = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SpecValue = styled.Text`
  flex: 1;
  text-align: right;
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => (props.strong ? props.theme.primaryDark : props.theme.text)};
`;

const WarnBox = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 13px 14px;
  border-radius: ${radius.lg}px;
  margin-top: ${spacing.md}px;
  background-color: rgba(217, 164, 65, 0.09);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.4);
`;

const WarnText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${AMBER_TEXT};
`;

const Description = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 21px;
  color: ${(props) => props.theme.text};
`;

const SafetyBox = styled.View`
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  margin-top: ${spacing.lg}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SafetyTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12.5px;
  margin-bottom: 8px;
  color: ${(props) => props.theme.text};
`;

const SafetyRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
`;

const SafetyDash = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.border};
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const Dock = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  padding: 12px ${spacing.md}px ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const OwnerNotice = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 13px 14px;
  border-radius: 16px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const OwnerNoticeLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  line-height: 17px;
  color: ${(props) => props.theme.primaryDark};
`;

const MessageButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 16px 0;
  border-radius: 16px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${EMERALD};
`;

const MessageLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${EMERALD};
`;

const DockButton = styled(Pressable)`
  flex: 1.2;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: 16px;
  background-color: ${EMERALD};
`;

const DockLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: #ffffff;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.35);
`;

const Sheet = styled.View`
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
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  margin-bottom: ${spacing.sm}px;
  color: ${(props) => props.theme.text};
`;

const ContactRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  border-radius: ${radius.lg}px;
  margin-bottom: 10px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const ContactIcon = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primaryLight};
`;

const ContactCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const ContactValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const ContactHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;
