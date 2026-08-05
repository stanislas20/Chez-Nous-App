import { useState } from 'react';
import { Alert, FlatList, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { storage, firestore } from '../config/firebase';
import { categories } from '../data/categories';
import { cities } from '../data/cities';
import { cityCoordinates } from '../data/cityCoordinates';

const MAX_MEDIA_ITEMS = 6;
const ADD_SLIDE = { isAddSlide: true };

function VideoPreview({ uri }) {
  const { colors } = useTheme();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <PreviewVideo player={player} contentFit="contain" nativeControls={false} />;
}

export function CreateListingScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { categoryKey: initialCategoryKey, isPromoted } = route.params ?? {};
  const { t, language } = useI18n();
  const { user, sellerProfile } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const pagerWidth = windowWidth - spacing.md * 2;

  const presetCategory = categories.find((category) => category.key === initialCategoryKey) ?? null;

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [phone, setPhone] = useState('');
  const [dutyHours, setDutyHours] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategoryKey ?? null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [assets, setAssets] = useState([]);
  const [activeMediaPage, setActiveMediaPage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const isPharmacy = selectedCategory === 'pharmacyOnDuty';

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('sellFormTitle'), t('errorGeneric'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA_ITEMS,
    });
    if (!result.canceled && result.assets?.length) {
      setAssets((prev) => [...prev, ...result.assets].slice(0, MAX_MEDIA_ITEMS));
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('sellFormTitle'), t('errorGeneric'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets?.length) {
      setAssets((prev) => [...prev, ...result.assets].slice(0, MAX_MEDIA_ITEMS));
    }
  };

  const pickMedia = () => {
    Alert.alert(t('sellFieldMediaLabel'), undefined, [
      { text: t('takePhotoOption'), onPress: takePhoto },
      { text: t('chooseFromLibraryOption'), onPress: pickFromLibrary },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const removeAsset = (index) => {
    setAssets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !selectedCategory || !selectedCity) {
      Alert.alert(t('sellFormTitle'), t('errorRequiredFields'));
      return;
    }
    if (!assets.length) {
      Alert.alert(t('sellFormTitle'), t('errorMediaRequired'));
      return;
    }

    let numericPrice = 0;
    let numericDutyHours = 0;
    if (isPharmacy) {
      if (!phone.trim()) {
        Alert.alert(t('sellFormTitle'), t('errorPhoneRequired'));
        return;
      }
      numericDutyHours = Number(dutyHours);
      if (!dutyHours.trim() || Number.isNaN(numericDutyHours) || numericDutyHours <= 0) {
        Alert.alert(t('sellFormTitle'), t('errorInvalidDutyHours'));
        return;
      }
    } else {
      numericPrice = Number(price);
      if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
        Alert.alert(t('sellFormTitle'), t('errorInvalidPrice'));
        return;
      }
    }

    setIsSubmitting(true);
    setProgress(0);
    try {
      const media = [];
      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i];
        const mediaType = asset.type === 'video' ? 'video' : 'image';
        const extension = asset.uri.split('.').pop().split('?')[0];
        const fileName = `${Date.now()}-${i}.${extension}`;
        const mediaPath = `listings/${user.uid}/${fileName}`;

        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const storageRef = ref(storage, mediaPath);
        const uploadTask = uploadBytesResumable(storageRef, blob);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) =>
              setProgress((i + snapshot.bytesTransferred / snapshot.totalBytes) / assets.length),
            reject,
            resolve,
          );
        });

        const mediaUrl = await getDownloadURL(storageRef);
        media.push({ mediaType, mediaUrl, mediaPath });
      }

      const cover = media[0];
      const coords = cityCoordinates[selectedCity] ?? null;

      await addDoc(collection(firestore, 'listings'), {
        sellerId: user.uid,
        sellerName: sellerProfile?.fullName ?? '',
        titleEn: title.trim(),
        titleFr: title.trim(),
        descriptionEn: description.trim(),
        descriptionFr: description.trim(),
        price: numericPrice,
        ...(isPharmacy
          ? {
              phone: phone.trim(),
              dutyUntil: Timestamp.fromMillis(Date.now() + numericDutyHours * 60 * 60 * 1000),
            }
          : null),
        city: selectedCity,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        categoryKey: selectedCategory,
        media,
        mediaType: cover.mediaType,
        mediaUrl: cover.mediaUrl,
        mediaPath: cover.mediaPath,
        isPromoted: !!isPromoted,
        popular: false,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      Alert.alert(t('sellSubmitSuccessTitle'), t('sellSubmitSuccessMessage'), [
        { text: t('continue'), onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert(t('sellFormTitle'), t('errorUploadFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container edges={['left', 'right']}>
      <Content>
        <SectionTitle>{t('sellFormTitle')}</SectionTitle>

        {isPromoted ? (
          <PromotedBanner>
            <Ionicons name="megaphone-outline" size={16} color={colors.accentDark} />
            <PromotedBannerLabel>{t('promotedFormBanner')}</PromotedBannerLabel>
          </PromotedBanner>
        ) : null}

        <Label>{t('sellFieldMediaLabel')}</Label>
        {assets.length === 0 ? (
          <MediaPicker onPress={pickMedia} style={{ width: pagerWidth }}>
            <MediaPickerPlaceholder>
              <Ionicons name="cloud-upload-outline" size={28} color={colors.primary} />
              <MediaPickerLabel>{t('sellPickMediaButton')}</MediaPickerLabel>
            </MediaPickerPlaceholder>
          </MediaPicker>
        ) : (
          <>
            <MediaPagerBox style={{ width: pagerWidth }}>
              <FlatList
                data={assets.length < MAX_MEDIA_ITEMS ? [...assets, ADD_SLIDE] : assets}
                keyExtractor={(item, index) => (item.isAddSlide ? 'add-slide' : `${item.uri}-${index}`)}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) =>
                  setActiveMediaPage(Math.round(event.nativeEvent.contentOffset.x / pagerWidth))
                }
                renderItem={({ item, index }) =>
                  item.isAddSlide ? (
                    <AddSlide style={{ width: pagerWidth }} onPress={pickMedia}>
                      <Ionicons name="add" size={32} color={colors.primary} />
                      <MediaPickerLabel>{t('sellPickMediaButton')}</MediaPickerLabel>
                    </AddSlide>
                  ) : (
                    <MediaSlide style={{ width: pagerWidth }}>
                      {item.type === 'video' ? (
                        <VideoPreview uri={item.uri} />
                      ) : (
                        <PreviewImage source={{ uri: item.uri }} resizeMode="contain" />
                      )}
                      <RemoveSlideButton onPress={() => removeAsset(index)} hitSlop={8}>
                        <Ionicons name="close" size={14} color={colors.textInverse} />
                      </RemoveSlideButton>
                    </MediaSlide>
                  )
                }
              />
            </MediaPagerBox>
            <MediaDots>
              {(assets.length < MAX_MEDIA_ITEMS ? [...assets, ADD_SLIDE] : assets).map((_, index) => (
                <MediaDot key={index} active={index === activeMediaPage} />
              ))}
            </MediaDots>
          </>
        )}

        <Label>{t('sellFieldTitle')}</Label>
        <InputRow>
          <Ionicons name="pricetag-outline" size={20} color={colors.textMuted} />
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder={t('sellFieldTitlePlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
        </InputRow>

        {isPharmacy ? (
          <>
            <Label>{t('sellFieldPhone')}</Label>
            <InputRow>
              <Ionicons name="call-outline" size={20} color={colors.textMuted} />
              <Input
                value={phone}
                onChangeText={setPhone}
                placeholder={t('sellFieldPhonePlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
            </InputRow>

            <Label>{t('sellFieldDutyHours')}</Label>
            <InputRow>
              <Ionicons name="time-outline" size={20} color={colors.textMuted} />
              <Input
                value={dutyHours}
                onChangeText={setDutyHours}
                placeholder={t('sellFieldDutyHoursPlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </InputRow>
          </>
        ) : (
          <>
            <Label>{t('sellFieldPrice')}</Label>
            <InputRow>
              <Ionicons name="cash-outline" size={20} color={colors.textMuted} />
              <Input
                value={price}
                onChangeText={setPrice}
                placeholder={t('sellFieldPricePlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </InputRow>
          </>
        )}

        <Label>{t('sellFieldCategory')}</Label>
        {presetCategory ? (
          <PresetCategoryPill>
            <Ionicons name={presetCategory.icon} size={16} color={colors.primaryDark} />
            <PresetCategoryLabel>
              {t('postingInCategoryLabel', {
                category: language === 'en' ? presetCategory.labelEn : presetCategory.labelFr,
              })}
            </PresetCategoryLabel>
          </PresetCategoryPill>
        ) : (
          <ChipRow horizontal showsHorizontalScrollIndicator={false}>
            {categories.map((category) => (
              <Chip
                key={category.key}
                selected={selectedCategory === category.key}
                onPress={() => setSelectedCategory(category.key)}
              >
                <ChipLabel selected={selectedCategory === category.key}>
                  {language === 'en' ? category.labelEn : category.labelFr}
                </ChipLabel>
              </Chip>
            ))}
          </ChipRow>
        )}

        <Label>{t('sellFieldLocation')}</Label>
        <ChipRow horizontal showsHorizontalScrollIndicator={false}>
          {cities.map((city) => (
            <Chip key={city} selected={selectedCity === city} onPress={() => setSelectedCity(city)}>
              <ChipLabel selected={selectedCity === city}>{city}</ChipLabel>
            </Chip>
          ))}
        </ChipRow>

        <Label>{t('sellFieldDescription')}</Label>
        <TextAreaRow>
          <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
          <TextArea
            value={description}
            onChangeText={setDescription}
            placeholder={t('sellFieldDescriptionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
          />
        </TextAreaRow>

        <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
          <SubmitLabel>
            {isSubmitting ? `${t('adUploadingLabel')} ${Math.round(progress * 100)}%` : t('sellSubmitButton')}
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
}))``;

const SectionTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.md}px;
`;

const PromotedBanner = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  background-color: ${(props) => props.theme.accentLight};
  border-radius: ${radius.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const PromotedBannerLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.accentDark};
`;

const Label = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.xs}px;
`;

const InputRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  ${shadow.card}
`;

const Input = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const TextAreaRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  padding-top: ${spacing.md}px;
  ${shadow.card}
`;

const TextArea = styled.TextInput`
  flex: 1;
  height: 100px;
  text-align-vertical: top;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const ChipRow = styled.ScrollView`
  flex-direction: row;
`;

const Chip = styled(Pressable)`
  background-color: ${(props) => (props.selected ? props.theme.primary : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? props.theme.primary : props.theme.border)};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.xs}px;
  margin-right: ${spacing.sm}px;
  ${shadow.card}
`;

const ChipLabel = styled.Text`
  ${(props) => (props.selected ? type.captionMedium : type.caption)}
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.text)};
`;

const PresetCategoryPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  align-self: flex-start;
  background-color: ${(props) => props.theme.primaryLight};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
`;

const PresetCategoryLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primaryDark};
`;

const MediaPicker = styled(Pressable)`
  width: 100%;
  height: 360px;
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
`;

const PreviewVideo = styled(VideoView)`
  width: 100%;
  height: 100%;
`;

const MediaPagerBox = styled.View`
  height: 360px;
  border-radius: ${radius.md}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const MediaSlide = styled.View`
  height: 360px;
`;

const AddSlide = styled(Pressable)`
  height: 360px;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
`;

const RemoveSlideButton = styled(Pressable)`
  position: absolute;
  top: ${spacing.sm}px;
  right: ${spacing.sm}px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background-color: rgba(0, 0, 0, 0.55);
  align-items: center;
  justify-content: center;
`;

const MediaDots = styled.View`
  flex-direction: row;
  justify-content: center;
  gap: 6px;
  margin-top: ${spacing.sm}px;
`;

const MediaDot = styled.View`
  width: ${(props) => (props.active ? '18px' : '6px')};
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => (props.active ? props.theme.primary : props.theme.border)};
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
