import { useState } from "react";
import { Alert, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { firestore, storage } from "../config/firebase";
import { companySectors, getCompanySectorLabel } from "../data/companySectors";
import { restaurantLinkKinds } from "../data/restaurantLinks";
import { cities } from "../data/cities";

// Everything a company can correct after signup. Before this screen existed
// the only editable field in the whole profile was the logo — a business
// that moved premises or changed its number had no way to say so, and the
// links had nowhere to live at all.
//
// companyName / RCCM / IFU are deliberately absent: firestore.rules freezes
// them once verified, so that a company cannot clear review and then become
// a different business. They are shown read-only with that reason stated,
// rather than offered as fields that would silently fail to save.
export function CompanyProfileEditScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const { user, sellerProfile } = useAuth();

  const [sectorKey, setSectorKey] = useState(sellerProfile?.sector ?? null);
  const [city, setCity] = useState(sellerProfile?.companyCity ?? null);
  const [phone, setPhone] = useState(sellerProfile?.phone ?? "");
  const [links, setLinks] = useState(() =>
    Object.fromEntries(
      restaurantLinkKinds.map((k) => [k.key, sellerProfile?.[k.key] ?? ""]),
    ),
  );
  const [photoUrl, setPhotoUrl] = useState(sellerProfile?.photoUrl ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [sectorOpen, setSectorOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const isVerified = sellerProfile?.verificationStatus === "verified";

  const pickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        // No forced crop: a wide logo squared off at pick time loses its
        // sides permanently. Kept whole and fitted with `contain` on display.
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const storageRef = ref(
        storage,
        `sellers/${user.uid}/logo-${Date.now()}.jpg`,
      );
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, blob, {
          contentType: "image/jpeg",
        });
        task.on("state_changed", null, reject, resolve);
      });
      setPhotoUrl(await getDownloadURL(storageRef));
    } catch {
      Alert.alert(t("companyEditTitle"), t("errorUploadFailed"));
    }
  };

  const save = async () => {
    setIsSaving(true);
    try {
      // merge, so this can never clear a field this screen doesn't manage —
      // the verification documents and the representative's details are not
      // editable here and must survive untouched.
      await setDoc(
        doc(firestore, "sellers", user.uid),
        {
          sector: sectorKey,
          companyCity: city,
          phone: phone.trim(),
          photoUrl,
          ...Object.fromEntries(
            restaurantLinkKinds.map((k) => [
              k.key,
              links[k.key]?.trim() || null,
            ]),
          ),
        },
        { merge: true },
      );
      navigation.goBack();
    } catch {
      Alert.alert(t("companyEditTitle"), t("errorPermissionDenied"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container edges={["top", "left", "right", "bottom"]}>
      <Header>
        <BackButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </BackButton>
        <HeaderTitle numberOfLines={1}>{t("companyEditTitle")}</HeaderTitle>
      </Header>

      <Body
        showsVerticalScrollIndicator={false}
        contentContainerStyle={bodyContentStyle}
      >
        <LogoRow onPress={pickLogo}>
          {photoUrl ? (
            <LogoPreview source={{ uri: photoUrl }} resizeMode="contain" />
          ) : (
            <LogoPlaceholder>
              <Ionicons name="image-outline" size={22} color={colors.primary} />
            </LogoPlaceholder>
          )}
          <LogoTextCol>
            <RowTitle>{t("companyFieldLogo")}</RowTitle>
            <RowHint>
              {photoUrl ? t("companyLogoChange") : t("companyFieldLogoHint")}
            </RowHint>
          </LogoTextCol>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </LogoRow>

        {/* Frozen once verified, and said so rather than shown as fields
            that would fail to save. */}
        {isVerified ? (
          <LockedBox>
            <LockedHeader>
              <Ionicons
                name="lock-closed-outline"
                size={14}
                color={colors.textMuted}
              />
              <LockedTitle>{t("companyEditLockedTitle")}</LockedTitle>
            </LockedHeader>
            <LockedRow>
              <LockedKey>{t("companyFieldName")}</LockedKey>
              <LockedValue numberOfLines={1}>
                {sellerProfile?.companyName}
              </LockedValue>
            </LockedRow>
            <LockedRow>
              <LockedKey>RCCM</LockedKey>
              <LockedValue numberOfLines={1}>{sellerProfile?.rccm}</LockedValue>
            </LockedRow>
            <LockedRow>
              <LockedKey>IFU</LockedKey>
              <LockedValue numberOfLines={1}>{sellerProfile?.ifu}</LockedValue>
            </LockedRow>
            <LockedHint>{t("companyEditLockedHint")}</LockedHint>
          </LockedBox>
        ) : null}

        <Label>{t("companyFieldSector")}</Label>
        <Selector onPress={() => setSectorOpen((v) => !v)}>
          <SelectorText>
            {sectorKey
              ? getCompanySectorLabel(sectorKey, language)
              : t("companyFieldSectorPlaceholder")}
          </SelectorText>
          <Ionicons
            name={sectorOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textMuted}
          />
        </Selector>
        {sectorOpen ? (
          <OptionBox>
            {companySectors.map((s) => (
              <OptionRow
                key={s.key}
                onPress={() => {
                  setSectorKey(s.key);
                  setSectorOpen(false);
                }}
              >
                <OptionLabel selected={sectorKey === s.key}>
                  {getCompanySectorLabel(s.key, language)}
                </OptionLabel>
                {sectorKey === s.key ? (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                ) : null}
              </OptionRow>
            ))}
          </OptionBox>
        ) : null}

        <Label>{t("companyFieldCity")}</Label>
        <Selector onPress={() => setCityOpen((v) => !v)}>
          <SelectorText>
            {city ?? t("companyFieldCityPlaceholder")}
          </SelectorText>
          <Ionicons
            name={cityOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textMuted}
          />
        </Selector>
        {cityOpen ? (
          <OptionBox>
            {cities.map((c) => (
              <OptionRow
                key={c}
                onPress={() => {
                  setCity(c);
                  setCityOpen(false);
                }}
              >
                <OptionLabel selected={city === c}>{c}</OptionLabel>
                {city === c ? (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                ) : null}
              </OptionRow>
            ))}
          </OptionBox>
        ) : null}

        <Label>{t("sellFieldPhone")}</Label>
        <InputRow>
          <Ionicons name="call-outline" size={19} color={colors.textMuted} />
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder="+229 01 23 45 67 89"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
          />
        </InputRow>
        <FieldNote>{t("companyEditPhoneHint")}</FieldNote>

        <Label>{t("sellFieldLinks")}</Label>
        <FieldNote>{t("sellLinksHint")}</FieldNote>
        {restaurantLinkKinds.map((kind) => (
          <LinkRow key={kind.key}>
            <LinkIconWrap tint={`${kind.color}22`}>
              <Ionicons name={kind.icon} size={18} color={kind.color} />
            </LinkIconWrap>
            <LinkCol>
              <LinkLabel>
                {language === "en" ? kind.labelEn : kind.labelFr}
              </LinkLabel>
              <Input
                value={links[kind.key] ?? ""}
                onChangeText={(value) =>
                  setLinks((prev) => ({ ...prev, [kind.key]: value }))
                }
                placeholder={kind.placeholder}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </LinkCol>
          </LinkRow>
        ))}
      </Body>

      <Dock>
        <SaveButton onPress={save} disabled={isSaving}>
          <SaveLabel>{isSaving ? t("savingLabel") : t("saveButton")}</SaveLabel>
        </SaveButton>
      </Dock>
    </Container>
  );
}

const bodyContentStyle = { padding: spacing.md, paddingBottom: spacing.xl };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surface};
`;

const HeaderTitle = styled.Text`
  flex: 1;
  ${type.h3}
  color: ${(props) => props.theme.text};
`;

const Body = styled.ScrollView`
  flex: 1;
`;

const Label = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
  margin: ${spacing.md}px 0 ${spacing.xs}px;
`;

const FieldNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.xs}px;
`;

const Selector = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  height: 52px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
`;

const SelectorText = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const OptionBox = styled.View`
  margin-top: ${spacing.xs}px;
  border-radius: ${radius.lg}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const OptionRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 13px 14px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const OptionLabel = styled.Text`
  font-family: ${(props) => (props.selected ? fontFamily.semiBold : fontFamily.regular)};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const InputRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 0 14px;
  height: 52px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
`;

const Input = styled.TextInput`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const LogoRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 12px 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-style: dashed;
  border-color: ${(props) => props.theme.border};
`;

const LogoPreview = styled.Image`
  width: 56px;
  height: 56px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const LogoPlaceholder = styled.View`
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.primaryLight};
`;

const LogoTextCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const RowTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const RowHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const LockedBox = styled.View`
  margin-top: ${spacing.md}px;
  padding: 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const LockedHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-bottom: ${spacing.sm}px;
`;

const LockedTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const LockedRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  gap: ${spacing.sm}px;
  margin-bottom: 5px;
`;

const LockedKey = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;

const LockedValue = styled.Text`
  flex: 1;
  text-align: right;
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const LockedHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
`;

const LinkRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 8px 12px;
  min-height: 62px;
  margin-bottom: ${spacing.xs}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1.5px;
  border-color: ${(props) => props.theme.border};
`;

const LinkIconWrap = styled.View`
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.tint};
`;

const LinkCol = styled.View`
  flex: 1;
  min-width: 0;
`;

const LinkLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

const Dock = styled.View`
  padding: ${spacing.sm}px ${spacing.md}px 0;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const SaveButton = styled(Pressable)`
  align-items: center;
  padding: 16px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.primary};
  opacity: ${(props) => (props.disabled ? 0.6 : 1)};
`;

const SaveLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.textInverse};
`;
