import { useMemo } from "react";
import { Linking, Pressable, ScrollView } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import MapView, { Circle } from "react-native-maps";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useApprovedListings } from "../hooks/useApprovedListings";
import { CAR_PARK_REGION, carParks, operatorsForPark } from "../data/carParks";
import { useDirectory } from "../hooks/useDirectory";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

const mapStyle = { width: "100%", height: 190 };

export function CarParksScreen({ navigation }) {
  const parks = useDirectory("carParks", carParks, { approvedOnly: true });
  const mapParks = parks.filter(
    (park) =>
      typeof park.latitude === "number" && typeof park.longitude === "number",
  );
  const { colors } = useTheme();
  const { t, language } = useI18n();

  const openLink = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };
  const insets = useSafeAreaInsets();
  const listings = useApprovedListings();

  // Counted from real listings, never declared. A park with nothing in it
  // shows no number at all rather than a zero or an invented figure.
  const counts = useMemo(() => {
    const tally = new Map();
    for (const item of listings ?? []) {
      if (item.categoryKey !== "vehicles" || !item.carPark) continue;
      tally.set(item.carPark, (tally.get(item.carPark) ?? 0) + 1);
    }
    return tally;
  }, [listings]);

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#0B6E4F", "#07362A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("carParksEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("carParksTitle")}</HeroTitle>
        <HeroCopy>{t("carParksIntro")}</HeroCopy>
      </Hero>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <MapCard>
          {/* The parks list used to be a constant, so its circles could
              never change under the map. Now that rows can arrive from
              Firestore it can, and mutating a Fabric map's children in
              place is exactly what crashed the restaurants map. Keying the
              map on the set of pins makes it remount wholesale instead of
              diffing children — a rare, cheap swap for a list that changes
              a handful of times a year.
              Parks with no coordinates are dropped rather than passed to a
              Circle as undefined: a submitter away from the park is allowed
              to send one without a pin. */}
          <MapView
            key={mapParks.map((park) => park.key).join("|")}
            style={mapStyle}
            region={CAR_PARK_REGION}
            liteMode
            pointerEvents="none"
          >
            {mapParks.map((park) => (
              <Circle
                key={park.key}
                center={{ latitude: park.latitude, longitude: park.longitude }}
                radius={1800}
                strokeColor="rgba(11, 110, 79, 0.85)"
                fillColor="rgba(11, 110, 79, 0.22)"
                strokeWidth={2}
              />
            ))}
          </MapView>
          <MapNote>{t("carParksMapNote")}</MapNote>
        </MapCard>

        {/* The directory is explicitly not a census — this is how the gap
            gets closed by the people who actually drive past them. */}
        <SuggestRow onPress={() => navigation.navigate("SubmitCarPark")}>
          <Ionicons name="add-circle-outline" size={17} color={EMERALD} />
          <SuggestLabel>{t("parkSubmitLink")}</SuggestLabel>
        </SuggestRow>

        {parks.map((park) => {
          const count = counts.get(park.key) ?? 0;
          const operators = operatorsForPark(park.key);
          return (
            <ParkCard
              key={park.key}
              // Always pressable, including with nothing published. Disabling
              // these made every card in the directory inert while the market
              // is still empty, which reads as broken. The destination
              // explains itself instead — see the empty state on CarsScreen.
              // Its own screen, like a marque or a deal — rather than
              // bouncing back to the browse screen carrying a filter.
              onPress={() =>
                navigation.navigate("VehicleList", { park: park.key })
              }
            >
              <ParkTop>
                <ParkPin>
                  <Ionicons name="location" size={16} color={EMERALD} />
                </ParkPin>
                <ParkCol>
                  <ParkName>{park.name}</ParkName>
                  <ParkCommune>{park.commune}</ParkCommune>
                </ParkCol>
                {count > 0 ? (
                  <ParkCount>{t("carsCount", { count })}</ParkCount>
                ) : null}
              </ParkTop>
              {/* The named businesses on that stretch, where one publishes
                  enough to be checked. Most parks here are informal and will
                  never appear — the note below says so. */}
              {operators.length ? (
                <OperatorBlock>
                  <OperatorLabel>{t("carParksOperators")}</OperatorLabel>
                  {operators.map((operator) => (
                    <OperatorRow key={operator.key}>
                      <OperatorName>{operator.name}</OperatorName>
                      <OperatorNote>
                        {language === "fr" ? operator.noteFr : operator.noteEn}
                      </OperatorNote>
                      {operator.website ? (
                        <OperatorLink
                          onPress={() => openLink(operator.website)}
                          hitSlop={6}
                        >
                          <Ionicons
                            name="open-outline"
                            size={12}
                            color={EMERALD}
                          />
                          <OperatorLinkLabel>
                            {t("carsDealershipWebsite")}
                          </OperatorLinkLabel>
                        </OperatorLink>
                      ) : null}
                    </OperatorRow>
                  ))}
                </OperatorBlock>
              ) : null}

              <ParkCta>
                <ParkCtaLabel>
                  {count > 0 ? t("carParksSeeVehicles") : t("carParksNoneYet")}
                </ParkCtaLabel>
                <Ionicons name="chevron-forward" size={15} color={EMERALD} />
              </ParkCta>
            </ParkCard>
          );
        })}

        {/* The scale of the thing, stated once. Five rows on this screen
            could otherwise read as five parks rather than five localities
            holding hundreds between them. */}
        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("carParksScale")}</NoteText>
        </Note>

        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("carParksOperatorsPartial")}</NoteText>
        </Note>

        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("carParksDisclaimer")}</NoteText>
        </Note>
      </ScrollView>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// Curved at the base like every other header in the app. Nothing straddles
// this one: what follows is the map, and the map is content to scroll
// through rather than a control to set. Lifting it onto the seam would mean
// pinning it out of the scroll, which costs a real thing to gain a shape.
const Hero = styled(LinearGradient)`
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
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
  line-height: 29px;
  color: #ffffff;
  margin-bottom: 6px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.72);
  max-width: 300px;
`;

const SuggestRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  padding: 13px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${radius.md}px;
  border-width: 1.5px;
  border-color: rgba(11, 110, 79, 0.4);
`;

const SuggestLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const MapCard = styled.View`
  border-radius: 22px;
  overflow: hidden;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const MapNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  padding: 11px 14px;
  color: ${(props) => props.theme.textMuted};
`;

const ParkCard = styled(Pressable)`
  padding: 16px;
  border-radius: 20px;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const ParkTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
`;

const ParkPin = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.1);
`;

const ParkCol = styled.View`
  flex: 1;
`;

const ParkName = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const ParkCommune = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const ParkCount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11.5px;
  color: ${EMERALD};
  background-color: rgba(11, 110, 79, 0.09);
  padding: 5px 10px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
`;

const ParkCta = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 12px;
  padding-top: 12px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const ParkCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${EMERALD};
`;

const OperatorBlock = styled.View`
  margin-top: 14px;
  padding-top: 13px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const OperatorLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 9.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-bottom: 9px;
  color: ${(props) => props.theme.textMuted};
`;

const OperatorRow = styled.View`
  margin-bottom: 11px;
`;

const OperatorName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const OperatorNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  margin-top: 3px;
  color: ${(props) => props.theme.textMuted};
`;

const OperatorLink = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
`;

const OperatorLinkLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${EMERALD};
`;

const Note = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  border-radius: 18px;
  margin-top: ${spacing.sm}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
`;

const NoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;
