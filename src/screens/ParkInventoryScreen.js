import { useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { useMyListings } from "../hooks/useMyListings";
import { firestore, storage } from "../config/firebase";
import { ensureCameraAccess } from "../utils/mediaAccess";
import { guessContentType } from "../utils/uploadContentType";
import { getListingExpiresAtTimestamp } from "../utils/listingLifecycle";
import { carParks, getCarPark } from "../data/carParks";
import { cityCoordinates } from "../data/cityCoordinates";
import {
  getVehicleFuelLabel,
  getVehicleSellerKindLabel,
  getVehicleTransmissionLabel,
  vehicleBrands,
  vehicleFuels,
  vehicleSellerKinds,
  vehicleTransmissions,
} from "../data/vehicles";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
// Ten, because that is the shot list a vehicle actually needs — front and
// rear three-quarter, both sides, interior front and rear, the dashboard
// with the odometer, engine bay, tyres, and the carte grise. At six a
// seller cannot show the two things buyers here ask for before travelling
// (odometer and papers) and still show the car. The old value was a
// scaffold default with nothing downstream enforcing it: storage.rules
// caps file size, never count.
const MAX_MEDIA_ITEMS = 10;
const TAB_BAR_CLEARANCE = 100;

// Only the seller kinds that actually keep stock on a park. A private owner
// selling one car does not need this screen — the ordinary form is shorter
// for them.
const STOCK_SELLER_KINDS = ["carPark", "reseller", "importer"];

// The commune each park sits in is also the city the listing is filed under,
// so the seller never types a location: standing in the park is the answer.
function cityForPark(parkKey) {
  const park = getCarPark(parkKey);
  if (!park) return null;
  return cityCoordinates[park.commune] ? park.commune : "Sèmè-Kpodji";
}

export function ParkInventoryScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const { user, sellerProfile } = useAuth();
  const myListings = useMyListings(user?.uid);

  // Shared across every vehicle added in this sitting. Entered once, which
  // is the entire point of the screen: a park operator publishing thirty
  // cars should type their stand and their number once, not thirty times.
  const [park, setPark] = useState(sellerProfile?.carParks?.[0] ?? null);
  const [sellerKind, setSellerKind] = useState(
    sellerProfile?.sellerKind ?? "carPark",
  );
  const [phone, setPhone] = useState(sellerProfile?.phone ?? "");

  // Cleared after each vehicle is published.
  const [assets, setAssets] = useState([]);
  const [brand, setBrand] = useState(null);
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [fuel, setFuel] = useState(null);
  const [transmission, setTransmission] = useState(null);
  const [price, setPrice] = useState("");
  const [hasDocuments, setHasDocuments] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  // What this sitting has produced, newest first. Separate from the counts
  // below so a seller sees their work land immediately, before the listings
  // query round-trips.
  const [added, setAdded] = useState([]);

  // Stock already published per park, counted from this seller's own
  // listings — every status, since a pending car is still stock they told
  // us about and hiding it would look like the entry was lost.
  const countsByPark = useMemo(() => {
    const tally = new Map();
    for (const item of myListings ?? []) {
      if (item.categoryKey !== "vehicles" || !item.carPark) continue;
      tally.set(item.carPark, (tally.get(item.carPark) ?? 0) + 1);
    }
    return tally;
  }, [myListings]);

  const totalStock = useMemo(
    () => [...countsByPark.values()].reduce((sum, n) => sum + n, 0),
    [countsByPark],
  );

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA_ITEMS,
    });
    if (!result.canceled && result.assets?.length) {
      setAssets((prev) =>
        [...prev, ...result.assets].slice(0, MAX_MEDIA_ITEMS),
      );
    }
  };

  const takePhoto = async () => {
    const allowed = await ensureCameraAccess({ t, title: t("parkStockTitle") });
    if (!allowed) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets?.length) {
      setAssets((prev) =>
        [...prev, ...result.assets].slice(0, MAX_MEDIA_ITEMS),
      );
    }
  };

  // The camera comes first here, unlike the ordinary form: someone working
  // through a row of cars is photographing them one after another, not
  // picking from a library.
  const pickMedia = () => {
    Alert.alert(t("parkStockPhotosLabel"), undefined, [
      { text: t("takePhotoOption"), onPress: takePhoto },
      { text: t("chooseFromLibraryOption"), onPress: pickFromLibrary },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  const clearVehicle = () => {
    setAssets([]);
    setBrand(null);
    setModel("");
    setYear("");
    setMileage("");
    setFuel(null);
    setTransmission(null);
    setPrice("");
    setHasDocuments(false);
  };

  const publishVehicle = async () => {
    if (!user) return;
    if (!park) {
      Alert.alert(t("parkStockTitle"), t("parkStockErrorPark"));
      return;
    }
    // The same three fields the ordinary vehicle form insists on. A car with
    // no make or year cannot be filtered or compared, and one with no price
    // is not an offer.
    if (!brand || !String(year).trim() || !price.trim()) {
      Alert.alert(t("parkStockTitle"), t("errorRequiredFields"));
      return;
    }
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      Alert.alert(t("parkStockTitle"), t("errorInvalidPrice"));
      return;
    }
    if (!assets.length) {
      Alert.alert(t("parkStockTitle"), t("parkStockErrorPhoto"));
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const media = [];
      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i];
        const extension = asset.uri.split(".").pop().split("?")[0];
        const mediaPath = `listings/${user.uid}/${Date.now()}-${i}.${extension}`;
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const storageRef = ref(storage, mediaPath);
        // storage.rules matches on contentType, and a blob built from a
        // file:// URI carries none — same guard the main form needs.
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: guessContentType(asset.uri, "image"),
        });
        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) =>
              setProgress(
                (i + snapshot.bytesTransferred / snapshot.totalBytes) /
                  assets.length,
              ),
            reject,
            resolve,
          );
        });
        media.push({
          mediaType: "image",
          mediaUrl: await getDownloadURL(storageRef),
          mediaPath,
        });
      }

      const city = cityForPark(park);
      const coords = cityCoordinates[city] ?? null;
      const title = [brand, model.trim(), year]
        .filter(Boolean)
        .join(" ")
        .trim();

      await addDoc(collection(firestore, "listings"), {
        sellerId: user.uid,
        sellerName: sellerProfile?.fullName ?? "",
        sellerMemberSince: sellerProfile?.createdAt ?? null,
        sellerVerified: Boolean(
          sellerProfile?.accountType === "company" &&
          sellerProfile?.verificationStatus === "verified",
        ),
        titleEn: title,
        titleFr: title,
        descriptionEn: "",
        descriptionFr: "",
        price: numericPrice,
        condition: "used",
        negotiable: true,
        expiresAt: getListingExpiresAtTimestamp(Date.now(), sellerProfile),
        city,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        categoryKey: "vehicles",
        // A park sells used cars outright. The rental and new-vehicle deals
        // exist on the full form; offering them here would be five extra
        // taps on every car for a case this screen is not for.
        vehicleDeal: "used",
        brand,
        model: model.trim() || null,
        year: Number(year) || null,
        mileage: Number(mileage) || null,
        fuel,
        transmission,
        bodyType: null,
        sellerKind,
        hasDocuments,
        carPark: park,
        phone: phone.trim() || null,
        media,
        mediaType: media[0]?.mediaType ?? null,
        mediaUrl: media[0]?.mediaUrl ?? null,
        mediaPath: media[0]?.mediaPath ?? null,
        isPromoted: false,
        popular: false,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // Remembered so the next sitting opens on the same park and number,
      // and so a seller working several parks accumulates the list rather
      // than overwriting it.
      await setDoc(
        doc(firestore, "sellers", user.uid),
        {
          carParks: arrayUnion(park),
          sellerKind,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        },
        { merge: true },
      ).catch(() => {});

      setAdded((prev) => [
        {
          id: `${Date.now()}`,
          title,
          price: numericPrice,
          park,
          cover: media[0]?.mediaUrl ?? null,
        },
        ...prev,
      ]);
      clearVehicle();
    } catch (error) {
      Alert.alert(t("parkStockTitle"), t("parkStockErrorUpload"));
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const parkLabel = getCarPark(park)?.name ?? null;

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
          <HeroEyebrow>{t("parkStockEyebrow")}</HeroEyebrow>
        </HeroTop>
        <HeroTitle>{t("parkStockTitle")}</HeroTitle>
        <HeroCopy>{t("parkStockIntro")}</HeroCopy>
      </Hero>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          // This screen sits inside the Sell tab, so the floating tab bar
          // (~70px plus the gesture inset) overlays the end of the form.
          // spacing.xl alone left the last control under the bar.
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---- Shared, entered once ---- */}
        <Card>
          <CardTitle>{t("parkStockSharedTitle")}</CardTitle>
          <CardCopy>{t("parkStockSharedCopy")}</CardCopy>

          <FieldLabel>{t("parkStockParkLabel")}</FieldLabel>
          <ChipWrap>
            {carParks.map((item) => {
              const active = park === item.key;
              const count = countsByPark.get(item.key) ?? 0;
              return (
                <Chip
                  key={item.key}
                  active={active}
                  onPress={() => setPark(item.key)}
                >
                  <ChipLabel active={active}>{item.name}</ChipLabel>
                  {/* Their own stock on that park, so switching between two
                      parks shows which one has been done. */}
                  {count > 0 ? (
                    <ChipCount active={active}>{count}</ChipCount>
                  ) : null}
                </Chip>
              );
            })}
          </ChipWrap>

          <FieldLabel>{t("sellFieldSellerKind")}</FieldLabel>
          <ChipWrap>
            {vehicleSellerKinds
              .filter((item) => STOCK_SELLER_KINDS.includes(item.key))
              .map((item) => {
                const active = sellerKind === item.key;
                return (
                  <Chip
                    key={item.key}
                    active={active}
                    onPress={() => setSellerKind(item.key)}
                  >
                    <ChipLabel active={active}>
                      {getVehicleSellerKindLabel(item.key, language)}
                    </ChipLabel>
                  </Chip>
                );
              })}
          </ChipWrap>

          <FieldLabel>{t("sellFieldPhone")}</FieldLabel>
          <Input
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder={t("parkStockPhonePlaceholder")}
            placeholderTextColor={colors.textMuted}
          />
        </Card>

        {/* ---- One vehicle at a time ---- */}
        <Card>
          <CardTitle>
            {parkLabel
              ? t("parkStockAddAt", { park: parkLabel })
              : t("parkStockAddTitle")}
          </CardTitle>

          <FieldLabel>{t("parkStockPhotosLabel")}</FieldLabel>
          {assets.length ? (
            <ThumbRow horizontal showsHorizontalScrollIndicator={false}>
              {assets.map((asset, index) => (
                <ThumbWrap key={asset.uri}>
                  <Thumb source={{ uri: asset.uri }} />
                  <ThumbRemove
                    hitSlop={8}
                    onPress={() =>
                      setAssets((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Ionicons name="close" size={12} color="#ffffff" />
                  </ThumbRemove>
                </ThumbWrap>
              ))}
              {assets.length < MAX_MEDIA_ITEMS ? (
                <AddThumb onPress={pickMedia}>
                  <Ionicons name="add" size={22} color={EMERALD} />
                </AddThumb>
              ) : null}
            </ThumbRow>
          ) : (
            <PhotoButton onPress={pickMedia}>
              <Ionicons name="camera-outline" size={18} color={EMERALD} />
              <PhotoButtonLabel>{t("parkStockAddPhotos")}</PhotoButtonLabel>
            </PhotoButton>
          )}

          <FieldLabel>{t("sellFieldBrand")}</FieldLabel>
          <ChipScroll horizontal showsHorizontalScrollIndicator={false}>
            {vehicleBrands.map((item) => {
              const active = brand === item;
              return (
                <Chip
                  key={item}
                  active={active}
                  onPress={() => setBrand(active ? null : item)}
                >
                  <ChipLabel active={active}>{item}</ChipLabel>
                </Chip>
              );
            })}
          </ChipScroll>

          <Row>
            <Half>
              <FieldLabel>{t("sellFieldModel")}</FieldLabel>
              <Input
                value={model}
                onChangeText={setModel}
                placeholder={t("parkStockModelPlaceholder")}
                placeholderTextColor={colors.textMuted}
              />
            </Half>
            <Half>
              <FieldLabel>{t("sellFieldYear")}</FieldLabel>
              <Input
                value={year}
                onChangeText={setYear}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="2015"
                placeholderTextColor={colors.textMuted}
              />
            </Half>
          </Row>

          <Row>
            <Half>
              <FieldLabel>{t("sellFieldMileage")}</FieldLabel>
              <Input
                value={mileage}
                onChangeText={setMileage}
                keyboardType="number-pad"
                placeholder="120000"
                placeholderTextColor={colors.textMuted}
              />
            </Half>
            <Half>
              <FieldLabel>{t("sellFieldPrice")}</FieldLabel>
              <Input
                value={price}
                onChangeText={setPrice}
                keyboardType="number-pad"
                placeholder="3500000"
                placeholderTextColor={colors.textMuted}
              />
            </Half>
          </Row>

          <FieldLabel>{t("sellFieldFuel")}</FieldLabel>
          <ChipWrap>
            {vehicleFuels.map((item) => {
              const active = fuel === item.key;
              return (
                <Chip
                  key={item.key}
                  active={active}
                  onPress={() => setFuel(active ? null : item.key)}
                >
                  <ChipLabel active={active}>
                    {getVehicleFuelLabel(item.key, language)}
                  </ChipLabel>
                </Chip>
              );
            })}
          </ChipWrap>

          <FieldLabel>{t("sellFieldTransmission")}</FieldLabel>
          <ChipWrap>
            {vehicleTransmissions.map((item) => {
              const active = transmission === item.key;
              return (
                <Chip
                  key={item.key}
                  active={active}
                  onPress={() => setTransmission(active ? null : item.key)}
                >
                  <ChipLabel active={active}>
                    {getVehicleTransmissionLabel(item.key, language)}
                  </ChipLabel>
                </Chip>
              );
            })}
          </ChipWrap>

          <CheckRow onPress={() => setHasDocuments((prev) => !prev)}>
            <CheckBox checked={hasDocuments}>
              {hasDocuments ? (
                <Ionicons name="checkmark" size={13} color="#ffffff" />
              ) : null}
            </CheckBox>
            <CheckLabel>{t("sellFieldHasDocuments")}</CheckLabel>
          </CheckRow>

          <PublishCta onPress={publishVehicle} disabled={busy}>
            <PublishLabel>
              {busy
                ? t("parkStockPublishing", {
                    percent: Math.round(progress * 100),
                  })
                : t("parkStockPublishOne")}
            </PublishLabel>
          </PublishCta>
          <Hint>{t("parkStockKeepsHint")}</Hint>
        </Card>

        {/* ---- What this sitting produced ---- */}
        {added.length ? (
          <Card>
            <CardTitle>
              {t("parkStockAddedTitle", { count: added.length })}
            </CardTitle>
            {added.map((item) => (
              <AddedRow key={item.id}>
                {item.cover ? (
                  <AddedThumb source={{ uri: item.cover }} />
                ) : (
                  <AddedThumbEmpty />
                )}
                <AddedCol>
                  <AddedTitle numberOfLines={1}>{item.title}</AddedTitle>
                  <AddedSub>{getCarPark(item.park)?.name ?? ""}</AddedSub>
                </AddedCol>
                <PendingTag>{t("parkStockPending")}</PendingTag>
              </AddedRow>
            ))}
            <SeeAll
              onPress={() =>
                navigation.navigate("MyListings", { filter: "all" })
              }
            >
              <SeeAllLabel>{t("parkStockSeeAll")}</SeeAllLabel>
              <Ionicons name="chevron-forward" size={14} color={EMERALD} />
            </SeeAll>
          </Card>
        ) : null}

        {totalStock > 0 ? (
          <TotalRow>
            <TotalText>{t("parkStockTotal", { count: totalStock })}</TotalText>
          </TotalRow>
        ) : null}

        <Note>
          <Ionicons name="information-circle-outline" size={14} color={GOLD} />
          <NoteText>{t("parkStockNote")}</NoteText>
        </Note>
      </ScrollView>
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
  line-height: 29px;
  color: #ffffff;
  margin-bottom: 6px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.72);
  max-width: 310px;
`;

const Card = styled.View`
  padding: 16px;
  border-radius: 20px;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const CardTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const CardCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  margin-top: 4px;
  color: ${(props) => props.theme.textMuted};
`;

const FieldLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-top: 15px;
  margin-bottom: 8px;
  color: ${(props) => props.theme.textMuted};
`;

const ChipWrap = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 7px;
`;

const ChipScroll = styled.ScrollView`
  flex-grow: 0;
`;

const Chip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-right: 7px;
  padding: 9px 14px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.active ? EMERALD : props.theme.background)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? EMERALD : props.theme.border)};
`;

const ChipLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.text)};
`;

const ChipCount = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => (props.active ? "rgba(255,255,255,0.85)" : EMERALD)};
`;

const Row = styled.View`
  flex-direction: row;
  gap: 10px;
`;

const Half = styled.View`
  flex: 1;
`;

const Input = styled.TextInput`
  padding: 12px 14px;
  border-radius: 14px;
  font-family: ${fontFamily.regular};
  font-size: 14px;
  min-height: 48px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.background};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const PhotoButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-vertical: 16px;
  border-radius: 16px;
  border-width: 1px;
  border-style: dashed;
  border-color: rgba(11, 110, 79, 0.4);
  background-color: rgba(11, 110, 79, 0.05);
`;

const PhotoButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${EMERALD};
`;

const ThumbRow = styled.ScrollView`
  flex-grow: 0;
`;

const ThumbWrap = styled.View`
  margin-right: 8px;
`;

const Thumb = styled(Image)`
  width: 72px;
  height: 72px;
  border-radius: 14px;
`;

const ThumbRemove = styled(Pressable)`
  position: absolute;
  top: -5px;
  right: -5px;
  width: 21px;
  height: 21px;
  border-radius: 11px;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.65);
`;

const AddThumb = styled(Pressable)`
  width: 72px;
  height: 72px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  border-width: 1px;
  border-style: dashed;
  border-color: rgba(11, 110, 79, 0.4);
`;

const CheckRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
`;

const CheckBox = styled.View`
  width: 21px;
  height: 21px;
  border-radius: 7px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.checked ? EMERALD : "transparent")};
  border-width: 1px;
  border-color: ${(props) => (props.checked ? EMERALD : props.theme.border)};
`;

const CheckLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const PublishCta = styled(Pressable)`
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  padding-vertical: 15px;
  border-radius: 16px;
  opacity: ${(props) => (props.disabled ? 0.6 : 1)};
  background-color: ${EMERALD};
`;

const PublishLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14.5px;
  color: #ffffff;
`;

const Hint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  text-align: center;
  margin-top: 9px;
  color: ${(props) => props.theme.textMuted};
`;

const AddedRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 11px;
  margin-top: 13px;
`;

const AddedThumb = styled(Image)`
  width: 44px;
  height: 44px;
  border-radius: 12px;
`;

const AddedThumbEmpty = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background-color: rgba(11, 110, 79, 0.1);
`;

const AddedCol = styled.View`
  flex: 1;
`;

const AddedTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const AddedSub = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const PendingTag = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  color: #6b5a2e;
  background-color: rgba(217, 164, 65, 0.16);
  overflow: hidden;
`;

const SeeAll = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 16px;
  padding-top: 14px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const SeeAllLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${EMERALD};
`;

const TotalRow = styled(View)`
  align-items: center;
  margin-bottom: ${spacing.md}px;
`;

const TotalText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Note = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  border-radius: 18px;
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
