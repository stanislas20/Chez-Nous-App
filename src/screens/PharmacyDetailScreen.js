import { Linking, Platform, Pressable, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Circle } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { cityCoordinates } from "../data/cityCoordinates";
import { getDutyLabel } from "../utils/pharmacyDuty";
import { splitPhoneNumbers } from "../components/PhoneCallButtons";

const EMERALD = "#0B6E4F";
const GOLD = "#8a6415";

// The screen someone opens at 2am needing a fact: a phone number, whether
// the pharmacy is on duty, and roughly where it is. Rounded cards matching
// the rest of the app — an earlier pass used square corners and corner
// brackets to feel "official" and simply read as unfinished.
export function PharmacyDetailScreen({ route, navigation }) {
  const { listing } = route.params ?? {};
  const { colors } = useTheme();
  const { language, t } = useI18n();

  const title = language === "en" ? listing.titleEn : listing.titleFr;
  const duty = getDutyLabel(listing, language, t);
  const numbers = splitPhoneNumbers(listing.phone);
  const coords = {
    latitude: listing.latitude ?? cityCoordinates[listing.city]?.latitude,
    longitude: listing.longitude ?? cityCoordinates[listing.city]?.longitude,
  };
  const hasCoords = coords.latitude != null && coords.longitude != null;

  const call = (number) => {
    if (Platform.OS !== "android") {
      Linking.openURL(`tel:${number}`);
      return;
    }
    Linking.openURL(`tel:${number}`);
  };

  const openDirections = () => {
    const destination = hasCoords
      ? `${coords.latitude},${coords.longitude}`
      : encodeURIComponent(`${title} ${listing.city} Bénin`);
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    );
  };

  const share = () => {
    Share.share({
      message: `${title} — ${duty.text} · ${listing.city}${
        numbers.length ? `\n${numbers.join(" / ")}` : ""
      }`,
    });
  };

  const specs = [
    { key: "type", value: t("pharmacyDetailTypeValue") },
    { key: "locality", value: listing.city },
    { key: "duty", value: duty.text },
    { key: "source", value: t("pharmacyDetailSourceValue") },
  ];

  return (
    <Container edges={["top", "left", "right", "bottom"]}>
      <Header>
        <HeaderButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </HeaderButton>
        <HeaderTitle numberOfLines={1}>{t("pharmacyDetailTitle")}</HeaderTitle>
        <HeaderButton onPress={share} hitSlop={8}>
          <Ionicons name="share-social-outline" size={18} color={colors.text} />
        </HeaderButton>
      </Header>

      <Body
        showsVerticalScrollIndicator={false}
        contentContainerStyle={bodyContentStyle}
      >
        {/* Corner brackets rather than a rounded card — the plate reads as a
            stamped record, and the duty state is the first thing on it. */}
        <Plate stale={duty.isStale}>
          <PlateTopRow>
            <DutyTag stale={duty.isStale}>
              <DutyDot />
              <DutyTagLabel>
                {t(
                  duty.isStale
                    ? "pharmacyDetailToConfirm"
                    : "pharmacyDetailOnDuty",
                )}
              </DutyTagLabel>
            </DutyTag>
          </PlateTopRow>
          <PlateName>{title}</PlateName>
          <PlateSubRow>
            <Ionicons
              name="location-outline"
              size={12}
              color={colors.textMuted}
            />
            <PlateSubText numberOfLines={1}>
              {listing.city}
              {duty.text ? ` · ${duty.text}` : ""}
            </PlateSubText>
          </PlateSubRow>
        </Plate>

        {numbers.length > 0 ? (
          <>
            <SectionLabel>{t("pharmacyDetailCallFirst")}</SectionLabel>
            <Box>
              {numbers.map((number, index) => (
                <PhoneRow
                  key={number}
                  first={index === 0}
                  onPress={() => call(number)}
                >
                  <PhoneIndex>{String(index + 1).padStart(2, "0")}</PhoneIndex>
                  <PhoneCol>
                    <PhoneNumber>{number}</PhoneNumber>
                    <PhoneLabel>
                      {t(
                        index === 0
                          ? "pharmacyDetailMainLine"
                          : "pharmacyDetailOtherLine",
                      )}
                    </PhoneLabel>
                  </PhoneCol>
                  <PhoneCallSquare>
                    <Ionicons name="call" size={15} color="#ffffff" />
                  </PhoneCallSquare>
                </PhoneRow>
              ))}
            </Box>

            {/* The single most important sentence on the screen: rosters
                change without notice, so a phone call is the only real
                confirmation. */}
            <ConfirmNote>
              <Ionicons name="time-outline" size={14} color={GOLD} />
              <ConfirmNoteText>
                {t("pharmacyDetailConfirmNote")}
              </ConfirmNoteText>
            </ConfirmNote>
          </>
        ) : null}

        <SectionLabel>{t("pharmacyDetailInformation")}</SectionLabel>
        <Box>
          {specs.map((spec, index) => (
            <SpecRow key={spec.key} first={index === 0}>
              <SpecKey>{t(`pharmacyDetailSpec_${spec.key}`)}</SpecKey>
              <SpecValue numberOfLines={2}>{spec.value}</SpecValue>
            </SpecRow>
          ))}
        </Box>

        <SectionLabel>{t("pharmacyDetailLocation")}</SectionLabel>
        {/* A circle, not a pin. The stored coordinates come from the city,
            not the pharmacy's address, so a needle-point marker would claim
            a precision we don't have — it would send someone to a spot that
            is merely the centre of town. The circle says "somewhere in
            here", which is what we actually know. */}
        <MapBox onPress={openDirections}>
          {hasCoords ? (
            <MapView
              style={mapStyle}
              initialRegion={{
                ...coords,
                latitudeDelta: 0.06,
                longitudeDelta: 0.06,
              }}
              pointerEvents="none"
              liteMode
            >
              <Circle
                center={coords}
                radius={1200}
                strokeColor={EMERALD}
                strokeWidth={1.5}
                fillColor="rgba(11, 110, 79, 0.14)"
              />
            </MapView>
          ) : (
            <MapFallback>
              <Ionicons name="map-outline" size={26} color={colors.textMuted} />
              <MapFallbackLabel>{t("pharmacyDetailNoMap")}</MapFallbackLabel>
            </MapFallback>
          )}
          <MapTag>
            <MapTagLabel>{t("pharmacyDetailApproximate")}</MapTagLabel>
          </MapTag>
        </MapBox>
        <OutlineButton onPress={openDirections}>
          <Ionicons name="navigate-outline" size={14} color={EMERALD} />
          <OutlineButtonLabel>{t("getDirectionsButton")}</OutlineButtonLabel>
        </OutlineButton>

        <SectionLabel>{t("pharmacyDetailOfficialSource")}</SectionLabel>
        <AuthCard>
          <AuthMark>
            <AuthMarkLabel numberOfLines={1}>ONPB</AuthMarkLabel>
          </AuthMark>
          <AuthCol>
            <AuthName>{t("pharmacyDetailAuthorityName")}</AuthName>
            <AuthSub>{t("pharmacyDetailAuthoritySub")}</AuthSub>
          </AuthCol>
        </AuthCard>

        <SafetyBox>
          <SafetyTitle>{t("pharmacyDetailGoodToKnow")}</SafetyTitle>
          {["prescription", "noPayment", "emergency"].map((key) => (
            <SafetyRow key={key}>
              <SafetyDash>—</SafetyDash>
              <SafetyText>{t(`pharmacyDetailTip_${key}`)}</SafetyText>
            </SafetyRow>
          ))}
        </SafetyBox>
      </Body>

      <Dock>
        <DockDirections onPress={openDirections}>
          <Ionicons name="navigate-outline" size={14} color={EMERALD} />
          <DockDirectionsLabel>
            {t("pharmacyDetailDirectionsShort")}
          </DockDirectionsLabel>
        </DockDirections>
        {numbers.length > 0 ? (
          <DockCall onPress={() => call(numbers[0])}>
            <Ionicons name="call" size={17} color="#ffffff" />
            <DockCallLabel>{t("pharmacyDetailCallPharmacy")}</DockCallLabel>
          </DockCall>
        ) : null}
      </Dock>
    </Container>
  );
}

const bodyContentStyle = { padding: spacing.md, paddingBottom: spacing.xl };
const mapStyle = { flex: 1 };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const HeaderButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const Body = styled.ScrollView`
  flex: 1;
`;

const Plate = styled.View`
  padding: 17px;
  border-radius: ${radius.lg}px;
  border-width: 1.5px;
  border-color: ${(props) => (props.stale ? GOLD : EMERALD)};
  background-color: ${(props) => props.theme.primaryLight};
  margin-bottom: ${spacing.lg}px;
`;

const PlateTopRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 11px;
`;

const DutyTag = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.stale ? GOLD : EMERALD)};
`;

const DutyDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: #ffffff;
`;

const DutyTagLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 1.4px;
  color: #ffffff;
`;

const PlateName = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 20px;
  line-height: 25px;
  color: ${(props) => props.theme.text};
  margin-bottom: 7px;
`;

const PlateSubRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
`;

const PlateSubText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  letter-spacing: 1.5px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: 10px;
`;

const Box = styled.View`
  border-radius: ${radius.lg}px;
  overflow: hidden;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
  margin-bottom: ${spacing.md}px;
`;

const PhoneRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 13px 14px;
  border-top-width: ${(props) => (props.first ? "0px" : "1px")};
  border-top-color: ${(props) => props.theme.border};
`;

const PhoneIndex = styled.Text`
  width: 16px;
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 1px;
  color: ${(props) => props.theme.border};
`;

const PhoneCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const PhoneNumber = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  letter-spacing: 0.4px;
  color: ${(props) => props.theme.text};
`;

const PhoneLabel = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const PhoneCallSquare = styled.View`
  width: 36px;
  height: 36px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${EMERALD};
`;

const ConfirmNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: ${radius.lg}px;
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.4);
  background-color: rgba(217, 164, 65, 0.12);
  margin-bottom: ${spacing.lg}px;
`;

const ConfirmNoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  line-height: 17px;
  color: ${GOLD};
`;

const SpecRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 15px;
  border-top-width: ${(props) => (props.first ? "0px" : "1px")};
  border-top-color: ${(props) => props.theme.border};
`;

const SpecKey = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const SpecValue = styled.Text`
  flex: 1;
  text-align: right;
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const MapBox = styled(Pressable)`
  position: relative;
  height: 152px;
  border-radius: ${radius.lg}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.sm}px;
  overflow: hidden;
`;

const MapFallback = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
`;

const MapFallbackLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const MapTag = styled.View`
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: rgba(255, 255, 255, 0.92);
`;

const MapTagLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 1px;
  color: #4d4d4f;
`;

const OutlineButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 14px;
  border-radius: ${radius.lg}px;
  border-width: 1.5px;
  border-color: ${EMERALD};
  margin-bottom: ${spacing.lg}px;
`;

const OutlineButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const AuthCard = styled.View`
  flex-direction: row;
  border-radius: ${radius.lg}px;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 14px 15px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
  margin-bottom: ${spacing.lg}px;
`;

// Wide enough for "ONPB" on one line — at 40px square the four caps wrapped.
const AuthMark = styled.View`
  width: 54px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${EMERALD};
`;

const AuthMarkLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12.5px;
  letter-spacing: 0.3px;
  color: #ffffff;
`;

const AuthCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const AuthName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const AuthSub = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const SafetyBox = styled.View`
  padding: 15px;
  border-radius: ${radius.lg}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const SafetyTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  margin-bottom: 8px;
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
  padding: ${spacing.sm}px ${spacing.md}px 0;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const DockDirections = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 118px;
  padding: 16px 8px;
  border-radius: ${radius.lg}px;
  border-width: 1.5px;
  border-color: ${EMERALD};
`;

const DockDirectionsLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const DockCall = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 8px;
  border-radius: ${radius.lg}px;
  background-color: ${EMERALD};
`;

const DockCallLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: #ffffff;
`;
