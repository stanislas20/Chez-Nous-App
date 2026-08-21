import { useState } from "react";
import { Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import styled from "styled-components/native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { storage, firestore } from "../config/firebase";
import { guessContentType } from "../utils/uploadContentType";
import { normalizeUrl, isValidUrl } from "../utils/links";
import { businessCategories } from "../data/businessCategories";

function VideoPreview({ uri }) {
  const { colors } = useTheme();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <PreviewVideo player={player} contentFit="cover" nativeControls={false} />;
}

export function AdSubmitScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user, advertiserProfile } = useAuth();
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [asset, setAsset] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setAsset(result.assets[0]);
    }
  };

  const resetForm = () => {
    setTitle("");
    setLinkUrl("");
    setAsset(null);
    setSelectedCategory(null);
    setProgress(0);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !asset) {
      Alert.alert(t("adSubmitFormTitle"), t("errorMediaRequired"));
      return;
    }
    if (!isValidUrl(linkUrl)) {
      Alert.alert(t("adSubmitFormTitle"), t("errorInvalidLink"));
      return;
    }
    if (!selectedCategory) {
      Alert.alert(t("adSubmitFormTitle"), t("errorCategoryRequired"));
      return;
    }

    setIsSubmitting(true);
    setProgress(0);
    try {
      const mediaType = asset.type === "video" ? "video" : "image";
      const extension = asset.uri.split(".").pop().split("?")[0];
      const fileName = `${Date.now()}.${extension}`;
      const mediaPath = `ads/${user.uid}/${fileName}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, mediaPath);
      // storage.rules gates on contentType; an RN blob has none.
      const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType: guessContentType(asset.uri, asset.type === "video" ? "video" : "image"),
      });

      await new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => setProgress(snapshot.bytesTransferred / snapshot.totalBytes),
          reject,
          resolve,
        );
      });

      const mediaUrl = await getDownloadURL(storageRef);

      await addDoc(collection(firestore, "ads"), {
        advertiserId: user.uid,
        sponsorName: advertiserProfile.businessName,
        titleEn: title.trim(),
        titleFr: title.trim(),
        mediaType,
        mediaUrl,
        mediaPath,
        linkUrl: normalizeUrl(linkUrl),
        category: selectedCategory,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      Alert.alert(t("adSubmitSuccessTitle"), t("adSubmitSuccessMessage"));
      resetForm();
    } catch (error) {
      Alert.alert(t("adSubmitFormTitle"), t("errorUploadFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container edges={["left", "right"]}>
      <Content>
        <AdvertiserBanner>
          <AdvertiserBannerLabel>{t("advertisingAs")}</AdvertiserBannerLabel>
          <AdvertiserBannerName>{advertiserProfile?.businessName}</AdvertiserBannerName>
        </AdvertiserBanner>

        <SectionTitle>{t("adSubmitFormTitle")}</SectionTitle>

        <Label>{t("adFieldMediaLabel")}</Label>
        <MediaPicker onPress={pickMedia}>
          {asset ? (
            asset.type === "video" ? (
              <VideoPreview uri={asset.uri} />
            ) : (
              <PreviewImage source={{ uri: asset.uri }} resizeMode="contain" />
            )
          ) : (
            <MediaPickerPlaceholder>
              <Ionicons name="cloud-upload-outline" size={28} color={colors.primary} />
              <MediaPickerLabel>{t("adPickImageButton")}</MediaPickerLabel>
            </MediaPickerPlaceholder>
          )}
        </MediaPicker>

        <Label>{t("adFieldTitle")}</Label>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder={t("adFieldTitlePlaceholder")}
          placeholderTextColor={colors.textMuted}
        />

        <Label>{t("adFieldLink")}</Label>
        <Input
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder={t("adFieldLinkPlaceholder")}
          placeholderTextColor={colors.textMuted}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label>{t("adFieldCategory")}</Label>
        <CategoryChipRow horizontal showsHorizontalScrollIndicator={false}>
          {businessCategories.map((category) => {
            const isSelected = selectedCategory === category.key;
            return (
              <CategoryChip
                key={category.key}
                selected={isSelected}
                onPress={() => setSelectedCategory(category.key)}
              >
                <Ionicons
                  name={category.icon}
                  size={15}
                  color={isSelected ? colors.textInverse : colors.text}
                />
                <CategoryChipLabel selected={isSelected}>
                  {language === "en" ? category.labelEn : category.labelFr}
                </CategoryChipLabel>
              </CategoryChip>
            );
          })}
        </CategoryChipRow>

        <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
          <SubmitLabel>
            {isSubmitting
              ? `${t("adUploadingLabel")} ${Math.round(progress * 100)}%`
              : t("adSubmitButton")}
          </SubmitLabel>
        </SubmitButton>
      </Content>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Content = styled.ScrollView.attrs(() => ({
  contentContainerStyle: { padding: spacing.md },
  showsVerticalScrollIndicator: false,
}))``;

const AdvertiserBanner = styled.View`
  flex-direction: row;
  align-items: baseline;
  background-color: ${(props) => props.theme.primaryLight};
  border-radius: ${radius.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
  gap: ${spacing.xs}px;
`;

const AdvertiserBannerLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.primaryDark};
`;

const AdvertiserBannerName = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primaryDark};
`;

const SectionTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.md}px;
`;

const Label = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.xs}px;
`;

const Input = styled.TextInput`
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  ${type.body}
  color: ${(props) => props.theme.text};
`;

const MediaPicker = styled(Pressable)`
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: ${radius.md}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const MediaPickerPlaceholder = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
`;

const MediaPickerLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
`;

const PreviewImage = styled.Image`
  width: 100%;
  height: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const PreviewVideo = styled(VideoView)`
  width: 100%;
  height: 100%;
`;

const CategoryChipRow = styled.ScrollView`
  flex-direction: row;
`;

const CategoryChip = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  background-color: ${(props) => (props.selected ? props.theme.primary : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? props.theme.primary : props.theme.border)};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  margin-right: ${spacing.sm}px;
`;

const CategoryChipLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.text)};
`;

const SubmitButton = styled(Pressable)`
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  margin-top: ${spacing.xl}px;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;
